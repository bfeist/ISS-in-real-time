import requests
from bs4 import BeautifulSoup
import json
import re, os
import datetime  # Added import
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv(dotenv_path="../../.env")

RAW_FOLDER = os.getenv("RAW_FOLDER")


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


def scrape_expedition_page(num):
    url = f"https://www.nasa.gov/mission/expedition-{num}/"
    response = requests.get(url)
    response.raise_for_status()  # Check for request errors
    soup = BeautifulSoup(response.content, "html.parser")

    data = {"expedition": num, "crew_and_cargo": [], "spacewalks": []}

    # Extract Crew and Cargo Missions section
    crew_heading = soup.find(
        "h2",
        class_="wp-block-heading",
        string=re.compile(r"Crew and Cargo Missions", re.IGNORECASE),
    )
    if crew_heading:
        crew_p = crew_heading.find_next_sibling("p")
        if crew_p:
            for a in crew_p.find_all("a"):
                data["crew_and_cargo"].append(
                    {"text": a.get_text(strip=True), "url": a.get("href")}
                )

    # Extract Spacewalks section
    spacewalks_heading = soup.find(
        "h2", class_="wp-block-heading", string=re.compile(r"Spacewalks", re.IGNORECASE)
    )
    if spacewalks_heading:
        spacewalks_p = spacewalks_heading.find_next_sibling("p")
        if spacewalks_p:
            for a in spacewalks_p.find_all("a"):
                text = a.get_text(strip=True)
                parsed = parse_date(text)
                # For example, valid date "July 10, 2008" is parsed to "2008-07-10"
                if re.match(r"^\d{4}-\d{2}-\d{2}$", parsed):
                    data["spacewalks"].append({"text": text, "url": a.get("href")})

    return data


if __name__ == "__main__":
    all_data = []
    exp_dir = os.path.join(
        RAW_FOLDER, "early_status_urls"
    )  # New: define directory for early status URLs
    os.makedirs(exp_dir, exist_ok=True)  # New: ensure the directory exists
    for i in range(1, 43):
        try:
            page_data = scrape_expedition_page(i)
            all_data.append(page_data)
            # New: write individual expedition JSON file
            with open(os.path.join(exp_dir, f"exp_{i}.json"), "w") as f:
                json.dump(page_data, f, indent=4)
        except Exception as e:
            print(f"Error scraping expedition {i}: {e}")
