#!/usr/bin/env python3
"""
6_web_gen_start_offset_from_transcripts.py

Uses fuzzy matching to align YouTube video transcripts with communication transcripts
to determine the start time offset of YouTube videos relative to real-time mission communications.

The script:
1. Parses YouTube transcript filenames to extract dates
2. Loads corresponding daily comm transcripts from the date-based folder structure
3. Uses fuzzy matching to identify sequences of matching space-to-ground communications
4. Calculates video start offset based on timing differences
"""

import os
import csv
import re
from datetime import datetime, timedelta
from pathlib import Path
from dotenv import load_dotenv
import difflib
from typing import List, Dict, Tuple, Optional
import json

# Load environment variables
load_dotenv(dotenv_path="../../../.env")

# Configuration
WEB_ASSETS_FOLDER = os.getenv("WEB_ASSETS_FOLDER")
RAW_FOLDER = os.getenv("RAW_FOLDER")

YOUTUBE_TRANSCRIPTS_FOLDER = "F:/tempF/iss_working/youtube_transcripts"
COMM_FOLDER = WEB_ASSETS_FOLDER + "comm/"
YOUTUBE_RECORDINGS_FILE = WEB_ASSETS_FOLDER + "youtube_live_recordings.json"
PROCESSING_LOG_FILE = RAW_FOLDER + "youtube_transcript_processing_log.json"

# Fuzzy matching parameters
MIN_SIMILARITY_THRESHOLD = 0.6  # Minimum similarity for a match
MIN_CONSECUTIVE_MATCHES = 3  # Minimum consecutive matches needed
MAX_TIME_OFFSET_VARIANCE = 30  # Max variance in seconds between utterance timings


class TranscriptEntry:
    """Represents a single transcript entry."""

    def __init__(
        self,
        time_str: str,
        filename: str,
        start: float,
        end: float,
        language: str,
        text: str,
        original_text: str = "",
    ):
        self.time_str = time_str
        self.filename = filename
        self.start = start
        self.end = end
        self.language = language
        self.text = text.strip()
        self.original_text = original_text.strip()

        # Parse the time string to get actual datetime
        self.timestamp = self.parse_timestamp(time_str)

    def parse_timestamp(self, time_str: str) -> datetime:
        """Parse timestamp from different formats."""
        # YouTube format: HH:MM:SS
        if ":" in time_str and "T" not in time_str:
            # Convert to full datetime assuming it's within the same day
            time_parts = time_str.split(":")
            hour = int(time_parts[0])
            minute = int(time_parts[1])
            second = int(time_parts[2])
            # We'll set a base date that gets updated when we know the actual date
            return datetime(2000, 1, 1, hour, minute, second)

        # Comm format: HH:MM:SS (but could be different)
        elif ":" in time_str:
            time_parts = time_str.split(":")
            hour = int(time_parts[0])
            minute = int(time_parts[1])
            second = int(time_parts[2])
            return datetime(2000, 1, 1, hour, minute, second)

        return datetime(2000, 1, 1)  # Fallback

    def __repr__(self):
        return f"TranscriptEntry({self.time_str}, '{self.text[:50]}...')"


def load_youtube_recordings() -> List[Dict]:
    """Load existing YouTube recordings from JSON file."""
    if os.path.exists(YOUTUBE_RECORDINGS_FILE):
        try:
            with open(YOUTUBE_RECORDINGS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading YouTube recordings: {e}")
            return []
    return []


def save_youtube_recordings(recordings: List[Dict]) -> bool:
    """Save YouTube recordings to JSON file."""
    try:
        # Write new data
        with open(YOUTUBE_RECORDINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(recordings, f, indent=2, ensure_ascii=False)
        print(f"YouTube recordings saved to: {YOUTUBE_RECORDINGS_FILE}")
        return True
    except Exception as e:
        print(f"Error saving YouTube recordings: {e}")
        return False


def load_processing_log() -> List[Dict]:
    """Load processing log from JSON file."""
    if os.path.exists(PROCESSING_LOG_FILE):
        try:
            with open(PROCESSING_LOG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading processing log: {e}")
            return []
    return []


def save_processing_log(log_entries: List[Dict]) -> bool:
    """Save processing log to JSON file."""
    try:
        # Write new data
        with open(PROCESSING_LOG_FILE, "w", encoding="utf-8") as f:
            json.dump(log_entries, f, indent=2, ensure_ascii=False)
        print(f"Processing log saved to: {PROCESSING_LOG_FILE}")
        return True
    except Exception as e:
        print(f"Error saving processing log: {e}")
        return False


def find_recording_by_video_id(recordings: List[Dict], video_id: str) -> Optional[Dict]:
    """Find recording entry by video ID."""
    for entry in recordings:
        if entry.get("videoId") == video_id:
            return entry
    return None


def calculate_start_time_from_recording_entry(recording_entry: Dict) -> datetime:
    """Calculate video start time from recording entry."""

    # If we already have a derived start time, use it
    if "derivedStartTime" in recording_entry:
        return datetime.fromisoformat(
            recording_entry["derivedStartTime"].replace("Z", "+00:00")
        )

    # Otherwise, use the ytStartTime if available
    yt_start_time = recording_entry.get("ytStartTime")
    if yt_start_time:
        return datetime.fromisoformat(yt_start_time.replace("Z", "+00:00"))

    raise ValueError(
        f"No start time information available in recording entry: {recording_entry}"
    )


def create_log_entry_from_script_result(
    date: datetime,
    video_id: str,
    title: str,
    video_start_datetime: datetime,
    first_match_info: Dict,
    success: bool = True,
    failure_reason: str = "",
) -> Dict:
    """Create a log entry from script processing result."""

    log_entry = {
        # Core identification
        "date": date.strftime("%Y-%m-%d"),
        "videoId": video_id,
        "title": title,
        # Processing metadata
        "source": "automated_fuzzy_matching",
        "processingDate": datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "processingStatus": "success" if success else "failed",
    }

    if success:
        youtube_seconds = first_match_info["youtube_offset_seconds"]
        hours = int(youtube_seconds // 3600)
        minutes = int((youtube_seconds % 3600) // 60)
        seconds = int(youtube_seconds % 60)
        video_time_point = f"{hours:02d}:{minutes:02d}:{seconds:02d}"

        # The timestamp is when this video time point actually occurred in real time
        real_time_at_video_point = (
            video_start_datetime + timedelta(seconds=youtube_seconds)
        ).strftime("%Y-%m-%dT%H:%M:%SZ")

        log_entry.update(
            {
                # Timing synchronization point
                "videoTimePoint": video_time_point,
                "realTimeAtVideoPoint": real_time_at_video_point,
                # Calculated results
                "calculatedVideoStartTime": video_start_datetime.strftime(
                    "%Y-%m-%dT%H:%M:%SZ"
                ),
                # Analysis metadata
                "confidence": first_match_info.get("similarity", 0.0),
                "processingNotes": f"Automated fuzzy matching found {first_match_info.get('num_matches', 0)} consecutive matches",
                "firstMatchYoutubeText": first_match_info.get(
                    "first_match_youtube_text", ""
                ),
                "firstMatchCommText": first_match_info.get("first_match_comm_text", ""),
            }
        )
    else:
        log_entry.update(
            {
                "confidence": 0.0,
                "processingNotes": f"Processing failed: {failure_reason}",
            }
        )

    return log_entry


def parse_youtube_filename(
    filename: str,
) -> Tuple[Optional[datetime], Optional[str], Optional[str]]:
    """
    Parse YouTube transcript filename to extract metadata.
    Format: YYYY-MM-DDTHH-MM-SS_videoId_height_title_transcript.csv
    videoId is 11 characters (YouTube standard), may contain underscores.
    Returns: (date, video_id, title)
    """
    try:
        basename = os.path.splitext(filename)[0]  # Remove .csv
        if basename.endswith("_transcript"):
            basename = basename[:-11]  # Remove _transcript

        if len(basename) < 20:  # Minimum length: date_time + _ + 11 char video_id
            print(f"Warning: Filename too short: {filename}")
            return None, None, None

        # Extract date_time (first 19 chars: YYYY-MM-DDTHH-MM-SS)
        date_time_str = basename[:19]

        # Check if there's an underscore after date_time
        if basename[19] != "_":
            print(f"Warning: Unexpected format after date_time: {filename}")
            return None, None, None

        # Extract video_id (next 11 chars after _)
        rest = basename[20:]
        if len(rest) < 11:
            print(f"Warning: Filename too short for video_id: {filename}")
            return None, None, None

        video_id = rest[:11]

        # Remaining part after video_id
        after_video_id = rest[11:]
        if not after_video_id.startswith("_"):
            print(f"Warning: Unexpected format after video_id: {filename}")
            return None, None, None

        # Split the remaining part: _height_title
        parts = after_video_id[1:].split("_", 1)
        if len(parts) < 2:
            print(f"Warning: Unexpected format for height and title: {filename}")
            return None, None, None

        height = parts[0]
        title = parts[1]

        # Parse the date
        date_part = date_time_str.split("T")[0]  # Get YYYY-MM-DD
        date = datetime.strptime(date_part, "%Y-%m-%d")

        return date, video_id, title

    except Exception as e:
        print(f"Error parsing filename {filename}: {e}")
        return None, None, None


def load_youtube_transcript(filepath: str) -> List[TranscriptEntry]:
    """Load and parse YouTube transcript CSV file."""
    entries = []
    try:
        with open(filepath, "r", encoding="utf-8") as file:
            # YouTube transcripts are pipe-delimited
            reader = csv.reader(file, delimiter="|")
            for row in reader:
                if len(row) >= 6:  # Ensure we have all required fields
                    time_str = row[0]
                    filename = row[1]
                    start = float(row[2])
                    end = float(row[3])
                    language = row[4]
                    text = row[5]
                    original_text = row[6] if len(row) > 6 else ""

                    entry = TranscriptEntry(
                        time_str, filename, start, end, language, text, original_text
                    )
                    entries.append(entry)
    except Exception as e:
        print(f"Error loading YouTube transcript {filepath}: {e}")

    return entries


def load_comm_transcript(date: datetime) -> List[TranscriptEntry]:
    """Load and parse communication transcript for a specific date."""
    # Build path: COMM_FOLDER/YYYY/MM/DD/_transcript_YYYY-MM-DD.csv
    year = date.strftime("%Y")
    month = date.strftime("%m")
    day = date.strftime("%d")
    date_str = date.strftime("%Y-%m-%d")

    comm_filepath = os.path.join(
        COMM_FOLDER, year, month, day, f"_transcript_{date_str}.csv"
    )

    entries = []
    if not os.path.exists(comm_filepath):
        print(f"Comm transcript file does not exist: {comm_filepath}")
        return entries

    try:
        with open(comm_filepath, "r", encoding="utf-8") as file:
            # Comm transcripts are also pipe-delimited
            reader = csv.reader(file, delimiter="|")
            for row in reader:
                if len(row) >= 6:  # Ensure we have all required fields
                    time_str = row[0]
                    filename = row[1]
                    start = float(row[2])
                    end = float(row[3])
                    language = row[4]
                    text = row[5]
                    original_text = row[6] if len(row) > 6 else ""

                    entry = TranscriptEntry(
                        time_str, filename, start, end, language, text, original_text
                    )
                    entries.append(entry)

        print(f"Loaded {len(entries)} comm entries from {comm_filepath}")
    except Exception as e:
        print(f"Error loading comm transcript {comm_filepath}: {e}")

    return entries


def calculate_text_similarity(text1: str, text2: str) -> float:
    """Calculate similarity between two text strings using difflib."""
    # Normalize text for comparison
    text1_norm = re.sub(r"[^\w\s]", "", text1.lower().strip())
    text2_norm = re.sub(r"[^\w\s]", "", text2.lower().strip())

    # Use difflib's SequenceMatcher for similarity
    similarity = difflib.SequenceMatcher(None, text1_norm, text2_norm).ratio()
    return similarity


def find_matching_sequences(
    youtube_entries: List[TranscriptEntry],
    comm_entries: List[TranscriptEntry],
    date: datetime,
) -> List[Tuple[List[TranscriptEntry], List[TranscriptEntry]]]:
    """
    Find sequences of consecutive matching utterances between YouTube and comm transcripts.
    Returns list of (youtube_sequence, comm_sequence) tuples.
    """
    matching_sequences = []

    print(f"\n=== FUZZY MATCHING ANALYSIS ===")
    print(f"YouTube entries: {len(youtube_entries)}")
    print(f"Comm entries: {len(comm_entries)}")
    print(f"Similarity threshold: {MIN_SIMILARITY_THRESHOLD}")
    print(f"Min consecutive matches: {MIN_CONSECUTIVE_MATCHES}")

    # Try to find matching sequences
    for yt_start_idx in range(len(youtube_entries) - MIN_CONSECUTIVE_MATCHES + 1):
        for comm_start_idx in range(len(comm_entries) - MIN_CONSECUTIVE_MATCHES + 1):

            # Test if we can find a sequence of matches starting from these positions
            yt_matches = []
            comm_matches = []

            yt_idx = yt_start_idx
            comm_idx = comm_start_idx

            while (
                yt_idx < len(youtube_entries)
                and comm_idx < len(comm_entries)
                and len(yt_matches) < 10
            ):  # Limit search to prevent excessive processing

                yt_entry = youtube_entries[yt_idx]
                comm_entry = comm_entries[comm_idx]

                # Calculate similarity
                similarity = calculate_text_similarity(yt_entry.text, comm_entry.text)

                if similarity >= MIN_SIMILARITY_THRESHOLD:
                    yt_matches.append(yt_entry)
                    comm_matches.append(comm_entry)
                    print(f"  MATCH {len(yt_matches)}: {similarity:.3f}")
                    print(f"    YT  [{yt_entry.time_str}]: {yt_entry.text[:80]}...")
                    print(f"    COMM[{comm_entry.time_str}]: {comm_entry.text[:80]}...")
                    yt_idx += 1
                    comm_idx += 1
                else:
                    # No match, break this sequence
                    break

            # Check if we found enough consecutive matches
            if len(yt_matches) >= MIN_CONSECUTIVE_MATCHES:
                print(f"  *** FOUND SEQUENCE OF {len(yt_matches)} MATCHES ***")
                matching_sequences.append((yt_matches, comm_matches))

                # For now, return the first good sequence we find
                # In a more sophisticated version, we might want to find all sequences and pick the best
                return matching_sequences

    print(f"Found {len(matching_sequences)} matching sequences")
    return matching_sequences


def calculate_video_start_offset(
    youtube_sequence: List[TranscriptEntry],
    comm_sequence: List[TranscriptEntry],
    video_date: datetime,
) -> Optional[Tuple[datetime, timedelta, Dict]]:
    """
    Calculate the video start time offset based on matching sequences.
    Returns: (video_start_datetime, offset_from_first_match, match_info)
    """
    if not youtube_sequence or not comm_sequence:
        return None

    # Get the first matching pair
    first_yt = youtube_sequence[0]
    first_comm = comm_sequence[0]

    print(f"\n=== CALCULATING VIDEO START OFFSET ===")
    print(f"First YT match: [{first_yt.time_str}] at video second {first_yt.start:.2f}")
    print(f"First COMM match: [{first_comm.time_str}] {first_comm.text[:60]}...")

    # Parse the comm timestamp to get the actual time of day
    comm_time_parts = first_comm.time_str.split(":")
    comm_hour = int(comm_time_parts[0])
    comm_minute = int(comm_time_parts[1])
    comm_second = int(comm_time_parts[2])

    # Create the actual datetime for the comm utterance
    comm_datetime = video_date.replace(
        hour=comm_hour, minute=comm_minute, second=comm_second
    )

    # The video timestamp tells us how many seconds into the video this utterance occurs
    video_seconds_offset = first_yt.start

    # Calculate when the video actually started
    video_start_datetime = comm_datetime - timedelta(seconds=video_seconds_offset)

    print(f"Comm utterance time: {comm_datetime}")
    print(f"Video offset: {video_seconds_offset:.2f} seconds")
    print(f"Calculated video start: {video_start_datetime}")

    # Calculate offset from the first match
    offset_from_first_match = timedelta(seconds=video_seconds_offset)

    # Calculate similarity for the first match
    similarity = calculate_text_similarity(first_yt.text, first_comm.text)

    # Create match info
    match_info = {
        "youtube_offset_seconds": video_seconds_offset,
        "similarity": similarity,
        "num_matches": len(youtube_sequence),
        "first_match_youtube_text": first_yt.text,
        "first_match_comm_text": first_comm.text,
    }

    return video_start_datetime, offset_from_first_match, match_info


def process_youtube_transcript(
    filepath: str, recordings: List[Dict], log_entries: List[Dict]
) -> Tuple[bool, Optional[Dict]]:
    """
    Process a single YouTube transcript file and update recording entry with derivedStartTime.
    Returns: (success, log_entry)
    """
    filename = os.path.basename(filepath)
    print(f"\n{'='*80}")
    print(f"PROCESSING: {filename}")
    print(f"{'='*80}")

    # Parse filename to get date and metadata
    date, video_id, title = parse_youtube_filename(filename)
    if not date or not video_id:
        print(f"Skipping {filename} - could not parse filename")
        log_entry = create_log_entry_from_script_result(
            datetime.now().replace(
                hour=0, minute=0, second=0, microsecond=0
            ),  # Use current date as fallback
            "unknown",
            filename,
            datetime.now(),
            {},
            success=False,
            failure_reason="Could not parse filename to extract date and video ID",
        )
        return False, log_entry

    print(f"Date: {date.strftime('%Y-%m-%d')}")
    print(f"Video ID: {video_id}")
    print(f"Title: {title}")

    # Check if we already have a log entry for this video ID (processed before)
    existing_log = next(
        (entry for entry in log_entries if entry.get("videoId") == video_id), None
    )
    if existing_log:
        print(f"*** SKIPPING - Already processed video ID: {video_id} ***")
        print(f"Previous status: {existing_log.get('processingStatus', 'unknown')}")
        log_entry = create_log_entry_from_script_result(
            date,
            video_id,
            title,
            datetime.now(),
            {},
            success=False,
            failure_reason=f"Video already processed previously (status: {existing_log.get('processingStatus', 'unknown')})",
        )
        return False, log_entry

    # Find the recording entry for this video
    recording_entry = find_recording_by_video_id(recordings, video_id)
    if not recording_entry:
        error_msg = f"No recording entry found for video ID: {video_id}"
        print(error_msg)
        log_entry = create_log_entry_from_script_result(
            date,
            video_id,
            title,
            datetime.now(),
            {},
            success=False,
            failure_reason="No recording entry found",
        )
        return False, log_entry

    # Check if this recording already has a derivedStartTime
    if recording_entry.get("derivedStartTime"):
        print(
            f"*** SKIPPING - Recording already has derivedStartTime: {recording_entry['derivedStartTime']} ***"
        )
        log_entry = create_log_entry_from_script_result(
            date,
            video_id,
            title,
            datetime.now(),
            {},
            success=False,
            failure_reason=f"Recording already has derivedStartTime: {recording_entry['derivedStartTime']}",
        )
        return False, log_entry

    # Load YouTube transcript
    print(f"\nLoading YouTube transcript...")
    youtube_entries = load_youtube_transcript(filepath)
    if not youtube_entries:
        error_msg = f"No YouTube entries found in {filename}"
        print(error_msg)
        log_entry = create_log_entry_from_script_result(
            date,
            video_id,
            title,
            datetime.now(),
            {},
            success=False,
            failure_reason="No YouTube transcript entries found",
        )
        return False, log_entry

    print(f"Loaded {len(youtube_entries)} YouTube transcript entries")

    # Load corresponding comm transcript
    print(f"\nLoading comm transcript for {date.strftime('%Y-%m-%d')}...")
    comm_entries = load_comm_transcript(date)
    if not comm_entries:
        error_msg = f"No comm entries found for {date.strftime('%Y-%m-%d')}"
        print(error_msg)
        log_entry = create_log_entry_from_script_result(
            date,
            video_id,
            title,
            datetime.now(),
            {},
            success=False,
            failure_reason="No communication transcript found for this date",
        )
        return False, log_entry

    # Find matching sequences
    matching_sequences = find_matching_sequences(youtube_entries, comm_entries, date)

    if matching_sequences:
        # Use the first (and likely best) matching sequence
        yt_matches, comm_matches = matching_sequences[0]

        # Calculate video start offset
        result = calculate_video_start_offset(yt_matches, comm_matches, date)

        if result:
            video_start_datetime, offset, match_info = result
            print(f"\n{'='*60}")
            print(f"SUCCESS! Video start calculated:")
            print(f"Video file: {filename}")
            print(f"Video ID: {video_id}")
            print(f"Start datetime: {video_start_datetime}")
            print(f"Offset from first match: {offset}")
            print(f"Match confidence: {match_info['similarity']:.3f}")
            print(f"Number of matches: {match_info['num_matches']}")

            # Update the recording entry with derivedStartTime
            recording_entry["derivedStartTime"] = video_start_datetime.strftime(
                "%Y-%m-%dT%H:%M:%SZ"
            )

            # Create log entry
            log_entry = create_log_entry_from_script_result(
                date, video_id, title, video_start_datetime, match_info, success=True
            )

            print(f"{'='*60}")
            return True, log_entry

        else:
            error_msg = "Failed to calculate video start offset"
            print(f"\n{error_msg}")
            log_entry = create_log_entry_from_script_result(
                date,
                video_id,
                title,
                datetime.now(),
                {},
                success=False,
                failure_reason="Could not calculate video start offset from matches",
            )
            return False, log_entry
    else:
        error_msg = "No matching sequences found between YouTube and comm transcripts"
        print(f"\n{error_msg}")
        log_entry = create_log_entry_from_script_result(
            date,
            video_id,
            title,
            datetime.now(),
            {},
            success=False,
            failure_reason="No matching sequences found between YouTube and communication transcripts",
        )
        return False, log_entry


def main():
    """Main function to process all YouTube transcript files."""
    print("Starting YouTube transcript to comm transcript alignment...")
    print(f"YouTube transcripts folder: {YOUTUBE_TRANSCRIPTS_FOLDER}")
    print(f"Comm folder: {COMM_FOLDER}")
    print(f"YouTube recordings file: {YOUTUBE_RECORDINGS_FILE}")
    print(f"Processing log file: {PROCESSING_LOG_FILE}")

    # Check if folders exist
    if not os.path.exists(YOUTUBE_TRANSCRIPTS_FOLDER):
        print(
            f"Error: YouTube transcripts folder not found: {YOUTUBE_TRANSCRIPTS_FOLDER}"
        )
        return

    if not os.path.exists(COMM_FOLDER):
        print(f"Error: Comm folder not found: {COMM_FOLDER}")
        return

    # Load existing YouTube recordings and processing log
    print(f"\nLoading existing recordings...")
    recordings = load_youtube_recordings()
    print(f"Loaded {len(recordings)} existing recording entries")

    print(f"\nLoading processing log...")
    log_entries = load_processing_log()
    print(f"Loaded {len(log_entries)} existing log entries")

    # Find all YouTube transcript files
    transcript_files = []
    for file in os.listdir(YOUTUBE_TRANSCRIPTS_FOLDER):
        if file.endswith("_transcript.csv"):
            transcript_files.append(os.path.join(YOUTUBE_TRANSCRIPTS_FOLDER, file))

    print(f"Found {len(transcript_files)} YouTube transcript files")

    if not transcript_files:
        print("No YouTube transcript files found")
        return

    # Process each transcript file
    processed_count = 0
    successful_count = 0

    for filepath in transcript_files:
        filename = os.path.basename(filepath)

        # Skip files containing "launch" in the filename (case-insensitive)
        if "launch" in filename.lower():
            print(f"Skipping {filename} - contains 'launch' in filename")
            continue

        try:
            success, log_entry = process_youtube_transcript(
                filepath, recordings, log_entries
            )

            # Always save after processing, regardless of success/failure
            if log_entry:
                # Add the new log entry
                log_entries.append(log_entry)
                processed_count += 1

                if success:
                    successful_count += 1

            # Save both files after each processing attempt
            recordings_saved = save_youtube_recordings(recordings)
            log_saved = save_processing_log(log_entries)

            if recordings_saved and log_saved:
                if log_entry:
                    status_msg = "✅ SUCCESS" if success else "❌ FAILED"
                    print(f"{status_msg} - Saved updates for {log_entry['videoId']}")
                else:
                    print(f"ℹ️  Saved files after processing {filename}")
            else:
                print(f"❌ Failed to save files after processing {filename}")

        except Exception as e:
            print(f"Error processing {filepath}: {e}")
            import traceback

            traceback.print_exc()

    print(f"\n=== PROCESSING COMPLETE ===")
    print(f"Processed {processed_count} video files")
    print(f"Successful processing: {successful_count}")
    print(f"Failed processing: {processed_count - successful_count}")
    print(f"Total recordings in file: {len(recordings)}")
    print(f"Total log entries: {len(log_entries)}")


if __name__ == "__main__":
    main()
