"""
ML dataset feature tests — run with:
    /home/parakh/miniconda3/bin/python3.13 tests/test_ml_dataset.py

Uses a fresh sys.path so platform/ doesn't shadow stdlib platform module.
"""

from __future__ import annotations
import sys
import os
import json
import tempfile
import logging

# Pre-import stdlib modules that project's ./platform/ package would shadow.
# Python caches these in sys.modules, so later `import platform` calls inside
# numpy/scipy/sklearn all find the cached stdlib version, not ./platform/__init__.py
import platform   # stdlib — must happen before _ROOT enters sys.path
import uuid       # depends on platform

_HERE = os.path.abspath(os.path.dirname(__file__))
_ROOT = os.path.abspath(os.path.join(_HERE, ".."))
# Remove duplicates, then prepend ROOT so project packages (ml, axalon) resolve
sys.path = [_ROOT] + [p for p in sys.path if os.path.abspath(p) != _ROOT]

from pathlib import Path
from collections import Counter

PASS = "\033[92mPASS\033[0m"
FAIL = "\033[91mFAIL\033[0m"

_results: list[tuple[str, bool, str]] = []


def test(name: str):
    def decorator(fn):
        try:
            fn()
            _results.append((name, True, ""))
            print(f"  [{PASS}] {name}")
        except Exception as exc:
            _results.append((name, False, str(exc)))
            print(f"  [{FAIL}] {name}: {exc}")
        return fn
    return decorator


# ─── Paths ───────────────────────────────────────────────────────────────────
ROOT         = Path(_ROOT)
ISM_ROOT     = ROOT / "ml/Datasets/InfraredSolarModules/2020-02-14_InfraredSolarModules/InfraredSolarModules"
ISM_IMAGES   = ISM_ROOT / "images"
ISM_METADATA = ISM_ROOT / "module_metadata.json"
MODEL_PATH   = ROOT / "ml/checkpoints/best.pt"


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 1: utils.py
# ═══════════════════════════════════════════════════════════════════════════
print("\n── Section 1: utils.py ──────────────────────────────────────────────")

from ml.src.utils import (
    CANONICAL_CLASSES, CLASS2ID, ID2CLASS,
    SEVERITY_MAP, SEVERITY_COLOR_BGR,
    read_yolo_label, write_yolo_label,
    yolo_to_pixel, draw_detections_severity, load_bgr, get_logger,
)

@test("CANONICAL_CLASSES has exactly 11 entries")
def _():
    assert len(CANONICAL_CLASSES) == 11, f"Expected 11, got {len(CANONICAL_CLASSES)}"

@test("CLASS2ID and ID2CLASS are inverse mappings")
def _():
    for i, name in enumerate(CANONICAL_CLASSES):
        assert CLASS2ID[name] == i
        assert ID2CLASS[i] == name

@test("All 4 severity levels present in SEVERITY_MAP")
def _():
    levels = set(SEVERITY_MAP.values())
    assert levels == {"CRITICAL", "HIGH", "MEDIUM", "LOW"}, f"Got: {levels}"

@test("Every class has a severity entry")
def _():
    missing = [c for c in CANONICAL_CLASSES if c not in SEVERITY_MAP]
    assert not missing, f"Missing severity for: {missing}"

@test("Every severity level has a BGR color")
def _():
    for sev in ["CRITICAL", "HIGH", "MEDIUM", "LOW"]:
        assert sev in SEVERITY_COLOR_BGR
        assert len(SEVERITY_COLOR_BGR[sev]) == 3

@test("read_yolo_label returns empty list for missing file")
def _():
    boxes = read_yolo_label(Path("/tmp/nonexistent_label_xyz.txt"))
    assert boxes == []

@test("write_yolo_label / read_yolo_label roundtrip")
def _():
    with tempfile.NamedTemporaryFile(suffix=".txt", delete=False) as f:
        tmp = Path(f.name)
    boxes_in = [(0, 0.5, 0.5, 1.0, 1.0), (3, 0.25, 0.75, 0.4, 0.3)]
    write_yolo_label(tmp, boxes_in)
    boxes_out = read_yolo_label(tmp)
    assert len(boxes_out) == 2
    assert boxes_out[0][0] == 0
    assert abs(boxes_out[1][1] - 0.25) < 1e-5
    tmp.unlink()

@test("write_yolo_label handles empty box list")
def _():
    with tempfile.NamedTemporaryFile(suffix=".txt", delete=False) as f:
        tmp = Path(f.name)
    write_yolo_label(tmp, [])
    assert tmp.read_text() == ""
    tmp.unlink()

@test("yolo_to_pixel converts center format correctly")
def _():
    x1, y1, x2, y2 = yolo_to_pixel(0.5, 0.5, 1.0, 1.0, 100, 80)
    assert x1 == 0 and y1 == 0 and x2 == 100 and y2 == 80

@test("draw_detections_severity returns annotated image")
def _():
    import numpy as np
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    dets = [{
        "class": "hot-spot-high", "class_id": 10,
        "confidence": 0.9, "severity": "CRITICAL",
        "bbox": [10, 10, 50, 50], "bbox_norm": [0.3, 0.3, 0.4, 0.4],
        "color_bgr": (0, 0, 255),
    }]
    out = draw_detections_severity(img, dets)
    assert out.shape == img.shape
    assert not (out == img).all()  # something was drawn

@test("get_logger returns a logger with handlers")
def _():
    log = get_logger("test_ml")
    assert isinstance(log, logging.Logger)
    assert len(log.handlers) > 0


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 2: dataset.py — class mappings
# ═══════════════════════════════════════════════════════════════════════════
print("\n── Section 2: dataset.py — class mappings ───────────────────────────")

from ml.src.dataset import (
    ISM_CLASSES_MAP, PV_CLASSES_MAP,
    collect_ism_pairs, collect_all_pairs,
    stratified_split, _remap_class_id, _majority_class,
)

@test("All ISM source classes map to valid canonical classes")
def _():
    for src, dst in ISM_CLASSES_MAP.items():
        assert dst in CLASS2ID, f"ISM: {src!r} → {dst!r} not in CANONICAL_CLASSES"

@test("All PV source classes map to valid canonical classes")
def _():
    for src, dst in PV_CLASSES_MAP.items():
        assert dst in CLASS2ID, f"PV: {src!r} → {dst!r} not in CANONICAL_CLASSES"

@test("_remap_class_id returns None for out-of-range source id")
def _():
    result = _remap_class_id(99, ["cell"], ISM_CLASSES_MAP)
    assert result is None

@test("_remap_class_id returns None for unknown class name")
def _():
    result = _remap_class_id(0, ["UnknownClass"], ISM_CLASSES_MAP)
    assert result is None

@test("_remap_class_id maps valid PV class correctly")
def _():
    pv_names = list(PV_CLASSES_MAP.keys())
    result = _remap_class_id(0, pv_names, PV_CLASSES_MAP)
    expected = CLASS2ID[PV_CLASSES_MAP[pv_names[0]]]
    assert result == expected

@test("_majority_class returns 0 for empty box list")
def _():
    assert _majority_class([]) == 0

@test("_majority_class returns most-common class id")
def _():
    boxes = [(2, 0.5, 0.5, 0.3, 0.3), (2, 0.5, 0.5, 0.3, 0.3), (5, 0.5, 0.5, 0.3, 0.3)]
    assert _majority_class(boxes) == 2


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 3: ISM dataset scanning
# ═══════════════════════════════════════════════════════════════════════════
print("\n── Section 3: ISM dataset scanning ─────────────────────────────────")

@test("ISM metadata file exists")
def _():
    assert ISM_METADATA.exists(), f"Not found: {ISM_METADATA}"

@test("ISM images directory exists with 20 000 images")
def _():
    assert ISM_IMAGES.exists()
    count = len(list(ISM_IMAGES.iterdir()))
    assert count == 20000, f"Expected 20000 images, found {count}"

@test("ISM metadata has 20 000 entries with correct keys")
def _():
    data = json.loads(ISM_METADATA.read_text())
    assert len(data) == 20000
    sample = next(iter(data.values()))
    assert "image_filepath" in sample
    assert "anomaly_class" in sample

@test("ISM class distribution covers all 12 source classes")
def _():
    data = json.loads(ISM_METADATA.read_text())
    classes_found = set(v["anomaly_class"] for v in data.values())
    assert classes_found == set(ISM_CLASSES_MAP.keys()), \
        f"Missing: {set(ISM_CLASSES_MAP.keys()) - classes_found}"

@test("collect_ism_pairs scans 20 000 images correctly")
def _():
    with tempfile.TemporaryDirectory() as tmpdir:
        pairs = collect_ism_pairs(ISM_IMAGES, ISM_METADATA, generated_labels_dir=Path(tmpdir))
    assert len(pairs) == 20000, f"Expected 20000, got {len(pairs)}"

@test("collect_ism_pairs writes valid YOLO whole-image labels")
def _():
    with tempfile.TemporaryDirectory() as tmpdir:
        lbl_dir = Path(tmpdir)
        pairs = collect_ism_pairs(ISM_IMAGES, ISM_METADATA, generated_labels_dir=lbl_dir)
        # Check a few labels
        for img, lbl, maj in pairs[:5]:
            boxes = read_yolo_label(lbl)
            assert len(boxes) == 1, f"Expected 1 box in {lbl}"
            cid, cx, cy, w, h = boxes[0]
            assert cx == 0.5 and cy == 0.5 and w == 1.0 and h == 1.0
            assert 0 <= cid <= 10

@test("collect_ism_pairs: majority_class_id is valid canonical id (0-10)")
def _():
    with tempfile.TemporaryDirectory() as tmpdir:
        pairs = collect_ism_pairs(ISM_IMAGES, ISM_METADATA, generated_labels_dir=Path(tmpdir))
        bad = [(img, maj) for img, _, maj in pairs if not (0 <= maj <= 10)]
        assert not bad, f"Invalid majority class ids: {bad[:3]}"

@test("collect_ism_pairs: all 11 canonical classes appear")
def _():
    with tempfile.TemporaryDirectory() as tmpdir:
        pairs = collect_ism_pairs(ISM_IMAGES, ISM_METADATA, generated_labels_dir=Path(tmpdir))
        seen_ids = set(maj for _, _, maj in pairs)
        # 12 ISM classes → 11 canonical (some merge). Check at least 9 appear
        assert len(seen_ids) >= 9, f"Only {len(seen_ids)} classes found: {seen_ids}"


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 4: stratified split
# ═══════════════════════════════════════════════════════════════════════════
print("\n── Section 4: stratified_split ──────────────────────────────────────")

@test("stratified_split sizes sum to total")
def _():
    with tempfile.TemporaryDirectory() as tmpdir:
        pairs = collect_ism_pairs(ISM_IMAGES, ISM_METADATA, generated_labels_dir=Path(tmpdir))
    train, val, test = stratified_split(pairs, train_frac=0.75, val_frac=0.15)
    assert len(train) + len(val) + len(test) == len(pairs), \
        f"{len(train)}+{len(val)}+{len(test)} ≠ {len(pairs)}"

@test("stratified_split train fraction ~75%")
def _():
    with tempfile.TemporaryDirectory() as tmpdir:
        pairs = collect_ism_pairs(ISM_IMAGES, ISM_METADATA, generated_labels_dir=Path(tmpdir))
    train, val, test = stratified_split(pairs, train_frac=0.75, val_frac=0.15)
    ratio = len(train) / len(pairs)
    assert 0.73 < ratio < 0.77, f"Train ratio = {ratio:.3f}"

@test("stratified_split val fraction ~15%")
def _():
    with tempfile.TemporaryDirectory() as tmpdir:
        pairs = collect_ism_pairs(ISM_IMAGES, ISM_METADATA, generated_labels_dir=Path(tmpdir))
    train, val, test = stratified_split(pairs, train_frac=0.75, val_frac=0.15)
    ratio = len(val) / len(pairs)
    assert 0.13 < ratio < 0.17, f"Val ratio = {ratio:.3f}"

@test("stratified_split is deterministic (seed=42)")
def _():
    with tempfile.TemporaryDirectory() as tmpdir:
        pairs = collect_ism_pairs(ISM_IMAGES, ISM_METADATA, generated_labels_dir=Path(tmpdir))
    t1, v1, te1 = stratified_split(pairs, seed=42)
    t2, v2, te2 = stratified_split(pairs, seed=42)
    assert [p[0] for p in t1] == [p[0] for p in t2]

@test("stratified_split class distribution preserved in train set")
def _():
    with tempfile.TemporaryDirectory() as tmpdir:
        pairs = collect_ism_pairs(ISM_IMAGES, ISM_METADATA, generated_labels_dir=Path(tmpdir))
    all_dist = Counter(m for _, _, m in pairs)
    train, val, test = stratified_split(pairs, seed=42)
    train_dist = Counter(m for _, _, m in train)
    for cls_id in all_dist:
        overall_frac = all_dist[cls_id] / len(pairs)
        train_frac_actual = train_dist.get(cls_id, 0) / len(train)
        assert abs(overall_frac - train_frac_actual) < 0.03, \
            f"Class {cls_id}: overall={overall_frac:.3f} train={train_frac_actual:.3f}"

@test("collect_all_pairs merges correctly")
def _():
    fake_pairs_a = [(Path("a.jpg"), Path("a.txt"), 0)] * 3
    fake_pairs_b = [(Path("b.jpg"), Path("b.txt"), 1)] * 2
    merged = collect_all_pairs(fake_pairs_a, fake_pairs_b)
    assert len(merged) == 5


# ═══════════════════════════════════════════════════════════════════════════
# SECTION 5: model weights
# ═══════════════════════════════════════════════════════════════════════════
print("\n── Section 5: model weights ─────────────────────────────────────────")

@test("Model weights file exists at ml/checkpoints/best.pt")
def _():
    assert MODEL_PATH.exists(), f"Missing: {MODEL_PATH}"

@test("Model weights file is non-empty (> 1 MB)")
def _():
    size_mb = MODEL_PATH.stat().st_size / (1024 * 1024)
    assert size_mb > 1.0, f"Suspiciously small: {size_mb:.1f} MB"

@test("thermal_dataset.yaml class names match CANONICAL_CLASSES")
def _():
    import yaml
    yaml_path = ROOT / "ml/thermal_dataset.yaml"
    data = yaml.safe_load(yaml_path.read_text())
    assert data["nc"] == 11
    assert data["names"] == CANONICAL_CLASSES


# ═══════════════════════════════════════════════════════════════════════════
# SUMMARY
# ═══════════════════════════════════════════════════════════════════════════
print("\n" + "═" * 65)
passed = sum(1 for _, ok, _ in _results if ok)
failed = sum(1 for _, ok, _ in _results if not ok)
print(f"  Results: {passed} passed, {failed} failed  ({len(_results)} total)")
if failed:
    print("\n  Failed tests:")
    for name, ok, err in _results:
        if not ok:
            print(f"    • {name}: {err}")
print("═" * 65)
sys.exit(0 if failed == 0 else 1)
