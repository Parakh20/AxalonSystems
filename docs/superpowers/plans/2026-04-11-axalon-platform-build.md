# Axalon Platform Build — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete solar anomaly inspection platform — FastAPI backend, 5-page Streamlit dashboard, SQLite persistence, polished PDF/Excel/GeoJSON reporting — for batch processing drone flight images from Skydroid C13 cameras.

**Architecture:** Three entry points (CLI `main.py`, FastAPI `:8000`, Streamlit `:8501`) share one Python engine (`InspectionOrchestrator`). Batch is the primary workflow: build park-wide panel grid from all RGB images first, then stream thermal images one at a time writing detections to SQLite. Reports generated after all images processed.

**Tech Stack:** Python 3.11+, Ultralytics YOLOv8s, FastAPI, Streamlit, SQLAlchemy 2.x + SQLite, openpyxl, WeasyPrint + Jinja2, OpenCV, piexif, Docker

---

## File Map

**Create:**
- `pyproject.toml` — registers `axalon` (from `platform/`) and `ml` packages
- `platform/db/models.py` — SQLAlchemy Park, Inspection, Detection ORM models
- `platform/db/session.py` — engine + `get_session()` factory
- `platform/reporting/templates/report.html` — polished Jinja2 PDF template (rebuild)
- `Dockerfile` — Python 3.11 slim, ports 8000 + 8501
- `docker-compose.yml` — api + dashboard + db services
- `.dockerignore` — exclude weights, datasets, output
- `tests/__init__.py`, `tests/test_imports.py`, `tests/test_db.py`, `tests/test_orchestrator.py`, `tests/test_api.py`, `tests/test_reporting.py`
- `docs/HOW_TO_USE.md`, `docs/INSTALLATION.md`, `docs/FOLDER_CONVENTIONS.md`, `docs/ANOMALY_CLASSES.md`, `docs/API_REFERENCE.md`, `docs/DEPLOYMENT.md`

**Modify:**
- `platform/config/settings.yaml` — fix `weights:` path
- `platform/core/detector.py` — remove sys.path, fix imports, use settings path
- `platform/core/fusion.py` — remove sys.path, fix imports
- `platform/core/geo.py` — remove sys.path, fix imports
- `platform/park/layout.py` — remove sys.path, fix imports
- `platform/park/numbering.py` — remove sys.path, fix imports
- `platform/pipeline/ingest.py` — remove sys.path, fix imports
- `platform/pipeline/orchestrator.py` — remove sys.path, fix imports, wire ParkLayoutDetector, add DB writes
- `platform/reporting/report.py` — remove sys.path, fix imports
- `platform/reporting/geojson_writer.py` — fix imports
- `platform/api/app.py` — fix imports, wire DB for persistence
- `platform/ui/dashboard.py` — complete 5-page dashboard
- `main.py` — fix imports, fix dashboard path

---

## Task 1: Package Registration (pyproject.toml)

**Why this first:** Every other task depends on `from ml.src.utils import ...` and `from axalon.X import ...` working. This single file replaces all `sys.path.insert()` hacks across the codebase. Run `pip install -e .` once after this task — done.

**Files:**
- Create: `pyproject.toml`
- Create: `platform/__init__.py` (already exists, keep as-is)
- Create: `tests/__init__.py`
- Create: `tests/test_imports.py`

- [ ] **Step 1: Write the failing import test**

Create `tests/test_imports.py`:

```python
"""Verify that both registered packages are importable after pip install -e ."""


def test_ml_utils_importable():
    from ml.src.utils import (
        CANONICAL_CLASSES, CLASS2ID, ID2CLASS,
        SEVERITY_MAP, SEVERITY_COLOR_BGR,
        draw_detections_severity, read_yolo_label, write_yolo_label,
        yolo_to_pixel, load_bgr, get_logger,
    )
    assert len(CANONICAL_CLASSES) == 11
    assert CLASS2ID["cell"] == 0
    assert SEVERITY_MAP["hot-spot-high"] == "CRITICAL"


def test_axalon_core_importable():
    from axalon.core.detector import SolarDetector
    from axalon.core.fusion import ImageFusion
    from axalon.core.geo import extract_gps_exif


def test_axalon_pipeline_importable():
    from axalon.pipeline.ingest import find_image_pairs
    from axalon.pipeline.orchestrator import InspectionOrchestrator


def test_axalon_reporting_importable():
    from axalon.reporting.report import generate_json_report, generate_excel_report
    from axalon.reporting.geojson_writer import write_geojson


def test_axalon_park_importable():
    from axalon.park.layout import ParkLayoutDetector
```

- [ ] **Step 2: Run test — expect ImportError (packages not registered yet)**

```bash
cd /home/parakh/Desktop/AxalonSystems
python -m pytest tests/test_imports.py -v 2>&1 | head -30
```

Expected: `ModuleNotFoundError: No module named 'ml'`

- [ ] **Step 3: Create pyproject.toml**

Create `pyproject.toml` at repo root:

```toml
[build-system]
requires = ["setuptools>=68"]
build-backend = "setuptools.backends.legacy:build"

[project]
name = "axalon-systems"
version = "1.0.0"
requires-python = ">=3.11"
dependencies = []   # runtime deps in requirements_platform.txt

[tool.setuptools.packages.find]
# Register platform/ as package 'axalon' and ml/ as package 'ml'
where = ["."]
include = ["platform*", "ml*"]

[tool.setuptools.package-dir]
# Map Python package name → directory on disk
"axalon" = "platform"
"ml" = "ml"
```

- [ ] **Step 4: Install packages in editable mode**

```bash
pip install -e . --quiet
```

Expected: installs without errors. Verify:
```bash
python -c "import axalon; import ml; print('OK')"
```

- [ ] **Step 5: Run import test — still fails (imports inside files still use old paths)**

```bash
python -m pytest tests/test_imports.py::test_ml_utils_importable -v
```

Expected: PASS (ml.src.utils itself has no internal broken imports)

```bash
python -m pytest tests/test_imports.py::test_axalon_core_importable -v
```

Expected: FAIL with `ModuleNotFoundError: No module named 'src'` (detector.py still has sys.path hack)

- [ ] **Step 6: Commit pyproject.toml and test**

```bash
git add pyproject.toml tests/__init__.py tests/test_imports.py
git commit -m "feat: add pyproject.toml for axalon+ml package registration"
```

---

## Task 2: Fix All Import Paths

**Why:** After pyproject.toml, every file still has `sys.path.insert(0, str(_REPO_ROOT / "solar_thermal_detection"))` pointing at a directory that no longer exists. Each file needs two changes: (1) remove the sys.path block, (2) rewrite `from src.utils import` → `from ml.src.utils import` and `from axalon_platform.X` → `from axalon.X import`.

**Files:**
- Modify: `platform/core/detector.py`
- Modify: `platform/core/fusion.py`
- Modify: `platform/core/geo.py`
- Modify: `platform/park/layout.py`
- Modify: `platform/park/numbering.py`
- Modify: `platform/pipeline/ingest.py`
- Modify: `platform/pipeline/orchestrator.py`
- Modify: `platform/reporting/report.py`
- Modify: `platform/reporting/geojson_writer.py`
- Modify: `platform/api/app.py`
- Modify: `platform/ui/dashboard.py`
- Modify: `platform/config/settings.yaml`
- Modify: `main.py`

- [ ] **Step 1: Fix settings.yaml weights path**

In `platform/config/settings.yaml`, change line:
```yaml
  weights: solar_thermal_detection/checkpoints/best.pt
```
To:
```yaml
  weights: ml/checkpoints/best.pt
```

- [ ] **Step 2: Fix detector.py**

Replace the entire import block in `platform/core/detector.py` (lines 1–32):

```python
"""
detector.py — YOLOv8s inference wrapper for solar anomaly detection.

Model weights at: ml/checkpoints/best.pt
Import severity/class constants ONLY from ml.src.utils — never redefine here.
"""

from __future__ import annotations

import time
from pathlib import Path

import cv2
import numpy as np

from ml.src.utils import (
    CANONICAL_CLASSES,
    SEVERITY_MAP,
    SEVERITY_COLOR_BGR,
    yolo_to_pixel,
    get_logger,
)

logger = get_logger("axalon.detector")

_REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_WEIGHTS = _REPO_ROOT / "ml" / "checkpoints" / "best.pt"
```

- [ ] **Step 3: Fix fusion.py**

Replace the sys.path block in `platform/core/fusion.py`:
```python
# DELETE these lines:
_REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_REPO_ROOT / "solar_thermal_detection"))
from src.utils import get_logger

# REPLACE WITH:
from ml.src.utils import get_logger
```

Also remove `import sys` if it's only used for sys.path.

- [ ] **Step 4: Fix geo.py**

Replace the sys.path block in `platform/core/geo.py`:
```python
# DELETE these lines:
_REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_REPO_ROOT / "solar_thermal_detection"))
from src.utils import get_logger

# REPLACE WITH:
from ml.src.utils import get_logger
```

- [ ] **Step 5: Fix layout.py**

Replace the sys.path block in `platform/park/layout.py`:
```python
# DELETE these lines:
_REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_REPO_ROOT / "solar_thermal_detection"))
from src.utils import get_logger

# REPLACE WITH:
from ml.src.utils import get_logger
```

- [ ] **Step 6: Fix numbering.py**

Replace the sys.path block in `platform/park/numbering.py`:
```python
# DELETE sys.path block and:
# from src.utils import get_logger
# REPLACE WITH:
from ml.src.utils import get_logger
```

- [ ] **Step 7: Fix ingest.py**

Replace the sys.path block in `platform/pipeline/ingest.py`:
```python
# DELETE sys.path block and:
# from src.utils import get_logger
# REPLACE WITH:
from ml.src.utils import get_logger
```

- [ ] **Step 8: Fix orchestrator.py imports**

Replace the entire import section in `platform/pipeline/orchestrator.py`:
```python
"""
orchestrator.py — Full inspection pipeline orchestrator.

Runs the complete pipeline for one or many image pairs:
  ingest → detect → localize → fuse → store → report
"""

from __future__ import annotations

import uuid
from datetime import datetime, date
from pathlib import Path

from ml.src.utils import draw_detections_severity, load_bgr, get_logger

from axalon.core.detector import SolarDetector
from axalon.core.fusion import ImageFusion
from axalon.core.geo import detection_to_gps, extract_gps_exif
from axalon.pipeline.ingest import find_image_pairs, load_mission_metadata, validate_pair

logger = get_logger("axalon.orchestrator")
```

Also remove `import sys` if present.

- [ ] **Step 9: Fix reporting/report.py**

Replace the sys.path block in `platform/reporting/report.py`:
```python
# DELETE sys.path block and:
# from src.utils import CANONICAL_CLASSES, SEVERITY_MAP, get_logger
# REPLACE WITH:
from ml.src.utils import CANONICAL_CLASSES, SEVERITY_MAP, get_logger
```

- [ ] **Step 10: Fix reporting/geojson_writer.py**

Replace any sys.path block and `from axalon_platform.X` imports:
```python
# If it imports from axalon_platform:
# from axalon_platform.reporting.report import ...
# REPLACE WITH:
# from axalon.reporting.report import ...
```

Also fix any `from src.utils` → `from ml.src.utils`.

- [ ] **Step 11: Fix api/app.py**

Replace any broken imports:
```python
# from axalon_platform.pipeline.orchestrator import ...
# → from axalon.pipeline.orchestrator import ...

# from axalon_platform.core.detector import ...
# → from axalon.core.detector import ...
```

- [ ] **Step 12: Fix ui/dashboard.py**

Replace the import block at the top of `platform/ui/dashboard.py`:
```python
# DELETE:
_REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_REPO_ROOT / "solar_thermal_detection"))
from src.utils import SEVERITY_COLOR_BGR, draw_detections_severity, get_logger

from axalon_platform.pipeline.orchestrator import InspectionOrchestrator
from axalon_platform.reporting.report import generate_excel_report, generate_json_report
from axalon_platform.reporting.geojson_writer import write_geojson

# REPLACE WITH:
from ml.src.utils import SEVERITY_COLOR_BGR, draw_detections_severity, get_logger

from axalon.pipeline.orchestrator import InspectionOrchestrator
from axalon.reporting.report import generate_excel_report, generate_json_report
from axalon.reporting.geojson_writer import write_geojson
```

- [ ] **Step 13: Fix main.py**

Replace the subprocess call in `main.py` that references old path:
```python
# DELETE:
subprocess.run(["streamlit", "run", "axalon_platform/ui/dashboard.py"])

# REPLACE WITH:
subprocess.run(["streamlit", "run", "platform/ui/dashboard.py"])
```

Also fix any imports referencing `axalon_platform`:
```python
# from axalon_platform.X import ... → from axalon.X import ...
```

- [ ] **Step 14: Run all import tests — expect PASS**

```bash
python -m pytest tests/test_imports.py -v
```

Expected output:
```
PASSED tests/test_imports.py::test_ml_utils_importable
PASSED tests/test_imports.py::test_axalon_core_importable
PASSED tests/test_imports.py::test_axalon_pipeline_importable
PASSED tests/test_imports.py::test_axalon_reporting_importable
PASSED tests/test_imports.py::test_axalon_park_importable
```

- [ ] **Step 15: Commit**

```bash
git add platform/ main.py
git commit -m "fix: remove sys.path hacks, use registered axalon+ml package names"
```

---

## Task 3: Database Layer

**Why:** The orchestrator needs to persist detections per-image as they stream in (memory model: never hold entire batch in RAM). SQLAlchemy models must exist before orchestrator can be rewired.

**Files:**
- Create: `platform/db/models.py`
- Create: `platform/db/session.py`
- Create: `tests/test_db.py`
- Modify: `platform/db/__init__.py`

- [ ] **Step 1: Write failing DB tests**

Create `tests/test_db.py`:

```python
"""Test SQLAlchemy models and session factory."""
import pytest
from datetime import date
from sqlalchemy import create_engine
from sqlalchemy.orm import Session


@pytest.fixture
def engine():
    """In-memory SQLite for tests — no file created."""
    from axalon.db.models import Base
    eng = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(eng)
    yield eng
    eng.dispose()


@pytest.fixture
def session(engine):
    from axalon.db.session import get_session
    with get_session(engine) as s:
        yield s


def test_create_park(session):
    from axalon.db.models import Park
    park = Park(id="PARK_01", name="Test Solar Farm", mode="auto")
    session.add(park)
    session.commit()
    result = session.get(Park, "PARK_01")
    assert result.name == "Test Solar Farm"
    assert result.mode == "auto"


def test_create_inspection(session):
    from axalon.db.models import Park, Inspection
    park = Park(id="PARK_01", name="Test Farm", mode="auto")
    session.add(park)
    insp = Inspection(
        id="BATCH-PARK_01-20260411",
        park_id="PARK_01",
        flight_date=date(2026, 4, 11),
        total_images=10,
        total_detections=3,
        summary='{"CRITICAL":1,"HIGH":1,"MEDIUM":1,"LOW":0}',
    )
    session.add(insp)
    session.commit()
    result = session.get(Inspection, "BATCH-PARK_01-20260411")
    assert result.park_id == "PARK_01"
    assert result.total_detections == 3


def test_create_detection(session):
    from axalon.db.models import Park, Inspection, Detection
    session.add(Park(id="P1", name="F", mode="auto"))
    session.add(Inspection(id="INS1", park_id="P1", flight_date=date.today(),
                           total_images=1, total_detections=1,
                           summary='{}'))
    det = Detection(
        inspection_id="INS1",
        image_id="thermal_001",
        panel_id="R3-C7",
        class_name="hot-spot-high",
        class_id=10,
        severity="CRITICAL",
        confidence=0.87,
        bbox='[100,200,150,250]',
        gps='{"lat":28.4,"lon":77.1}',
    )
    session.add(det)
    session.commit()
    assert det.id is not None
    assert det.severity == "CRITICAL"


def test_get_session_default_engine(tmp_path):
    """Default engine uses settings.yaml database.url."""
    from axalon.db.session import get_engine
    engine = get_engine(db_url=f"sqlite:///{tmp_path}/test.db")
    from axalon.db.models import Base
    Base.metadata.create_all(engine)
    with engine.connect() as conn:
        result = conn.execute(
            __import__("sqlalchemy").text("SELECT name FROM sqlite_master WHERE type='table'")
        ).fetchall()
    table_names = [r[0] for r in result]
    assert "parks" in table_names
    assert "inspections" in table_names
    assert "detections" in table_names
```

- [ ] **Step 2: Run tests — expect ImportError**

```bash
python -m pytest tests/test_db.py -v 2>&1 | head -20
```

Expected: `ModuleNotFoundError: No module named 'axalon.db.models'`

- [ ] **Step 3: Create platform/db/models.py**

Create `platform/db/models.py`:

```python
"""
models.py — SQLAlchemy ORM models for the Axalon inspection platform.

Tables: parks, inspections, detections

SQLite for Phase 1. Switch database.url in settings.yaml to PostgreSQL
for Phase 2 with zero code changes.
"""

from __future__ import annotations

from datetime import datetime, date
from sqlalchemy import (
    Column, String, Integer, Float, Text, Date, DateTime,
    ForeignKey, func,
)
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class Park(Base):
    """One row per solar farm. Identified by operator-assigned park_id."""
    __tablename__ = "parks"

    id = Column(String, primary_key=True)          # e.g. "PARK_01"
    name = Column(String, nullable=False)
    mode = Column(String, default="auto")           # "auto" | "numbered"
    total_panels = Column(Integer, default=0)
    rows = Column(Integer, default=0)
    cols = Column(Integer, default=0)
    created_at = Column(DateTime, default=func.now())

    inspections = relationship("Inspection", back_populates="park", cascade="all, delete-orphan")


class Inspection(Base):
    """One row per batch run (one flight folder = one inspection)."""
    __tablename__ = "inspections"

    id = Column(String, primary_key=True)          # "BATCH-PARK_01-20260411-143022"
    park_id = Column(String, ForeignKey("parks.id"), nullable=False)
    flight_date = Column(Date, nullable=False)
    total_images = Column(Integer, default=0)
    total_detections = Column(Integer, default=0)
    summary = Column(Text)                         # JSON: {"CRITICAL":3,"HIGH":2,...}
    created_at = Column(DateTime, default=func.now())

    park = relationship("Park", back_populates="inspections")
    detections = relationship("Detection", back_populates="inspection", cascade="all, delete-orphan")


class Detection(Base):
    """One row per anomaly detected in one image."""
    __tablename__ = "detections"

    id = Column(Integer, primary_key=True, autoincrement=True)
    inspection_id = Column(String, ForeignKey("inspections.id"), nullable=False)
    image_id = Column(String, nullable=False)      # thermal filename stem
    panel_id = Column(String, default="R?-C?")    # "R3-C7" or "R?-C?" if no grid
    class_name = Column(String, nullable=False)    # from CANONICAL_CLASSES
    class_id = Column(Integer, nullable=False)     # 0–10
    severity = Column(String, nullable=False)      # CRITICAL/HIGH/MEDIUM/LOW
    confidence = Column(Float, nullable=False)
    bbox = Column(Text)                            # JSON [x1,y1,x2,y2]
    gps = Column(Text, default=None)               # JSON {"lat":28.4,"lon":77.1} or null
    created_at = Column(DateTime, default=func.now())

    inspection = relationship("Inspection", back_populates="detections")
```

- [ ] **Step 4: Create platform/db/session.py**

Create `platform/db/session.py`:

```python
"""
session.py — SQLAlchemy engine + session factory.

Usage:
    from axalon.db.session import get_engine, get_session

    engine = get_engine()           # uses settings.yaml database.url
    with get_session(engine) as s:
        s.add(park)
        s.commit()
"""

from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path

import yaml
from sqlalchemy import create_engine as _create_engine
from sqlalchemy.orm import Session

from axalon.db.models import Base

_SETTINGS_PATH = Path(__file__).resolve().parents[1] / "config" / "settings.yaml"
_DEFAULT_DB_URL = "sqlite:///axalon.db"


def get_engine(db_url: str | None = None):
    """Create and return a SQLAlchemy engine.

    Args:
        db_url: SQLAlchemy database URL. If None, reads from settings.yaml.
                Falls back to sqlite:///axalon.db if settings.yaml has no database section.
    """
    if db_url is None:
        try:
            with open(_SETTINGS_PATH) as f:
                config = yaml.safe_load(f)
            db_url = config.get("database", {}).get("url", _DEFAULT_DB_URL)
        except FileNotFoundError:
            db_url = _DEFAULT_DB_URL

    engine = _create_engine(db_url, connect_args={"check_same_thread": False} if "sqlite" in db_url else {})
    Base.metadata.create_all(engine)
    return engine


@contextmanager
def get_session(engine=None):
    """Context manager yielding a SQLAlchemy Session.

    Commits on exit, rolls back on exception.
    """
    if engine is None:
        engine = get_engine()
    with Session(engine) as session:
        try:
            yield session
            session.commit()
        except Exception:
            session.rollback()
            raise
```

- [ ] **Step 5: Update platform/db/__init__.py**

```python
# platform/db/__init__.py
from axalon.db.models import Base, Park, Inspection, Detection
from axalon.db.session import get_engine, get_session

__all__ = ["Base", "Park", "Inspection", "Detection", "get_engine", "get_session"]
```

- [ ] **Step 6: Add database section to settings.yaml**

Append to `platform/config/settings.yaml`:
```yaml
# ── Database ──────────────────────────────────────────────────────────────────
database:
  url: sqlite:///axalon.db    # Phase 2: postgresql://user:pass@host/axalon
```

- [ ] **Step 7: Run DB tests — expect PASS**

```bash
python -m pytest tests/test_db.py -v
```

Expected:
```
PASSED tests/test_db.py::test_create_park
PASSED tests/test_db.py::test_create_inspection
PASSED tests/test_db.py::test_create_detection
PASSED tests/test_db.py::test_get_session_default_engine
```

- [ ] **Step 8: Commit**

```bash
git add platform/db/models.py platform/db/session.py platform/db/__init__.py platform/config/settings.yaml tests/test_db.py
git commit -m "feat: add SQLAlchemy DB models and session factory (parks/inspections/detections)"
```

---

## Task 4: Rewire Orchestrator — Park Grid + Panel IDs + DB

**Why:** This is the critical missing wiring from the spec. The current orchestrator calls `detect()` but never assigns `panel_id`. The fix: (1) before processing any images, run `ParkLayoutDetector.build_layout()` on ALL RGB images to build a park-wide panel grid; (2) for each thermal image, match detection bbox centers to the nearest grid panel; (3) write each detection to DB immediately (not held in RAM).

**Files:**
- Modify: `platform/pipeline/orchestrator.py` (complete rewrite)
- Create: `tests/test_orchestrator.py`

- [ ] **Step 1: Write failing orchestrator tests**

Create `tests/test_orchestrator.py`:

```python
"""Test InspectionOrchestrator — mocked detector for speed."""
import json
import pytest
import numpy as np
from pathlib import Path
from unittest.mock import patch, MagicMock


@pytest.fixture
def mock_detector():
    """Returns a SolarDetector mock that produces one CRITICAL detection."""
    det = MagicMock()
    det.predict.return_value = [
        {
            "class": "hot-spot-high",
            "class_id": 10,
            "confidence": 0.91,
            "bbox": [100, 200, 150, 250],
            "bbox_norm": [0.195, 0.352, 0.078, 0.078],
            "severity": "CRITICAL",
            "color_bgr": (0, 0, 255),
        }
    ]
    det.detection_summary.return_value = {"CRITICAL": 1, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
    return det


@pytest.fixture
def thermal_image(tmp_path):
    """Create a minimal 640x512 grayscale JPEG."""
    import cv2
    img = np.zeros((512, 640), dtype=np.uint8)
    path = tmp_path / "thermal_001.jpg"
    cv2.imwrite(str(path), img)
    return path


@pytest.fixture
def rgb_image(tmp_path):
    """Create a minimal 640x512 color JPEG."""
    import cv2
    img = np.zeros((512, 640, 3), dtype=np.uint8)
    path = tmp_path / "rgb_001.jpg"
    cv2.imwrite(str(path), img)
    return path


def test_inspect_pair_returns_required_keys(tmp_path, thermal_image, mock_detector):
    from axalon.pipeline.orchestrator import InspectionOrchestrator
    orch = InspectionOrchestrator(output_dir=tmp_path / "output")
    orch.detector = mock_detector

    result = orch.inspect_pair(
        thermal_path=thermal_image,
        park_id="PARK_TEST",
    )
    required_keys = {"job_id", "park_id", "image_id", "detections", "summary",
                     "total_detections", "flight_date"}
    assert required_keys.issubset(result.keys())
    assert result["park_id"] == "PARK_TEST"
    assert result["total_detections"] == 1


def test_inspect_pair_detections_have_panel_id(tmp_path, thermal_image, mock_detector):
    """Every detection must have a panel_id field after localization."""
    from axalon.pipeline.orchestrator import InspectionOrchestrator
    orch = InspectionOrchestrator(output_dir=tmp_path / "output")
    orch.detector = mock_detector

    result = orch.inspect_pair(thermal_path=thermal_image, park_id="P1")
    for det in result["detections"]:
        assert "panel_id" in det, f"Detection missing panel_id: {det}"


def test_inspect_folder_streams_to_db(tmp_path, mock_detector):
    """Batch inspect writes detections to SQLite as each image is processed."""
    import cv2
    # Create a flat folder with 2 thermal images
    folder = tmp_path / "flight"
    folder.mkdir()
    for i in range(1, 3):
        img = np.zeros((512, 640), dtype=np.uint8)
        cv2.imwrite(str(folder / f"IR_{i:03d}.jpg"), img)

    from axalon.pipeline.orchestrator import InspectionOrchestrator
    from axalon.db.session import get_engine, get_session
    from axalon.db.models import Detection

    db_path = tmp_path / "test.db"
    engine = get_engine(f"sqlite:///{db_path}")

    orch = InspectionOrchestrator(output_dir=tmp_path / "output", engine=engine)
    orch.detector = mock_detector

    result = orch.inspect_folder(folder=folder, park_id="PARK_BATCH")
    assert result["total_images"] == 2
    assert result["total_detections"] == 2  # 1 per image from mock

    # Verify written to DB
    with get_session(engine) as s:
        dets = s.query(Detection).all()
    assert len(dets) == 2
    assert all(d.severity == "CRITICAL" for d in dets)


def test_park_wide_grid_built_before_detection(tmp_path, mock_detector):
    """Panel IDs should be R?-C? when no RGB images provided (no grid)."""
    import cv2
    folder = tmp_path / "flight"
    folder.mkdir()
    img = np.zeros((512, 640), dtype=np.uint8)
    cv2.imwrite(str(folder / "IR_001.jpg"), img)

    from axalon.pipeline.orchestrator import InspectionOrchestrator
    orch = InspectionOrchestrator(output_dir=tmp_path / "output")
    orch.detector = mock_detector

    result = orch.inspect_folder(folder=folder, park_id="P_NOGRID")
    for det in result["all_detections"]:
        # Without RGB, panel_id should be R?-C? (unknown)
        assert det["panel_id"] == "R?-C?"
```

- [ ] **Step 2: Run tests — expect failures**

```bash
python -m pytest tests/test_orchestrator.py -v 2>&1 | head -40
```

Expected: several FAIL because panel_id never set, no `engine` param, no DB writes.

- [ ] **Step 3: Rewrite orchestrator.py**

Replace `platform/pipeline/orchestrator.py` completely:

```python
"""
orchestrator.py — Full inspection pipeline orchestrator.

Primary workflow (batch):
  Phase 1: Build park-wide panel grid from ALL RGB images (once per batch)
  Phase 2: For each thermal image: detect → geo-tag → assign panel_id → DB write → emit progress
  Phase 3: Caller generates reports from DB

Memory model: only the panel grid (small) is held in RAM. Detections are
written to DB immediately and discarded from RAM.
"""

from __future__ import annotations

import json
from datetime import datetime, date
from pathlib import Path
from typing import Callable

import cv2
import numpy as np

from ml.src.utils import draw_detections_severity, load_bgr, get_logger

from axalon.core.detector import SolarDetector
from axalon.core.fusion import ImageFusion
from axalon.core.geo import detection_to_gps, extract_gps_exif
from axalon.park.layout import ParkLayoutDetector
from axalon.pipeline.ingest import find_image_pairs, load_mission_metadata, validate_pair
from axalon.db.models import Park, Inspection, Detection
from axalon.db.session import get_engine, get_session

logger = get_logger("axalon.orchestrator")

_REPO_ROOT = Path(__file__).resolve().parents[2]


def _nearest_panel(cx: float, cy: float, panel_map: dict) -> str:
    """Return panel_id of the closest panel center to (cx, cy).

    Falls back to 'R?-C?' if panel_map is empty.
    """
    if not panel_map:
        return "R?-C?"
    best_id, best_dist = "R?-C?", float("inf")
    for pid, info in panel_map.items():
        pcx, pcy = info["center"]
        dist = (cx - pcx) ** 2 + (cy - pcy) ** 2
        if dist < best_dist:
            best_dist, best_id = dist, pid
    return best_id


class InspectionOrchestrator:
    """Runs the full solar inspection pipeline."""

    def __init__(
        self,
        weights_path: str | Path | None = None,
        conf: float = 0.25,
        device: str = "0",
        output_dir: str | Path = "output",
        park_mode: str = "auto",
        engine=None,
    ) -> None:
        weights = weights_path or (_REPO_ROOT / "ml" / "checkpoints" / "best.pt")
        self.detector = SolarDetector(weights_path=weights, conf=conf, device=device)
        self.fusion = ImageFusion(mode="auto")
        self.layout_detector = ParkLayoutDetector()
        self.output_dir = Path(output_dir)
        self.park_mode = park_mode
        self.engine = engine or get_engine()

    # ── Single-image (debug/test) ─────────────────────────────────────────────

    def inspect_pair(
        self,
        thermal_path: str | Path,
        rgb_path: str | Path | None = None,
        park_id: str = "unknown",
        altitude_m: float = 40.0,
        panel_map: dict | None = None,
    ) -> dict:
        """Run full pipeline on a single thermal+RGB pair.

        Args:
            panel_map: Pre-built park layout (panel_id → info). If None,
                       panel_id defaults to 'R?-C?'.
        """
        thermal_path = Path(thermal_path)
        rgb_path = Path(rgb_path) if rgb_path else None

        detections = self.detector.predict(thermal_path)
        thermal_bgr = load_bgr(thermal_path)
        img_h, img_w = thermal_bgr.shape[:2]

        # GPS geo-tag
        image_gps = extract_gps_exif(thermal_path)
        for det in detections:
            if image_gps:
                det["gps"] = detection_to_gps(det["bbox"], img_w, img_h, image_gps, altitude_m)
            else:
                det["gps"] = None

            # Panel localization
            cx = (det["bbox"][0] + det["bbox"][2]) / 2
            cy = (det["bbox"][1] + det["bbox"][3]) / 2
            det["panel_id"] = _nearest_panel(cx, cy, panel_map or {})

        # Save annotated thermal
        annotated_thermal = draw_detections_severity(thermal_bgr, detections)
        job_id = f"AXL-{datetime.now().strftime('%Y%m%d-%H%M%S')}-{thermal_path.stem}"
        job_dir = self.output_dir / job_id
        job_dir.mkdir(parents=True, exist_ok=True)

        thermal_out = job_dir / f"{thermal_path.stem}_annotated.jpg"
        cv2.imwrite(str(thermal_out), annotated_thermal)

        # RGB fusion overlay
        rgb_out = None
        if rgb_path and rgb_path.exists():
            rgb_bgr = load_bgr(rgb_path)
            rgb_gps = extract_gps_exif(rgb_path)
            fused = self.fusion.align_and_overlay(
                thermal_bgr, rgb_bgr, detections,
                thermal_gps=image_gps, rgb_gps=rgb_gps,
            )
            rgb_out = job_dir / f"{thermal_path.stem}_rgb_annotated.jpg"
            cv2.imwrite(str(rgb_out), fused)

        summary = self.detector.detection_summary(detections)

        return {
            "job_id": job_id,
            "park_id": park_id,
            "image_id": thermal_path.stem,
            "thermal_path": str(thermal_path),
            "rgb_path": str(rgb_path) if rgb_path else None,
            "flight_date": date.today().isoformat(),
            "detections": detections,
            "summary": summary,
            "annotated_thermal": str(thermal_out),
            "annotated_rgb": str(rgb_out) if rgb_out else None,
            "total_detections": len(detections),
        }

    # ── Batch (primary workflow) ───────────────────────────────────────────────

    def inspect_folder(
        self,
        folder: str | Path,
        park_id: str = "unknown",
        altitude_m: float = 40.0,
        progress_callback: Callable[[int, int], None] | None = None,
    ) -> dict:
        """Run full pipeline on an entire flight folder.

        Phase 1: Build park-wide panel grid from ALL RGB images.
        Phase 2: Stream thermal images — detect, geo-tag, localize, DB write.
        Phase 3: Returns batch summary (caller generates reports).

        Args:
            folder:            Flight mission folder.
            park_id:           Solar park identifier.
            altitude_m:        Drone altitude for GSD calculation.
            progress_callback: Optional callable(processed, total).

        Returns:
            Batch result dict with 'batch_id', 'total_images', 'total_detections',
            'summary', 'all_detections' (list of all detection dicts), 'results'.
        """
        folder = Path(folder)
        pairs = find_image_pairs(folder)
        mission_meta = load_mission_metadata(folder)
        altitude_m = mission_meta.get("altitude_m", altitude_m)
        total = len(pairs)
        logger.info("Batch start: %d pairs, park=%s", total, park_id)

        # ── Phase 1: Build park-wide panel grid from ALL RGB images ──────────
        panel_map: dict = {}
        rgb_images = []
        gps_coords = []
        for pair in pairs:
            rgb_p = pair.get("rgb")
            if rgb_p and Path(rgb_p).exists():
                img = load_bgr(Path(rgb_p))
                rgb_images.append(img)
                gps_coords.append(extract_gps_exif(Path(rgb_p)))

        if rgb_images:
            layout = self.layout_detector.build_layout(rgb_images, gps_coords or None)
            panel_map = layout.get("panel_map", {})
            logger.info("Park grid: %d panels detected", len(panel_map))
        else:
            logger.warning("No RGB images found — panel IDs will be R?-C?")

        # Ensure park row exists in DB
        with get_session(self.engine) as s:
            if not s.get(Park, park_id):
                s.add(Park(
                    id=park_id,
                    name=park_id,
                    mode=self.park_mode,
                    total_panels=len(panel_map),
                ))

        # ── Phase 2: Stream thermal images ────────────────────────────────────
        batch_id = f"BATCH-{park_id}-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
        all_detections: list[dict] = []
        results: list[dict] = []

        for i, pair in enumerate(pairs):
            warnings = validate_pair(pair)
            for w in warnings:
                logger.warning("[%s] %s", pair["id"], w)

            result = self.inspect_pair(
                thermal_path=pair["thermal"],
                rgb_path=pair.get("rgb"),
                park_id=park_id,
                altitude_m=altitude_m,
                panel_map=panel_map,
            )
            result["batch_id"] = batch_id

            # Write detections to DB (streamed — not held in RAM beyond this loop iter)
            with get_session(self.engine) as s:
                for det in result["detections"]:
                    s.add(Detection(
                        inspection_id=batch_id,
                        image_id=result["image_id"],
                        panel_id=det.get("panel_id", "R?-C?"),
                        class_name=det["class"],
                        class_id=det["class_id"],
                        severity=det["severity"],
                        confidence=det["confidence"],
                        bbox=json.dumps(det["bbox"]),
                        gps=json.dumps(det.get("gps")) if det.get("gps") else None,
                    ))

            all_detections.extend(result["detections"])
            results.append(result)

            if progress_callback:
                progress_callback(i + 1, total)

        # ── Aggregate summary ─────────────────────────────────────────────────
        summary: dict[str, int] = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
        for det in all_detections:
            sev = det.get("severity", "LOW")
            if sev in summary:
                summary[sev] += 1

        # Write Inspection row to DB (once, after all images)
        with get_session(self.engine) as s:
            s.merge(Inspection(
                id=batch_id,
                park_id=park_id,
                flight_date=date.today(),
                total_images=total,
                total_detections=len(all_detections),
                summary=json.dumps(summary),
            ))

        return {
            "batch_id": batch_id,
            "park_id": park_id,
            "flight_date": date.today().isoformat(),
            "total_images": total,
            "total_detections": len(all_detections),
            "summary": summary,
            "all_detections": all_detections,
            "results": results,
        }
```

- [ ] **Step 4: Run orchestrator tests**

```bash
python -m pytest tests/test_orchestrator.py -v
```

Expected:
```
PASSED tests/test_orchestrator.py::test_inspect_pair_returns_required_keys
PASSED tests/test_orchestrator.py::test_inspect_pair_detections_have_panel_id
PASSED tests/test_orchestrator.py::test_inspect_folder_streams_to_db
PASSED tests/test_orchestrator.py::test_park_wide_grid_built_before_detection
```

- [ ] **Step 5: Commit**

```bash
git add platform/pipeline/orchestrator.py tests/test_orchestrator.py
git commit -m "feat: wire ParkLayoutDetector + DB persistence into orchestrator"
```

---

## Task 5: FastAPI — Fix Imports + Wire DB

**Files:**
- Modify: `platform/api/app.py`
- Create: `tests/test_api.py`

- [ ] **Step 1: Write API tests**

Create `tests/test_api.py`:

```python
"""Test FastAPI endpoints using TestClient."""
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    from axalon.api.app import app
    return TestClient(app)


def test_health(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert "version" in data
    assert data["status"] == "ok"


def test_get_parks_empty(client):
    resp = client.get("/parks")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_get_nonexistent_park(client):
    resp = client.get("/park/DOES_NOT_EXIST")
    assert resp.status_code == 404
```

- [ ] **Step 2: Run tests — some will fail due to broken imports**

```bash
python -m pytest tests/test_api.py -v 2>&1 | head -30
```

- [ ] **Step 3: Fix api/app.py imports**

Read the current `platform/api/app.py` and replace any `axalon_platform` or `sys.path` references:

```python
# At the top of platform/api/app.py, replace any broken imports with:
from axalon.pipeline.orchestrator import InspectionOrchestrator
from axalon.db.session import get_engine, get_session
from axalon.db.models import Park, Inspection, Detection
from ml.src.utils import get_logger
```

Add a `/parks` endpoint if missing:
```python
@app.get("/parks")
def list_parks():
    """List all known solar parks."""
    with get_session() as s:
        parks = s.query(Park).all()
        return [{"id": p.id, "name": p.name, "mode": p.mode,
                 "total_panels": p.total_panels} for p in parks]


@app.get("/park/{park_id}")
def get_park(park_id: str):
    """Get park summary + inspection history."""
    with get_session() as s:
        park = s.get(Park, park_id)
        if not park:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail=f"Park {park_id!r} not found")
        inspections = [
            {"id": i.id, "flight_date": str(i.flight_date),
             "total_detections": i.total_detections}
            for i in park.inspections
        ]
        return {"id": park.id, "name": park.name, "inspections": inspections}


@app.get("/health")
def health():
    return {"status": "ok", "version": "1.0.0", "model": "YOLOv8s best.pt"}
```

- [ ] **Step 4: Run API tests — expect PASS**

```bash
python -m pytest tests/test_api.py -v
```

- [ ] **Step 5: Commit**

```bash
git add platform/api/app.py tests/test_api.py
git commit -m "fix: api imports + wire DB to /parks and /park/{id} endpoints"
```

---

## Task 6: Complete Streamlit Dashboard (5 Pages)

**Why:** The existing dashboard has ~60% of the Inspect page and a skeleton Batch page. Need: complete Batch page (folder path input, live progress, download links), Park Map page (color-coded grid), History page (trends), Settings page (conf + camera params).

**Files:**
- Modify: `platform/ui/dashboard.py` (complete rewrite)

`★ Insight ─────────────────────────────────────`
Streamlit's execution model re-runs the entire script on every user interaction. To stream batch progress, use `st.empty()` as a mutable placeholder — overwrite it on each iteration. `st.session_state` persists values across reruns. `@st.cache_resource` loads the model once for the process lifetime (not per rerun).
`─────────────────────────────────────────────────`

- [ ] **Step 1: Replace platform/ui/dashboard.py with complete 5-page app**

```python
"""
dashboard.py — Streamlit operator dashboard for Axalon Solar Inspection.

5 pages:
  📦 Batch     — PRIMARY: process entire flight folder, live progress, download reports
  🗺 Park Map  — PRIMARY: color-coded panel grid + anomaly detail on click
  🔍 Inspect   — Single thermal+RGB pair (debug/test)
  📋 History   — Past inspections per park, trend charts
  ⚙ Settings  — Model conf, drone altitude, camera params → settings.yaml
"""

from __future__ import annotations

import json
import tempfile
import threading
from pathlib import Path

import cv2
import numpy as np
import streamlit as st
import yaml

from ml.src.utils import SEVERITY_COLOR_BGR, draw_detections_severity, get_logger
from axalon.pipeline.orchestrator import InspectionOrchestrator
from axalon.reporting.report import generate_excel_report, generate_pdf_report, generate_json_report
from axalon.reporting.geojson_writer import write_geojson
from axalon.db.session import get_engine, get_session
from axalon.db.models import Park, Inspection, Detection

logger = get_logger("axalon.dashboard")

_SETTINGS_PATH = Path(__file__).resolve().parents[1] / "config" / "settings.yaml"

# ── App config ────────────────────────────────────────────────────────────────
st.set_page_config(
    page_title="Axalon Solar Inspection",
    page_icon="🛸",
    layout="wide",
    initial_sidebar_state="expanded",
)

_SEV_CSS = {
    "CRITICAL": "background:#ffdddd;color:#990000;padding:2px 8px;border-radius:4px;font-weight:bold;",
    "HIGH":     "background:#ffe8cc;color:#cc5500;padding:2px 8px;border-radius:4px;font-weight:bold;",
    "MEDIUM":   "background:#fffacc;color:#888800;padding:2px 8px;border-radius:4px;",
    "LOW":      "background:#e8f0ff;color:#003399;padding:2px 8px;border-radius:4px;",
}

_SEV_COLOR = {  # Streamlit-compatible hex colors for grid cells
    "CRITICAL": "#cc0000",
    "HIGH":     "#ff6600",
    "MEDIUM":   "#ccaa00",
    "LOW":      "#2255cc",
    "OK":       "#22aa44",
}


@st.cache_resource
def _get_orchestrator():
    return InspectionOrchestrator(output_dir="output")


@st.cache_resource
def _get_engine():
    return get_engine()


def _bgr_to_rgb(img: np.ndarray) -> np.ndarray:
    return cv2.cvtColor(img, cv2.COLOR_BGR2RGB)


def _sev_badge(severity: str) -> str:
    return f'<span style="{_SEV_CSS.get(severity, "")}">{severity}</span>'


# ── Sidebar navigation ────────────────────────────────────────────────────────
st.sidebar.image("https://placehold.co/200x60/1a1a2e/ffffff?text=Axalon+Systems", use_container_width=True)
page = st.sidebar.radio(
    "Navigation",
    ["📦 Batch", "🗺 Park Map", "🔍 Inspect", "📋 History", "⚙ Settings"],
    index=0,
)
st.sidebar.markdown("---")
st.sidebar.caption("Model: YOLOv8s `best.pt`  |  11 anomaly classes")


# =============================================================================
# PAGE: BATCH (PRIMARY)
# =============================================================================
if page == "📦 Batch":
    st.title("📦 Batch Park Inspection")
    st.caption("Process an entire flight folder. Thermal + RGB pairs are automatically detected.")

    col1, col2 = st.columns(2)
    with col1:
        park_id = st.text_input("Park ID", value="PARK_01", help="Identifier for this solar farm")
        folder_path = st.text_input(
            "Flight Folder Path",
            placeholder="/home/operator/missions/park01_flight_20260411",
            help="Full path to the folder containing thermal and RGB images",
        )
    with col2:
        altitude_m = st.number_input("Drone Altitude (m)", min_value=5.0, max_value=200.0, value=40.0)
        park_name = st.text_input("Park Display Name", value="", placeholder="Optional — uses Park ID if blank")

    run_btn = st.button("🚀 Start Batch Inspection", type="primary", disabled=not folder_path)

    if run_btn and folder_path:
        folder = Path(folder_path)
        if not folder.exists():
            st.error(f"Folder not found: `{folder_path}`")
        else:
            from axalon.pipeline.ingest import find_image_pairs
            pairs = find_image_pairs(folder)
            if not pairs:
                st.error("No thermal/RGB image pairs found in that folder. Check folder layout.")
            else:
                st.info(f"Found {len(pairs)} image pairs. Starting inspection...")

                progress_bar = st.progress(0.0)
                status_text = st.empty()
                grid_placeholder = st.empty()

                orch = _get_orchestrator()

                # Store results progressively
                if "batch_result" not in st.session_state:
                    st.session_state.batch_result = None

                def on_progress(processed: int, total: int):
                    frac = processed / total
                    progress_bar.progress(frac)
                    status_text.text(f"Processing image {processed}/{total}...")

                with st.spinner("Running inspection..."):
                    result = orch.inspect_folder(
                        folder=folder,
                        park_id=park_id,
                        altitude_m=altitude_m,
                        progress_callback=on_progress,
                    )
                st.session_state.batch_result = result
                progress_bar.progress(1.0)
                status_text.text("✅ Inspection complete!")

                # Summary metrics
                summary = result["summary"]
                c1, c2, c3, c4, c5 = st.columns(5)
                c1.metric("Images", result["total_images"])
                c2.metric("🔴 CRITICAL", summary.get("CRITICAL", 0))
                c3.metric("🟠 HIGH", summary.get("HIGH", 0))
                c4.metric("🟡 MEDIUM", summary.get("MEDIUM", 0))
                c5.metric("🔵 LOW", summary.get("LOW", 0))

                # Download section
                st.subheader("Download Reports")
                out_dir = Path("output") / result["batch_id"]
                out_dir.mkdir(parents=True, exist_ok=True)

                pdf_path = out_dir / "inspection_report.pdf"
                xlsx_path = out_dir / "inspection_report.xlsx"
                geojson_path = out_dir / "park_anomaly_map.geojson"
                json_path = out_dir / "inspection_report.json"

                generate_json_report(result, json_path)
                generate_excel_report(result, xlsx_path)
                write_geojson(result.get("all_detections", []), geojson_path)

                try:
                    generate_pdf_report(result, pdf_path)
                    with open(pdf_path, "rb") as f:
                        st.download_button("📄 Download PDF Report", f, file_name="inspection_report.pdf", mime="application/pdf")
                except Exception as e:
                    st.warning(f"PDF generation failed (WeasyPrint may need system libs): {e}")

                with open(xlsx_path, "rb") as f:
                    st.download_button("📊 Download Excel", f, file_name="inspection_report.xlsx",
                                       mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")

                if geojson_path.exists():
                    with open(geojson_path) as f:
                        st.download_button("🗺 Download GeoJSON", f, file_name="park_anomaly_map.geojson", mime="application/json")


# =============================================================================
# PAGE: PARK MAP (PRIMARY)
# =============================================================================
elif page == "🗺 Park Map":
    st.title("🗺 Park Anomaly Map")
    st.caption("Color-coded grid view of detected anomalies across the solar park.")

    engine = _get_engine()

    with get_session(engine) as s:
        parks = s.query(Park).all()
        park_ids = [p.id for p in parks]

    if not park_ids:
        st.info("No parks in database yet. Run a Batch inspection first.")
    else:
        col1, col2 = st.columns(2)
        with col1:
            selected_park = st.selectbox("Select Park", park_ids)
        with col2:
            with get_session(engine) as s:
                inspections = s.query(Inspection).filter(
                    Inspection.park_id == selected_park
                ).order_by(Inspection.created_at.desc()).all()
                insp_ids = [i.id for i in inspections]

            selected_insp = st.selectbox("Select Inspection", insp_ids if insp_ids else ["No inspections"])

        if insp_ids and selected_insp != "No inspections":
            with get_session(engine) as s:
                dets = s.query(Detection).filter(
                    Detection.inspection_id == selected_insp
                ).all()

            # Build panel → worst severity map
            panel_severity: dict[str, str] = {}
            panel_detections: dict[str, list] = {}
            _sev_rank = {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1}

            for det in dets:
                pid = det.panel_id or "R?-C?"
                curr = panel_severity.get(pid)
                if curr is None or _sev_rank.get(det.severity, 0) > _sev_rank.get(curr, 0):
                    panel_severity[pid] = det.severity
                panel_detections.setdefault(pid, []).append(det)

            # Parse grid dimensions from panel IDs
            known_panels = [p for p in panel_severity if p != "R?-C?"]
            if not known_panels:
                st.warning("All detections have unknown panel locations (R?-C?). No RGB images were available during batch.")
            else:
                max_row = max(int(p.split("-C")[0][1:]) for p in known_panels)
                max_col = max(int(p.split("-C")[1]) for p in known_panels)

                st.markdown("**Legend:** 🔴 CRITICAL · 🟠 HIGH · 🟡 MEDIUM · 🔵 LOW · 🟢 OK")
                st.markdown("---")

                # Render grid
                for row in range(1, max_row + 1):
                    cols = st.columns(max_col)
                    for col_idx in range(1, max_col + 1):
                        pid = f"R{row}-C{col_idx}"
                        sev = panel_severity.get(pid, "OK")
                        color = _SEV_COLOR[sev]
                        label = f"R{row}-C{col_idx}\n{sev}" if sev != "OK" else f"R{row}-C{col_idx}"
                        with cols[col_idx - 1]:
                            if st.button(label, key=f"cell_{pid}",
                                          help=f"{len(panel_detections.get(pid, []))} detections"):
                                st.session_state["selected_panel"] = pid

            # Detail panel on cell click
            if "selected_panel" in st.session_state:
                pid = st.session_state["selected_panel"]
                st.subheader(f"Panel {pid} — Anomaly Detail")
                for det in panel_detections.get(pid, []):
                    st.markdown(
                        f"**{det.class_name}** {_sev_badge(det.severity)} "
                        f"conf={det.confidence:.2f} | image: `{det.image_id}`",
                        unsafe_allow_html=True,
                    )


# =============================================================================
# PAGE: INSPECT (single image, debug)
# =============================================================================
elif page == "🔍 Inspect":
    st.title("🔍 Single Image Inspection")
    st.caption("Upload a thermal IR image (and optionally an RGB image) for quick testing.")

    col1, col2 = st.columns(2)
    with col1:
        park_id = st.text_input("Park ID", value="DEBUG")
        altitude_m = st.number_input("Altitude (m)", min_value=5.0, max_value=200.0, value=40.0)
    with col2:
        park_mode = st.selectbox("Park Mode", ["auto", "numbered", "unnumbered"])

    thermal_file = st.file_uploader("Thermal IR Image", type=["jpg", "jpeg", "png", "tiff"])
    rgb_file = st.file_uploader("RGB Image (optional)", type=["jpg", "jpeg", "png"])

    if thermal_file and st.button("🔍 Run Detection", type="primary"):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            thermal_path = tmp / thermal_file.name
            thermal_path.write_bytes(thermal_file.read())

            rgb_path = None
            if rgb_file:
                rgb_path = tmp / rgb_file.name
                rgb_path.write_bytes(rgb_file.read())

            orch = _get_orchestrator()
            with st.spinner("Running YOLOv8s inference..."):
                result = orch.inspect_pair(
                    thermal_path=thermal_path,
                    rgb_path=rgb_path,
                    park_id=park_id,
                    altitude_m=altitude_m,
                )

        summary = result["summary"]
        c1, c2, c3, c4 = st.columns(4)
        c1.metric("🔴 CRITICAL", summary.get("CRITICAL", 0))
        c2.metric("🟠 HIGH", summary.get("HIGH", 0))
        c3.metric("🟡 MEDIUM", summary.get("MEDIUM", 0))
        c4.metric("🔵 LOW", summary.get("LOW", 0))

        if result["detections"]:
            st.subheader("Detections")
            for det in result["detections"]:
                st.markdown(
                    f"**{det['class']}** {_sev_badge(det['severity'])} "
                    f"conf={det['confidence']:.2f} panel={det.get('panel_id', 'R?-C?')}",
                    unsafe_allow_html=True,
                )
        else:
            st.success("No anomalies detected.")

        ann_path = result.get("annotated_thermal")
        if ann_path and Path(ann_path).exists():
            ann = cv2.imread(ann_path)
            if ann is not None:
                st.image(_bgr_to_rgb(ann), caption="Annotated Thermal", use_container_width=True)


# =============================================================================
# PAGE: HISTORY
# =============================================================================
elif page == "📋 History":
    st.title("📋 Inspection History")

    engine = _get_engine()
    with get_session(engine) as s:
        parks = s.query(Park).all()

    if not parks:
        st.info("No inspection history yet.")
    else:
        park_sel = st.selectbox("Park", [p.id for p in parks])

        with get_session(engine) as s:
            inspections = (
                s.query(Inspection)
                .filter(Inspection.park_id == park_sel)
                .order_by(Inspection.flight_date)
                .all()
            )

        if not inspections:
            st.info(f"No inspections for park {park_sel}.")
        else:
            import pandas as pd

            rows = []
            for insp in inspections:
                try:
                    summ = json.loads(insp.summary or "{}")
                except Exception:
                    summ = {}
                rows.append({
                    "Date": str(insp.flight_date),
                    "Inspection ID": insp.id,
                    "Images": insp.total_images,
                    "Detections": insp.total_detections,
                    "CRITICAL": summ.get("CRITICAL", 0),
                    "HIGH": summ.get("HIGH", 0),
                    "MEDIUM": summ.get("MEDIUM", 0),
                    "LOW": summ.get("LOW", 0),
                })

            df = pd.DataFrame(rows)
            st.dataframe(df, use_container_width=True)

            if len(df) > 1:
                st.subheader("Trend — Detections Over Time")
                st.line_chart(df.set_index("Date")[["CRITICAL", "HIGH", "MEDIUM", "LOW"]])


# =============================================================================
# PAGE: SETTINGS
# =============================================================================
elif page == "⚙ Settings":
    st.title("⚙ Settings")
    st.caption("Changes are written to `platform/config/settings.yaml`.")

    try:
        with open(_SETTINGS_PATH) as f:
            config = yaml.safe_load(f)
    except FileNotFoundError:
        st.error(f"Settings file not found at `{_SETTINGS_PATH}`")
        st.stop()

    model_conf = config.get("model", {})
    park_conf = config.get("park", {})
    camera_conf = config.get("camera", {})

    st.subheader("Model")
    new_conf = st.slider("Confidence Threshold", 0.1, 0.9,
                          float(model_conf.get("confidence", 0.25)), 0.01)
    new_iou = st.slider("IoU Threshold (NMS)", 0.1, 0.9,
                         float(model_conf.get("iou_threshold", 0.45)), 0.01)
    new_device = st.selectbox("Device", ["0", "cpu"], index=0 if model_conf.get("device") == "0" else 1)

    st.subheader("Park / Grid Detection")
    new_min_area = st.number_input("Min Panel Area (px²)", min_value=100, max_value=10000,
                                    value=int(park_conf.get("grid_min_panel_area", 500)))
    new_row_tol = st.number_input("Row Cluster Tolerance (px)", min_value=5, max_value=100,
                                   value=int(park_conf.get("row_cluster_tolerance_px", 30)))

    st.subheader("Camera / Drone")
    new_altitude = st.number_input("Default Altitude (m)", min_value=5.0, max_value=200.0,
                                    value=float(camera_conf.get("default_altitude_m", 40.0)))

    if st.button("💾 Save Settings", type="primary"):
        config.setdefault("model", {})["confidence"] = new_conf
        config["model"]["iou_threshold"] = new_iou
        config["model"]["device"] = new_device
        config.setdefault("park", {})["grid_min_panel_area"] = new_min_area
        config["park"]["row_cluster_tolerance_px"] = new_row_tol
        config.setdefault("camera", {})["default_altitude_m"] = new_altitude

        with open(_SETTINGS_PATH, "w") as f:
            yaml.dump(config, f, default_flow_style=False)
        st.success("Settings saved. Restart the dashboard to apply model changes.")
```

- [ ] **Step 2: Verify dashboard launches without import errors**

```bash
streamlit run platform/ui/dashboard.py --server.headless true &
sleep 4
curl -s http://localhost:8501 | grep -q "Axalon" && echo "Dashboard OK" || echo "Dashboard failed"
kill %1
```

Expected: `Dashboard OK`

- [ ] **Step 3: Commit**

```bash
git add platform/ui/dashboard.py
git commit -m "feat: complete 5-page Streamlit dashboard (Batch+ParkMap primary)"
```

---

## Task 7: Polished PDF Report Template

**Files:**
- Modify: `platform/reporting/templates/report.html`
- Modify: `platform/reporting/report.py` (add `generate_pdf_report` function)
- Create: `tests/test_reporting.py`

- [ ] **Step 1: Write reporting tests**

Create `tests/test_reporting.py`:

```python
"""Test report generation functions."""
import json
import pytest
from pathlib import Path
from datetime import date


@pytest.fixture
def sample_batch_result():
    return {
        "batch_id": "BATCH-PARK01-20260411",
        "park_id": "PARK_01",
        "flight_date": "2026-04-11",
        "total_images": 5,
        "total_detections": 3,
        "summary": {"CRITICAL": 1, "HIGH": 1, "MEDIUM": 1, "LOW": 0},
        "all_detections": [
            {
                "class": "hot-spot-high", "class_id": 10, "severity": "CRITICAL",
                "confidence": 0.91, "bbox": [100, 200, 150, 250],
                "panel_id": "R3-C7", "image_id": "thermal_001",
                "gps": {"lat": 28.4567, "lon": 77.1234},
            },
            {
                "class": "offline-module", "class_id": 5, "severity": "HIGH",
                "confidence": 0.78, "bbox": [300, 100, 400, 200],
                "panel_id": "R1-C4", "image_id": "thermal_002",
                "gps": None,
            },
            {
                "class": "cell", "class_id": 0, "severity": "MEDIUM",
                "confidence": 0.65, "bbox": [50, 50, 100, 100],
                "panel_id": "R2-C1", "image_id": "thermal_003",
                "gps": None,
            },
        ],
        "results": [],
    }


def test_generate_json_report(tmp_path, sample_batch_result):
    from axalon.reporting.report import generate_json_report
    out = tmp_path / "report.json"
    generate_json_report(sample_batch_result, out)
    assert out.exists()
    data = json.loads(out.read_text())
    assert data["batch_id"] == "BATCH-PARK01-20260411"
    assert data["total_detections"] == 3


def test_generate_excel_report(tmp_path, sample_batch_result):
    from axalon.reporting.report import generate_excel_report
    out = tmp_path / "report.xlsx"
    generate_excel_report(sample_batch_result, out)
    assert out.exists()
    assert out.stat().st_size > 1000  # non-trivial file

    import openpyxl
    wb = openpyxl.load_workbook(out)
    assert "Summary" in wb.sheetnames
    assert "Detections" in wb.sheetnames
    assert "Priority" in wb.sheetnames
    assert "GPS" in wb.sheetnames


def test_generate_geojson(tmp_path, sample_batch_result):
    from axalon.reporting.geojson_writer import write_geojson
    out = tmp_path / "map.geojson"
    dets_with_gps = [d for d in sample_batch_result["all_detections"] if d.get("gps")]
    write_geojson(dets_with_gps, out)
    assert out.exists()
    data = json.loads(out.read_text())
    assert data["type"] == "FeatureCollection"
    assert len(data["features"]) == 1   # only 1 detection has GPS


def test_generate_pdf_report(tmp_path, sample_batch_result):
    """PDF generation requires WeasyPrint system libs — skip if not installed."""
    pytest.importorskip("weasyprint")
    from axalon.reporting.report import generate_pdf_report
    out = tmp_path / "report.pdf"
    generate_pdf_report(sample_batch_result, out)
    assert out.exists()
    assert out.stat().st_size > 5000  # real PDF, not empty
    assert out.read_bytes()[:4] == b"%PDF"  # valid PDF header
```

- [ ] **Step 2: Run reporting tests**

```bash
python -m pytest tests/test_reporting.py -v -k "not pdf"
```

Expected: JSON, Excel, GeoJSON tests pass. PDF test skipped if WeasyPrint absent.

- [ ] **Step 3: Rebuild report.html template**

Replace `platform/reporting/templates/report.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <style>
    @page {
      size: A4;
      margin: 20mm 15mm 20mm 15mm;
      @bottom-right { content: "Page " counter(page) " of " counter(pages); font-size: 9pt; color: #666; }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10pt; color: #1a1a2e; }

    /* Cover page */
    .cover { page-break-after: always; display: flex; flex-direction: column;
             justify-content: center; align-items: center; height: 250mm; text-align: center; }
    .cover .logo { font-size: 28pt; font-weight: 900; color: #1a1a2e; letter-spacing: 2px; }
    .cover .logo span { color: #f97316; }
    .cover .tagline { font-size: 11pt; color: #666; margin-top: 6px; margin-bottom: 40px; }
    .cover .report-title { font-size: 20pt; font-weight: 700; color: #1a1a2e; margin-bottom: 8px; }
    .cover .park-name { font-size: 15pt; color: #2563eb; margin-bottom: 30px; }
    .cover .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px;
                        background: #f0f4ff; border-radius: 8px; padding: 20px 32px;
                        text-align: left; min-width: 280px; }
    .cover .meta-label { font-size: 8pt; color: #888; text-transform: uppercase; letter-spacing: 1px; }
    .cover .meta-value { font-size: 11pt; font-weight: 600; }
    .cover .footer-brand { margin-top: 50px; font-size: 9pt; color: #aaa; }

    /* Section headings */
    h1 { font-size: 16pt; font-weight: 700; color: #1a1a2e; margin-bottom: 12px; padding-bottom: 6px;
         border-bottom: 2px solid #2563eb; }
    h2 { font-size: 12pt; font-weight: 700; color: #2563eb; margin: 20px 0 10px; }
    section { margin-bottom: 28px; }

    /* Executive summary */
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
    .summary-card { border-radius: 6px; padding: 12px 16px; text-align: center; }
    .summary-card .count { font-size: 24pt; font-weight: 900; }
    .summary-card .label { font-size: 8pt; text-transform: uppercase; letter-spacing: 1px; color: #666; }
    .card-critical { background: #fee2e2; border-left: 4px solid #dc2626; }
    .card-critical .count { color: #dc2626; }
    .card-high { background: #ffedd5; border-left: 4px solid #ea580c; }
    .card-high .count { color: #ea580c; }
    .card-medium { background: #fef9c3; border-left: 4px solid #ca8a04; }
    .card-medium .count { color: #ca8a04; }
    .card-low { background: #dbeafe; border-left: 4px solid #2563eb; }
    .card-low .count { color: #2563eb; }

    /* Detection table */
    table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    thead tr { background: #1a1a2e; color: white; }
    thead th { padding: 8px 10px; text-align: left; font-weight: 600; font-size: 8.5pt; }
    tbody tr:nth-child(even) { background: #f8faff; }
    tbody td { padding: 6px 10px; border-bottom: 1px solid #e5e7eb; }
    .sev-critical { color: #dc2626; font-weight: 700; }
    .sev-high { color: #ea580c; font-weight: 700; }
    .sev-medium { color: #ca8a04; }
    .sev-low { color: #2563eb; }

    /* Page break control */
    .page-break { page-break-before: always; }
  </style>
</head>
<body>

<!-- ── COVER PAGE ── -->
<div class="cover">
  <div class="logo">AXALON<span>.</span></div>
  <div class="tagline">Solar Anomaly Detection Platform</div>
  <div class="report-title">Solar Inspection Report</div>
  <div class="park-name">{{ park_id }}</div>
  <div class="meta-grid">
    <div>
      <div class="meta-label">Flight Date</div>
      <div class="meta-value">{{ flight_date }}</div>
    </div>
    <div>
      <div class="meta-label">Total Images</div>
      <div class="meta-value">{{ total_images }}</div>
    </div>
    <div>
      <div class="meta-label">Anomalies Detected</div>
      <div class="meta-value">{{ total_detections }}</div>
    </div>
    <div>
      <div class="meta-label">Batch ID</div>
      <div class="meta-value" style="font-size:9pt;">{{ batch_id }}</div>
    </div>
  </div>
  <div class="footer-brand">Generated by Axalon Systems · axalonsystems.com</div>
</div>

<!-- ── EXECUTIVE SUMMARY ── -->
<section>
  <h1>Executive Summary</h1>
  <div class="summary-grid">
    <div class="summary-card card-critical">
      <div class="count">{{ summary.CRITICAL }}</div>
      <div class="label">Critical</div>
    </div>
    <div class="summary-card card-high">
      <div class="count">{{ summary.HIGH }}</div>
      <div class="label">High</div>
    </div>
    <div class="summary-card card-medium">
      <div class="count">{{ summary.MEDIUM }}</div>
      <div class="label">Medium</div>
    </div>
    <div class="summary-card card-low">
      <div class="count">{{ summary.LOW }}</div>
      <div class="label">Low</div>
    </div>
  </div>

  {% if summary.CRITICAL > 0 %}
  <p style="background:#fee2e2;border-left:4px solid #dc2626;padding:10px 14px;border-radius:4px;font-size:9.5pt;">
    ⚠ <strong>{{ summary.CRITICAL }} CRITICAL anomal{{ "y" if summary.CRITICAL == 1 else "ies" }}</strong>
    detected. Immediate maintenance inspection recommended. Hot-spots and bypass diode failures
    present fire risk to the installation.
  </p>
  {% endif %}
</section>

<!-- ── ANOMALY TABLE ── -->
<section class="page-break">
  <h1>Anomaly Log</h1>
  <p style="color:#666;font-size:9pt;margin-bottom:10px;">
    Sorted by severity. {{ total_detections }} total anomalies across {{ total_images }} images.
  </p>
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Severity</th>
        <th>Class</th>
        <th>Panel ID</th>
        <th>Image</th>
        <th>Confidence</th>
        <th>GPS</th>
      </tr>
    </thead>
    <tbody>
      {% for det in detections %}
      <tr>
        <td>{{ loop.index }}</td>
        <td class="sev-{{ det.severity | lower }}">{{ det.severity }}</td>
        <td>{{ det.class }}</td>
        <td>{{ det.panel_id or "R?-C?" }}</td>
        <td style="font-size:8pt;color:#666;">{{ det.image_id }}</td>
        <td>{{ "%.0f%%" | format(det.confidence * 100) }}</td>
        <td style="font-size:8pt;">
          {% if det.gps %}{{ "%.4f" | format(det.gps.lat) }}, {{ "%.4f" | format(det.gps.lon) }}{% else %}—{% endif %}
        </td>
      </tr>
      {% endfor %}
    </tbody>
  </table>
</section>

</body>
</html>
```

- [ ] **Step 4: Add generate_pdf_report to report.py**

Add to `platform/reporting/report.py` after the existing `generate_excel_report` function:

```python
def generate_pdf_report(batch_result: dict, output_path: str | Path) -> Path:
    """Generate polished PDF inspection report using Jinja2 + WeasyPrint.

    Args:
        batch_result: Dict from InspectionOrchestrator.inspect_folder().
        output_path:  Where to write the .pdf file.

    Returns:
        Path to the generated PDF.
    """
    try:
        from jinja2 import Environment, FileSystemLoader
        from weasyprint import HTML
    except ImportError as e:
        raise RuntimeError(
            "PDF generation requires jinja2 and weasyprint. "
            "Run: pip install jinja2 weasyprint"
        ) from e

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    env = Environment(loader=FileSystemLoader(str(_TEMPLATES_DIR)))
    template = env.get_template("report.html")

    # Sort detections by severity for the table
    _sev_rank = {"CRITICAL": 4, "HIGH": 3, "MEDIUM": 2, "LOW": 1}
    all_dets = batch_result.get("all_detections", [])
    # Flatten GPS from nested dict to top-level for template
    for det in all_dets:
        if isinstance(det.get("gps"), str):
            import json as _json
            try:
                det["gps"] = _json.loads(det["gps"])
            except Exception:
                det["gps"] = None

    sorted_dets = sorted(all_dets, key=lambda d: _sev_rank.get(d.get("severity", "LOW"), 0), reverse=True)

    summary = batch_result.get("summary", {})
    html_content = template.render(
        park_id=batch_result.get("park_id", "Unknown"),
        batch_id=batch_result.get("batch_id", ""),
        flight_date=batch_result.get("flight_date", ""),
        total_images=batch_result.get("total_images", 0),
        total_detections=batch_result.get("total_detections", 0),
        summary=type("S", (), {
            "CRITICAL": summary.get("CRITICAL", 0),
            "HIGH": summary.get("HIGH", 0),
            "MEDIUM": summary.get("MEDIUM", 0),
            "LOW": summary.get("LOW", 0),
        })(),
        detections=sorted_dets,
    )

    HTML(string=html_content, base_url=str(_TEMPLATES_DIR)).write_pdf(str(output_path))
    logger.info("PDF report saved: %s", output_path)
    return output_path
```

- [ ] **Step 5: Run all reporting tests**

```bash
python -m pytest tests/test_reporting.py -v
```

Expected: JSON, Excel, GeoJSON PASS. PDF PASS if WeasyPrint installed, else SKIPPED.

- [ ] **Step 6: Commit**

```bash
git add platform/reporting/report.py platform/reporting/templates/report.html tests/test_reporting.py
git commit -m "feat: polished PDF template + generate_pdf_report function"
```

---

## Task 8: Docker Setup

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`

- [ ] **Step 1: Create .dockerignore**

```
ml/data/
ml/output/
ml/notebooks/
output/
test_reports/
.superpowers/
.claude/
.git/
*.pyc
__pycache__/
*.egg-info/
.env
```

- [ ] **Step 2: Create Dockerfile**

```dockerfile
FROM python:3.11-slim

# System libs for WeasyPrint (PDF) and OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libpangocairo-1.0-0 \
    libglib2.0-0 \
    libgomp1 \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY ml/requirements.txt ./ml/requirements.txt
COPY requirements_platform.txt ./requirements_platform.txt
RUN pip install --no-cache-dir -r ml/requirements.txt \
    && pip install --no-cache-dir -r requirements_platform.txt

# Copy source (model weights mounted as volume — not baked in)
COPY . .
RUN pip install --no-cache-dir -e .

EXPOSE 8000 8501
```

- [ ] **Step 3: Create docker-compose.yml**

```yaml
version: "3.9"

services:
  api:
    build: .
    command: uvicorn axalon.api.app:app --host 0.0.0.0 --port 8000 --reload
    ports:
      - "8000:8000"
    volumes:
      - ./ml/checkpoints:/app/ml/checkpoints:ro   # model weights
      - ./output:/app/output                        # inspection outputs
      - axalon_db:/app/db                          # SQLite database

  dashboard:
    build: .
    command: streamlit run platform/ui/dashboard.py --server.port 8501 --server.address 0.0.0.0
    ports:
      - "8501:8501"
    volumes:
      - ./ml/checkpoints:/app/ml/checkpoints:ro
      - ./output:/app/output
      - axalon_db:/app/db
    depends_on:
      - api

volumes:
  axalon_db:
```

- [ ] **Step 4: Verify Dockerfile builds (no model needed)**

```bash
docker build -t axalon-test . --no-cache 2>&1 | tail -5
```

Expected: `Successfully built <hash>` or `=> exporting to image` with no errors.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile docker-compose.yml .dockerignore
git commit -m "feat: add Docker + docker-compose for Phase 2 cloud deployment"
```

---

## Task 9: Documentation

**Files:**
- Create: `docs/HOW_TO_USE.md`
- Create: `docs/INSTALLATION.md`
- Create: `docs/FOLDER_CONVENTIONS.md`
- Create: `docs/ANOMALY_CLASSES.md`
- Create: `docs/API_REFERENCE.md`
- Create: `docs/DEPLOYMENT.md`
- Modify: `CLAUDE.md` — update package names

- [ ] **Step 1: Create docs/INSTALLATION.md**

```markdown
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
```

- [ ] **Step 2: Create docs/FOLDER_CONVENTIONS.md**

```markdown
# Skydroid C13 Folder Conventions

The ingestion engine auto-detects two folder layouts:

## Layout A — Subdirectory

```
flight_mission/
├── thermal/        ← thermal_001.jpg, thermal_002.jpg ...
└── rgb/            ← rgb_001.jpg, rgb_002.jpg ...
```

Pairing: matched by numeric suffix (thermal_001 ↔ rgb_001).

## Layout B — Flat folder

```
flight_mission/
├── IR_001.jpg, IR_002.jpg ...      ← thermal (IR prefix)
└── RGB_001.jpg, RGB_002.jpg ...    ← RGB (RGB prefix)
```

Pairing: matched by numeric suffix (IR_001 ↔ RGB_001).

## Optional mission metadata

Create `mission_metadata.json` in the flight folder to override defaults:

```json
{
  "altitude_m": 45.0,
  "park_id": "PARK_01",
  "operator": "Axalon Field Team",
  "camera_model": "Skydroid C13"
}
```

## Notes

- Thermal images must be JPEG, PNG, or TIFF
- RGB images are optional — if absent, panel IDs default to `R?-C?`
- File pairing is by numeric suffix only — name prefixes don't matter
- Up to 5,000 image pairs supported in a single batch
```

- [ ] **Step 3: Create docs/ANOMALY_CLASSES.md**

```markdown
# Anomaly Classes — YOLOv8s Model

11 classes detected in thermal IR imagery. Class IDs are fixed (0–10).

| ID | Class | Severity | Description |
|----|-------|----------|-------------|
| 0  | cell | MEDIUM | Single cell anomaly — localized hot spot |
| 1  | cell-multi | MEDIUM | Multi-cell anomaly — multiple adjacent cells affected |
| 2  | module | MEDIUM | Full module thermal anomaly |
| 3  | string | CRITICAL | Entire string failure — fire/safety risk |
| 4  | bypass-diode | CRITICAL | Bypass diode failure — fire risk |
| 5  | offline-module | HIGH | Module offline — significant power loss |
| 6  | vegetation-shading | LOW | Shading from vegetation — clean or trim |
| 7  | soiling | LOW | Dirt/soiling — clean panel |
| 8  | short-circuit | HIGH | Short circuit detected |
| 9  | hot-spot-low | HIGH | Low-severity hot spot |
| 10 | hot-spot-high | CRITICAL | High-severity hot spot — immediate action required |

## Severity Definitions

- **CRITICAL:** Immediate shutdown and inspection required. Fire/safety risk.
- **HIGH:** Repair within 1 week. Significant power loss or failure risk.
- **MEDIUM:** Schedule for next maintenance cycle.
- **LOW:** Monitor and address during routine maintenance.
```

- [ ] **Step 4: Create docs/HOW_TO_USE.md**

```markdown
# How to Use Axalon Solar Inspection Platform

## Option 1: Streamlit Dashboard (recommended for operators)

```bash
streamlit run platform/ui/dashboard.py
```

Open http://localhost:8501 in your browser.

**Daily workflow:**
1. Go to **📦 Batch** page
2. Enter Park ID and full path to your flight folder
3. Enter drone altitude
4. Click **Start Batch Inspection**
5. Watch live progress — park grid updates as each image is processed
6. Download PDF, Excel, or GeoJSON reports when done

## Option 2: CLI

```bash
# Inspect entire park folder
python main.py batch \
  --folder /path/to/flight_mission/ \
  --park-id PARK_01 \
  --altitude 45

# Inspect single image pair (debug)
python main.py inspect \
  --thermal /path/to/thermal_001.jpg \
  --rgb /path/to/rgb_001.jpg \
  --park-id PARK_01

# Start REST API server
python main.py api

# Launch Streamlit dashboard
python main.py dashboard
```

## Option 3: REST API

```bash
# Start API
uvicorn axalon.api.app:app --host 0.0.0.0 --port 8000

# Submit batch job
curl -X POST http://localhost:8000/batch \
  -F "folder_path=/path/to/flight_mission/" \
  -F "park_id=PARK_01"

# Check job status
curl http://localhost:8000/status/BATCH-PARK_01-20260411-143022

# Download PDF report
curl http://localhost:8000/report/BATCH-PARK_01-20260411-143022?format=pdf -o report.pdf
```

## Output Files

All outputs go to `output/{batch_id}/`:
- `inspection_report.pdf` — executive report for clients
- `inspection_report.xlsx` — 4-sheet workbook (Summary/Detections/Priority/GPS)
- `park_anomaly_map.geojson` — GPS-tagged anomalies for QGIS / Google Earth
- `annotated/` — annotated thermal and RGB images
```

- [ ] **Step 5: Create docs/API_REFERENCE.md**

```markdown
# API Reference

Base URL: `http://localhost:8000`

## POST /inspect

Inspect a single thermal+RGB image pair. Returns immediately.

**Request:** `multipart/form-data`
- `thermal_image` (file, required) — thermal IR image
- `rgb_image` (file, optional) — RGB image
- `park_id` (string, default: "unknown")
- `altitude_m` (float, default: 40.0)

**Response 200:**
```json
{
  "job_id": "AXL-20260411-143022-thermal_001",
  "park_id": "PARK_01",
  "total_detections": 3,
  "summary": {"CRITICAL": 1, "HIGH": 1, "MEDIUM": 1, "LOW": 0},
  "detections": [
    {"class": "hot-spot-high", "severity": "CRITICAL",
     "confidence": 0.91, "panel_id": "R3-C7",
     "bbox": [100, 200, 150, 250], "gps": {"lat": 28.45, "lon": 77.12}}
  ]
}
```

## POST /batch

Submit entire flight folder for background processing.

**Request:** `multipart/form-data`
- `folder_path` (string, required) — absolute path to flight folder
- `park_id` (string, required)
- `altitude_m` (float, default: 40.0)

**Response 202:**
```json
{"job_id": "BATCH-PARK_01-20260411-143022", "status": "queued", "total_images": 42}
```

## GET /status/{job_id}

**Response 200:**
```json
{"job_id": "...", "status": "running", "progress": 0.45, "processed": 19, "total": 42}
```

## GET /report/{job_id}

Query param: `format` = `pdf` | `excel` | `geojson` | `json`

Returns the report file as a download.

## GET /parks

Returns list of all known parks.

## GET /park/{park_id}

Returns park summary + inspection history.

## GET /health

```json
{"status": "ok", "version": "1.0.0", "model": "YOLOv8s best.pt"}
```
```

- [ ] **Step 6: Create docs/DEPLOYMENT.md**

```markdown
# Deployment Guide

## Phase 1 — Local (current)

```bash
pip install -e .
python main.py dashboard    # Streamlit on :8501
python main.py api          # FastAPI on :8000
```

## Phase 2 — Cloud VM (Docker)

```bash
# On your VM
git clone <repo> AxalonSystems
cd AxalonSystems
cp ml/checkpoints/best.pt ml/checkpoints/   # or mount via volume

docker compose up -d
```

Services:
- Dashboard: http://your-vm-ip:8501
- API: http://your-vm-ip:8000

To use PostgreSQL instead of SQLite, update `platform/config/settings.yaml`:
```yaml
database:
  url: postgresql://axalon:password@db:5432/axalon
```
And add a postgres service to `docker-compose.yml`.

## Phase 3 — Self-Hosted + Multi-tenant

Coming after Phase 2 is stable. Will add:
- Basic API key authentication
- Per-client data isolation
- NGINX reverse proxy + HTTPS
```

- [ ] **Step 7: Update CLAUDE.md with final package names**

In `CLAUDE.md`, update the import examples section to reflect final package names:

```markdown
# Import from ml.src.utils (NOT src.utils or solar_thermal_detection.src.utils)
from ml.src.utils import CANONICAL_CLASSES, SEVERITY_MAP, get_logger

# Import platform modules using axalon package name
from axalon.core.detector import SolarDetector
from axalon.pipeline.orchestrator import InspectionOrchestrator
from axalon.db.session import get_engine, get_session

# Run pip install -e . once after cloning to register both packages
```

- [ ] **Step 8: Commit all docs**

```bash
git add docs/HOW_TO_USE.md docs/INSTALLATION.md docs/FOLDER_CONVENTIONS.md \
        docs/ANOMALY_CLASSES.md docs/API_REFERENCE.md docs/DEPLOYMENT.md CLAUDE.md
git commit -m "docs: add complete platform documentation (installation, usage, API, deployment)"
```

---

## Task 10: Final Integration Test

- [ ] **Step 1: Run the full test suite**

```bash
python -m pytest tests/ -v --tb=short 2>&1 | tail -30
```

Expected: All tests PASS (PDF test SKIPPED if WeasyPrint not installed).

- [ ] **Step 2: Smoke-test CLI**

```bash
python main.py --help
```

Expected: shows `inspect`, `batch`, `api`, `dashboard` subcommands.

- [ ] **Step 3: Smoke-test API health endpoint**

```bash
uvicorn axalon.api.app:app --port 8000 &
sleep 3
curl -s http://localhost:8000/health | python -m json.tool
kill %1
```

Expected:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "model": "YOLOv8s best.pt"
}
```

- [ ] **Step 4: Smoke-test Streamlit**

```bash
streamlit run platform/ui/dashboard.py --server.headless true --server.port 8502 &
sleep 5
curl -s http://localhost:8502 | grep -q "Axalon" && echo "Dashboard: OK" || echo "Dashboard: FAIL"
kill %1
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git status  # verify nothing unexpected
git commit -m "chore: final integration — all tests pass, platform complete"
```

---

## Self-Review: Spec Coverage

| Spec Section | Task Covering It |
|---|---|
| §3 Import fixes (sys.path, axalon_platform→axalon) | Task 1, 2 |
| §4.1 pyproject.toml | Task 1 |
| §4.2 DB models (parks/inspections/detections) | Task 3 |
| §4.3 session.py | Task 3 |
| §4.4 Park localization wired into orchestrator | Task 4 |
| §4.5 Streamlit — 5 pages (Batch PRIMARY, Park Map PRIMARY) | Task 6 |
| §4.6 Polished PDF template | Task 7 |
| §4.7 Docker (Dockerfile, docker-compose, .dockerignore) | Task 8 |
| §4.8 Documentation (6 docs + CLAUDE.md) | Task 9 |
| §5 Data flow — Phase 1 grid, Phase 2 streaming, Phase 3 reports | Task 4 (orchestrator) |
| §6 Skydroid C13 folder conventions (already in ingest.py) | Validated in Task 2 |
| §9 API endpoints | Task 5 |
| settings.yaml path fix | Task 2 Step 1 |
| main.py dashboard path fix | Task 2 Step 13 |
| generate_pdf_report function | Task 7 Step 4 |

All spec requirements covered. No TBDs or placeholders remaining.
