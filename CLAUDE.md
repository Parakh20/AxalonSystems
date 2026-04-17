# AxalonSystems — Claude Code Project Context

## Repository Structure

```
AxalonSystems/
├── website/                         ← Company website
│   ├── nextjs/                      ← NEW: Next.js 14 site — single R3F canvas, scroll-driven 3D
│   │   ├── scrollStore.ts           ← Module singleton: scrollStore.progress (0→1), zero re-renders
│   │   ├── app/layout.tsx           ← Root: DynamicMainScene (fixed canvas) + Navbar
│   │   ├── app/page.tsx             ← 600vh scroll container; 6 × ScrollSection with sticky overlays
│   │   ├── app/globals.css          ← Design tokens, fonts, responsive breakpoints
│   │   ├── components/Scene/
│   │   │   ├── MainScene.tsx        ← Root Canvas: lighting, Stars, SolarField, Drone, CameraRig, Bloom
│   │   │   ├── SolarField.tsx       ← 396 instanced panels + terrain + grid (1 draw call); thermal-scan ready
│   │   │   ├── Drone.tsx            ← Primitive drone: body+arms+rotors+gimbal, teal PointLight, sine hover
│   │   │   └── CameraRig.tsx        ← CatmullRomCurve3 path (6 waypoints), scroll→camera, FOV breathing
│   │   ├── components/UI/
│   │   │   └── HeroOverlay.tsx      ← Scene 1 HTML: word-reveal headline, stats, telemetry badge
│   │   ├── components/Navbar.tsx    ← Glass navbar, scroll-aware
│   │   └── components/DynamicMainScene.tsx ← ssr:false wrapper for MainScene
│   │   ├── components/Scene/ThermalScan.tsx ← Scene 2: scan line + scanning drone, scroll-driven
│   │   ├── components/Scene/SceneController.tsx ← Inside Canvas; maps scroll→per-scene progress
│   │   ├── components/UI/ThermalOverlay.tsx ← Scene 2 HTML: live fault counter, scan bar, class list
│   │   [NEXT: DetectionBoxes.tsx, DroneFleet.tsx, HologramPanel.tsx]
│   ├── frontend/                    ← OLD: CRA + Tailwind + shadcn/ui (deprecated)
│   ├── backend/                     ← Python/Flask API (contact form, etc.)
│   ├── design_guidelines.json       ← Brand colours, typography
│   └── render.yaml                  ← Render.com deployment config
│
├── ml/                              ← YOLOv8s Solar Anomaly Detection model
│   ├── checkpoints/best.pt          ← PRIMARY MODEL WEIGHTS (22 MB, YOLOv8s)
│   ├── src/utils.py                 ← CANONICAL classes, severity map, drawing utils
│   ├── src/dataset.py               ← Dataset utilities, class remapping
│   ├── src/augmentation.py          ← Thermal augmentation pipeline
│   ├── configs/thermal.yaml         ← Training configuration
│   ├── thermal_dataset.yaml         ← Class names YAML (11 classes)
│   ├── notebooks/                   ← Training & inference notebooks
│   ├── output/                      ← Inference results (results.csv, report JSON)
│   └── runs/                        ← Training run metadata
│
├── platform/                        ← Axalon Analysis Platform (in development)
│   ├── api/app.py                   ← FastAPI REST endpoints
│   ├── core/                        ← detector.py, fusion.py, geo.py
│   ├── park/                        ← Panel localization (OCR + auto-grid)
│   ├── pipeline/                    ← Ingest → detect → report orchestration
│   ├── reporting/                   ← PDF, Excel, GeoJSON outputs
│   ├── ui/dashboard.py              ← Streamlit dashboard
│   ├── db/                          ← SQLAlchemy models + SQLite
│   └── config/settings.yaml         ← Platform configuration
│
├── docs/                            ← Specs and reference documents
│   ├── AXALON_PLATFORM_SPEC.md      ← FULL platform design spec (READ THIS FIRST)
│   └── 2026_Global_Solar_Report_Raptor_Maps.pdf
│
├── tests/                           ← Test suite
├── main.py                          ← CLI entrypoint
├── requirements_platform.txt        ← Platform Python dependencies
└── ml/requirements.txt              ← ML Python dependencies
```

---

## Critical Rules — Read Before Making Changes

### 1. Never Redefine These — Import from `ml/src/utils.py`

```python
from ml.src.utils import (
    CANONICAL_CLASSES,       # list of 11 class names, indices matter
    CLASS2ID,                # {"cell": 0, "cell-multi": 1, ...}
    ID2CLASS,                # {0: "cell", 1: "cell-multi", ...}
    SEVERITY_MAP,            # class → severity level
    SEVERITY_COLOR_BGR,      # severity → BGR color tuple
    draw_detections_severity,
    read_yolo_label,
    write_yolo_label,
    yolo_to_pixel,
    load_bgr,
    get_logger,
)
```

> In older code (AxalonPIPE era) this was `solar_thermal_detection.src.utils` — the canonical path is now `ml.src.utils`.

### 2. Primary Model

- Path: `ml/checkpoints/best.pt`
- Framework: **Ultralytics YOLOv8s**
- Input size: **640×640** (resize handled by Ultralytics automatically)
- Confidence threshold: **0.25**
- Trained on thermal IR images — do NOT run on RGB directly

### 3. Class Order Is Fixed (IDs 0–10)

| ID | Class | Severity |
|----|-------|----------|
| 0 | cell | MEDIUM |
| 1 | cell-multi | MEDIUM |
| 2 | module | MEDIUM |
| 3 | string | CRITICAL |
| 4 | bypass-diode | CRITICAL |
| 5 | offline-module | HIGH |
| 6 | vegetation-shading | LOW |
| 7 | soiling | LOW |
| 8 | short-circuit | HIGH |
| 9 | hot-spot-low | HIGH |
| 10 | hot-spot-high | CRITICAL |

### 4. Detection Dict Format

```python
{
    "class": str,           # from CANONICAL_CLASSES
    "class_id": int,        # 0-10
    "confidence": float,
    "bbox": [x1, y1, x2, y2],    # pixel coords
    "bbox_norm": [cx, cy, w, h],  # YOLO normalized
    "severity": str,        # CRITICAL/HIGH/MEDIUM/LOW
    "color_bgr": tuple,     # BGR tuple
}
```

### 5. Module Structure

- **Website code** → `website/` only
- **ML/model code** → `ml/` only
- **Platform code** → `platform/` only
- **Do not cross-import** between website and platform
- Platform imports ML utils: `from ml.src.utils import ...`

### 6. Don't Touch Training Code

`ml/src/augmentation.py`, `ml/src/dataset.py`, and notebooks are stable.
Only modify if explicitly asked to retrain.

---

## Common Commands

```bash
# Quick model test
python -c "
from ultralytics import YOLO
model = YOLO('ml/checkpoints/best.pt')
results = model('ml/data/images/test/', conf=0.25)
print(f'Detected {sum(len(r.boxes) for r in results)} anomalies')
"

# Start platform API
uvicorn platform.api.app:app --host 0.0.0.0 --port 8000

# Launch dashboard
streamlit run platform/ui/dashboard.py

# Run website frontend (dev)
cd website/frontend && npm start

# Run website backend
cd website/backend && python server.py

# Install ML deps
pip install -r ml/requirements.txt

# Install platform deps
pip install -r requirements_platform.txt
```

---

## Development Context

- **ML Framework:** PyTorch 2.1+ with Ultralytics YOLOv8
- **Python:** 3.13 compatible
- **GPU:** CUDA supported (device=0), CPU fallback available
- **Dataset:** 20,000 thermal IR images (24×40px) — stored outside repo (large)
- **Training results:** 2,236 detections across 2,000 test images
  - 222 CRITICAL, 233 HIGH, 1,444 MEDIUM, 337 LOW

## Key Design Decisions

1. **Thermal-only detection:** YOLOv8s runs ONLY on thermal images.
2. **Two park modes:** "Numbered" parks use OCR; "Unnumbered" parks get synthetic R{row}-C{col} IDs.
3. **Severity from utils.py:** Single source of truth — never hardcode elsewhere.
4. **GPS-anchored localization:** Every anomaly carries GPS coordinates from EXIF or orthomosaic.
