# Axalon Systems

Drone-based solar farm inspection platform using thermal IR imagery and AI anomaly detection.

## Repository Layout

| Directory | Description |
|-----------|-------------|
| `website/` | Company website — React frontend + Python backend |
| `ml/` | YOLOv8s model trained on 20k thermal IR images (11 anomaly classes) |
| `platform/` | Analysis platform — FastAPI API, Streamlit dashboard, reporting |
| `docs/` | Platform spec, research reports |
| `tests/` | Test suite |

## Quick Start

```bash
# Install ML dependencies
pip install -r ml/requirements.txt

# Install platform dependencies
pip install -r requirements_platform.txt

# Run inference on a thermal image folder
python main.py --input /path/to/thermal/images --output ./output

# Start the API
uvicorn platform.api.app:app --host 0.0.0.0 --port 8000

# Launch dashboard
streamlit run platform/ui/dashboard.py
```

## Model

- Architecture: YOLOv8s (Ultralytics)
- Weights: `ml/checkpoints/best.pt` (22 MB)
- Input: 640×640 thermal IR images
- Classes: 11 solar panel anomaly types
- Performance: 2,236 detections on 2,000-image test set

## Docs

- Full platform spec: [`docs/AXALON_PLATFORM_SPEC.md`](docs/AXALON_PLATFORM_SPEC.md)
- 2026 Solar Industry Report: [`docs/2026_Global_Solar_Report_Raptor_Maps.pdf`](docs/2026_Global_Solar_Report_Raptor_Maps.pdf)
