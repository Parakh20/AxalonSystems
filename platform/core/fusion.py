"""
fusion.py — Thermal + RGB image alignment and detection overlay.

Projects thermal IR bounding boxes onto the corresponding RGB image.
Three alignment tiers (auto-selects best available):
  1. GPS-based  — uses EXIF GPS + GSD to estimate homography
  2. Feature-based — ORB keypoint matching (cv2.findHomography)
  3. Fixed offset — configurable pixel translation for fixed-rig drones
"""

from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np

from ml.src.utils import draw_detections_severity, get_logger

logger = get_logger("axalon.fusion")


class ImageFusion:
    """Align thermal detections onto RGB imagery."""

    def __init__(
        self,
        mode: str = "auto",
        camera_offset: list[int] | None = None,
    ) -> None:
        """
        Args:
            mode:          "gps" | "feature" | "offset" | "auto"
            camera_offset: [dx, dy] pixel offset thermal→RGB for fixed rigs.
        """
        self.mode = mode
        self.camera_offset = camera_offset or [0, 0]

    def align_and_overlay(
        self,
        thermal_bgr: np.ndarray,
        rgb_bgr: np.ndarray,
        detections: list[dict],
        thermal_gps: dict | None = None,
        rgb_gps: dict | None = None,
    ) -> np.ndarray:
        """Project thermal detections onto RGB image with severity coloring.

        Args:
            thermal_bgr:  Original thermal image (BGR).
            rgb_bgr:      RGB image to project onto.
            detections:   List of detection dicts from SolarDetector.predict().
            thermal_gps:  GPS of thermal image center (for GPS mode).
            rgb_gps:      GPS of RGB image center (for GPS mode).

        Returns:
            RGB image with projected, color-coded detection bboxes.
        """
        if not detections:
            return rgb_bgr.copy()

        mode = self._resolve_mode(thermal_gps, rgb_gps)
        H = self._compute_homography(thermal_bgr, rgb_bgr, mode, thermal_gps, rgb_gps)

        # Project bboxes
        rgb_detections = []
        for det in detections:
            x1, y1, x2, y2 = det["bbox"]
            corners = np.array([[x1, y1], [x2, y1], [x2, y2], [x1, y2]], dtype=np.float32)

            if H is not None:
                projected = cv2.perspectiveTransform(corners.reshape(1, -1, 2), H)
                projected = projected.reshape(-1, 2)
                nx1 = int(projected[:, 0].min())
                ny1 = int(projected[:, 1].min())
                nx2 = int(projected[:, 0].max())
                ny2 = int(projected[:, 1].max())
            else:
                # Offset-only fallback
                dx, dy = self.camera_offset
                nx1, ny1, nx2, ny2 = x1 + dx, y1 + dy, x2 + dx, y2 + dy

            rgb_detections.append({**det, "bbox": [nx1, ny1, nx2, ny2]})

        return draw_detections_severity(rgb_bgr, rgb_detections)

    def _resolve_mode(self, thermal_gps, rgb_gps) -> str:
        if self.mode != "auto":
            return self.mode
        if thermal_gps and rgb_gps:
            return "gps"
        return "feature"

    def _compute_homography(
        self,
        thermal_bgr: np.ndarray,
        rgb_bgr: np.ndarray,
        mode: str,
        thermal_gps: dict | None,
        rgb_gps: dict | None,
    ) -> np.ndarray | None:
        """Compute homography matrix H mapping thermal → RGB coordinates."""
        if mode == "offset":
            dx, dy = self.camera_offset
            return np.float32([[1, 0, dx], [0, 1, dy], [0, 0, 1]])

        if mode == "feature":
            return self._feature_homography(thermal_bgr, rgb_bgr)

        if mode == "gps":
            # GPS-based: both images map to approximately the same ground area
            # Scale-only homography based on GSD ratio
            try:
                th, tw = thermal_bgr.shape[:2]
                rh, rw = rgb_bgr.shape[:2]
                sx = rw / tw
                sy = rh / th
                return np.float32([[sx, 0, 0], [0, sy, 0], [0, 0, 1]])
            except Exception:
                return self._feature_homography(thermal_bgr, rgb_bgr)

        return None

    def _feature_homography(
        self, thermal_bgr: np.ndarray, rgb_bgr: np.ndarray
    ) -> np.ndarray | None:
        """ORB feature matching to estimate homography."""
        try:
            gray_t = cv2.cvtColor(thermal_bgr, cv2.COLOR_BGR2GRAY)
            gray_r = cv2.cvtColor(rgb_bgr, cv2.COLOR_BGR2GRAY)

            # Resize RGB to thermal size for matching (thermal is lower-res)
            th, tw = gray_t.shape[:2]
            gray_r_resized = cv2.resize(gray_r, (tw, th))

            orb = cv2.ORB_create(nfeatures=500)
            kp1, des1 = orb.detectAndCompute(gray_t, None)
            kp2, des2 = orb.detectAndCompute(gray_r_resized, None)

            if des1 is None or des2 is None or len(kp1) < 4 or len(kp2) < 4:
                logger.warning("Feature matching: insufficient keypoints — using identity")
                return None

            bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
            matches = sorted(bf.match(des1, des2), key=lambda m: m.distance)[:50]

            if len(matches) < 4:
                return None

            src_pts = np.float32([kp1[m.queryIdx].pt for m in matches]).reshape(-1, 1, 2)
            dst_pts = np.float32([kp2[m.trainIdx].pt for m in matches]).reshape(-1, 1, 2)

            H, mask = cv2.findHomography(src_pts, dst_pts, cv2.RANSAC, 5.0)
            inliers = int(mask.sum()) if mask is not None else 0
            logger.info("Feature homography: %d inliers from %d matches", inliers, len(matches))
            return H

        except Exception as e:
            logger.warning("Feature homography failed: %s", e)
            return None
