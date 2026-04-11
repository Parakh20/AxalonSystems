# Installation Guide

## Prerequisites

- Python 3.11+
- CUDA 11.8+ (optional — CPU fallback available)
- 4GB+ RAM (8GB recommended for large parks)

## Install

```bash
git clone <repo-url> AxalonSystems
cd AxalonSystems

# Install ML dependencies
pip install -r ml/requirements.txt

# Install platform dependencies
pip install -r requirements_platform.txt

# Register axalon + ml packages (replaces all sys.path hacks)
pip install -e .
```

## System libraries for PDF reports

```bash
# Ubuntu/Debian
sudo apt install -y libpango-1.0-0 libpangoft2-1.0-0 libpangocairo-1.0-0

# macOS
brew install pango
```

## Verify installation

```bash
python -c "from axalon.core.detector import SolarDetector; print('OK')"
python -c "from ml.src.utils import CANONICAL_CLASSES; print(f'{len(CANONICAL_CLASSES)} classes loaded')"
```

## Model weights

Place `best.pt` at `ml/checkpoints/best.pt` (22 MB, YOLOv8s trained on InfraredSolarModules dataset).
