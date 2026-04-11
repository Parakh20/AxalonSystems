"""
dashboard.py — Streamlit web dashboard for solar inspection operators.

Run with:
    streamlit run axalon_platform/ui/dashboard.py

Pages:
    1. Inspect   — Upload thermal+RGB, view results instantly
    2. Batch     — Upload flight folder zip, track progress
    3. Park Map  — Visualize solar park grid with anomaly overlay
"""

from __future__ import annotations

import tempfile
from pathlib import Path

import cv2
import numpy as np
import streamlit as st

from ml.src.utils import SEVERITY_COLOR_BGR, draw_detections_severity, get_logger

from axalon.pipeline.orchestrator import InspectionOrchestrator
from axalon.reporting.report import generate_excel_report, generate_json_report
from axalon.reporting.geojson_writer import write_geojson

logger = get_logger("axalon.dashboard")

# ── App config ────────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Axalon Solar Inspection",
    page_icon="🛸",
    layout="wide",
)

# Severity badge colors (CSS)
_SEV_CSS = {
    "CRITICAL": "background:#ffdddd;color:#990000;padding:2px 8px;border-radius:4px;font-weight:bold;",
    "HIGH":     "background:#ffe8cc;color:#cc5500;padding:2px 8px;border-radius:4px;font-weight:bold;",
    "MEDIUM":   "background:#fffacc;color:#888800;padding:2px 8px;border-radius:4px;",
    "LOW":      "background:#e8f0ff;color:#003399;padding:2px 8px;border-radius:4px;",
}


@st.cache_resource
def get_orchestrator():
    return InspectionOrchestrator(output_dir="output")


def bgr_to_rgb(img: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)


# ── Sidebar navigation ────────────────────────────────────────────────────────
page = st.sidebar.selectbox(
    "Navigation",
    ["🔍 Inspect", "📦 Batch", "🗺️ Park Map", "📊 History"]
)
st.sidebar.markdown("---")
st.sidebar.markdown("**Model:** YOLOv8s `best.pt`")
st.sidebar.markdown("**Classes:** 11 anomaly types")

# ─────────────────────────────────────────────────────────────────────────────
# PAGE 1: SINGLE INSPECTION
# ─────────────────────────────────────────────────────────────────────────────
if page == "🔍 Inspect":
    st.title("🛸 Axalon Solar Inspection")
    st.caption("Upload a thermal IR image (and optionally an RGB image) to detect anomalies.")

    col1, col2 = st.columns(2)
    with col1:
        park_id = st.text_input("Park ID", value="SOLAR_PARK_01")
        altitude_m = st.number_input("Drone Altitude (m)", min_value=5.0, max_value=200.0, value=40.0)
    with col2:
        park_mode = st.selectbox("Park Mode", ["auto", "numbered", "unnumbered"])

    st.markdown("---")
    col_t, col_r = st.columns(2)
    with col_t:
        thermal_file = st.file_uploader("📷 Thermal IR Image", type=["jpg", "jpeg", "png"])
    with col_r:
        rgb_file = st.file_uploader("🌈 RGB Image (optional)", type=["jpg", "jpeg", "png"])

    if thermal_file and st.button("🚀 Run Inspection", type="primary"):
        with st.spinner("Running anomaly detection..."):
            with tempfile.TemporaryDirectory() as tmpdir:
                thermal_path = Path(tmpdir) / thermal_file.name
                thermal_path.write_bytes(thermal_file.read())

                rgb_path = None
                if rgb_file:
                    rgb_path = Path(tmpdir) / rgb_file.name
                    rgb_path.write_bytes(rgb_file.read())

                orch = get_orchestrator()
                result = orch.inspect_pair(
                    thermal_path=thermal_path,
                    rgb_path=rgb_path,
                    park_id=park_id,
                    altitude_m=altitude_m,
                )

        st.success(f"Detection complete — {result['total_detections']} anomalies found")

        # Summary badges
        summary = result["summary"]
        s_cols = st.columns(4)
        for i, (sev, count) in enumerate(summary.items()):
            s_cols[i].markdown(
                f"<div style='{_SEV_CSS[sev]}font-size:20px;text-align:center'>"
                f"<b>{count}</b><br><small>{sev}</small></div>",
                unsafe_allow_html=True
            )

        st.markdown("---")

        # Show annotated images
        im_cols = st.columns(2)
        if result.get("annotated_thermal"):
            ann = cv2.imread(result["annotated_thermal"])
            if ann is not None:
                im_cols[0].image(bgr_to_rgb(ann), caption="Thermal (annotated)", use_column_width=True)
        if result.get("annotated_rgb"):
            ann_rgb = cv2.imread(result["annotated_rgb"])
            if ann_rgb is not None:
                im_cols[1].image(bgr_to_rgb(ann_rgb), caption="RGB (overlay)", use_column_width=True)

        # Detection table
        if result["detections"]:
            st.markdown("### Detections")
            for det in sorted(result["detections"],
                              key=lambda d: {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}.get(d["severity"], 9)):
                badge = f"<span style='{_SEV_CSS[det['severity']]}'>{det['severity']}</span>"
                st.markdown(
                    f"{badge} &nbsp; **{det['class']}** &nbsp; "
                    f"conf: `{det['confidence']:.2f}` &nbsp; "
                    f"panel: `{det.get('panel_id', 'N/A')}`",
                    unsafe_allow_html=True
                )

        # Download buttons
        import json, io
        st.markdown("---")
        st.download_button(
            "⬇ Download JSON",
            data=json.dumps(result, indent=2, default=str).encode(),
            file_name=f"{result['job_id']}.json",
            mime="application/json",
        )

# ─────────────────────────────────────────────────────────────────────────────
# PAGE 2: BATCH
# ─────────────────────────────────────────────────────────────────────────────
elif page == "📦 Batch":
    st.title("📦 Batch Inspection")
    st.caption("Upload a ZIP archive of your flight folder (thermal/ + rgb/ subfolders).")

    park_id = st.text_input("Park ID", value="SOLAR_PARK_01")
    altitude_m = st.number_input("Altitude (m)", value=40.0)
    zip_file = st.file_uploader("Upload ZIP Archive", type=["zip"])

    if zip_file and st.button("🚀 Start Batch Inspection", type="primary"):
        import zipfile, io
        output_dir = Path("output") / f"batch_{park_id}"
        output_dir.mkdir(parents=True, exist_ok=True)

        with zipfile.ZipFile(io.BytesIO(zip_file.read())) as z:
            z.extractall(str(output_dir))

        orch = get_orchestrator()
        progress_bar = st.progress(0.0, text="Processing...")

        def progress_cb(processed, total):
            progress_bar.progress(processed / total, text=f"Processing {processed}/{total}")

        with st.spinner("Running batch inspection..."):
            result = orch.inspect_folder(
                folder=output_dir, park_id=park_id,
                altitude_m=altitude_m, progress_callback=progress_cb
            )

        progress_bar.progress(1.0, text="Complete!")
        st.success(f"Batch complete — {result['total_detections']} anomalies across {result['total_images']} images")
        st.json(result["summary"])

        # Save and offer download
        json_path = output_dir / "inspection_report.json"
        xlsx_path = output_dir / "inspection_report.xlsx"
        generate_json_report(result, json_path)
        generate_excel_report(result, xlsx_path)

        col1, col2 = st.columns(2)
        col1.download_button("⬇ JSON Report", json_path.read_bytes(), "inspection_report.json")
        col2.download_button("⬇ Excel Report", xlsx_path.read_bytes(), "inspection_report.xlsx")

# ─────────────────────────────────────────────────────────────────────────────
# PAGE 3: PARK MAP
# ─────────────────────────────────────────────────────────────────────────────
elif page == "🗺️ Park Map":
    st.title("🗺️ Solar Park Anomaly Map")
    st.caption("Upload an inspection_report.json to visualize anomalies on the park grid.")

    json_file = st.file_uploader("Upload inspection_report.json", type=["json"])
    if json_file:
        import json
        data = json.load(json_file)
        st.info(f"Park: {data.get('park_id')} | Detections: {data.get('total_detections')}")
        st.json(data.get("summary", {}))
        st.markdown("*Full park map visualization (grid overlay) — coming in Phase 5.*")

# ─────────────────────────────────────────────────────────────────────────────
# PAGE 4: HISTORY
# ─────────────────────────────────────────────────────────────────────────────
elif page == "📊 History":
    st.title("📊 Inspection History")
    st.info("Historical analysis across multiple flights — connect to database in Phase 5.")
