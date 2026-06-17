"""Unit tests for platform/core/geo.py — GPS/EXIF extraction and pixel→GPS math."""
from __future__ import annotations

import math

import piexif
import pytest
from PIL import Image

from axalon.core.geo import (
    compute_gsd,
    detection_to_gps,
    extract_gps_exif,
    pixel_to_gps,
)


def _deg_to_dms_rational(deg: float):
    """Convert a positive decimal degree to EXIF DMS rational tuples."""
    d = int(deg)
    m_full = (deg - d) * 60
    m = int(m_full)
    s = round((m_full - m) * 60 * 100)
    return ((d, 1), (m, 1), (s, 100))


def _make_jpg_with_gps(path, lat: float, lon: float, alt: float = 30.0):
    lat_ref = b"N" if lat >= 0 else b"S"
    lon_ref = b"E" if lon >= 0 else b"W"
    gps_ifd = {
        piexif.GPSIFD.GPSLatitudeRef: lat_ref,
        piexif.GPSIFD.GPSLatitude: _deg_to_dms_rational(abs(lat)),
        piexif.GPSIFD.GPSLongitudeRef: lon_ref,
        piexif.GPSIFD.GPSLongitude: _deg_to_dms_rational(abs(lon)),
        piexif.GPSIFD.GPSAltitude: (int(alt * 100), 100),
    }
    exif_bytes = piexif.dump({"GPS": gps_ifd})
    img = Image.new("RGB", (16, 16), color=(120, 80, 40))
    img.save(str(path), "jpeg", exif=exif_bytes)


def test_extract_gps_from_exif_jpg(tmp_path):
    # Arrange
    img_path = tmp_path / "with_gps.jpg"
    _make_jpg_with_gps(img_path, lat=19.076, lon=72.877, alt=42.0)

    # Act
    result = extract_gps_exif(img_path)

    # Assert
    assert result is not None
    assert result["lat"] == pytest.approx(19.076, abs=1e-3)
    assert result["lon"] == pytest.approx(72.877, abs=1e-3)
    assert result["alt"] == pytest.approx(42.0, abs=0.5)


def test_extract_gps_handles_southern_western_hemisphere(tmp_path):
    # Arrange — negative lat/lon must round-trip through S/W refs
    img_path = tmp_path / "south_west.jpg"
    _make_jpg_with_gps(img_path, lat=-33.865, lon=-70.000)

    # Act
    result = extract_gps_exif(img_path)

    # Assert
    assert result["lat"] == pytest.approx(-33.865, abs=1e-3)
    assert result["lon"] == pytest.approx(-70.000, abs=1e-3)


def test_extract_gps_returns_none_when_no_exif(tmp_path):
    # Arrange — image saved without any EXIF block
    img_path = tmp_path / "no_exif.jpg"
    Image.new("RGB", (8, 8)).save(str(img_path), "jpeg")

    # Act
    result = extract_gps_exif(img_path)

    # Assert
    assert result is None


def test_extract_gps_handles_corrupt_file(tmp_path):
    # Arrange — not a real image at all
    bad = tmp_path / "corrupt.jpg"
    bad.write_bytes(b"this is not a jpeg")

    # Act
    result = extract_gps_exif(bad)

    # Assert — must not raise, returns None
    assert result is None


def test_compute_gsd_scales_with_altitude():
    # Arrange / Act
    low = compute_gsd(altitude_m=10.0)
    high = compute_gsd(altitude_m=20.0)

    # Assert — GSD is linear in altitude
    assert high == pytest.approx(2 * low)
    assert low > 0


def test_pixel_to_gps_center_pixel_returns_image_gps():
    # Arrange — center pixel of a 640x480 image
    image_gps = {"lat": 19.0, "lon": 72.0}

    # Act
    result = pixel_to_gps(320, 240, 640, 480, image_gps, gsd_cm_per_px=5.0)

    # Assert — no offset from center → same coordinate
    assert result["lat"] == pytest.approx(19.0, abs=1e-9)
    assert result["lon"] == pytest.approx(72.0, abs=1e-9)


def test_pixel_to_gps_offset_moves_south_and_east():
    # Arrange — pixel below+right of center should move south (lower lat) and east
    image_gps = {"lat": 19.0, "lon": 72.0}

    # Act
    result = pixel_to_gps(400, 300, 640, 480, image_gps, gsd_cm_per_px=10.0)

    # Assert
    assert result["lat"] < 19.0  # y increases downward = south
    assert result["lon"] > 72.0  # x increases rightward = east


def test_detection_to_gps_uses_bbox_center():
    # Arrange — a bbox centered exactly at the image center
    image_gps = {"lat": 19.0, "lon": 72.0}
    bbox = [310, 230, 330, 250]  # center (320, 240) of 640x480

    # Act
    result = detection_to_gps(
        bbox, image_width=640, image_height=480,
        image_gps=image_gps, altitude_m=20.0,
    )

    # Assert — centered bbox maps to image GPS
    assert result["lat"] == pytest.approx(19.0, abs=1e-6)
    assert result["lon"] == pytest.approx(72.0, abs=1e-6)
