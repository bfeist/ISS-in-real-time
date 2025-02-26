import json
import os
import shutil
import wave
from dotenv import load_dotenv
import whisperx
import zipfile
import time
import requests  # Import requests for HTTP requests

from pathlib import Path
from datetime import datetime, timedelta
from rich.logging import RichHandler
from rich.console import Console
import logging

# Additional imports
from pydub import AudioSegment
import webrtcvad
import re

import os
import sys
from contextlib import contextmanager
import threading  # Add threading for file locks
import msvcrt  # For detecting key presses on Windows
from threading import Event

load_dotenv(dotenv_path="../../.env")

# Constants
SHORT_NORMALIZE = 1.0 / 32768.0
MODEL_TYPE = "large-v3"
BATCH_SIZE = 16
DEVICE = "cuda"
COMPUTE_TYPE = "float16"
VAD_AGGRESSIVENESS = 2  # Aggressiveness level (0-3)
MONO_WAV_FRAME_RATE = 32000
AAC_BITRATE = "96k"

# Number of consecutive non-voice blocks before end of speech is declared
MIN_WAIT_BLOCKS = 10

# Configuration for uploading to TalkyBot API
UPLOAD_TO_API = False  # Set to True to enable uploading
TALKYBOT_API_URL = "http://talkybot-local.fit.nasa.gov:5000/"

TRACKING_DIR = Path(
    __file__
).parent  # Tracking files reside in the same folder as this script

IA_ZIPS_PROCESSED_TRACKING_FILE = str(TRACKING_DIR / "ia_zips_processed.txt")
IA_ZIPS_IN_PROGRESS_TRACKING_FILE = str(
    TRACKING_DIR / "ia_zips_in_progress.txt"
)  # New tracking file
IA_SKIP_ZIPS_TRACKING_FILE = str(
    TRACKING_DIR / "ia_skip_zips.txt"
)  # New skip list tracking file
IA_ZIPS_ERRORS_TRACKING_FILE = str(
    TRACKING_DIR / "ia_zips_errors.txt"
)  # New error tracking file

INPUT_IA_ZIPS_PATH = os.path.join(os.getenv("IA_ZIP_WAVS_WORKING_FOLDER"))
CURRENT_IA_ZIP_WAVS_ROOT = Path("F:/tempF/iss_working/current_ia_zip_wavs")
COMM_TRANSCRIPTS_AACS = Path(os.getenv("SG_RAW_FOLDER") + "comm_transcripts_aacs/")

# Thread lock for file operations
file_lock = threading.RLock()

exit_flag = False  # Flag to signal exit
exit_event = Event()  # Event to signal exit
immediate_exit_event = Event()  # Event to signal immediate exit


def read_tracking_file(file_path):
    with file_lock:
        if os.path.exists(file_path):
            with open(file_path, "r") as f:
                return set(line.strip() for line in f)
        else:
            return set()


def add_to_tracking_file(file_path, item):
    with file_lock:
        items = read_tracking_file(file_path)
        if item not in items:
            with open(file_path, "a") as f:
                f.write(f"{item}\n")


def remove_from_tracking_file(file_path, item):
    with file_lock:
        if os.path.exists(file_path):
            lines = []
            with open(file_path, "r") as f:
                lines = f.readlines()
            with open(file_path, "w") as f:
                for line in lines:
                    if line.strip() != item:
                        f.write(line)


def read_skip_list(file_path):
    with file_lock:
        if os.path.exists(file_path):
            with open(file_path, "r") as f:
                return set(line.strip() for line in f)
        else:
            return set()


def checkIfZipAlreadyProcessed(zipFileName):
    processed_zips = read_tracking_file(IA_ZIPS_PROCESSED_TRACKING_FILE)
    in_progress_zips = read_tracking_file(IA_ZIPS_IN_PROGRESS_TRACKING_FILE)
    return zipFileName in processed_zips or zipFileName in in_progress_zips


def ensure_mono_wav(input_wav_path):
    try:
        with wave.open(str(input_wav_path), "rb") as wf:
            n_channels = wf.getnchannels()
            frame_rate = wf.getframerate()
    except Exception as e:
        logger.error(f"Failed to open WAV file '{input_wav_path}': {e}")
        return None  # Indicate failure

    need_conversion = False
    if n_channels != 1:
        need_conversion = True

    if frame_rate != MONO_WAV_FRAME_RATE:
        need_conversion = True

    if not need_conversion:
        # Audio is already mono and has acceptable sample rate
        return input_wav_path
    else:
        # Convert to mono and resample if necessary
        logger.debug(
            f"Converting {input_wav_path.name} to mono and acceptable sample rate"
        )
        audio_segment = AudioSegment.from_wav(str(input_wav_path))
        audio_segment = audio_segment.set_channels(1)
        if frame_rate != MONO_WAV_FRAME_RATE:
            # Resample to desired frame rate
            audio_segment = audio_segment.set_frame_rate(MONO_WAV_FRAME_RATE)
            logger.debug(
                f"Resampling {input_wav_path.name} to {MONO_WAV_FRAME_RATE} Hz"
            )
            frame_rate = MONO_WAV_FRAME_RATE  # Update frame_rate variable

        # Rename the original file
        input_wav_path.rename(
            input_wav_path.parent / (input_wav_path.stem + "_orig.wav")
        )
        # Save to a file with the same name
        wav_path = input_wav_path.parent / (input_wav_path.stem + ".wav")
        audio_segment.export(str(wav_path), format="wav")
        return wav_path


def uploadToApi(aacFilePath, dataToSend):
    successfulUpload = False
    tries = 0
    url = TALKYBOT_API_URL + "api/v1/external/addTranscript"
    while tries < 3 and not successfulUpload:
        try:
            with open(str(aacFilePath), "rb") as f:
                logger.info(f"POST {url} with {aacFilePath.name}")
                r = requests.post(
                    url,
                    verify=False,
                    files={
                        "file": f,
                        "json": (None, dataToSend, "application/json"),
                    },
                )
                logger.debug(f"Status: {r.status_code}")
            successfulUpload = True
        except Exception as e:
            logger.warning(f"Retrying: {aacFilePath.name} (retry count: {tries})")
            logger.warning(f"Error: {e}")
            tries += 1
            time.sleep(30)


class AudioSegmenter(object):
    def __init__(
        self,
        filename,
        start_time,
        descriptor,
        model,
    ):
        self.filename = filename
        self.wf = wave.open(filename, "rb")
        self.descriptor = descriptor
        self.n_channels = self.wf.getnchannels()
        self.sample_width = self.wf.getsampwidth()
        self.frame_rate = self.wf.getframerate()
        self.n_frames = self.wf.getnframes()
        self.start_time = start_time
        self.model = model

        # Initialize VAD
        self.vad = webrtcvad.Vad()
        self.vad.set_mode(VAD_AGGRESSIVENESS)

        self.FRAME_DURATION = 20  # Frame duration in ms (10, 20, or 30)
        self.FRAME_SIZE = (
            int(self.frame_rate * self.FRAME_DURATION / 1000) * self.sample_width
        )

        self.capturing = False
        self.lastCaptureStartTime = None
        self.frames_processed = 0
        self.currentBlocks = []
        self.segment_count = 0

        # For block-based counting
        self.non_voice_count = 0

        # For time calculations
        self.frame_duration_seconds = self.FRAME_DURATION / 1000.0

    def stop(self):
        self.wf.close()

    def getFileName(self, lastCaptureStartTime):
        fileName = (
            lastCaptureStartTime.isoformat().split(".")[0].replace(":", "")
            + "-"
            + self.descriptor
            + "_IA.aac"
        )
        return fileName

    def processWav(self):
        if immediate_exit_event.is_set():
            logger.info("Immediate exit requested during WAV processing.")
            return False
        try:
            raw_data = self.wf.readframes(int(self.FRAME_SIZE / self.sample_width))
            if len(raw_data) == 0:
                # End of file
                if self.capturing:
                    self.audioComplete()
                    self.capturing = False
                    logger.debug("End of file, Capturing off")
                return False  # Signal that we're done
        except Exception as e:
            logger.error(f"Error reading: {e}")
            return True  # Continue processing

        # **Add this check to ensure frame size is correct**
        if len(raw_data) != self.FRAME_SIZE:
            logger.debug(
                f"Skipping incomplete frame of size {len(raw_data)} at end of file"
            )
            return True  # Continue processing

        self.frames_processed += 1

        # VAD decision
        try:
            is_speech = self.vad.is_speech(raw_data, self.frame_rate)
        except Exception as e:
            logger.error(f"Error in is_speech: {e}")
            is_speech = False

        if immediate_exit_event.is_set():
            logger.info("Immediate exit requested during WAV processing.")
            return False

        if is_speech:
            if not self.capturing:
                self.capturing = True
                self.non_voice_count = 0  # Reset non-voice count
                current_time_offset = (
                    self.frames_processed * self.frame_duration_seconds
                )
                self.lastCaptureStartTime = self.start_time + timedelta(
                    seconds=current_time_offset
                )
                logger.debug(f"{self.lastCaptureStartTime.isoformat()} Capturing")
            self.currentBlocks.append(raw_data)
            self.non_voice_count = 0  # Reset non-voice count
        else:
            if self.capturing:
                self.non_voice_count += 1
                if self.non_voice_count <= MIN_WAIT_BLOCKS:
                    # Keep adding the non-voice frames
                    self.currentBlocks.append(raw_data)
                else:
                    # End of speech segment
                    self.audioComplete()
                    self.capturing = False
                    self.non_voice_count = 0
                    # Remove the last non-voice frames the length of MIN_WAIT_BLOCKS
                    self.currentBlocks = self.currentBlocks[:-MIN_WAIT_BLOCKS]
                    logger.debug("Capturing off")
            else:
                self.non_voice_count = 0  # Reset if not capturing

        return True  # Continue processing

    def audioComplete(self):
        if not len(self.currentBlocks) > 0:
            return
        fileName = self.getFileName(self.lastCaptureStartTime)
        # Extract year, month, day from lastCaptureStartTime
        year = str(self.lastCaptureStartTime.year)
        month = str(self.lastCaptureStartTime.month).zfill(2)
        day = str(self.lastCaptureStartTime.day).zfill(2)
        # Create utterance time string
        utteranceTime = self.lastCaptureStartTime
        # Create the dated directory path
        dated_directory = COMM_TRANSCRIPTS_AACS / year / month / day
        # Ensure the directory exists
        dated_directory.mkdir(parents=True, exist_ok=True)
        aacFullPath = dated_directory / fileName
        self.segment_count += 1

        # Combine audio frames into a single bytes object
        audio_data = b"".join(self.currentBlocks)

        # Create an AudioSegment from the raw audio data
        audio_segment = AudioSegment(
            data=audio_data,
            sample_width=self.sample_width,
            frame_rate=self.frame_rate,
            channels=1,  # Mono
        )

        # Export to AAC format using ADTS container
        audio_segment.export(
            aacFullPath, format="adts", codec="aac", bitrate=AAC_BITRATE
        )
        logger.debug(f"Saved AAC file: {aacFullPath}")

        # Now process the segment immediately with WhisperX and save JSON
        result = runTranscriptionLocally(
            self.model, utteranceTime, aacFullPath, self.descriptor
        )

        if result:
            # Save the result JSON to the same dated directory
            jsonFileName = fileName.replace(".aac", ".json")
            jsonFullPath = dated_directory / jsonFileName
            with open(jsonFullPath, "w") as json_file:
                json.dump(result, json_file)
            logger.debug(f"Saved JSON file: {jsonFullPath}")

            # Optional: Upload to TalkyBot API
            if UPLOAD_TO_API:
                dataToSend = json.dumps(result)
                uploadToApi(aacFullPath, dataToSend)
        else:
            # Delete the AAC file if the transcription failed
            logger.debug(
                f"Transcription provided no result for {aacFullPath.name}. Deleting."
            )
            try:
                aacFullPath.unlink()
            except FileNotFoundError:
                logger.warning(
                    f"File not found when attempting to delete: {aacFullPath}"
                )

        # Reset currentBlocks
        self.currentBlocks = []


def parse_wav_filename(filename, downlink_number=None):
    """
    Parses the WAV filename and extracts date_time and sg_channel_descriptor.
    Returns date_time, sg_channel_descriptor.
    """
    basename = os.path.splitext(filename)[0]
    patterns = [
        # Pattern 1: 0000000000_SYNC_SG4_2024-01-08_02_09_04_by_servername_desc
        r"^\d+_SYNC_(SG\d+)_(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})_(\d{2})_by_.*$",
        # Pattern 2: 0000000000_1_SG4_DUP_2024-07-02_13_56_41_by_ui_startdate_desc
        r"^\d+_\d+_(SG\d+)_DUP_(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})_(\d{2})_by_.*$",
        # Pattern 3: 0000000038_SYNC_SG_2_2015-10-13_12_09_27_by_ui_duration_desc.wav
        r"^\d+_SYNC_SG_(\d)_(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})_(\d{2})_by_.*$",
        # Pattern 4: 0000000140_Channel_15_2015-12-18_20_41_59_by_ui_startdate_asc.wav
        r"^\d+_Channel_(\d+)_(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})_(\d{2})_by_.*$",
        # Pattern 5: 2022-03-30-08-30-42-019-Recorder.wav
        r"^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-\d{3}-Recorder$",
    ]
    try:
        for pattern in patterns:
            match = re.match(pattern, basename)
            if match:
                # Handle Pattern 5: manually split as no capture groups are defined.
                if pattern.endswith(r"-Recorder$") and len(match.groups()) == 0:
                    parts = basename.split("-")
                    if len(parts) >= 7:
                        # Build date and time from known positions.
                        date_part = f"{parts[0]}-{parts[1]}-{parts[2]}"
                        time_part = f"{parts[3]}{parts[4]}{parts[5]}"
                        date_time = f"{date_part}T{time_part}"
                        sg_channel = str(downlink_number) if downlink_number else "0"
                        sg_channel_descriptor = f"1_SG_{sg_channel}"
                        return date_time, sg_channel_descriptor
                # For patterns 1-4:
                if match.group(1) == "14":
                    sg_channel = "1"
                elif match.group(1) == "15":
                    sg_channel = "2"
                elif match.group(1) == "16":
                    sg_channel = "3"
                elif match.group(1) == "17":
                    sg_channel = "4"
                else:
                    if downlink_number:
                        sg_channel = str(downlink_number)
                    else:
                        sg_channel = match.group(1)[-1]
                date_part = match.group(2)
                hour = match.group(3)
                minute = match.group(4)
                second = match.group(5)
                date_time = f"{date_part}T{hour}{minute}{second}"
                sg_channel_descriptor = f"1_SG_{sg_channel}"
                return date_time, sg_channel_descriptor

                # skip the rest of the patterns
                break
    except Exception as e:
        logger.error(f"Error parsing filename: {e}")
    logger.warning(f"Unable to parse filename '{filename}'. Skipping.")
    return None, None


def unzipSGZipWavs(zip_path, destination_dir):
    # get date in zip path. will contain something like 1-9-23Space-to-Grounds_wavs or 06-18-16Space-to-Grounds.zip or 10-18-18_Space-to-Grounds.zip
    filename = zip_path.split("\\")[1]
    parts = [filename[0:2], filename[3:5], filename[6:8]]

    zipDate = f"20{parts[2]}-{parts[0].zfill(2)}-{parts[1].zfill(2)}"

    with zipfile.ZipFile(zip_path, "r") as zip_ref:
        # Iterate over each file in the zip archive
        for file_info in zip_ref.infolist():
            # Check if the file is a .wav file
            if file_info.filename.lower().endswith(".wav"):
                # Extract the filename without any directory structure
                original_file_name = os.path.basename(file_info.filename)

                # Extract the folder name
                folder_name = os.path.dirname(file_info.filename)

                # Downlink number is the last char of the folder name if it is a number between 1 and 4
                downlink_number = None
                if folder_name[-1].isdigit() and int(folder_name[-1]) in range(1, 5):
                    downlink_number = int(folder_name[-1])

                # Parse the filename using the supporting function
                date_time, sg_channel_descriptor = parse_wav_filename(
                    original_file_name, downlink_number
                )
                if not date_time or not sg_channel_descriptor:
                    logger.warning(
                        f"Unable to parse filename '{original_file_name}' inside zip '{zip_path}'. Skipping this file."
                    )
                    add_to_tracking_file(
                        IA_ZIPS_ERRORS_TRACKING_FILE, os.path.basename(zip_path)
                    )
                    continue  # Skip this file

                fileDate = date_time.split("T")[0]

                if fileDate != zipDate:
                    logger.warning(
                        f"Date mismatch: {fileDate} in filename does not match {zipDate} in zip path. Skipping this file."
                    )
                    continue

                # Construct the new filename
                new_file_name = f"{date_time}-{sg_channel_descriptor}_IA.wav"

                destination_file_path = os.path.join(destination_dir, new_file_name)

                # Handle potential filename conflicts by appending a counter
                counter = 1
                base_name, extension = os.path.splitext(new_file_name)
                while os.path.exists(destination_file_path):
                    destination_file_path = os.path.join(
                        destination_dir, f"{base_name}_{counter}{extension}"
                    )
                    counter += 1

                # Read the file from the zip archive and write it to the destination directory
                with zip_ref.open(file_info) as source_file:
                    with open(destination_file_path, "wb") as target_file:
                        shutil.copyfileobj(source_file, target_file)


def runTranscriptionLocally(model, utteranceTime, aacFilePath, descriptor):
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
        aacFileName = aacFilePath.name

        if immediate_exit_event.is_set():
            logger.info("Immediate exit requested before transcription.")
            return None

        # Use the model with suppressed output
        with suppress_stdout_stderr():
            # Load audio file
            audio = whisperx.load_audio(str(aacFilePath))

        if immediate_exit_event.is_set():
            logger.info("Immediate exit requested before transcribing audio.")
            return None

        # Transcribe audio
        logger.debug(f"Transcribing {aacFileName} and detecting language")
        # Use the model with suppressed output
        with suppress_stdout_stderr():
            fullResult = model.transcribe(audio, batch_size=16)

        detected_language = fullResult.get("language")

        if (len(fullResult["segments"]) > 0) and (
            not any(
                text in fullResult["segments"][0]["text"]
                for text in textStringsIndicateInvalidTranscript
            )
        ):

            # If the detected language is not English, run translation
            if detected_language != "en":
                fullResult["origLangSegments"] = fullResult["segments"]

                logger.debug(
                    f"Translating {aacFileName} from {detected_language} to English"
                )
                # Use the model with suppressed output
                with suppress_stdout_stderr():
                    trResult = model.transcribe(audio, batch_size=16, task="translate")

                # Replace segments with translated segments
                fullResult["segments"] = trResult["segments"]

            fullResult["filename"] = aacFileName
            fullResult["descriptor"] = descriptor
            fullResult["utteranceTime"] = utteranceTime.strftime("%Y-%m-%dT%H:%M:%SZ")
            fullResult["model"] = MODEL_TYPE
            fullResult["modelrunner"] = "whisperx"
            fullResult["transcriptionServerCreateTime"] = datetime.now().isoformat()

            if "origLangSegments" in fullResult:
                logger.info(f"Lang Text: {fullResult['origLangSegments'][0]['text']}")
            logger.info(f" Eng Text: {fullResult['segments'][0]['text']}")

            return fullResult
        else:
            return None
    except Exception as ex:
        logger.exception("Exception in runTranscriptionLocally")
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


def process_zip_file(zip_file):
    if immediate_exit_event.is_set():
        logger.info(f"Immediate exit requested. Skipping zip: {zip_file}")
        return
    add_to_tracking_file(IA_ZIPS_IN_PROGRESS_TRACKING_FILE, zip_file)
    try:
        logger.info(f"Processing IA ZIP file...{zip_file}")
        input_zip_file_full_path = os.path.join(INPUT_IA_ZIPS_PATH, zip_file)

        # Use zip file name (without extension) for unique directory
        zip_name_without_ext = os.path.splitext(zip_file)[0]
        CURRENT_IA_ZIP_WAVS = Path(
            f"{CURRENT_IA_ZIP_WAVS_ROOT}/{zip_name_without_ext}_wavs"
        )

        # Clear the unique directory contents
        if CURRENT_IA_ZIP_WAVS.exists():
            shutil.rmtree(CURRENT_IA_ZIP_WAVS)
        CURRENT_IA_ZIP_WAVS.mkdir(parents=True, exist_ok=True)

        # Unzip the WAV files into the unique directory
        unzipSGZipWavs(input_zip_file_full_path, CURRENT_IA_ZIP_WAVS)

        # Process each IA WAV file in the unique directory
        for wav_file in CURRENT_IA_ZIP_WAVS.glob("*.wav"):
            if immediate_exit_event.is_set():
                logger.info("Immediate exit requested. Stopping processing.")
                return
            original_wav_file = Path(wav_file)
            wav_file = ensure_mono_wav(original_wav_file)
            if wav_file is None:
                logger.error(f"Skipping invalid WAV file '{original_wav_file}'")
                continue
            try:
                # Parse the start time. The filename is in the format 2024-01-08T012943-1_SG_1_IA.wav
                start_time_str = wav_file.stem[:17]
                start_time = datetime.strptime(start_time_str, "%Y-%m-%dT%H%M%S")
                # Parse out the SG descriptor
                descriptor = wav_file.stem[18:-3]
                segmenter = AudioSegmenter(
                    str(wav_file),
                    start_time,
                    descriptor,
                    model,
                )
            except Exception as e:
                logger.error(f"Error opening WAV file '{wav_file}': {e}")
                continue
            logger.info(f"Segmenting IA WAV file...{wav_file.name}")
            while True:
                if immediate_exit_event.is_set():
                    logger.info("Immediate exit requested during segmentation.")
                    return
                if not segmenter.processWav():
                    break
            segmenter.stop()
            if immediate_exit_event.is_set():
                logger.info("Immediate exit requested after segmentation.")
                return
            # Delete the "orig" file
            orig_wav_file = wav_file.parent / (wav_file.stem + "_orig.wav")
            if orig_wav_file.exists():
                orig_wav_file.unlink()

        # Clean up the unique directory after processing
        if CURRENT_IA_ZIP_WAVS.exists():
            shutil.rmtree(CURRENT_IA_ZIP_WAVS)
    except Exception as e:
        logger.exception(f"Error processing IA ZIP file: {zip_file}")
        # add the bad file to the ia-skip-zips.txt file
        add_to_tracking_file(IA_SKIP_ZIPS_TRACKING_FILE, zip_file)
    finally:
        remove_from_tracking_file(IA_ZIPS_IN_PROGRESS_TRACKING_FILE, zip_file)


def check_for_exit():
    while True:
        if msvcrt.kbhit():
            key = msvcrt.getch()
            if key.lower() == b"a":
                print("\nAborting script after current IA zip...")
                exit_event.set()
            elif key.lower() == b"x":
                print("\nExiting script immediately...")
                immediate_exit_event.set()
        time.sleep(0.1)  # Sleep briefly to reduce CPU usage


if __name__ == "__main__":

    # clear the console and reinstantiate the logger
    os.system("cls" if os.name == "nt" else "clear")

    # Create a custom Console instance with forced terminal colors
    console = Console(force_terminal=True)

    # Pass the custom Console to RichHandler
    rich_handler = RichHandler(console=console)

    # Configure logging
    logging.basicConfig(
        level=logging.INFO,  # Adjust level as needed
        format="%(message)s",
        handlers=[rich_handler],
    )

    # Create a logger
    logger = logging.getLogger("rich")

    logger.critical("Starting ISS transcription process...")

    # Ensure the directories exist
    COMM_TRANSCRIPTS_AACS.mkdir(parents=True, exist_ok=True)

    # Create the model with suppressed output
    with suppress_stdout_stderr():
        model = whisperx.load_model(
            MODEL_TYPE,
            device=DEVICE,
            compute_type=COMPUTE_TYPE,
            download_root=Path("whisperx_models"),
        )

    # Load skip list
    skip_zips = read_skip_list(IA_SKIP_ZIPS_TRACKING_FILE)

    # Start the key press detection thread
    exit_thread = threading.Thread(target=check_for_exit)
    exit_thread.daemon = True
    exit_thread.start()

    # Get list of all .zip files in the source directory
    zip_files = [
        f for f in os.listdir(INPUT_IA_ZIPS_PATH) if f.lower().endswith(".zip")
    ]

    # Create a date-sorted list of zip files. The date is the first 8 characters in mm-dd-yy format.
    dated_zip_file_tuple = [None] * len(zip_files)
    for i in range(len(zip_files)):
        dateStr = zip_files[i][:8]
        month = dateStr[:2]
        day = dateStr[3:5]
        year = dateStr[6:8]
        date = f"20{year}-{month}-{day}"
        dated_zip_file_tuple[i] = (date, zip_files[i])
    # Sort newest to oldest
    dated_zip_file_tuple.sort(reverse=True)

    zip_files = [zip_file for date, zip_file in dated_zip_file_tuple]

    for zip_file in zip_files:
        #     if zip_file == "06-16-16Space-to-Grounds.zip":
        #         print("Skipping 06-16-16Space-to-Grounds.zip")
        if immediate_exit_event.is_set():
            logger.info("Immediate exit requested. Exiting main loop.")
            break
        if exit_event.is_set() and not immediate_exit_event.is_set():
            logger.info("Exit after current IA zip requested. Exiting main loop.")
            break
        if zip_file in skip_zips:
            logger.info(f"Skipping {zip_file} as it is in the skip list.")
            continue
        if checkIfZipAlreadyProcessed(zip_file):
            logger.debug(
                f"Skipping {zip_file} because it has already been processed or is in progress"
            )
            continue
        # if

        process_zip_file(zip_file)

        # Add the zip to the processed list only if an immediate exit was not requested
        # and if no error has occurred (i.e. not in ia_zips_errors.txt)
        if not immediate_exit_event.is_set() and zip_file not in read_tracking_file(
            IA_ZIPS_ERRORS_TRACKING_FILE
        ):
            add_to_tracking_file(IA_ZIPS_PROCESSED_TRACKING_FILE, zip_file)

        if immediate_exit_event.is_set():
            logger.info("Immediate exit requested after processing zip.")
            break
        if exit_event.is_set():
            logger.info("Exit after current IA zip after processing zip.")
            break

    if immediate_exit_event.is_set():
        print("Script exited immediately by user.")
    elif exit_event.is_set():
        print("Script aborted after current IA zip.")
    else:
        print("All zip files processed.")
