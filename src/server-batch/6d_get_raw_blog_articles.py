import datetime
from dotenv import load_dotenv
import requests
from bs4 import BeautifulSoup
import json
import os
import time
import re
from urllib.parse import urlparse
import shutil

# Load environment variables from .env file
load_dotenv(dotenv_path="../../.env")

SG_RAW_FOLDER = os.getenv("SG_RAW_FOLDER")

blog_urls_folder = os.path.join(SG_RAW_FOLDER, "blog_urls")
blog_articles_folder = os.path.join(SG_RAW_FOLDER, "blog_articles")

# Create articles folder if it doesn't exist
os.makedirs(blog_articles_folder, exist_ok=True)


def extract_date_from_url(url):
    """
    Extract date information and title slug from a NASA blog URL.
    Expected format: https://www.nasa.gov/blogs/spacestation/2020/01/31/u-s-cygnus-space-freighter-departs-station-after-88-days/
    """
    try:
        parsed_url = urlparse(url)
        path = parsed_url.path

        # Extract year, month, day, and title slug using regex
        date_pattern = r"/blogs/spacestation/(\d{4})/(\d{2})/(\d{2})/([^/]+)"
        match = re.search(date_pattern, path)

        if match:
            year = match.group(1)
            month = match.group(2)
            day = match.group(3)
            title_slug = match.group(4)
            return year, month, day, title_slug
        else:
            return None, None, None, None
    except Exception as e:
        print(f"Error extracting date from URL {url}: {e}")
        return None, None, None, None


def scrape_article(url):
    """Scrape a NASA blog article and extract its content"""
    try:
        response = requests.get(url)
        if response.status_code != 200:
            print(f"Failed to fetch {url}, status code: {response.status_code}")
            return None

        soup = BeautifulSoup(response.text, "html.parser")

        # Find the article content using itemprop attribute
        article = soup.select_one("div[itemprop='articleBody']")
        if not article:
            # Fallback to previous selectors if itemprop not found
            article = soup.select_one(
                "div.single-blog-content, div[id^='single-blog-']"
            )
            if not article:
                print(f"No article content found at {url}")
                return None

        # Extract title
        title_elem = article.select_one("h1")
        title = title_elem.text.strip() if title_elem else "Untitled Article"

        # Extract hero image and caption
        figure = article.select_one("figure")
        img_url = None
        image_filename = None
        caption = ""

        # if figure has no children, try to find relevant images in the article
        if figure and not figure.findChildren():
            figure = None

        if figure:
            img = figure.select_one("img")
            img_url = img.get("src") if img else None

            # Extract the original image filename from the URL
            if img_url:
                parsed_url = urlparse(img_url)
                image_filename = os.path.basename(parsed_url.path)

            # Extract caption
            caption_elem = figure.select_one("figcaption")
            caption = caption_elem.text.strip() if caption_elem else ""
        else:
            # If no figure, try to find relevant images in the article
            for img in article.find_all("img"):
                # Skip images in footer
                if img.find_parent("footer"):
                    continue

                candidate_url = img.get("src")
                if candidate_url and not is_irrelevant_image(candidate_url):
                    img_url = candidate_url
                    parsed_url = urlparse(img_url)
                    image_filename = os.path.basename(parsed_url.path)
                    break
        # if image_filename has a colon in it and it's from twitter, split it and take the first part
        if ":" in image_filename and "twimg" in img_url:
            image_filename = image_filename.split(":")[0]

        # Extract paragraphs with preserved links, modifying link targets
        paragraphs = []
        for p in article.find_all("p"):
            # Skip empty paragraphs
            if not p.text.strip():
                continue

            # Make sure this paragraph is not inside a figcaption
            if not p.find_parent("figcaption"):
                # Create a copy to modify
                p_copy = BeautifulSoup(str(p), "html.parser")
                p_element = p_copy.find("p")  # Get the paragraph element

                if p_element:
                    # Find all <a> tags and set their target attribute
                    for a_tag in p_element.find_all("a"):
                        a_tag["target"] = "blog_article"

                    # Get the HTML content of the paragraph
                    content = str(p_element)
                    # Extract just the inner HTML by removing the <p> and </p> tags
                    inner_content = content[
                        content.find(">") + 1 : content.rfind("</p>")
                    ]
                    paragraphs.append(inner_content)

        return {
            "title": title,
            "paragraphs": paragraphs,
            "image_url": img_url,
            "image_filename": image_filename,
            "image_caption": caption,
        }
    except Exception as e:
        print(f"Error scraping article at {url}: {e}")
        return None


def is_irrelevant_image(url):
    """Check if the image is a gravatar, icon, or other irrelevant image"""
    irrelevant_patterns = ["gravatar", "avatar", "icon", "logo", "wp-includes"]

    url_lower = url.lower()
    for pattern in irrelevant_patterns:
        if pattern in url_lower:
            return True

    # Check for very small images that are likely icons
    if "width=" in url_lower and "height=" in url_lower:
        try:
            width_match = re.search(r"width=(\d+)", url_lower)
            height_match = re.search(r"height=(\d+)", url_lower)
            if width_match and height_match:
                width = int(width_match.group(1))
                height = int(height_match.group(1))
                if width <= 200 or height <= 200:  # Likely an icon
                    return True
        except:
            pass

    return False


def download_image(img_url, save_path):
    """Download an image from the given URL"""
    try:
        if not img_url:
            return False

        response = requests.get(img_url, stream=True)
        if response.status_code != 200:
            print(
                f"Failed to download image from {img_url}, status code: {response.status_code}"
            )
            return False

        with open(save_path, "wb") as f:
            shutil.copyfileobj(response.raw, f)

        print(f"Image saved to {save_path}")
        return True
    except Exception as e:
        print(f"Error downloading image from {img_url}: {e}")
        return False


def process_url_file(file_path):
    """Process a file containing article URLs, scrape each article, and save the data"""
    with open(file_path, "r") as f:
        urls = [line.strip() for line in f if line.strip()]

    print(f"Processing {len(urls)} URLs from {file_path}")

    for url in urls:
        # for testing skip all urls that aren't the url below
        # if not url.startswith(
        #     "https://www.nasa.gov/blogs/spacestation/2015/05/05/maintenance-and-departure-prep-today-for-expedition-43/"
        # ):
        #     continue

        # Extract date information and title slug from URL
        year, month, day, title_slug = extract_date_from_url(url)

        if not all([year, month, day, title_slug]):
            print(f"Could not extract date or title from URL: {url}")
            continue

        # Check if this article has already been processed
        article_folder = os.path.join(
            blog_articles_folder, year, month, f"{day}-{title_slug}"
        )
        if os.path.exists(article_folder):
            print(f"Article already processed: {url} - Skipping")
            continue

        # Scrape the article
        article_data = scrape_article(url)
        if not article_data:
            print(f"Failed to scrape article at {url}")
            continue

        # Create folder structure: blog_articles/year/month/day-title-slug/
        os.makedirs(article_folder, exist_ok=True)

        # Save the article data as JSON, only including the requested fields
        json_path = os.path.join(article_folder, "article.json")
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "title": article_data["title"],
                    "paragraphs": article_data["paragraphs"],
                    "image_caption": article_data["image_caption"],
                    "image_filename": article_data["image_filename"],
                },
                f,
                ensure_ascii=False,
                indent=2,
            )

        # Save the hero image if available
        if article_data["image_url"] and article_data["image_filename"]:
            # Use the original filename
            img_url = article_data["image_url"]
            img_filename = article_data["image_filename"]

            # Make sure the filename has an extension
            if not os.path.splitext(img_filename)[1]:
                # If no extension, add .jpg as default
                img_filename = f"{img_filename}.jpg"

            img_path = os.path.join(article_folder, img_filename)
            download_image(img_url, img_path)

        print(f"Processed article: {article_data['title']} - Saved to {article_folder}")

        # Add a small delay to avoid hammering the server
        time.sleep(0.5)


def main():
    """Main function to process all URL files and scrape all articles"""
    # Get all URL files
    url_files = [
        os.path.join(blog_urls_folder, f)
        for f in os.listdir(blog_urls_folder)
        if os.path.isfile(os.path.join(blog_urls_folder, f))
        and f.endswith("_blog_urls.txt")
    ]

    print(f"Found {len(url_files)} URL files to process")

    # Process each URL file
    for file_path in sorted(url_files):
        print(f"\n==== Processing URL file: {file_path} ====")
        process_url_file(file_path)

    print("\nAll blog articles have been scraped and saved.")


if __name__ == "__main__":
    main()
