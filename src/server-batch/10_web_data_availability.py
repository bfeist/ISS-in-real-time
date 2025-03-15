import os
import json
from dotenv import load_dotenv
from datetime import datetime, timedelta

# Load environment variables from .env file
load_dotenv(dotenv_path="../../.env")

WEB_ASSETS_FOLDER = os.getenv("WEB_ASSETS_FOLDER")
COMM_FOLDER = WEB_ASSETS_FOLDER + "comm/"

START_DATE = "2000-10-01"
END_DATE = datetime.now().strftime("%Y-%m-%d")


def collect_available_dates(start_date, end_date):
    """Generate a list of all dates between start_date and end_date"""
    start = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d")

    dates = []
    current = start
    while current <= end:
        dates.append(current.strftime("%Y-%m-%d"))
        current += timedelta(days=1)

    return dates


def check_comm_data(date):
    """Check if there's comm data available for the given date"""
    year, month, day = date.split("-")
    path = os.path.join(COMM_FOLDER, year, month, day)
    return os.path.isdir(path)


def check_blog_articles(date):
    """Check if there are blog articles available for the given date"""
    year, month, day = date.split("-")
    path = os.path.join(
        WEB_ASSETS_FOLDER, "blog_articles", year, month, day, "articles.json"
    )
    return os.path.exists(path)


def check_activity_summary(date):
    """Check if there's an activity summary available for the given date"""
    year, month, day = date.split("-")
    path = os.path.join(
        WEB_ASSETS_FOLDER,
        "activity_summaries",
        year,
        month,
        f"activity_summary_{year}-{month}-{day}.json",
    )
    return os.path.exists(path)


if __name__ == "__main__":
    available_dates = collect_available_dates(START_DATE, END_DATE)

    # get all of the dates that have youtube available
    youtube_dates = []
    with open(
        f"{WEB_ASSETS_FOLDER}/youtube_live_recordings.json", "r", encoding="utf-8"
    ) as f:
        youtube_live_recordings = json.load(f)
        for youtube_live_recording in youtube_live_recordings:
            youtube_dates.append(youtube_live_recording["startTime"].split("T")[0])

    # get all of the dates that have EVAs available
    eva_dates = []
    with open(f"{WEB_ASSETS_FOLDER}/eva_details.json") as f:
        evas = json.load(f)
        for eva in evas:
            eva_dates.append(eva["startTime"].split("T")[0])

    # compile the available media for each date
    date_records = []
    for date in available_dates:
        # Check availability of each data type
        has_comm = check_comm_data(date)
        has_youtube = date in youtube_dates
        has_eva = date in eva_dates
        has_blog = check_blog_articles(date)
        has_activity_summary = check_activity_summary(date)

        # Only include dates that have at least one data type available
        if has_comm or has_youtube or has_eva or has_blog or has_activity_summary:
            date_record = {
                "date": date,
                "comm": has_comm,
                "youtube": has_youtube,
                "eva": has_eva,
                "blog": has_blog,
                "activitySummary": has_activity_summary,
            }
            date_records.append(date_record)

    outputPath = os.path.join(WEB_ASSETS_FOLDER, "data_availability.json")
    with open(outputPath, "w") as f:
        json.dump(date_records, f, indent=4)
    print(f"Available dates have been saved to {outputPath}")
