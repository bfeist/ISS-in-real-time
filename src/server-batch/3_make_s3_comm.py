import os
import json
import csv
import shutil
from datetime import datetime
from zoneinfo import ZoneInfo
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv(dotenv_path="../../.env")

# This script processes the JSON files in the 'tb_transcribed_aacs' directory that are produced by
# the Internet Archive batch processor. It extracts the relevant data and writes it to a pipe-delimited
# CSV file in the 'comm' directory. It also copies the corresponding AAC files to the 'comm' directory.


COMM_TRANSCRIPTS_AACS = os.getenv("SG_RAW_FOLDER") + "comm_transcripts_aacs/"
COMM_S3 = os.getenv("S3_FOLDER") + "comm/"


def is_invalid_utterance(text):
    textStringsIndicateInvalidUtterance = [
        "Thank you.",
        "Bye.",
        "...",
        "Thanks for watching!",
        "Thank you for watching.",
        "Thank you for watching!",
        "This video is a derivative work of the Touhou Project",
    ]
    return text in textStringsIndicateInvalidUtterance


def create_daily_transcript(root_dir, date_str, output_dir):
    # Split the date string into year, month, day
    year, month, day = date_str.split("-")
    dir_path = os.path.join(root_dir, year, month, day)

    print(f"Processing transcripts for {date_str}...")

    # Initialize a list to collect data
    data_list = []

    # Loop over JSON files in the directory
    for filename in os.listdir(dir_path):
        if filename.endswith(".json"):
            file_path = os.path.join(dir_path, filename)
            with open(file_path, "r", encoding="utf-8") as f:
                json_data = json.load(f)

                # Extract and correct 'utteranceTime'
                utteranceTime_str = json_data.get("utteranceTime", "")
                # Remove 'Z' at the end
                utteranceTime_str = utteranceTime_str.rstrip("Z")
                # Parse datetime
                local_dt = datetime.strptime(utteranceTime_str, "%Y-%m-%dT%H:%M:%S")
                # Assign 'America/Chicago' timezone
                local_dt = local_dt.replace(tzinfo=ZoneInfo("America/Chicago"))
                # Convert to UTC
                utc_dt = local_dt.astimezone(ZoneInfo("UTC"))
                # Get ISO format string and extract time part
                utteranceTime_utc = utc_dt.strftime("%H:%M:%S")

                # Concatenate 'text' from all segments
                segments = json_data.get("segments", [])
                text = " ".join(
                    segment.get("text", "").strip().replace("|", " ")
                    for segment in segments
                )

                if is_invalid_utterance(text):
                    continue

                start = segments[0].get("start", "") if segments else ""
                end = segments[-1].get("end", "") if segments else ""

                # Concatenate 'textOriginalLang' from all origLangSegments
                origLangSegments = json_data.get("origLangSegments", [])
                textOriginalLang = " ".join(
                    segment.get("text", "").strip().replace("|", " ")
                    for segment in origLangSegments
                )

                # Append to data list
                data_list.append(
                    {
                        "utteranceTime": utteranceTime_utc,
                        "filename": filename.replace(
                            ".json", ".aac"
                        ),  # Replace JSON extension with AAC
                        "text": text,
                        "textOriginalLang": textOriginalLang,
                        "start": str(start),
                        "end": str(end),
                        "language": json_data.get("language", "en"),
                    }
                )

                # Copy corresponding AAC file to output directory
                aac_filename = json_data.get("filename", "")
                if aac_filename:
                    aac_file_path = os.path.join(dir_path, aac_filename)
                    if os.path.exists(aac_file_path):
                        dest_dir = os.path.join(output_dir, year, month, day)
                        os.makedirs(dest_dir, exist_ok=True)
                        if not os.path.exists(os.path.join(dest_dir, aac_filename)):
                            shutil.copy(aac_file_path, dest_dir)

    # Write the data to a pipe-delimited file
    output_file = os.path.join(
        output_dir, year, month, day, f"_transcript_{date_str}.csv"
    )
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    fieldnames = [
        "utteranceTime",
        "filename",
        "start",
        "end",
        "language",
        "text",
        "textOriginalLang",
    ]

    with open(output_file, "w", encoding="utf-8") as txtfile:
        # txtfile.write('|'.join(fieldnames) + '\n')
        for data in data_list:
            row = [data[field] for field in fieldnames]
            txtfile.write("|".join(row) + "\n")

    print(f"Transcript for {date_str} has been created: {output_file}")
    return date_str


def process_all_transcripts(root_dir, output_dir):
    processed_dates = []
    for year in os.listdir(root_dir):
        year_path = os.path.join(root_dir, year)
        if os.path.isdir(year_path):
            for month in os.listdir(year_path):
                month_path = os.path.join(year_path, month)
                if os.path.isdir(month_path):
                    for day in os.listdir(month_path):
                        day_path = os.path.join(month_path, day)
                        if os.path.isdir(day_path):
                            date_str = f"{year}-{month}-{day}"
                            print(f"Processing date: {date_str}")
                            processed_date = create_daily_transcript(
                                root_dir, date_str, output_dir
                            )
                            processed_dates.append(processed_date)
    return processed_dates


if __name__ == "__main__":
    processed_dates = process_all_transcripts(COMM_TRANSCRIPTS_AACS, COMM_S3)
    # Save processed dates to a file for use in make_tles.py
    # with open("processed_dates.json", "w") as f:
    #     json.dump(processed_dates, f)
