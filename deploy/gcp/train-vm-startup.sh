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

# Optional W&B API key, same pattern — enables live training dashboards when
# present, no-op (per _maybe_enable_wandb in train_ultralytics.py) when absent.
export WANDB_API_KEY="$(curl -s -H 'Metadata-Flavor: Google' \
  'http://metadata.google.internal/computeMetadata/v1/instance/attributes/wandb-api-key' || true)"

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

# Symlink the run-output directory onto the persistent dataset disk (survives
# spot preemption / VM deletion, unlike the boot disk) so checkpoints saved by
# a preempted run are still there when a fresh VM boots for the same candidate.
mkdir -p "$MOUNT_POINT/runs"
ln -s "$MOUNT_POINT"/runs runs

# The image ships the CUDA driver only, not a Python/pip toolchain, and
# opencv-python needs libGL which this minimal server image also lacks.
apt-get update -qq
apt-get install -y -qq python3-pip libgl1
python3 -m pip install -r ml/requirements.txt

# This repo's own platform/ directory (at repo root) shadows the stdlib
# platform module whenever cwd is the repo root and lands on sys.path, which
# `python3 -m` always does. PYTHONSAFEPATH only fixes this on Python 3.11+,
# and this image ships 3.10. Fix: launch python3 from /opt (parent of repo,
# no platform/ dir there) so `import platform` caches the real stdlib module
# in sys.modules *before* the repo directory is added to sys.path — later
# imports (numpy/matplotlib/etc.) hit the cache and never see the shadow.
# Verified locally: running this from the repo root itself does NOT work,
# since cwd is already shadowed before the pre-import line even runs.
run_py_module() {
  local module="$1"; shift
  (cd /opt && python3 -c "
import platform, uuid  # cwd is /opt here — no shadow yet
import os, runpy, sys
os.chdir('/opt/repo')
sys.path.insert(0, '/opt/repo')
sys.argv = ['$module'] + sys.argv[1:]
runpy.run_module('$module', run_name='__main__')
" "$@")
}

# Ultralytics run names follow "<candidate-with-underscores>_solar" per the
# thermal_*.yaml configs (e.g. yolo11x -> yolo11x_solar, rtdetr-x -> rtdetr_x_solar).
# Locate any prior last.pt for this candidate on the persistent disk (present
# only if a previous attempt for this exact candidate was preempted mid-run).
find_last_checkpoint() {
  local run_name="$1"
  find "$MOUNT_POINT/runs" -path "*${run_name}*weights/last.pt" 2>/dev/null | head -1
}

case "$CANDIDATE" in
  yolo11x)
    LAST_CKPT="$(find_last_checkpoint yolo11x_solar)"
    if [ -n "$LAST_CKPT" ]; then
      echo "Resuming from $LAST_CKPT"
      run_py_module ml.scripts.train_ultralytics --config ml/configs/thermal_yolo11x.yaml --resume-from "$LAST_CKPT"
    else
      run_py_module ml.scripts.train_ultralytics --config ml/configs/thermal_yolo11x.yaml
    fi
    ;;
  rtdetr-x)
    LAST_CKPT="$(find_last_checkpoint rtdetr_x_solar)"
    if [ -n "$LAST_CKPT" ]; then
      echo "Resuming from $LAST_CKPT"
      run_py_module ml.scripts.train_ultralytics --config ml/configs/thermal_rtdetr_x.yaml --resume-from "$LAST_CKPT"
    else
      run_py_module ml.scripts.train_ultralytics --config ml/configs/thermal_rtdetr_x.yaml
    fi
    ;;
  codetr)
    # No resume support here yet — MMDetection has its own --resume flag/
    # mechanism, separate from the Ultralytics path above; add if/when this
    # candidate is actually run and preemption becomes a real issue for it.
    git clone --depth 1 https://github.com/Sense-X/Co-DETR.git /opt/co-detr
    python3 -m pip install -r /opt/co-detr/requirements.txt
    run_py_module ml.scripts.yolo_to_coco --combined-root ml/data/combined --out ml/data/combined_coco
    python3 /opt/co-detr/tools/train.py ml/configs/co_detr_thermal.py
    ;;
  *)
    echo "ERROR: unknown candidate '$CANDIDATE'" >&2
    exit 1
    ;;
esac

shutdown -h now
