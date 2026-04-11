"""
orchestrator.py — Full inspection pipeline orchestrator.

Runs the complete pipeline for one or many image pairs:
  ingest → detect → localize → fuse → store → report
"""

from __future__ import annotations

from datetime import datetime, date
from pathlib import Path

from ml.src.utils import draw_detections_severity, load_bgr, get_logger

from axalon.core.detector import SolarDetector
from axalon.core.fusion import ImageFusion
from axalon.core.geo import detection_to_gps
from axalon.pipeline.ingest import find_image_pairs, load_mission_metadata, validate_pair

logger = get_logger("axalon.orchestrator")


class InspectionOrchestrator:
    """Runs the full solar inspection pipeline."""

    def __init__(
        self,
        weights_path: str | Path | None = None,
        conf: float = 0.25,
        device: str = "0",
        output_dir: str | Path = "output",
        park_mode: str = "auto",
    ) -> None:
        self.detector = SolarDetector(
            weights_path=weights_path,
            conf=conf,
            device=device,
        )
        self.fusion = ImageFusion(mode="auto")
        self.output_dir = Path(output_dir)
        self.park_mode = park_mode

    def inspect_pair(
        self,
        thermal_path: str | Path,
        rgb_path: str | Path | None = None,
        park_id: str = "unknown",
        altitude_m: float = 40.0,
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
        logger.info("Starting batch inspection: %d image pairs, park=%s", total, park_id)

        all_results = []
        all_detections = []

        for i, pair in enumerate(pairs):
            warnings = validate_pair(pair)
            for w in warnings:
                logger.warning("[%s] %s", pair["id"], w)

            result = self.inspect_pair(
                thermal_path=pair["thermal"],
                rgb_path=pair["rgb"],
                park_id=park_id,
                altitude_m=mission_meta.get("altitude_m", altitude_m),
            )
            all_results.append(result)
            all_detections.extend(result["detections"])

            if progress_callback:
                progress_callback(i + 1, total)

        # Aggregate summary
        summary = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
        for det in all_detections:
            sev = det.get("severity", "LOW")
            if sev in summary:
                summary[sev] += 1

        batch_id = f"BATCH-{park_id}-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        return {
            "batch_id": batch_id,
            "park_id": park_id,
            "flight_date": date.today().isoformat(),
            "total_images": total,
            "total_detections": len(all_detections),
            "summary": summary,
            "results": all_results,
        }
