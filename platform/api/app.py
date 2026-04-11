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
import re
import tempfile
import uuid
import zipfile
from pathlib import Path

from fastapi import FastAPI, File, Form, UploadFile, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from axalon.pipeline.orchestrator import InspectionOrchestrator
from axalon.reporting.report import generate_json_report, generate_excel_report
from axalon.reporting.geojson_writer import write_geojson
from axalon.db.session import get_session
from axalon.db.models import Park, Inspection

logger = logging.getLogger("axalon.api")

# ── Constants ─────────────────────────────────────────────────────────────────

# Maximum sizes
_MAX_IMAGE_BYTES = 50 * 1024 * 1024   # 50 MB per image
_MAX_ZIP_BYTES   = 2 * 1024 * 1024 * 1024  # 2 GB per zip
_MAX_ZIP_MEMBERS = 10_000              # max files inside a zip
_MAX_PARK_ID_LEN = 64

# Allowed image extensions
_ALLOWED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".tiff", ".tif"}

# Safe job-ID pattern — prevents directory traversal via job_id path param
_JOB_ID_RE = re.compile(r"^[a-zA-Z0-9_\-]{1,80}$")

app = FastAPI(
    title="Axalon Solar Inspection API",
    version="1.0.0",
    description=(
        "Solar anomaly detection and panel localization for drone-captured "
        "thermal IR + RGB imagery. Powered by YOLOv8s (best.pt)."
    ),
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# Restrict to same-origin in production. Expand allow_origins for your
# specific dashboard domain if deploying API and dashboard on separate hosts.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8501", "http://127.0.0.1:8501"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# ── Shared state ──────────────────────────────────────────────────────────────
# In-memory job store — capped to prevent unbounded memory growth.
_JOBS: dict[str, dict] = {}
_JOBS_MAX = 500  # evict oldest entries beyond this limit

OUTPUT_DIR = Path("output")
OUTPUT_DIR.mkdir(exist_ok=True)

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


def _evict_old_jobs() -> None:
    """Keep _JOBS under _JOBS_MAX by removing the oldest completed entries."""
    if len(_JOBS) < _JOBS_MAX:
        return
    completed = [k for k, v in _JOBS.items() if v.get("status") in ("completed", "failed")]
    for k in completed[: len(_JOBS) - _JOBS_MAX + 1]:
        _JOBS.pop(k, None)


# ── POST /inspect ─────────────────────────────────────────────────────────────

@app.post("/inspect")
async def inspect_pair(
    thermal_image: UploadFile = File(..., description="Thermal IR image (JPEG/PNG/TIFF, max 50 MB)"),
    rgb_image: UploadFile | None = File(None, description="RGB image (optional)"),
    park_id: str = Form("unknown"),
    park_mode: str = Form("auto"),
    altitude_m: float = Form(40.0),
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

    _evict_old_jobs()
    _JOBS[result["job_id"]] = {**result, "status": "completed"}
    return JSONResponse(content={
        "job_id": result["job_id"],
        "status": "completed",
        "total_detections": result["total_detections"],
        "summary": result["summary"],
        "detections": result["detections"],
    })


# ── POST /batch ───────────────────────────────────────────────────────────────

@app.post("/batch", status_code=202)
async def inspect_batch(
    background_tasks: BackgroundTasks,
    images: UploadFile = File(..., description="ZIP archive of thermal+RGB image pairs (max 2 GB)"),
    park_id: str = Form("unknown"),
    park_mode: str = Form("auto"),
    altitude_m: float = Form(40.0),
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

    # Validate zip integrity before accepting
    try:
        import io
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            members = zf.namelist()
            if len(members) > _MAX_ZIP_MEMBERS:
                raise HTTPException(
                    status_code=400,
                    detail=f"ZIP contains too many files ({len(members)} > {_MAX_ZIP_MEMBERS})",
                )
    except zipfile.BadZipFile:
        raise HTTPException(status_code=400, detail="Uploaded file is not a valid ZIP archive")

    job_id = f"batch-{uuid.uuid4().hex[:8]}"
    tmp_zip = OUTPUT_DIR / f"{job_id}.zip"
    tmp_zip.write_bytes(zip_bytes)

    _evict_old_jobs()
    _JOBS[job_id] = {"status": "queued", "progress": 0.0, "processed": 0, "total": 0}

    background_tasks.add_task(_run_batch_job, job_id, tmp_zip, park_id, altitude_m)

    return {"job_id": job_id, "status": "queued",
            "message": "Batch job queued. Poll GET /status/{job_id} for progress."}


def _safe_extract_zip(zf: zipfile.ZipFile, extract_dir: Path) -> None:
    """Extract zip entries, rejecting any that would escape extract_dir (Zip Slip fix)."""
    for member in zf.infolist():
        # Resolve the target path and ensure it stays within extract_dir
        member_path = (extract_dir / member.filename).resolve()
        if not str(member_path).startswith(str(extract_dir.resolve()) + "/"):
            logger.warning("Rejected zip entry with path traversal: %s", member.filename)
            continue  # skip malicious entry
        zf.extract(member, str(extract_dir))


def _run_batch_job(job_id: str, zip_path: Path, park_id: str, altitude_m: float) -> None:
    extract_dir = OUTPUT_DIR / job_id
    extract_dir.mkdir(exist_ok=True)

    try:
        with zipfile.ZipFile(str(zip_path), "r") as zf:
            _safe_extract_zip(zf, extract_dir)
        zip_path.unlink(missing_ok=True)

        def progress_cb(processed: int, total: int) -> None:
            _JOBS[job_id].update({
                "processed": processed,
                "total": total,
                "progress": round(processed / total, 2),
                "status": "processing",
            })

        orch = get_orchestrator()
        result = orch.inspect_folder(
            folder=extract_dir, park_id=park_id,
            altitude_m=altitude_m, progress_callback=progress_cb,
        )
        generate_json_report(result, extract_dir / "inspection_report.json")
        generate_excel_report(result, extract_dir / "inspection_report.xlsx")
        write_geojson(result, extract_dir / "park_anomaly_map.geojson")

        _JOBS[job_id].update({**result, "status": "completed", "progress": 1.0})
    except Exception:
        logger.exception("Batch job %s failed", job_id)
        # Do NOT expose exception message to clients — log it, return generic error
        _JOBS[job_id]["status"] = "failed"
        _JOBS[job_id]["error"] = "Inspection failed. Check server logs for details."


# ── GET /status/{job_id} ──────────────────────────────────────────────────────

@app.get("/status/{job_id}")
def get_status(job_id: str):
    """Get the status and progress of an inspection job."""
    job_id = _validate_job_id(job_id)
    job = _JOBS.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "job_id": job_id,
        "status": job.get("status"),
        "progress": job.get("progress", 0.0),
        "processed": job.get("processed", 0),
        "total": job.get("total", 0),
        # Only expose error message if present — message is already sanitised
        **({"error": job["error"]} if "error" in job else {}),
    }


# ── GET /report/{job_id} ──────────────────────────────────────────────────────

# Whitelist of allowed report formats — prevents format param from being used
# to serve arbitrary files from the output directory.
_REPORT_FORMAT_MAP = {
    "json":    ("inspection_report.json",       "application/json"),
    "excel":   ("inspection_report.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    "geojson": ("park_anomaly_map.geojson",      "application/geo+json"),
}


@app.get("/report/{job_id}")
def download_report(job_id: str, format: str = "json"):
    """Download the inspection report in the requested format."""
    job_id = _validate_job_id(job_id)

    job = _JOBS.get(job_id)
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

    # Final safety: ensure path is still inside OUTPUT_DIR
    if not str(report_path).startswith(str(OUTPUT_DIR.resolve())):
        raise HTTPException(status_code=403, detail="Access denied")

    if not report_path.exists():
        raise HTTPException(status_code=404, detail=f"Report not yet generated for format: {format}")

    return FileResponse(path=str(report_path), filename=filename, media_type=media_type)


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
                }
                for insp in inspections
            ],
        }
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
        "model": "YOLOv8s",
        "weights": "ml/checkpoints/best.pt",
        "version": "1.0.0",
        "db": db_status,
        "parks_in_db": park_count,
    }
