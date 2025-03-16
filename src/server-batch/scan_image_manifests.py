from dotenv import load_dotenv
import requests
import json
import argparse
from datetime import datetime, timedelta  # Add timedelta import
from collections import defaultdict
import sys
import os  # Add import for os

# Load environment variables from .env file
load_dotenv(dotenv_path="../../.env")

# Constants
IMAGES_FOLDER = os.getenv("WEB_ASSETS_FOLDER") + "earth_photography/"

# Load .env file from two directories up
env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
load_dotenv(dotenv_path=env_path)


def scan_and_remove_empty_manifests():
    # walks through earth_photography folder structure
    for root, dirs, files in os.walk(IMAGES_FOLDER):
        relative_path = os.path.relpath(root, IMAGES_FOLDER)
        parts = relative_path.split(os.path.sep)
        if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
            print(f"Checking {parts[0]}/{parts[1]}...")
        for file in files:
            if file.startswith("images-manifest_") and file.endswith(".json"):
                file_path = os.path.join(root, file)
                with open(file_path, "r") as f:
                    content = f.read().strip()
                if content == "[]":
                    os.remove(file_path)
                    print(f"Removed empty manifest: {file_path}")
                else:
                    try:
                        data = json.loads(content)
                    except Exception as e:
                        print(f"Error processing {file_path}: {e}")
                        exit(1)
                    updated = False
                    for record in data:
                        if "ID" in record:
                            new_id = record["ID"].replace("-", "")
                            if new_id != record["ID"]:
                                record["ID"] = new_id
                                updated = True
                    if updated:
                        with open(file_path, "w") as f:
                            json.dump(data, f, indent=4)
                        print(f"Updated manifest IDs: {file_path}")


if __name__ == "__main__":
    scan_and_remove_empty_manifests()
