"""
scripts/train_custom.py

High-precision transfer learning fine-tuning for YOLOv8n steel surface defect detection.
Trained on all custom specimen images from ARM/image and NEU-DET baseline.
Saves checkpoints to models/checkpoints/custom_yolov8n_run/weights/best.pt and
promotes best.pt to models/checkpoints/neu_yolov8n_run/weights/best.pt.
"""

import sys
import shutil
from pathlib import Path
from ultralytics import YOLO

ROOT_DIR = Path(__file__).resolve().parent.parent

def main():
    data_yaml = ROOT_DIR / "data" / "custom_dataset.yaml"
    weights_path = ROOT_DIR / "models" / "checkpoints" / "neu_yolov8n_run" / "weights" / "best.pt"
    
    if not weights_path.exists():
        weights_path = "yolov8n.pt"
    
    print("=" * 65)
    print("  QualiEdge - High-Precision YOLOv8n Training Engine")
    print(f"  Dataset:      {data_yaml}")
    print(f"  Base Weights: {weights_path}")
    print("=" * 65)

    model = YOLO(str(weights_path))

    results = model.train(
        data=str(data_yaml),
        epochs=8,
        imgsz=320,
        batch=8,
        device="cpu",
        project=str(ROOT_DIR / "models" / "checkpoints"),
        name="custom_yolov8n_run",
        exist_ok=True,
        optimizer="AdamW",
        lr0=0.0008,
        lrf=0.01,
        warmup_epochs=1.0,
        box=7.5,
        cls=1.5,
        dfl=1.5,
        weight_decay=0.0005,
        save=True,
        plots=False,
        verbose=True
    )

    trained_best = ROOT_DIR / "models" / "checkpoints" / "custom_yolov8n_run" / "weights" / "best.pt"
    prod_target = ROOT_DIR / "models" / "checkpoints" / "neu_yolov8n_run" / "weights" / "best.pt"

    if trained_best.exists():
        prod_target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(trained_best, prod_target)
        print(f"\n[PROMOTED] Copied {trained_best} -> {prod_target}")

    print("\n[SUCCESS] High-precision training completed successfully!")

if __name__ == "__main__":
    main()
