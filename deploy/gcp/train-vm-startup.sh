#!/usr/bin/env bash
# train-vm-startup.sh — runs on first boot of a bake-off training VM.
# Clones the repo, mounts the pre-populated dataset disk, runs the training
# entrypoint for the candidate named in the "candidate" instance metadata key,
# then shuts the VM down so spot billing stops.
set -euo pipefail

CANDIDATE="$(curl -s -H 'Metadata-Flavor: Google' \
  'http://metadata.google.internal/computeMetadata/v1/instance/attributes/candidate')"

DATA_DEVICE="/dev/disk/by-id/google-thermal-dataset-disk"
MOUNT_POINT="/mnt/dataset"

mkdir -p "$MOUNT_POINT"
mount -o discard,defaults "$DATA_DEVICE" "$MOUNT_POINT"

cd /opt
git clone --depth 1 https://github.com/<org>/AxalonSystems.git repo
cd repo
ln -s "$MOUNT_POINT"/combined ml/data/combined
[ -d "$MOUNT_POINT/combined_coco" ] && ln -s "$MOUNT_POINT"/combined_coco ml/data/combined_coco

pip install -r ml/requirements.txt

case "$CANDIDATE" in
  yolo11x)
    python3 -m ml.scripts.train_ultralytics --config ml/configs/thermal_yolo11x.yaml
    ;;
  rtdetr-x)
    python3 -m ml.scripts.train_ultralytics --config ml/configs/thermal_rtdetr_x.yaml
    ;;
  codetr)
    git clone --depth 1 https://github.com/Sense-X/Co-DETR.git /opt/co-detr
    pip install -r /opt/co-detr/requirements.txt
    python3 -m ml.scripts.yolo_to_coco --combined-root ml/data/combined --out ml/data/combined_coco
    cd /opt/co-detr
    python tools/train.py /opt/repo/ml/configs/co_detr_thermal.py
    ;;
esac

shutdown -h now
