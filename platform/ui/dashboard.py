"""
dashboard.py — Streamlit operator dashboard for Axalon Solar Inspection.

5 pages:
  📦 Batch     — PRIMARY: process entire flight folder, live progress, download reports
  🗺 Park Map  — PRIMARY: color-coded panel grid + anomaly detail on click
  🔍 Inspect   — Single thermal+RGB pair (debug/test)
  📋 History   — Past inspections per park, trend charts
  ⚙ Settings  — Model conf, drone altitude, camera params → settings.yaml
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

import cv2
import numpy as np
import streamlit as st
import yaml

from ml.src.utils import SEVERITY_COLOR_BGR, draw_detections_severity, get_logger
from axalon.pipeline.orchestrator import InspectionOrchestrator
from axalon.reporting.report import generate_excel_report, generate_pdf_report, generate_json_report
from axalon.reporting.geojson_writer import write_geojson
from axalon.db.session import get_engine, session_scope as get_session
from axalon.db.models import Park, Inspection, Detection

logger = get_logger("axalon.dashboard")

_SETTINGS_PATH = Path(__file__).resolve().parents[1] / "config" / "settings.yaml"

# ── App config ────────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Axalon Solar Inspection",
    page_icon="🛸",
    layout="wide",
    initial_sidebar_state="expanded",
)

_SEV_CSS = {
    "CRITICAL": "background:#ffdddd;color:#990000;padding:2px 8px;border-radius:4px;font-weight:bold;",
    "HIGH":     "background:#ffe8cc;color:#cc5500;padding:2px 8px;border-radius:4px;font-weight:bold;",
    "MEDIUM":   "background:#fffacc;color:#888800;padding:2px 8px;border-radius:4px;",
    "LOW":      "background:#e8f0ff;color:#003399;padding:2px 8px;border-radius:4px;",
}

_SEV_COLOR = {  # Streamlit-compatible hex colors for grid cells
    "CRITICAL": "#cc0000",
    "HIGH":     "#ff6600",
    "MEDIUM":   "#ccaa00",
    "LOW":      "#2255cc",
    "OK":       "#22aa44",
}


@st.cache_resource
def _get_orchestrator():
    return InspectionOrchestrator(output_dir="output")


@st.cache_resource
def _get_engine():
    return get_engine()


def _bgr_to_rgb(img: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)


def _sev_badge(severity: str) -> str:
    return f'<span style="{_SEV_CSS.get(severity, "")}">{severity}</span>'


# ── Sidebar navigation ────────────────────────────────────────────────────────
st.sidebar.image("https://placehold.co/200x60/1a1a2e/ffffff?text=Axalon+Systems", use_container_width=True)
page = st.sidebar.radio(
    "Navigation",
    ["📦 Batch", "🗺 Park Map", "🔍 Inspect", "📋 History", "⚙ Settings"],
    index=0,
)
st.sidebar.markdown("---")
st.sidebar.caption("Model: YOLOv8s `best.pt`  |  11 anomaly classes")


# =============================================================================
# PAGE: BATCH (PRIMARY)
# =============================================================================
if page == "📦 Batch":
    st.title("📦 Batch Park Inspection")
    st.caption("Process an entire flight folder. Thermal + RGB pairs are automatically detected.")

    col1, col2 = st.columns(2)
    with col1:
        park_id = st.text_input("Park ID", value="PARK_01", help="Identifier for this solar farm")
        folder_path = st.text_input(
            "Flight Folder Path",
            placeholder="/home/operator/missions/park01_flight_20260411",
            help="Full path to the folder containing thermal and RGB images",
        )
    with col2:
        altitude_m = st.number_input("Drone Altitude (m)", min_value=5.0, max_value=200.0, value=40.0)
        park_name = st.text_input("Park Display Name", value="", placeholder="Optional — uses Park ID if blank")

    run_btn = st.button("🚀 Start Batch Inspection", type="primary", disabled=not folder_path)

    if run_btn and folder_path:
        folder = Path(folder_path)
        if not folder.exists():
            st.error(f"Folder not found: `{folder_path}`")
        else:
            from axalon.pipeline.ingest import find_image_pairs
            pairs = find_image_pairs(folder)
            if not pairs:
                st.error("No thermal/RGB image pairs found in that folder. Check folder layout.")
            else:
                st.info(f"Found {len(pairs)} image pairs. Starting inspection...")

                progress_bar = st.progress(0.0)
                status_text = st.empty()

                orch = _get_orchestrator()

                if "batch_result" not in st.session_state:
                    st.session_state.batch_result = None

                def on_progress(processed: int, total: int):
                    frac = processed / total
                    progress_bar.progress(frac)
                    status_text.text(f"Processing image {processed}/{total}...")

                with st.spinner("Running inspection..."):
                    result = orch.inspect_folder(
                        folder=folder,
                        park_id=park_id,
                        altitude_m=altitude_m,
                        progress_callback=on_progress,
                    )
                st.session_state.batch_result = result
                progress_bar.progress(1.0)
                status_text.text("✅ Inspection complete!")

                # Summary metrics
                summary = result["summary"]
                c1, c2, c3, c4, c5 = st.columns(5)
                c1.metric("Images", result["total_images"])
                c2.metric("🔴 CRITICAL", summary.get("CRITICAL", 0))
                c3.metric("🟠 HIGH", summary.get("HIGH", 0))
                c4.metric("🟡 MEDIUM", summary.get("MEDIUM", 0))
                c5.metric("🔵 LOW", summary.get("LOW", 0))

                # Download section
                st.subheader("Download Reports")
                out_dir = Path("output") / result["batch_id"]
                out_dir.mkdir(parents=True, exist_ok=True)

                pdf_path = out_dir / "inspection_report.pdf"
                xlsx_path = out_dir / "inspection_report.xlsx"
                geojson_path = out_dir / "park_anomaly_map.geojson"
                json_path = out_dir / "inspection_report.json"

                generate_json_report(result, json_path)
                generate_excel_report(result, xlsx_path)
                write_geojson(result.get("all_detections", []), geojson_path)

                try:
                    generate_pdf_report(result, pdf_path)
                    with open(pdf_path, "rb") as f:
                        st.download_button("📄 Download PDF Report", f, file_name="inspection_report.pdf", mime="application/pdf")
                except Exception as e:
                    st.warning(f"PDF generation failed (WeasyPrint may need system libs): {e}")

                with open(xlsx_path, "rb") as f:
                    st.download_button("📊 Download Excel", f, file_name="inspection_report.xlsx",
                                       mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

                if geojson_path.exists():
                    with open(geojson_path) as f:
                        st.download_button("🗺 Download GeoJSON", f, file_name="park_anomaly_map.geojson", mime="application/json")


# =============================================================================
# PAGE: PARK MAP (PRIMARY)
# =============================================================================
elif page == "🗺 Park Map":
    st.title("🗺 Park Anomaly Map")
    st.caption("Color-coded grid view of detected anomalies across the solar park.")

    engine = _get_engine()

    with get_session(engine) as s:
        parks = s.query(Park).all()
        park_ids = [p.id for p in parks]

    if not park_ids:
        st.info("No parks in database yet. Run a Batch inspection first.")
    else:
        col1, col2 = st.columns(2)
        with col1:
            selected_park = st.selectbox("Select Park", park_ids)
        with col2:
            with get_session(engine) as s:
                inspections = s.query(Inspection).filter(
                    Inspection.park_id == selected_park
                ).order_by(Inspection.created_at.desc()).all()
                insp_ids = [i.id for i in inspections]

            selected_insp = st.selectbox("Select Inspection", insp_ids if insp_ids else ["No inspections"])

        if insp_ids and selected_insp != "No inspections":
            with get_session(engine) as s:
                dets = s.query(Detection).filter(
                    Detection.inspection_id == selected_insp
                ).all()

            # Build panel → worst severity map
            panel_severity: dict[str, str] = {}
            panel_detections: dict[str, list] = {}
            _sev_rank = {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1}

            for det in dets:
                pid = det.panel_id or "R?-C?"
                curr = panel_severity.get(pid)
                if curr is None or _sev_rank.get(det.severity, 0) > _sev_rank.get(curr, 0):
                    panel_severity[pid] = det.severity
                panel_detections.setdefault(pid, []).append(det)

            # Parse grid dimensions from panel IDs
            known_panels = [p for p in panel_severity if p != "R?-C?"]
            if not known_panels:
                st.warning("All detections have unknown panel locations (R?-C?). No RGB images were available during batch.")
            else:
                max_row = max(int(p.split("-C")[0][1:]) for p in known_panels)
                max_col = max(int(p.split("-C")[1]) for p in known_panels)

                st.markdown("**Legend:** 🔴 CRITICAL · 🟠 HIGH · 🟡 MEDIUM · 🔵 LOW · 🟢 OK")
                st.markdown("---")

                # Render grid
                for row in range(1, max_row + 1):
                    cols = st.columns(max_col)
                    for col_idx in range(1, max_col + 1):
                        pid = f"R{row}-C{col_idx}"
                        sev = panel_severity.get(pid, "OK")
                        label = f"R{row}-C{col_idx}\n{sev}" if sev != "OK" else f"R{row}-C{col_idx}"
                        with cols[col_idx - 1]:
                            if st.button(label, key=f"cell_{pid}",
                                          help=f"{len(panel_detections.get(pid, []))} detections"):
                                st.session_state["selected_panel"] = pid

            # Detail panel on cell click
            if "selected_panel" in st.session_state:
                pid = st.session_state["selected_panel"]
                st.subheader(f"Panel {pid} — Anomaly Detail")
                for det in panel_detections.get(pid, []):
                    st.markdown(
                        f"**{det.class_name}** {_sev_badge(det.severity)} "
                        f"conf={det.confidence:.2f} | image: `{det.image_id}`",
                        unsafe_allow_html=True,
                    )


# =============================================================================
# PAGE: INSPECT (single image, debug)
# =============================================================================
elif page == "🔍 Inspect":
    st.title("🔍 Single Image Inspection")
    st.caption("Upload a thermal IR image (and optionally an RGB image) for quick testing.")

    col1, col2 = st.columns(2)
    with col1:
        park_id = st.text_input("Park ID", value="DEBUG")
        altitude_m = st.number_input("Altitude (m)", min_value=5.0, max_value=200.0, value=40.0)
    with col2:
        park_mode = st.selectbox("Park Mode", ["auto", "numbered", "unnumbered"])

    thermal_file = st.file_uploader("Thermal IR Image", type=["jpg", "jpeg", "png", "tiff"])
    rgb_file = st.file_uploader("RGB Image (optional)", type=["jpg", "jpeg", "png"])

    if thermal_file and st.button("🔍 Run Detection", type="primary"):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            thermal_path = tmp / thermal_file.name
            thermal_path.write_bytes(thermal_file.read())

            rgb_path = None
            if rgb_file:
                rgb_path = tmp / rgb_file.name
                rgb_path.write_bytes(rgb_file.read())

            orch = _get_orchestrator()
            with st.spinner("Running YOLOv8s inference..."):
                result = orch.inspect_pair(
                    thermal_path=thermal_path,
                    rgb_path=rgb_path,
                    park_id=park_id,
                    altitude_m=altitude_m,
                )

        summary = result["summary"]
        c1, c2, c3, c4 = st.columns(4)
        c1.metric("🔴 CRITICAL", summary.get("CRITICAL", 0))
        c2.metric("🟠 HIGH", summary.get("HIGH", 0))
        c3.metric("🟡 MEDIUM", summary.get("MEDIUM", 0))
        c4.metric("🔵 LOW", summary.get("LOW", 0))

        if result["detections"]:
            st.subheader("Detections")
            for det in result["detections"]:
                st.markdown(
                    f"**{det['class']}** {_sev_badge(det['severity'])} "
                    f"conf={det['confidence']:.2f} panel={det.get('panel_id', 'R?-C?')}",
                    unsafe_allow_html=True,
                )
        else:
            st.success("No anomalies detected.")

        ann_path = result.get("annotated_thermal")
        if ann_path and Path(ann_path).exists():
            ann = cv2.imread(ann_path)
            if ann is not None:
                st.image(_bgr_to_rgb(ann), caption="Annotated Thermal", use_container_width=True)


# =============================================================================
# PAGE: HISTORY
# =============================================================================
elif page == "📋 History":
    st.title("📋 Inspection History")

    engine = _get_engine()
    with get_session(engine) as s:
        parks = s.query(Park).all()

    if not parks:
        st.info("No inspection history yet.")
    else:
        park_sel = st.selectbox("Park", [p.id for p in parks])

        with get_session(engine) as s:
            inspections = (
                s.query(Inspection)
                .filter(Inspection.park_id == park_sel)
                .order_by(Inspection.flight_date)
                .all()
            )

        if not inspections:
            st.info(f"No inspections for park {park_sel}.")
        else:
            import pandas as pd

            rows = []
            for insp in inspections:
                try:
                    summ = json.loads(insp.summary or "{}")
                except Exception:
                    summ = {}
                rows.append({
                    "Date": str(insp.flight_date),
                    "Inspection ID": insp.id,
                    "Images": insp.total_images,
                    "Detections": insp.total_detections,
                    "CRITICAL": summ.get("CRITICAL", 0),
                    "HIGH": summ.get("HIGH", 0),
                    "MEDIUM": summ.get("MEDIUM", 0),
                    "LOW": summ.get("LOW", 0),
                })

            df = pd.DataFrame(rows)
            st.dataframe(df, use_container_width=True)

            if len(df) > 1:
                st.subheader("Trend — Detections Over Time")
                st.line_chart(df.set_index("Date")[["CRITICAL", "HIGH", "MEDIUM", "LOW"]])


# =============================================================================
# PAGE: SETTINGS
# =============================================================================
elif page == "⚙ Settings":
    st.title("⚙ Settings")
    st.caption("Changes are written to `platform/config/settings.yaml`.")

    try:
        with open(_SETTINGS_PATH) as f:
            config = yaml.safe_load(f)
    except FileNotFoundError:
        st.error(f"Settings file not found at `{_SETTINGS_PATH}`")
        st.stop()

    model_conf = config.get("model", {})
    park_conf = config.get("park", {})
    camera_conf = config.get("camera", {})

    st.subheader("Model")
    new_conf = st.slider("Confidence Threshold", 0.1, 0.9,
                          float(model_conf.get("confidence", 0.25)), 0.01)
    new_iou = st.slider("IoU Threshold (NMS)", 0.1, 0.9,
                         float(model_conf.get("iou_threshold", 0.45)), 0.01)
    new_device = st.selectbox("Device", ["0", "cpu"], index=0 if model_conf.get("device") == "0" else 1)

    st.subheader("Park / Grid Detection")
    new_min_area = st.number_input("Min Panel Area (px²)", min_value=100, max_value=10000,
                                    value=int(park_conf.get("grid_min_panel_area", 500)))
    new_row_tol = st.number_input("Row Cluster Tolerance (px)", min_value=5, max_value=100,
                                   value=int(park_conf.get("row_cluster_tolerance_px", 30)))

    st.subheader("Camera / Drone")
    new_altitude = st.number_input("Default Altitude (m)", min_value=5.0, max_value=200.0,
                                    value=float(camera_conf.get("default_altitude_m", 40.0)))

    if st.button("💾 Save Settings", type="primary"):
        config.setdefault("model", {})["confidence"] = new_conf
        config["model"]["iou_threshold"] = new_iou
        config["model"]["device"] = new_device
        config.setdefault("park", {})["grid_min_panel_area"] = new_min_area
        config["park"]["row_cluster_tolerance_px"] = new_row_tol
        config.setdefault("camera", {})["default_altitude_m"] = new_altitude

        with open(_SETTINGS_PATH, "w") as f:
            yaml.dump(config, f, default_flow_style=False)
        st.success("Settings saved. Restart the dashboard to apply model changes.")
