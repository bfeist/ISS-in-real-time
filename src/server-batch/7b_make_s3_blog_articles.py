import os
import json
import shutil
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv(dotenv_path="../../.env")

S3_FOLDER = os.getenv("S3_FOLDER")
SG_RAW_FOLDER = os.getenv("SG_RAW_FOLDER")

available_dates_path = os.path.join(S3_FOLDER, "available_dates.json")
blog_articles_folder = os.path.join(SG_RAW_FOLDER, "blog_articles")
s3_blog_articles_folder = os.path.join(S3_FOLDER, "blog_articles")


def load_available_dates():
    """Load the available dates from the JSON file"""
    try:
        with open(available_dates_path, "r") as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading available dates: {e}")
        return []


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
        dest_dir = os.path.join(s3_blog_articles_folder, year, month, day)
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


def main():
    """Main function to copy all blog articles for available dates"""
    # Ensure the destination directory exists
    os.makedirs(s3_blog_articles_folder, exist_ok=True)

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
