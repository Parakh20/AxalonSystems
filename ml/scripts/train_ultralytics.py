"""
train_ultralytics.py — shared Ultralytics trainer for the YOLO11x and RT-DETR-x
bake-off candidates.

Usage:
    python3 -m ml.scripts.train_ultralytics --config ml/configs/thermal_yolo11x.yaml
    python3 -m ml.scripts.train_ultralytics --config ml/configs/thermal_rtdetr_x.yaml
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path

import yaml

from ml.src.utils import get_logger

logger = get_logger(__name__)

_NON_TRAIN_KEYS = {"dataset_yaml", "model"}


def load_training_config(path: Path) -> dict:
    """Load a thermal_*.yaml training config."""
    return yaml.safe_load(Path(path).read_text())


def build_model(model_name: str):
    """Lazily construct the right Ultralytics model class for `model_name`."""
    if model_name.startswith("rtdetr"):
        from ultralytics import RTDETR
        return RTDETR(model_name)
    from ultralytics import YOLO
    return YOLO(model_name)


def _maybe_enable_wandb(model) -> None:
    """Attach W&B logging if WANDB_API_KEY is set in the environment; no-op otherwise."""
    if not os.environ.get("WANDB_API_KEY"):
        return
    import wandb
    from wandb.integration.ultralytics import add_wandb_callback

    wandb.login()
    add_wandb_callback(model, enable_model_checkpointing=True)
    logger.info("W&B logging enabled")


def run_training(config_path: Path) -> None:
    """Train the model described by `config_path` and log the result location."""
    cfg = load_training_config(config_path)
    model = build_model(cfg["model"])
    _maybe_enable_wandb(model)

    train_kwargs = {k: v for k, v in cfg.items() if k not in _NON_TRAIN_KEYS}
    train_kwargs["data"] = cfg["dataset_yaml"]

    logger.info("Starting training with config %s", config_path)
    model.train(**train_kwargs)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    run_training(Path(args.config))


if __name__ == "__main__":
    main()
