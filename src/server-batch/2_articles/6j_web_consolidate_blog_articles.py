import os
import json
import shutil
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv(dotenv_path="../../../.env")

WEB_ASSETS_FOLDER = os.getenv("WEB_ASSETS_FOLDER")
RAW_FOLDER = os.getenv("RAW_FOLDER")

input_modern_articles_folder = os.path.join(RAW_FOLDER, "blog_articles")
input_wayback_articles_folder = os.path.join(
    RAW_FOLDER, "early_status_blogarticles_output"
)
web_blog_articles_folder = os.path.join(WEB_ASSETS_FOLDER, "blog_articles")


def load_wayback_articles():
    """Load all wayback articles from the early_status_blogarticles_output folder and organize by date"""
    wayback_articles_by_date = {}

    if not os.path.exists(input_wayback_articles_folder):
        print(f"Wayback articles folder not found: {input_wayback_articles_folder}")
        return wayback_articles_by_date

    try:
        # Scan for year folders
        for year in sorted(os.listdir(input_wayback_articles_folder)):
            year_folder = os.path.join(input_wayback_articles_folder, year)

            if not os.path.isdir(year_folder):
                continue

            # Scan for month folders
            for month in sorted(os.listdir(year_folder)):
                month_folder = os.path.join(year_folder, month)

                if not os.path.isdir(month_folder):
                    continue

                # Scan for day folders
                for folder_name in os.listdir(month_folder):
                    if not os.path.isdir(os.path.join(month_folder, folder_name)):
                        continue

                    # Day folders start with the day number followed by hyphen
                    if "-" in folder_name:
                        parts = folder_name.split("-", 1)
                        if len(parts) > 0:
                            try:
                                day = parts[0].zfill(2)
                                article_path = os.path.join(month_folder, folder_name)

                                # Load article JSON files in this folder
                                for filename in os.listdir(article_path):
                                    if filename.endswith(".json"):
                                        file_path = os.path.join(article_path, filename)

                                        try:
                                            with open(
                                                file_path, "r", encoding="utf-8"
                                            ) as f:
                                                article_data = json.load(f)

                                                # Format the date
                                                formatted_date = (
                                                    f"{year}-{month.zfill(2)}-{day}"
                                                )

                                                # Transform wayback article to a compatible structure
                                                transformed_article = {
                                                    "title": article_data.get(
                                                        "title", ""
                                                    ),
                                                    "date": formatted_date,
                                                    "paragraphs": article_data.get(
                                                        "paragraphs", []
                                                    )
                                                    or (
                                                        article_data.get(
                                                            "content", ""
                                                        ).split("\n\n")
                                                        if article_data.get("content")
                                                        else []
                                                    ),
                                                    "source": "wayback",
                                                    "original_file": article_data.get(
                                                        "original_file", ""
                                                    )
                                                    or file_path,
                                                }

                                                # Add source_url if available
                                                if "source_url" in article_data:
                                                    transformed_article[
                                                        "source_url"
                                                    ] = article_data["source_url"]

                                                # Add image data if available
                                                if "image_caption" in article_data:
                                                    transformed_article[
                                                        "image_caption"
                                                    ] = article_data["image_caption"]

                                                if "image_filename" in article_data:
                                                    transformed_article[
                                                        "image_filename"
                                                    ] = article_data["image_filename"]

                                                # Add to the dictionary by date
                                                if (
                                                    formatted_date
                                                    not in wayback_articles_by_date
                                                ):
                                                    wayback_articles_by_date[
                                                        formatted_date
                                                    ] = []

                                                wayback_articles_by_date[
                                                    formatted_date
                                                ].append(transformed_article)
                                        except Exception as e:
                                            print(
                                                f"Error loading wayback article {file_path}: {e}"
                                            )
                            except Exception as e:
                                print(f"Error processing folder {folder_name}: {e}")
    except Exception as e:
        print(f"Error scanning wayback articles folder: {e}")

    return wayback_articles_by_date


def copy_blog_article_for_date(date_str, wayback_articles_by_date=None):
    """Merge blog articles for a specific date into a single articles.json file"""
    # Expected date format: YYYY-MM-DD
    try:
        year, month, day = date_str.split("-")

        # Initialize variables
        all_articles = []
        found_articles = False
        article_images = []

        # Check if there are modern articles for this date
        year_folder = os.path.join(input_modern_articles_folder, year)
        month_folder = (
            os.path.join(year_folder, month) if os.path.exists(year_folder) else None
        )

        # Process modern articles if they exist
        if month_folder and os.path.exists(month_folder):
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

        # Check if there are wayback articles for this date
        if wayback_articles_by_date and date_str in wayback_articles_by_date:
            found_articles = True
            all_articles.extend(wayback_articles_by_date[date_str])
            print(
                f"Added {len(wayback_articles_by_date[date_str])} wayback articles for date {date_str}"
            )

        # Only proceed if we found articles
        if not found_articles or len(all_articles) == 0:
            print(f"No articles found for date {date_str}")
            return

        # Now create the destination directory and copy files
        dest_dir = os.path.join(web_blog_articles_folder, year, month, day)
        os.makedirs(dest_dir, exist_ok=True)

        # Added check: skip if consolidated articles.json already exists
        merged_json_path = os.path.join(dest_dir, "articles.json")
        if os.path.exists(merged_json_path):
            print(f"Consolidated json file already exists for {date_str}. Skipping.")
            return

        # Copy all collected images
        for src_file, file_name in article_images:
            dst_file = os.path.join(dest_dir, file_name)
            shutil.copy2(src_file, dst_file)

        # Write merged articles.json file
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
    """Scans both modern and wayback blog article folders to find all available dates"""
    available_dates = []
    dates_set = set()  # Use a set to avoid duplicates

    # PART 1: Scan modern blog articles
    if os.path.exists(input_modern_articles_folder):
        try:
            # Scan for year folders
            for year in sorted(os.listdir(input_modern_articles_folder)):
                year_folder = os.path.join(input_modern_articles_folder, year)

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
                        dates_set.add(date_str)
        except Exception as e:
            print(f"Error scanning modern articles for available dates: {e}")
    else:
        print(f"Modern blog articles folder not found: {input_modern_articles_folder}")

    # PART 2: Scan wayback articles
    if os.path.exists(input_wayback_articles_folder):
        try:
            # Scan for year folders in wayback structure
            for year in sorted(os.listdir(input_wayback_articles_folder)):
                year_folder = os.path.join(input_wayback_articles_folder, year)

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
                        if not os.path.isdir(os.path.join(month_folder, folder_name)):
                            continue

                        # Day folders start with the day number followed by hyphen
                        if "-" in folder_name:
                            parts = folder_name.split("-", 1)
                            if len(parts) > 0:
                                try:
                                    day = parts[0].zfill(2)
                                    day_set.add(day)
                                except (ValueError, IndexError):
                                    continue

                    # Create date entries for each day found
                    for day in sorted(day_set):
                        date_str = f"{year}-{month.zfill(2)}-{day}"
                        dates_set.add(date_str)
        except Exception as e:
            print(f"Error scanning wayback articles for available dates: {e}")
    else:
        print(f"Wayback articles folder not found: {input_wayback_articles_folder}")

    # Convert set to list of dictionaries
    for date_str in sorted(dates_set):
        available_dates.append({"date": date_str})

    return available_dates


def main():
    """Main function to copy all blog articles for available dates"""
    # Ensure the destination directory exists
    os.makedirs(web_blog_articles_folder, exist_ok=True)

    # Load available dates from both modern and wayback articles
    available_dates = load_available_dates()
    print(f"Found {len(available_dates)} unique dates to process")

    # Load wayback articles content
    wayback_articles_by_date = load_wayback_articles()
    wayback_dates_count = len(wayback_articles_by_date)
    print(f"Found wayback articles for {wayback_dates_count} dates")

    # Process each date entry
    for date_entry in available_dates:
        date_str = date_entry["date"]
        # print(f"Processing blog articles for date: {date_str}")
        copy_blog_article_for_date(date_str, wayback_articles_by_date)

    print("Blog articles processing complete.")


if __name__ == "__main__":
    main()
