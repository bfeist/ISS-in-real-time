#!/usr/bin/env python3
"""
Create ia_videos.json from files in WEB_ASSETS_FOLDER/ia_videos
Extracts timestamp and filename from MP4 files and stores in JSON format.
"""

import os
import json
import subprocess
from pathlib import Path
from dotenv import load_dotenv
from rich.console import Console
from rich.progress import (
    Progress,
    SpinnerColumn,
    TextColumn,
    BarColumn,
    TimeElapsedColumn,
    TimeRemainingColumn,
)


def get_video_info(video_path):
    """
    Use ffprobe to get video and audio information in one call.
    Returns dict with 'resolution' (tuple width, height), 'video_bitrate' (int kb/s),
    'audio_bitrate' (int kb/s), and 'duration' (float seconds) or None if error.
    """
    try:
        # Use ffprobe directly via subprocess
        cmd = [
            "ffprobe",
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_streams",
            "-show_format",
            str(video_path),
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(result.stdout)

        video_info = {
            "resolution": None,
            "video_bitrate": None,
            "audio_bitrate": None,
            "duration": None,
        }

        # Get duration from format
        duration = data.get("format", {}).get("duration")
        video_info["duration"] = float(duration) if duration else None

        # Find video and audio streams
        for stream in data.get("streams", []):
            if stream.get("codec_type") == "video":
                width = stream.get("width")
                height = stream.get("height")
                bitrate = stream.get("bit_rate")

                video_info["resolution"] = (width, height) if width and height else None
                video_info["video_bitrate"] = int(bitrate) // 1000 if bitrate else None

            elif stream.get("codec_type") == "audio":
                bitrate = stream.get("bit_rate")
                video_info["audio_bitrate"] = int(bitrate) // 1000 if bitrate else None

        return video_info
    except (subprocess.CalledProcessError, json.JSONDecodeError, Exception) as e:
        print(f"Error getting video info for {video_path}: {e}")
        return None


def main():
    # Create rich console
    console = Console()

    # Load environment variables
    load_dotenv(dotenv_path="../../../.env")

    # Get folder paths from environment
    web_assets_folder = os.getenv("WEB_ASSETS_FOLDER")

    if not web_assets_folder:
        console.print("[red]Error: WEB_ASSETS_FOLDER not set in .env file[/red]")
        return 1

    ia_videos_path = Path(web_assets_folder) / "videoIa"
    json_output_path = Path(web_assets_folder) / "videoIa.json"

    console.print(f"[blue]Scanning directory: {ia_videos_path}[/blue]")
    console.print(f"[blue]Output file: {json_output_path}[/blue]")

    if not ia_videos_path.exists():
        console.print(f"[red]Error: Directory {ia_videos_path} does not exist[/red]")
        return 1

    # Find all MP4 files
    mp4_files = list(ia_videos_path.glob("*.mp4"))

    if not mp4_files:
        console.print(f"[yellow]No MP4 files found in {ia_videos_path}[/yellow]")
        return 1

    console.print(f"[green]Found {len(mp4_files)} MP4 files[/green]")
    console.print()

    # Extract data with progress bar
    videos_data = []
    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        BarColumn(),
        TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
        TimeElapsedColumn(),
        TimeRemainingColumn(),
        console=console,
        refresh_per_second=10,
    ) as progress:
        task = progress.add_task("Processing videos...", total=len(mp4_files))

        for mp4_file in mp4_files:
            # Update progress description
            progress.update(task, description=f"Processing: {mp4_file.name}")

            filename = mp4_file.name
            # Extract timestamp: part before first underscore
            timestamp_str = filename.split("_")[0]
            # Parse date and time
            if "T" in timestamp_str:
                date, time_part = timestamp_str.split("T")
                time = time_part.replace("-", ":")
            else:
                # Fallback if no T
                date = timestamp_str
                time = ""

            # Get video info including duration
            video_info = get_video_info(mp4_file)
            duration = video_info["duration"] if video_info else None

            videos_data.append(
                {"date": date, "time": time, "filename": filename, "duration": duration}
            )

            progress.advance(task)

    # Sort by date and time
    videos_data.sort(key=lambda x: (x["date"], x["time"]))

    # Write to JSON
    with open(json_output_path, "w", encoding="utf-8") as f:
        json.dump(videos_data, f, indent=2, ensure_ascii=False)

    console.print(
        f"[green]✓[/green] Created {json_output_path} with {len(videos_data)} entries"
    )
    return 0


if __name__ == "__main__":
    exit(main())
