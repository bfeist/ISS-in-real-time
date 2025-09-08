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
if WEB_ASSETS_FOLDER is None:
    print("Error: WEB_ASSETS_FOLDER environment variable is not set.")
    exit(1)

YOUTUBE_TRANSCRIPTS_FOLDER = "F:/tempF/iss_working/youtube_transcripts"
COMM_FOLDER = WEB_ASSETS_FOLDER + "comm/"
MANUAL_START_TIMES_FILE = WEB_ASSETS_FOLDER + "youtube_manual_start_times.json"

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


def load_manual_start_times() -> List[Dict]:
    """Load existing manual start times from JSON file."""
    if os.path.exists(MANUAL_START_TIMES_FILE):
        try:
            with open(MANUAL_START_TIMES_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading manual start times: {e}")
            return []
    return []


def save_manual_start_times(manual_times: List[Dict]) -> bool:
    """Save manual start times to JSON file."""
    try:
        # Create backup first
        backup_file = MANUAL_START_TIMES_FILE + ".backup"
        if os.path.exists(MANUAL_START_TIMES_FILE):
            with open(MANUAL_START_TIMES_FILE, "r", encoding="utf-8") as src:
                with open(backup_file, "w", encoding="utf-8") as dst:
                    dst.write(src.read())
            print(f"Created backup: {backup_file}")

        # Write new data
        with open(MANUAL_START_TIMES_FILE, "w", encoding="utf-8") as f:
            json.dump(manual_times, f, indent=2, ensure_ascii=False)
        print(f"Manual start times saved to: {MANUAL_START_TIMES_FILE}")
        return True
    except Exception as e:
        print(f"Error saving manual start times: {e}")
        return False


def find_manual_entry_by_video_id(
    manual_times: List[Dict], video_id: str
) -> Optional[Dict]:
    """Find manual entry by video ID."""
    for entry in manual_times:
        if entry.get("videoId") == video_id:
            return entry
    return None


def calculate_start_time_from_manual_entry(manual_entry: Dict) -> datetime:
    """Calculate video start time from manual entry (supports both old and new format)."""

    # If we already have a calculated start time, use it
    if "calculatedVideoStartTime" in manual_entry:
        return datetime.fromisoformat(
            manual_entry["calculatedVideoStartTime"].replace("Z", "+00:00")
        )

    # Otherwise calculate from timing sync point
    # Handle both old format (youtubeTime) and new format (videoTimePoint)
    video_time = manual_entry.get("videoTimePoint") or manual_entry.get("youtubeTime")
    real_time = manual_entry.get("realTimeAtVideoPoint") or manual_entry.get(
        "youtubeTimeIsoTimestamp"
    )

    if not video_time or not real_time:
        raise ValueError(f"Missing required fields in manual entry: {manual_entry}")

    # Convert video time to seconds
    time_parts = video_time.split(":")
    video_seconds = (
        int(time_parts[0]) * 3600 + int(time_parts[1]) * 60 + int(time_parts[2])
    )

    # Parse the ISO timestamp
    iso_time = datetime.fromisoformat(real_time.replace("Z", "+00:00"))

    # Calculate video start time
    video_start = iso_time - timedelta(seconds=video_seconds)

    return video_start


def create_manual_entry_from_script_result(
    date: datetime,
    video_id: str,
    title: str,
    video_start_datetime: datetime,
    first_match_info: Dict,
) -> Dict:
    """Create a manual entry from script calculation result using improved structure."""

    youtube_seconds = first_match_info["youtube_offset_seconds"]
    hours = int(youtube_seconds // 3600)
    minutes = int((youtube_seconds % 3600) // 60)
    seconds = int(youtube_seconds % 60)
    video_time_point = f"{hours:02d}:{minutes:02d}:{seconds:02d}"

    # The timestamp is when this video time point actually occurred in real time
    real_time_at_video_point = (
        video_start_datetime + timedelta(seconds=youtube_seconds)
    ).strftime("%Y-%m-%dT%H:%M:%SZ")

    return {
        # Core identification
        "date": date.strftime("%Y-%m-%d"),
        "videoId": video_id,
        "title": title,
        # Timing synchronization point (improved field names)
        "videoTimePoint": video_time_point,
        "realTimeAtVideoPoint": real_time_at_video_point,
        # Calculated results
        "calculatedVideoStartTime": video_start_datetime.strftime("%Y-%m-%dT%H:%M:%SZ"),
        # Metadata
        "source": "automated_fuzzy_matching",
        "confidence": first_match_info.get("similarity", 0.0),
        "processingDate": datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "processingNotes": f"Automated fuzzy matching found {first_match_info.get('num_matches', 0)} consecutive matches",
    }


def create_failure_entry(
    date: datetime, video_id: str, title: str, failure_reason: str
) -> Dict:
    """Create a failure entry for videos that couldn't be processed."""
    return {
        # Core identification
        "date": date.strftime("%Y-%m-%d"),
        "videoId": video_id,
        "title": title,
        # No timing information available for failed processing
        # Metadata
        "source": "automated_fuzzy_matching",
        "confidence": 0.0,
        "processingDate": datetime.now().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "processingNotes": f"Processing failed: {failure_reason}",
        "processingStatus": "failed",
    }


def parse_youtube_filename(
    filename: str,
) -> Tuple[Optional[datetime], Optional[str], Optional[str]]:
    """
    Parse YouTube transcript filename to extract metadata.
    Format: YYYY-MM-DDTHH-MM-SS_videoId_height_title_transcript.csv
    Returns: (date, video_id, title)
    """
    try:
        basename = os.path.splitext(filename)[0]  # Remove .csv
        if basename.endswith("_transcript"):
            basename = basename[:-11]  # Remove _transcript

        parts = basename.split("_")
        if len(parts) < 4:
            print(f"Warning: Unexpected filename format: {filename}")
            return None, None, None

        # Extract components
        date_time_str = parts[0]  # YYYY-MM-DDTHH-MM-SS
        video_id = parts[1]
        height = parts[2]
        title = "_".join(parts[3:])  # Rejoin title parts

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
    filepath: str, existing_entries: List[Dict]
) -> Optional[Dict]:
    """Process a single YouTube transcript file and return new entry (success or failure)."""
    filename = os.path.basename(filepath)
    print(f"\n{'='*80}")
    print(f"PROCESSING: {filename}")
    print(f"{'='*80}")

    # Parse filename to get date and metadata
    date, video_id, title = parse_youtube_filename(filename)
    if not date or not video_id:
        print(f"Skipping {filename} - could not parse filename")
        return None

    print(f"Date: {date.strftime('%Y-%m-%d')}")
    print(f"Video ID: {video_id}")
    print(f"Title: {title}")

    # Check if we already have an entry for this video ID
    existing_entry = find_manual_entry_by_video_id(existing_entries, video_id)
    if existing_entry:
        print(f"*** SKIPPING - Entry already exists for video ID: {video_id} ***")
        print(f"Existing source: {existing_entry.get('source', 'unknown')}")
        print(f"Existing status: {existing_entry.get('processingStatus', 'success')}")
        return None

    # Load YouTube transcript
    print(f"\nLoading YouTube transcript...")
    youtube_entries = load_youtube_transcript(filepath)
    if not youtube_entries:
        error_msg = f"No YouTube entries found in {filename}"
        print(error_msg)
        return create_failure_entry(
            date, video_id, title, "No YouTube transcript entries found"
        )

    print(f"Loaded {len(youtube_entries)} YouTube transcript entries")

    # Load corresponding comm transcript
    print(f"\nLoading comm transcript for {date.strftime('%Y-%m-%d')}...")
    comm_entries = load_comm_transcript(date)
    if not comm_entries:
        error_msg = f"No comm entries found for {date.strftime('%Y-%m-%d')}"
        print(error_msg)
        return create_failure_entry(
            date, video_id, title, "No communication transcript found for this date"
        )

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

            # Create new entry from script result
            new_entry = create_manual_entry_from_script_result(
                date, video_id, title, video_start_datetime, match_info
            )

            print(f"{'='*60}")
            return new_entry

        else:
            error_msg = "Failed to calculate video start offset"
            print(f"\n{error_msg}")
            return create_failure_entry(
                date,
                video_id,
                title,
                "Could not calculate video start offset from matches",
            )
    else:
        error_msg = "No matching sequences found between YouTube and comm transcripts"
        print(f"\n{error_msg}")
        return create_failure_entry(
            date,
            video_id,
            title,
            "No matching sequences found between YouTube and communication transcripts",
        )

    return None


def main():
    """Main function to process all YouTube transcript files."""
    print("Starting YouTube transcript to comm transcript alignment...")
    print(f"YouTube transcripts folder: {YOUTUBE_TRANSCRIPTS_FOLDER}")
    print(f"Comm folder: {COMM_FOLDER}")
    print(f"Manual start times file: {MANUAL_START_TIMES_FILE}")

    # Check if folders exist
    if not os.path.exists(YOUTUBE_TRANSCRIPTS_FOLDER):
        print(
            f"Error: YouTube transcripts folder not found: {YOUTUBE_TRANSCRIPTS_FOLDER}"
        )
        return

    if not os.path.exists(COMM_FOLDER):
        print(f"Error: Comm folder not found: {COMM_FOLDER}")
        return

    # Load existing manual start times
    print(f"\nLoading existing entries...")
    existing_entries = load_manual_start_times()
    print(f"Loaded {len(existing_entries)} existing entries")

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
    for filepath in transcript_files:
        filename = os.path.basename(filepath)

        # Skip files containing "launch" in the filename (case-insensitive)
        if "launch" in filename.lower():
            print(f"Skipping {filename} - contains 'launch' in filename")
            continue

        try:
            new_entry = process_youtube_transcript(filepath, existing_entries)
            if new_entry:
                # Add the new entry to our existing entries list
                existing_entries.append(new_entry)

                # Save immediately after processing each successful entry
                if save_manual_start_times(existing_entries):
                    print(
                        f"✅ Successfully saved entry for {new_entry['videoId']} to JSON file"
                    )
                else:
                    print(f"❌ Failed to save entry for {new_entry['videoId']}")

                processed_count += 1

        except Exception as e:
            print(f"Error processing {filepath}: {e}")
            import traceback

            traceback.print_exc()

    print(f"\n=== PROCESSING COMPLETE ===")
    print(f"Processed {processed_count} new video files")
    print(f"Total entries in JSON file: {len(existing_entries)}")


if __name__ == "__main__":
    main()
