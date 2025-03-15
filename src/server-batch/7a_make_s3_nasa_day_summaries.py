import os
import json
import shutil
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv(dotenv_path="../../.env")

S3_FOLDER = os.getenv("S3_FOLDER")
SG_RAW_FOLDER = os.getenv("SG_RAW_FOLDER")


def copy_raw_summaries_to_s3():
    # Read the available dates
    available_dates_path = os.path.join(S3_FOLDER, "available_dates.json")
    if not os.path.exists(available_dates_path):
        print(f"Error: {available_dates_path} does not exist.")
        return

    with open(available_dates_path, "r", encoding="utf-8") as f:
        available_dates = json.load(f)

    # Counter for tracking progress
    copied_count = 0
    skipped_count = 0
    already_exists_count = 0

    # Process each available date
    for date_entry in available_dates:
        date = date_entry["date"]
        year, month, day = date.split("-")

        # Source path in raw folder
        source_path = os.path.join(
            SG_RAW_FOLDER,
            "all_activity_summaries",
            year,
            month,
            f"activity_summary_{date}.json",
        )

        # Destination path in S3 folder structure
        dest_dir = os.path.join(S3_FOLDER, "activity_summaries", year, month)
        source_filename = os.path.basename(source_path)  # Keep the original filename
        dest_path = os.path.join(dest_dir, source_filename)

        # Check if source exists
        if os.path.exists(source_path):
            # Check if destination already exists
            if os.path.exists(dest_path):
                already_exists_count += 1
                # print(f"Summary for {date} already exists at {dest_path}, skipping...")
                continue

            # Create destination directory if it doesn't exist
            os.makedirs(dest_dir, exist_ok=True)

            # Copy the file
            shutil.copy2(source_path, dest_path)
            copied_count += 1
            print(f"Copied summary for {date} to {dest_path}")
        else:
            skipped_count += 1
            # print(f"No summary found for {date}, skipping...")

    print(
        f"Process complete. Copied {copied_count} summaries, skipped {skipped_count} dates, "
        f"{already_exists_count} already existed."
    )


if __name__ == "__main__":
    copy_raw_summaries_to_s3()
