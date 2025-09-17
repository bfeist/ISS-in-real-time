import json
import os
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv(dotenv_path="../../.env")

# Input directory
raw_base = Path(os.getenv("RAW_FOLDER")) / "photos_manual"

# Output file path
output_file = Path(os.getenv("WEB_ASSETS_FOLDER")) / "photos_manual.json"
output_file.parent.mkdir(parents=True, exist_ok=True)

# Collect records
records = []

# Process each image file
for image_file in raw_base.glob("*.jpg"):
    filename = image_file.name
    parts = filename.split("_")
    if len(parts) >= 2:
        date_time_str = parts[0]
        date_part, time_part = date_time_str.split("T")
        time_formatted = time_part.replace("-", ":") + "Z"
        date_taken = f"{date_part}T{time_formatted}"
        nasa_id = parts[1].split(".")[0]
        records.append({"dateTaken": date_taken, "ID": nasa_id})

# Sort records by date_taken
records.sort(key=lambda x: x["dateTaken"])

# Write to output JSON file
with open(output_file, "w") as f:
    json.dump(records, f, indent=4)

print(f"Output written to {output_file}")
print(f"Total records: {len(records)}")
