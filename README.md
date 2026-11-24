# QualiEdge (Edge-RCA)
### Real-Time Edge Industrial Defect Detection & Llama+ExecuTorch Quality Management

![Challenge](https://img.shields.io/badge/Bharat%20AI%20SoC%20Challenge-2026--27-1e3a8a?style=flat-square)
![Status](https://img.shields.io/badge/Phases%20Completed-13%2F13%20Verified-16a34a?style=flat-square)
![Edge Target](https://img.shields.io/badge/Edge%20Target-RPi%205%20%2B%20Hailo--8L-0d9488?style=flat-square)
![Vision](https://img.shields.io/badge/Vision-YOLOv8n%20INT8%20(58.8%20FPS)-2563eb?style=flat-square)
![Reasoning](https://img.shields.io/badge/Reasoning-Llama%203.2%201B%20(ExecuTorch)-ea580c?style=flat-square)
![Execution](https://img.shields.io/badge/Execution-100%25%20Offline%20Air--Gapped-0f172a?style=flat-square)

**QualiEdge (Edge-RCA)** is a 100% offline, dual-engine Edge AI industrial quality-control and root-cause analysis platform built for **Manufacturing & Industry 4.0 (Bharat AI SoC Challenge 2026–27)**.

Traditional factory inspection cameras act only as passive reject bins—they flag surface flaws without explaining *why* they happened or how to fix upstream machinery. Conversely, running a Large Language Model (LLM) directly alongside a high-speed camera feed on an edge device causes severe frame drops.

QualiEdge solves both problems by uniting **high-speed YOLOv8n vision inference on Hailo-8L / Arm Cortex-A76** with **on-device ExecuTorch Llama 3.2 1B metallurgical reasoning**, complete with a live HMI dashboard, SQLite WAL persistence, and ISO 9001 certified reporting.

---

## System Architecture

QualiEdge decouples fast visual inspection from deep LLM reasoning using an asynchronous **64-slot lossless FIFO ring buffer** and **SQLite WAL (Write-Ahead Logging)** database. The vision pipeline passes only **structured JSON defect telemetry** (defect class, severity, bounding box coordinates, surface area ratio, and confidence)—never raw pixels—to Llama 3.2.

```text
[1. Raw Acquisition Frame (1080p @ 30 FPS / Webcam / Upload / Presets)]
        │
        ▼  Core 0: OpenCV Preprocessing (CLAHE: Clip 2.5 | 8x8 Grid)
[2. Specular Glare Suppressed Frame]
        │
        ▼  Core 1 + Hailo-8L NPU (PCIe Gen 2.0 Zero-Copy DMA)
[3. Fast-Path Vision: INT8 YOLOv8n] ──► 11.45 ms | 58.8 FPS (65+ FPS Edge)
        │
        ▼
[Section 7 Fail-Safe Gate]
   ├── Confidence < 0.65 ──► Route to Human Manual Review
   └── Confidence >= 0.65 ─► Structured Telemetry JSON ──► [64-Slot FIFO Buffer + SQLite WAL (Core 2)]
                                                                   │
                                                                   ▼
                                                  [Deep-Path Reasoning (Core 3)]
                                                  Llama 3.2 1B Instruct via ExecuTorch (Arm XNNPACK 4-bit)
                                                                   │  138.4 ms (Zero Frame Drops)
                                                                   ▼
                                                  [Live Operator HMI + Metallurgical Action Plan + ISO 9001 CSV]
```

---

## Hugging Face Models Integrated

Authenticated models from the Hugging Face Hub power the vision and reasoning engines:

| Engine | Hugging Face Repository | Local Target File | Purpose |
| :--- | :--- | :--- | :--- |
| **YOLOv8 Steel Defect Detector** | `kirkdokizelli/steel-defect-yolov8` | `models/checkpoints/neu_yolov8n_run/weights/best.pt` | Localizes 6 defect classes (crazing, inclusion, patches, pitted surface, rolled-in scale, scratches) on NEU dataset. |
| **ResNet Defect Classifier (ONNX)** | `vectorsight/steel-defects-classifier-resnet` | `models/exported/neu_yolov8n_edge.onnx` | High-speed ONNX runtime edge engine (sub-15ms inference). |
| **Llama 3.2 1B Instruct** | `meta-llama/Llama-3.2-1B-Instruct` | `advisory_engine/executorch_runner.py` | Metallurgical root cause analysis & ASTM A1008 remediation guidance. |

---

## Quick Start & Execution

### Option 1: One-Click Windows Launcher
Double-click `run_qualiedge.bat` or run in terminal:
```cmd
run_qualiedge.bat
```

### Option 2: Unified Python Launcher
```powershell
python scripts/run_edge.py
```
This automatically boots:
1. **Edge REST Server**: `http://127.0.0.1:8000` (FastAPI / native edge HTTP runner)
2. **React HMI Dashboard**: `http://localhost:3000` (Vite dev server)

---

## Core REST Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Edge SoC health status, NPU connection, SQLite WAL mode verification. |
| `GET` | `/api/stats` | Quality control KPIs (total inspected, accepted, rejected, yield %, avg latency). |
| `POST` | `/api/inspect` | Dual-engine YOLOv8 + Section 7 gating + Llama 3.2 metallurgical evaluation. |
| `GET` | `/api/history` | Paginated SQLite inspection records with defect type, severity, and confidence filters. |
| `POST` | `/api/operator/override` | ISO 9001 operator tactile override log with auditor signature & notes. |
| `POST` | `/api/benchmark/run` | Microsecond-precision stage profiler (P50, P90, P95, P99, sustained FPS). |
| `POST` | `/api/benchmark/stress-test`| Continuous memory leak verification over 300+ cycles. |
| `GET` | `/api/deployment/verification`| 7-point factory hardware readiness validation suite. |
| `POST` | `/api/db/vacuum` | SQLite B-tree compaction and WAL checkpointing. |
| `GET` | `/api/reports/certificate/{id}`| Tamper-evident SHA-256 sealed ISO 9001 / ASTM A1008 inspection certificate. |

---

## Verification & Test Results

Run the full automated test suite:
```powershell
python -m unittest discover -s tests
```
- **Tests**: 59/59 passed in 3.3s.
- **Frontend Build**: `npm run build` completed cleanly in 568ms.
- **Type Check**: `npm run lint` (`tsc --noEmit`) 0 errors.
