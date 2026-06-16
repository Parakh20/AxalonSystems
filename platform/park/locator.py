"""
locator.py — Map detected anomalies to specific panel IDs.

Turns a list of detections (each carrying a real GPS coordinate) into
``LocatedFault`` records that name the panel each anomaly sits on
(e.g. ``"R3-C7"`` for auto-grid parks, ``"A-042"`` for OCR-numbered parks).

Data shapes (verified against the real code, NOT the plan pseudocode):

- Grid layout from ``park/layout.py``::

      {
          "mode": "auto-grid",
          "total_panels": int,
          "rows": int,
          "panel_map": {
              panel_id: {"bbox_image": [x1,y1,x2,y2],
                         "center": [cx, cy],
                         "gps": {"lat": float, "lon": float} | None},
              ...
          },
      }

- GPS dicts everywhere are ``{"lat": float, "lon": float}`` (NOT tuples).
- Detections from ``core/detector.py`` do NOT carry a ``gps`` key by
  default — the orchestrator attaches it (via ``core/geo.py``) before
  calling :func:`locate_faults`.

Both grid and numbered modes work by nearest-GPS matching against the
panels in ``panel_map``. A detection with no usable GPS falls back to
``panel_id="UNKNOWN"`` with ``confidence=0.0``.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal

from ml.src.utils import get_logger

logger = get_logger("axalon.locator")

# Confidence falls off linearly from 1.0 at the panel center to 0.0 at this
# distance (meters). Tuned for typical utility-scale panel spacing.
_MAX_MATCH_DISTANCE_M = 5.0
_EARTH_RADIUS_M = 6_371_000.0

PANEL_ID_UNKNOWN = "UNKNOWN"


@dataclass
class LocatedFault:
    """One detection mapped to a panel.

    Attributes:
        detection:   The original detection dict from ``detector.py``.
        panel_id:    Assigned panel id, e.g. ``"R3-C7"`` / ``"A-042"`` /
                     ``"UNKNOWN"`` when no panel could be matched.
        panel_index: ``(row, col)`` for ``R{r}-C{c}`` grid ids, else ``None``.
        confidence:  ``0.0``–``1.0`` confidence in the assignment.
    """

    detection: dict
    panel_id: str
    panel_index: tuple[int, int] | None
    confidence: float


def _valid_gps(gps: object) -> dict | None:
    """Return the GPS dict if it has numeric lat/lon, else ``None``."""
    if not isinstance(gps, dict):
        return None
    lat = gps.get("lat")
    lon = gps.get("lon")
    if isinstance(lat, (int, float)) and isinstance(lon, (int, float)):
        return {"lat": float(lat), "lon": float(lon)}
    return None


def _haversine_m(a: dict, b: dict) -> float:
    """Great-circle distance in meters between two ``{"lat","lon"}`` dicts."""
    lat1 = math.radians(a["lat"])
    lat2 = math.radians(b["lat"])
    dlat = lat2 - lat1
    dlon = math.radians(b["lon"] - a["lon"])
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * _EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(h)))


def _parse_panel_index(panel_id: str) -> tuple[int, int] | None:
    """Parse ``R{row}-C{col}`` into a zero-based ``(row, col)`` tuple."""
    if not panel_id:
        return None
    try:
        row_part, col_part = panel_id.split("-C", 1)
        if not row_part.startswith("R"):
            return None
        return (int(row_part[1:]) - 1, int(col_part) - 1)
    except (ValueError, IndexError):
        return None


def _confidence_from_distance(distance_m: float) -> float:
    """Linear falloff: 1.0 at the panel, 0.0 at ``_MAX_MATCH_DISTANCE_M``."""
    if distance_m <= 0.0:
        return 1.0
    if distance_m >= _MAX_MATCH_DISTANCE_M:
        return 0.0
    return round(1.0 - distance_m / _MAX_MATCH_DISTANCE_M, 4)


def _unknown(detection: dict) -> LocatedFault:
    return LocatedFault(
        detection=detection,
        panel_id=PANEL_ID_UNKNOWN,
        panel_index=None,
        confidence=0.0,
    )


def _nearest_panel(det_gps: dict, panel_map: dict) -> tuple[str, float] | None:
    """Return ``(panel_id, distance_m)`` for the closest GPS-anchored panel."""
    best_id: str | None = None
    best_dist = float("inf")
    for pid, info in panel_map.items():
        panel_gps = _valid_gps(info.get("gps"))
        if panel_gps is None:
            continue
        dist = _haversine_m(det_gps, panel_gps)
        if dist < best_dist:
            best_dist = dist
            best_id = pid
    if best_id is None:
        return None
    return best_id, best_dist


def _locate_one(detection: dict, panel_map: dict) -> LocatedFault:
    """Map a single detection to its nearest GPS-anchored panel."""
    det_gps = _valid_gps(detection.get("gps"))
    if det_gps is None:
        return _unknown(detection)

    match = _nearest_panel(det_gps, panel_map)
    if match is None:
        return _unknown(detection)

    panel_id, distance_m = match
    return LocatedFault(
        detection=detection,
        panel_id=panel_id,
        panel_index=_parse_panel_index(panel_id),
        confidence=_confidence_from_distance(distance_m),
    )


def locate_faults(
    detections: list[dict],
    park_layout: dict,
    mode: Literal["grid", "numbered"] = "grid",
) -> list[LocatedFault]:
    """Map each detection to the closest panel in the park layout.

    Args:
        detections: Detection dicts from ``detector.py``. Each may carry a
            ``gps`` key (``{"lat", "lon"}``) attached by the orchestrator.
        park_layout: Layout dict from ``layout.py`` / ``numbering.py`` —
            real shape ``{"mode", "total_panels", "rows", "panel_map"}``.
            ``panel_map`` maps ``panel_id -> {"bbox_image", "center", "gps"}``.
        mode: ``"grid"`` for auto-grid parks, ``"numbered"`` for OCR-numbered
            parks. Both resolve by nearest GPS against ``panel_map``; the mode
            is accepted for interface stability and logging.

    Returns:
        One :class:`LocatedFault` per input detection, in input order.
    """
    panel_map = (park_layout or {}).get("panel_map") or {}
    if not panel_map:
        logger.info("locate_faults: empty panel_map (mode=%s) — all UNKNOWN", mode)
        return [_unknown(det) for det in detections]

    located = [_locate_one(det, panel_map) for det in detections]
    matched = sum(1 for lf in located if lf.panel_id != PANEL_ID_UNKNOWN)
    logger.info(
        "locate_faults: %d/%d matched (mode=%s, %d panels)",
        matched, len(located), mode, len(panel_map),
    )
    return located
