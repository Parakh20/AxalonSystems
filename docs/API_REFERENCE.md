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
