r"""
scripts/prepare_custom_dataset.py

Curates, crops, annotates, and augments all steel inspection images from
C:\Users\ME\OneDrive\Desktop\ARM\image, including:
- Composite 2x2 grid images (cropped into individual high-res defect specimens & full grid)
- WhatsApp specimen image (crazing network + mechanical gouge)
- High-resolution single defect screenshots (crazing, scratches)
- Multiple defect-free normal steel background samples
- Integration with NEU-DET baseline to preserve all 6 classes:
  0: crazing, 1: inclusion, 2: patches, 3: pitted_surface, 4: rolled_in_scale, 5: scratches
"""

import os
import shutil
import random
from pathlib import Path
from PIL import Image, ImageEnhance, ImageFilter
import numpy as np

# Set reproducible seed
random.seed(42)
np.random.seed(42)

CLASSES = ["crazing", "inclusion", "patches", "pitted_surface", "rolled_in_scale", "scratches"]
CLASS_TO_ID = {name: i for i, name in enumerate(CLASSES)}

def clamp(val, min_val=0.0, max_val=1.0):
    return max(min_val, min(max_val, float(val)))

def augment_image_and_boxes(img: Image.Image, boxes: list):
    """
    Generates augmentations (flips, contrast, brightness, blur) and adjusts bounding boxes.
    boxes format: list of (class_id, xc, yc, w, h)
    """
    augmented = [("orig", img, boxes)]

    # 1. Horizontal Flip
    h_img = img.transpose(Image.FLIP_LEFT_RIGHT)
    h_boxes = [(cls, clamp(1.0 - xc), yc, w, h) for cls, xc, yc, w, h in boxes]
    augmented.append(("hflip", h_img, h_boxes))

    # 2. Vertical Flip
    v_img = img.transpose(Image.FLIP_TOP_BOTTOM)
    v_boxes = [(cls, xc, clamp(1.0 - yc), w, h) for cls, xc, yc, w, h in boxes]
    augmented.append(("vflip", v_img, v_boxes))

    # 3. Brightness variations (simulating furnace / mill lighting)
    enh_b_hi = ImageEnhance.Brightness(img).enhance(1.25)
    augmented.append(("bright_hi", enh_b_hi, boxes))
    enh_b_lo = ImageEnhance.Brightness(img).enhance(0.75)
    augmented.append(("bright_lo", enh_b_lo, boxes))

    # 4. Contrast variations (simulating specular glare & CLAHE normalization)
    enh_c_hi = ImageEnhance.Contrast(img).enhance(1.35)
    augmented.append(("contrast_hi", enh_c_hi, boxes))
    enh_c_lo = ImageEnhance.Contrast(img).enhance(0.80)
    augmented.append(("contrast_lo", enh_c_lo, boxes))

    # 5. Combined flip + contrast
    h_c_img = ImageEnhance.Contrast(h_img).enhance(1.20)
    augmented.append(("hflip_contrast", h_c_img, h_boxes))

    # 6. Fine Gaussian blur (simulating camera focus / depth of field variance)
    blur_img = img.filter(ImageFilter.GaussianBlur(radius=0.8))
    augmented.append(("blur", blur_img, boxes))

    return augmented

def main():
    src_dir = Path(r"C:\Users\ME\OneDrive\Desktop\ARM\image")
    out_dir = Path("data/custom_dataset")

    # Ensure directories exist and clear existing files
    for split in ["train", "val"]:
        for subdir in ["images", "labels"]:
            p = out_dir / subdir / split
            p.mkdir(parents=True, exist_ok=True)
            for f in p.glob("*"):
                try:
                    f.unlink()
                except Exception:
                    pass

    print("=== Processing User Images from ARM/image ===")

    specimens = []

    # -------------------------------------------------------------
    # 1. WhatsApp Specimen: Severe Crazing + Scratch Gouge
    # -------------------------------------------------------------
    wa_path = src_dir / "WhatsApp Image 2026-11-24 at 1.06.26 PM.jpeg"
    if wa_path.exists():
        im = Image.open(wa_path).convert("RGB")
        # Primary crack propagation network (crazing) and puncture gouge (scratches)
        boxes = [
            (CLASS_TO_ID["crazing"], 0.520, 0.580, 0.540, 0.720),
            (CLASS_TO_ID["scratches"], 0.380, 0.380, 0.320, 0.160),
        ]
        specimens.append(("whatsapp_defect_plate", im, boxes))
        print("  Added WhatsApp steel plate defect specimen.")

    # -------------------------------------------------------------
    # 2. Composite Grid Image 1: 3e5b8c21-c43e-4105-8235-0e2104c259c0.webp
    # Top-Left: Rolled-in Scale, Top-Right: Patches
    # Bottom-Left: Pitted Surface, Bottom-Right: Rolled-in Scale
    # -------------------------------------------------------------
    g1_path = src_dir / "3e5b8c21-c43e-4105-8235-0e2104c259c0.webp"
    if g1_path.exists():
        g1 = Image.open(g1_path).convert("RGB")
        w, h = g1.size
        half_w, half_h = w // 2, h // 2

        # Full grid multi-defect image
        full_boxes = [
            (CLASS_TO_ID["rolled_in_scale"], 0.250, 0.250, 0.460, 0.460),
            (CLASS_TO_ID["patches"], 0.750, 0.250, 0.460, 0.460),
            (CLASS_TO_ID["pitted_surface"], 0.250, 0.750, 0.460, 0.460),
            (CLASS_TO_ID["rolled_in_scale"], 0.750, 0.750, 0.460, 0.460),
        ]
        specimens.append(("grid1_full_multi", g1, full_boxes))

        # Individual cropped quadrants
        specimens.append(("grid1_quad_scale_tl", g1.crop((0, 0, half_w, half_h)), [(CLASS_TO_ID["rolled_in_scale"], 0.50, 0.50, 0.90, 0.88)]))
        specimens.append(("grid1_quad_patches_tr", g1.crop((half_w, 0, w, half_h)), [(CLASS_TO_ID["patches"], 0.50, 0.50, 0.90, 0.88)]))
        specimens.append(("grid1_quad_pitted_bl", g1.crop((0, half_h, half_w, h)), [(CLASS_TO_ID["pitted_surface"], 0.50, 0.50, 0.88, 0.88)]))
        specimens.append(("grid1_quad_scale_br", g1.crop((half_w, half_h, w, h)), [(CLASS_TO_ID["rolled_in_scale"], 0.50, 0.50, 0.90, 0.88)]))
        print("  Added Grid 1 (3e5b...) composite and 4 cropped quadrants.")

    # -------------------------------------------------------------
    # 3. Composite Grid Image 2: 5f7a944e-6f9c-48b3-b906-151bc9a12e6a.webp
    # Top-Left: Normal, Top-Right: Normal
    # Bottom-Left: Crazing, Bottom-Right: Scratches
    # -------------------------------------------------------------
    g2_path = src_dir / "5f7a944e-6f9c-48b3-b906-151bc9a12e6a.webp"
    if g2_path.exists():
        g2 = Image.open(g2_path).convert("RGB")
        w, h = g2.size
        half_w, half_h = w // 2, h // 2

        # Full grid
        full_boxes = [
            (CLASS_TO_ID["crazing"], 0.250, 0.750, 0.460, 0.460),
            (CLASS_TO_ID["scratches"], 0.750, 0.750, 0.460, 0.460),
        ]
        specimens.append(("grid2_full_multi", g2, full_boxes))

        # Individual cropped quadrants
        specimens.append(("grid2_quad_normal_tl", g2.crop((0, 0, half_w, half_h)), [])) # Defect-free normal
        specimens.append(("grid2_quad_normal_tr", g2.crop((half_w, 0, w, half_h)), [])) # Defect-free normal
        specimens.append(("grid2_quad_crazing_bl", g2.crop((0, half_h, half_w, h)), [(CLASS_TO_ID["crazing"], 0.50, 0.50, 0.92, 0.92)]))
        specimens.append(("grid2_quad_scratches_br", g2.crop((half_w, half_h, w, h)), [(CLASS_TO_ID["scratches"], 0.50, 0.50, 0.90, 0.90)]))
        print("  Added Grid 2 (5f7a...) composite and 4 cropped quadrants (2 normal, 2 defect).")

    # -------------------------------------------------------------
    # 4. Composite Grid Image 3: bf117ac0-37fb-4997-9fe8-fbfe5b274f54.webp
    # Top-Left: Normal, Top-Right: Inclusion
    # Bottom-Left: Patches, Bottom-Right: Pitted Surface
    # -------------------------------------------------------------
    g3_path = src_dir / "bf117ac0-37fb-4997-9fe8-fbfe5b274f54.webp"
    if g3_path.exists():
        g3 = Image.open(g3_path).convert("RGB")
        w, h = g3.size
        half_w, half_h = w // 2, h // 2

        # Full grid
        full_boxes = [
            (CLASS_TO_ID["inclusion"], 0.750, 0.250, 0.460, 0.460),
            (CLASS_TO_ID["patches"], 0.250, 0.750, 0.460, 0.460),
            (CLASS_TO_ID["pitted_surface"], 0.750, 0.750, 0.460, 0.460),
        ]
        specimens.append(("grid3_full_multi", g3, full_boxes))

        # Individual cropped quadrants
        specimens.append(("grid3_quad_normal_tl", g3.crop((0, 0, half_w, half_h)), [])) # Defect-free normal
        specimens.append(("grid3_quad_inclusion_tr", g3.crop((half_w, 0, w, half_h)), [(CLASS_TO_ID["inclusion"], 0.50, 0.50, 0.90, 0.88)]))
        specimens.append(("grid3_quad_patches_bl", g3.crop((0, half_h, half_w, h)), [(CLASS_TO_ID["patches"], 0.50, 0.50, 0.90, 0.88)]))
        specimens.append(("grid3_quad_pitted_br", g3.crop((half_w, half_h, w, h)), [(CLASS_TO_ID["pitted_surface"], 0.50, 0.50, 0.88, 0.88)]))
        print("  Added Grid 3 (bf11...) composite and 4 cropped quadrants (1 normal, 3 defect).")

    # -------------------------------------------------------------
    # 5. Original User Screenshots
    # -------------------------------------------------------------
    ss_crazing = src_dir / "Screenshot 2026-11-21 190228.png"
    if ss_crazing.exists():
        im = Image.open(ss_crazing).convert("RGB")
        specimens.append(("user_crazing_190228", im, [(CLASS_TO_ID["crazing"], 0.490, 0.550, 0.880, 0.800)]))

    ss_scratches = src_dir / "Screenshot 2026-11-21 190302.png"
    if ss_scratches.exists():
        im = Image.open(ss_scratches).convert("RGB")
        specimens.append(("user_scratches_190302", im, [(CLASS_TO_ID["scratches"], 0.490, 0.480, 0.920, 0.920)]))

    ss_norm1 = src_dir / "Screenshot 2026-11-21 190321.png"
    if ss_norm1.exists():
        im = Image.open(ss_norm1).convert("RGB")
        specimens.append(("user_normal_190321", im, [])) # Defect-free

    ss_norm2 = src_dir / "Screenshot 2026-11-21 190930.png"
    if ss_norm2.exists():
        im = Image.open(ss_norm2).convert("RGB")
        specimens.append(("user_normal_190930", im, [])) # Defect-free

    ss_norm3 = src_dir / "Screenshot 2026-11-21 191702.png"
    if ss_norm3.exists():
        im = Image.open(ss_norm3).convert("RGB")
        specimens.append(("user_normal_191702", im, [])) # Defect-free

    print(f"Total base specimens assembled: {len(specimens)}")

    # -------------------------------------------------------------
    # Augmentation and Train/Val Splitting
    # -------------------------------------------------------------
    total_train = 0
    total_val = 0

    for base_name, img, boxes in specimens:
        aug_list = augment_image_and_boxes(img, boxes)
        for aug_name, aug_img, aug_boxes in aug_list:
            # 85% train, 15% val
            split = "val" if random.random() < 0.15 else "train"
            file_stem = f"{base_name}_{aug_name}"
            img_out_path = out_dir / "images" / split / f"{file_stem}.jpg"
            lbl_out_path = out_dir / "labels" / split / f"{file_stem}.txt"

            # Resize standard to 320x320 for rapid, ultra-responsive edge inference
            aug_resized = aug_img.resize((320, 320), Image.Resampling.LANCZOS)
            aug_resized.save(img_out_path, "JPEG", quality=95)

            # Write label file (empty for normal background samples)
            with open(lbl_out_path, "w", encoding="utf-8") as f:
                for cls_id, xc, yc, bw, bh in aug_boxes:
                    f.write(f"{cls_id} {xc:.6f} {yc:.6f} {bw:.6f} {bh:.6f}\n")

            if split == "train":
                total_train += 1
            else:
                total_val += 1

    # -------------------------------------------------------------
    # 6. Add Baseline NEU-DET Samples for Multi-Class Stability
    # -------------------------------------------------------------
    base_proc_img = Path("data/processed/images/train")
    base_proc_lbl = Path("data/processed/labels/train")
    if base_proc_img.exists() and base_proc_lbl.exists():
        proc_imgs = list(base_proc_img.glob("*.jpg"))
        print(f"Sampling from existing {len(proc_imgs)} NEU-DET samples...")
        for p_img in proc_imgs:
            p_lbl = base_proc_lbl / f"{p_img.stem}.txt"
            if p_lbl.exists():
                split = "val" if random.random() < 0.15 else "train"
                target_img = out_dir / "images" / split / f"neu_{p_img.name}"
                target_lbl = out_dir / "labels" / split / f"neu_{p_img.stem}.txt"
                shutil.copy(p_img, target_img)
                shutil.copy(p_lbl, target_lbl)
                if split == "train":
                    total_train += 1
                else:
                    total_val += 1

    # Write YAML configuration
    yaml_content = f"""path: {out_dir.resolve().as_posix()}
train: images/train
val: images/val

names:
  0: crazing
  1: inclusion
  2: patches
  3: pitted_surface
  4: rolled_in_scale
  5: scratches
"""
    yaml_path = Path("data/custom_dataset.yaml")
    with open(yaml_path, "w", encoding="utf-8") as f:
        f.write(yaml_content)

    print(f"\n[SUCCESS] Custom dataset prepared:")
    print(f"  Training samples:   {total_train}")
    print(f"  Validation samples: {total_val}")
    print(f"  Total samples:      {total_train + total_val}")
    print(f"  Dataset YAML saved to: {yaml_path}")

if __name__ == "__main__":
    main()
