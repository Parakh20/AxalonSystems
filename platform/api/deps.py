"""deps.py — shared imports, constants, and helpers for the API routers.

Auto-extracted from the original monolithic app.py (Plan 01, move-only).
Everything here is re-exported via __all__ so routers can `from axalon.api.deps import *`.
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

from axalon.api.serializers import *  # noqa: F401,F403


logger = logging.getLogger("axalon.api")


_MAX_IMAGE_BYTES = 50 * 1024 * 1024   # 50 MB per image


_MAX_ZIP_BYTES   = 2 * 1024 * 1024 * 1024  # 2 GB per zip (compressed)


_MAX_ZIP_UNCOMPRESSED_BYTES = 8 * 1024 * 1024 * 1024  # 8 GB cap on extracted size — blocks zip-bombs


_MAX_ZIP_RATIO   = 200                 # max compressed→uncompressed ratio per member


_MAX_ZIP_MEMBERS = 10_000              # max files inside a zip


_MAX_PARK_ID_LEN = 64


_ALLOWED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".tiff", ".tif"}


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


OUTPUT_DIR = Path(os.getenv("AXALON_OUTPUT_DIR", "output"))


OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


ORTHO_DIR = OUTPUT_DIR / "ortho"


ORTHO_DIR.mkdir(parents=True, exist_ok=True)


_MAX_ORTHO_BYTES = 4 * 1024 * 1024 * 1024


_ORTHO_NAME_RE = re.compile(r"^[a-zA-Z0-9_\-]{1,80}\.(tif|tiff)$", re.IGNORECASE)


_detector: InspectionOrchestrator | None = None


def get_orchestrator() -> InspectionOrchestrator:
    global _detector
    if _detector is None:
        _detector = InspectionOrchestrator(output_dir=OUTPUT_DIR)
    return _detector


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


_ZIP_EXTRACT_TIMEOUT_S = 300


def _safe_extract_zip_with_timeout(
    zf: zipfile.ZipFile, extract_dir: Path, timeout_s: int = _ZIP_EXTRACT_TIMEOUT_S
) -> None:
    """Run _safe_extract_zip under a SIGALRM watchdog (Unix-only).

    Batch jobs run in a worker thread via BackgroundTasks, but extraction itself
    has no inner bound — this caps it so a pathological ZIP raises TimeoutError
    instead of stalling indefinitely. SIGALRM only fires on the main thread; when
    it isn't available (non-main thread or non-Unix) we fall back to a plain call.
    """
    import signal

    try:
        def _handler(_signum, _frame):
            raise TimeoutError(f"ZIP extraction exceeded {timeout_s}s")

        old = signal.signal(signal.SIGALRM, _handler)
    except (ValueError, AttributeError):
        # Not the main thread, or SIGALRM unavailable — extract without the watchdog.
        _safe_extract_zip(zf, extract_dir)
        return

    signal.alarm(timeout_s)
    try:
        _safe_extract_zip(zf, extract_dir)
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, old)


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
            _safe_extract_zip_with_timeout(zf, extract_dir)
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


_REPORT_FORMAT_MAP = {
    "pdf":     ("inspection_report.pdf",        "application/pdf"),
    "json":    ("inspection_report.json",       "application/json"),
    "excel":   ("inspection_report.xlsx",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    "geojson": ("park_anomaly_map.geojson",      "application/geo+json"),
}


_DEMO_ORIGIN_LAT = 27.5396


_DEMO_ORIGIN_LON = 71.9070


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


_IMAGE_SUFFIXES = ("_annotated.jpg", "_rgb_annotated.jpg")


_FILENAME_RE = re.compile(r"^[a-zA-Z0-9_\-.]{1,160}$")


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


_SETTINGS_PATH = Path(__file__).resolve().parents[1] / "config" / "settings.yaml"


_ALLOWED_FAULT_STATUSES = {FAULT_OPEN, FAULT_STALE, FAULT_RESOLVED}


TRACK_FILES_DIR = OUTPUT_DIR / "track_files"


TRACK_FILES_DIR.mkdir(parents=True, exist_ok=True)


_TRACK_ALLOWED_EXTENSIONS = {
    ".stl", ".step", ".stp", ".obj", ".3mf", ".dxf", ".f3d", ".fcstd",
    ".pdf", ".md", ".txt", ".csv", ".xlsx", ".docx",
    ".png", ".jpg", ".jpeg", ".webp", ".svg",
    ".zip", ".json", ".yaml", ".yml",
}


_MAX_TRACK_FILE_BYTES = 200 * 1024 * 1024  # 200 MB — STL meshes can be large


# Re-export everything for `from axalon.api.deps import *`
__all__ = [
    "APP_CONFIG_OK",
    "APP_CONFIG_UNCONFIGURED",
    "APP_CONFIG_WRONG",
    "BackgroundTasks",
    "COMPONENT_CATEGORIES",
    "CORSMiddleware",
    "ComponentAssignment",
    "ComponentOrder",
    "Correction",
    "DbDetection",
    "DbJob",
    "FAULT_OPEN",
    "FAULT_RESOLVED",
    "FAULT_STALE",
    "FastAPI",
    "FaultComment",
    "File",
    "FileResponse",
    "Form",
    "HTTPAuthorizationCredentials",
    "HTTPBearer",
    "HTTPException",
    "Inspection",
    "InspectionOrchestrator",
    "InventoryComponent",
    "JSONResponse",
    "Mission",
    "NOTE_KINDS",
    "ORDER_STATUSES",
    "ORTHO_DIR",
    "OUTPUT_DIR",
    "PROJECT_STATUSES",
    "PROTOTYPE_STATUSES",
    "PanelFault",
    "Park",
    "Path",
    "Project",
    "Prototype",
    "Response",
    "Security",
    "StreamingResponse",
    "TRACK_FILES_DIR",
    "TrackFile",
    "TrackNote",
    "UploadFile",
    "_ALLOWED_FAULT_STATUSES",
    "_ALLOWED_IMAGE_EXTS",
    "_DEMO_ORIGIN_LAT",
    "_DEMO_ORIGIN_LON",
    "_EMPTY_TILE_CACHE",
    "_FILENAME_RE",
    "_IMAGE_SUFFIXES",
    "_JOB_ID_RE",
    "_MAX_IMAGE_BYTES",
    "_MAX_ORTHO_BYTES",
    "_MAX_PARK_ID_LEN",
    "_MAX_TRACK_FILE_BYTES",
    "_MAX_ZIP_BYTES",
    "_MAX_ZIP_MEMBERS",
    "_MAX_ZIP_RATIO",
    "_MAX_ZIP_UNCOMPRESSED_BYTES",
    "_ORTHO_NAME_RE",
    "_REPORT_FORMAT_MAP",
    "_SETTINGS_PATH",
    "_SEVERITY_COLOR",
    "_TRACK_ALLOWED_EXTENSIONS",
    "_ZIP_EXTRACT_TIMEOUT_S",
    "_assigned_qty",
    "_bearer",
    "_check_iec_warnings",
    "_clean_name",
    "_cleanup_old_results",
    "_corrections_for_job",
    "_create_job",
    "_detector",
    "_empty_tile_png",
    "_get_job",
    "_is_unsafe_member",
    "_non_negative_int",
    "_ortho_metadata",
    "_ortho_path",
    "_project_sites",
    "_read_inspection_report",
    "_run_alembic_migrations",
    "_run_batch_job",
    "_safe_extract_zip",
    "_safe_extract_zip_with_timeout",
    "_safe_filename",
    "_serialize_assignment",
    "_serialize_comment",
    "_serialize_component",
    "_serialize_correction",
    "_serialize_fault",
    "_serialize_mission_full",
    "_serialize_mission_summary",
    "_serialize_note",
    "_serialize_order",
    "_serialize_project",
    "_serialize_prototype",
    "_serialize_track_file",
    "_state_from_status",
    "_synthetic_detection_gps",
    "_synthetic_image_gps",
    "_update_job",
    "_validate_job_id",
    "_validate_ortho_name",
    "_validate_park_id",
    "agents_router",
    "asynccontextmanager",
    "build_diff",
    "datetime",
    "generate_excel_report",
    "generate_json_report",
    "generate_pdf_report",
    "get_orchestrator",
    "get_session",
    "get_track_store",
    "json",
    "logger",
    "logging",
    "mimetypes",
    "os",
    "re",
    "require_auth",
    "set_track_password",
    "shutil",
    "stat",
    "tempfile",
    "timedelta",
    "uuid",
    "verify_track_password",
    "write_geojson",
    "zipfile",
]

