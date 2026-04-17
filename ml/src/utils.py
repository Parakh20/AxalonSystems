"""
utils.py — shared helpers for visualisation, severity mapping, and YOLO I/O.

Intentionally import-light so notebooks can do `from src.utils import *`
without pulling in heavy deps at the top of every cell.
"""

from __future__ import annotations

import logging
import warnings
from pathlib import Path
from typing import Sequence

import cv2
import matplotlib.pyplot as plt
import numpy as np

# ── Canonical class list ────────────────────────────────────────────────────
CANONICAL_CLASSES: list[str] = [
    "cell",            # 0
    "cell-multi",      # 1
    "module",          # 2
    "string",          # 3
    "bypass-diode",    # 4
    "offline-module",  # 5
    "vegetation-shading",  # 6
    "soiling",         # 7
    "short-circuit",   # 8
    "hot-spot-low",    # 9
    "hot-spot-high",   # 10
]

CLASS2ID: dict[str, int] = {c: i for i, c in enumerate(CANONICAL_CLASSES)}
ID2CLASS: dict[int, str] = {i: c for i, c in enumerate(CANONICAL_CLASSES)}

# ── Severity mapping ────────────────────────────────────────────────────────
SEVERITY_MAP: dict[str, str] = {
    "hot-spot-high":       "CRITICAL",
    "bypass-diode":        "CRITICAL",
    "string":              "CRITICAL",
    "hot-spot-low":        "HIGH",
    "offline-module":      "HIGH",
    "short-circuit":       "HIGH",
    "cell":                "MEDIUM",
    "cell-multi":          "MEDIUM",
    "module":              "MEDIUM",
    "vegetation-shading":  "LOW",
    "soiling":             "LOW",
}

SEVERITY_COLOR_BGR: dict[str, tuple[int, int, int]] = {
    "CRITICAL": (0,   0,   255),   # red
    "HIGH":     (0,   165, 255),   # orange
    "MEDIUM":   (0,   255, 255),   # yellow
    "LOW":      (255, 0,   0),     # blue
}

# ── YOLO label I/O ──────────────────────────────────────────────────────────

def read_yolo_label(label_path: Path) -> list[tuple[int, float, float, float, float]]:
    """Return list of (class_id, cx, cy, w, h) from a YOLO .txt label file."""
    boxes: list[tuple[int, float, float, float, float]] = []
    if not label_path.exists() or label_path.stat().st_size == 0:
        return boxes
    for line in label_path.read_text().splitlines():
        parts = line.strip().split()
        if len(parts) != 5:
            continue
        try:
            cid, cx, cy, w, h = int(parts[0]), *map(float, parts[1:])
            boxes.append((cid, cx, cy, w, h))
        except ValueError:
            logging.warning("Malformed label line in %s: %r", label_path, line)
    return boxes


def write_yolo_label(
    label_path: Path,
    boxes: list[tuple[int, float, float, float, float]],
) -> None:
    """Write (class_id, cx, cy, w, h) list to a YOLO .txt label file."""
    label_path.parent.mkdir(parents=True, exist_ok=True)
    lines = [f"{cid} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}" for cid, cx, cy, w, h in boxes]
    label_path.write_text("\n".join(lines) + ("\n" if lines else ""))


# ── Bounding-box drawing ────────────────────────────────────────────────────

def yolo_to_pixel(
    cx: float, cy: float, w: float, h: float, img_w: int, img_h: int
) -> tuple[int, int, int, int]:
    """Convert normalised YOLO coords → pixel (x1, y1, x2, y2)."""
    x1 = int((cx - w / 2) * img_w)
    y1 = int((cy - h / 2) * img_h)
    x2 = int((cx + w / 2) * img_w)
    y2 = int((cy + h / 2) * img_h)
    return x1, y1, x2, y2


def draw_yolo_boxes(
    img_bgr: np.ndarray,
    boxes: list[tuple[int, float, float, float, float]],
    color: tuple[int, int, int] = (0, 255, 0),
    thickness: int = 2,
    labels: Sequence[str] | None = None,
    font_scale: float = 0.45,
) -> np.ndarray:
    """Draw YOLO-format boxes on a BGR image copy. Returns the annotated copy."""
    out = img_bgr.copy()
    h, w = out.shape[:2]
    for cid, cx, cy, bw, bh in boxes:
        x1, y1, x2, y2 = yolo_to_pixel(cx, cy, bw, bh, w, h)
        cv2.rectangle(out, (x1, y1), (x2, y2), color, thickness)
        if labels is not None and 0 <= cid < len(labels):
            cv2.putText(
                out, labels[cid], (x1, max(y1 - 4, 12)),
                cv2.FONT_HERSHEY_SIMPLEX, font_scale, color, 1, cv2.LINE_AA,
            )
    return out


def draw_detections_severity(
    img_bgr: np.ndarray,
    detections: list[dict],
    thickness: int = 2,
    font_scale: float = 0.45,
) -> np.ndarray:
    """Draw detections coloured by severity.

    Each detection dict must have keys: bbox [x1,y1,x2,y2], class, severity, confidence.
    """
    out = img_bgr.copy()
    for det in detections:
        x1, y1, x2, y2 = [int(v) for v in det["bbox"]]
        color = SEVERITY_COLOR_BGR.get(det["severity"], (128, 128, 128))
        cv2.rectangle(out, (x1, y1), (x2, y2), color, thickness)
        label = f"{det['class']} {det['confidence']:.2f}"
        cv2.putText(
            out, label, (x1, max(y1 - 4, 12)),
            cv2.FONT_HERSHEY_SIMPLEX, font_scale, color, 1, cv2.LINE_AA,
        )
    return out


# ── Image grid helpers ──────────────────────────────────────────────────────

def show_image_grid(
    images: list[np.ndarray],
    titles: list[str] | None = None,
    ncols: int = 3,
    figsize_per_cell: tuple[float, float] = (4.0, 3.5),
) -> None:
    """Display a list of BGR images in a matplotlib grid (converts BGR→RGB)."""
    n = len(images)
    nrows = (n + ncols - 1) // ncols
    fig, axes = plt.subplots(
        nrows, ncols,
        figsize=(figsize_per_cell[0] * ncols, figsize_per_cell[1] * nrows),
    )
    axes = np.array(axes).flatten()
    for i, ax in enumerate(axes):
        if i < n:
            ax.imshow(cv2.cvtColor(images[i], cv2.COLOR_BGR2RGB))
            if titles:
                ax.set_title(titles[i], fontsize=8)
        ax.axis("off")
    plt.tight_layout()
    plt.show()


def load_bgr(path: Path, target_size: tuple[int, int] | None = None) -> np.ndarray:
    """Load an image as BGR; optionally resize. Raises FileNotFoundError if missing."""
    img = cv2.imread(str(path))
    if img is None:
        raise FileNotFoundError(f"Could not load image: {path}")
    if target_size is not None:
        img = cv2.resize(img, target_size, interpolation=cv2.INTER_LINEAR)
    return img


# ── Logging setup ───────────────────────────────────────────────────────────

def get_logger(name: str = "solar_thermal") -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("[%(levelname)s] %(message)s"))
        logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    return logger
