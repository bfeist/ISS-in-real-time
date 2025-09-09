#!/usr/bin/env python3
"""
Test script to validate the modified transcript processing script
"""

import sys
import os
from pathlib import Path

# Add the server-batch directory to the Python path
sys.path.append(str(Path(__file__).parent / "src" / "server-batch" / "5_video"))

from datetime import datetime
import json

# Import the functions from the modified script
from src.server_batch.video.web_gen_start_offset_from_transcripts import (
    load_youtube_recordings,
    save_youtube_recordings,
    load_processing_log,
    save_processing_log,
    find_recording_by_video_id,
    create_log_entry_from_script_result,
)


def test_data_structures():
    """Test the new data structure handling."""
    print("Testing data structure handling...")

    # Create sample YouTube recordings data
    sample_recordings = [
        {
            "publishedAt": "2019-07-24T22:59:11Z",
            "videoId": "CfRULatzLZQ",
            "duration": 1560,
            "title": "SpaceX launch to the International Space Station",
            "ytStartTime": "2019-07-24T22:00:19Z",
        },
        {
            "publishedAt": "2019-07-25T15:30:00Z",
            "videoId": "TestVideoId123",
            "duration": 2400,
            "title": "ISS Communication Test",
            "ytStartTime": "2019-07-25T15:00:00Z",
        },
    ]

    # Test finding recording by video ID
    found_recording = find_recording_by_video_id(sample_recordings, "CfRULatzLZQ")
    assert found_recording is not None
    assert (
        found_recording["title"] == "SpaceX launch to the International Space Station"
    )

    # Test creating log entry
    test_date = datetime(2019, 7, 24)
    match_info = {
        "youtube_offset_seconds": 120,
        "similarity": 0.85,
        "num_matches": 5,
        "first_match_youtube_text": "Houston, we have communication",
        "first_match_comm_text": "Houston, we have communication",
    }

    log_entry = create_log_entry_from_script_result(
        test_date,
        "CfRULatzLZQ",
        "Test Video",
        datetime(2019, 7, 24, 22, 0, 19),
        match_info,
    )

    assert log_entry["videoId"] == "CfRULatzLZQ"
    assert log_entry["processingStatus"] == "success"
    assert log_entry["confidence"] == 0.85

    print("✅ Data structure tests passed!")


def test_file_operations():
    """Test file save/load operations (using temporary files)."""
    print("Testing file operations...")

    # Test with temporary files to avoid affecting real data
    import tempfile

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", delete=False
    ) as temp_recordings:
        temp_recordings_path = temp_recordings.name

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", delete=False
    ) as temp_log:
        temp_log_path = temp_log.name

    try:
        # Temporarily modify the global file paths for testing
        import web_gen_start_offset_from_transcripts as script

        original_recordings = script.YOUTUBE_RECORDINGS_FILE
        original_log = script.PROCESSING_LOG_FILE

        script.YOUTUBE_RECORDINGS_FILE = temp_recordings_path
        script.PROCESSING_LOG_FILE = temp_log_path

        # Test saving and loading recordings
        sample_data = [{"videoId": "test123", "title": "Test Video"}]
        save_success = save_youtube_recordings(sample_data)
        assert save_success

        loaded_data = load_youtube_recordings()
        assert len(loaded_data) == 1
        assert loaded_data[0]["videoId"] == "test123"

        # Test saving and loading log
        sample_log = [{"videoId": "test123", "processingStatus": "success"}]
        log_success = save_processing_log(sample_log)
        assert log_success

        loaded_log = load_processing_log()
        assert len(loaded_log) == 1
        assert loaded_log[0]["processingStatus"] == "success"

        # Restore original paths
        script.YOUTUBE_RECORDINGS_FILE = original_recordings
        script.PROCESSING_LOG_FILE = original_log

        print("✅ File operations tests passed!")

    finally:
        # Clean up temporary files
        os.unlink(temp_recordings_path)
        os.unlink(temp_log_path)


if __name__ == "__main__":
    print("Running tests for modified transcript processing script...\n")

    try:
        test_data_structures()
        print()
        test_file_operations()
        print()
        print("🎉 All tests passed! The script modifications are working correctly.")

    except ImportError as e:
        print(f"❌ Import error: {e}")
        print("Make sure the script path is correct and dependencies are installed.")

    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback

        traceback.print_exc()
