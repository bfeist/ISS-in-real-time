import requests
import os
from datetime import datetime, timedelta

API_KEY = os.getenv("YOUTUBE_API_KEY")
CHANNEL_ID = "UCLA_DiR1FfKNvjuUpBHmylQ"  # NASA's official YouTube Channel ID
YOUTUBE_API_URL = "https://www.googleapis.com/youtube/v3"
S3_FOLDER = os.getenv("S3_FOLDER")


def get_videos_from_channel(channel_id, api_key):
    """
    Fetch all videos from a YouTube channel that match the search query "spacewalk" and are longer than 6 hours.
    """
    videos = []
    next_page_token = None

    while True:
        # Fetch videos from the channel's uploads playlist
        search_url = f"{YOUTUBE_API_URL}/search"
        params = {
            "part": "snippet",
            "channelId": channel_id,
            "q": "spacewalk",  # Add search query
            "maxResults": 50,
            "order": "date",
            "type": "video",
            "pageToken": next_page_token,
            "key": api_key,
        }

        response = requests.get(search_url, params=params)
        response_data = response.json()

        if "items" not in response_data:
            print("Error fetching video data:", response_data)
            break

        video_ids = [item["id"]["videoId"] for item in response_data["items"]]
        videos += filter_videos_by_duration(video_ids, api_key)

        next_page_token = response_data.get("nextPageToken")
        if not next_page_token:
            break

    return videos


def filter_videos_by_duration(video_ids, api_key):
    """
    Filter videos to find those longer than 3 hours.
    """
    filtered_videos = []
    for i in range(
        0, len(video_ids), 50
    ):  # The API allows querying up to 50 videos at once
        ids = ",".join(video_ids[i : i + 50])
        video_details_url = f"{YOUTUBE_API_URL}/videos"
        params = {
            "part": "contentDetails,snippet",
            "id": ids,
            "key": api_key,
        }

        response = requests.get(video_details_url, params=params)
        response_data = response.json()

        for video in response_data.get("items", []):
            durationStr = video["contentDetails"]["duration"]
            duration = seconds_from_duration_str(durationStr)
            if duration > 6 * 3600:  # 6 hours in seconds
                filtered_videos.append(
                    {
                        "title": video["snippet"]["title"],
                        "videoId": video["id"],
                        "duration": duration,
                        "publishedAt": video["snippet"]["publishedAt"],
                    }
                )

    return filtered_videos


def seconds_from_duration_str(duration):
    """
    Check if a duration (ISO 8601 format) is over 3 hours.
    """
    hours = 0
    minutes = 0
    seconds = 0

    duration = duration.replace("PT", "")
    if "H" in duration:
        hours, duration = duration.split("H")
        hours = int(hours)
    if "M" in duration:
        minutes, duration = duration.split("M")
        minutes = int(minutes)
    if "S" in duration:
        seconds = int(duration.replace("S", ""))

    total_seconds = hours * 3600 + minutes * 60 + seconds
    return total_seconds


def get_videos_by_day(channel_id, api_key, date):
    """
    Fetch videos published on a specific date and longer than 6 hours.
    """
    videos = []
    next_page_token = None

    # Define the start and end datetime for the specified date
    start_datetime = datetime.strptime(date, "%Y-%m-%d")
    end_datetime = start_datetime + timedelta(days=1)

    while True:
        search_url = f"{YOUTUBE_API_URL}/search"
        params = {
            "part": "snippet",
            "channelId": channel_id,
            "q": "spacewalk",
            "maxResults": 50,  # YouTube API max is 50
            "order": "date",
            "type": "video",
            "publishedAfter": start_datetime.isoformat("T") + "Z",
            "publishedBefore": end_datetime.isoformat("T") + "Z",
            "pageToken": next_page_token,
            "key": api_key,
        }

        response = requests.get(search_url, params=params)
        response_data = response.json()

        if "items" not in response_data:
            print("Error fetching video data:", response_data)
            break

        video_ids = [item["id"]["videoId"] for item in response_data["items"]]
        filtered = filter_videos_by_duration(video_ids, api_key)

        videos.extend(filtered)

        next_page_token = response_data.get("nextPageToken")
        if not next_page_token:
            break

    return videos


def get_live_videos(channel_id, api_key):
    """
    Fetch all recorded live broadcast videos from a YouTube channel.
    """
    videos = []
    next_page_token = None

    while True:
        search_url = f"{YOUTUBE_API_URL}/search"
        params = {
            "part": "snippet",
            "channelId": channel_id,
            "q": "station OR spacewalk OR ISS",  # Fetch videos with multiple keywords
            "eventType": "completed",  # Fetch completed live broadcasts
            "type": "video",
            "maxResults": 50,
            "pageToken": next_page_token,
            "key": api_key,
        }

        response = requests.get(search_url, params=params)
        response_data = response.json()

        if "items" not in response_data:
            print("Error fetching live video data:", response_data)
            break

        for item in response_data["items"]:
            video = {
                "publishedAt": item["snippet"]["publishedAt"],
                "videoId": item["id"]["videoId"],
                "duration": "Live",  # Indicate that the video is live
                "title": item["snippet"]["title"],
            }
            videos.append(video)

        next_page_token = response_data.get("nextPageToken")
        if not next_page_token:
            break

    return videos


def main():
    print("Fetching videos from NASA channel...")
    # videos = get_videos_from_channel(CHANNEL_ID, API_KEY)

    # with open("youtube.txt", "w", encoding="utf-8") as f:
    #     for video in videos:
    #         f.write(
    #             f"{video['publishedAt']}|{video['videoId']}|{video['duration']}|{video['title']}\n"
    #         )

    # # Perform second search based on days from evas.txt
    # try:
    #     with open("evas.txt", "r") as evas_file:
    #         dates = set()
    #         for line in evas_file:
    #             date = line.strip().split("T")[0]  # Extract YYYY-MM-DD
    #             if date:
    #                 dates.add(date)

    #     # loop over dates starting from the latest date
    #     sorted_dates = sorted(dates, reverse=True)

    #     for date in sorted_dates:
    #         videos_by_day = get_videos_by_day(
    #             channel_id=CHANNEL_ID, api_key=API_KEY, date=date
    #         )
    #         with open("youtube.txt", "a", encoding="utf-8") as f:
    #             for video in videos_by_day:
    #                 f.write(
    #                     f"{video['publishedAt']}|{video['videoId']}|{video['duration']}|{video['title']}\n"
    #                 )
    # except FileNotFoundError:
    #     print("evas.txt not found.")

    # perform a search for all video that liveBroadcastContent is live
    live_videos = get_live_videos(CHANNEL_ID, API_KEY)

    # sort the videos by publishedAt
    live_videos = sorted(live_videos, key=lambda x: x["publishedAt"])

    # filter out videos that don't contain "station" or "spacewalk" or "ISS" in the title or description ignoring case
    # also filter out videos that contain "Google+"
    with open(f"{S3_FOLDER}/youtube_live_recordings.csv", "w", encoding="utf-8") as f:
        for video in live_videos:
            title_lower = video["title"].lower()
            if (
                (
                    "station" in title_lower
                    or "spacewalk" in title_lower
                    or "iss" in title_lower
                )
                and "google+" not in title_lower
                and "preview" not in title_lower
                and "update" not in title_lower
                and "overview" not in title_lower
                and "artemis" not in title_lower
                and "meet the astronauts" not in title_lower
                and "arrival at kennedy" not in title_lower
                and "discuss" not in title_lower
                and "ingenuity" not in title_lower
                and "perseverance" not in title_lower
                and "insight" not in title_lower
                and "anniversary panel" not in title_lower
                and "dart" not in title_lower
                and "james webb" not in title_lower
                and "weather satellite" not in title_lower
                and "swot" not in title_lower
                and "25 years" not in title_lower
                and "atmosphere and oceans" not in title_lower
                and "satellite-u" not in title_lower
                and "science &amp; spacewalks" not in title_lower
            ):

                f.write(
                    f"{video['publishedAt']}|{video['videoId']}|{video['duration']}|{video['title']}\n"
                )


if __name__ == "__main__":
    main()
