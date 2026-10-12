from dotenv import load_dotenv
import requests
from bs4 import BeautifulSoup
import json
import os
import time
import re
from urllib.parse import urlparse
import shutil
import hashlib
from pathlib import Path

# Load environment variables from .env file
load_dotenv(dotenv_path=Path(__file__).resolve().parents[3] / ".env")

RAW_FOLDER = os.getenv("RAW_FOLDER")

blog_urls_folder = os.path.join(RAW_FOLDER, "blog_urls")
blog_articles_folder = os.path.join(RAW_FOLDER, "blog_articles")


def extract_date_from_url(url):
    """
    Extract date information and title slug from a NASA blog URL.
    Includes posts cross-posted from Commercial Crew and other NASA blogs.
    Expected format: https://www.nasa.gov/blogs/spacestation/2020/01/31/u-s-cygnus-space-freighter-departs-station-after-88-days/
    """
    try:
        parsed_url = urlparse(url)
        path = parsed_url.path

        # Extract year, month, day, and title slug using regex
        date_pattern = r"/blogs/[^/]+/(\d{4})/(\d{2})/(\d{2})/([^/]+)/?"
        match = re.fullmatch(date_pattern, path)

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
        response = requests.get(url, timeout=30)
        content_source_url = None
        if response.status_code == 404:
            # Some published NASA posts have broken permalinks. The public
            # WordPress API still exposes their complete rendered post content.
            parsed = urlparse(url)
            year, month, day, slug = extract_date_from_url(url)
            if parsed.hostname not in {"www.nasa.gov", "nasa.gov"} or not year:
                return None
            api_response = requests.get(
                "https://www.nasa.gov/wp-json/wp/v2/nasa-blog",
                params={"slug": slug},
                timeout=30,
            )
            api_response.raise_for_status()
            matching = [
                post
                for post in api_response.json()
                if post.get("status") == "publish"
                and urlparse(post.get("link", "")).path.rstrip("/")
                == parsed.path.rstrip("/")
                and not post.get("content", {}).get("protected")
            ]
            if len(matching) != 1:
                print(f"No matching published full post in NASA API for {url}")
                return None
            post = matching[0]
            content_source_url = (
                f"https://www.nasa.gov/wp-json/wp/v2/nasa-blog/{post['id']}"
            )
            title_html = post.get("title", {}).get("rendered", "")
            content_html = post.get("content", {}).get("rendered", "")
            soup = BeautifulSoup(
                f'<div itemprop="articleBody"><h1>{title_html}</h1>{content_html}</div>',
                "html.parser",
            )
            print(f"Recovered full post through NASA API: {content_source_url}")
        elif response.status_code != 200:
            print(f"Failed to fetch {url}, status code: {response.status_code}")
            return None
        else:
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
        if not title_elem or not title_elem.get_text(strip=True):
            print(f"No full-post title found at {url}")
            return None
        title = title_elem.get_text(strip=True)

        # Exclude author credits and related-post navigation from the post body.
        for extra in article.select("footer, .blog-sidebar, .blog-excerpt"):
            extra.decompose()

        # Extract hero image and caption
        figure = article.select_one("figure")
        img_url = None
        image_filename = None
        caption = ""

        # if figure has no children, try to find relevant images in the article
        if figure and not figure.select_one("img[src]"):
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
        if not caption:
            caption_elem = article.select_one(".hds-caption-text")
            caption = caption_elem.get_text(" ", strip=True) if caption_elem else ""
        # if image_filename has a colon in it and it's from twitter, split it and take the first part
        if image_filename and ":" in image_filename and "twimg" in img_url:
            image_filename = image_filename.split(":")[0]
        if image_filename and not os.path.splitext(image_filename)[1]:
            image_filename += ".jpg"

        # Keep prose, headings and lists in document order. Some NASA posts put
        # mission schedules in list items rather than paragraphs.
        paragraphs = []
        for p in article.find_all(["p", "li", "h2", "h3", "h4", "blockquote"]):
            # Skip empty paragraphs
            if not p.text.strip():
                continue

            # Make sure this paragraph is not inside a figcaption
            if not p.find_parent(["figcaption", "li", "blockquote"]):
                # Create a copy to modify
                p_copy = BeautifulSoup(str(p), "html.parser")
                p_element = p_copy.find(p.name)

                if p_element:
                    # Find all <a> tags and set their target attribute
                    for a_tag in p_element.find_all("a"):
                        a_tag["target"] = "blog_article"
                    # The frontend wraps each content block in a paragraph.
                    for nested_p in p_element.find_all("p"):
                        nested_p.unwrap()
                    inner_content = p_element.decode_contents()
                    if p.name == "li":
                        inner_content = "&#8226; " + inner_content
                    elif p.name in {"h2", "h3", "h4"}:
                        inner_content = f"<strong>{inner_content}</strong>"
                    paragraphs.append(inner_content)

        if not paragraphs:
            print(f"No full-post paragraphs found at {url}")
            return None

        result = {
            "title": title,
            "paragraphs": paragraphs,
            "image_url": img_url,
            "image_filename": image_filename,
            "image_caption": caption,
        }
        if content_source_url:
            result["content_source_url"] = content_source_url
        return result
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


def local_image_filename(filename, article_folder):
    """Keep image paths below Windows' legacy limit, preserving short names."""
    # Leave headroom for filesystem operations and keep the extension usable by
    # both consolidation and the frontend. A hash distinguishes truncated names.
    name_limit = min(200, 240 - len(os.path.abspath(article_folder)) - 1)
    if len(filename) <= name_limit:
        return filename
    stem, extension = os.path.splitext(filename)
    suffix = "-" + hashlib.sha256(filename.encode("utf-8")).hexdigest()[:12]
    stem_limit = name_limit - len(suffix) - len(extension)
    if stem_limit < 1:
        raise ValueError(f"Article folder is too long for an image: {article_folder}")
    return stem[:stem_limit] + suffix + extension


def download_image(img_url, save_path):
    """Download an image from the given URL"""
    try:
        if not img_url:
            return False

        response = requests.get(img_url, stream=True, timeout=30)
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
    failures = []

    for url in urls:
        # Extract date information and title slug from URL
        year, month, day, title_slug = extract_date_from_url(url)

        if not all([year, month, day, title_slug]):
            print(f"Could not extract date or title from URL: {url}")
            failures.append(url)
            continue

        # Check if this article has already been processed
        article_folder = os.path.join(
            blog_articles_folder, year, month, f"{day}-{title_slug}"
        )
        json_path = os.path.join(article_folder, "article.json")
        if os.path.exists(json_path):
            try:
                # Load existing JSON
                with open(json_path, "r", encoding="utf-8") as f:
                    existing_data = json.load(f)
                image_filename = existing_data.get("image_filename")
                complete = (
                    existing_data.get("title")
                    and existing_data.get("paragraphs")
                    and (
                        not image_filename
                        or os.path.isfile(os.path.join(article_folder, image_filename))
                    )
                )
                if complete and "source_url" not in existing_data:
                    existing_data["source_url"] = url
                    # Save back
                    with open(json_path, "w", encoding="utf-8") as f:
                        json.dump(existing_data, f, ensure_ascii=False, indent=2)
                    print(f"Updated JSON for existing article: {url}")
                elif complete:
                    print(
                        f"Article already processed and has source_url: {url} - Skipping"
                    )
                if complete:
                    continue
            except (ValueError, OSError):
                print(f"Retrying unreadable article JSON: {url}")

        # Scrape the article
        article_data = scrape_article(url)
        if not article_data:
            print(f"Failed to scrape article at {url}")
            failures.append(url)
            continue

        # Create folder structure: blog_articles/year/month/day-title-slug/
        os.makedirs(article_folder, exist_ok=True)

        # Download images before committing JSON so interrupted downloads retry.
        if article_data["image_url"] and article_data["image_filename"]:
            article_data["image_filename"] = local_image_filename(
                article_data["image_filename"], article_folder
            )
            img_path = os.path.join(article_folder, article_data["image_filename"])
            if not download_image(article_data["image_url"], img_path):
                failures.append(url)
                continue

        # Save the article data as JSON, only including the requested fields
        json_path = os.path.join(article_folder, "article.json")
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "title": article_data["title"],
                    "paragraphs": article_data["paragraphs"],
                    "image_caption": article_data["image_caption"],
                    "image_filename": article_data["image_filename"],
                    "source_url": url,
                    **(
                        {"content_source_url": article_data["content_source_url"]}
                        if "content_source_url" in article_data
                        else {}
                    ),
                },
                f,
                ensure_ascii=False,
                indent=2,
            )

        print(f"Processed article: {article_data['title']} - Saved to {article_folder}")

        # Add a small delay to avoid hammering the server
        time.sleep(0.5)

    if failures:
        raise RuntimeError(
            f"Failed to download {len(failures)} articles from {file_path}: {failures}"
        )


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
