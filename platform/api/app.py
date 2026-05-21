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
import os
import re
import stat
import tempfile
import threading
import uuid
import zipfile
from pathlib import Path

from fastapi import FastAPI, File, Form, UploadFile, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response

from axalon.pipeline.orchestrator import InspectionOrchestrator
from axalon.reporting.report import (
    generate_excel_report,
    generate_json_report,
    generate_pdf_report,
)
from axalon.reporting.geojson_writer import write_geojson
from axalon.db.session import get_session
from axalon.db.models import Park, Inspection, PanelFault, Detection as DbDetection, FAULT_OPEN, FAULT_STALE, FAULT_RESOLVED

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

app = FastAPI(
    title="Axalon Solar Inspection API",
    version="1.0.0",
    description=(
        "Solar anomaly detection and panel localization for drone-captured "
        "thermal IR + RGB imagery. Powered by YOLOv8s (best.pt)."
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
]
_CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("AXALON_CORS_ORIGINS", "").split(",")
    if origin.strip()
] or _DEFAULT_CORS_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# ── Shared state ──────────────────────────────────────────────────────────────
# In-memory job store — capped to prevent unbounded memory growth.
# Lock guards concurrent writes from background tasks + request handlers.
_JOBS: dict[str, dict] = {}
_JOBS_LOCK = threading.Lock()
_JOBS_MAX = 500  # evict oldest entries beyond this limit

OUTPUT_DIR = Path("output")
OUTPUT_DIR.mkdir(exist_ok=True)

ORTHO_DIR = OUTPUT_DIR / "ortho"
ORTHO_DIR.mkdir(exist_ok=True)

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


def _evict_old_jobs() -> None:
    """Keep _JOBS under _JOBS_MAX by removing the oldest completed entries."""
    with _JOBS_LOCK:
        if len(_JOBS) < _JOBS_MAX:
            return
        completed = [k for k, v in _JOBS.items() if v.get("status") in ("completed", "failed")]
        for k in completed[: len(_JOBS) - _JOBS_MAX + 1]:
            _JOBS.pop(k, None)


def _set_job(job_id: str, data: dict) -> None:
    with _JOBS_LOCK:
        _JOBS[job_id] = data


def _update_job(job_id: str, **fields) -> None:
    with _JOBS_LOCK:
        if job_id in _JOBS:
            _JOBS[job_id].update(fields)


def _get_job(job_id: str) -> dict | None:
    with _JOBS_LOCK:
        job = _JOBS.get(job_id)
        return dict(job) if job is not None else None


# ── POST /inspect ─────────────────────────────────────────────────────────────

@app.post("/inspect")
async def inspect_pair(
    thermal_image: UploadFile = File(..., description="Thermal IR image (JPEG/PNG/TIFF, max 50 MB)"),
    rgb_image: UploadFile | None = File(None, description="RGB image (optional)"),
    park_id: str = Form("unknown"),
    park_mode: str = Form("auto"),
    altitude_m: float = Form(40.0),
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
        "site_name":       site_name or park_id,
        "client":          client,
        "location":        location,
        "capacity_mw":     capacity_mw,
        "lat":             lat,
        "lon":             lon,
        "irradiance_wm2":  irradiance_wm2,
        "inspection_time": inspection_time,
        "drone_model":     drone_model,
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
    _evict_old_jobs()
    _set_job(result["job_id"], {**result, "status": "completed"})
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
        "site_name":       site_name or park_id,
        "client":          client,
        "location":        location,
        "capacity_mw":     capacity_mw,
        "lat":             lat,
        "lon":             lon,
        "irradiance_wm2":  irradiance_wm2,
        "inspection_time": inspection_time,
        "drone_model":     drone_model,
    }

    job_id = f"batch-{uuid.uuid4().hex[:8]}"
    tmp_zip = OUTPUT_DIR / f"{job_id}.zip"
    tmp_zip.write_bytes(zip_bytes)

    _evict_old_jobs()
    _set_job(job_id, {"status": "queued", "progress": 0.0, "processed": 0, "total": 0})

    background_tasks.add_task(_run_batch_job, job_id, tmp_zip, park_id, altitude_m, site_meta)

    return {"job_id": job_id, "status": "queued",
            "message": "Batch job queued. Poll GET /status/{job_id} for progress."}


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
            _update_job(
                job_id,
                processed=processed,
                total=total,
                progress=round(processed / total, 2) if total else 0.0,
                status="processing",
            )

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
        )
        generate_json_report(result, extract_dir / "inspection_report.json")
        generate_excel_report(result, extract_dir / "inspection_report.xlsx", site_meta=site_meta)
        write_geojson(result, extract_dir / "park_anomaly_map.geojson")
        try:
            generate_pdf_report(result, extract_dir / "inspection_report.pdf", site_meta=site_meta)
        except Exception:
            logger.exception("PDF report generation failed for batch job %s", job_id)

        _update_job(job_id, **result, status="completed", progress=1.0)
    except Exception:
        logger.exception("Batch job %s failed", job_id)
        # Do NOT expose exception message to clients — log it, return generic error
        _update_job(
            job_id,
            status="failed",
            error="Inspection failed. Check server logs for details.",
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

    # Final safety: ensure path is still inside OUTPUT_DIR
    if not str(report_path).startswith(str(OUTPUT_DIR.resolve())):
        raise HTTPException(status_code=403, detail="Access denied")

    if not report_path.exists():
        raise HTTPException(status_code=404, detail=f"Report not yet generated for format: {format}")

    return FileResponse(path=str(report_path), filename=filename, media_type=media_type)


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


def _serialize_fault(f: PanelFault) -> dict:
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
        return {
            "park_id": park_id,
            "total": len(faults),
            "counts_by_status": counts,
            "faults": [_serialize_fault(f) for f in faults],
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
        "model": "YOLOv8s",
        "weights": "ml/checkpoints/best.pt",
        "version": "1.0.0",
        "db": db_status,
        "parks_in_db": park_count,
    }
