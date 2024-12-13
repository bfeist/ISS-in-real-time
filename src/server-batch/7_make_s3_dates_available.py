import os
import json
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv(dotenv_path="../../.env")

S3_FOLDER = os.getenv("S3_FOLDER")
COMM_S3 = S3_FOLDER + "comm/"


def collect_available_dates(comm_dir):
    available_dates = []
    for year in os.listdir(comm_dir):
        year_path = os.path.join(comm_dir, year)
        if os.path.isdir(year_path):
            for month in os.listdir(year_path):
                month_path = os.path.join(year_path, month)
                if os.path.isdir(month_path):
                    for day in os.listdir(month_path):
                        day_path = os.path.join(month_path, day)
                        if os.path.isdir(day_path):
                            date_str = f"{year}-{month}-{day}"
                            available_dates.append(date_str)
    return available_dates


# for each available date, make an object with the date and the media available


if __name__ == "__main__":
    available_dates = collect_available_dates(COMM_S3)

    # get all of the dates that have youtube available
    youtube_dates = []
    with open(f"{S3_FOLDER}/youtube_live_recordings.json", "r", encoding="utf-8") as f:
        youtube_live_recordings = json.load(f)
        for youtube_live_recording in youtube_live_recordings:
            youtube_dates.append(youtube_live_recording["startTime"].split("T")[0])

    # get all of the dates that have EVAs available
    eva_dates = []
    with open(f"{S3_FOLDER}/eva_details.json") as f:
        evas = json.load(f)
        for eva in evas:
            eva_dates.append(eva["startTime"].split("T")[0])

    # compile the available media for each date
    date_records = []
    for date in available_dates:
        date_record = {
            "date": date,
            "youtube": date in youtube_dates,
            "eva": date in eva_dates,
        }
        date_records.append(date_record)

    outputPath = os.path.join(S3_FOLDER, "available_dates.json")
    with open(outputPath, "w") as f:
        json.dump(date_records, f, indent=4)
    print(f"Available dates have been saved to {outputPath}")
