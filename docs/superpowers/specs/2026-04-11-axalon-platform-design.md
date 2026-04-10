# Axalon Solar Inspection Platform — Design Spec

**Date:** 2026-04-11  
**Status:** Approved — ready for implementation  
**Architecture:** FastAPI backend · Streamlit operator dashboard · PDF/Excel/GeoJSON client deliverables

---

## 1. Context & Goals

Axalon Systems operates drone-based solar farm inspections using a Skydroid C13 dual-sensor camera (thermal IR + RGB). A pre-trained YOLOv8s model (`ml/checkpoints/best.pt`) detects 11 anomaly classes in thermal imagery. The platform processes raw flight images into structured inspection reports delivered to three audiences:

| Audience | Primary interface |
|----------|------------------|
| Engineer (you) | CLI + Streamlit dashboard |
| Field operator | Streamlit dashboard |
| Client (solar farm owner) | PDF + Excel + read-only web report link |

**Deployment progression:**
1. **Phase 1 (now):** Local machine — `python main.py` or `streamlit run`
2. **Phase 2:** Cloud VM — `docker compose up`, hosted at `app.axalonsystems.com`
3. **Phase 3:** Self-hosted server with multi-tenant client accounts

This spec covers the Phase 1 build with Phase 2 migration requiring zero rewrites.

---

## 2. Architecture Decision

**Chosen: Option B — FastAPI backend + Streamlit operator dashboard + report delivery**

One shared Python engine called by three entry points: CLI, REST API, Streamlit. No duplicated logic. All three produce identical outputs.

```
CLI (main.py)  ──┐
FastAPI (:8000) ──┼──► InspectionOrchestrator ──► SQLite DB
Streamlit (:8501)──┘         │
                              ├── SolarDetector (YOLOv8s)
                              ├── ParkLayoutDetector (auto-grid)
                              ├── ImageFusion (thermal→RGB overlay)
                              ├── GeoLocator (EXIF GPS → coordinates)
                              └── ReportGenerator (PDF · Excel · GeoJSON)
```

---

## 3. What Gets Fixed (Existing Code Bugs)

All existing platform files have broken import paths from the pre-monorepo structure. These must be fixed before anything else works.

| Problem | Fix |
|---------|-----|
| All files: `sys.path.insert(0, "solar_thermal_detection")` | Remove sys.path hacks; use `pyproject.toml` package registration |
| All imports: `from src.utils import ...` | `from ml.src.utils import ...` |
| All imports: `from axalon_platform.X import` | `from platform.X import` — BUT `platform` is a Python stdlib name, so rename the package to `axalon` |
| `settings.yaml`: `weights: solar_thermal_detection/checkpoints/best.pt` | `weights: ml/checkpoints/best.pt` |
| `platform/core/detector.py`: hardcoded old weights path | Use `settings.yaml` path |
| `main.py`: `subprocess.run(["streamlit", "run", "axalon_platform/ui/dashboard.py"])` | Fix to `platform/ui/dashboard.py` |
| Panel IDs never assigned: orchestrator runs `detect()` but never calls `ParkLayoutDetector` | Wire localization into orchestrator after detection |

> **Package naming:** Python's stdlib has a `platform` module. To avoid shadowing it, the `platform/` directory registers as package `axalon` via `pyproject.toml`. All internal imports use `from axalon.X import ...`.

---

## 4. What Gets Built From Scratch

### 4.1 `pyproject.toml` (package registration)
Registers two editable packages: `axalon` (from `platform/`) and `ml` (from `ml/`). Replaces all `sys.path` hacks.

### 4.2 `platform/db/models.py` (SQLAlchemy models)
Four tables (added `panel_grid` for park-wide layout):
- `parks` — park_id, name, mode (auto-grid/numbered), total_panels, created_at
- `inspections` — id, park_id, flight_date, total_images, summary JSON, batch_id
- `detections` — id, inspection_id, image_id, panel_id, class, severity, confidence, bbox JSON, gps JSON

SQLite for Phase 1. The `database.url` in `settings.yaml` switches to PostgreSQL for Phase 2 with no code changes.

### 4.3 `platform/db/session.py`
SQLAlchemy engine + session factory. Single function `get_session()` used everywhere.

### 4.4 Park localization wired into orchestrator
After `SolarDetector.predict()`, the orchestrator passes all detections through `ParkLayoutDetector`:
1. Detect panel rectangles from RGB image via Canny contours
2. Cluster into rows/cols → assign `R{row}-C{col}` IDs
3. Match each detection bbox center to nearest panel → assign `panel_id`
4. Store the full panel grid in the DB

Fallback: if no RGB image provided, panel_id is set to `"R?-C?"` (location unknown).

### 4.5 Complete Streamlit dashboard (5 pages)

**Primary workflow is batch processing an entire park's images in one go.** Single-image inspect is a debug/test tool, not the daily workflow.

| Page | Priority | Content |
|------|----------|---------|
| 📦 **Batch** | **PRIMARY** | Point to local flight folder (path input, not file upload — parks have hundreds of images too large to upload) → live progress bar per image → full park report on completion → download PDF/Excel/GeoJSON |
| 🗺 **Park Map** | **PRIMARY** | Select park + inspection date → color-coded grid (red=CRITICAL, orange=HIGH, yellow=MEDIUM, green=OK) → click cell for anomaly detail + thumbnail |
| 🔍 **Inspect** | secondary | Upload single thermal+RGB pair → quick test/debug → see detections immediately |
| 📋 **History** | secondary | Table of all past inspections per park → trend charts (detections over time per severity) |
| ⚙ **Settings** | secondary | Edit model confidence, drone altitude default, camera params — written to `settings.yaml` |

**Batch page design detail:** Takes a folder path (not a file upload) so it can handle hundreds of images without browser transfer limits. Streams results to the UI using Streamlit's `st.empty()` update pattern — the park grid map updates live as each image is processed.

### 4.6 Polished PDF report template
`platform/reporting/templates/report.html` rebuilt with:
- Cover page: Axalon logo, park name, flight date, operator
- Executive summary: severity donut chart, key findings
- Anomaly table: sorted by severity, with panel IDs and GPS
- Annotated image gallery: up to 20 worst anomalies with thumbnails
- Footer: Axalon branding + page numbers

### 4.7 Docker setup
- `Dockerfile` — Python 3.11 slim, installs all deps, exposes ports 8000 (API) and 8501 (Streamlit)
- `docker-compose.yml` — services: `api` (FastAPI), `dashboard` (Streamlit), `db` (volume-backed SQLite for Phase 1)
- `.dockerignore` — excludes model weights (mounted as volume), datasets, output

### 4.8 Documentation files
| File | Purpose |
|------|---------|
| `README.md` | Project overview, quick start, architecture diagram |
| `docs/HOW_TO_USE.md` | Step-by-step usage: CLI, dashboard, API — with examples |
| `docs/INSTALLATION.md` | Full setup guide: pip install, CUDA setup, Skydroid C13 folder conventions |
| `docs/FOLDER_CONVENTIONS.md` | How to organize Skydroid C13 output for ingestion (supports both flat and subdir layouts) |
| `docs/ANOMALY_CLASSES.md` | All 11 classes with descriptions, severity rationale, example images |
| `docs/API_REFERENCE.md` | All FastAPI endpoints with request/response examples |
| `docs/DEPLOYMENT.md` | Docker deployment guide, Phase 2 cloud migration steps |
| `CLAUDE.md` | Updated with new package names and import paths |

---

## 5. Data Flow (full park batch — primary workflow)

```
PHASE 1 — Build park-wide panel grid (before detection)
  Input:    flight_folder/ with N thermal + N RGB image pairs
  Step 1a:  Ingest: find_image_pairs() → list of (thermal, rgb) pairs
  Step 1b:  For ALL rgb images → ParkLayoutDetector.detect_panels()
            → merge all detected panels across images into a single
              park-wide panel map with canonical R{row}-C{col} IDs
            → store panel_grid in DB (park_id, rows, cols, panel_map)
            → this happens ONCE per batch, not per image

PHASE 2 — Process each image pair (streaming, one at a time)
  For each (thermal, rgb) pair:
    Step 2a: YOLOv8s inference on thermal → detections list
    Step 2b: Geo-tag: EXIF GPS + altitude + GSD → {lat, lon} per detection
    Step 2c: Match each detection center → nearest panel in park-wide grid
             → assigns panel_id "R3-C7" or "R?-C?" if no grid available
    Step 2d: ImageFusion: project thermal bboxes onto RGB → annotated_rgb.jpg
    Step 2e: Draw severity-colored bboxes on thermal → annotated_thermal.jpg
    Step 2f: Write detections to SQLite (streamed — not held in RAM)
    Step 2g: Emit progress event → Streamlit park grid map updates live

PHASE 3 — Generate reports (after all images processed)
    → inspection_report.pdf    (cover + summary + anomaly table + image gallery)
    → inspection_report.xlsx   (4 sheets: Summary, Detections, Priority, GPS)
    → park_anomaly_map.geojson (one point per detection with GPS coords)
    → annotated images saved to output/{batch_id}/annotated/
```

**Memory model:** Images are processed one at a time and immediately written to DB. Only the park-wide panel grid (small — just bboxes and IDs) is held in RAM throughout the batch. This handles parks with thousands of images on a laptop.

---

## 6. Folder Conventions for Skydroid C13

The ingestion engine auto-detects two layouts:

**Layout A (subdirectory):**
```
flight_mission/
├── thermal/   ← thermal IR images: thermal_001.jpg, thermal_002.jpg ...
└── rgb/       ← RGB images:         rgb_001.jpg, rgb_002.jpg ...
```

**Layout B (flat folder):**
```
flight_mission/
├── IR_001.jpg, IR_002.jpg ...   ← thermal (detected by "IR" prefix)
└── RGB_001.jpg, RGB_002.jpg ... ← RGB (detected by "RGB" prefix)
```

Pairing is done by numeric suffix. `mission_metadata.json` (optional) can override altitude and camera params.

---

## 7. Package Structure (after fixes)

```
AxalonSystems/
├── pyproject.toml              ← registers `axalon` and `ml` packages
├── main.py                     ← CLI entry point
├── requirements_platform.txt
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
│
├── ml/                         ← ML package (registered as `ml`)
│   ├── src/
│   │   ├── utils.py            ← CANONICAL — never redefine elsewhere
│   │   ├── dataset.py
│   │   └── augmentation.py
│   ├── checkpoints/best.pt     ← model weights
│   ├── configs/thermal.yaml
│   ├── notebooks/
│   ├── output/
│   └── requirements.txt
│
├── platform/                   ← Axalon platform (registered as `axalon`)
│   ├── __init__.py
│   ├── api/app.py              ← FastAPI REST API
│   ├── config/settings.yaml    ← all config (fixed paths)
│   ├── core/
│   │   ├── detector.py         ← YOLOv8s wrapper (fixed imports)
│   │   ├── fusion.py           ← thermal→RGB alignment (fixed imports)
│   │   └── geo.py              ← GPS/EXIF extraction
│   ├── db/
│   │   ├── models.py           ← NEW: SQLAlchemy Park, Inspection, Detection
│   │   └── session.py          ← NEW: engine + session factory
│   ├── park/
│   │   ├── layout.py           ← auto-grid panel detection (fixed imports)
│   │   └── numbering.py        ← OCR panel IDs (fixed imports)
│   ├── pipeline/
│   │   ├── ingest.py           ← image pair finder (fixed imports)
│   │   └── orchestrator.py     ← wired with localization + DB (fixed)
│   ├── reporting/
│   │   ├── report.py           ← PDF + Excel + JSON (fixed imports)
│   │   ├── geojson_writer.py   ← GeoJSON export (fixed)
│   │   └── templates/
│   │       └── report.html     ← REBUILT: polished PDF template
│   └── ui/
│       └── dashboard.py        ← COMPLETE: 5-page Streamlit app
│
├── website/                    ← Marketing site (unchanged)
├── docs/
│   ├── AXALON_PLATFORM_SPEC.md ← original spec (reference)
│   ├── HOW_TO_USE.md           ← NEW
│   ├── INSTALLATION.md         ← NEW
│   ├── FOLDER_CONVENTIONS.md   ← NEW
│   ├── ANOMALY_CLASSES.md      ← NEW
│   ├── API_REFERENCE.md        ← NEW
│   └── DEPLOYMENT.md           ← NEW
├── tests/
└── CLAUDE.md                   ← updated
```

---

## 8. Database Schema

```sql
CREATE TABLE parks (
    id          TEXT PRIMARY KEY,    -- e.g. "PARK_01"
    name        TEXT,
    mode        TEXT DEFAULT 'auto', -- 'auto' | 'numbered'
    total_panels INTEGER DEFAULT 0,
    rows        INTEGER DEFAULT 0,
    cols        INTEGER DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE inspections (
    id          TEXT PRIMARY KEY,    -- e.g. "BATCH-PARK_01-20260411-143022"
    park_id     TEXT REFERENCES parks(id),
    flight_date DATE,
    total_images INTEGER,
    total_detections INTEGER,
    summary     TEXT,               -- JSON: {"CRITICAL":3,"HIGH":2,...}
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE detections (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    inspection_id TEXT REFERENCES inspections(id),
    image_id      TEXT,
    panel_id      TEXT,             -- "R3-C7" or "R?-C?"
    class         TEXT,
    class_id      INTEGER,
    severity      TEXT,
    confidence    REAL,
    bbox          TEXT,             -- JSON [x1,y1,x2,y2]
    gps           TEXT,             -- JSON {"lat":28.4,"lon":77.1} or null
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 9. API Endpoints (FastAPI)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/inspect` | Single thermal+RGB pair → returns detections immediately |
| POST | `/batch` | ZIP of flight folder → background job |
| GET | `/status/{job_id}` | Job progress (0.0–1.0) |
| GET | `/report/{job_id}?format=pdf\|excel\|geojson\|json` | Download report |
| GET | `/park/{park_id}` | Park summary + inspection history |
| GET | `/parks` | List all parks |
| GET | `/health` | Model loaded, version info |

---

## 10. Constraints & Non-Goals

- **No user authentication** in Phase 1 — single-operator local use. Phase 2 adds basic API key auth.
- **No real-time video** — batch image processing only.
- **No cloud storage** in Phase 1 — all outputs written to local `output/` directory.
- **OCR panel numbering** is built but not the primary path — auto-grid is primary.
- **No mobile app** — browser-based Streamlit is sufficient for field operators.
- **Training code untouched** — `ml/src/augmentation.py`, `ml/src/dataset.py`, and notebooks are stable.
