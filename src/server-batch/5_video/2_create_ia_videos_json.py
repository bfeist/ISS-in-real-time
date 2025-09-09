#!/usr/bin/env python3
"""
Create ia_videos.json from files in WEB_ASSETS_FOLDER/ia_videos
Extracts timestamp and filename from MP4 files and stores in JSON format.
"""

import os
import json
from pathlib import Path
from dotenv import load_dotenv


def main():
    # Load environment variables
    load_dotenv(dotenv_path="../../../.env")

    # Get folder paths from environment
    web_assets_folder = os.getenv("WEB_ASSETS_FOLDER")

    if not web_assets_folder:
        print("Error: WEB_ASSETS_FOLDER not set in .env file")
        return 1

    ia_videos_path = Path(web_assets_folder) / "videoIa"
    json_output_path = Path(web_assets_folder) / "videoIa.json"

    print(f"Scanning directory: {ia_videos_path}")
    print(f"Output file: {json_output_path}")

    if not ia_videos_path.exists():
        print(f"Error: Directory {ia_videos_path} does not exist")
        return 1

    # Find all MP4 files
    mp4_files = list(ia_videos_path.glob("*.mp4"))

    if not mp4_files:
        print(f"No MP4 files found in {ia_videos_path}")
        return 1

    print(f"Found {len(mp4_files)} MP4 files")

    # Extract data
    videos_data = []
    for mp4_file in mp4_files:
        filename = mp4_file.name
        # Extract timestamp: part before first underscore
        timestamp_str = filename.split("_")[0]
        # Parse date and time
        if "T" in timestamp_str:
            date, time_part = timestamp_str.split("T")
            time = time_part.replace("-", ":")
        else:
            # Fallback if no T
            date = timestamp_str
            time = ""
        videos_data.append({"date": date, "time": time, "filename": filename})

    # Sort by date and time
    videos_data.sort(key=lambda x: (x["date"], x["time"]))

    # Write to JSON
    with open(json_output_path, "w", encoding="utf-8") as f:
        json.dump(videos_data, f, indent=2, ensure_ascii=False)

    print(f"Created {json_output_path} with {len(videos_data)} entries")
    return 0


if __name__ == "__main__":
    exit(main())
