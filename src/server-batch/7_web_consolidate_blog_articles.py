import os
import json
import shutil
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv(dotenv_path="../../.env")

WEB_ASSETS_FOLDER = os.getenv("S3_WEB_ASSETS_FOLDERFOLDER")
RAW_FOLDER = os.getenv("RAW_FOLDER")

blog_articles_folder = os.path.join(RAW_FOLDER, "blog_articles")
web_blog_articles_folder = os.path.join(WEB_ASSETS_FOLDER, "blog_articles")


def copy_blog_article_for_date(date_str):
    """Merge blog articles for a specific date into a single articles.json file"""
    # Expected date format: YYYY-MM-DD
    try:
        year, month, day = date_str.split("-")

        # Look for blog articles in the raw folder
        year_folder = os.path.join(blog_articles_folder, year)
        if not os.path.exists(year_folder):
            print(f"No blog articles found for year {year}")
            return

        month_folder = os.path.join(year_folder, month)
        if not os.path.exists(month_folder):
            print(f"No blog articles found for {year}-{month}")
            return

        # Find all articles for this day
        all_articles = []
        found_articles = False
        article_images = []

        # First, collect all articles and their images without creating directories
        for folder_name in os.listdir(month_folder):
            if folder_name.startswith(f"{day}-"):
                article_path = os.path.join(month_folder, folder_name)

                # Load article.json
                article_json_path = os.path.join(article_path, "article.json")
                if os.path.exists(article_json_path):
                    with open(article_json_path, "r", encoding="utf-8") as f:
                        article_data = json.load(f)
                        all_articles.append(article_data)

                    # Collect image paths but don't copy yet
                    for file_name in os.listdir(article_path):
                        src_file = os.path.join(article_path, file_name)
                        if os.path.isfile(src_file) and file_name != "article.json":
                            article_images.append((src_file, file_name))

                found_articles = True

        # Only proceed if we found articles
        if not found_articles or len(all_articles) == 0:
            print(f"No blog articles found for date {date_str}")
            return

        # Now create the destination directory and copy files
        dest_dir = os.path.join(web_blog_articles_folder, year, month, day)
        os.makedirs(dest_dir, exist_ok=True)

        # Copy all collected images
        for src_file, file_name in article_images:
            dst_file = os.path.join(dest_dir, file_name)
            shutil.copy2(src_file, dst_file)
            print(f"Copied image {file_name} to {dest_dir}")

        # Write merged articles.json file
        merged_json_path = os.path.join(dest_dir, "articles.json")
        with open(merged_json_path, "w", encoding="utf-8") as f:
            json.dump(all_articles, f, ensure_ascii=False, indent=2)

        print(
            f"Created merged articles.json with {len(all_articles)} articles for {date_str}"
        )

    except ValueError:
        print(f"Invalid date format: {date_str}. Expected YYYY-MM-DD")
    except Exception as e:
        print(f"Error processing date {date_str}: {e}")


def load_available_dates():
    """Scans the blog article folder structure to find all available dates"""
    available_dates = []

    # Ensure the blog articles folder exists
    if not os.path.exists(blog_articles_folder):
        print(f"Blog articles folder not found: {blog_articles_folder}")
        return available_dates

    try:
        # Scan for year folders
        for year in sorted(os.listdir(blog_articles_folder)):
            year_folder = os.path.join(blog_articles_folder, year)

            if not os.path.isdir(year_folder):
                continue

            # Scan for month folders
            for month in sorted(os.listdir(year_folder)):
                month_folder = os.path.join(year_folder, month)

                if not os.path.isdir(month_folder):
                    continue

                # Find all day folders
                day_set = set()  # Use a set to avoid duplicates

                for folder_name in os.listdir(month_folder):
                    # Day folders start with the day number followed by hyphen
                    if "-" in folder_name:
                        parts = folder_name.split("-", 1)
                        if len(parts) > 1:
                            try:
                                day = parts[0]
                                # Ensure the day is properly formatted (e.g., "01" instead of "1")
                                day = day.zfill(2)
                                day_set.add(day)
                            except (ValueError, IndexError):
                                continue

                # Create date entries for each day found
                for day in sorted(day_set):
                    date_str = f"{year}-{month.zfill(2)}-{day}"
                    available_dates.append({"date": date_str})

    except Exception as e:
        print(f"Error scanning for available dates: {e}")

    return available_dates


def main():
    """Main function to copy all blog articles for available dates"""
    # Ensure the destination directory exists
    os.makedirs(web_blog_articles_folder, exist_ok=True)

    # Load available dates
    available_dates = load_available_dates()
    print(f"Found {len(available_dates)} available dates")

    # Process each date entry
    for date_entry in available_dates:
        date_str = date_entry["date"]
        print(f"Processing blog articles for date: {date_str}")
        copy_blog_article_for_date(date_str)

    print("Blog articles processing complete.")


if __name__ == "__main__":
    main()
