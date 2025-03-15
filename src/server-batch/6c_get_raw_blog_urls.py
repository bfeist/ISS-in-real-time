import datetime
from dotenv import load_dotenv
import requests
from bs4 import BeautifulSoup
import json
import os
import time

# Load environment variables from .env file
load_dotenv(dotenv_path="../../.env")

SG_RAW_FOLDER = os.getenv("SG_RAW_FOLDER")


def get_blog_urls_for_month(year, month):
    """
    Scrapes NASA's blog for a given year and month and returns all article URLs.
    Handles pagination by checking for and following "Next" page links.
    """
    month_str = f"{month:02d}"  # Format month as two digits
    base_url = f"https://www.nasa.gov/blogs/spacestation/{year}/{month_str}"
    all_urls = []
    current_page = 1

    while True:
        # Construct URL with page parameter if needed
        if current_page == 1:
            url = base_url  # For first page, use base URL without /page/1
        else:
            url = f"{base_url}/page/{current_page}/"  # For subsequent pages

        print(f"Scraping {url}")

        try:
            # Add a delay to avoid hammering NASA's servers
            # time.sleep(1)

            response = requests.get(url)
            # Check if there's a redirect
            final_url = response.url
            if final_url != url and current_page > 1:
                print(f"Redirected to {final_url}, likely at the end of pagination")
                break

            if response.status_code != 200:
                print(f"Page returned status code {response.status_code}")
                break

            soup = BeautifulSoup(response.text, "html.parser")

            # Find all article links in the page
            articles = soup.select("h2.margin-bottom-4.margin-top-2 a")

            if not articles:
                print("No articles found on this page")
                break

            # Extract the href attribute from each article link
            page_urls = [
                article.get("href") for article in articles if article.get("href")
            ]
            all_urls.extend(page_urls)

            print(f"Found {len(page_urls)} articles on page {current_page}")

            # Check for pagination - look for a "Next" page link
            next_page = soup.select_one("a.next.page-numbers")
            if not next_page:
                print("No next page found")
                break

            # Move to the next page
            current_page += 1

        except Exception as e:
            print(f"Error scraping {url}: {e}")
            break

    return all_urls


def save_urls_for_month(year, month, urls):
    """
    Saves the list of URLs for a specific month to a text file in the blog_urls folder.
    """
    month_str = f"{month:02d}"
    blog_urls_folder = os.path.join(SG_RAW_FOLDER, "blog_urls")
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
    Skip months that already have URL files.
    """
    # Define the range of years and months to scrape
    start_year = 2014
    start_month = 10  # October
    end_date = datetime.datetime.now()

    print(
        f"Starting to scrape NASA ISS blog posts from {start_year}/{start_month:02d} to {end_date.year}/{end_date.month:02d}"
    )

    blog_urls_folder = os.path.join(SG_RAW_FOLDER, "blog_urls")
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

            if os.path.exists(filename):
                print(
                    f"\n==== Skipping {year}/{month_str} - file already exists: {filename} ===="
                )
                continue

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
