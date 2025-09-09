#!/usr/bin/env python3
"""
Test script to verify the video selection logic fix.
This script simulates the JavaScript logic to ensure it's working correctly.
"""


def app_seconds_from_time_str(time_str):
    """Convert time string like '12:34:56' to seconds since midnight"""
    parts = time_str.split(":")
    hours, minutes, seconds = int(parts[0]), int(parts[1]), int(parts[2])
    return hours * 3600 + minutes * 60 + seconds


def find_current_video_old_logic(video_recordings, app_seconds):
    """Old logic - finds last video where start <= appSeconds"""
    if not video_recordings:
        return None

    # Sort by start time
    sorted_videos = sorted(
        video_recordings, key=lambda v: app_seconds_from_time_str(v["time"])
    )

    # Find the last one where start <= appSeconds
    for i in range(len(sorted_videos) - 1, -1, -1):
        start = app_seconds_from_time_str(sorted_videos[i]["time"])
        if start <= app_seconds:
            return sorted_videos[i]

    return None


def find_current_video_new_logic(video_recordings, app_seconds):
    """New logic - finds video where start <= appSeconds <= start + duration"""
    if not video_recordings:
        return None

    # Sort by start time
    sorted_videos = sorted(
        video_recordings, key=lambda v: app_seconds_from_time_str(v["time"])
    )

    # Find a video where start <= appSeconds <= start + duration
    for video in sorted_videos:
        start = app_seconds_from_time_str(video["time"])
        end = start + video["duration"]

        if start <= app_seconds <= end:
            return video

    return None


def test_video_logic():
    # Sample video data - simulating what might be in videoIa.json
    video_recordings = [
        {
            "date": "2023-01-01",
            "time": "10:00:00",
            "filename": "video1.mp4",
            "duration": 1800,
        },  # 30 minutes
        {
            "date": "2023-01-01",
            "time": "11:00:00",
            "filename": "video2.mp4",
            "duration": 900,
        },  # 15 minutes
        {
            "date": "2023-01-01",
            "time": "13:00:00",
            "filename": "video3.mp4",
            "duration": 2700,
        },  # 45 minutes
    ]

    test_cases = [
        # Test case: (appSeconds as HH:MM:SS, expected video filename or None)
        ("10:15:00", "video1.mp4"),  # Within video1 range (10:00-10:30)
        ("10:35:00", None),  # Between video1 end (10:30) and video2 start (11:00)
        ("11:10:00", "video2.mp4"),  # Within video2 range (11:00-11:15)
        ("12:00:00", None),  # Between video2 end (11:15) and video3 start (13:00)
        ("13:20:00", "video3.mp4"),  # Within video3 range (13:00-13:45)
        ("14:00:00", None),  # After all videos
        ("09:00:00", None),  # Before all videos
    ]

    print("Testing video selection logic:")
    print("=" * 60)

    for time_str, expected in test_cases:
        app_seconds = app_seconds_from_time_str(time_str)

        old_result = find_current_video_old_logic(video_recordings, app_seconds)
        old_filename = old_result["filename"] if old_result else None

        new_result = find_current_video_new_logic(video_recordings, app_seconds)
        new_filename = new_result["filename"] if new_result else None

        print(f"Time: {time_str} (appSeconds: {app_seconds})")
        print(f"  Expected:  {expected}")
        print(f"  Old logic: {old_filename}")
        print(f"  New logic: {new_filename}")
        print(f"  Fixed:     {'✓' if new_filename == expected else '✗'}")
        print()


if __name__ == "__main__":
    test_video_logic()
