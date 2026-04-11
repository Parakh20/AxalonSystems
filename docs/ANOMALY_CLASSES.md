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
