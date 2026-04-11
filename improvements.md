# Axalon Platform — Improvements Backlog

Prioritised list of improvements beyond the current Phase 1 implementation.

---

## 🔐 Security (address before any public deployment)

| # | Issue | Severity | File |
|---|-------|----------|------|
| S1 | Add API key / token authentication to all endpoints | HIGH | `platform/api/app.py` |
| S2 | Rate limiting on `/inspect` and `/batch` (e.g. slowapi) | HIGH | `platform/api/app.py` |
| S3 | Restrict `/results` static mount — serve only by authenticated job owner | HIGH | `platform/api/app.py` |
| S4 | Add HTTPS termination (NGINX or Caddy) before exposing to internet | HIGH | `docker-compose.yml` |
| S5 | Rotate API keys and store in environment variables, not config files | MEDIUM | `platform/config/settings.yaml` |

---

## ⚡ Performance

| # | Improvement | Notes |
|---|-------------|-------|
| P1 | **Async YOLOv8 inference** — run detector in a thread pool (`asyncio.to_thread`) so the API event loop doesn't block | Especially important when `workers=1` |
| P2 | **Batch GPU inference** — pass multiple images to `model.predict()` in one call instead of one at a time | 3–5× throughput improvement on GPU |
| P3 | **Model warm-up on startup** — run one dummy inference at `@app.on_event("startup")` so the first real request isn't slow | Ultralytics lazy-loads weights on first forward pass |
| P4 | **Async report generation** — PDF/Excel writes block the event loop; move to background task | `generate_pdf_report` calls WeasyPrint synchronously |
| P5 | **Image streaming** — stream large annotated images via `StreamingResponse` instead of loading into memory | Reduces peak RAM for large orthomsaics |

---

## 🗄️ Persistence & Scalability

| # | Improvement | Notes |
|---|-------------|-------|
| D1 | **Replace `_JOBS` in-memory dict with DB-backed job table** | Current dict is lost on restart and unbounded in size |
| D2 | **PostgreSQL support** — swap SQLite for Postgres in production (`DATABASE_URL` env var) | SQLite has write-lock contention under concurrent requests |
| D3 | **Alembic migrations** — add migration scripts so schema changes don't require `DROP TABLE` | Currently `init_db()` uses `create_all` which can't alter existing tables |
| D4 | **Object storage for reports** — write output files to S3/GCS instead of local disk | Local disk doesn't survive container restarts or horizontal scaling |

---

## 🖥️ Dashboard UX

| # | Improvement | Notes |
|---|-------------|-------|
| U1 | **Real-time progress via WebSocket or polling** — current Batch page only shows progress during a blocking `inspect_folder` call; move to async polling against `/status/{job_id}` | Streamlit's `st.empty()` + `time.sleep` loop works for polling |
| U2 | **Park Map — colour-fill grid cells** using `st.markdown` HTML instead of buttons; buttons don't support background colour styling reliably | Use a coloured `<div>` grid rendered via `st.markdown(unsafe_allow_html=True)` |
| U3 | **Annotated image viewer** — show side-by-side thermal + RGB with bounding box overlay in Inspect page | Already wired; needs `use_container_width` tuning |
| U4 | **Export from History page** — add download buttons for per-inspection Excel/PDF from History tab | |
| U5 | **Dark mode CSS** — Axalon brand is dark (`#1a1a2e`); Streamlit's default light theme clashes | Use `[theme]` in `.streamlit/config.toml` |

---

## 🤖 ML / Detection

| # | Improvement | Notes |
|---|-------------|-------|
| M1 | **Confidence calibration** — current threshold is 0.25 (low); run precision-recall analysis on validation set and pick a better operating point | |
| M2 | **TTA (Test Time Augmentation)** — horizontal + vertical flip ensemble to improve recall on small anomalies | `model.predict(augment=True)` |
| M3 | **Model quantisation** — INT8 TensorRT export for 4× faster inference on Jetson / edge GPU | `model.export(format='engine', int8=True)` |
| M4 | **Panel count validation** — after grid detection, alert if detected panel count differs >10% from expected (park metadata) | Catches misalignment between RGB grid and actual layout |
| M5 | **Multi-flight delta report** — compare two inspections of the same park and highlight new / resolved anomalies | Query DB for previous inspection, diff by panel_id |

---

## 🧪 Testing

| # | Improvement | Notes |
|---|-------------|-------|
| T1 | **Add `tests/test_reporting.py`** — test PDF/Excel/GeoJSON outputs with synthetic result fixtures | |
| T2 | **API integration tests** — test `/inspect` and `/batch` with real (small) thermal images | Needs `httpx` + `TestClient` |
| T3 | **End-to-end smoke test** — `main.py batch --folder tests/fixtures/` with 2–3 image pairs | Add to `tests/test_e2e.py` |
| T4 | **Fix SQLAlchemy deprecation warning** — replace `datetime.utcnow()` with `datetime.now(datetime.UTC)` in `db/models.py` | 8 warnings currently in test output |

---

## 📦 DevOps

| # | Improvement | Notes |
|---|-------------|-------|
| V1 | **Add `.github/workflows/ci.yml`** — run pytest on every push/PR | |
| V2 | **Pin dependency versions** in `requirements_platform.txt` — use `==` not `>=` for reproducible builds | |
| V3 | **Multi-stage Dockerfile** — separate build stage (installs deps) from runtime stage (copies only what's needed) | Reduces final image size significantly |
| V4 | **Health check in docker-compose** — add `healthcheck:` to api service so dashboard waits for it properly | Currently `depends_on: api` doesn't wait for API to be ready |
| V5 | **Remove `--reload` from production docker-compose** — `--reload` watches filesystem, wastes CPU in prod | Use `--reload` only in dev compose override |
