"""
detector.py — YOLOv8 inference wrapper for solar anomaly detection.

Uses the pre-trained model at:
    ml/checkpoints/best.pt

Import severity/class constants ONLY from ml/src/utils.py — never redefine them here.
"""

from __future__ import annotations

import time
from pathlib import Path

import cv2
import numpy as np

from ml.src.utils import (
    CANONICAL_CLASSES,
    SEVERITY_MAP,
    SEVERITY_COLOR_BGR,
    yolo_to_pixel,
    get_logger,
)

logger = get_logger("axalon.detector")

# Default model path relative to repo root
DEFAULT_WEIGHTS = Path(__file__).resolve().parents[2] / "ml" / "checkpoints" / "best.pt"


class SolarDetector:
    """YOLOv8s inference wrapper for solar panel anomaly detection.

    Load once, call predict() many times — model loading is expensive.
    """

    def __init__(
        self,
        weights_path: str | Path = DEFAULT_WEIGHTS,
        conf: float = 0.25,
        iou: float = 0.45,
        device: str = "0",
    ) -> None:
        """
        Args:
            weights_path: Path to best.pt checkpoint.
            conf:         Confidence threshold (0.25 matches training config).
            iou:          NMS IoU threshold.
            device:       "0" for first GPU, "cpu" for CPU.
        """
        from ultralytics import YOLO

        self.weights_path = Path(weights_path)
        self.conf = conf
        self.iou = iou
        self.device = device

        if not self.weights_path.exists():
            raise FileNotFoundError(f"Model weights not found: {self.weights_path}")

        logger.info("Loading model from %s (device=%s)", self.weights_path, device)
        self.model = YOLO(str(self.weights_path))
        logger.info("Model loaded — %d classes", len(CANONICAL_CLASSES))

    def predict(self, thermal_image_path: str | Path) -> list[dict]:
        """Run inference on a single thermal image.

        Args:
            thermal_image_path: Path to a thermal IR JPEG or PNG.

        Returns:
            List of detection dicts, each with keys:
                class, class_id, confidence, bbox [x1,y1,x2,y2],
                bbox_norm [cx,cy,w,h], severity, color_bgr.
        """
        thermal_image_path = Path(thermal_image_path)
        if not thermal_image_path.exists():
            raise FileNotFoundError(f"Image not found: {thermal_image_path}")

        img = cv2.imread(str(thermal_image_path))
        if img is None:
            raise ValueError(f"Could not read image: {thermal_image_path}")
        img_h, img_w = img.shape[:2]

        t0 = time.perf_counter()
        results = self.model(
            str(thermal_image_path),
            conf=self.conf,
            iou=self.iou,
            device=self.device,
            verbose=False,
        )
        elapsed_ms = (time.perf_counter() - t0) * 1000
        logger.info("Inference: %.1f ms — %s", elapsed_ms, thermal_image_path.name)

        detections: list[dict] = []
        for result in results:
            if result.boxes is None:
                continue
            for box in result.boxes:
                class_id = int(box.cls.item())
                confidence = float(box.conf.item())

                # Pixel bbox
                x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]

                # Normalized YOLO bbox
                cx = float(box.xywhn[0][0].item())
                cy = float(box.xywhn[0][1].item())
                bw = float(box.xywhn[0][2].item())
                bh = float(box.xywhn[0][3].item())

                class_name = CANONICAL_CLASSES[class_id] if class_id < len(CANONICAL_CLASSES) else "unknown"
                severity = SEVERITY_MAP.get(class_name, "LOW")
                color_bgr = SEVERITY_COLOR_BGR.get(severity, (128, 128, 128))

                detections.append({
                    "class": class_name,
                    "class_id": class_id,
                    "confidence": confidence,
                    "bbox": [x1, y1, x2, y2],
                    "bbox_norm": [cx, cy, bw, bh],
                    "severity": severity,
                    "color_bgr": color_bgr,
                })

        logger.info("Detections: %d in %s", len(detections), thermal_image_path.name)
        return detections

    def predict_batch(self, image_paths: list[str | Path]) -> list[list[dict]]:
        """Batch inference across multiple thermal images.

        Args:
            image_paths: List of paths to thermal images.

        Returns:
            List of detection lists — one per input image, same order.
        """
        return [self.predict(p) for p in image_paths]

    def detection_summary(self, detections: list[dict]) -> dict[str, int]:
        """Count detections by severity level."""
        summary = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
        for det in detections:
            sev = det.get("severity", "LOW")
            if sev in summary:
                summary[sev] += 1
        return summary
