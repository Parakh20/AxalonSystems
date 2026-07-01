#!/usr/bin/env bash
# train-vm-startup.sh — runs on first boot of a bake-off training VM.
# Clones the repo, mounts the pre-populated dataset disk, runs the training
# entrypoint for the candidate named in the "candidate" instance metadata key,
# then shuts the VM down so spot billing stops.
set -euo pipefail

CANDIDATE="$(curl -s -H 'Metadata-Flavor: Google' \
  'http://metadata.google.internal/computeMetadata/v1/instance/attributes/candidate')"

if [ -z "$CANDIDATE" ]; then
  echo "ERROR: candidate metadata is empty — aborting before wasting the VM" >&2
  exit 1
fi

DATA_DEVICE="/dev/disk/by-id/google-thermal-dataset-disk"
MOUNT_POINT="/mnt/dataset"

mkdir -p "$MOUNT_POINT"
mount -o discard,defaults "$DATA_DEVICE" "$MOUNT_POINT"

# The repo is private, so a short-lived GitHub token is passed in as instance
# metadata at VM-creation time (never committed to this script or the repo).
GITHUB_TOKEN="$(curl -s -H 'Metadata-Flavor: Google' \
  'http://metadata.google.internal/computeMetadata/v1/instance/attributes/github-token' || true)"

cd /opt
if [ -n "$GITHUB_TOKEN" ]; then
  git clone --depth 1 "https://${GITHUB_TOKEN}@github.com/Parakh20/AxalonSystems.git" repo
else
  git clone --depth 1 https://github.com/Parakh20/AxalonSystems.git repo
fi
cd repo
# ml/data/ is gitignored build output, so it doesn't exist in a fresh clone.
mkdir -p ml/data
ln -s "$MOUNT_POINT"/combined ml/data/combined
if [ -d "$MOUNT_POINT/combined_coco" ]; then
  ln -s "$MOUNT_POINT"/combined_coco ml/data/combined_coco
fi

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
    python /opt/co-detr/tools/train.py ml/configs/co_detr_thermal.py
    ;;
  *)
    echo "ERROR: unknown candidate '$CANDIDATE'" >&2
    exit 1
    ;;
esac

shutdown -h now
