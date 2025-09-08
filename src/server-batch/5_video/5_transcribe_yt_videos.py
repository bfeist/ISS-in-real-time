import json
import os
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv
import whisperx
from rich.logging import RichHandler
from rich.console import Console
import logging
from contextlib import contextmanager
import sys

load_dotenv(dotenv_path="../../../.env")

# Configuration
MODEL_TYPE = "large-v3"
BATCH_SIZE = 16
DEVICE = "cuda"
COMPUTE_TYPE = "float16"

# Directories
DOWNLOAD_FOLDER = "D:\\ISSiRT_youtube_videos"
TEMP_OUTPUT_FOLDER = Path("F:/tempF/iss_working/youtube_transcripts")

# Load environment variables
WEB_ASSETS_FOLDER = os.getenv("WEB_ASSETS_FOLDER")
if WEB_ASSETS_FOLDER is None:
    print("Error: WEB_ASSETS_FOLDER environment variable is not set.")
    exit(1)

# Ensure temp output folder exists
TEMP_OUTPUT_FOLDER.mkdir(parents=True, exist_ok=True)

# Create a custom Console instance with forced terminal colors
console = Console(force_terminal=True)

# Pass the custom Console to RichHandler
rich_handler = RichHandler(console=console)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(message)s",
    handlers=[rich_handler],
)

# Create a logger
logger = logging.getLogger("rich")


def is_invalid_utterance(text):
    """Check if utterance text should be filtered out (same as 3_web_comm.py)"""
    textStringsIndicateInvalidUtterance = [
        "Thank you.",
        "Bye.",
        "...",
        "Thanks for watching!",
        "Thank you for watching.",
        "Thank you for watching!",
        "This video is a derivative work of the Touhou Project",
        "Mmm.",
        "Hmm.",
        "BOOOOOM",
        "BOOOOOM!",
        "BEEEEEP",
        "BELL RINGS",
        "Beeping.",
        "BEEP",
        "Beep.",
        "Mmmmmmmm.",
        "MMMMMMMM",
    ]
    return text in textStringsIndicateInvalidUtterance


@contextmanager
def suppress_stdout_stderr():
    """Context manager to suppress stdout and stderr."""
    with open("nul", "w") as nul:
        old_stdout = sys.stdout
        old_stderr = sys.stderr
        try:
            sys.stdout = nul
            sys.stderr = nul
            yield
        finally:
            sys.stdout = old_stdout
            sys.stderr = old_stderr


def sanitize_filename(filename):
    """Sanitize filename for safe saving."""
    return (
        filename.strip()
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


def parse_video_filename(filename):
    """
    Parse video filename to extract metadata.
    Expected format: YYYY-MM-DDTHH-MM-SS_videoId_height_title.mp4
    Returns: (published_date, video_id, title, height)
    """
    try:
        basename = os.path.splitext(filename)[0]
        parts = basename.split("_")

        if len(parts) < 4:
            raise ValueError(f"Filename format not recognized: {filename}")

        # Extract components
        published_at = parts[0]  # YYYY-MM-DDTHH-MM-SS
        video_id = parts[1]
        height = parts[2]
        title = "_".join(parts[3:])  # Rejoin title parts

        # Parse the published date
        published_date = datetime.strptime(published_at, "%Y-%m-%dT%H-%M-%S")

        return published_date, video_id, title, height

    except Exception as e:
        logger.error(f"Failed to parse filename '{filename}': {e}")
        return None, None, None, None


def run_transcription(model, video_path, video_id, published_date, title):
    """
    Transcribe a video file using WhisperX.
    Returns transcription result in the format similar to the comm transcripts.
    """
    textStringsIndicateInvalidTranscript = [
        " Thank you.",
        " Bye.",
        " ...",
        " Thanks for watching!",
        " Thank you for watching.",
        " Thank you for watching!",
        " Thank you for watching",
        " .",
        " This video is a derivative work of the Touhou Project",
    ]

    try:
        logger.info(f"Loading audio from video: {video_path.name}")

        # Load audio file with suppressed output
        with suppress_stdout_stderr():
            audio = whisperx.load_audio(str(video_path))

        # Transcribe audio
        logger.info(f"Transcribing video: {video_id}")
        with suppress_stdout_stderr():
            fullResult = model.transcribe(audio, batch_size=BATCH_SIZE)

        detected_language = fullResult.get("language", "en")

        if (len(fullResult["segments"]) > 0) and (
            not any(
                text in fullResult["segments"][0]["text"]
                for text in textStringsIndicateInvalidTranscript
            )
        ):

            # If the detected language is not English, run translation
            if detected_language != "en":
                fullResult["origLangSegments"] = fullResult["segments"]

                logger.info(
                    f"Translating video {video_id} from {detected_language} to English"
                )
                with suppress_stdout_stderr():
                    trResult = model.transcribe(
                        audio, batch_size=BATCH_SIZE, task="translate"
                    )

                # Replace segments with translated segments
                fullResult["segments"] = trResult["segments"]

            # Add metadata similar to comm transcripts
            fullResult["filename"] = video_path.name
            fullResult["videoId"] = video_id
            fullResult["title"] = title
            fullResult["publishedAt"] = published_date.strftime("%Y-%m-%dT%H:%M:%SZ")
            fullResult["utteranceTime"] = published_date.strftime(
                "%Y-%m-%dT%H:%M:%SZ"
            )  # Use published date as utterance time for now
            fullResult["model"] = MODEL_TYPE
            fullResult["modelrunner"] = "whisperx"
            fullResult["transcriptionServerCreateTime"] = datetime.now().isoformat()

            if "origLangSegments" in fullResult:
                logger.info(
                    f"Original Lang Text: {fullResult['origLangSegments'][0]['text']}"
                )
            logger.info(f"English Text: {fullResult['segments'][0]['text']}")

            return fullResult
        else:
            logger.warning(f"Invalid transcription detected for {video_id}")
            return None

    except Exception as ex:
        logger.exception(f"Exception in transcription for {video_id}")
        return None


def create_daily_transcript_format(transcription_data, published_date, video_id, title):
    """
    Convert the WhisperX transcription result to daily transcript format.
    This mimics the exact format from 3_web_comm.py for easier matching.
    """
    if not transcription_data or not transcription_data.get("segments"):
        return []

    data_list = []

    # Process each segment as a separate utterance (like comm transcripts do)
    segments = transcription_data.get("segments", [])
    origLangSegments = transcription_data.get("origLangSegments", [])

    for i, segment in enumerate(segments):
        # Get text and apply same processing as 3_web_comm.py
        text = segment.get("text", "").strip().replace("|", " ")

        # Apply filtering like 3_web_comm.py
        if is_invalid_utterance(text):
            continue

        # Calculate utterance time based on segment start time
        segment_start_seconds = segment.get("start", 0)
        # For YouTube videos, we'll use the segment timestamp as the utterance time
        # Convert seconds to HH:MM:SS format
        hours = int(segment_start_seconds // 3600)
        minutes = int((segment_start_seconds % 3600) // 60)
        seconds = int(segment_start_seconds % 60)
        utteranceTime_str = f"{hours:02d}:{minutes:02d}:{seconds:02d}"

        # Get start and end times
        start = segment.get("start", "") if segments else ""
        end = segment.get("end", "") if segments else ""

        # Get original language text if available
        textOriginalLang = ""
        if origLangSegments and i < len(origLangSegments):
            textOriginalLang = (
                origLangSegments[i].get("text", "").strip().replace("|", " ")
            )

        # Create filename like comm transcripts (replace .json with .aac equivalent)
        filename = f"{video_id}_segment_{i:04d}.mp4"

        # Create entry matching exact format of 3_web_comm.py
        entry = {
            "utteranceTime": utteranceTime_str,
            "filename": filename,
            "text": text,
            "textOriginalLang": textOriginalLang,
            "start": str(start),
            "end": str(end),
            "language": transcription_data.get("language", "en"),
        }

        data_list.append(entry)

    return data_list


def process_video_file(model, video_path):
    """Process a single video file."""
    logger.info(f"Processing video: {video_path.name}")

    # Parse filename to extract metadata
    published_date, video_id, title, height = parse_video_filename(video_path.name)

    if not video_id:
        logger.error(f"Could not parse video filename: {video_path.name}")
        return False

    # Create output filename based on input filename (without extension) + _transcript.csv
    input_basename = os.path.splitext(video_path.name)[0]
    output_csv_path = TEMP_OUTPUT_FOLDER / f"{input_basename}_transcript.csv"

    if output_csv_path.exists():
        logger.info(f"Video {video_id} already has transcript. Skipping.")
        return True

    # Transcribe the video
    transcription_result = run_transcription(
        model, video_path, video_id, published_date, title
    )

    if not transcription_result:
        logger.error(f"Failed to transcribe video: {video_id}")
        return False

    # Create daily transcript format
    daily_format_data = create_daily_transcript_format(
        transcription_result, published_date, video_id, title
    )

    # Save transcript as CSV (pipe-delimited like comm transcripts)
    # Use exact same field order as 3_web_comm.py
    fieldnames = [
        "utteranceTime",
        "filename",
        "start",
        "end",
        "language",
        "text",
        "textOriginalLang",
    ]

    with open(output_csv_path, "w", encoding="utf-8") as txtfile:
        # Don't write header, just like 3_web_comm.py
        for data in daily_format_data:
            row = [data.get(field, "") for field in fieldnames]
            txtfile.write("|".join(row) + "\n")

    logger.info(f"Saved transcript: {output_csv_path}")
    logger.info(
        f"Processed {len(daily_format_data)} transcript segments for video {video_id}"
    )

    return True


def check_existing_transcripts(video_files):
    """Check which videos already have transcripts and return counts."""
    already_processed = 0
    need_processing = 0

    for video_path in video_files:
        published_date, video_id, title, height = parse_video_filename(video_path.name)

        if not video_id:
            continue

        # Create output filename based on input filename (without extension) + _transcript.csv
        input_basename = os.path.splitext(video_path.name)[0]
        output_csv_path = TEMP_OUTPUT_FOLDER / f"{input_basename}_transcript.csv"

        if output_csv_path.exists():
            already_processed += 1
        else:
            need_processing += 1

    return already_processed, need_processing


def main():
    """Main processing function."""
    logger.critical("Starting YouTube video transcription process...")

    # Check if download folder exists
    if not os.path.exists(DOWNLOAD_FOLDER):
        logger.error(f"Download folder does not exist: {DOWNLOAD_FOLDER}")
        return

    # Load the video list for reference
    json_path = os.path.join(WEB_ASSETS_FOLDER, "youtube_live_recordings.json")
    try:
        with open(json_path, "r", encoding="utf-8") as f:
            video_metadata = json.load(f)
        logger.info(f"Loaded metadata for {len(video_metadata)} videos")
    except Exception as e:
        logger.warning(f"Could not load video metadata: {e}")
        video_metadata = []

    # Get list of all MP4 files in the download folder
    video_files = list(Path(DOWNLOAD_FOLDER).glob("*.mp4"))

    if not video_files:
        logger.warning(f"No MP4 files found in {DOWNLOAD_FOLDER}")
        return

    logger.info(f"Found {len(video_files)} video files to process")

    # Check which videos already have transcripts
    already_processed, need_processing = check_existing_transcripts(video_files)
    logger.info(f"Videos already processed: {already_processed}")
    logger.info(f"Videos needing processing: {need_processing}")

    if need_processing == 0:
        logger.info("All videos already have transcripts. Nothing to process.")
        return

    # Create the WhisperX model
    logger.info("Loading WhisperX model...")
    with suppress_stdout_stderr():
        model = whisperx.load_model(
            MODEL_TYPE, device=DEVICE, compute_type=COMPUTE_TYPE
        )

    # Process each video file
    successful = 0
    failed = 0

    for video_path in video_files:
        try:
            # Parse filename to get metadata for tracking
            published_date, video_id, title, height = parse_video_filename(
                video_path.name
            )

            if process_video_file(model, video_path):
                successful += 1
            else:
                failed += 1
        except Exception as e:
            logger.error(f"Error processing {video_path.name}: {e}")
            failed += 1

    logger.critical(
        f"Transcription process completed. Successful: {successful}, Failed: {failed}"
    )


if __name__ == "__main__":
    main()
