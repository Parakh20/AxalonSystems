"""
co_detr_thermal.py — MMDetection config for the Co-DETR bake-off candidate.

Usage (on the GCP training VM, inside an MMDetection checkout):
    python tools/train.py ml/configs/co_detr_thermal.py

Falls back to DINO (base = 'dino/dino-4scale_r50_8xb2-12e_coco.py') if Co-DETR
training proves unstable — see the "Risks" section of the design spec at
docs/superpowers/specs/2026-07-01-thermal-model-retraining-bakeoff-design.md.
"""

_base_ = "co_detr/co_dino_5scale_r50_1x_coco.py"

data_root = "ml/data/combined_coco/"
classes = (
    "cell", "cell-multi", "module", "string", "bypass-diode",
    "offline-module", "vegetation-shading", "soiling", "short-circuit",
    "hot-spot-low", "hot-spot-high",
)
num_classes = len(classes)

model = dict(
    query_head=dict(num_classes=num_classes),
    roi_head=[dict(bbox_head=dict(num_classes=num_classes))],
    bbox_head=[dict(num_classes=num_classes)],
)

train_dataloader = dict(
    dataset=dict(
        data_root=data_root,
        ann_file="train.json",
        data_prefix=dict(img="../combined/train/images/"),
        metainfo=dict(classes=classes),
    )
)
val_dataloader = dict(
    dataset=dict(
        data_root=data_root,
        ann_file="val.json",
        data_prefix=dict(img="../combined/val/images/"),
        metainfo=dict(classes=classes),
    )
)
test_dataloader = val_dataloader

val_evaluator = dict(ann_file=data_root + "val.json")
test_evaluator = val_evaluator

work_dir = "ml/runs/thermal/codetr_solar"
