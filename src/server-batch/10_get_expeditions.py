import requests
from bs4 import BeautifulSoup
import json
import re, os
import datetime  # Added import

S3_FOLDER = os.getenv("S3_FOLDER")


def parse_date(date_str):
    # replace bad string on the nasa website
    date_str = date_str.replace("Sept.", "Sep.").replace(
        "Nov, 21, 2011", "Nov. 21, 2011"
    )
    try:
        return datetime.datetime.strptime(date_str, "%b. %d, %Y").date().isoformat()
    except ValueError:
        try:
            return datetime.datetime.strptime(date_str, "%B %d, %Y").date().isoformat()
        except ValueError:
            return date_str  # Return original string if parsing fails


def scrape_expedition(num):
    url = f"https://www.nasa.gov/mission/expedition-{str(num)}/"
    response = requests.get(url)
    response.raise_for_status()  # Check for request errors

    soup = BeautifulSoup(response.content, "html.parser")

    # Extract mission duration
    mission_info = {}
    mission_info["expedition"] = num  # Added expedition number
    search_div = soup.find("main", id="primary")
    if search_div:
        start_label = search_div.find("p", string=re.compile(r"^(start|START|Launch)$"))
        if start_label:
            raw_start = (
                start_label.find_parent("div").find_next_sibling("div").text.strip()
            )
            mission_info["start"] = parse_date(raw_start)
        end_label = search_div.find("p", string=re.compile(r"^(end|END|Landing)$"))
        if end_label:
            raw_end = end_label.find_parent("div").find_next_sibling("div").text.strip()
            mission_info["end"] = parse_date(raw_end)

    # Extract mission highlights
    highlights_section = soup.find("div", class_="tag-mission")
    if highlights_section:
        highlights_text = highlights_section.find_next("p").text.strip()

    mission_info["expeditionBlurb"] = highlights_text

    return mission_info


if __name__ == "__main__":
    expeditions = []
    for i in range(1, 72):
        data = scrape_expedition(i)
        expeditions.append(data)

    # Save the data to a JSON file
    with open(f"{S3_FOLDER}/expeditions.json", "w") as f:
        json.dump(expeditions, f, indent=4)
