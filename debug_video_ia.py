#!/usr/bin/env python3

import json
import requests
from datetime import datetime


def debug_video_ia():
    """Debug script to check videoIa data and understand the loading issue"""

    # First, let's try to fetch the videoIa.json file
    try:
        # Assuming the dev server is running on localhost:8001
        base_url = "http://localhost:8001/static"
        response = requests.get(f"{base_url}/videoIa.json")

        if response.status_code != 200:
            print(f"Failed to fetch videoIa.json: {response.status_code}")
            return

        video_ia_data = response.json()
        print(f"Total videoIa entries: {len(video_ia_data)}")

        # Show first few entries to understand structure
        print("\nFirst 5 videoIa entries:")
        for i, entry in enumerate(video_ia_data[:5]):
            print(f"{i+1}. {entry}")

        # Group by date to see availability
        dates = {}
        for entry in video_ia_data:
            date = entry.get("date", "unknown")
            if date not in dates:
                dates[date] = []
            dates[date].append(entry)

        print(f"\nVideo available for {len(dates)} dates")

        # Show some example dates with their video entries
        print("\nExample dates with videos:")
        for date, entries in list(dates.items())[:3]:
            print(f"\nDate: {date} ({len(entries)} videos)")
            for entry in entries:
                time_str = entry.get("time", "unknown")
                filename = entry.get("filename", "unknown")
                duration = entry.get("duration", 0)
                print(f"  - Time: {time_str}, Duration: {duration}s, File: {filename}")

                # Convert time to appSeconds for debugging
                if time_str != "unknown":
                    try:
                        parts = time_str.split(":")
                        app_seconds = (
                            int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
                        )
                        print(f"    AppSeconds: {app_seconds}")
                    except:
                        print(f"    Failed to convert time: {time_str}")

        # Let's try to access a video file
        print("\n" + "=" * 50)
        print("Testing video file access...")

        if video_ia_data:
            test_entry = video_ia_data[0]
            filename = test_entry.get("filename")
            if filename:
                video_url = f"{base_url}/videoIa/{filename}"
                print(f"Testing access to: {video_url}")

                head_response = requests.head(video_url)
                print(f"Video file status: {head_response.status_code}")
                if head_response.status_code == 200:
                    print(f"Content-Type: {head_response.headers.get('content-type')}")
                    print(
                        f"Content-Length: {head_response.headers.get('content-length')} bytes"
                    )
                else:
                    print(f"Video file not accessible: {head_response.status_code}")

    except Exception as e:
        print(f"Error debugging videoIa: {e}")
        import traceback

        traceback.print_exc()


if __name__ == "__main__":
    debug_video_ia()
