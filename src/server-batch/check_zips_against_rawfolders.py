# This script checks if all the zips in the IA_ZIPS_PROCESSED_TRACKING_FILE have corresponding raw folders in the COMM_TRANSCRIPTS_AACS directory.
# This gives an indication of whether zips have been processed correctly as a check for whether there were errors in the processing.

import os
from pathlib import Path


def extract_date_from_zip(zip_name):
    # Assume zip_name like "1-9-23_Space-to-Grounds.zip" or "1-9-2023_Space-to-Grounds.zip"
    base = os.path.splitext(zip_name)[0]
    if base.count("_") == 1:
        parts = base.split("_")[0].split("-")
    else:
        parts = base.split("Space")[0].split("-")
    if len(parts) < 3:
        return None  # Can't extract date
    # Determine year length: if 2 digits, prepend '20', else use as is
    year_str = parts[2]
    if len(year_str) == 2:
        year = f"20{year_str}"
    else:
        year = year_str
    month = parts[0].zfill(2)
    day = parts[1].zfill(2)
    return year, month, day


def main():
    # Define paths
    base_dir = os.path.dirname(__file__)
    IA_ZIPS_PROCESSED_TRACKING_FILE = os.path.join(base_dir, "ia_zips_processed.txt")
    IA_SKIP_ZIPS_TRACKING_FILE = os.path.join(
        base_dir, "ia_skip_zips.txt"
    )  # New skip tracking file
    COMM_TRANSCRIPTS_AACS = Path(os.getenv("SG_RAW_FOLDER") + "comm_transcripts_aacs/")
    INPUT_IA_ZIPS_PATH = os.path.join(os.getenv("IA_ZIP_WAVS_WORKING_FOLDER"))

    # Read the processed zips from the tracking file
    with open(IA_ZIPS_PROCESSED_TRACKING_FILE, "r") as f:
        zips = [line.strip() for line in f if line.strip()]

    # Read the skip list from the skip tracking file (if exists)
    if os.path.exists(IA_SKIP_ZIPS_TRACKING_FILE):
        with open(IA_SKIP_ZIPS_TRACKING_FILE, "r") as f:
            skip_zips = {line.strip() for line in f if line.strip()}
        # Filter out zips that are in the skip list
        zips = [zip_name for zip_name in zips if zip_name not in skip_zips]

    missing = []
    for zip_name in zips:
        date_parts = extract_date_from_zip(zip_name)
        if not date_parts:
            # If we cannot extract date, consider it missing
            missing.append(zip_name)
            continue
        year, month, day = date_parts
        folder_path = COMM_TRANSCRIPTS_AACS / year / month / day
        if not folder_path.is_dir():
            missing.append(zip_name)

    # Print results
    if missing:
        print("Zips without corresponding raw folder:")
        for name in missing:
            zip_file = os.path.join(
                INPUT_IA_ZIPS_PATH, name
            )  # changed from base_dir to INPUT_IA_ZIPS_PATH
            try:
                size = os.path.getsize(zip_file)
            except OSError:
                size = "N/A"
            print(f"{name} - Size: {size} bytes")
    else:
        print("All zips have corresponding raw folders.")


if __name__ == "__main__":
    main()
