import json
import os
from dotenv import load_dotenv
import yt_dlp

load_dotenv(dotenv_path="../../.env")

# Environment variables
WEB_ASSETS_FOLDER = os.getenv("WEB_ASSETS_FOLDER")
if WEB_ASSETS_FOLDER is None:
    print("Error: WEB_ASSETS_FOLDER environment variable is not set.")
    exit(1)
DOWNLOAD_FOLDER = "D:\\ISSiRT_youtube_videos"

# Ensure download folder exists
os.makedirs(DOWNLOAD_FOLDER, exist_ok=True)

# Load the video list
json_path = os.path.join(WEB_ASSETS_FOLDER, "videoYt.json")
with open(json_path, "r", encoding="utf-8") as f:
    videos = json.load(f)


# Function to sanitize title for filename
def sanitize_title(title):
    return (
        title.strip()
        .replace("/", "_")
        .replace("\\", "_")
        .replace(":", "_")
        .replace("*", "_")
        .replace("?", "_")
        .replace('"', "_")
        .replace("<", "_")
        .replace(">", "_")
        .replace("|", "_")
    )


# Download each video
for video in videos:
    ytStartTime = video["ytStartTime"].replace("Z", "").replace(":", "-") + "_"
    video_id = video["videoId"]
    title = sanitize_title(video["title"])

    # Calculate expected filename length and truncate title if necessary
    expected_len = (
        len(ytStartTime) + 1 + len(video_id) + 1 + 4 + 1 + len(title) + 4
    )  # assuming height is 4 chars, .mp4
    if expected_len > 255:
        max_title_len = 255 - (len(ytStartTime) + 1 + len(video_id) + 1 + 4 + 1 + 4)
        title = title[:max_title_len]

    # Construct output template
    output_template = (
        f"{DOWNLOAD_FOLDER}\\{ytStartTime}{video_id}_%(height)s_{title}.mp4"
    )

    # yt-dlp options with fallback format selection
    # Try multiple format options to handle SABR streaming issues
    ydl_opts = {
        "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best[ext=mp4]/best",
        "outtmpl": output_template,
        "nooverwrites": True,
        "noplaylist": True,
        "merge_output_format": "mp4",
        "postprocessors": [
            {
                "key": "FFmpegVideoConvertor",
                "preferedformat": "mp4",
            }
        ],
        # Add options to handle nsig issues
        "extractor_args": {"youtube": {"player_client": ["android", "web"]}},
    }

    try:
        # Check if video already exists (look for any file containing the video_id)
        existing_files = [
            f
            for f in os.listdir(DOWNLOAD_FOLDER)
            if video_id in f and f.endswith(".mp4")
        ]
        if existing_files:
            print(f"Skipped: {video_id} - already exists ({existing_files[0]})")
            continue

        # First, extract info to get available formats
        info_opts = {
            "quiet": True,
            "extractor_args": {"youtube": {"player_client": ["android", "web"]}},
        }
        with yt_dlp.YoutubeDL(info_opts) as ydl:
            info = ydl.extract_info(
                f"https://www.youtube.com/watch?v={video_id}", download=False
            )
            formats = info.get("formats", [])

            # Filter out formats without video (audio only) or without height info
            video_formats = [
                fmt
                for fmt in formats
                if fmt.get("height") and fmt.get("vcodec") != "none"
            ]

            if not video_formats:
                print(
                    f"Warning: No video formats found for {video_id}, skipping format analysis"
                )
            else:
                # Find the best format
                def get_quality_score(fmt):
                    height = fmt.get("height") or 0
                    fps = fmt.get("fps") or 0
                    tbr = fmt.get("tbr") or 0
                    return (height, fps, tbr)

                best_format = max(video_formats, key=get_quality_score)

                print("---")
                print(f"Video: {video_id}")
                print(f"Available video formats count: {len(video_formats)}")
                print(
                    f"Selected best format: {best_format.get('format_id', 'unknown')} - {best_format.get('height', 'unknown')}p @ {best_format.get('fps', 'unknown')}fps, {best_format.get('tbr', 'unknown')}kbps"
                )
                print(f"Format note: {best_format.get('format_note', 'N/A')}")

        # Now download with the best format
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([f"https://www.youtube.com/watch?v={video_id}"])
        print(f"Downloaded: {video_id}")
    except Exception as e:
        print(f"Failed to download {video_id}: {e}")

print("Download process completed.")
