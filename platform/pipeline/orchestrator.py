"""
orchestrator.py — Full inspection pipeline orchestrator.

Runs the complete pipeline for one or many image pairs:
  ingest → detect → localize → fuse → store → report
"""

from __future__ import annotations

import json
from datetime import datetime, date
from pathlib import Path

from ml.src.utils import draw_detections_severity, load_bgr, get_logger

from axalon.core.detector import SolarDetector
from axalon.core.fusion import ImageFusion
from axalon.core.geo import detection_to_gps
from axalon.park.layout import ParkLayoutDetector
from axalon.db.session import init_db, get_session
from axalon.db.models import Park, Inspection, Detection as DbDetection
from axalon.pipeline.ingest import find_image_pairs, load_mission_metadata, validate_pair

logger = get_logger("axalon.orchestrator")


def _match_panel_id(detection: dict, panel_map: dict) -> str:
    """Return the nearest panel_id for a detection bbox center, or 'R?-C?'."""
    if not panel_map:
        return "R?-C?"
    bbox = detection["bbox"]
    det_cx = (bbox[0] + bbox[2]) / 2
    det_cy = (bbox[1] + bbox[3]) / 2
    best_id = "R?-C?"
    best_dist = float("inf")
    for pid, info in panel_map.items():
        pcx, pcy = info["center"]
        dist = ((det_cx - pcx) ** 2 + (det_cy - pcy) ** 2) ** 0.5
        if dist < best_dist:
            best_dist = dist
            best_id = pid
    return best_id


def _ensure_park(session, park_id: str, layout: dict | None) -> None:
    """Insert park record if it doesn't exist yet."""
    existing = session.query(Park).filter_by(id=park_id).first()
    if existing:
        return
    rows = layout["rows"] if layout else 0
    total = layout["total_panels"] if layout else 0
    park = Park(
        id=park_id,
        name=park_id,
        mode=layout["mode"] if layout else "auto",
        total_panels=total,
        rows=rows,
        cols=total // max(rows, 1),
    )
    session.add(park)
    session.commit()


class InspectionOrchestrator:
    """Runs the full solar inspection pipeline."""

    def __init__(
        self,
        weights_path: str | Path | None = None,
        conf: float = 0.25,
        device: str = "0",
        output_dir: str | Path = "output",
        park_mode: str = "auto",
        db_url: str = "sqlite:///axalon.db",
    ) -> None:
        self.detector = SolarDetector(
            weights_path=weights_path,
            conf=conf,
            device=device,
        )
        self.fusion = ImageFusion(mode="auto")
        self.output_dir = Path(output_dir)
        self.park_mode = park_mode
        init_db(db_url)
        self.layout_detector = ParkLayoutDetector()

    def inspect_pair(
        self,
        thermal_path: str | Path,
        rgb_path: str | Path | None = None,
        park_id: str = "unknown",
        altitude_m: float = 40.0,
        panel_map: dict | None = None,
        inspection_id: str | None = None,
    ) -> dict:
        """Run full pipeline on a single thermal+RGB pair.

        Returns:
            Inspection result dict (matches AXALON_PLATFORM_SPEC output format).
        """
        thermal_path = Path(thermal_path)
        rgb_path = Path(rgb_path) if rgb_path else None

        # Detect anomalies in thermal image
        detections = self.detector.predict(thermal_path)

        # Load images for visualization
        thermal_bgr = load_bgr(thermal_path)
        img_h, img_w = thermal_bgr.shape[:2]

        # GPS enrichment
        from axalon.core.geo import extract_gps_exif
        image_gps = extract_gps_exif(thermal_path)
        for det in detections:
            if image_gps:
                det["gps"] = detection_to_gps(
                    det["bbox"], img_w, img_h, image_gps, altitude_m
                )

        # Assign panel IDs
        for det in detections:
            det["panel_id"] = _match_panel_id(det, panel_map or {})

        # Annotated thermal output
        annotated_thermal = draw_detections_severity(thermal_bgr, detections)
        job_id = f"AXL-{datetime.now().strftime('%Y%m%d-%H%M%S')}-{thermal_path.stem}"
        job_dir = self.output_dir / job_id
        job_dir.mkdir(parents=True, exist_ok=True)

        thermal_out = job_dir / f"{thermal_path.stem}_annotated.jpg"
        import cv2
        cv2.imwrite(str(thermal_out), annotated_thermal)

        # RGB fusion overlay
        rgb_out = None
        if rgb_path and rgb_path.exists():
            rgb_bgr = load_bgr(rgb_path)
            rgb_gps = extract_gps_exif(rgb_path)
            fused = self.fusion.align_and_overlay(
                thermal_bgr, rgb_bgr, detections,
                thermal_gps=image_gps, rgb_gps=rgb_gps
            )
            rgb_out = job_dir / f"{thermal_path.stem}_rgb_annotated.jpg"
            cv2.imwrite(str(rgb_out), fused)

        summary = self.detector.detection_summary(detections)

        result = {
            "job_id": job_id,
            "park_id": park_id,
            "image_id": thermal_path.stem,
            "thermal_path": str(thermal_path),
            "rgb_path": str(rgb_path) if rgb_path else None,
            "flight_date": date.today().isoformat(),
            "detections": detections,
            "summary": summary,
            "annotated_thermal": str(thermal_out),
            "annotated_rgb": str(rgb_out) if rgb_out else None,
            "total_detections": len(detections),
        }

        # Persist detections to DB if inspection_id provided
        if inspection_id:
            session = get_session()
            try:
                for det in detections:
                    db_det = DbDetection(
                        inspection_id=inspection_id,
                        image_id=thermal_path.stem,
                        panel_id=det.get("panel_id", "R?-C?"),
                        class_=det.get("class"),
                        class_id=det.get("class_id"),
                        severity=det.get("severity"),
                        confidence=det.get("confidence"),
                        bbox=json.dumps(det.get("bbox")),
                        gps=json.dumps(det.get("gps")) if det.get("gps") else None,
                    )
                    session.add(db_det)
                session.commit()
            finally:
                session.close()

        return result

    def inspect_folder(
        self,
        folder: str | Path,
        park_id: str = "unknown",
        altitude_m: float = 40.0,
        progress_callback=None,
    ) -> dict:
        """Run full pipeline on an entire flight folder.

        Args:
            folder:            Flight mission folder (expects thermal/ + rgb/ subdirs).
            park_id:           Solar park identifier.
            altitude_m:        Drone altitude for GSD calculation.
            progress_callback: Optional callable(processed, total) for progress updates.

        Returns:
            Batch inspection result dict.
        """
        pairs = find_image_pairs(folder)
        mission_meta = load_mission_metadata(folder)
        total = len(pairs)
        logger.info("Starting batch: %d pairs, park=%s", total, park_id)

        # PHASE 1: Build park-wide panel grid from all RGB images
        layout = None
        rgb_images = []
        rgb_gps_list = []
        for pair in pairs:
            rgb_path = pair.get("rgb")
            if rgb_path and Path(rgb_path).exists():
                from axalon.core.geo import extract_gps_exif
                img = load_bgr(rgb_path)
                if img is not None:
                    rgb_images.append(img)
                    rgb_gps_list.append(extract_gps_exif(rgb_path))
        if rgb_images:
            layout = self.layout_detector.build_layout(rgb_images, rgb_gps_list)
            logger.info("Park grid: %d panels, %d rows", layout["total_panels"], layout["rows"])
        panel_map = layout["panel_map"] if layout else {}

        # Ensure park record exists in DB
        session = get_session()
        try:
            _ensure_park(session, park_id, layout)
        finally:
            session.close()

        # Create inspection record BEFORE phase 2 so FK holds for streaming detections
        batch_id = f"BATCH-{park_id}-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        flight_date = date.today().isoformat()

        session = get_session()
        try:
            insp = Inspection(
                id=batch_id,
                park_id=park_id,
                flight_date=flight_date,
                total_images=total,
                total_detections=0,  # updated after phase 2
                summary="{}",
            )
            session.add(insp)
            session.commit()
        finally:
            session.close()

        # PHASE 2: Process each image pair, stream detections to DB
        all_detections = []
        all_results = []
        for i, pair in enumerate(pairs):
            warnings = validate_pair(pair)
            for w in warnings:
                logger.warning("[%s] %s", pair["id"], w)
            result = self.inspect_pair(
                thermal_path=pair["thermal"],
                rgb_path=pair.get("rgb"),
                park_id=park_id,
                altitude_m=mission_meta.get("altitude_m", altitude_m),
                panel_map=panel_map,
                inspection_id=batch_id,
            )
            all_results.append(result)
            all_detections.extend(result["detections"])
            if progress_callback:
                progress_callback(i + 1, total)

        # PHASE 3: Update inspection record with final counts
        summary = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
        for det in all_detections:
            sev = det.get("severity", "LOW")
            if sev in summary:
                summary[sev] += 1

        session = get_session()
        try:
            insp = session.query(Inspection).filter_by(id=batch_id).first()
            insp.total_detections = len(all_detections)
            insp.summary = json.dumps(summary)
            session.commit()
        finally:
            session.close()

        return {
            "batch_id": batch_id,
            "park_id": park_id,
            "flight_date": flight_date,
            "total_images": total,
            "total_detections": len(all_detections),
            "summary": summary,
            "layout": layout,
            "results": all_results,
        }
