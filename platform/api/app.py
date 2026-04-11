"""
app.py — FastAPI REST application for Axalon Solar Inspection Platform.

Endpoints:
    POST /inspect          Single thermal+RGB pair inspection
    POST /batch            Batch folder inspection (background job)
    GET  /status/{job_id}  Job progress
    GET  /report/{job_id}  Download PDF/Excel/JSON/GeoJSON report
    GET  /results/{job_id}/{filename}  Serve annotated images
    GET  /park/{park_id}   Park inspection history summary

Run with:
    uvicorn axalon_platform.api.app:app --host 0.0.0.0 --port 8000
"""

from __future__ import annotations

import shutil
import tempfile
import uuid
from pathlib import Path

from fastapi import FastAPI, File, Form, UploadFile, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from axalon.pipeline.orchestrator import InspectionOrchestrator
from axalon.reporting.report import generate_json_report, generate_excel_report
from axalon.reporting.geojson_writer import write_geojson

app = FastAPI(
    title="Axalon Solar Inspection API",
    version="1.0.0",
    description=(
        "Solar anomaly detection and panel localization for drone-captured "
        "thermal IR + RGB imagery. Powered by YOLOv8s (best.pt)."
    ),
)

# In-memory job store (replace with DB for production)
_JOBS: dict[str, dict] = {}

OUTPUT_DIR = Path("output")
OUTPUT_DIR.mkdir(exist_ok=True)

# Serve annotated images
app.mount("/results", StaticFiles(directory=str(OUTPUT_DIR)), name="results")

_detector: InspectionOrchestrator | None = None


def get_orchestrator() -> InspectionOrchestrator:
    global _detector
    if _detector is None:
        _detector = InspectionOrchestrator(output_dir=OUTPUT_DIR)
    return _detector


# ── POST /inspect ─────────────────────────────────────────────────────────────

@app.post("/inspect")
async def inspect_pair(
    thermal_image: UploadFile = File(..., description="Thermal IR image (JPEG/PNG)"),
    rgb_image: UploadFile | None = File(None, description="RGB image (optional)"),
    park_id: str = Form("unknown"),
    park_mode: str = Form("auto"),
    altitude_m: float = Form(40.0),
):
    """Inspect a single thermal+RGB image pair."""
    with tempfile.TemporaryDirectory() as tmpdir:
        thermal_path = Path(tmpdir) / thermal_image.filename
        thermal_path.write_bytes(await thermal_image.read())

        rgb_path = None
        if rgb_image:
            rgb_path = Path(tmpdir) / rgb_image.filename
            rgb_path.write_bytes(await rgb_image.read())

        orch = get_orchestrator()
        result = orch.inspect_pair(
            thermal_path=thermal_path,
            rgb_path=rgb_path,
            park_id=park_id,
            altitude_m=altitude_m,
        )

    _JOBS[result["job_id"]] = {**result, "status": "completed"}
    return JSONResponse(content={
        "job_id": result["job_id"],
        "status": "completed",
        "total_detections": result["total_detections"],
        "summary": result["summary"],
        "detections": result["detections"],
        "processing_time_ms": 0,
    })


# ── POST /batch ───────────────────────────────────────────────────────────────

@app.post("/batch")
async def inspect_batch(
    background_tasks: BackgroundTasks,
    images: UploadFile = File(..., description="ZIP archive of thermal+RGB image pairs"),
    park_id: str = Form("unknown"),
    park_mode: str = Form("auto"),
    altitude_m: float = Form(40.0),
):
    """Submit a batch inspection job (runs in background)."""
    job_id = f"batch-{uuid.uuid4().hex[:8]}"
    _JOBS[job_id] = {"status": "queued", "progress": 0.0, "processed": 0, "total": 0}

    # Save zip to temp location
    tmp_zip = OUTPUT_DIR / f"{job_id}.zip"
    tmp_zip.write_bytes(await images.read())

    background_tasks.add_task(
        _run_batch_job, job_id, tmp_zip, park_id, altitude_m
    )

    return JSONResponse(status_code=202, content={
        "job_id": job_id,
        "status": "queued",
        "message": "Batch job queued. Poll GET /status/{job_id} for progress.",
    })


def _run_batch_job(job_id: str, zip_path: Path, park_id: str, altitude_m: float):
    import zipfile
    extract_dir = OUTPUT_DIR / job_id
    extract_dir.mkdir(exist_ok=True)

    with zipfile.ZipFile(str(zip_path), "r") as z:
        z.extractall(str(extract_dir))
    zip_path.unlink(missing_ok=True)

    def progress_cb(processed, total):
        _JOBS[job_id]["processed"] = processed
        _JOBS[job_id]["total"] = total
        _JOBS[job_id]["progress"] = round(processed / total, 2)
        _JOBS[job_id]["status"] = "processing"

    try:
        orch = get_orchestrator()
        result = orch.inspect_folder(
            folder=extract_dir, park_id=park_id,
            altitude_m=altitude_m, progress_callback=progress_cb
        )
        # Save reports
        generate_json_report(result, extract_dir / "inspection_report.json")
        generate_excel_report(result, extract_dir / "inspection_report.xlsx")
        write_geojson(result, extract_dir / "park_anomaly_map.geojson")

        _JOBS[job_id].update({**result, "status": "completed", "progress": 1.0})
    except Exception as e:
        _JOBS[job_id]["status"] = "failed"
        _JOBS[job_id]["error"] = str(e)


# ── GET /status/{job_id} ──────────────────────────────────────────────────────

@app.get("/status/{job_id}")
def get_status(job_id: str):
    """Get the status and progress of an inspection job."""
    job = _JOBS.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
    return {
        "job_id": job_id,
        "status": job.get("status"),
        "progress": job.get("progress", 0.0),
        "processed": job.get("processed", 0),
        "total": job.get("total", 0),
    }


# ── GET /report/{job_id} ──────────────────────────────────────────────────────

@app.get("/report/{job_id}")
def download_report(job_id: str, format: str = "json"):
    """Download the inspection report in the requested format."""
    job = _JOBS.get(job_id)
    if job is None or job.get("status") != "completed":
        raise HTTPException(status_code=404, detail="Job not found or not yet complete")

    job_dir = OUTPUT_DIR / job_id
    report_map = {
        "json":    job_dir / "inspection_report.json",
        "excel":   job_dir / "inspection_report.xlsx",
        "geojson": job_dir / "park_anomaly_map.geojson",
    }

    report_path = report_map.get(format)
    if report_path is None:
        raise HTTPException(status_code=400, detail=f"Unknown format: {format}. Use json|excel|geojson")
    if not report_path.exists():
        raise HTTPException(status_code=404, detail=f"Report not yet generated for format: {format}")

    return FileResponse(
        path=str(report_path),
        filename=report_path.name,
        media_type="application/octet-stream",
    )


# ── GET /park/{park_id} ───────────────────────────────────────────────────────

@app.get("/park/{park_id}")
def get_park_summary(park_id: str):
    """Get aggregated anomaly summary for a solar park across all inspections."""
    park_jobs = [j for j in _JOBS.values()
                 if j.get("park_id") == park_id and j.get("status") == "completed"]
    if not park_jobs:
        raise HTTPException(status_code=404, detail=f"No completed inspections for park: {park_id}")

    latest = sorted(park_jobs, key=lambda j: j.get("flight_date", ""), reverse=True)[0]
    return {
        "park_id": park_id,
        "total_inspections": len(park_jobs),
        "last_inspection": latest.get("flight_date"),
        "latest_summary": latest.get("summary", {}),
        "latest_total_detections": latest.get("total_detections", 0),
    }


@app.get("/health")
def health():
    return {"status": "ok", "model": "YOLOv8s best.pt"}
