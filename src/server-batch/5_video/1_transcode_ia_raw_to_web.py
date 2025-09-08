#!/usr/bin/env python3
"""
Transcode IA video files from raw directory to web directory.
This script processes MP4 files, checking their resolution, video bitrate, and audio bitrate,
then transcoding to 480p with target bitrates if necessary for web consumption.

Features:
- Rich progress bars and console output
- Automatic resolution, video bitrate, and audio bitrate detection
- Smart transcoding: only transcode what needs it (high res, high video bitrate, or high audio bitrate)
- Mixed transcoding modes:
  * Copy video + transcode audio (if only audio needs adjustment)
  * Transcode video + transcode audio (if video needs adjustment)
  * Copy entire file (if both meet requirements)
- Target: 480p resolution, ≤ 1100 kb/s video bitrate, ≤ 101 kb/s audio bitrate
- Uses constant bitrate (CBR) encoding for consistent web streaming
- Includes tolerance for bitrate variations (±10% for video, ±5% for audio)
- Filename cleanup (removes _lowres suffix)
- Error handling and detailed logging
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from rich.console import Console
from rich.progress import (
    Progress,
    TaskID,
    SpinnerColumn,
    TextColumn,
    BarColumn,
    TimeElapsedColumn,
    TimeRemainingColumn,
)
from rich.panel import Panel
from rich.text import Text

# Configuration Constants
TARGET_VIDEO_BITRATE = 1000  # kb/s - Maximum video bitrate for web delivery
TARGET_AUDIO_BITRATE = 96  # kb/s - Maximum audio bitrate for web delivery
VIDEO_BITRATE_TOLERANCE = 1.1  # Allow 10% tolerance above target bitrate
AUDIO_BITRATE_TOLERANCE = 1.05  # Allow 5% tolerance above target bitrate
DEFAULT_VIDEO_BITRATE = "1000k"  # Default ffmpeg video bitrate string
DEFAULT_AUDIO_BITRATE = "96k"  # Default ffmpeg audio bitrate string

# FFmpeg Encoding Parameters
GPU_PRESET = "fast"  # NVENC preset for GPU encoding
CPU_PRESET = "medium"  # x264 preset for CPU encoding

# Video Quality Thresholds
MAX_HEIGHT = 480  # Maximum video height in pixels (480p)
MAX_WIDTH = 854  # Maximum video width in pixels (480p aspect ratio)


def get_video_info(video_path, console: Console = None):
    """
    Use ffprobe to get video and audio information in one call.
    Returns dict with 'resolution' (tuple width, height), 'video_bitrate' (int kb/s),
    and 'audio_bitrate' (int kb/s) or None if error.
    """
    import subprocess
    import json

    try:
        # Use ffprobe directly via subprocess
        cmd = [
            "ffprobe",
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_streams",
            str(video_path),
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(result.stdout)

        video_info = {"resolution": None, "video_bitrate": None, "audio_bitrate": None}

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
        if console:
            console.print(f"[red]Error getting video info for {video_path}: {e}[/red]")
        return None


def is_compliant(media_info):
    """
    Check if media info complies with target requirements.
    Allows some tolerance for bitrate variations due to encoding.
    """
    if not media_info or not media_info["resolution"]:
        return False

    width, height = media_info["resolution"]
    if height > MAX_HEIGHT:
        return False

    video_bitrate = media_info["video_bitrate"]
    if video_bitrate and video_bitrate > TARGET_VIDEO_BITRATE * VIDEO_BITRATE_TOLERANCE:
        return False

    audio_bitrate = media_info["audio_bitrate"]
    if audio_bitrate and audio_bitrate > TARGET_AUDIO_BITRATE * AUDIO_BITRATE_TOLERANCE:
        return False

    return True


def get_output_filename(input_filename):
    """
    Remove _lowres suffix from filename if it exists.
    """
    stem = Path(input_filename).stem
    suffix = Path(input_filename).suffix

    if stem.endswith("_lowres"):
        stem = stem[:-7]  # Remove '_lowres'

    return f"{stem}{suffix}"


def copy_file(src_path, dst_path, console: Console = None):
    """
    Copy file without transcoding using ffmpeg.
    """
    import subprocess

    try:
        cmd = [
            "ffmpeg",
            "-i",
            str(src_path),
            "-c",
            "copy",
            "-movflags",
            "faststart",
            "-y",  # Overwrite output file
            str(dst_path),
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        if console:
            console.print(
                f"[green]✓[/green] Copied: {src_path.name} -> {dst_path.name}"
            )
        return True
    except subprocess.CalledProcessError as e:
        if console:
            console.print(f"[red]✗[/red] Error copying {src_path}: {e}")
        return False


def transcode_audio_only(
    src_path,
    dst_path,
    audio_bitrate=DEFAULT_AUDIO_BITRATE,
    console: Console = None,
    progress: Progress = None,
    task_id: TaskID = None,
):
    """
    Transcode only audio stream while copying video stream unchanged.
    """
    import subprocess

    try:
        if console and progress and task_id is not None:
            progress.update(
                task_id, description=f"Transcoding audio {src_path.name}..."
            )

        cmd = [
            "ffmpeg",
            "-i",
            str(src_path),
            "-c:v",
            "copy",  # Copy video stream unchanged
            "-c:a",
            "aac",  # Transcode audio to AAC
            "-b:a",
            audio_bitrate,
            "-movflags",
            "faststart",
            "-y",  # Overwrite output file
            str(dst_path),
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, check=True)

        if console:
            console.print(
                f"[green]✓[/green] Audio Transcoded: {src_path.name} -> {dst_path.name}"
            )
        return True
    except subprocess.CalledProcessError as e:
        if console:
            console.print(f"[red]✗[/red] Error transcoding audio {src_path}: {e}")
            if e.stderr:
                console.print(f"[dim]FFmpeg stderr: {e.stderr[:200]}...[/dim]")
        return False


def transcode_to_480p(
    src_path,
    dst_path,
    video_bitrate=DEFAULT_VIDEO_BITRATE,
    audio_bitrate=DEFAULT_AUDIO_BITRATE,
    console: Console = None,
    progress: Progress = None,
    task_id: TaskID = None,
):
    """
    Transcode video to 480p with specified bitrates using GPU acceleration (with CPU fallback).
    Uses constant bitrate (CBR) mode for consistent web streaming performance.
    """
    import subprocess

    try:
        if console and progress and task_id is not None:
            progress.update(
                task_id, description=f"Transcoding {src_path.name} to 480p..."
            )

        # Try GPU-accelerated encoding first (without hwaccel for input)
        cmd = [
            "ffmpeg",
            "-i",
            str(src_path),
            "-vf",
            "hwupload_cuda,scale_cuda=-2:480",  # Upload to GPU then scale
            "-c:v",
            "h264_nvenc",  # NVIDIA H.264 encoder
            "-rc",
            "cbr",  # Constant bitrate mode for web streaming
            "-b:v",
            video_bitrate,
            "-c:a",
            "aac",
            "-b:a",
            audio_bitrate,
            "-preset",
            GPU_PRESET,  # NVENC preset
            "-movflags",
            "faststart",
            "-y",  # Overwrite output file
            str(dst_path),
        ]

        result = subprocess.run(cmd, capture_output=True, text=True, check=True)

        if console:
            console.print(
                f"[green]✓[/green] GPU Transcoded: {src_path.name} -> {dst_path.name}"
            )
        return True

    except subprocess.CalledProcessError as e:
        # GPU encoding failed, try CPU encoding as fallback
        if console:
            console.print(
                f"[yellow]⚠️  GPU encoding failed, trying CPU encoding...[/yellow]"
            )
            if e.stderr:
                console.print(f"[dim]GPU error: {e.stderr[:200]}...[/dim]")

        try:
            # Fallback to CPU encoding
            cmd_cpu = [
                "ffmpeg",
                "-i",
                str(src_path),
                "-vf",
                "scale=-2:480",  # CPU scaling
                "-c:v",
                "libx264",  # CPU H.264 encoder
                "-b:v",
                video_bitrate,
                "-maxrate",
                video_bitrate,  # Same as target bitrate for near-CBR
                "-bufsize",
                f"{int(video_bitrate.rstrip('k')) * 2}k",  # 2x target bitrate for buffer
                "-c:a",
                "aac",
                "-b:a",
                audio_bitrate,
                "-preset",
                CPU_PRESET,  # CPU preset
                "-movflags",
                "faststart",
                "-y",  # Overwrite output file
                str(dst_path),
            ]

            result_cpu = subprocess.run(
                cmd_cpu, capture_output=True, text=True, check=True
            )

            if console:
                console.print(
                    f"[green]✓[/green] CPU Transcoded: {src_path.name} -> {dst_path.name}"
                )
            return True

        except subprocess.CalledProcessError as e_cpu:
            if console:
                console.print(f"[red]✗[/red] Error transcoding {src_path}: {e_cpu}")
                if e_cpu.stderr:
                    console.print(f"[dim]CPU FFmpeg stderr: {e_cpu.stderr}[/dim]")
            return False


def check_ffmpeg_availability(console: Console = None):
    """
    Check if ffmpeg and ffprobe are available by trying to run them.
    """
    import subprocess
    import shutil

    # Check if ffmpeg binary exists
    ffmpeg_path = shutil.which("ffmpeg")
    ffprobe_path = shutil.which("ffprobe")

    if not ffmpeg_path:
        if console:
            console.print("[red]Error: ffmpeg not found in PATH[/red]")
            console.print("Please install ffmpeg:")
            console.print("  - Windows: Download from https://ffmpeg.org/download.html")
            console.print("  - Or use: winget install ffmpeg")
            console.print("  - Or use: choco install ffmpeg")
            console.print("  - Add ffmpeg to your system PATH")
        return False

    if not ffprobe_path:
        if console:
            console.print("[red]Error: ffprobe not found in PATH[/red]")
            console.print("ffprobe is usually included with ffmpeg installation")
        return False

    # Try to run ffmpeg to make sure it works
    try:
        result = subprocess.run(
            [ffmpeg_path, "-version"], capture_output=True, text=True, timeout=10
        )
        if result.returncode != 0:
            raise subprocess.CalledProcessError(result.returncode, ffmpeg_path)
    except (
        subprocess.CalledProcessError,
        subprocess.TimeoutExpired,
        FileNotFoundError,
    ):
        if console:
            console.print("[red]Error: ffmpeg found but not working properly[/red]")
        return False

    # Try to run ffprobe to make sure it works
    try:
        result = subprocess.run(
            [ffprobe_path, "-version"], capture_output=True, text=True, timeout=10
        )
        if result.returncode != 0:
            raise subprocess.CalledProcessError(result.returncode, ffprobe_path)
    except (
        subprocess.CalledProcessError,
        subprocess.TimeoutExpired,
        FileNotFoundError,
    ):
        if console:
            console.print("[red]Error: ffprobe found but not working properly[/red]")
        return False

    if console:
        console.print("[green]✓[/green] ffmpeg and ffprobe are available")
    return True


def check_nvidia_gpu_availability(console: Console = None):
    """
    Check if NVIDIA GPU is available for hardware acceleration.
    """
    import subprocess
    import shutil

    # Check if nvidia-smi is available (indicates NVIDIA drivers)
    nvidia_smi_path = shutil.which("nvidia-smi")
    if not nvidia_smi_path:
        if console:
            console.print(
                "[yellow]⚠️  nvidia-smi not found - NVIDIA GPU may not be available[/yellow]"
            )
        return False

    # Try to run nvidia-smi to check GPU status
    try:
        result = subprocess.run(
            [nvidia_smi_path, "--query-gpu=name", "--format=csv,noheader,nounits"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0:
            raise subprocess.CalledProcessError(result.returncode, nvidia_smi_path)

        gpu_name = result.stdout.strip()
        if gpu_name:
            if console:
                console.print(f"[green]✓[/green] NVIDIA GPU detected: {gpu_name}")
            return True
        else:
            if console:
                console.print("[yellow]⚠️  No NVIDIA GPU detected[/yellow]")
            return False
    except (
        subprocess.CalledProcessError,
        subprocess.TimeoutExpired,
        FileNotFoundError,
    ):
        if console:
            console.print("[yellow]⚠️  Could not query NVIDIA GPU status[/yellow]")
        return False


def process_videos(raw_folder, web_folder, console: Console):
    """
    Process all MP4 files in the raw folder with rich progress tracking.
    """
    raw_path = Path(raw_folder)
    web_path = Path(web_folder)

    # Check if directories exist
    if not raw_path.exists():
        console.print(f"[red]Error: Raw folder does not exist: {raw_folder}[/red]")
        return False

    # Create web folder if it doesn't exist
    web_path.mkdir(parents=True, exist_ok=True)

    # Find all MP4 files
    mp4_files = list(raw_path.glob("*.mp4"))
    if not mp4_files:
        console.print(f"[yellow]No MP4 files found in {raw_folder}[/yellow]")
        return True

    console.print(f"[blue]Found {len(mp4_files)} MP4 files to process[/blue]")

    processed = 0
    errors = 0
    skipped = 0

    # Create progress bar for overall processing
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

        overall_task = progress.add_task("Processing videos...", total=len(mp4_files))

        for input_file in mp4_files:
            # Update overall progress description
            progress.update(overall_task, description=f"Processing: {input_file.name}")

            # Get output filename (remove _lowres if present)
            output_filename = get_output_filename(input_file.name)
            output_file = web_path / output_filename

            # Check if output file already exists
            if output_file.exists():
                output_media_info = get_video_info(output_file, console)
                if (
                    output_media_info
                    and is_compliant(output_media_info)
                    and output_file.stat().st_mtime > input_file.stat().st_mtime
                ):
                    console.print(
                        f"[dim]⏭️  Skipping {input_file.name} - output file is compliant and up to date[/dim]"
                    )
                    skipped += 1
                    progress.advance(overall_task)
                    continue
                else:
                    console.print(
                        f"[dim]Output file exists but not compliant or outdated - will transcode[/dim]"
                    )

            # Get video and audio information
            media_info = get_video_info(input_file, console)
            if media_info is None or media_info["resolution"] is None:
                console.print(
                    f"[red]✗[/red] Skipping {input_file.name} - could not determine media info"
                )
                errors += 1
                progress.advance(overall_task)
                continue

            width, height = media_info["resolution"]
            console.print(f"[dim]Resolution: {width}x{height}[/dim]")

            # Get current bitrates
            current_video_bitrate = media_info["video_bitrate"]
            current_audio_bitrate = media_info["audio_bitrate"]
            target_video_bitrate = TARGET_VIDEO_BITRATE  # kb/s
            target_audio_bitrate = TARGET_AUDIO_BITRATE  # kb/s

            if current_video_bitrate:
                console.print(f"[dim]Video bitrate: {current_video_bitrate} kb/s[/dim]")
            else:
                console.print(f"[yellow]Could not determine video bitrate[/yellow]")

            if current_audio_bitrate:
                console.print(f"[dim]Audio bitrate: {current_audio_bitrate} kb/s[/dim]")
            else:
                console.print(f"[yellow]Could not determine audio bitrate[/yellow]")

            # Decide what transcoding is needed
            video_needs_transcoding = height > MAX_HEIGHT or (  # Higher than 480p
                current_video_bitrate
                and current_video_bitrate
                > TARGET_VIDEO_BITRATE * VIDEO_BITRATE_TOLERANCE
            )
            audio_needs_transcoding = (
                current_audio_bitrate
                and current_audio_bitrate
                > TARGET_AUDIO_BITRATE * AUDIO_BITRATE_TOLERANCE
            )

            if video_needs_transcoding:
                # Video needs transcoding, so transcode both video and audio to targets
                console.print(
                    f"[dim]Transcoding video to 480p @ {target_video_bitrate} kb/s CBR and audio to {target_audio_bitrate} kb/s[/dim]"
                )
                success = transcode_to_480p(
                    input_file,
                    output_file,
                    video_bitrate=f"{target_video_bitrate}k",
                    audio_bitrate=f"{target_audio_bitrate}k",
                    console=console,
                    progress=progress,
                    task_id=overall_task,
                )
            elif audio_needs_transcoding:
                # Only audio needs transcoding, copy video and transcode audio
                console.print(
                    f"[dim]Copying video, transcoding audio to {target_audio_bitrate} kb/s[/dim]"
                )
                success = transcode_audio_only(
                    input_file,
                    output_file,
                    audio_bitrate=f"{target_audio_bitrate}k",
                    console=console,
                    progress=progress,
                    task_id=overall_task,
                )
            else:
                # Both video and audio are OK, copy the file
                console.print(f"[dim]File meets quality requirements - copying[/dim]")
                success = copy_file(input_file, output_file, console)

            if success:
                processed += 1
            else:
                errors += 1

            progress.advance(overall_task)

    # Final summary
    console.print()
    summary = Text("Processing Complete", style="bold blue")
    console.print(Panel.fit(summary))

    console.print(f"[green]Files processed: {processed}[/green]")
    if skipped > 0:
        console.print(f"[yellow]Files skipped: {skipped}[/yellow]")
    if errors > 0:
        console.print(f"[red]Errors: {errors}[/red]")

    return errors == 0


def main():
    """
    Main function to process IA video files.
    """
    # Create rich console
    console = Console()

    # Welcome message
    console.print()
    title = Text("🎬 IA Video Transcoder (CBR for Web Streaming)", style="bold blue")
    subtitle = Text(
        "Target: 480p @ 1000 kb/s video CBR (±10%), ≤ 96 kb/s audio (±5%)", style="dim"
    )
    console.print(Panel.fit(title))
    console.print(Panel.fit(subtitle))
    console.print()

    # Load environment variables
    load_dotenv(dotenv_path="../../../.env")

    # Get folder paths from environment
    raw_base = os.getenv("RAW_FOLDER")
    web_base = os.getenv("WEB_ASSETS_FOLDER")

    if not raw_base or not web_base:
        console.print(
            "[red]Error: RAW_FOLDER and/or WEB_ASSETS_FOLDER not set in .env file[/red]"
        )
        return 1

    # Construct full paths
    raw_folder = os.path.join(raw_base, "ia_video_files_raw")
    web_folder = os.path.join(web_base, "ia_videos")

    console.print(f"[blue]Raw folder: {raw_folder}[/blue]")
    console.print(f"[blue]Web folder: {web_folder}[/blue]")
    console.print()

    # Check ffmpeg availability
    if not check_ffmpeg_availability(console):
        return 1

    # Check NVIDIA GPU availability
    gpu_available = check_nvidia_gpu_availability(console)
    if gpu_available:
        console.print("[green]🎮 Using NVIDIA GPU acceleration for transcoding[/green]")
    else:
        console.print(
            "[yellow]⚠️  NVIDIA GPU not available - falling back to CPU encoding[/yellow]"
        )
    console.print()

    # Process videos
    success = process_videos(raw_folder, web_folder, console)

    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
