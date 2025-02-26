import datetime
from dotenv import load_dotenv
import requests
from bs4 import BeautifulSoup
import json
import os

# Load environment variables from .env file
load_dotenv(dotenv_path="../../.env")

S3_FOLDER = os.getenv("S3_FOLDER")
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

    # The main content is now within a div with class="single-blog-content"
    main_div = soup.find("div", class_="single-blog-content")
    if not main_div:
        return {}  # If we can't find the main content, return empty

    # Possible category headers with JSON names and matching text
    category_headings = {
        "Payloads": "Payloads",
        "Systems": "Systems",
        "Completed Task List Activities": "Tasklist",
        "Completed Planned Activities": "Tasklist",
        "Today’s Planned Activities": "Tasklist",
        "Today’s Ground Activities": "Ground",
        "Ground Activities": "Ground",
    }

    # Iterate over all child elements in the main content
    for elem in main_div.children:
        if elem.name == "p":
            # If we see "Look Ahead Plan", we stop collecting activities
            if "Look Ahead" in elem.get_text():
                break

            text = elem.get_text(strip=True)
            raw_category_text = text[:-1].strip() if text.endswith(":") else text

            # Check if this paragraph text starts with one of our known category headings
            if any(
                raw_category_text.startswith(key) for key in category_headings.keys()
            ):
                current_category = next(
                    value
                    for key, value in category_headings.items()
                    if raw_category_text.startswith(key)
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


def get_blog_url(landing_url):
    try:
        response = requests.get(landing_url)
        response.raise_for_status()
    except requests.RequestException:
        return None

    soup = BeautifulSoup(response.text, "html.parser")

    # Find the <a> tag with aria-label="A link to open the full blog post"
    a_tag = soup.find("a", {"aria-label": "A link to open the full blog post"})
    if a_tag and "href" in a_tag.attrs:
        return a_tag["href"]

    return None


def main():
    # Configuration
    # blog_url = "https://blogs.nasa.gov/stationreport/2015/05/26/iss-daily-summary-report-05-26-2015/"
    # categorized_activities = get_iss_activities(blog_url)

    # get dates available json in S3 root. Array of strings in format 2022-09-27
    available_dates = []
    if os.path.exists(AVAILABLE_DATES_S3):
        with open(AVAILABLE_DATES_S3, "r") as f:
            available_dates = json.load(f)

    for item in available_dates:
        available_date = item["date"]
        year, month, day = available_date.split("-")

        summary_path = os.path.join(
            S3_FOLDER,
            "activity_summaries",
            year,
            month,
            f"activity_summary_{year}-{month}-{day}.json",
        )

        if os.path.exists(summary_path):
            # check if the json has a "Ground" category. If it does, skip
            with open(summary_path, "r") as f:
                data = json.load(f)
                if "Ground" in data:
                    print(f"Summary already exists for {available_date}. Skipping...")
                    continue
                else:
                    print(
                        f"Summary already exists for {available_date}. But no 'Ground' category. Re-fetching..."
                    )

        available_date_urlformat = available_date.replace("-", "/")
        landing_url = f"https://blogs.nasa.gov/stationreport/{available_date_urlformat}"

        blog_url = get_blog_url(landing_url)
        if not blog_url:
            print(f"No blog URL found for {available_date}. Skipping...")
            continue

        categorized_activities = get_iss_activities(blog_url)

        # if the only activity is "General" with no activities, skip
        if (
            len(categorized_activities) == 1
            and len(categorized_activities["General"]) == 0
        ):
            print(f"No activities found for {available_date}. Skipping...")
            continue

        # Check if there is a "Ground" category
        if "Ground" not in categorized_activities:
            print(f"No 'Ground' activities found for {available_date}.")

        os.makedirs(os.path.dirname(summary_path), exist_ok=True)
        with open(summary_path, "w") as f:
            json.dump(categorized_activities, f, indent=4)
            print(f"Summary saved to {summary_path}")


if __name__ == "__main__":
    main()
