"""
app.py — FastAPI REST application for Axalon Solar Inspection Platform.

Endpoints:
    POST /inspect          Single thermal+RGB pair inspection
    POST /batch            Batch folder inspection (background job)
    GET  /status/{job_id}  Job progress
    GET  /report/{job_id}  Download PDF/Excel/JSON/GeoJSON report
    GET  /park/{park_id}   Park inspection history summary
    GET  /parks            List all parks
    GET  /health           Health check

Run with:
    uvicorn axalon.api.app:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import json
import logging
import mimetypes
import os
import re
import shutil
import stat
import tempfile
import uuid
import zipfile
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import FastAPI, File, Form, UploadFile, BackgroundTasks, HTTPException, Security
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from axalon.pipeline.orchestrator import InspectionOrchestrator
from axalon.reporting.report import (
    generate_excel_report,
    generate_json_report,
    generate_pdf_report,
)
from axalon.reporting.geojson_writer import write_geojson
from axalon.db.session import get_session
from axalon.db.models import Park, Inspection, PanelFault, Detection as DbDetection, FAULT_OPEN, FAULT_STALE, FAULT_RESOLVED, Correction, Job as DbJob, FaultComment, Mission
from axalon.db.models import (
    ComponentAssignment,
    ComponentOrder,
    InventoryComponent,
    Prototype,
    Project,
    TrackFile,
    TrackNote,
    COMPONENT_CATEGORIES,
    NOTE_KINDS,
    ORDER_STATUSES,
    PROJECT_STATUSES,
    PROTOTYPE_STATUSES,
)
from axalon.park.diff import build_diff
from axalon.core.object_store import get_track_store
from axalon.api.agents_router import router as agents_router
from axalon.core.app_config import (
    set_track_password,
    verify_track_password,
    OK as APP_CONFIG_OK,
    WRONG as APP_CONFIG_WRONG,
    UNCONFIGURED as APP_CONFIG_UNCONFIGURED,
)

logger = logging.getLogger("axalon.api")

# ── Constants ─────────────────────────────────────────────────────────────────

# Maximum sizes
_MAX_IMAGE_BYTES = 50 * 1024 * 1024   # 50 MB per image
_MAX_ZIP_BYTES   = 2 * 1024 * 1024 * 1024  # 2 GB per zip (compressed)
_MAX_ZIP_UNCOMPRESSED_BYTES = 8 * 1024 * 1024 * 1024  # 8 GB cap on extracted size — blocks zip-bombs
_MAX_ZIP_RATIO   = 200                 # max compressed→uncompressed ratio per member
_MAX_ZIP_MEMBERS = 10_000              # max files inside a zip
_MAX_PARK_ID_LEN = 64

# Allowed image extensions
_ALLOWED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".tiff", ".tif"}

# Safe job-ID pattern — prevents directory traversal via job_id path param
_JOB_ID_RE = re.compile(r"^[a-zA-Z0-9_\-]{1,80}$")

_bearer = HTTPBearer(auto_error=False)


def require_auth(creds: HTTPAuthorizationCredentials | None = Security(_bearer)) -> None:
    """No-op when AXALON_API_KEY is unset; otherwise require Bearer auth."""
    api_key = os.environ.get("AXALON_API_KEY", "").strip()
    if not api_key:
        return
    if creds is None or creds.credentials != api_key:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


def _run_alembic_migrations() -> None:
    """Run Alembic migrations for persistent DBs; tests still use create_all()."""
    db_url = os.environ.get("AXALON_DB_URL", "sqlite:///axalon.db")
    if ":memory:" in db_url or os.environ.get("PYTEST_CURRENT_TEST"):
        return
    try:
        from alembic.config import Config as AlembicConfig
        from alembic import command as alembic_cmd

        repo_root = Path(__file__).resolve().parents[2]
        cfg = AlembicConfig(str(repo_root / "alembic.ini"))
        cfg.set_main_option("script_location", str(repo_root / "alembic"))
        cfg.set_main_option("sqlalchemy.url", db_url)
        alembic_cmd.upgrade(cfg, "head")
        logger.info("Alembic migrations: up to date")
    except Exception as exc:
        logger.warning("Alembic migration warning: %s", exc)


def _cleanup_old_results() -> None:
    ttl_hours = int(os.environ.get("AXALON_RESULTS_TTL_HOURS", "0"))
    if ttl_hours <= 0:
        return
    cutoff = datetime.utcnow() - timedelta(hours=ttl_hours)
    session = get_session()
    try:
        old_jobs = session.query(DbJob).filter(
            DbJob.created_at < cutoff,
            DbJob.state.in_(["succeeded", "failed"]),
        ).all()
        for job in old_jobs:
            job_dir = OUTPUT_DIR / job.id
            if job_dir.exists():
                shutil.rmtree(job_dir, ignore_errors=True)
        if old_jobs:
            logger.info("Cleaned up output for %s old job(s)", len(old_jobs))
    finally:
        session.close()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    _run_alembic_migrations()
    session = get_session()
    try:
        stale = session.query(DbJob).filter(DbJob.state == "running").all()
        for job in stale:
            job.state = "queued"
            job.message = "Re-queued after API restart"
        session.commit()
        if stale:
            logger.info("Re-queued %s interrupted job(s)", len(stale))
    finally:
        session.close()
    _cleanup_old_results()
    yield


app = FastAPI(
    title="Axalon Solar Inspection API",
    version="1.0.0",
    lifespan=lifespan,
    description=(
        "Solar anomaly detection and panel localization for drone-captured "
        "thermal IR + RGB imagery. Powered by YOLO11m (best.pt)."
    ),
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# Restrict to known local/operator origins by default. Add deployed dashboard
# origins with AXALON_CORS_ORIGINS as a comma-separated list.
_DEFAULT_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:8501",
    "http://127.0.0.1:8501",
    "https://axalonsystems.com",
    "https://www.axalonsystems.com",
]
_CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("AXALON_CORS_ORIGINS", "").split(",")
    if origin.strip()
] or _DEFAULT_CORS_ORIGINS

app.include_router(agents_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


@app.middleware("http")
async def auth_middleware(request, call_next):
    if request.url.path == "/health" or request.method == "OPTIONS":
        return await call_next(request)
    api_key = os.environ.get("AXALON_API_KEY", "").strip()
    supplied_key = request.query_params.get("api_key")
    if api_key and request.headers.get("authorization") != f"Bearer {api_key}" and supplied_key != api_key:
        return JSONResponse({"detail": "Invalid or missing API key"}, status_code=401)
    return await call_next(request)

# ── Shared state ──────────────────────────────────────────────────────────────
OUTPUT_DIR = Path(os.getenv("AXALON_OUTPUT_DIR", "output"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

ORTHO_DIR = OUTPUT_DIR / "ortho"
ORTHO_DIR.mkdir(parents=True, exist_ok=True)

# Geotiffs can be big — cap to 4 GB
_MAX_ORTHO_BYTES = 4 * 1024 * 1024 * 1024
_ORTHO_NAME_RE = re.compile(r"^[a-zA-Z0-9_\-]{1,80}\.(tif|tiff)$", re.IGNORECASE)

# NOTE: /results static mount removed — reports served via /report/{job_id}
# endpoint only, so clients cannot enumerate arbitrary output files.

_detector: InspectionOrchestrator | None = None


def get_orchestrator() -> InspectionOrchestrator:
    global _detector
    if _detector is None:
        _detector = InspectionOrchestrator(output_dir=OUTPUT_DIR)
    return _detector


# ── Input helpers ─────────────────────────────────────────────────────────────

def _safe_filename(raw: str | None, fallback: str = "upload") -> str:
    """Strip to basename only — prevents path traversal via uploaded filenames."""
    if not raw:
        return fallback
    name = Path(raw).name  # discards any directory components
    # Remove any remaining path separators or null bytes
    name = re.sub(r"[/\\:\x00]", "_", name)
    return name or fallback


def _validate_park_id(park_id: str) -> str:
    """Validate park_id is safe to use as a directory/DB key."""
    park_id = park_id.strip()
    if not park_id or len(park_id) > _MAX_PARK_ID_LEN:
        raise HTTPException(status_code=400, detail="park_id must be 1–64 characters")
    if not re.match(r"^[a-zA-Z0-9_\-]+$", park_id):
        raise HTTPException(
            status_code=400,
            detail="park_id may only contain letters, digits, hyphens, and underscores",
        )
    return park_id


def _validate_job_id(job_id: str) -> str:
    """Validate job_id path parameter — prevents directory traversal."""
    if not _JOB_ID_RE.match(job_id):
        raise HTTPException(status_code=400, detail="Invalid job ID format")
    return job_id


def _check_iec_warnings(site_meta: dict) -> list[str]:
    """Return IEC compliance warnings for the given site metadata."""
    warnings = []
    try:
        irr = float(site_meta.get("irradiance_wm2") or 0)
        if 0 < irr < 600:
            warnings.append(
                f"Irradiance {irr:.0f} W/m² is below the IEC 62446-3 "
                "minimum of 600 W/m². Results may not meet standard requirements."
            )
    except (TypeError, ValueError):
        pass
    return warnings


def _state_from_status(status: str | None) -> str:
    return {
        "queued": "queued",
        "processing": "running",
        "running": "running",
        "completed": "succeeded",
        "succeeded": "succeeded",
        "failed": "failed",
    }.get(status or "", status or "queued")


def _update_job(job_id: str, **fields) -> None:
    session = get_session()
    try:
        job = session.query(DbJob).filter(DbJob.id == job_id).first()
        if job is None:
            job = DbJob(id=job_id)
            session.add(job)
        if "status" in fields and "state" not in fields:
            fields["state"] = _state_from_status(str(fields.pop("status")))
        if "progress" in fields:
            fields.pop("progress")
        if "error" in fields and "message" not in fields:
            fields["message"] = fields.pop("error")
        for key, value in fields.items():
            if hasattr(job, key):
                setattr(job, key, value)
        session.commit()
    except Exception:
        logger.exception("Failed to persist job state for %s", job_id)
    finally:
        session.close()


def _create_job(job_id: str, park_id: str | None = None) -> None:
    _update_job(job_id, park_id=park_id, state="queued", processed=0, total=0, message=None)


def _get_job(job_id: str) -> dict | None:
    session = get_session()
    try:
        job = session.query(DbJob).filter(DbJob.id == job_id).first()
        if job is None:
            return None
        total = int(job.total or 0)
        processed = int(job.processed or 0)
        progress = round(processed / total, 2) if total else (1.0 if job.state == "succeeded" else 0.0)
        status = {
            "queued": "queued",
            "running": "processing",
            "succeeded": "completed",
            "failed": "failed",
        }.get(job.state, job.state)
        return {
            "job_id": job.id,
            "state": job.state,
            "status": status,
            "progress": progress,
            "processed": processed,
            "total": total,
            "message": job.message,
            "error": job.message,
            "park_id": job.park_id,
            "result_path": job.result_path,
        }
    finally:
        session.close()


def _corrections_for_job(job_id: str) -> list[dict]:
    session = get_session()
    try:
        rows = session.query(Correction).filter(Correction.job_id == job_id).all()
        return [_serialize_correction(row) for row in rows]
    except Exception:
        logger.exception("Failed to load corrections for report %s", job_id)
        return []
    finally:
        session.close()


# ── POST /inspect ─────────────────────────────────────────────────────────────

@app.post("/inspect")
async def inspect_pair(
    thermal_image: UploadFile = File(..., description="Thermal IR image (JPEG/PNG/TIFF, max 50 MB)"),
    rgb_image: UploadFile | None = File(None, description="RGB image (optional)"),
    park_id: str = Form("unknown"),
    park_mode: str = Form("auto"),
    altitude_m: float = Form(20.0),
    # Optional site metadata — used in PDF/Excel reports
    site_name: str = Form(""),
    client: str = Form(""),
    location: str = Form(""),
    capacity_mw: str = Form(""),
    lat: str = Form(""),
    lon: str = Form(""),
    irradiance_wm2: str = Form(""),
    inspection_time: str = Form(""),
    drone_model: str = Form(""),
    inspection_type: str = Form("maintenance"),
    inspection_level: str = Form("simplified"),
):
    """Inspect a single thermal+RGB image pair."""
    park_id = _validate_park_id(park_id)

    # Validate altitude range
    if not (1.0 <= altitude_m <= 500.0):
        raise HTTPException(status_code=400, detail="altitude_m must be between 1 and 500")

    # Validate thermal file extension
    thermal_name = _safe_filename(thermal_image.filename, "thermal.jpg")
    if Path(thermal_name).suffix.lower() not in _ALLOWED_IMAGE_EXTS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported thermal image format. Allowed: {', '.join(_ALLOWED_IMAGE_EXTS)}",
        )

    # Read with size limit
    thermal_bytes = await thermal_image.read()
    if len(thermal_bytes) > _MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Thermal image exceeds 50 MB limit")

    rgb_bytes = None
    rgb_name = None
    if rgb_image:
        rgb_name = _safe_filename(rgb_image.filename, "rgb.jpg")
        if Path(rgb_name).suffix.lower() not in _ALLOWED_IMAGE_EXTS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported RGB image format. Allowed: {', '.join(_ALLOWED_IMAGE_EXTS)}",
            )
        rgb_bytes = await rgb_image.read()
        if len(rgb_bytes) > _MAX_IMAGE_BYTES:
            raise HTTPException(status_code=413, detail="RGB image exceeds 50 MB limit")

    site_meta = {
        "site_name":        site_name or park_id,
        "client":           client,
        "location":         location,
        "capacity_mw":      capacity_mw,
        "lat":              lat,
        "lon":              lon,
        "irradiance_wm2":   irradiance_wm2,
        "inspection_time":  inspection_time,
        "drone_model":      drone_model,
        "inspection_type":  inspection_type,
        "inspection_level": inspection_level,
    }

    with tempfile.TemporaryDirectory() as tmpdir:
        thermal_path = Path(tmpdir) / thermal_name
        thermal_path.write_bytes(thermal_bytes)

        rgb_path = None
        if rgb_bytes is not None and rgb_name:
            rgb_path = Path(tmpdir) / rgb_name
            rgb_path.write_bytes(rgb_bytes)

        orch = get_orchestrator()
        result = orch.inspect_pair(
            thermal_path=thermal_path,
            rgb_path=rgb_path,
            park_id=park_id,
            altitude_m=altitude_m,
        )

    result["site_meta"] = site_meta
    _update_job(
        result["job_id"],
        park_id=park_id,
        state="succeeded",
        processed=1,
        total=1,
        message=None,
    )
    return JSONResponse(content={
        "job_id": result["job_id"],
        "status": "completed",
        "total_detections": result["total_detections"],
        "summary": result["summary"],
        "detections": result["detections"],
        "rgb_filename": Path(result.get("annotated_rgb") or "").name,
        "warnings": _check_iec_warnings(site_meta),
    })


# ── POST /batch ───────────────────────────────────────────────────────────────

@app.post("/batch", status_code=202)
async def inspect_batch(
    background_tasks: BackgroundTasks,
    images: UploadFile = File(..., description="ZIP archive of thermal+RGB image pairs (max 2 GB)"),
    park_id: str = Form("unknown"),
    park_mode: str = Form("auto"),
    altitude_m: float = Form(20.0),
    # Optional site metadata — used in PDF/Excel reports
    site_name: str = Form(""),
    client: str = Form(""),
    location: str = Form(""),
    capacity_mw: str = Form(""),
    lat: str = Form(""),
    lon: str = Form(""),
    irradiance_wm2: str = Form(""),
    inspection_time: str = Form(""),
    drone_model: str = Form(""),
    inspection_type: str = Form("maintenance"),
    inspection_level: str = Form("simplified"),
):
    """Submit a batch inspection job (runs in background)."""
    park_id = _validate_park_id(park_id)

    if not (1.0 <= altitude_m <= 500.0):
        raise HTTPException(status_code=400, detail="altitude_m must be between 1 and 500")

    # Validate it's actually a zip
    zip_name = _safe_filename(images.filename, "batch.zip")
    if Path(zip_name).suffix.lower() != ".zip":
        raise HTTPException(status_code=400, detail="Only ZIP archives are accepted for batch upload")

    zip_bytes = await images.read()
    if len(zip_bytes) > _MAX_ZIP_BYTES:
        raise HTTPException(status_code=413, detail="ZIP archive exceeds 2 GB limit")

    # Validate zip integrity + bomb metadata before accepting
    try:
        import io
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            infos = zf.infolist()
            if len(infos) > _MAX_ZIP_MEMBERS:
                raise HTTPException(
                    status_code=400,
                    detail=f"ZIP contains too many files ({len(infos)} > {_MAX_ZIP_MEMBERS})",
                )
            declared_uncompressed = sum(i.file_size for i in infos)
            if declared_uncompressed > _MAX_ZIP_UNCOMPRESSED_BYTES:
                raise HTTPException(
                    status_code=400,
                    detail="ZIP archive declared uncompressed size exceeds the allowed limit",
                )
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid ZIP archive")

    site_meta = {
        "site_name":        site_name or park_id,
        "client":           client,
        "location":         location,
        "capacity_mw":      capacity_mw,
        "lat":              lat,
        "lon":              lon,
        "irradiance_wm2":   irradiance_wm2,
        "inspection_time":  inspection_time,
        "drone_model":      drone_model,
        "inspection_type":  inspection_type,
        "inspection_level": inspection_level,
    }

    job_id = f"batch-{uuid.uuid4().hex[:8]}"
    tmp_zip = OUTPUT_DIR / f"{job_id}.zip"
    tmp_zip.write_bytes(zip_bytes)

    _create_job(job_id, park_id)

    background_tasks.add_task(_run_batch_job, job_id, tmp_zip, park_id, altitude_m, site_meta)

    return {"job_id": job_id, "state": "queued", "status": "queued",
            "message": "Batch job queued. Poll GET /status/{job_id} for progress.",
            "warnings": _check_iec_warnings(site_meta)}


def _is_unsafe_member(member: zipfile.ZipInfo) -> str | None:
    """Return a reason string if the member should be rejected, else None.

    Rejects symlinks, devices, and any non-regular file. external_attr in
    zip stores Unix mode in the high 16 bits — anything that isn't a plain
    file or directory is refused to prevent symlink-based sandbox escapes.
    """
    mode = (member.external_attr >> 16) & 0xFFFF
    if mode and not (stat.S_ISREG(mode) or stat.S_ISDIR(mode)):
        return f"non-regular file (mode={oct(mode)})"
    # Absolute paths or drive letters
    if member.filename.startswith(("/", "\\")) or ":" in member.filename:
        return "absolute or drive-qualified path"
    return None


def _safe_extract_zip(zf: zipfile.ZipFile, extract_dir: Path) -> None:
    """Extract zip entries with defenses against:
       - Zip-slip (path traversal)
       - Symlink/device members (sandbox escape)
       - Zip bombs (uncompressed-size cap + per-member ratio cap)
    """
    extract_root = extract_dir.resolve()
    total_uncompressed = 0

    for member in zf.infolist():
        reason = _is_unsafe_member(member)
        if reason:
            logger.warning("Rejected zip entry (%s): %s", reason, member.filename)
            continue

        # Per-member ratio check — flags pathological compression early
        if member.compress_size > 0:
            ratio = member.file_size / max(member.compress_size, 1)
            if ratio > _MAX_ZIP_RATIO and member.file_size > 1024 * 1024:
                logger.warning(
                    "Rejected zip entry with extreme compression ratio %.0fx: %s",
                    ratio, member.filename,
                )
                continue

        total_uncompressed += member.file_size
        if total_uncompressed > _MAX_ZIP_UNCOMPRESSED_BYTES:
            raise HTTPException(
                status_code=400,
                detail="ZIP archive uncompressed size exceeds the allowed limit",
            )

        member_path = (extract_dir / member.filename).resolve()
        try:
            member_path.relative_to(extract_root)
        except ValueError:
            logger.warning("Rejected zip entry with path traversal: %s", member.filename)
            continue
        zf.extract(member, str(extract_dir))


def _run_batch_job(
    job_id: str,
    zip_path: Path,
    park_id: str,
    altitude_m: float,
    site_meta: dict | None = None,
) -> None:
    extract_dir = OUTPUT_DIR / job_id
    extract_dir.mkdir(exist_ok=True)

    try:
        with zipfile.ZipFile(str(zip_path), "r") as zf:
            _safe_extract_zip(zf, extract_dir)
        zip_path.unlink(missing_ok=True)

        def progress_cb(processed: int, total: int) -> None:
            _update_job(job_id, processed=processed, total=total, state="running")

        # If the zip had a single top-level directory (e.g. sample_mission/thermal/)
        # the extracted layout is extract_dir/sample_mission/thermal/ — walk up to
        # the actual mission root that contains a thermal/ subdir.
        mission_root = extract_dir
        subdirs = [d for d in extract_dir.iterdir() if d.is_dir()]
        if len(subdirs) == 1 and (subdirs[0] / "thermal").exists():
            mission_root = subdirs[0]
            logger.info("Detected single-folder zip; using mission root: %s", mission_root)

        orch = get_orchestrator()
        result = orch.inspect_folder(
            folder=mission_root, park_id=park_id,
            altitude_m=altitude_m, progress_callback=progress_cb,
            site_meta=site_meta,
        )
        generate_json_report(result, extract_dir / "inspection_report.json")
        generate_excel_report(result, extract_dir / "inspection_report.xlsx", site_meta=site_meta)
        write_geojson(result, extract_dir / "park_anomaly_map.geojson")
        try:
            generate_pdf_report(result, extract_dir / "inspection_report.pdf", site_meta=site_meta)
        except Exception:
            logger.exception("PDF report generation failed for batch job %s", job_id)

        total_images = int(result.get("total_images") or 0)
        _update_job(
            job_id,
            state="succeeded",
            processed=total_images,
            total=total_images,
            message=None,
            result_path=str(extract_dir / "inspection_report.json"),
        )
    except Exception:
        logger.exception("Batch job %s failed", job_id)
        # Do NOT expose exception message to clients — log it, return generic error
        _update_job(
            job_id,
            state="failed",
            message="Inspection failed. Check server logs for details.",
        )


# ── GET /status/{job_id} ──────────────────────────────────────────────────────

@app.get("/status/{job_id}")
def get_status(job_id: str):
    """Get the status and progress of an inspection job."""
    job_id = _validate_job_id(job_id)
    job = _get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "job_id": job_id,
        "state": job.get("state"),
        "status": job.get("status"),
        "progress": job.get("progress", 0.0),
        "processed": job.get("processed", 0),
        "total": job.get("total", 0),
        "message": job.get("message"),
        # Only expose error message if present — message is already sanitised
        **({"error": job["error"]} if "error" in job else {}),
    }


# ── GET /report/{job_id} ──────────────────────────────────────────────────────

# Whitelist of allowed report formats — prevents format param from being used
# to serve arbitrary files from the output directory.
_REPORT_FORMAT_MAP = {
    "pdf":     ("inspection_report.pdf",        "application/pdf"),
    "json":    ("inspection_report.json",       "application/json"),
    "excel":   ("inspection_report.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    "geojson": ("park_anomaly_map.geojson",      "application/geo+json"),
}


@app.get("/report/{job_id}")
def download_report(job_id: str, format: str = "json"):
    """Download the inspection report in the requested format."""
    job_id = _validate_job_id(job_id)

    job = _get_job(job_id)
    if job is None or job.get("status") != "completed":
        raise HTTPException(status_code=404, detail="Job not found or not yet complete")

    entry = _REPORT_FORMAT_MAP.get(format)
    if entry is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown format '{format}'. Use: {', '.join(_REPORT_FORMAT_MAP)}",
        )

    filename, media_type = entry
    # Construct path from whitelist — not from user input
    report_path = (OUTPUT_DIR / job_id / filename).resolve()
    corrections = _corrections_for_job(job_id)

    # Final safety: ensure path is still inside OUTPUT_DIR
    if not str(report_path).startswith(str(OUTPUT_DIR.resolve())):
        raise HTTPException(status_code=403, detail="Access denied")

    if format == "json":
        if report_path.exists():
            try:
                report_data = json.loads(report_path.read_text())
            except (json.JSONDecodeError, OSError):
                logger.exception("Failed to read JSON report for %s", job_id)
                report_data = {}
        else:
            report_data = {
                "inspection_id": job_id,
                "job_id": job_id,
                "park_id": job.get("park_id"),
                "summary": {},
                "detections": [],
            }
        report_data["corrections"] = corrections
        return JSONResponse(content=report_data)

    if not report_path.exists():
        raise HTTPException(status_code=404, detail=f"Report not yet generated for format: {format}")

    return FileResponse(path=str(report_path), filename=filename, media_type=media_type)


@app.get("/results/{job_id}/{filename}")
def serve_result_image(job_id: str, filename: str):
    """Serve an annotated image from a completed job's output directory."""
    job_id = _validate_job_id(job_id)
    filename = _safe_filename(filename, "")
    if not filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    image_path = (OUTPUT_DIR / job_id / filename).resolve()
    job_dir = (OUTPUT_DIR / job_id).resolve()
    if not str(image_path).startswith(str(job_dir)):
        raise HTTPException(status_code=403, detail="Access denied")
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    mime, _ = mimetypes.guess_type(str(image_path))
    return FileResponse(str(image_path), media_type=mime or "image/jpeg")


# ── GET /map/{job_id} ─────────────────────────────────────────────────────────

# Synthetic origin used when EXIF GPS is missing — keeps the map demo-able.
# Picked at the heart of the Bhadla solar park (Rajasthan) so the markers
# land on an actual PV farm in OSM tiles.
_DEMO_ORIGIN_LAT = 27.5396
_DEMO_ORIGIN_LON = 71.9070

# Severity → marker color (matches frontend severity pills)
_SEVERITY_COLOR = {
    "CRITICAL": "#dc2626",
    "HIGH":     "#ea580c",
    "MEDIUM":   "#d97706",
    "LOW":      "#0284c7",
}


def _synthetic_image_gps(index: int, altitude_m: float) -> dict:
    """Generate a deterministic lat/lon for an image when EXIF GPS is absent.

    Lays images out on a 20m × 25m serpentine grid so the resulting map
    matches a realistic drone-mission footprint.
    """
    import math
    cols = 8
    row, col = divmod(index, cols)
    if row % 2 == 1:
        col = cols - 1 - col  # serpentine
    # ~20m east per col, ~25m north per row
    R = 6_371_000.0
    dx_m = (col - cols / 2) * 20.0
    dy_m = -row * 25.0  # north
    lat0 = math.radians(_DEMO_ORIGIN_LAT)
    new_lat = _DEMO_ORIGIN_LAT + math.degrees(dy_m / R)
    new_lon = _DEMO_ORIGIN_LON + math.degrees(dx_m / (R * math.cos(lat0)))
    return {"lat": new_lat, "lon": new_lon, "alt": float(altitude_m), "synthetic": True}


def _synthetic_detection_gps(image_gps: dict, bbox: list[int], img_size: list[int]) -> dict:
    """Offset a detection inside an image footprint when GPS is absent."""
    import math
    w, h = (img_size or [640, 512])[:2]
    cx = (bbox[0] + bbox[2]) / 2.0
    cy = (bbox[1] + bbox[3]) / 2.0
    # Footprint ~18m × 14m at 40m altitude — close enough for visualization
    dx_m = (cx / max(w, 1) - 0.5) * 18.0
    dy_m = -(cy / max(h, 1) - 0.5) * 14.0
    R = 6_371_000.0
    lat0 = math.radians(image_gps["lat"])
    return {
        "lat": image_gps["lat"] + math.degrees(dy_m / R),
        "lon": image_gps["lon"] + math.degrees(dx_m / (R * math.cos(lat0))),
        "synthetic": True,
    }


def _read_inspection_report(job_id: str) -> dict | None:
    """Load the saved inspection_report.json for a completed job."""
    report_path = (OUTPUT_DIR / job_id / "inspection_report.json").resolve()
    if not str(report_path).startswith(str(OUTPUT_DIR.resolve())):
        return None
    if not report_path.exists():
        return None
    try:
        return json.loads(report_path.read_text())
    except (json.JSONDecodeError, OSError):
        logger.exception("Failed to read inspection report for job %s", job_id)
        return None


@app.get("/map/{job_id}")
def get_job_map(job_id: str):
    """Return combined GPS map data for a batch job.

    Aggregates every image's capture position + every anomaly's GPS into a
    single payload the frontend can render on Leaflet. When EXIF GPS is
    missing, generates deterministic synthetic positions so the map remains
    populated.
    """
    job_id = _validate_job_id(job_id)
    job = _get_job(job_id)
    report = _read_inspection_report(job_id)

    if job is None and report is None:
        raise HTTPException(status_code=404, detail="Job not found")

    source = report or job or {}
    # Batch jobs expose a `results` list; single-pair `/inspect` jobs flatten
    # the result into the top-level dict — normalize both into a list.
    if "results" in source and isinstance(source["results"], list):
        results = source["results"]
    elif "detections" in source:
        results = [source]
    else:
        results = []

    park_id = source.get("park_id") or "unknown"
    flight_date = source.get("flight_date", "")

    images_out: list[dict] = []
    anomalies_out: list[dict] = []
    summary = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}

    lats: list[float] = []
    lons: list[float] = []

    for idx, result in enumerate(results):
        altitude = float(result.get("altitude_m") or 40.0)
        img_gps = result.get("image_gps")
        if not img_gps or "lat" not in img_gps or "lon" not in img_gps:
            img_gps = _synthetic_image_gps(idx, altitude)

        image_id = result.get("image_id") or f"img-{idx:04d}"
        detections = result.get("detections", [])
        image_critical = sum(
            1 for d in detections if (d.get("severity") or "").upper() == "CRITICAL"
        )

        thermal_path = result.get("annotated_thermal") or ""
        rgb_path = result.get("annotated_rgb") or ""
        thermal_filename = Path(thermal_path).name if thermal_path else ""
        rgb_filename = Path(rgb_path).name if rgb_path else ""

        images_out.append({
            "image_id": image_id,
            "lat": img_gps["lat"],
            "lon": img_gps["lon"],
            "altitude_m": altitude,
            "detection_count": len(detections),
            "critical_count": image_critical,
            "synthetic": bool(img_gps.get("synthetic")),
            "thermal_filename": thermal_filename,
            "rgb_filename": rgb_filename,
        })
        lats.append(img_gps["lat"])
        lons.append(img_gps["lon"])

        for det in detections:
            sev = (det.get("severity") or "LOW").upper()
            if sev in summary:
                summary[sev] += 1

            gps = det.get("gps") or det.get("detection_gps")
            if not gps or "lat" not in gps or "lon" not in gps:
                gps = _synthetic_detection_gps(
                    img_gps, det.get("bbox", [0, 0, 0, 0]),
                    result.get("image_size", [640, 512]),
                )

            anomalies_out.append({
                "id": f"{image_id}-{len(anomalies_out):04d}",
                "image_id": image_id,
                "lat": gps["lat"],
                "lon": gps["lon"],
                "severity": sev,
                "class": det.get("class", ""),
                "class_id": det.get("class_id", -1),
                "confidence": round(float(det.get("confidence") or 0.0), 3),
                "panel_id": det.get("panel_id", "N/A"),
                "color": _SEVERITY_COLOR.get(sev, "#0284c7"),
                "synthetic": bool(gps.get("synthetic")),
                "thermal_filename": thermal_filename,
            })
            lats.append(gps["lat"])
            lons.append(gps["lon"])

    bounds = None
    if lats and lons:
        bounds = {
            "south": min(lats),
            "north": max(lats),
            "west":  min(lons),
            "east":  max(lons),
            "center": {"lat": sum(lats) / len(lats), "lon": sum(lons) / len(lons)},
        }

    synthetic = any(img.get("synthetic") for img in images_out)

    return {
        "job_id": job_id,
        "park_id": park_id,
        "flight_date": flight_date,
        "total_images": len(images_out),
        "total_anomalies": len(anomalies_out),
        "summary": summary,
        "bounds": bounds,
        "synthetic": synthetic,
        "images": images_out,
        "anomalies": anomalies_out,
    }


# ── GET /image/{job_id}/{filename} ────────────────────────────────────────────

# Whitelist of suffixes the orchestrator writes — refuses anything else so
# this endpoint cannot serve uploaded raw images or the inspection report JSON.
_IMAGE_SUFFIXES = ("_annotated.jpg", "_rgb_annotated.jpg")
_FILENAME_RE = re.compile(r"^[a-zA-Z0-9_\-.]{1,160}$")


@app.get("/image/{job_id}/{filename}")
def get_job_image(job_id: str, filename: str):
    """Serve an annotated thermal/RGB image produced by the pipeline.

    Strictly bounded:
      - job_id and filename go through regex validation
      - resolved path must stay inside OUTPUT_DIR/job_id
      - filename must end in one of the orchestrator's known suffixes
    """
    job_id = _validate_job_id(job_id)
    if not _FILENAME_RE.match(filename) or not filename.endswith(_IMAGE_SUFFIXES):
        raise HTTPException(status_code=400, detail="Invalid image filename")

    job_dir = (OUTPUT_DIR / job_id).resolve()
    image_path = (job_dir / filename).resolve()

    if not str(image_path).startswith(str(job_dir)):
        raise HTTPException(status_code=403, detail="Access denied")
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")

    return FileResponse(path=str(image_path), media_type="image/jpeg")


# ── Orthomosaic endpoints ─────────────────────────────────────────────────────
#
# Workflow:
#   POST /park/{park_id}/ortho                      — upload a GeoTIFF
#   GET  /park/{park_id}/orthos                     — list available orthos
#   GET  /park/{park_id}/ortho/{name}               — single ortho metadata
#   GET  /park/{park_id}/ortho/{name}/tiles/{z}/{x}/{y}.png — XYZ tile
#
# An orthomosaic gives true centimeter accuracy because:
#   1. The source pixels are sub-decimeter (drone @ 80 m, 12-MP camera).
#   2. The GeoTIFF embeds RTK/PPK-anchored ground control.
#   3. We render markers on top of THE SAME tiles users see, so visual and
#      geometric accuracy are guaranteed consistent.


_EMPTY_TILE_CACHE: bytes | None = None


def _empty_tile_png() -> bytes:
    """A fully-transparent 256×256 PNG used for tiles outside the ortho bounds."""
    global _EMPTY_TILE_CACHE
    if _EMPTY_TILE_CACHE is None:
        from io import BytesIO
        from PIL import Image
        buf = BytesIO()
        Image.new("RGBA", (256, 256), (0, 0, 0, 0)).save(buf, format="PNG")
        _EMPTY_TILE_CACHE = buf.getvalue()
    return _EMPTY_TILE_CACHE


def _validate_ortho_name(name: str) -> str:
    if not _ORTHO_NAME_RE.match(name):
        raise HTTPException(
            status_code=400,
            detail="Ortho name must be 1–80 chars (a-z, 0-9, _-) and end in .tif or .tiff",
        )
    return name


def _ortho_path(park_id: str, name: str) -> Path:
    park_id = _validate_park_id(park_id)
    name = _validate_ortho_name(name)
    park_dir = (ORTHO_DIR / park_id).resolve()
    ortho_dir_resolved = ORTHO_DIR.resolve()
    if not str(park_dir).startswith(str(ortho_dir_resolved)):
        raise HTTPException(status_code=403, detail="Access denied")
    path = (park_dir / name).resolve()
    if not str(path).startswith(str(park_dir)):
        raise HTTPException(status_code=403, detail="Access denied")
    return path


def _ortho_metadata(park_id: str, path: Path) -> dict:
    """Open the GeoTIFF and return WGS84 bounds + native CRS."""
    import rasterio
    from rasterio.warp import transform_bounds

    with rasterio.open(str(path)) as src:
        if src.crs is None:
            raise HTTPException(status_code=400, detail="GeoTIFF has no CRS")
        west, south, east, north = transform_bounds(src.crs, "EPSG:4326", *src.bounds)
        return {
            "park_id": park_id,
            "name": path.name,
            "crs": str(src.crs),
            "width": src.width,
            "height": src.height,
            "band_count": src.count,
            "bounds": {"west": west, "south": south, "east": east, "north": north},
            "center": {"lat": (south + north) / 2, "lon": (west + east) / 2},
            "size_bytes": path.stat().st_size,
        }


@app.post("/park/{park_id}/ortho", status_code=201)
async def upload_ortho(
    park_id: str,
    file: UploadFile = File(..., description="GeoTIFF orthomosaic (.tif/.tiff, max 4 GB)"),
):
    """Upload a georeferenced orthomosaic for a park."""
    park_id = _validate_park_id(park_id)
    name = _validate_ortho_name(_safe_filename(file.filename, "ortho.tif"))

    # Stream to disk so we don't hold a 4 GB file in memory
    park_dir = (ORTHO_DIR / park_id)
    park_dir.mkdir(parents=True, exist_ok=True)
    target = _ortho_path(park_id, name)

    total = 0
    tmp_target = target.with_suffix(target.suffix + ".part")
    try:
        with tmp_target.open("wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > _MAX_ORTHO_BYTES:
                    raise HTTPException(status_code=413, detail="Orthomosaic exceeds 4 GB limit")
                out.write(chunk)
        tmp_target.replace(target)
    except HTTPException:
        tmp_target.unlink(missing_ok=True)
        raise
    except Exception:
        tmp_target.unlink(missing_ok=True)
        logger.exception("Failed to write uploaded ortho")
        raise HTTPException(status_code=500, detail="Failed to store uploaded file")

    # Validate it's actually a readable georeferenced raster
    try:
        meta = _ortho_metadata(park_id, target)
    except HTTPException:
        target.unlink(missing_ok=True)
        raise
    except Exception:
        target.unlink(missing_ok=True)
        logger.exception("Uploaded file is not a valid GeoTIFF")
        raise HTTPException(status_code=400, detail="File is not a valid georeferenced TIFF")

    return meta


@app.get("/park/{park_id}/orthos")
def list_orthos(park_id: str):
    """List all uploaded orthos for a park."""
    park_id = _validate_park_id(park_id)
    park_dir = ORTHO_DIR / park_id
    if not park_dir.exists():
        return {"park_id": park_id, "orthos": []}

    orthos = []
    for path in sorted(park_dir.iterdir()):
        if path.suffix.lower() not in (".tif", ".tiff"):
            continue
        try:
            orthos.append(_ortho_metadata(park_id, path))
        except Exception:
            logger.exception("Skipping unreadable ortho: %s", path)
    return {"park_id": park_id, "orthos": orthos}


@app.get("/park/{park_id}/grid/png")
def export_park_grid_png(park_id: str, inspection_id: str | None = None):
    """Export the park fault grid as a static PNG image."""
    from axalon.core.map_renderer import render_grid_png

    park_id = _validate_park_id(park_id)
    try:
        grid = get_park_grid(park_id, inspection_id)
        panels = [
            {
                "panel_id": p.get("panel_id"),
                "row": p.get("row", 0),
                "col": p.get("col", 0),
                "worst_severity": p.get("worst_severity"),
                "detection_count": p.get("detection_count", 0),
            }
            for p in (grid.get("panels") or [])
        ]
    except Exception:
        panels = []

    png_bytes = render_grid_png(panels, title=park_id)
    safe_name = park_id.replace("/", "_").replace("..", "")
    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_name}_grid.png"',
            "Cache-Control": "no-store",
        },
    )


@app.get("/park/{park_id}/ortho/{name}")
def get_ortho_metadata(park_id: str, name: str):
    """Get metadata for a single ortho."""
    path = _ortho_path(park_id, name)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Ortho not found")
    return _ortho_metadata(park_id, path)


@app.delete("/park/{park_id}/ortho/{name}")
def delete_ortho(park_id: str, name: str):
    """Delete an uploaded ortho."""
    path = _ortho_path(park_id, name)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Ortho not found")
    path.unlink()
    return {"deleted": True, "name": name}


@app.get("/park/{park_id}/ortho/{name}/tiles/{z}/{x}/{y}.png")
def get_ortho_tile(park_id: str, name: str, z: int, x: int, y: int):
    """Stream a Web Mercator XYZ tile from a GeoTIFF using rio-tiler.

    Centimeter accuracy comes from this endpoint — markers anchored in
    WGS84 are rendered on tiles built from the customer's own ortho, so
    visual and geometric coordinates stay in lockstep.
    """
    if not (0 <= z <= 24 and 0 <= x < 2 ** z and 0 <= y < 2 ** z):
        raise HTTPException(status_code=400, detail="Invalid tile coordinates")

    path = _ortho_path(park_id, name)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Ortho not found")

    try:
        from rio_tiler.io import Reader
        from rio_tiler.errors import TileOutsideBounds
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="rio-tiler is not installed on this server. Install with: pip install rio-tiler",
        )

    try:
        with Reader(str(path)) as src:
            img = src.tile(x, y, z, tilesize=256)
            png_bytes = img.render(img_format="PNG")
    except TileOutsideBounds:
        png_bytes = _empty_tile_png()
    except Exception:
        logger.exception("Tile rendering failed for %s z=%s x=%s y=%s", path.name, z, x, y)
        raise HTTPException(status_code=500, detail="Tile rendering failed")

    return Response(
        content=png_bytes,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )


# ── GET /park/{park_id} ───────────────────────────────────────────────────────

@app.get("/park/{park_id}")
def get_park_summary(park_id: str):
    """Get park summary + inspection history from DB."""
    park_id = _validate_park_id(park_id)
    session = get_session()
    try:
        park = session.query(Park).filter_by(id=park_id).first()
        if park is None:
            raise HTTPException(status_code=404, detail="Park not found")
        inspections = (
            session.query(Inspection)
            .filter_by(park_id=park_id)
            .order_by(Inspection.created_at.desc())
            .all()
        )
        return {
            "park_id": park_id,
            "name": park.name,
            "mode": park.mode,
            "total_panels": park.total_panels,
            "rows": park.rows,
            "cols": park.cols,
            "total_inspections": len(inspections),
            "inspections": [
                {
                    "id": insp.id,
                    "flight_date": insp.flight_date,
                    "total_images": insp.total_images,
                    "total_detections": insp.total_detections,
                    "summary": json.loads(insp.summary) if insp.summary else {},
                    "inspection_type": insp.inspection_type,
                    "inspection_level": insp.inspection_level,
                    "client": insp.client,
                    "location": insp.location,
                    "capacity_mw": insp.capacity_mw,
                    "irradiance_wm2": insp.irradiance_wm2,
                    "wind_speed_bft": insp.wind_speed_bft,
                    "cloud_coverage_okta": insp.cloud_coverage_okta,
                }
                for insp in inspections
            ],
        }
    finally:
        session.close()


@app.get("/park/{park_id}/grid")
def get_park_grid(park_id: str, inspection_id: str | None = None):
    """Per-panel grid summary for a park's most recent (or specified) inspection."""
    from axalon.park.grid import build_grid

    session = get_session()
    try:
        park = session.query(Park).filter(Park.id == park_id).first()
        if park is None:
            raise HTTPException(status_code=404, detail=f"Park {park_id!r} not found")

        if inspection_id:
            insp = session.query(Inspection).filter(
                Inspection.id == inspection_id,
                Inspection.park_id == park_id,
            ).first()
            if insp is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"Inspection {inspection_id!r} not found for park {park_id!r}",
                )
        else:
            insp = (
                session.query(Inspection)
                .filter(Inspection.park_id == park_id)
                .order_by(Inspection.created_at.desc())
                .first()
            )

        if insp is None:
            return {
                "park_id": park_id,
                "inspection_id": None,
                "rows": int(park.rows or 0),
                "cols": int(park.cols or 0),
                "panels": [],
            }

        rows = session.query(DbDetection).filter(DbDetection.inspection_id == insp.id).all()
        detections = []
        for d in rows:
            try:
                bbox = json.loads(d.bbox) if d.bbox else None
            except json.JSONDecodeError:
                bbox = None
            try:
                gps = json.loads(d.gps) if d.gps else None
            except json.JSONDecodeError:
                gps = None
            detections.append({
                "panel_id": d.panel_id,
                "severity": d.severity,
                "class": d.class_,
                "confidence": d.confidence,
                "image_id": d.image_id,
                "thermal_filename": f"{d.image_id}.jpg" if d.image_id else None,
                "bbox": bbox,
                "gps": gps,
            })

        return build_grid(detections=detections, park=park, inspection_id=insp.id)
    finally:
        session.close()


@app.get("/park/{park_id}/trend")
def get_park_trend(park_id: str):
    """Per-inspection severity count trend for a park, oldest first."""
    from sqlalchemy import text
    from axalon.park.trend import build_trend

    park_id = _validate_park_id(park_id)
    session = get_session()
    try:
        park = session.query(Park).filter(Park.id == park_id).first()
        if park is None:
            raise HTTPException(status_code=404, detail=f"Park {park_id!r} not found")
        rows = session.execute(
            text("""
                SELECT i.id,
                       i.flight_date,
                       SUM(CASE WHEN d.severity = 'CRITICAL' THEN 1 ELSE 0 END) AS critical_count,
                       SUM(CASE WHEN d.severity = 'HIGH'     THEN 1 ELSE 0 END) AS high_count,
                       SUM(CASE WHEN d.severity = 'MEDIUM'   THEN 1 ELSE 0 END) AS medium_count,
                       SUM(CASE WHEN d.severity = 'LOW'      THEN 1 ELSE 0 END) AS low_count
                FROM inspections i
                LEFT JOIN detections d ON d.inspection_id = i.id
                WHERE i.park_id = :park_id
                GROUP BY i.id, i.flight_date
                ORDER BY i.flight_date ASC
            """),
            {"park_id": park_id},
        ).fetchall()
        return build_trend(rows)
    finally:
        session.close()


@app.get("/park/{park_id}/recurring")
def get_park_recurring(park_id: str, min_inspections: int = 2):
    """Panels with anomalies in at least min_inspections inspections."""
    from sqlalchemy import text
    from axalon.park.recurring import build_recurring

    park_id = _validate_park_id(park_id)
    min_inspections = max(1, int(min_inspections))
    session = get_session()
    try:
        park = session.query(Park).filter(Park.id == park_id).first()
        if park is None:
            raise HTTPException(status_code=404, detail=f"Park {park_id!r} not found")
        rows = session.execute(
            text("""
                SELECT d.panel_id,
                       COUNT(DISTINCT d.inspection_id) AS inspection_count,
                       MAX(CASE d.severity
                           WHEN 'CRITICAL' THEN 4
                           WHEN 'HIGH'     THEN 3
                           WHEN 'MEDIUM'   THEN 2
                           ELSE 1 END) AS sev_rank,
                       GROUP_CONCAT(DISTINCT d.class) AS classes,
                       MIN(i.flight_date) AS first_seen,
                       MAX(i.flight_date) AS last_seen
                FROM detections d
                JOIN inspections i ON i.id = d.inspection_id
                WHERE i.park_id = :park_id
                  AND d.panel_id IS NOT NULL
                GROUP BY d.panel_id
                HAVING COUNT(DISTINCT d.inspection_id) >= :min_inspections
                ORDER BY sev_rank DESC, inspection_count DESC
            """),
            {"park_id": park_id, "min_inspections": min_inspections},
        ).fetchall()
        return build_recurring(rows)
    finally:
        session.close()


@app.get("/park/{park_id}/diff")
def diff_park_inspections(park_id: str, inspection_a: str, inspection_b: str):
    """Compare two inspections of the same park, returning a rich per-panel diff.

    Query params:
        inspection_a: ID of the baseline inspection
        inspection_b: ID of the comparison inspection

    Returns a panel-level diff with status new | resolved | changed | unchanged,
    plus full detection lists for both inspections on each affected panel.
    """
    park_id = _validate_park_id(park_id)
    inspection_a = _validate_job_id(inspection_a)
    inspection_b = _validate_job_id(inspection_b)

    session = get_session()
    try:
        # 1. Validate park exists
        park = session.query(Park).filter(Park.id == park_id).first()
        if park is None:
            raise HTTPException(status_code=404, detail=f"Park {park_id!r} not found")

        # 2. Validate both inspections exist for this park
        insp_a = session.query(Inspection).filter(
            Inspection.id == inspection_a,
            Inspection.park_id == park_id,
        ).first()
        if insp_a is None:
            raise HTTPException(
                status_code=404,
                detail=f"Inspection {inspection_a!r} not found for park {park_id!r}",
            )

        insp_b = session.query(Inspection).filter(
            Inspection.id == inspection_b,
            Inspection.park_id == park_id,
        ).first()
        if insp_b is None:
            raise HTTPException(
                status_code=404,
                detail=f"Inspection {inspection_b!r} not found for park {park_id!r}",
            )

        # 3. Fetch all detections for both inspections
        def _fetch_detections(insp_id: str) -> list[dict]:
            rows = session.query(DbDetection).filter(
                DbDetection.inspection_id == insp_id
            ).all()
            result = []
            for d in rows:
                result.append({
                    "panel_id": d.panel_id or "R?-C?",
                    "class": d.class_,
                    "severity": d.severity,
                    "confidence": d.confidence,
                })
            return result

        dets_a = _fetch_detections(inspection_a)
        dets_b = _fetch_detections(inspection_b)

        # 4. Compute diff
        diff = build_diff(dets_a, dets_b)

        # 5. Build per-panel response
        # Collect all panel_ids that appear in either inspection
        all_panel_ids: set[str] = set()
        for det in dets_a + dets_b:
            all_panel_ids.add(det["panel_id"])

        # Index detections by panel_id for quick lookup
        def _panel_index(dets: list[dict]) -> dict[str, list[dict]]:
            idx: dict[str, list[dict]] = {}
            for det in dets:
                pid = det["panel_id"]
                idx.setdefault(pid, []).append({
                    "class": det["class"],
                    "severity": det["severity"],
                    "confidence": det["confidence"],
                })
            return idx

        panel_a = _panel_index(dets_a)
        panel_b = _panel_index(dets_b)

        # Build a (panel_id, class) -> status mapping from diff result
        panel_status: dict[str, str] = {}
        for item in diff["new"]:
            panel_status[item["panel_id"]] = "new"
        for item in diff["resolved"]:
            pid = item["panel_id"]
            # Don't downgrade a panel already marked "new" (edge case: mixed panel)
            if pid not in panel_status:
                panel_status[pid] = "resolved"
        for item in diff["changed"]:
            pid = item["panel_id"]
            # "changed" takes precedence over new/resolved if mixed
            if pid not in panel_status or panel_status[pid] == "unchanged":
                panel_status[pid] = "changed"

        panels: list[dict] = []
        for pid in sorted(all_panel_ids):
            dets_a_panel = panel_a.get(pid, [])
            dets_b_panel = panel_b.get(pid, [])

            status = panel_status.get(pid, "unchanged")

            # Derive severity_a / severity_b from the panel's highest-severity detection
            # (or None if not present in that inspection)
            _severity_order = {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1, "": 0}

            def _top_severity(det_list: list[dict]) -> str | None:
                if not det_list:
                    return None
                return max(
                    (d["severity"] or "" for d in det_list),
                    key=lambda s: _severity_order.get(s, 0),
                ) or None

            panels.append({
                "panel_id": pid,
                "status": status,
                "severity_a": _top_severity(dets_a_panel),
                "severity_b": _top_severity(dets_b_panel),
                "detections_a": dets_a_panel,
                "detections_b": dets_b_panel,
            })

        summary = {
            "new": len(diff["new"]),
            "resolved": len(diff["resolved"]),
            "changed": len(diff["changed"]),
        }

        return {
            "park_id": park_id,
            "inspection_a": inspection_a,
            "inspection_b": inspection_b,
            "summary": summary,
            "panels": panels,
        }
    finally:
        session.close()


# ── Corrections (annotation editor) ──────────────────────────────────────────

def _serialize_correction(c: Correction) -> dict:
    return {
        "id": c.id,
        "job_id": c.job_id,
        "image_id": c.image_id,
        "panel_id": c.panel_id,
        "class": c.class_,
        "class_id": c.class_id,
        "severity": c.severity,
        "bbox_norm": json.loads(c.bbox_norm) if c.bbox_norm else [],
        "notes": c.notes,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


@app.get("/corrections/{job_id:path}")
def list_corrections(job_id: str):
    """List all user correction boxes for an inspect job."""
    job_id = _validate_job_id(job_id)
    session = get_session()
    try:
        rows = (
            session.query(Correction)
            .filter(Correction.job_id == job_id)
            .order_by(Correction.created_at.asc(), Correction.id.asc())
            .all()
        )
        return [_serialize_correction(r) for r in rows]
    finally:
        session.close()


@app.post("/corrections/{job_id}", status_code=201)
def create_correction(job_id: str, body: dict):
    """Persist a user-drawn bounding box correction."""
    job_id = _validate_job_id(job_id)
    class_ = str(body.get("class_", ""))[:64]
    if not class_:
        raise HTTPException(status_code=400, detail="class_ is required")

    bbox = body.get("bbox_norm")
    if not isinstance(bbox, list) or len(bbox) != 4:
        raise HTTPException(status_code=400, detail="bbox_norm must contain four values")
    try:
        bbox = [max(0.0, min(1.0, float(v))) for v in bbox]
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="bbox_norm values must be numeric")

    raw_class_id = body.get("class_id")
    class_id = int(raw_class_id) if raw_class_id is not None else None
    severity = str(body.get("severity", "MEDIUM"))[:16]
    notes = str(body.get("notes", ""))[:500] if body.get("notes") else None
    session = get_session()
    try:
        c = Correction(
            job_id=job_id,
            image_id=str(body.get("image_id", ""))[:160] if body.get("image_id") else None,
            panel_id=str(body.get("panel_id", ""))[:64] if body.get("panel_id") else None,
            class_=class_,
            class_id=class_id,
            severity=severity,
            bbox_norm=json.dumps(bbox),
            notes=notes,
        )
        session.add(c)
        session.commit()
        session.refresh(c)
        return JSONResponse(content=_serialize_correction(c), status_code=201)
    finally:
        session.close()


@app.delete("/corrections/{job_id}/{correction_id}", status_code=204)
def delete_correction(job_id: str, correction_id: int):
    """Delete a user correction by ID."""
    job_id = _validate_job_id(job_id)
    session = get_session()
    try:
        c = session.query(Correction).filter(
            Correction.id == correction_id,
            Correction.job_id == job_id,
        ).first()
        if c is None:
            raise HTTPException(status_code=404, detail="Correction not found")
        session.delete(c)
        session.commit()
        return Response(status_code=204)
    finally:
        session.close()


@app.get("/parks")
def list_parks():
    """List all parks from DB."""
    session = get_session()
    try:
        parks = session.query(Park).all()
        return {
            "parks": [
                {"id": p.id, "name": p.name, "mode": p.mode,
                 "total_panels": p.total_panels, "rows": p.rows, "cols": p.cols}
                for p in parks
            ],
            "total": len(parks),
        }
    finally:
        session.close()


_SETTINGS_PATH = Path(__file__).resolve().parents[1] / "config" / "settings.yaml"


@app.get("/settings")
def get_settings():
    """Return current platform settings.yaml as JSON."""
    try:
        import yaml  # lazy — keep top-level imports lean
        if not _SETTINGS_PATH.exists():
            raise HTTPException(404, "settings.yaml not found")
        with _SETTINGS_PATH.open("r") as f:
            data = yaml.safe_load(f) or {}
        return {"settings": data, "path": str(_SETTINGS_PATH)}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to read settings.yaml")
        raise HTTPException(500, f"Failed to read settings: {exc}")


@app.put("/settings")
async def update_settings(payload: dict):
    """Overwrite settings.yaml with the provided dict (top-level key 'settings')."""
    try:
        import yaml
        new_settings = payload.get("settings") if isinstance(payload, dict) else None
        if not isinstance(new_settings, dict):
            raise HTTPException(400, "Body must be {'settings': {...}}")
        # Atomic write: temp file → rename
        tmp = _SETTINGS_PATH.with_suffix(".yaml.tmp")
        with tmp.open("w") as f:
            yaml.safe_dump(new_settings, f, sort_keys=False, default_flow_style=False)
        tmp.replace(_SETTINGS_PATH)
        return {"ok": True, "path": str(_SETTINGS_PATH)}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Failed to write settings.yaml")
        raise HTTPException(500, f"Failed to write settings: {exc}")


# ── Fault tracking endpoints ──────────────────────────────────────────────────

_ALLOWED_FAULT_STATUSES = {FAULT_OPEN, FAULT_STALE, FAULT_RESOLVED}


def _serialize_fault(f: PanelFault, comment_count: int = 0) -> dict:
    return {
        "id": f.id,
        "park_id": f.park_id,
        "panel_id": f.panel_id,
        "class": f.class_,
        "class_id": f.class_id,
        "severity": f.severity,
        "status": f.status,
        "occurrences": f.occurrences,
        "max_confidence": f.max_confidence,
        "first_seen_inspection_id": f.first_seen_inspection_id,
        "last_seen_inspection_id": f.last_seen_inspection_id,
        "first_seen_date": f.first_seen_date,
        "last_seen_date": f.last_seen_date,
        "last_bbox": json.loads(f.last_bbox) if f.last_bbox else None,
        "last_gps": json.loads(f.last_gps) if f.last_gps else None,
        "notes": f.notes,
        "comment_count": comment_count,
    }


def _serialize_comment(c: FaultComment) -> dict:
    return {
        "id": c.id,
        "fault_id": c.fault_id,
        "author": c.author,
        "body": c.body,
        "created_at": c.created_at.isoformat() if c.created_at else None,
    }


@app.get("/parks/{park_id}/faults")
def list_park_faults(park_id: str, status: str | None = None):
    """List tracked faults for a park, optionally filtered by status."""
    park_id = _validate_park_id(park_id)
    if status is not None and status not in _ALLOWED_FAULT_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Allowed: {', '.join(sorted(_ALLOWED_FAULT_STATUSES))}",
        )
    session = get_session()
    try:
        q = session.query(PanelFault).filter(PanelFault.park_id == park_id)
        if status:
            q = q.filter(PanelFault.status == status)
        # Worst severity first, then most-recently-seen.
        faults = q.order_by(
            PanelFault.severity.desc(), PanelFault.last_seen_date.desc()
        ).all()
        counts = {s: 0 for s in _ALLOWED_FAULT_STATUSES}
        for f in faults:
            if f.status in counts:
                counts[f.status] += 1
        from sqlalchemy import func
        comment_counts = dict(
            session.query(FaultComment.fault_id, func.count(FaultComment.id))
            .filter(FaultComment.fault_id.in_([f.id for f in faults]))
            .group_by(FaultComment.fault_id)
            .all()
        ) if faults else {}
        return {
            "park_id": park_id,
            "total": len(faults),
            "counts_by_status": counts,
            "faults": [_serialize_fault(f, comment_counts.get(f.id, 0)) for f in faults],
        }
    finally:
        session.close()


@app.patch("/faults/{fault_id}")
def update_fault(fault_id: int, payload: dict):
    """Update fault status (e.g. mark resolved) or append notes."""
    if fault_id <= 0:
        raise HTTPException(status_code=400, detail="fault_id must be positive")
    new_status = payload.get("status")
    notes = payload.get("notes")
    if new_status is not None and new_status not in _ALLOWED_FAULT_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Allowed: {', '.join(sorted(_ALLOWED_FAULT_STATUSES))}",
        )
    session = get_session()
    try:
        fault = session.query(PanelFault).filter_by(id=fault_id).first()
        if fault is None:
            raise HTTPException(status_code=404, detail="Fault not found")
        if new_status:
            fault.status = new_status
        if notes is not None:
            fault.notes = str(notes)[:2000]
        session.commit()
        return _serialize_fault(fault)
    finally:
        session.close()


@app.post("/faults/{fault_id}/comments", status_code=201)
def create_fault_comment(fault_id: int, body: dict):
    """Append a comment to a fault's thread."""
    if fault_id <= 0:
        raise HTTPException(status_code=400, detail="fault_id must be positive")
    comment_body = str(body.get("body", "")).strip()
    if not comment_body:
        raise HTTPException(status_code=400, detail="body is required")
    author = str(body.get("author", ""))[:128] if body.get("author") else None
    session = get_session()
    try:
        fault = session.query(PanelFault).filter_by(id=fault_id).first()
        if fault is None:
            raise HTTPException(status_code=404, detail="Fault not found")
        comment = FaultComment(
            fault_id=fault_id,
            author=author,
            body=comment_body[:4000],
        )
        session.add(comment)
        session.commit()
        session.refresh(comment)
        return JSONResponse(content=_serialize_comment(comment), status_code=201)
    finally:
        session.close()


@app.get("/faults/{fault_id}/comments")
def list_fault_comments(fault_id: int):
    """List all comments on a fault in chronological order."""
    if fault_id <= 0:
        raise HTTPException(status_code=400, detail="fault_id must be positive")
    session = get_session()
    try:
        comments = (
            session.query(FaultComment)
            .filter(FaultComment.fault_id == fault_id)
            .order_by(FaultComment.created_at.asc(), FaultComment.id.asc())
            .all()
        )
        return [_serialize_comment(c) for c in comments]
    finally:
        session.close()


def _serialize_mission_summary(m: Mission) -> dict:
    return {
        "id": m.id,
        "name": m.name,
        "park_id": m.park_id,
        "mission_type": m.mission_type,
        "camera_id": m.camera_id,
        "area_ha": m.area_ha,
        "image_count": m.image_count,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


def _serialize_mission_full(m: Mission) -> dict:
    return {
        **_serialize_mission_summary(m),
        "params": json.loads(m.params) if m.params else {},
        "polygon": json.loads(m.polygon) if m.polygon else [],
        "waypoints": json.loads(m.waypoints) if m.waypoints else [],
        "updated_at": m.updated_at.isoformat() if m.updated_at else None,
    }


@app.post("/missions", status_code=201)
def create_mission(payload: dict):
    """Save a planned mission."""
    name = str(payload.get("name", "")).strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    session = get_session()
    try:
        m = Mission(
            name=name[:200],
            park_id=(payload.get("park_id") or None),
            mission_type=payload.get("mission_type", "grid"),
            camera_id=payload.get("camera_id"),
            params=json.dumps(payload.get("params") or {}),
            polygon=json.dumps(payload.get("polygon") or []),
            waypoints=json.dumps(payload.get("waypoints") or []),
            area_ha=payload.get("area_ha"),
            image_count=payload.get("image_count"),
        )
        session.add(m)
        session.commit()
        session.refresh(m)
        return JSONResponse(content=_serialize_mission_summary(m), status_code=201)
    finally:
        session.close()


@app.get("/missions")
def list_missions(park_id: str | None = None):
    """List saved missions, optionally filtered by park_id. Excludes heavy waypoint payloads."""
    session = get_session()
    try:
        q = session.query(Mission)
        if park_id:
            q = q.filter(Mission.park_id == park_id)
        missions = q.order_by(Mission.created_at.desc()).all()
        return [_serialize_mission_summary(m) for m in missions]
    finally:
        session.close()


@app.get("/missions/{mission_id}")
def get_mission(mission_id: int):
    """Return one mission including its full waypoint path."""
    session = get_session()
    try:
        m = session.query(Mission).filter_by(id=mission_id).first()
        if m is None:
            raise HTTPException(status_code=404, detail="Mission not found")
        return _serialize_mission_full(m)
    finally:
        session.close()


@app.delete("/missions/{mission_id}", status_code=204)
def delete_mission(mission_id: int):
    """Delete a saved mission."""
    session = get_session()
    try:
        m = session.query(Mission).filter_by(id=mission_id).first()
        if m is None:
            raise HTTPException(status_code=404, detail="Mission not found")
        session.delete(m)
        session.commit()
        return Response(status_code=204)
    finally:
        session.close()


# ── Inventory & prototype tracking (spec: 2026-06-12-inventory-page-design) ──

def _assigned_qty(session, component_id: int, exclude_assignment_id: int | None = None) -> int:
    q = session.query(ComponentAssignment).filter(
        ComponentAssignment.component_id == component_id
    )
    if exclude_assignment_id is not None:
        q = q.filter(ComponentAssignment.id != exclude_assignment_id)
    return sum(a.qty or 0 for a in q.all())


def _serialize_component(c: InventoryComponent, assigned: int) -> dict:
    return {
        "id": c.id,
        "name": c.name,
        "category": c.category,
        "part_number": c.part_number,
        "vendor": c.vendor,
        "link": c.link,
        "unit_cost": c.unit_cost,
        "currency": c.currency,
        "qty_total": c.qty_total or 0,
        "qty_assigned": assigned,
        "qty_available": (c.qty_total or 0) - assigned,
        "specs": c.specs,
        "notes": c.notes,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


def _serialize_assignment(a: ComponentAssignment, component: InventoryComponent | None = None) -> dict:
    return {
        "id": a.id,
        "component_id": a.component_id,
        "prototype_id": a.prototype_id,
        "component_name": component.name if component else None,
        "component_category": component.category if component else None,
        "qty": a.qty or 0,
        "notes": a.notes,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


def _serialize_prototype(p: Prototype, assignments: list[dict]) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "status": p.status,
        "description": p.description,
        "notes": p.notes,
        "assignments": assignments,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


def _serialize_order(o: ComponentOrder) -> dict:
    return {
        "id": o.id,
        "component_id": o.component_id,
        "name": o.name,
        "qty": o.qty or 0,
        "est_unit_cost": o.est_unit_cost,
        "vendor": o.vendor,
        "link": o.link,
        "status": o.status,
        "needed_by": o.needed_by,
        "notes": o.notes,
        "created_at": o.created_at.isoformat() if o.created_at else None,
        "updated_at": o.updated_at.isoformat() if o.updated_at else None,
    }


def _clean_name(payload: dict, required: bool = True) -> str | None:
    name = str(payload.get("name") or "").strip()
    if not name and required:
        raise HTTPException(status_code=400, detail="name is required")
    return name[:200] or None


def _non_negative_int(payload: dict, key: str, default: int, minimum: int = 0) -> int:
    raw = payload.get(key, default)
    try:
        value = int(raw)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail=f"{key} must be an integer")
    if value < minimum:
        raise HTTPException(status_code=400, detail=f"{key} must be >= {minimum}")
    return value


@app.get("/inventory/components")
def list_inventory_components():
    """List all components with derived assigned/available quantities."""
    session = get_session()
    try:
        components = (
            session.query(InventoryComponent)
            .order_by(InventoryComponent.category.asc(), InventoryComponent.name.asc())
            .all()
        )
        return [_serialize_component(c, _assigned_qty(session, c.id)) for c in components]
    finally:
        session.close()


@app.post("/inventory/components", status_code=201)
def create_inventory_component(payload: dict):
    name = _clean_name(payload)
    category = str(payload.get("category") or "other")
    if category not in COMPONENT_CATEGORIES:
        raise HTTPException(status_code=400, detail=f"category must be one of {COMPONENT_CATEGORIES}")
    qty_total = _non_negative_int(payload, "qty_total", 0)
    session = get_session()
    try:
        c = InventoryComponent(
            name=name,
            category=category,
            part_number=payload.get("part_number"),
            vendor=payload.get("vendor"),
            link=payload.get("link"),
            unit_cost=payload.get("unit_cost"),
            currency=str(payload.get("currency") or "INR"),
            qty_total=qty_total,
            specs=payload.get("specs"),
            notes=payload.get("notes"),
        )
        session.add(c)
        session.commit()
        session.refresh(c)
        return JSONResponse(content=_serialize_component(c, 0), status_code=201)
    finally:
        session.close()


@app.patch("/inventory/components/{component_id}")
def update_inventory_component(component_id: int, payload: dict):
    session = get_session()
    try:
        c = session.query(InventoryComponent).filter_by(id=component_id).first()
        if c is None:
            raise HTTPException(status_code=404, detail="Component not found")
        if "name" in payload:
            c.name = _clean_name(payload)
        if "category" in payload:
            category = str(payload.get("category") or "other")
            if category not in COMPONENT_CATEGORIES:
                raise HTTPException(status_code=400, detail=f"category must be one of {COMPONENT_CATEGORIES}")
            c.category = category
        if "qty_total" in payload:
            c.qty_total = _non_negative_int(payload, "qty_total", 0)
        for field in ("part_number", "vendor", "link", "unit_cost", "currency", "specs", "notes"):
            if field in payload:
                setattr(c, field, payload[field])
        session.commit()
        session.refresh(c)
        return _serialize_component(c, _assigned_qty(session, c.id))
    finally:
        session.close()


@app.delete("/inventory/components/{component_id}", status_code=204)
def delete_inventory_component(component_id: int):
    session = get_session()
    try:
        c = session.query(InventoryComponent).filter_by(id=component_id).first()
        if c is None:
            raise HTTPException(status_code=404, detail="Component not found")
        in_use = (
            session.query(ComponentAssignment)
            .filter(ComponentAssignment.component_id == component_id)
            .count()
        )
        if in_use:
            raise HTTPException(
                status_code=409,
                detail="Component is assigned to a prototype — unassign it first",
            )
        session.delete(c)
        session.commit()
        return Response(status_code=204)
    finally:
        session.close()


@app.get("/inventory/prototypes")
def list_prototypes():
    """List prototypes, each embedding its BOM (assignments + component names)."""
    session = get_session()
    try:
        protos = session.query(Prototype).order_by(Prototype.created_at.desc()).all()
        out = []
        for p in protos:
            rows = (
                session.query(ComponentAssignment, InventoryComponent)
                .join(InventoryComponent, ComponentAssignment.component_id == InventoryComponent.id)
                .filter(ComponentAssignment.prototype_id == p.id)
                .order_by(ComponentAssignment.created_at.asc())
                .all()
            )
            out.append(_serialize_prototype(p, [_serialize_assignment(a, c) for a, c in rows]))
        return out
    finally:
        session.close()


@app.post("/inventory/prototypes", status_code=201)
def create_prototype(payload: dict):
    name = _clean_name(payload)
    status = str(payload.get("status") or "planning")
    if status not in PROTOTYPE_STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of {PROTOTYPE_STATUSES}")
    session = get_session()
    try:
        p = Prototype(
            name=name,
            status=status,
            description=payload.get("description"),
            notes=payload.get("notes"),
        )
        session.add(p)
        session.commit()
        session.refresh(p)
        return JSONResponse(content=_serialize_prototype(p, []), status_code=201)
    finally:
        session.close()


@app.patch("/inventory/prototypes/{prototype_id}")
def update_prototype(prototype_id: int, payload: dict):
    session = get_session()
    try:
        p = session.query(Prototype).filter_by(id=prototype_id).first()
        if p is None:
            raise HTTPException(status_code=404, detail="Prototype not found")
        if "name" in payload:
            p.name = _clean_name(payload)
        if "status" in payload:
            status = str(payload.get("status") or "")
            if status not in PROTOTYPE_STATUSES:
                raise HTTPException(status_code=400, detail=f"status must be one of {PROTOTYPE_STATUSES}")
            p.status = status
        for field in ("description", "notes"):
            if field in payload:
                setattr(p, field, payload[field])
        session.commit()
        session.refresh(p)
        rows = (
            session.query(ComponentAssignment, InventoryComponent)
            .join(InventoryComponent, ComponentAssignment.component_id == InventoryComponent.id)
            .filter(ComponentAssignment.prototype_id == p.id)
            .all()
        )
        return _serialize_prototype(p, [_serialize_assignment(a, c) for a, c in rows])
    finally:
        session.close()


@app.delete("/inventory/prototypes/{prototype_id}", status_code=204)
def delete_prototype(prototype_id: int):
    """Delete a prototype and its assignments (frees the assigned stock)."""
    session = get_session()
    try:
        p = session.query(Prototype).filter_by(id=prototype_id).first()
        if p is None:
            raise HTTPException(status_code=404, detail="Prototype not found")
        session.query(ComponentAssignment).filter(
            ComponentAssignment.prototype_id == prototype_id
        ).delete(synchronize_session=False)
        session.delete(p)
        session.commit()
        return Response(status_code=204)
    finally:
        session.close()


@app.post("/inventory/assignments", status_code=201)
def create_assignment(payload: dict):
    """Install qty units of a component into a prototype — bounded by availability."""
    component_id = _non_negative_int(payload, "component_id", 0, minimum=1)
    prototype_id = _non_negative_int(payload, "prototype_id", 0, minimum=1)
    qty = _non_negative_int(payload, "qty", 1, minimum=1)
    session = get_session()
    try:
        c = session.query(InventoryComponent).filter_by(id=component_id).first()
        if c is None:
            raise HTTPException(status_code=404, detail="Component not found")
        p = session.query(Prototype).filter_by(id=prototype_id).first()
        if p is None:
            raise HTTPException(status_code=404, detail="Prototype not found")
        available = (c.qty_total or 0) - _assigned_qty(session, component_id)
        if qty > available:
            raise HTTPException(
                status_code=400,
                detail=f"Only {available} unit(s) of '{c.name}' available",
            )
        a = ComponentAssignment(
            component_id=component_id,
            prototype_id=prototype_id,
            qty=qty,
            notes=payload.get("notes"),
        )
        session.add(a)
        session.commit()
        session.refresh(a)
        return JSONResponse(content=_serialize_assignment(a, c), status_code=201)
    finally:
        session.close()


@app.patch("/inventory/assignments/{assignment_id}")
def update_assignment(assignment_id: int, payload: dict):
    session = get_session()
    try:
        a = session.query(ComponentAssignment).filter_by(id=assignment_id).first()
        if a is None:
            raise HTTPException(status_code=404, detail="Assignment not found")
        c = session.query(InventoryComponent).filter_by(id=a.component_id).first()
        if "qty" in payload:
            qty = _non_negative_int(payload, "qty", 1, minimum=1)
            available = (c.qty_total or 0) - _assigned_qty(
                session, a.component_id, exclude_assignment_id=a.id
            )
            if qty > available:
                raise HTTPException(
                    status_code=400,
                    detail=f"Only {available} unit(s) of '{c.name}' available",
                )
            a.qty = qty
        if "notes" in payload:
            a.notes = payload["notes"]
        session.commit()
        session.refresh(a)
        return _serialize_assignment(a, c)
    finally:
        session.close()


@app.delete("/inventory/assignments/{assignment_id}", status_code=204)
def delete_assignment(assignment_id: int):
    session = get_session()
    try:
        a = session.query(ComponentAssignment).filter_by(id=assignment_id).first()
        if a is None:
            raise HTTPException(status_code=404, detail="Assignment not found")
        session.delete(a)
        session.commit()
        return Response(status_code=204)
    finally:
        session.close()


@app.get("/inventory/orders")
def list_orders():
    session = get_session()
    try:
        orders = session.query(ComponentOrder).order_by(ComponentOrder.created_at.desc()).all()
        return [_serialize_order(o) for o in orders]
    finally:
        session.close()


@app.post("/inventory/orders", status_code=201)
def create_order(payload: dict):
    status = str(payload.get("status") or "planned")
    if status not in ORDER_STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of {ORDER_STATUSES}")
    qty = _non_negative_int(payload, "qty", 1, minimum=1)
    session = get_session()
    try:
        component_id = payload.get("component_id")
        name = _clean_name(payload, required=False)
        if component_id is not None:
            c = session.query(InventoryComponent).filter_by(id=int(component_id)).first()
            if c is None:
                raise HTTPException(status_code=404, detail="Component not found")
            name = name or c.name
        if not name:
            raise HTTPException(status_code=400, detail="name or component_id is required")
        o = ComponentOrder(
            component_id=component_id,
            name=name,
            qty=qty,
            est_unit_cost=payload.get("est_unit_cost"),
            vendor=payload.get("vendor"),
            link=payload.get("link"),
            status=status,
            needed_by=payload.get("needed_by"),
            notes=payload.get("notes"),
        )
        session.add(o)
        session.commit()
        session.refresh(o)
        return JSONResponse(content=_serialize_order(o), status_code=201)
    finally:
        session.close()


@app.patch("/inventory/orders/{order_id}")
def update_order(order_id: int, payload: dict):
    """Update an order. Transitioning to 'received' on a linked order stocks-in qty."""
    session = get_session()
    try:
        o = session.query(ComponentOrder).filter_by(id=order_id).first()
        if o is None:
            raise HTTPException(status_code=404, detail="Order not found")
        if "status" in payload:
            status = str(payload.get("status") or "")
            if status not in ORDER_STATUSES:
                raise HTTPException(status_code=400, detail=f"status must be one of {ORDER_STATUSES}")
            if status == "received" and o.status != "received" and o.component_id:
                c = session.query(InventoryComponent).filter_by(id=o.component_id).first()
                if c is not None:
                    c.qty_total = (c.qty_total or 0) + (o.qty or 0)
            o.status = status
        if "name" in payload:
            o.name = _clean_name(payload)
        if "qty" in payload:
            o.qty = _non_negative_int(payload, "qty", 1, minimum=1)
        for field in ("est_unit_cost", "vendor", "link", "needed_by", "notes"):
            if field in payload:
                setattr(o, field, payload[field])
        session.commit()
        session.refresh(o)
        return _serialize_order(o)
    finally:
        session.close()


@app.delete("/inventory/orders/{order_id}", status_code=204)
def delete_order(order_id: int):
    session = get_session()
    try:
        o = session.query(ComponentOrder).filter_by(id=order_id).first()
        if o is None:
            raise HTTPException(status_code=404, detail="Order not found")
        session.delete(o)
        session.commit()
        return Response(status_code=204)
    finally:
        session.close()


@app.get("/inventory/summary")
def inventory_summary():
    """Headline numbers for the Inventory tab."""
    session = get_session()
    try:
        components = session.query(InventoryComponent).all()
        low_stock = []
        stock_value = 0.0
        for c in components:
            assigned = _assigned_qty(session, c.id)
            available = (c.qty_total or 0) - assigned
            stock_value += (c.unit_cost or 0.0) * (c.qty_total or 0)
            if available < 1:
                low_stock.append(_serialize_component(c, assigned))
        open_orders = (
            session.query(ComponentOrder)
            .filter(ComponentOrder.status.in_(("planned", "ordered")))
            .count()
        )
        return {
            "component_count": len(components),
            "prototype_count": session.query(Prototype).count(),
            "open_order_count": open_orders,
            "stock_value": stock_value,
            "low_stock": low_stock,
        }
    finally:
        session.close()


# ── Area C: Projects → Sites (parks) → Missions/Inspections ──────────────────

def _serialize_project(p: Project) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "client": p.client,
        "description": p.description,
        "status": p.status,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "updated_at": p.updated_at.isoformat() if p.updated_at else None,
    }


def _project_sites(session, project_id: int) -> list[dict]:
    sites = []
    parks = session.query(Park).filter(Park.project_id == project_id).order_by(Park.id.asc()).all()
    for park in parks:
        inspections = (
            session.query(Inspection)
            .filter(Inspection.park_id == park.id)
            .order_by(Inspection.flight_date.desc())
            .all()
        )
        mission_count = session.query(Mission).filter(Mission.park_id == park.id).count()
        sites.append({
            "id": park.id,
            "name": park.name,
            "total_panels": park.total_panels,
            "inspection_count": len(inspections),
            "mission_count": mission_count,
            "last_inspection_date": inspections[0].flight_date if inspections else None,
        })
    return sites


@app.get("/projects")
def list_projects():
    session = get_session()
    try:
        projects = session.query(Project).order_by(Project.created_at.desc()).all()
        out = []
        for p in projects:
            row = _serialize_project(p)
            row["site_count"] = session.query(Park).filter(Park.project_id == p.id).count()
            out.append(row)
        return out
    finally:
        session.close()


@app.post("/projects", status_code=201)
def create_project(payload: dict):
    name = str(payload.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required")
    status = str(payload.get("status") or "active")
    if status not in PROJECT_STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of {PROJECT_STATUSES}")
    session = get_session()
    try:
        p = Project(
            name=name[:200],
            client=payload.get("client"),
            description=payload.get("description"),
            status=status,
        )
        session.add(p)
        session.commit()
        session.refresh(p)
        return JSONResponse(content=_serialize_project(p), status_code=201)
    finally:
        session.close()


@app.get("/projects/{project_id}")
def get_project(project_id: int):
    """Project detail with its sites (parks) and per-site mission/inspection counts."""
    session = get_session()
    try:
        p = session.query(Project).filter_by(id=project_id).first()
        if p is None:
            raise HTTPException(status_code=404, detail="Project not found")
        detail = _serialize_project(p)
        detail["sites"] = _project_sites(session, p.id)
        return detail
    finally:
        session.close()


@app.patch("/projects/{project_id}")
def update_project(project_id: int, payload: dict):
    session = get_session()
    try:
        p = session.query(Project).filter_by(id=project_id).first()
        if p is None:
            raise HTTPException(status_code=404, detail="Project not found")
        if "name" in payload:
            name = str(payload.get("name") or "").strip()
            if not name:
                raise HTTPException(status_code=400, detail="name is required")
            p.name = name[:200]
        if "status" in payload:
            status = str(payload.get("status") or "")
            if status not in PROJECT_STATUSES:
                raise HTTPException(status_code=400, detail=f"status must be one of {PROJECT_STATUSES}")
            p.status = status
        for field in ("client", "description"):
            if field in payload:
                setattr(p, field, payload[field])
        session.commit()
        session.refresh(p)
        return _serialize_project(p)
    finally:
        session.close()


@app.delete("/projects/{project_id}", status_code=204)
def delete_project(project_id: int):
    """Delete a project; its parks remain but are unassigned."""
    session = get_session()
    try:
        p = session.query(Project).filter_by(id=project_id).first()
        if p is None:
            raise HTTPException(status_code=404, detail="Project not found")
        session.query(Park).filter(Park.project_id == project_id).update(
            {Park.project_id: None}, synchronize_session=False
        )
        session.delete(p)
        session.commit()
        return Response(status_code=204)
    finally:
        session.close()


@app.patch("/park/{park_id}")
def update_park(park_id: str, payload: dict):
    """Assign/unassign a park to a project (and rename)."""
    park_id = _validate_park_id(park_id)
    session = get_session()
    try:
        park = session.query(Park).filter_by(id=park_id).first()
        if park is None:
            raise HTTPException(status_code=404, detail=f"Park {park_id!r} not found")
        if "project_id" in payload:
            project_id = payload.get("project_id")
            if project_id is not None:
                proj = session.query(Project).filter_by(id=int(project_id)).first()
                if proj is None:
                    raise HTTPException(status_code=404, detail="Project not found")
            park.project_id = project_id
        if "name" in payload:
            name = str(payload.get("name") or "").strip()
            if name:
                park.name = name[:200]
        session.commit()
        session.refresh(park)
        return {
            "id": park.id,
            "name": park.name,
            "project_id": park.project_id,
            "total_panels": park.total_panels,
        }
    finally:
        session.close()


@app.get("/analytics/overview")
def analytics_overview():
    """All parks with their severity trends in ONE call — replaces the
    frontend's per-park /park/{id}/trend fan-out on the Overview tab."""
    from sqlalchemy import text
    from axalon.park.trend import build_trend

    session = get_session()
    try:
        parks = session.query(Park).order_by(Park.id.asc()).all()
        if not parks:
            return []
        rows = session.execute(
            text("""
                SELECT i.park_id,
                       i.id,
                       i.flight_date,
                       SUM(CASE WHEN d.severity = 'CRITICAL' THEN 1 ELSE 0 END) AS critical_count,
                       SUM(CASE WHEN d.severity = 'HIGH'     THEN 1 ELSE 0 END) AS high_count,
                       SUM(CASE WHEN d.severity = 'MEDIUM'   THEN 1 ELSE 0 END) AS medium_count,
                       SUM(CASE WHEN d.severity = 'LOW'      THEN 1 ELSE 0 END) AS low_count
                FROM inspections i
                LEFT JOIN detections d ON d.inspection_id = i.id
                GROUP BY i.park_id, i.id, i.flight_date
            """)
        ).fetchall()
        rows_by_park: dict[str, list] = {}
        for row in rows:
            rows_by_park.setdefault(row.park_id, []).append(row)
        return [
            {
                "park": {"id": p.id, "name": p.name},
                "trend": build_trend(rows_by_park.get(p.id, [])),
            }
            for p in parks
        ]
    finally:
        session.close()


# ── /track workspace: login, notes, file library ─────────────────────────────

TRACK_FILES_DIR = OUTPUT_DIR / "track_files"
TRACK_FILES_DIR.mkdir(parents=True, exist_ok=True)

# Reference docs and CAD only — no executables/scripts.
_TRACK_ALLOWED_EXTENSIONS = {
    ".stl", ".step", ".stp", ".obj", ".3mf", ".dxf", ".f3d", ".fcstd",
    ".pdf", ".md", ".txt", ".csv", ".xlsx", ".docx",
    ".png", ".jpg", ".jpeg", ".webp", ".svg",
    ".zip", ".json", ".yaml", ".yml",
}
_MAX_TRACK_FILE_BYTES = 200 * 1024 * 1024  # 200 MB — STL meshes can be large


@app.post("/track/login")
def track_login(payload: dict):
    """Verify the /track workspace password. Checks the AXALON_TRACK_PASSWORD env
    override first, then the hash stored in the Supabase `app_config` table.
    The password is never shipped to the frontend bundle."""
    supplied = str(payload.get("password") or "")
    session = get_session()
    try:
        outcome = verify_track_password(session, supplied)
    finally:
        session.close()
    if outcome == APP_CONFIG_UNCONFIGURED:
        raise HTTPException(status_code=503, detail="Track workspace password not set up yet")
    if outcome != APP_CONFIG_OK:
        raise HTTPException(status_code=401, detail="Wrong password")
    return {"ok": True}


@app.post("/track/password")
def set_track_workspace_password(payload: dict):
    """Set/rotate the /track password (stored hashed in Supabase). Requires the
    current password unless none is configured yet (first-time setup)."""
    new_password = str(payload.get("new_password") or "")
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    session = get_session()
    try:
        current = verify_track_password(session, str(payload.get("current_password") or ""))
        if current == APP_CONFIG_WRONG:
            raise HTTPException(status_code=401, detail="Current password is wrong")
        # current == OK or UNCONFIGURED (first-time) both allowed to proceed
        set_track_password(session, new_password)
    finally:
        session.close()
    return {"ok": True}


def _serialize_note(n: TrackNote) -> dict:
    return {
        "id": n.id,
        "title": n.title,
        "kind": n.kind,
        "body": n.body,
        "url": n.url,
        "tags": n.tags,
        "created_at": n.created_at.isoformat() if n.created_at else None,
        "updated_at": n.updated_at.isoformat() if n.updated_at else None,
    }


@app.get("/track/notes")
def list_track_notes(kind: str | None = None):
    session = get_session()
    try:
        q = session.query(TrackNote)
        if kind:
            q = q.filter(TrackNote.kind == kind)
        return [_serialize_note(n) for n in q.order_by(TrackNote.created_at.desc()).all()]
    finally:
        session.close()


@app.post("/track/notes", status_code=201)
def create_track_note(payload: dict):
    title = str(payload.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")
    kind = str(payload.get("kind") or "other")
    if kind not in NOTE_KINDS:
        raise HTTPException(status_code=400, detail=f"kind must be one of {NOTE_KINDS}")
    session = get_session()
    try:
        n = TrackNote(
            title=title[:200],
            kind=kind,
            body=payload.get("body"),
            url=payload.get("url"),
            tags=payload.get("tags"),
        )
        session.add(n)
        session.commit()
        session.refresh(n)
        return JSONResponse(content=_serialize_note(n), status_code=201)
    finally:
        session.close()


@app.patch("/track/notes/{note_id}")
def update_track_note(note_id: int, payload: dict):
    session = get_session()
    try:
        n = session.query(TrackNote).filter_by(id=note_id).first()
        if n is None:
            raise HTTPException(status_code=404, detail="Note not found")
        if "title" in payload:
            title = str(payload.get("title") or "").strip()
            if not title:
                raise HTTPException(status_code=400, detail="title is required")
            n.title = title[:200]
        if "kind" in payload:
            kind = str(payload.get("kind") or "")
            if kind not in NOTE_KINDS:
                raise HTTPException(status_code=400, detail=f"kind must be one of {NOTE_KINDS}")
            n.kind = kind
        for field in ("body", "url", "tags"):
            if field in payload:
                setattr(n, field, payload[field])
        session.commit()
        session.refresh(n)
        return _serialize_note(n)
    finally:
        session.close()


@app.delete("/track/notes/{note_id}", status_code=204)
def delete_track_note(note_id: int):
    session = get_session()
    try:
        n = session.query(TrackNote).filter_by(id=note_id).first()
        if n is None:
            raise HTTPException(status_code=404, detail="Note not found")
        session.delete(n)
        session.commit()
        return Response(status_code=204)
    finally:
        session.close()


def _serialize_track_file(f: TrackFile) -> dict:
    return {
        "id": f.id,
        "original_name": f.original_name,
        "stored_name": f.stored_name,
        "label": f.label,
        "content_type": f.content_type,
        "size_bytes": f.size_bytes,
        "created_at": f.created_at.isoformat() if f.created_at else None,
    }


@app.get("/track/files")
def list_track_files():
    session = get_session()
    try:
        files = session.query(TrackFile).order_by(TrackFile.created_at.desc()).all()
        return [_serialize_track_file(f) for f in files]
    finally:
        session.close()


@app.post("/track/files", status_code=201)
def upload_track_file(file: UploadFile = File(...), label: str = Form(None)):
    """Store a reference file (.stl, .pdf, datasheet, …) in the track library."""
    original = _safe_filename(file.filename, fallback="upload")
    ext = Path(original).suffix.lower()
    if ext not in _TRACK_ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{ext or 'unknown'}' not allowed",
        )
    stored_name = f"{uuid.uuid4().hex[:12]}_{original}"
    dest = TRACK_FILES_DIR / stored_name

    size = 0
    try:
        with open(dest, "wb") as out:
            while True:
                chunk = file.file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > _MAX_TRACK_FILE_BYTES:
                    raise HTTPException(status_code=413, detail="File exceeds 200 MB limit")
                out.write(chunk)
    except HTTPException:
        dest.unlink(missing_ok=True)
        raise
    except OSError as exc:
        dest.unlink(missing_ok=True)
        logger.error("track file write failed: %s", exc)
        raise HTTPException(status_code=500, detail="Could not store file")

    # Durable storage: push to Supabase Storage when configured (HF disk is
    # ephemeral); the local copy is only a staging buffer in that case.
    store = get_track_store()
    if store is not None:
        try:
            with open(dest, "rb") as staged:
                store.upload(stored_name, staged, file.content_type or "application/octet-stream")
        except RuntimeError as exc:
            dest.unlink(missing_ok=True)
            logger.error("track file object-store upload failed: %s", exc)
            raise HTTPException(status_code=502, detail="Object storage upload failed")
        dest.unlink(missing_ok=True)

    session = get_session()
    try:
        rec = TrackFile(
            original_name=original,
            stored_name=stored_name,
            label=(label or "").strip() or None,
            content_type=file.content_type,
            size_bytes=size,
        )
        session.add(rec)
        session.commit()
        session.refresh(rec)
        return JSONResponse(content=_serialize_track_file(rec), status_code=201)
    finally:
        session.close()


@app.get("/track/files/{file_id}")
def download_track_file(file_id: int):
    session = get_session()
    try:
        rec = session.query(TrackFile).filter_by(id=file_id).first()
        if rec is None:
            raise HTTPException(status_code=404, detail="File not found")
        media_type = rec.content_type or mimetypes.guess_type(rec.original_name)[0] or "application/octet-stream"
        disposition = {"Content-Disposition": f'attachment; filename="{rec.original_name}"'}

        store = get_track_store()
        if store is not None:
            chunks = store.download(rec.stored_name)
            if chunks is not None:
                return StreamingResponse(chunks, media_type=media_type, headers=disposition)
            # fall through: object may predate the storage move and live on disk

        path = TRACK_FILES_DIR / rec.stored_name
        if not path.exists():
            raise HTTPException(status_code=404, detail="File missing from storage")
        return FileResponse(path, media_type=media_type, filename=rec.original_name)
    finally:
        session.close()


@app.delete("/track/files/{file_id}", status_code=204)
def delete_track_file(file_id: int):
    session = get_session()
    try:
        rec = session.query(TrackFile).filter_by(id=file_id).first()
        if rec is None:
            raise HTTPException(status_code=404, detail="File not found")
        store = get_track_store()
        if store is not None:
            try:
                store.delete(rec.stored_name)
            except RuntimeError as exc:
                logger.error("track file object-store delete failed: %s", exc)
                raise HTTPException(status_code=502, detail="Object storage delete failed")
        (TRACK_FILES_DIR / rec.stored_name).unlink(missing_ok=True)
        session.delete(rec)
        session.commit()
        return Response(status_code=204)
    finally:
        session.close()


@app.get("/parks/{park_id}/inspections/{a}/diff/{b}")
def diff_inspections(park_id: str, a: str, b: str):
    """Compare two inspections of the same park.

    Returns three lists keyed by (panel_id, class):
      - new:        present in B, absent in A
      - recurring:  present in both
      - resolved:   present in A, absent in B
    """
    park_id = _validate_park_id(park_id)
    a = _validate_job_id(a)
    b = _validate_job_id(b)
    session = get_session()
    try:
        for insp_id in (a, b):
            if session.query(Inspection).filter_by(id=insp_id, park_id=park_id).first() is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"Inspection {insp_id} not found for park {park_id}",
                )

        def _keys(insp_id: str) -> set[tuple[str, str]]:
            rows = (
                session.query(DbDetection.panel_id, DbDetection.class_)
                .filter(DbDetection.inspection_id == insp_id)
                .distinct()
                .all()
            )
            return {(r[0] or "R?-C?", r[1] or "") for r in rows if r[1]}

        keys_a, keys_b = _keys(a), _keys(b)

        def _shape(keys: set[tuple[str, str]]) -> list[dict]:
            return [{"panel_id": p, "class": c} for p, c in sorted(keys)]

        return {
            "park_id": park_id,
            "from": a,
            "to": b,
            "new": _shape(keys_b - keys_a),
            "recurring": _shape(keys_a & keys_b),
            "resolved": _shape(keys_a - keys_b),
            "counts": {
                "new": len(keys_b - keys_a),
                "recurring": len(keys_a & keys_b),
                "resolved": len(keys_a - keys_b),
            },
        }
    finally:
        session.close()


@app.get("/health")
def health():
    try:
        session = get_session()
        try:
            park_count = session.query(Park).count()
            db_status = "ok"
        finally:
            session.close()
    except Exception:
        logger.exception("Health check DB query failed")
        park_count = 0
        db_status = "error"
    return {
        "status": "ok",
        "model": "YOLO11m",
        "weights": "ml/checkpoints/best.pt",
        "version": "1.0.0",
        "db": db_status,
        "parks_in_db": park_count,
    }
