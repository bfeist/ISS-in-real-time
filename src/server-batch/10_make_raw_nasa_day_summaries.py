import datetime
import requests
from bs4 import BeautifulSoup
import json
import os

SG_RAW_FOLDER = os.getenv("SG_RAW_FOLDER")
AVAILABLE_DATES_S3 = os.getenv("S3_FOLDER") + "/available_dates.json"


def get_iss_activities(url):
    categories = {"General": []}
    current_category = "General"

    try:
        response = requests.get(url)
        response.raise_for_status()
    except requests.RequestException:
        return categories

    soup = BeautifulSoup(response.text, "html.parser")

    # The main content is usually within a div with class="entry-content"
    main_div = soup.find("div", class_="entry-content")
    if not main_div:
        return {}  # If we can't find the main content, return empty

    # Possible category headers with JSON names and matching text
    category_headings = {
        "Payloads": "Payloads",
        "Systems": "Systems",
        "Tasklist": "Completed Task List Activities",
        "Tasklist": "Completed Planned Activities",
        "Tasklist": "Today’s Planned Activities",
        "Tasklist": "Today’s Planned ActivitiesAll activities were completed unless otherwise noted.",
        "Ground": "Today’s Ground Activities",
        "Ground": "Today’s Ground Activities:All activities are complete unless otherwise noted.",
    }

    # Iterate over all child elements in the main content
    for elem in main_div.children:
        if elem.name == "p":
            # If we see "Look Ahead Plan", we stop collecting activities
            if "Look Ahead" in elem.get_text():
                break

            text = elem.get_text(strip=True)
            raw_category_text = text[:-1].strip() if text.endswith(":") else text

            # Check if this paragraph text is exactly one of our known category headings
            # (strip punctuation or tweak matching logic if needed)
            if raw_category_text in category_headings.values():
                current_category = next(
                    key
                    for key, value in category_headings.items()
                    if value == raw_category_text
                )
                categories[current_category] = []
            else:
                # If we are inside a known category, extract the activity name and description
                if current_category:
                    if current_category == "Tasklist" or current_category == "Ground":
                        ul = elem.find_next_sibling("ul")
                        if ul:
                            for li in ul.find_all("li"):
                                text = li.get_text(strip=True)
                                activity_name = text.split(":", 1)[0].strip()
                                categories[current_category].append(
                                    {"name": activity_name}
                                )
                    else:
                        strong_tag = elem.find("strong") or elem.find("b")
                        if strong_tag:
                            activity_raw = strong_tag.get_text(strip=True)
                            # New handling to remove trailing colon
                            activity_name = (
                                activity_raw[:-1].strip()
                                if activity_raw.endswith(":")
                                else activity_raw
                            )
                            idx = text.find(activity_raw)
                            if idx != -1:
                                end_idx = idx + len(activity_raw)
                                # Remove any leading colon or space
                                description = text[end_idx:].lstrip(":").strip()
                            else:
                                description = ""

                            categories[current_category].append(
                                {"name": activity_name, "description": description}
                            )
        elif elem.name == "ul" and current_category in ["Tasklist", "Ground"]:
            for li in elem.find_all("li"):
                text = li.get_text(strip=True)
                activity_name = text.split(":", 1)[0].strip()
                categories[current_category].append({"name": activity_name})

    return categories


def main():
    # Configuration
    # blog_url = "https://blogs.nasa.gov/stationreport/2023/12/04/"
    # blog_url = "https://blogs.nasa.gov/stationreport/2023/12/06/"

    # get dates available json in S3 root. Array of strings in format 2022-09-27
    available_dates = []
    if os.path.exists(AVAILABLE_DATES_S3):
        with open(AVAILABLE_DATES_S3, "r") as f:
            available_dates = json.load(f)

    for item in available_dates:
        available_date = item["date"]
        year, month, day = available_date.split("-")

        summary_path = os.path.join(
            SG_RAW_FOLDER,
            "activity_summaries",
            year,
            month,
            f"activity_summary_{year}-{month}-{day}.json",
        )

        if os.path.exists(summary_path):
            print(f"Summary already exists for {available_date}. Skipping...")
            continue

        available_date_urlformat = available_date.replace("-", "/")
        blog_url = f"https://blogs.nasa.gov/stationreport/{available_date_urlformat}/"

        categorized_activities = get_iss_activities(blog_url)

        # if the only activity is "General" with no activities, skip
        if (
            len(categorized_activities) == 1
            and len(categorized_activities["General"]) == 0
        ):
            print(f"No activities found for {available_date}. Skipping...")
            continue

        os.makedirs(os.path.dirname(summary_path), exist_ok=True)
        with open(summary_path, "w") as f:
            json.dump(categorized_activities, f, indent=4)
            print(f"Summary saved to {summary_path}")


if __name__ == "__main__":
    main()
