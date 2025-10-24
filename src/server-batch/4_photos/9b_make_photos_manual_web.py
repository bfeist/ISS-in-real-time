import os
import shutil
from pathlib import Path
from PIL import Image
from dotenv import load_dotenv

# Load environment variables
load_dotenv(dotenv_path="../../.env")

# Input directory
raw_base = Path(os.getenv("RAW_FOLDER")) / "photos_manual"

# Output directory
output_base = Path(os.getenv("WEB_ASSETS_FOLDER")) / "photos_manual"

# Create output directories
(output_base / "orig").mkdir(parents=True, exist_ok=True)
(output_base / "med").mkdir(parents=True, exist_ok=True)
(output_base / "thumb").mkdir(parents=True, exist_ok=True)


def resize_image(image_path, output_path, size):
    with Image.open(image_path) as img:
        if size == "med":
            # Resize to fit within 800x600
            img.thumbnail((800, 600), Image.Resampling.LANCZOS)
        elif size == "thumb":
            # Resize width to 100, maintain aspect
            width_percent = 100 / float(img.size[0])
            height_size = int((float(img.size[1]) * float(width_percent)))
            img = img.resize((100, height_size), Image.Resampling.LANCZOS)
        img.save(output_path, "JPEG", quality=85)


# Process each image file
for image_file in raw_base.glob("*.jpg"):
    filename = image_file.name
    parts = filename.split("_")
    if len(parts) >= 2:
        nasa_id = parts[1].split(".")[0]
        output_filename = f"{nasa_id}.jpg"

        # Copy original
        shutil.copy2(image_file, output_base / "orig" / output_filename)

        # Create medium size
        resize_image(image_file, output_base / "med" / output_filename, "med")

        # Create thumbnail
        resize_image(image_file, output_base / "thumb" / output_filename, "thumb")

        print(f"Processed: {filename} -> {output_filename}")
    else:
        print(f"Skipped: {filename} (invalid format)")

print(f"Image processing complete. Output in {output_base}")
