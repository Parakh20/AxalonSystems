"""
Merge InfraredSolarModules + PV-Hawk + Roboflow into a single YOLO dataset.

Usage:
    python ml/scripts/prepare_dataset.py \
        --infrared  ml/Datasets/InfraredSolarModules \
        --pvhawk    /tmp/pv-hawk/data \
        --roboflow  ml/data/roboflow_solar \
        --out       ml/data/combined

Outputs:
    ml/data/combined/
        train/images/   train/labels/
        val/images/     val/labels/
        test/images/    test/labels/
"""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

# Canonical class IDs — must match ml/src/utils.py CLASS2ID
CLASS2ID = {
    "cell": 0, "cell-multi": 1, "module": 2, "string": 3,
    "bypass-diode": 4, "offline-module": 5, "vegetation-shading": 6,
    "soiling": 7, "short-circuit": 8, "hot-spot-low": 9, "hot-spot-high": 10,
}

# PV-Hawk label name → canonical name
PVHAWK_REMAP = {
    "cell": "cell", "multi-cell": "cell-multi", "module": "module",
    "string": "string", "diode": "bypass-diode", "offline": "offline-module",
    "vegetation": "vegetation-shading", "soiling": "soiling",
    "short": "short-circuit", "hotspot": "hot-spot-low",
    "severe-hotspot": "hot-spot-high",
}

# Roboflow label name → canonical name (update after inspecting downloaded dataset)
ROBOFLOW_REMAP = {
    "cell": "cell", "cell_multi": "cell-multi", "module": "module",
    "string": "string", "bypass_diode": "bypass-diode",
    "offline_module": "offline-module", "vegetation": "vegetation-shading",
    "soiling": "soiling", "short_circuit": "short-circuit",
    "hot_spot_low": "hot-spot-low", "hot_spot_high": "hot-spot-high",
}

_IMAGE_EXTS = {".jpg", ".jpeg", ".png"}


def remap_label_file(src: Path, dst: Path, remap: dict[str, str], src_names: list[str]) -> int:
    """Rewrite a YOLO .txt label file with remapped class IDs. Returns lines written."""
    if src.stat().st_size == 0:
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text("")
        return 0
    lines = src.read_text().strip().split("\n")
    out_lines = []
    for line in lines:
        if not line.strip():
            continue
        parts = line.split()
        old_id = int(parts[0])
        if old_id >= len(src_names):
            continue
        src_name = src_names[old_id]
        canonical = remap.get(src_name)
        if canonical is None or canonical not in CLASS2ID:
            continue
        new_id = CLASS2ID[canonical]
        out_lines.append(f"{new_id} {' '.join(parts[1:])}")
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text("\n".join(out_lines))
    return len(out_lines)


def copy_split(
    img_dir: Path,
    lbl_dir: Path,
    out_root: Path,
    split: str,
    remap: dict[str, str],
    src_names: list[str],
    prefix: str,
) -> int:
    """Copy images and remapped labels into out_root/split/. Returns image count."""
    count = 0
    for img_path in sorted(img_dir.glob("*")):
        if img_path.suffix.lower() not in _IMAGE_EXTS:
            continue
        lbl_path = lbl_dir / (img_path.stem + ".txt")
        if not lbl_path.exists():
            continue
        dst_img = out_root / split / "images" / f"{prefix}_{img_path.name}"
        dst_lbl = out_root / split / "labels" / f"{prefix}_{img_path.stem}.txt"
        dst_img.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(img_path, dst_img)
        remap_label_file(lbl_path, dst_lbl, remap, src_names)
        count += 1
    return count


def main():
    parser = argparse.ArgumentParser(description="Merge solar thermal datasets into unified YOLO format")
    parser.add_argument("--infrared", default="ml/Datasets/InfraredSolarModules",
                        help="Path to InfraredSolarModules dataset root")
    parser.add_argument("--pvhawk", default="/tmp/pv-hawk/data",
                        help="Path to PV-Hawk dataset root")
    parser.add_argument("--roboflow", default="ml/data/roboflow_solar",
                        help="Path to downloaded Roboflow dataset root")
    parser.add_argument("--out", default="ml/data/combined",
                        help="Output directory for combined dataset")
    args = parser.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    # InfraredSolarModules — already uses canonical class IDs, identity remap
    infrared_path = Path(args.infrared)
    if infrared_path.exists():
        infrared_names = list(CLASS2ID.keys())
        identity_remap = {n: n for n in infrared_names}
        for split in ("train", "val", "test"):
            img_dir = infrared_path / split / "images"
            lbl_dir = infrared_path / split / "labels"
            if img_dir.exists():
                n = copy_split(img_dir, lbl_dir, out, split, identity_remap, infrared_names, "ism")
                print(f"InfraredSolarModules {split}: {n} images")
    else:
        print(f"WARNING: InfraredSolarModules not found at {infrared_path} — skipping")

    # PV-Hawk
    pvhawk_path = Path(args.pvhawk)
    if pvhawk_path.exists():
        import yaml
        pvhawk_yaml = pvhawk_path / "data.yaml"
        if pvhawk_yaml.exists():
            pvhawk_cfg = yaml.safe_load(pvhawk_yaml.read_text())
            pvhawk_names = pvhawk_cfg.get("names", list(PVHAWK_REMAP.keys()))
        else:
            pvhawk_names = list(PVHAWK_REMAP.keys())
        for split in ("train", "val", "test"):
            img_dir = pvhawk_path / split / "images"
            lbl_dir = pvhawk_path / split / "labels"
            if img_dir.exists():
                n = copy_split(img_dir, lbl_dir, out, split, PVHAWK_REMAP, pvhawk_names, "pvh")
                print(f"PV-Hawk {split}: {n} images")
    else:
        print(f"WARNING: PV-Hawk not found at {pvhawk_path} — skipping")

    # Roboflow
    rf_path = Path(args.roboflow)
    if rf_path.exists():
        import yaml
        rf_yaml = rf_path / "data.yaml"
        if rf_yaml.exists():
            rf_cfg = yaml.safe_load(rf_yaml.read_text())
            rf_names = rf_cfg.get("names", list(ROBOFLOW_REMAP.keys()))
        else:
            rf_names = list(ROBOFLOW_REMAP.keys())
        for split_src, split_dst in [("train", "train"), ("valid", "val"), ("test", "test")]:
            img_dir = rf_path / split_src / "images"
            lbl_dir = rf_path / split_src / "labels"
            if img_dir.exists():
                n = copy_split(img_dir, lbl_dir, out, split_dst, ROBOFLOW_REMAP, rf_names, "rf")
                print(f"Roboflow {split_src}: {n} images")
    else:
        print(f"WARNING: Roboflow not found at {rf_path} — skipping")

    # Print dataset summary
    print("\nCombined dataset summary:")
    for split in ("train", "val", "test"):
        imgs = list((out / split / "images").glob("*")) if (out / split / "images").exists() else []
        print(f"  {split}: {len(imgs)} images")


if __name__ == "__main__":
    main()
