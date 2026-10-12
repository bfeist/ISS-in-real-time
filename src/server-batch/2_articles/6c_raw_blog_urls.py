import datetime
from dotenv import load_dotenv
import requests
from bs4 import BeautifulSoup
import os
from pathlib import Path
from urllib.parse import urljoin, urlparse
import re

# Load environment variables from .env file
load_dotenv(dotenv_path=Path(__file__).resolve().parents[3] / ".env")

RAW_FOLDER = os.getenv("RAW_FOLDER")


def extract_article_urls(soup, page_url):
    """Resolve full-post links, with fallbacks for both NASA heading layouts."""
    links = []
    for entry in soup.select("article.nasa-blog"):
        link = None
        full_post = next(
            (
                a
                for a in entry.select("a[href]")
                if a.get_text(" ", strip=True).lower() == "read full post"
                or a.get("aria-label", "").lower().startswith("read full post:")
            ),
            None,
        )
        if full_post:
            link = full_post
        else:
            heading = entry.select_one("h2")
            if heading:
                link = heading.select_one("a[href]") or heading.find_parent(
                    "a", href=True
                )
        if link is None:
            raise RuntimeError(f"Blog entry has no full-post link: {page_url}")
        links.append(link)

    # Older archives do not necessarily wrap each post in article.nasa-blog.
    if not links:
        for heading in soup.select("h2.margin-bottom-4.margin-top-2"):
            link = heading.select_one("a[href]") or heading.find_parent("a", href=True)
            if link:
                links.append(link)

    urls = []
    for link in links:
        url = urljoin(page_url, link["href"])
        parsed = urlparse(url)
        if parsed.hostname in {"www.nasa.gov", "nasa.gov"} and re.fullmatch(
            r"/blogs/[^/]+/\d{4}/\d{2}/\d{2}/[^/]+/?", parsed.path
        ):
            urls.append(url)
        else:
            raise RuntimeError(f"Invalid full-post link in NASA archive: {url}")
    return list(dict.fromkeys(urls))


def get_blog_urls_for_month(year, month):
    """
    Scrapes NASA's blog for a given year and month and returns all article URLs.
    Handles pagination by checking for and following "Next" page links.
    """
    month_str = f"{month:02d}"  # Format month as two digits
    url = f"https://www.nasa.gov/blogs/spacestation/{year}/{month_str}/"
    all_urls = []
    visited = set()

    while True:
        if url in visited:
            raise RuntimeError(f"Pagination loop in NASA blog archive: {url}")
        visited.add(url)
        print(f"Scraping {url}")
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        if len(visited) > 1 and response.url.rstrip("/") != url.rstrip("/"):
            raise RuntimeError(
                f"Unexpected pagination redirect: {url} -> {response.url}"
            )
        soup = BeautifulSoup(response.text, "html.parser")
        page_urls = extract_article_urls(soup, response.url)
        if not page_urls:
            # NASA renders a genuinely empty month as an empty archive feed.
            feed = soup.select_one("main#blog-archive-content-feed")
            if (
                len(visited) == 1
                and feed is not None
                and not feed.get_text(strip=True)
                and not feed.find()
            ):
                return []
            raise RuntimeError(f"No full-post links found in NASA blog archive: {url}")
        all_urls.extend(page_urls)
        print(f"Found {len(page_urls)} articles on page {len(visited)}")
        next_page = soup.select_one("a.next.page-numbers[href]")
        if not next_page:
            break
        url = urljoin(response.url, next_page["href"])

    return list(dict.fromkeys(all_urls))


def save_urls_for_month(year, month, urls):
    """
    Saves the list of URLs for a specific month to a text file in the blog_urls folder.
    """
    month_str = f"{month:02d}"
    blog_urls_folder = os.path.join(RAW_FOLDER, "blog_urls")
    os.makedirs(blog_urls_folder, exist_ok=True)
    filename = f"{blog_urls_folder}/{year}_{month_str}_blog_urls.txt"

    with open(filename, "w") as f:
        for url in urls:
            f.write(f"{url}\n")

    print(f"Saved {len(urls)} URLs to {filename}")


def main():
    """
    Main function that orchestrates the scraping process.
    Scrapes NASA blog posts from October 2014 to current date.
    Skip months that already have URL files, except for the current month.
    """
    # Define the range of years and months to scrape
    start_year = 2014
    start_month = 10  # October
    end_date = datetime.datetime.now()
    current_year = end_date.year
    current_month = end_date.month

    print(
        f"Starting to scrape NASA ISS blog posts from {start_year}/{start_month:02d} to {end_date.year}/{end_date.month:02d}"
    )

    blog_urls_folder = os.path.join(RAW_FOLDER, "blog_urls")
    os.makedirs(blog_urls_folder, exist_ok=True)

    # Loop through each year and month
    for year in range(start_year, end_date.year + 1):
        # Determine the range of months to scrape for this year
        if year == end_date.year:
            end_month = end_date.month
        else:
            end_month = 12

        # Determine the start month for this year
        if year == start_year:
            current_start_month = start_month
        else:
            current_start_month = 1

        for month in range(current_start_month, end_month + 1):
            month_str = f"{month:02d}"
            # Check if file for this month already exists
            filename = f"{blog_urls_folder}/{year}_{month_str}_blog_urls.txt"

            # Skip if file exists and it's not the current month
            if os.path.exists(filename) and not (
                year == current_year and month == current_month
            ):
                print(
                    f"\n==== Skipping {year}/{month_str} - file already exists: {filename} ===="
                )
                continue

            # If it's the current month and file exists, note that we're updating it
            if (
                os.path.exists(filename)
                and year == current_year
                and month == current_month
            ):
                print(f"\n==== Updating current month {year}/{month_str} data ====")
            else:
                print(f"\n==== Scraping blog posts for {year}/{month_str} ====")

            urls = get_blog_urls_for_month(year, month)

            if urls:
                # Save URLs for this month to a separate file
                save_urls_for_month(year, month, urls)
                print(f"Found {len(urls)} total blog posts for {year}/{month_str}")
            else:
                print(f"No blog posts found for {year}/{month_str}")


if __name__ == "__main__":
    main()
