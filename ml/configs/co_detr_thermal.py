"""
co_detr_thermal.py — MMDetection config for the Co-DETR bake-off candidate.

Usage (on the GCP training VM, cwd must be the mmdetection checkout so the
base config's custom_imports of projects.CO-DETR resolves):
    cd /opt/mmdetection && python3 tools/train.py /opt/repo/ml/configs/co_detr_thermal.py

Targets MMDetection 3.3.0's built-in CO-DETR project (open-mmlab/mmdetection,
projects/CO-DETR) with mmcv 2.1.0 + torch 2.1.2 — the Sense-X/Co-DETR repo is
mmdet 2.x-era and cannot build against this stack.

Falls back to DINO (base = 'dino/dino-4scale_r50_8xb2-12e_coco.py') if Co-DETR
training proves unstable — see the "Risks" section of the design spec at
docs/superpowers/specs/2026-07-01-thermal-model-retraining-bakeoff-design.md.
"""

# Absolute VM paths: this config is consumed only on the training VM, where the
# repo lives at /opt/repo and the mmdetection checkout at /opt/mmdetection.
_base_ = "/opt/mmdetection/projects/CO-DETR/configs/codino/co_dino_5scale_r50_8xb2_1x_coco.py"

data_root = "/opt/repo/ml/data/combined_coco/"
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

# /opt/repo/runs is symlinked to the persistent dataset disk by the VM startup
# script, so checkpoints survive spot preemption (same pattern as the
# Ultralytics candidates).
work_dir = "/opt/repo/runs/thermal/codetr_solar"

# Log to the same W&B project as the two Ultralytics candidates so all three
# bake-off runs are monitorable from one dashboard. WANDB_API_KEY comes from
# instance metadata via the environment.
visualizer = dict(
    type="DetLocalVisualizer",
    vis_backends=[
        dict(type="LocalVisBackend"),
        dict(
            type="WandbVisBackend",
            init_kwargs=dict(
                entity="axalonsystems-",
                project="axalon-thermal-bakeoff",
                name="codetr_solar",
            ),
        ),
    ],
)
