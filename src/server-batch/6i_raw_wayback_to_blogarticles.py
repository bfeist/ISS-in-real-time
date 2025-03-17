import json
import requests
import os
import re
from urllib.parse import urlparse
from dotenv import load_dotenv
import time
from bs4 import BeautifulSoup
import datetime
import glob
from pathlib import Path
import unicodedata
import dateutil.parser

load_dotenv(dotenv_path="../../.env")
RAW_FOLDER = os.getenv("RAW_FOLDER")

input_folder = os.path.join(RAW_FOLDER, "early_status_rawhtml")
output_folder = os.path.join(RAW_FOLDER, "early_status_blogarticles_output")

# three different formats of html files in the input folder
# t1 has no specific naming convention but is most of the articles
# t2 starts with "spacestation"
# t3 starts with "spacenews"


def extract_spacestation_blog(html_content, filename):
    """Extract information from spacestation blog HTML (Type 2)"""
    soup = BeautifulSoup(html_content, "html.parser")

    # Extract title
    title_element = soup.find("h1", class_="entry-title")
    title = title_element.text.strip() if title_element else "No Title Found"

    # Extract date
    date_element = soup.find("time", class_="entry-date")
    date = date_element.get("datetime").split("T")[0] if date_element else ""

    # Extract paragraphs
    content_div = soup.find("div", class_="entry-content")
    paragraphs = []
    if content_div:
        for p in content_div.find_all("p"):
            if p.text.strip():
                paragraphs.append(p.text.strip())

    # Create JSON structure
    article_data = {
        "title": title,
        "date": date,
        "paragraphs": paragraphs,
        "original_file": filename,
    }

    return article_data


def extract_spacenews_report(html_content, filename):
    """Extract information from spacenews report HTML (Type 3)"""
    soup = BeautifulSoup(html_content, "html.parser")

    # Extract title (for STS reports)
    title_element = soup.find("title")
    title = title_element.text.strip() if title_element else "No Title Found"

    # Extract date and time
    date_text = ""
    font_elements = soup.find_all(
        "font", face="Arial, Helvetica, sans-serif", size="-1"
    )
    for element in font_elements:
        if (
            "Status Report #" in element.text
            and "CDT" in element.text
            or "CST" in element.text
        ):
            date_text = element.text.strip()
            break

    # Extract paragraphs
    paragraphs = []
    p_tags = soup.find_all("p")
    for p in p_tags:
        if p.find("font", face="Arial, Helvetica, sans-serif", size="-1"):
            text = p.text.strip()
            if text and not "###" in text and not "majordomo@listserver" in text:
                paragraphs.append(text)

    # Create JSON structure
    article_data = {
        "title": title,
        "date": date_text,
        "paragraphs": paragraphs,
        "original_file": filename,
    }

    return article_data


def extract_jsc_status_report(html_content, filename):
    """Extract information from JSC status report HTML (Type 1)"""
    soup = BeautifulSoup(html_content, "html.parser")

    # Extract title
    title_element = soup.find("title")
    if title_element:
        title = title_element.text.strip()
        # remove "NASA - " prefix
        title = title.replace("NASA -", "")
        title = title.replace("| NASA", "")
        # remove any \n characters
        title = title.replace("\n", "")
        # remove any extra spaces
        title = re.sub(r"\s+", " ", title).strip()
    else:
        # Try to find title in a span element
        title_span = soup.find("span", class_="bold")
        title = title_span.text.strip() if title_span else "No Title Found"

    # Extract date - try multiple approaches
    date = ""
    # First try the promodatepress div
    promo_date = soup.find("div", class_="promodatepress")
    if promo_date:
        # promodatepress format is like "mm.dd.yy"
        date = promo_date.text.strip()
        date = dateutil.parser.parse(date).strftime("%Y.%m.%d")

    # If no date found, look for it in the promodatepress div
    if not date:
        date_element = soup.find("div", class_="address")
        if date_element:
            # Get the full HTML content instead of just text
            date_html = str(date_element)
            # Check if there are <br /> tags
            if "<br />" in date_html or "<br/>" in date_html:
                # Split at the first <br /> tag and take the first part
                date = date_element.text.split("\n")[0].strip()
            else:
                date = date_element.text.strip()

    # If still no date, look for it in other common structures
    if not date:
        # Look for date in text of address elements
        for div in soup.find_all("div"):
            if (
                div.text
                and ("CDT" in div.text or "CST" in div.text)
                and any(
                    month in div.text
                    for month in [
                        "January",
                        "February",
                        "March",
                        "April",
                        "May",
                        "June",
                        "July",
                        "August",
                        "September",
                        "October",
                        "November",
                        "December",
                        "Jan",
                        "Feb",
                        "Mar",
                        "Apr",
                        "Jun",
                        "Jul",
                        "Aug",
                        "Sep",
                        "Oct",
                        "Nov",
                        "Dec",
                    ]
                )
            ):
                date = div.text.strip()
                break

    # convert date to ISO format if found
    if date:
        date = parse_date(date)

    # Extract paragraphs - try multiple approaches
    paragraphs = []

    # First try standard content div
    content_div = soup.find("div", class_="default_style_wrap")
    if content_div:
        for p in content_div.find_all("p"):
            text = p.text.strip()
            if text and not "-  end -" in text and not "text-only version" in text:
                paragraphs.append(text)

    # If no paragraphs found, try other common structures
    if not paragraphs:
        # Look for paragraphs in spans with class="bold" and following content
        spans = soup.find_all("span", class_="bold")
        for span in spans:
            if "STATUS REPORT" in span.text:
                # Get the next sibling elements
                current = span.next_sibling
                while current:
                    if hasattr(current, "text") and current.text.strip():
                        text = current.text.strip()
                        if (
                            text
                            and not "-  end -" in text
                            and not "text-only version" in text
                            and not "Back To Top" in text
                        ):
                            paragraphs.append(text)
                    current = current.next_sibling

    # If still no paragraphs, try general paragraph tags
    if not paragraphs:
        content_area = False
        for p in soup.find_all("p"):
            text = p.text.strip()
            # Skip empty paragraphs, end markers and navigation text
            if not text or "-  end -" in text or "text-only version" in text:
                continue

            # Once we find substantial text, mark that we're in the content area
            if len(text) > 100:
                content_area = True

            if content_area and text:
                # split the text into paragraphs if it contains "<br /><br />" entries
                if "<br /><br />" in text:
                    paragraphs.extend(text.split("<br /><br />"))
                else:
                    paragraphs.append(text)

    # Create JSON structure
    article_data = {
        "title": title,
        "date": date,
        "paragraphs": paragraphs,
        "original_file": filename,
    }

    return article_data


def detect_and_process_file(file_path):
    """Detect file type and process accordingly"""
    filename = os.path.basename(file_path)

    with open(file_path, "r", encoding="utf-8", errors="replace") as f:
        html_content = f.read()

    if filename.startswith("spacestation_"):
        return extract_spacestation_blog(html_content, filename)
    elif filename.startswith("spacenews_"):
        return extract_spacenews_report(html_content, filename)
    else:
        return extract_jsc_status_report(html_content, filename)


def parse_date(date_string):
    """Parse date from various formats to YYYY/MM/DD format"""
    if not date_string:
        # stop script if no date string is provided
        exit(1)

    try:
        # Handle various date formats
        # For example: "Saturday, Dec. 2, 2000, 8:30 p.m. CST"
        # or ISO format like "2015-02-14"
        parsed_date = dateutil.parser.parse(date_string, fuzzy=True)
        return parsed_date.strftime("%Y/%m/%d")
    except Exception as e:
        print(f"Could not parse date '{date_string}': {str(e)}")
        exit(1)


def create_slug(title):
    """Create a URL-friendly slug from a title"""
    # Remove non-alphanumeric characters and convert to lowercase
    title = title.lower()
    # Normalize unicode characters
    title = (
        unicodedata.normalize("NFKD", title).encode("ASCII", "ignore").decode("ASCII")
    )
    # Replace spaces with hyphens
    title = re.sub(r"\s+", "-", title)
    # Remove any non-alphanumeric characters except hyphens
    title = re.sub(r"[^a-z0-9\-]", "", title)
    # Remove multiple consecutive hyphens
    title = re.sub(r"\-+", "-", title)
    # Trim hyphens from the beginning and end
    title = title.strip("-")
    # Limit slug length
    return title[:100]


def save_article(article_data, output_path=None):
    """Save extracted article data as JSON in a dated folder structure"""
    # Extract date components from the article data
    date_parts = parse_date(article_data.get("date", "")).split("/")
    year, month, day = date_parts[0], date_parts[1], date_parts[2]

    # Only skip if paragraphs is empty list or contains only one very short item
    paragraphs = article_data.get("paragraphs", [])
    if not paragraphs or (len(paragraphs) == 1 and len(paragraphs[0]) < 50):
        print(
            f"Skipping file with insufficient content: {article_data.get('original_file')}"
        )
        return None

    # Create a slug from the title
    title_slug = create_slug(article_data.get("title", "untitled"))

    # Create the folder path: output_folder/yyyy/mm/dd-titleslug
    folder_path = os.path.join(output_folder, year, month, f"{day}-{title_slug}")
    os.makedirs(folder_path, exist_ok=True)

    # Save the article.json file in this folder
    json_path = os.path.join(folder_path, "article.json")

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(article_data, f, ensure_ascii=False, indent=2)

    return json_path


def process_all_files():
    """Process all HTML files in the input folder"""

    # Get a list of all HTML files in the input folder
    html_files = []
    for ext in ["*.html", "*.htm"]:
        html_files.extend(glob.glob(os.path.join(input_folder, ext)))

    html_files.sort()

    print(f"Found {len(html_files)} files to process")

    counter = 0
    for file_path in html_files:
        counter += 1
        try:
            if counter < 1044:
                continue

            basename = os.path.basename(file_path)

            print(f"{counter} Processing {basename}...")

            if basename == "centers_johnson_news_station_2000_iss01-40.html":
                print(f"whatever {basename}")

            article_data = detect_and_process_file(file_path)

            # if there are no paragraphs, skip this file
            if not article_data.get("paragraphs"):
                print(f"Skipping file with no paragraphs: {basename}")
                continue

            save_article(article_data)
        except Exception as e:
            print(f"Error processing {file_path}: {str(e)}")

    print("Processing complete!")


if __name__ == "__main__":
    process_all_files()
