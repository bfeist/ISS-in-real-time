import json
import os
from pathlib import Path
from dotenv import load_dotenv

# Directory containing the JSON files
json_dir = Path(r"F:\_repos\data_processing\IO_nasatv\output\public_photos")

# Load environment variables
load_dotenv(dotenv_path="../../.env")

# Output file path
output_file = Path(os.getenv("WEB_ASSETS_FOLDER")) / "images_nasa_gov.json"
output_file.parent.mkdir(parents=True, exist_ok=True)

# Collect records
records = []
seen_nasa_ids = set()

# Process each JSON file
for json_file in json_dir.glob("exp*.json"):
    print(f"Processing {json_file.name}")

    # Load the JSON data
    with open(json_file, "r") as f:
        data = json.load(f)

    # Process each record
    for record in data:
        nasa_id = record.get("nasa_id")
        if not nasa_id or nasa_id in seen_nasa_ids:
            continue  # Skip if no nasa_id or already seen

        images_nasa_gov = record.get("images_nasa_gov", True)
        if not images_nasa_gov:
            continue  # Skip if images_nasa_gov is false

        date_taken = record.get("md_creation_date")
        if not date_taken:
            continue  # Skip if no date_taken

        records.append({"dateTaken": date_taken, "ID": nasa_id})

        seen_nasa_ids.add(nasa_id)

# Sort records by dateTaken
records.sort(key=lambda x: x["dateTaken"])

# Write to output JSON file
with open(output_file, "w") as f:
    json.dump(records, f, indent=4)

print(f"Output written to {output_file}")
print(f"Total records: {len(records)}")
