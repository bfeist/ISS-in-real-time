import os
import json
import csv  # new import
import re  # new import for regex
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


def check_station_timeline(date):
    """Check if there's a station timeline PDF available for the given date"""
    year, month, day = date.split("-")
    path = os.path.join(
        WEB_ASSETS_FOLDER,
        "station_timelines",
        year,
        month,
        f"{year}_{month}_{day}_station_timeline.pdf",
    )
    return os.path.exists(path)


def get_earth_photo_dates():
    """Scan for all earth photo dates using the same method as analyze_photos"""
    earth_dates = set()
    images_folder = WEB_ASSETS_FOLDER + "photos_earth/"

    if os.path.exists(images_folder):
        for root, dirs, files in os.walk(images_folder):
            for file in files:
                if file.endswith(".json") and "images-manifest_" in file:
                    date_match = re.search(
                        r"images-manifest_(\d{4}-\d{2}-\d{2})\.json", file
                    )
                    if date_match:
                        earth_dates.add(date_match.group(1))
    return earth_dates


def get_flickr_photo_dates():
    """Scan for all flickr photo dates using the same method as analyze_photos"""
    flickr_dates = set()
    flickr_folder = WEB_ASSETS_FOLDER + "photos_flickr/"

    if os.path.exists(flickr_folder):
        for root, dirs, files in os.walk(flickr_folder):
            for file in files:
                if file.endswith(".json") and "photos-manifest_" in file:
                    date_match = re.search(
                        r"photos-manifest_(\d{4}-\d{2}-\d{2})\.json", file
                    )
                    if date_match:
                        flickr_dates.add(date_match.group(1))
    return flickr_dates


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

    # Get all photo dates upfront using the same method as analyze_photos
    earth_photo_dates = get_earth_photo_dates()
    flickr_photo_dates = get_flickr_photo_dates()

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
        has_earth = date in earth_photo_dates
        has_flickr = date in flickr_photo_dates
        has_timeline = check_station_timeline(date)

        # Only include dates that have at least one data type available
        if (
            has_comm
            or has_vv_comm
            or has_video
            or has_eva
            or has_blog
            or has_activity_summary
            or has_earth
            or has_flickr
            or has_timeline
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
                "flickrPhotos": has_flickr,
                "timeline": has_timeline,
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
                "flickrPhotos",
                "timeline",
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
                    int(record["flickrPhotos"]),
                    int(record["timeline"]),
                ]
            )
    print(f"Available dates have been saved to {outputPath}")
