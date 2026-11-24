"""
scripts/verify_user_images.py

Verification script testing newly trained high-precision YOLOv8n detector across ALL images
in C:\\Users\\ME\\OneDrive\\Desktop\\ARM\\image (including composites, WhatsApp specimen, and screenshots).
"""
import sys
import json
from pathlib import Path
from PIL import Image
import numpy as np

# Ensure project root is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from cv_pipeline.detector import SteelDefectDetector
from cv_pipeline.severity_engine import SeverityAssessmentEngine

def main():
    img_dir = Path(r"C:\Users\ME\OneDrive\Desktop\ARM\image")
    print(f"Scanning directory: {img_dir}")
    images = sorted([p for p in img_dir.glob("*") if p.suffix.lower() in [".png", ".jpg", ".jpeg", ".webp"]])
    
    detector = SteelDefectDetector(
        model_path="models/checkpoints/neu_yolov8n_run/weights/best.pt",
        conf_thresh=0.25,
    )
    severity_engine = SeverityAssessmentEngine()
    
    results_summary = []
    
    for img_path in images:
        img = Image.open(img_path).convert("RGB")
        img_np = np.array(img)
        
        det_result = detector.detect(img_np)
        raw_boxes = [b.__dict__ if hasattr(b, "__dict__") else b for b in det_result.boxes]
        
        record = severity_engine.assess(
            boxes=raw_boxes,
            product_id=img_path.stem[:18],
            inference_ms=det_result.inference_ms
        )
        
        info = {
            "file": img_path.name,
            "has_defect": det_result.has_defect,
            "defect_type": det_result.defect_type,
            "confidence": round(float(det_result.confidence), 4),
            "severity": record.severity.value if hasattr(record.severity, "value") else str(record.severity),
            "decision": record.decision.value if hasattr(record.decision, "value") else str(record.decision),
            "recommendation": record.recommendation,
            "num_boxes": len(det_result.boxes),
            "boxes": [
                {
                    "class_name": b.class_name,
                    "confidence": round(float(b.confidence), 4),
                    "xyxy": [b.x1, b.y1, b.x2, b.y2]
                }
                for b in det_result.boxes
            ],
            "inference_time_ms": round(float(det_result.inference_ms), 2),
        }
        results_summary.append(info)
        print(f"\n=======================================================")
        print(f"FILE: {img_path.name}")
        print(f"  Defect Detected: {info['has_defect']}")
        print(f"  Classification:  {info['defect_type'].upper()} ({info['confidence']:.1%})")
        print(f"  Severity:        {info['severity'].upper()}")
        print(f"  Decision:        {info['decision'].upper()}")
        print(f"  Bounding Boxes:  {info['num_boxes']}")
        for i, b in enumerate(info["boxes"]):
            print(f"    [{i+1}] {b['class_name'].upper()}: {b['confidence']:.1%} at pixels {b['xyxy']}")

    out_file = Path("artifacts/user_image_inspection_report.json")
    out_file.parent.mkdir(parents=True, exist_ok=True)
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(results_summary, f, indent=2)
    print(f"\nSaved structured inspection results to {out_file}")

if __name__ == "__main__":
    main()
