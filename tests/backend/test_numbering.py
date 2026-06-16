"""Unit tests for platform/park/numbering.py — panel-ID parsing.

PanelNumberOCR.__init__ loads EasyOCR (heavy / downloads models), so these tests
construct the object via __new__ to exercise the pure parsing methods directly.
"""
from __future__ import annotations

import numpy as np
import pytest

from axalon.park.numbering import PanelNumberOCR


@pytest.fixture
def ocr() -> PanelNumberOCR:
    # Bypass __init__ (no EasyOCR) — only the pure parse methods are under test.
    return PanelNumberOCR.__new__(PanelNumberOCR)


@pytest.mark.parametrize(
    "text,expected",
    [
        ("C4-28", {"type": "cell", "row": 4, "number": 28}),
        ("S3-12", {"type": "string", "row": 3, "number": 12}),
        ("R3-C7", {"type": "grid", "row": 3, "col": 7}),
        ("INV-02/STR-05", {"type": "inv_string", "inv": 2, "str": 5}),
        ("INV02-STR05", {"type": "inv_string", "inv": 2, "str": 5}),
        ("A-103", {"type": "alpha_row", "row": "A", "number": 103}),
    ],
)
def test_parse_panel_id_recognizes_known_schemes(ocr, text, expected):
    # Act
    parsed = ocr.parse_panel_id(text)

    # Assert
    assert parsed == expected


@pytest.mark.parametrize("text", ["", "HELLO", "1234", "C4", "ZZ-9-9", "R3C7"])
def test_parse_panel_id_returns_none_for_unknown(ocr, text):
    assert ocr.parse_panel_id(text) is None


@pytest.mark.parametrize(
    "parsed,expected",
    [
        ({"type": "cell", "row": 4, "number": 28}, "C4-28"),
        ({"type": "string", "row": 3, "number": 12}, "S3-12"),
        ({"type": "grid", "row": 3, "col": 7}, "R3-C7"),
        ({"type": "inv_string", "inv": 2, "str": 5}, "INV-02/STR-05"),
        ({"type": "alpha_row", "row": "A", "number": 103}, "A-103"),
    ],
)
def test_panel_id_to_string_round_trips(ocr, parsed, expected):
    assert ocr.panel_id_to_string(parsed) == expected


def test_panel_id_to_string_unknown_type_falls_back_to_repr(ocr):
    # Arrange — an unrecognized type returns str(parsed)
    weird = {"type": "mystery", "x": 1}

    # Act / Assert
    assert ocr.panel_id_to_string(weird) == str(weird)


def test_extract_ids_returns_empty_when_reader_unavailable(ocr):
    # Arrange — simulate "easyocr not installed" state
    ocr.reader = None
    image = np.zeros((10, 10, 3), dtype=np.uint8)

    # Act
    result = ocr.extract_ids_from_rgb(image)

    # Assert
    assert result == []
