import json
import requests
import os
import glob
import re
from urllib.parse import urlparse
from dotenv import load_dotenv  # newly added import

load_dotenv(dotenv_path="../../.env")
RAW_FOLDER = os.getenv("RAW_FOLDER")


def generate_starting_urls(json_dir):
    urls = set()
    # regex to match patterns like "iss01-07.html" or "STS-98-19.html"
    pattern = re.compile(r"((?:iss\d{2}|STS-\d{2}))-\d{2}(\.html)", re.IGNORECASE)
    ignore_urls = {
        "https://www.nasa.gov/centers/johnson/news/shuttle/sts-97/STS-97-01.html",
        "https://www.nasa.gov/centers/johnson/news/shuttle/sts-98/STS-98-01.html",
    }
    for file in glob.glob(os.path.join(json_dir, "*.json")):
        with open(file, "r") as f:
            data = json.load(f)
        for section in ["crew_and_cargo", "spacewalks"]:
            for entry in data.get(section, []):
                url = entry.get("url")
                if url and pattern.search(url):
                    new_url = pattern.sub(r"\1-01\2", url, count=1)
                    if new_url not in ignore_urls:
                        urls.add(new_url)
    return sorted(urls)


if __name__ == "__main__":
    # Directory where JSON files (from 6f) are stored
    early_status_urls_dir = os.path.join(RAW_FOLDER, "early_status_urls")
    starting_urls = generate_starting_urls(early_status_urls_dir)

    # Write one starting status URL per line
    output_file = os.path.join(early_status_urls_dir, "starting_status_urls.txt")
    with open(output_file, "w") as out:
        for url in starting_urls:
            out.write(url + "\n")

    print(f"Starting URLs written to: {output_file}")
