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
import dateutil.tz

load_dotenv(dotenv_path="../../.env")
RAW_FOLDER = os.getenv("RAW_FOLDER")

input_folder = os.path.join(RAW_FOLDER, "early_status_rawhtml")
output_folder = os.path.join(RAW_FOLDER, "early_status_blogarticles_output")

# Load wayback sources
wayback_sources_path = os.path.join(
    RAW_FOLDER, "early_status_rawhtml", "wayback_sources.json"
)
wayback_sources = {}
if os.path.exists(wayback_sources_path):
    with open(wayback_sources_path, "r", encoding="utf-8") as f:
        sources_list = json.load(f)
        wayback_sources = {item["filename"]: item["sourceUrl"] for item in sources_list}

# three different formats of html files in the input folder
# t1 has no specific naming convention but is most of the articles
# t2 starts with "spacestation"
# t3 starts with "spacenews"


def clean_text(text):
    """Clean text by removing/replacing special characters"""
    # Replace special dashes
    text = text.replace("\x96", "-")
    text = text.replace("\x97", "-")
    # Replace other special quotes
    text = text.replace("\x93", '"')
    text = text.replace("\x94", '"')
    text = text.replace("\x91", "'")
    text = text.replace("\x92", "'")
    # Remove other non-printable chars
    text = re.sub(r"[\x00-\x1f\x7f-\xff]", "", text)
    # Clean up whitespace
    text = re.sub(r"\s+", " ", text).strip()
    return text


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
                text = clean_text(p.text.strip())
                if text:
                    paragraphs.append(text)

    # Create JSON structure
    article_data = {
        "title": title,
        "date": parse_date(date),
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
        # Look for font elements containing both "Status Report #" and a day indicator
        if "Status Report #" in element.text and any(
            day in element.text
            for day in [
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
                "Sunday",
            ]
        ):
            # Found the element with the date
            date_match = re.search(
                r"(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[,\s]+"
                r"(January|February|March|April|May|June|July|August|September|October|November|December)"
                r"[,\s]+(\d{1,2})[,\s]+(\d{4})",
                element.text,
            )

            if date_match:
                # Use the matched date components
                weekday, month, day, year = date_match.groups()
                date_text = f"{month} {day}, {year}"
            else:
                # Fallback: extract just the date part without time
                date_parts = element.text.strip().split("CDT")
                if len(date_parts) > 1:
                    date_text = date_parts[0].strip()
                else:
                    date_parts = element.text.strip().split("CST")
                    if len(date_parts) > 1:
                        date_text = date_parts[0].strip()

                # Clean up the date_text - remove Status Report part
                date_text = re.sub(r".*Status Report #\s*\d+\s*", "", date_text).strip()
            break

    # If date is still not found or properly formatted, try another approach
    if not date_text or not re.search(r"\d{4}|\d{1,2},\s*\d{4}", date_text):
        for element in font_elements:
            if "Status Report #" in element.text:
                # Extract text after "Status Report #XX"
                match = re.search(r"Status Report #\s*\d+\s*(.*)", element.text)
                if match:
                    date_text = match.group(1).strip()
                    # Remove time part if present
                    date_text = re.sub(
                        r"\s*\d{1,2}(?::\d{2})?\s*(?:a\.m\.|p\.m\.|AM|PM)?\s*(?:CDT|CST|EDT|EST)?$",
                        "",
                        date_text,
                    )
                break

    # Extract paragraphs
    paragraphs = []
    p_tags = soup.find_all("p")
    for p in p_tags:
        if p.find("font", face="Arial, Helvetica, sans-serif", size="-1"):
            text = clean_text(p.text.strip())
            if text and not "###" in text and not "majordomo@listserver" in text:
                paragraphs.append(text)

    # Create JSON structure
    article_data = {
        "title": title,
        "date": parse_date(date_text),
        "paragraphs": paragraphs,
        "original_file": filename,
    }

    return article_data


def extract_spacenews_sts_report(html_content, filename):
    """Extract information from STS reports HTML"""
    soup = BeautifulSoup(html_content, "html.parser")

    # Extract title from the title tag
    title_element = soup.find("title")
    title = title_element.text.strip() if title_element else "No Title Found"

    # Find the centered status report paragraph that contains the date
    date_text = ""
    # Look for p tags with align attribute case-insensitively equal to "CENTER"
    header_p = soup.find(
        lambda tag: tag.name == "p"
        and tag.get("align", "").upper() == "CENTER"
        and tag.find("b")
    )
    if header_p and header_p.find("b"):
        bold_text = header_p.find("b").get_text(separator="\n").strip().split("\n")
        # Take the last line which contains the date and time
        if len(bold_text) >= 3:
            date_text = bold_text[-1]
            # Remove time and timezone
            date_text = re.sub(
                r"\s+\d{1,2}:\d{2}\s*(?:a\.m\.|p\.m\.)\s*(?:CST|EDT|CDT|EST)$",
                "",
                date_text,
            ).strip()
    # try looking through the first p tag in the document for strings like Monday, October 7, 2002
    if not date_text:
        first_p = soup.find("p")
        if first_p:
            date_match = re.search(
                r"(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[,\s]+"
                r"(January|February|March|April|May|June|July|August|September|October|November|December)"
                r"[,\s]+(\d{1,2})[,\s]+(\d{4})",
                first_p.text,
            )
            if date_match:
                # Use the matched date components
                weekday, month, day, year = date_match.groups()
                date_text = f"{month} {day}, {year}"
            else:
                # Fallback: extract just the date part without time
                date_parts = first_p.text.strip().split("CDT")
                if len(date_parts) > 1:
                    date_text = date_parts[0].strip()
                else:
                    date_parts = first_p.text.strip().split("CST")
                    if len(date_parts) > 1:
                        date_text = date_parts[0].strip()

    # Extract paragraphs - simply get all p tags and their text
    paragraphs = []
    for p in soup.find_all("p"):
        text = p.get_text().strip()
        # Skip empty paragraphs, navigation text
        if (
            text
            and len(text) > 10  # Skip very short text
            and not "###" in text  # Skip end markers
            and not "majordomo@listserver" in text  # Skip email subscription info
            and not text.startswith("Status Report")  # Skip the header
            and not any(marker in text for marker in ["STS-", "Mission Control Center"])
        ):  # Skip header parts
            # Clean up text including special characters
            text = clean_text(text)
            if text:  # Only add if text remains after cleaning
                paragraphs.append(text)

    # Create JSON structure
    article_data = {
        "title": title,
        "date": parse_date(date_text),
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

    # Extract paragraphs - try multiple approaches
    paragraphs = []

    # First try to find the last occurrence of Body starts comment
    try:
        start_marker = "<!-- Body starts -->"
        end_marker = "<!-- Body ends -->"
        start_idx = html_content.rfind(start_marker)  # Changed from find() to rfind()
        end_idx = html_content.find(
            end_marker, start_idx
        )  # Search for end after the last start

        if start_idx > -1 and end_idx > -1:
            # Extract content between markers
            content = html_content[start_idx + len(start_marker) : end_idx]
            # Split on </p> <p> to get paragraphs
            parts = content.split("</p> <p>")
            for part in parts:
                # Remove any remaining <p> and </p> tags
                text = part.replace("<p>", "").replace("</p>", "").strip()
                if text:
                    clean_text_content = clean_text(text)
                    if clean_text_content and len(clean_text_content) > 25:
                        paragraphs.append(clean_text_content)
    except Exception as e:
        print(f"Error in final paragraph extraction attempt: {str(e)}")

    # try standard content div
    if not paragraphs:
        # Look for the main content div
        content_div = soup.find("div", class_="content")
        if content_div:
            for p in content_div.find_all("p"):
                text = clean_text(p.text.strip())
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
                        text = clean_text(current.text.strip())
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
            text = clean_text(p.text.strip())
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
        "date": parse_date(date),
        "paragraphs": paragraphs,
        "original_file": filename,
    }

    return article_data


def extract_mission_pages_station_expeditions_page(html_content, filename):
    soup = BeautifulSoup(html_content, "html.parser")

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
        # Try to find title in the span with class="bold" inside the address div
        address_div = soup.find("div", class_="address")
        if address_div and address_div.find("span", class_="bold"):
            title_span = address_div.find("span", class_="bold")
            title = title_span.text.strip() if title_span else "No Title Found"
        else:
            title = "No Title Found"

    # Extract date
    date = ""
    promo_date = soup.find("div", class_="promodatepress")
    if promo_date:
        # promodatepress format is like "mm.dd.yy"
        date = promo_date.text.strip()
        # Try to parse the date
        try:
            date = dateutil.parser.parse(date).strftime("%Y.%m.%d")
        except Exception:
            pass
    # if no date found, look for <META NAME="dc.date.modified" CONTENT="2010-12-20">
    if not date:
        meta_date = soup.find("meta", attrs={"name": "dc.date.modified"})
        if meta_date:
            date = meta_date.get("content", "").strip()

    # Extract image URL and caption
    image_url = ""
    image_caption = ""

    # Find the main content div
    content_div = soup.find("div", class_="default_style_wrap")
    if content_div:
        # First look specifically for the img_comments_right span which is common
        img_comments_span = content_div.find("span", class_="img_comments_right")
        if img_comments_span:
            img_tag = img_comments_span.find("img")
            if img_tag and img_tag.get("src"):
                image_url = img_tag["src"]

                # Look for caption in p tag inside this span
                caption_p = img_comments_span.find("p")
                if caption_p:
                    image_caption = caption_p.text.strip()

        # If no image found yet, try looking for any img tag in the content div
        if not image_url:
            img_tag = content_div.find("img")
            if img_tag and img_tag.get("src"):
                image_url = img_tag["src"]

                # Look for caption - check if img is in a span with a following p tag
                parent_span = img_tag.parent
                if parent_span.name == "span":
                    caption_p = parent_span.find("p")
                    if caption_p:
                        image_caption = caption_p.text.strip()

                # Also check for any nearby class="detailImageDesc" element
                img_desc = content_div.find(class_="detailImageDesc")
                if img_desc:
                    image_caption = img_desc.text.strip()
        image_caption = image_caption.replace("Image to right:", "").strip()

    # Extract paragraphs
    paragraphs = []

    if content_div:
        # Collect all text content from <br/><br/> separated blocks
        content_html = str(content_div)

        # Split by <br/><br/> or <br /><br /> to get paragraphs
        parts = re.split(r"<br\s*/>\s*<br\s*/>", content_html)

        for part in parts:
            # Create a new soup object for each part to extract text
            part_soup = BeautifulSoup(part, "html.parser")
            text = clean_text(part_soup.get_text().strip())

            # Skip empty parts, image caption parts, and content that's part of the image span
            if (
                text
                and len(text) > 25
                and not "Credit:" in text
                and (not image_caption or not text.startswith(image_caption.split()[0]))
                and not (img_comments_span and img_comments_span.text.strip() in text)
            ):
                # Clean up the text
                text = re.sub(r"\s+", " ", text).strip()
                paragraphs.append(text)

    # Create JSON structure
    article_data = {
        "title": title,
        "date": parse_date(date),
        "image_url": image_url,
        "image_caption": image_caption,
        "paragraphs": paragraphs,
        "original_file": filename,
    }

    return article_data


def extract_returntoflight_report(html_content, filename):
    """Extract information from returntoflight report HTML (Type 4)"""
    soup = BeautifulSoup(html_content, "html.parser")

    # Extract title from the title tag
    title_element = soup.find("title")
    if title_element:
        title = title_element.text.strip()
        # Remove NASA prefixes/suffixes if present
        title = title.replace("NASA -", "").replace("| NASA", "")
        # Clean up title
        title = re.sub(r"\s+", " ", title.replace("\n", "")).strip()
    else:
        # Fallback to previous approach
        title_element = soup.find("span", class_="bold")
        if title_element and "STATUS REPORT" in title_element.text:
            title = title_element.text.strip()
        else:
            for element in soup.find_all("span", class_="bold"):
                if element.text and not "STATUS REPORT" in element.text:
                    title = element.text.strip()
                    break
            else:
                title = "No Title Found"

    # Extract date - first try to find the date format in the format "07.28.05"
    date = ""

    # Look for date in the pattern after <!-- Title ends --> and before <!-- Body starts -->
    title_end_comment = soup.find(
        text=lambda text: isinstance(text, str) and "Title ends" in text
    )
    if title_end_comment:
        # Get the next span with class="bold"
        current = title_end_comment
        while current and not date:
            if isinstance(current, str) and "Body starts" in current:
                # We've gone too far
                break
            if (
                hasattr(current, "find")
                and current.name == "span"
                and current.get("class") == ["bold"]
            ):
                # This might be our date span
                date_text = current.text.strip()
                if re.match(r"\d{2}\.\d{2}\.\d{2}", date_text):
                    date = date_text
                    break
            current = current.next_element

    # If date still not found, try to find it in any span with class="bold" containing a date pattern
    if not date:
        for span in soup.find_all("span", class_="bold"):
            if re.match(r"\d{2}\.\d{2}\.\d{2}", span.text.strip()):
                date = span.text.strip()
                break

    # If still no date, fall back to previous approach
    if not date:
        for element in soup.find_all(text=True):
            if any(
                time_zone in element for time_zone in ["CDT", "CST", "EDT", "EST"]
            ) and any(
                day in element
                for day in [
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                    "Sunday",
                ]
            ):
                date = element.strip()
                break

    # Parse date to standard format
    if date:
        try:
            # For format like "07.28.05", transform to "2005-07-28"
            if re.match(r"\d{2}\.\d{2}\.\d{2}", date):
                month, day, year = date.split(".")
                date = (
                    f"20{year}-{month}-{day}"
                    if int(year) < 50
                    else f"19{year}-{month}-{day}"
                )
            date = parse_date(date)
        except Exception as e:
            print(f"Error parsing date '{date}': {str(e)}")
            date = ""

    # Extract paragraphs - find the body content between "Body starts" and "Body ends" comments
    paragraphs = []

    # First, try to find the HTML comment containing "Body starts"
    body_starts = None
    body_ends = None

    for comment in soup.find_all(
        text=lambda text: isinstance(text, str) and "Body starts" in text
    ):
        body_starts = comment
        break

    for comment in soup.find_all(
        text=lambda text: isinstance(text, str) and "Body ends" in text
    ):
        body_ends = comment
        break

    # If we found both comments, extract everything between them
    if body_starts and body_ends:
        # Convert the entire HTML to string to work with string indices
        html_str = str(soup)
        start_idx = html_str.find(str(body_starts)) + len(str(body_starts))
        end_idx = html_str.find(str(body_ends))

        if start_idx > 0 and end_idx > start_idx:
            # Extract the HTML segment between comments
            body_html = html_str[start_idx:end_idx]

            # Create a new soup from this segment
            body_soup = BeautifulSoup(body_html, "html.parser")

            # Extract text with br tags preserved
            body_html_clean = str(body_soup)

            # Replace <br> tags with markers
            body_html_clean = re.sub(r"<br\s*/?\s*>", "||BR||", body_html_clean)

            # Split by double <br> tags
            para_splits = re.split(r"\|\|BR\|\|\s*\|\|BR\|\|", body_html_clean)

            for p in para_splits:
                # Create a new soup to extract just the text
                p_soup = BeautifulSoup(p, "html.parser")
                clean_p = clean_text(p_soup.get_text().strip())

                if clean_p and len(clean_p) > 10:
                    clean_p = clean_p.replace("-->", "")
                    # Clean up extra whitespace
                    clean_p = re.sub(r"\s+", " ", clean_p).strip()
                    paragraphs.append(clean_p)

    # If no paragraphs found or couldn't find the comments, use an alternative approach
    if not paragraphs:
        # Find text after "Body starts" comment using parent node traversal
        body_comment = soup.find(
            text=lambda text: isinstance(text, str) and "Body starts" in text
        )
        if body_comment and body_comment.parent:
            # Find the parent of the comment
            parent = body_comment.parent

            # Get the next sibling of the parent that might contain our content
            content_container = None
            current = parent
            while current and not content_container:
                if current.next_sibling:
                    content_container = current.next_sibling
                    break
                current = current.parent

            if content_container:
                # Extract text and split by <br><br>
                content_html = str(content_container)
                content_html = re.sub(r"<br\s*/?\s*>", "||BR||", content_html)
                para_splits = re.split(r"\|\|BR\|\|\s*\|\|BR\|\|", content_html)

                for p in para_splits:
                    p_soup = BeautifulSoup(p, "html.parser")
                    clean_p = clean_text(p_soup.get_text().strip())

                    if clean_p and len(clean_p) > 10:
                        clean_p = re.sub(r"\s+", " ", clean_p).strip()
                        paragraphs.append(clean_p)

    # Last resort - try to find paragraphs between <!-- Body starts --> and <p align="center"> -  end - </p>
    if not paragraphs:
        # First, let's get all text nodes in the document
        all_text_nodes = list(soup.find_all(string=True))

        # Find the index of the "Body starts" comment
        start_idx = -1
        end_idx = -1

        for i, node in enumerate(all_text_nodes):
            if "Body starts" in node:
                start_idx = i
            if "-  end -" in node and i > start_idx:
                end_idx = i
                break

        if start_idx >= 0 and end_idx > start_idx:
            # Collect all text nodes between these indices
            content_nodes = all_text_nodes[start_idx + 1 : end_idx]
            combined_text = " ".join([n.strip() for n in content_nodes if n.strip()])

            # Split by common paragraph breaks in text
            potential_paras = re.split(r"\n\s*\n", combined_text)
            for p in potential_paras:
                clean_p = clean_text(re.sub(r"\s+", " ", p).strip())
                if clean_p and len(clean_p) > 10:
                    paragraphs.append(clean_p)

    # Create JSON structure
    article_data = {
        "title": title,
        "date": parse_date(date),
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
        article_data = extract_spacestation_blog(html_content, filename)
    elif filename.startswith("spacenews_reports_sts"):
        article_data = extract_spacenews_sts_report(html_content, filename)
    elif filename.startswith("spacenews_"):
        article_data = extract_spacenews_report(html_content, filename)
    elif filename.startswith("mission_pages_station_expeditions"):
        article_data = extract_mission_pages_station_expeditions_page(
            html_content, filename
        )
    elif filename.startswith("returntoflight_"):
        article_data = extract_returntoflight_report(html_content, filename)
    else:
        article_data = extract_jsc_status_report(html_content, filename)

    # Add source_url from wayback_sources
    article_data["source_url"] = wayback_sources.get(filename, "")

    return article_data


def parse_date(date_string):
    """Parse date from various formats to YYYY/MM/DD format"""

    try:
        # Handle special characters by replacing them
        date_string = date_string.replace("\x96", "-")  # Replace special dash
        date_string = re.sub(
            r"[\x80-\xff]", "", date_string
        )  # Remove other special chars
        date_string = date_string.strip()

        if not date_string:
            return ""

        # Define timezone info to handle unknown timezones
        tzinfos = {
            "CST": dateutil.tz.tzoffset("CST", -6 * 3600),
            "CDT": dateutil.tz.tzoffset("CDT", -5 * 3600),
            "EST": dateutil.tz.tzoffset("EST", -5 * 3600),
            "EDT": dateutil.tz.tzoffset("EDT", -4 * 3600),
            "PST": dateutil.tz.tzoffset("PST", -8 * 3600),
            "PDT": dateutil.tz.tzoffset("PDT", -7 * 3600),
            "GMT": dateutil.tz.tzoffset("GMT", 0),
            "UTC": dateutil.tz.tzutc(),
        }

        # Handle various date formats
        # For example: "Saturday, Dec. 2, 2000, 8:30 p.m. CST"
        # or ISO format like "2015-02-14"
        parsed_date = dateutil.parser.parse(date_string, fuzzy=True, tzinfos=tzinfos)
        return parsed_date.strftime("%Y-%m-%d")
    except Exception as e:
        print(f"Could not parse date '{date_string}': {str(e)}")
        return date_string  # Return the original string if parsing fails


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
    datecheck = article_data.get("date", "")
    if not datecheck:
        print(f"\nSkipping file with no date: {article_data.get('original_file')}")
        return None

    # Extract date components from the article data
    date_parts = article_data.get("date", "").split("-")
    year, month, day = date_parts[0], date_parts[1], date_parts[2]

    # Only skip if paragraphs is empty list or contains only one very short item
    paragraphs = article_data.get("paragraphs", [])
    if not paragraphs or (len(paragraphs) == 1 and len(paragraphs[0]) < 50):
        print(
            f"\nSkipping file with insufficient content: {article_data.get('original_file')}"
        )
        return None

    # Clean the title to remove extra whitespace
    article_data["title"] = re.sub(r"\s+", " ", article_data["title"]).strip()

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

    # for testing process only mission_pages_station_expeditions_expedition11_exp_11_docking.html
    # html_files = [
    #     os.path.join(
    #         input_folder,
    #         "mission_pages_station_expeditions_expedition26_docking.html",
    #     )
    # ]

    counter = 0
    for file_path in html_files:
        counter += 1
        try:
            basename = os.path.basename(file_path)

            print(f"{counter} Processing {basename}...", end="\r")

            article_data = detect_and_process_file(file_path)

            save_article(article_data)
        except Exception as e:
            print(f"\nError processing {file_path}: {str(e)}")

    print("Processing complete!")


if __name__ == "__main__":
    process_all_files()
