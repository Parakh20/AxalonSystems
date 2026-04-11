"""
report.py — Generate PDF and Excel inspection reports.

PDF: Jinja2 HTML template → WeasyPrint → .pdf
Excel: openpyxl multi-sheet workbook → .xlsx
JSON: Compatible with existing output/inspection_report.json format
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from ml.src.utils import CANONICAL_CLASSES, SEVERITY_MAP, get_logger

logger = get_logger("axalon.reporting")

_TEMPLATES_DIR = Path(__file__).parent / "templates"


def generate_json_report(batch_result: dict, output_path: str | Path) -> Path:
    """Write inspection result as JSON (compatible with existing report format)."""
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(batch_result, indent=2, default=str))
    logger.info("JSON report saved: %s", output_path)
    return output_path


def generate_excel_report(batch_result: dict, output_path: str | Path) -> Path:
    """Generate multi-sheet Excel report from batch inspection result.

    Sheets:
        1. Summary    — severity counts + class breakdown
        2. Detections — full detection log
        3. Priority   — sorted by severity for maintenance team
        4. GPS        — anomaly coordinates for field navigation
    """
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment
    from openpyxl.utils import get_column_letter

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    wb = openpyxl.Workbook()

    # ── Sheet 1: Summary ──────────────────────────────────────────────────────
    ws_summary = wb.active
    ws_summary.title = "Summary"
    ws_summary.append(["Axalon Systems — Solar Inspection Report"])
    ws_summary.append(["Park ID", batch_result.get("park_id", "N/A")])
    ws_summary.append(["Flight Date", batch_result.get("flight_date", "N/A")])
    ws_summary.append(["Total Images", batch_result.get("total_images", 0)])
    ws_summary.append(["Total Detections", batch_result.get("total_detections", 0)])
    ws_summary.append([])
    ws_summary.append(["Severity", "Count"])
    for sev, count in batch_result.get("summary", {}).items():
        ws_summary.append([sev, count])

    # ── Sheet 2: All Detections ───────────────────────────────────────────────
    ws_det = wb.create_sheet("Detections")
    headers = ["Image ID", "Panel ID", "Anomaly Class", "Severity", "Confidence",
               "Bbox X1", "Bbox Y1", "Bbox X2", "Bbox Y2", "GPS Lat", "GPS Lon"]
    ws_det.append(headers)
    for h_col, header in enumerate(headers, start=1):
        ws_det.cell(row=1, column=h_col).font = Font(bold=True)

    for result in batch_result.get("results", []):
        for det in result.get("detections", []):
            bbox = det.get("bbox", [None, None, None, None])
            gps = det.get("gps") or det.get("detection_gps") or {}
            ws_det.append([
                result.get("image_id", ""),
                det.get("panel_id", "N/A"),
                det.get("class", ""),
                det.get("severity", ""),
                round(det.get("confidence", 0), 3),
                bbox[0], bbox[1], bbox[2], bbox[3],
                gps.get("lat", ""),
                gps.get("lon", ""),
            ])

    # ── Sheet 3: Priority List ────────────────────────────────────────────────
    ws_prio = wb.create_sheet("Priority")
    _SEV_ORDER = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    all_dets = []
    for result in batch_result.get("results", []):
        for det in result.get("detections", []):
            all_dets.append({**det, "image_id": result.get("image_id", "")})
    all_dets.sort(key=lambda d: (_SEV_ORDER.get(d.get("severity", "LOW"), 99), -d.get("confidence", 0)))

    ws_prio.append(["Priority", "Panel ID", "Anomaly", "Severity", "Confidence", "Image"])
    for i, det in enumerate(all_dets, start=1):
        ws_prio.append([
            i,
            det.get("panel_id", "N/A"),
            det.get("class", ""),
            det.get("severity", ""),
            round(det.get("confidence", 0), 3),
            det.get("image_id", ""),
        ])

    # ── Sheet 4: GPS Coordinates ──────────────────────────────────────────────
    ws_gps = wb.create_sheet("GPS")
    ws_gps.append(["Panel ID", "Anomaly", "Severity", "Latitude", "Longitude", "Image ID"])
    for result in batch_result.get("results", []):
        for det in result.get("detections", []):
            gps = det.get("gps") or det.get("detection_gps") or {}
            if gps:
                ws_gps.append([
                    det.get("panel_id", "N/A"),
                    det.get("class", ""),
                    det.get("severity", ""),
                    gps.get("lat", ""),
                    gps.get("lon", ""),
                    result.get("image_id", ""),
                ])

    wb.save(str(output_path))
    logger.info("Excel report saved: %s", output_path)
    return output_path


def generate_pdf_report(batch_result: dict, output_path: str | Path) -> Path:
    """Generate PDF inspection report using Jinja2 + WeasyPrint."""
    try:
        from jinja2 import Environment, FileSystemLoader
        from weasyprint import HTML
    except ImportError:
        logger.error("PDF requires: pip install jinja2 weasyprint")
        raise

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Prepare template data
    summary = batch_result.get("summary", {})
    all_detections = []
    for result in batch_result.get("results", []):
        for det in result.get("detections", []):
            all_detections.append({**det, "image_id": result.get("image_id", "")})

    _SEV_ORDER = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    all_detections.sort(key=lambda d: _SEV_ORDER.get(d.get("severity", "LOW"), 99))

    context = {
        "park_id": batch_result.get("park_id", "N/A"),
        "flight_date": batch_result.get("flight_date", "N/A"),
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        "total_images": batch_result.get("total_images", 0),
        "total_detections": batch_result.get("total_detections", 0),
        "summary": summary,
        "detections": all_detections[:100],  # cap for PDF readability
    }

    # Load and render template
    env = Environment(loader=FileSystemLoader(str(_TEMPLATES_DIR)))
    template = env.get_template("report.html")
    html_content = template.render(**context)

    HTML(string=html_content, base_url=str(_TEMPLATES_DIR)).write_pdf(str(output_path))
    logger.info("PDF report saved: %s", output_path)
    return output_path
