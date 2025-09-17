import os
import json
import csv  # new import
from dotenv import load_dotenv
from datetime import datetime, timedelta

# Load environment variables from .env file
load_dotenv(dotenv_path="../../.env")

WEB_ASSETS_FOLDER = os.getenv("WEB_ASSETS_FOLDER")
COMM_FOLDER = WEB_ASSETS_FOLDER + "comm/"

START_DATE = "2000-11-01"
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


def check_visiting_vehicle_comm_data(date):
    """Check if there's AG/DG comm data available for the given date"""
    year, month, day = date.split("-")
    path = os.path.join(COMM_FOLDER, year, month, day)

    if not os.path.isdir(path):
        return False

    # Look for JSON files containing "AG" or "DG" in the filename
    for filename in os.listdir(path):
        if filename.endswith(".aac") and ("AG" in filename or "DG" in filename):
            return True

    return False


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


def check_photos_earth(date):
    # Check if the earth photography manifest exists for the given date
    year, month, day = date.split("-")
    path = os.path.join(
        WEB_ASSETS_FOLDER,
        "photos_earth",
        year,
        month,
        f"images-manifest_{year}-{month}-{day}.json",
    )
    return os.path.exists(path)


if __name__ == "__main__":
    available_dates = collect_available_dates(START_DATE, END_DATE)

    # get all of the dates that have youtube available
    videoYt_dates = set()
    with open(f"{WEB_ASSETS_FOLDER}/videoYt.json", "r", encoding="utf-8") as f:
        videoYt = json.load(f)
        for videoYtRecording in videoYt:
            videoYt_dates.add(videoYtRecording["ytStartTime"].split("T")[0])

    # get all of the dates that have IA videos available
    videoIa_dates = set()
    try:
        with open(f"{WEB_ASSETS_FOLDER}/videoIa.json", "r", encoding="utf-8") as f:
            videoIa = json.load(f)
            for video in videoIa:
                videoIa_dates.add(video["date"])
    except FileNotFoundError:
        print("videoIa.json not found, proceeding without IA videos")

    # get all of the dates that have EVAs available
    eva_dates = set()
    with open(f"{WEB_ASSETS_FOLDER}/eva_details.json") as f:
        evas = json.load(f)
        for eva in evas:
            eva_dates.add(eva["startTime"].split("T")[0])

    # get all of the dates that have photos_manual available
    photos_manual_dates = set()
    try:
        with open(
            f"{WEB_ASSETS_FOLDER}/photos_manual.json", "r", encoding="utf-8"
        ) as f:
            photos_manual = json.load(f)
            for photo in photos_manual:
                photos_manual_dates.add(photo["dateTaken"].split("T")[0])
    except FileNotFoundError:
        print("photos_manual.json not found, proceeding without photos_manual")

    # get all of the dates that have images_nasa_gov available
    images_nasa_gov_dates = set()
    try:
        with open(
            f"{WEB_ASSETS_FOLDER}/images_nasa_gov.json", "r", encoding="utf-8"
        ) as f:
            images_nasa_gov = json.load(f)
            for photo in images_nasa_gov:
                images_nasa_gov_dates.add(photo["dateTaken"].split("T")[0])
    except FileNotFoundError:
        print("images_nasa_gov.json not found, proceeding without images_nasa_gov")

    # compile the available media for each date
    date_records = []
    for date in available_dates:
        # Check availability of each data type
        has_comm = check_comm_data(date)
        has_vv_comm = check_visiting_vehicle_comm_data(date)
        has_video = date in videoYt_dates or date in videoIa_dates
        has_eva = date in eva_dates
        has_blog = check_blog_articles(date)
        has_activity_summary = check_activity_summary(date)
        has_earth = check_photos_earth(date)
        has_photos_manual = date in photos_manual_dates
        has_images_nasa_gov = date in images_nasa_gov_dates
        has_photos = has_photos_manual or has_images_nasa_gov

        # Only include dates that have at least one data type available
        if (
            has_comm
            or has_vv_comm
            or has_video
            or has_eva
            or has_blog
            or has_activity_summary
            or has_earth
            or has_photos
        ):
            date_record = {
                "date": date,
                "comm": has_comm,
                "vvComm": has_vv_comm,
                "video": has_video,
                "eva": has_eva,
                "blog": has_blog,
                "actSum": has_activity_summary,
                "earthPhotos": has_earth,
                "photos": has_photos,
            }
            date_records.append(date_record)

    # Change output to CSV
    outputPath = os.path.join(WEB_ASSETS_FOLDER, "data_availability.csv")
    with open(outputPath, "w", newline="") as f:
        writer = csv.writer(f, delimiter="|")
        # Write header
        writer.writerow(
            [
                "date",
                "comm",
                "vvComm",
                "video",
                "eva",
                "blog",
                "actSum",
                "earthPhotos",
                "photos",
            ]
        )
        # Write data rows with booleans converted to integers
        for record in date_records:
            writer.writerow(
                [
                    record["date"],
                    int(record["comm"]),
                    int(record["vvComm"]),
                    int(record["video"]),
                    int(record["eva"]),
                    int(record["blog"]),
                    int(record["actSum"]),
                    int(record["earthPhotos"]),
                    int(record["photos"]),
                ]
            )
    print(f"Available dates have been saved to {outputPath}")
