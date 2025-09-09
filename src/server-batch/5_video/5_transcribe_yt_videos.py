import json
import os
import wave
from pathlib import Path
from datetime import datetime, timedelta
from dotenv import load_dotenv
import whisperx
import webrtcvad
from pydub import AudioSegment
from rich.logging import RichHandler
from rich.console import Console
import logging
from contextlib import contextmanager
import sys
import subprocess

load_dotenv(dotenv_path="../../../.env")

# Configuration
MODEL_TYPE = "large-v3"
BATCH_SIZE = 16
DEVICE = "cuda"
COMPUTE_TYPE = "float16"

# VAD Configuration (matching comm script)
VAD_AGGRESSIVENESS = 2  # Aggressiveness level (0-3)
MONO_WAV_FRAME_RATE = 32000
AAC_BITRATE = "96k"
MIN_WAIT_BLOCKS = 10  # Number of consecutive non-voice blocks before end of speech
FRAME_DURATION = 20  # Frame duration in ms (10, 20, or 30)

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


class VideoAudioSegmenter:
    """VAD-based audio segmenter for video files, matching comm script behavior."""

    def __init__(self, wav_path, video_start_time, video_id, model):
        self.wav_path = wav_path
        self.video_start_time = video_start_time
        self.video_id = video_id
        self.model = model

        # Open WAV file
        self.wf = wave.open(str(wav_path), "rb")
        self.n_channels = self.wf.getnchannels()
        self.sample_width = self.wf.getsampwidth()
        self.frame_rate = self.wf.getframerate()
        self.n_frames = self.wf.getnframes()

        # Initialize VAD
        self.vad = webrtcvad.Vad()
        self.vad.set_mode(VAD_AGGRESSIVENESS)

        # Calculate frame sizes
        self.FRAME_SIZE = (
            int(self.frame_rate * FRAME_DURATION / 1000) * self.sample_width
        )

        # State tracking
        self.capturing = False
        self.lastCaptureStartTime = None
        self.frames_processed = 0
        self.currentBlocks = []
        self.segment_count = 0
        self.non_voice_count = 0
        self.frame_duration_seconds = FRAME_DURATION / 1000.0

        # Results storage
        self.transcribed_segments = []

    def close(self):
        self.wf.close()

    def get_segment_filename(self, start_time, segment_idx):
        """Generate filename for segment matching comm script format."""
        time_str = start_time.isoformat().split(".")[0].replace(":", "")
        return f"{time_str}-{self.video_id}_segment_{segment_idx:04d}_YT.aac"

    def process_audio(self):
        """Process the entire WAV file using VAD segmentation."""
        logger.info(
            f"Processing audio with VAD segmentation for video: {self.video_id}"
        )

        while True:
            # Read frame
            try:
                raw_data = self.wf.readframes(int(self.FRAME_SIZE / self.sample_width))
                if len(raw_data) == 0:
                    # End of file
                    if self.capturing:
                        self.complete_segment()
                        self.capturing = False
                    break
            except Exception as e:
                logger.error(f"Error reading frame: {e}")
                break

            # Skip incomplete frames
            if len(raw_data) != self.FRAME_SIZE:
                continue

            self.frames_processed += 1

            # VAD decision
            try:
                is_speech = self.vad.is_speech(raw_data, self.frame_rate)
            except Exception as e:
                logger.error(f"Error in VAD is_speech: {e}")
                is_speech = False

            if is_speech:
                if not self.capturing:
                    # Start new segment
                    self.capturing = True
                    self.non_voice_count = 0
                    current_time_offset = (
                        self.frames_processed * self.frame_duration_seconds
                    )
                    self.lastCaptureStartTime = self.video_start_time + timedelta(
                        seconds=current_time_offset
                    )
                    logger.debug(
                        f"Starting segment at {self.lastCaptureStartTime.isoformat()}"
                    )

                self.currentBlocks.append(raw_data)
                self.non_voice_count = 0
            else:
                if self.capturing:
                    self.non_voice_count += 1
                    if self.non_voice_count <= MIN_WAIT_BLOCKS:
                        # Keep adding non-voice frames
                        self.currentBlocks.append(raw_data)
                    else:
                        # End segment
                        self.complete_segment()
                        self.capturing = False
                        self.non_voice_count = 0
                        # Remove trailing non-voice frames
                        self.currentBlocks = self.currentBlocks[:-MIN_WAIT_BLOCKS]
                        logger.debug("Ending segment")
                else:
                    self.non_voice_count = 0

        logger.info(
            f"VAD processing complete. Created {len(self.transcribed_segments)} segments."
        )
        return self.transcribed_segments

    def complete_segment(self):
        """Complete current audio segment and transcribe it."""
        if not self.currentBlocks:
            return

        # Create temporary AAC file
        segment_filename = self.get_segment_filename(
            self.lastCaptureStartTime, self.segment_count
        )
        temp_aac_path = TEMP_OUTPUT_FOLDER / segment_filename

        # Combine audio frames
        audio_data = b"".join(self.currentBlocks)

        # Create AudioSegment from raw data
        audio_segment = AudioSegment(
            data=audio_data,
            sample_width=self.sample_width,
            frame_rate=self.frame_rate,
            channels=1,  # Mono
        )

        # Export to AAC
        audio_segment.export(
            temp_aac_path, format="adts", codec="aac", bitrate=AAC_BITRATE
        )

        logger.debug(f"Created segment AAC: {segment_filename}")

        # Transcribe the segment
        transcription_result = self.transcribe_segment(
            temp_aac_path, self.lastCaptureStartTime
        )

        if transcription_result:
            # Calculate segment timing
            segment_duration = len(audio_data) / (self.frame_rate * self.sample_width)
            start_seconds = (
                self.lastCaptureStartTime - self.video_start_time
            ).total_seconds()
            end_seconds = start_seconds + segment_duration

            # Create segment entry
            segment_entry = {
                "utteranceTime": self.lastCaptureStartTime.strftime("%H:%M:%S"),
                "filename": segment_filename,
                "text": transcription_result.get("segments", [{}])[0]
                .get("text", "")
                .strip()
                .replace("|", " "),
                "textOriginalLang": "",  # Will be filled if translation occurred
                "start": f"{start_seconds:.2f}",
                "end": f"{end_seconds:.2f}",
                "language": transcription_result.get("language", "en"),
            }

            # Handle original language if translation occurred
            if "origLangSegments" in transcription_result:
                orig_segments = transcription_result["origLangSegments"]
                if orig_segments:
                    segment_entry["textOriginalLang"] = (
                        orig_segments[0].get("text", "").strip().replace("|", " ")
                    )

            # Filter out invalid utterances
            if not is_invalid_utterance(segment_entry["text"]):
                self.transcribed_segments.append(segment_entry)
                logger.debug(f"Added segment: {segment_entry['text'][:50]}...")
            else:
                logger.debug(f"Filtered out invalid utterance: {segment_entry['text']}")

        # Clean up temporary file
        try:
            temp_aac_path.unlink()
        except FileNotFoundError:
            pass

        # Reset for next segment
        self.currentBlocks = []
        self.segment_count += 1

    def transcribe_segment(self, aac_path, utterance_time):
        """Transcribe a single audio segment."""
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
            # Load audio file
            with suppress_stdout_stderr():
                audio = whisperx.load_audio(str(aac_path))

            # Transcribe
            with suppress_stdout_stderr():
                fullResult = self.model.transcribe(audio, batch_size=BATCH_SIZE)

            detected_language = fullResult.get("language", "en")

            if (len(fullResult["segments"]) > 0) and (
                not any(
                    text in fullResult["segments"][0]["text"]
                    for text in textStringsIndicateInvalidTranscript
                )
            ):
                # Handle translation if needed
                if detected_language != "en":
                    fullResult["origLangSegments"] = fullResult["segments"]

                    logger.debug(
                        f"Translating segment from {detected_language} to English"
                    )
                    with suppress_stdout_stderr():
                        trResult = self.model.transcribe(
                            audio, batch_size=BATCH_SIZE, task="translate"
                        )

                    fullResult["segments"] = trResult["segments"]

                # Add metadata
                fullResult["filename"] = aac_path.name
                fullResult["utteranceTime"] = utterance_time.strftime(
                    "%Y-%m-%dT%H:%M:%SZ"
                )
                fullResult["model"] = MODEL_TYPE
                fullResult["modelrunner"] = "whisperx"
                fullResult["transcriptionServerCreateTime"] = datetime.now().isoformat()

                return fullResult
            else:
                return None

        except Exception as ex:
            logger.error(f"Exception in segment transcription: {ex}")
            return None


def convert_video_to_wav(video_path):
    """Convert video to mono WAV file suitable for VAD processing."""
    logger.info(f"Converting video to WAV: {video_path.name}")

    # Create WAV filename
    wav_filename = f"{video_path.stem}_audio.wav"
    wav_path = TEMP_OUTPUT_FOLDER / wav_filename

    # Skip if already exists
    if wav_path.exists():
        logger.debug(f"WAV file already exists: {wav_filename}")
        return wav_path

    try:
        # Use ffmpeg to convert video to WAV (handles large files better than pydub)
        cmd = [
            "ffmpeg",
            "-i",
            str(video_path),
            "-ac",
            "1",  # mono
            "-ar",
            str(MONO_WAV_FRAME_RATE),  # sample rate
            "-y",  # overwrite output file
            str(wav_path),
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode == 0:
            logger.info(f"Created WAV file: {wav_filename}")
            return wav_path
        else:
            logger.error(f"ffmpeg failed: {result.stderr}")
            return None

    except Exception as e:
        logger.error(f"Failed to convert video to WAV: {e}")
        return None


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


def run_transcription_with_vad(model, video_path, video_id, published_date, title):
    """
    Transcribe a video file using VAD-based segmentation (matching comm script approach).
    Returns list of transcribed segments in the daily transcript format.
    """
    try:
        logger.info(f"Starting VAD-based transcription for video: {video_id}")

        # Convert video to WAV
        wav_path = convert_video_to_wav(video_path)
        if not wav_path:
            logger.error(f"Failed to convert video to WAV: {video_id}")
            return None

        # Create VAD segmenter
        segmenter = VideoAudioSegmenter(wav_path, published_date, video_id, model)

        try:
            # Process with VAD segmentation
            segments = segmenter.process_audio()

            if segments:
                logger.info(
                    f"VAD transcription completed: {len(segments)} segments for {video_id}"
                )
                return segments
            else:
                logger.warning(f"No valid segments found for video: {video_id}")
                return None

        finally:
            segmenter.close()
            # Clean up WAV file
            try:
                wav_path.unlink()
            except FileNotFoundError:
                pass

    except Exception as ex:
        logger.exception(f"Exception in VAD-based transcription for {video_id}")
        return None


def process_video_file(model, video_path):
    """Process a single video file using VAD-based transcription."""
    logger.info(f"Processing video: {video_path.name}")

    # Parse filename to extract metadata
    published_date, video_id, title, height = parse_video_filename(video_path.name)

    if not video_id:
        logger.error(f"Could not parse video filename: {video_path.name}")
        return False

    # Skip videos with "launch" in the filename
    if "launch" in video_path.name.lower():
        logger.info(f"Skipping launch video: {video_path.name}")
        return True

    # Create output filename based on input filename (without extension) + _transcript.csv
    input_basename = os.path.splitext(video_path.name)[0]
    output_csv_path = TEMP_OUTPUT_FOLDER / f"{input_basename}_transcript.csv"

    if output_csv_path.exists():
        logger.info(f"Video {video_id} already has transcript. Skipping.")
        return True

    # Transcribe the video using VAD-based approach
    vad_segments = run_transcription_with_vad(
        model, video_path, video_id, published_date, title
    )

    if not vad_segments:
        logger.error(f"Failed to transcribe video: {video_id}")
        return False

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
        for segment in vad_segments:
            row = [segment.get(field, "") for field in fieldnames]
            txtfile.write("|".join(row) + "\n")

    logger.info(f"Saved transcript: {output_csv_path}")
    logger.info(
        f"Processed {len(vad_segments)} VAD transcript segments for video {video_id}"
    )

    return True


def check_existing_transcripts(video_files):
    """Check which videos already have transcripts and return counts."""
    already_processed = 0
    need_processing = 0
    skipped_launch = 0

    for video_path in video_files:
        published_date, video_id, title, height = parse_video_filename(video_path.name)

        if not video_id:
            continue

        # Skip launch videos
        if "launch" in video_path.name.lower():
            skipped_launch += 1
            continue

        # Create output filename based on input filename (without extension) + _transcript.csv
        input_basename = os.path.splitext(video_path.name)[0]
        output_csv_path = TEMP_OUTPUT_FOLDER / f"{input_basename}_transcript.csv"

        if output_csv_path.exists():
            already_processed += 1
        else:
            need_processing += 1

    return already_processed, need_processing, skipped_launch


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
    already_processed, need_processing, skipped_launch = check_existing_transcripts(
        video_files
    )
    logger.info(f"Videos already processed: {already_processed}")
    logger.info(f"Videos needing processing: {need_processing}")
    logger.info(f"Videos skipped (launch): {skipped_launch}")

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
