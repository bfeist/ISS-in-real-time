from dotenv import load_dotenv
import os
import json
import glob

# Load environment variables from .env file (same as the photography script)
load_dotenv(dotenv_path=".env")

# Get the images folder path
web_assets_folder = os.getenv("WEB_ASSETS_FOLDER")
if not web_assets_folder:
    print("Error: WEB_ASSETS_FOLDER environment variable not set.")
    exit(1)

IMAGES_FOLDER = web_assets_folder + "photos_earth/"


def analyze_photo_manifests():
    """Analyze all photo manifest files and find the day with the most photos."""

    # Find all manifest files recursively
    manifest_pattern = os.path.join(IMAGES_FOLDER, "**", "images-manifest_*.json")
    manifest_files = glob.glob(manifest_pattern, recursive=True)

    if not manifest_files:
        print(f"No manifest files found in {IMAGES_FOLDER}")
        return

    photo_counts = {}

    print(f"Found {len(manifest_files)} manifest files. Analyzing...")

    for file_path in manifest_files:
        try:
            with open(file_path, "r") as f:
                data = json.load(f)
                photo_count = len(data)

                # Extract date from filename (format: images-manifest_YYYY-MM-DD.json)
                filename = os.path.basename(file_path)
                date_str = filename.replace("images-manifest_", "").replace(".json", "")

                photo_counts[date_str] = photo_count

        except (json.JSONDecodeError, IOError) as e:
            print(f"Error reading {file_path}: {e}")
            continue

    if not photo_counts:
        print("No valid manifest files could be processed.")
        return

    # Find the day with the most photos
    max_date = max(photo_counts, key=photo_counts.get)
    max_count = photo_counts[max_date]

    print("\nAnalysis complete!")
    print(f"Total manifest files processed: {len(photo_counts)}")
    print(f"Day with most photos: {max_date}")
    print(f"Number of photos: {max_count}")

    # Show top 10 days for context
    print("\nTop 10 days by photo count:")
    sorted_counts = sorted(photo_counts.items(), key=lambda x: x[1], reverse=True)
    for i, (date, count) in enumerate(sorted_counts[:10], 1):
        print(f"{i:2d}. {date}: {count} photos")


if __name__ == "__main__":
    analyze_photo_manifests()
