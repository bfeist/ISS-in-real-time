import requests
import os
from datetime import datetime, timedelta

API_KEY = os.getenv("YOUTUBE_API_KEY")
CHANNEL_ID = "UCLA_DiR1FfKNvjuUpBHmylQ"  # NASA's official YouTube Channel ID
YOUTUBE_API_URL = "https://www.googleapis.com/youtube/v3"
S3_FOLDER = os.getenv("S3_FOLDER")


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

    # perform a search for all video are recorded live streams.
    # these are most likey to be timeable in context
    live_videos = get_live_videos(CHANNEL_ID, API_KEY)

    # sort the videos by publishedAt
    live_videos = sorted(live_videos, key=lambda x: x["publishedAt"])

    # filter out videos that are returned by this function that aren't relevant (bunch of string matches)
    filtered_videos = []
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
            filtered_videos.append(video)

    # get the duration of each video from the youtube api and update the duration field
    for video in filtered_videos:
        video_details_url = f"{YOUTUBE_API_URL}/videos"
        params = {
            "part": "contentDetails",
            "id": video["videoId"],
            "key": API_KEY,
        }

        response = requests.get(video_details_url, params=params)
        response_data = response.json()

        if "items" not in response_data:
            print("Error fetching video data:", response_data)
            break

        video["duration"] = seconds_from_duration_str(
            response_data["items"][0]["contentDetails"]["duration"]
        )

    with open(f"{S3_FOLDER}/youtube_live_recordings.csv", "w", encoding="utf-8") as f:
        for video in filtered_videos:
            f.write(
                f"{video['publishedAt']}|{video['videoId']}|{video['duration']}|{video['title']}\n"
            )


if __name__ == "__main__":
    main()
