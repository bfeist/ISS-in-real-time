import json
import os
import requests
from pathlib import Path
from dotenv import load_dotenv
import sys
from datetime import datetime

# Load environment variables
load_dotenv(dotenv_path="../../../.env")

FLICKR_API_KEY = os.getenv("FLICKR_API_KEY")
FLICKR_API_SECRET = os.getenv("FLICKR_API_SECRET")
RAW_FOLDER = os.getenv("RAW_FOLDER")

if not RAW_FOLDER:
    print("Error: RAW_FOLDER environment variable not found")
    sys.exit(1)

OUTPUT_FOLDER = RAW_FOLDER + "photos_flickr/"

# Flickr API constants
FLICKR_API_BASE_URL = "https://www.flickr.com/services/rest/"
TARGET_USERNAME = "nasa2explore"


def make_flickr_api_request(method, params=None):
    """
    Make a request to the Flickr API

    Args:
        method: Flickr API method name (e.g., 'flickr.people.findByUsername')
        params: Additional parameters for the API call

    Returns:
        JSON response from the Flickr API
    """
    if params is None:
        params = {}

    # Add required parameters
    params.update(
        {
            "api_key": FLICKR_API_KEY,
            "method": method,
            "format": "json",
            "nojsoncallback": "1",  # Remove JSONP callback wrapper
        }
    )

    try:
        response = requests.get(FLICKR_API_BASE_URL, params=params)
        response.raise_for_status()
        data = response.json()

        # Check for Flickr API error
        if data.get("stat") == "fail":
            print(f"Flickr API error: {data.get('message', 'Unknown error')}")
            return None

        return data

    except requests.RequestException as e:
        print(f"Error making Flickr API request: {e}")
        return None
    except json.JSONDecodeError:
        print("Error: Failed to parse JSON response from Flickr API.")
        return None


def find_user_by_username(username):
    """
    Find a user's NSID (user ID) by their username

    Args:
        username: The Flickr username to look up

    Returns:
        User NSID if found, None otherwise
    """
    print(f"Looking up user ID for username: {username}")

    data = make_flickr_api_request(
        "flickr.people.findByUsername", {"username": username}
    )

    if data and "user" in data:
        user_nsid = data["user"]["nsid"]
        print(f"Found user ID: {user_nsid}")
        return user_nsid
    else:
        print(f"User '{username}' not found")
        return None


def find_user_by_url(url_path):
    """
    Find a user's NSID by their Flickr URL path

    Args:
        url_path: The Flickr URL path (e.g., 'nasa2explore')

    Returns:
        User NSID if found, None otherwise
    """
    print(f"Looking up user ID for URL path: {url_path}")

    data = make_flickr_api_request(
        "flickr.urls.lookupUser", {"url": f"https://www.flickr.com/photos/{url_path}/"}
    )

    if data and "user" in data and "nsid" in data["user"]:
        user_nsid = data["user"]["nsid"]
        print(f"Found user ID via URL lookup: {user_nsid}")
        return user_nsid
    else:
        if data:
            print(f"URL lookup response: {data}")
        print(f"User URL '{url_path}' not found")
        return None


def get_user_photosets(user_id, page=1, per_page=500):
    """
    Get all photosets (albums) for a user

    Args:
        user_id: The user's NSID
        page: Page number (default: 1)
        per_page: Number of sets per page (default: 500, max allowed)

    Returns:
        List of photosets or None if error
    """
    print(f"Fetching photosets for user ID: {user_id}")

    params = {
        "user_id": user_id,
        "page": page,
        "per_page": per_page,
        "primary_photo_extras": "date_upload,date_taken,owner_name,url_sq,url_t,url_s,url_m,url_o",
    }

    data = make_flickr_api_request("flickr.photosets.getList", params)

    if data and "photosets" in data:
        photosets_info = data["photosets"]
        photosets = photosets_info.get("photoset", [])

        print(f"Found {len(photosets)} photosets on page {page}")
        print(f"Total photosets: {photosets_info.get('total', 0)}")

        return {
            "photosets": photosets,
            "page": photosets_info.get("page", 1),
            "pages": photosets_info.get("pages", 1),
            "per_page": photosets_info.get("perpage", per_page),
            "total": photosets_info.get("total", 0),
        }
    else:
        print("No photosets found or error occurred")
        return None


def save_photosets_to_file(photosets_data, output_file):
    """
    Save photosets data to a JSON file

    Args:
        photosets_data: The photosets data to save
        output_file: Path to the output file
    """
    # Create output directory if it doesn't exist
    os.makedirs(os.path.dirname(output_file), exist_ok=True)

    # Add metadata
    output_data = {
        "metadata": {
            "username": TARGET_USERNAME,
            "retrieved_at": datetime.now().isoformat(),
            "flickr_api_version": "1.0",
            "total_photosets": photosets_data.get("total", 0),
        },
        "pagination": {
            "page": photosets_data.get("page", 1),
            "pages": photosets_data.get("pages", 1),
            "per_page": photosets_data.get("per_page", 500),
            "total": photosets_data.get("total", 0),
        },
        "photosets": photosets_data.get("photosets", []),
    }

    try:
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(output_data, f, indent=2, ensure_ascii=False)

        print(f"Photosets data saved to: {output_file}")
        return True

    except Exception as e:
        print(f"Error saving data to file: {e}")
        return False


def main():
    """
    Main function to fetch NASA Flickr photosets
    """
    print("NASA Flickr Photosets Retriever")
    print("=" * 40)

    # Check if API key is available
    if not FLICKR_API_KEY:
        print("Error: FLICKR_API_KEY not found in environment variables")
        sys.exit(1)

    # Try to find the user ID for nasa2explore using URL lookup first
    user_id = find_user_by_url(TARGET_USERNAME)

    # If that fails, try by username
    if not user_id:
        user_id = find_user_by_username(TARGET_USERNAME)

    # If that fails, try alternative usernames
    if not user_id:
        print(f"Username '{TARGET_USERNAME}' not found, trying alternative names...")
        alternatives = ["NASA Johnson", "nasajohnson", "nasa_johnson", "NASAJohnson"]
        for alt_username in alternatives:
            print(f"Trying username: {alt_username}")
            user_id = find_user_by_username(alt_username)
            if user_id:
                break

    if not user_id:
        print(f"Could not find user ID for '{TARGET_USERNAME}'")
        sys.exit(1)

    # Get all photosets for the user
    photosets_data = get_user_photosets(user_id)
    if not photosets_data:
        print("Could not retrieve photosets")
        sys.exit(1)

    # If there are multiple pages, we should fetch them all
    all_photosets = photosets_data["photosets"]
    total_pages = photosets_data["pages"]

    if total_pages > 1:
        print(f"Fetching remaining {total_pages - 1} pages...")
        for page in range(2, total_pages + 1):
            print(f"Fetching page {page} of {total_pages}")
            page_data = get_user_photosets(user_id, page=page)
            if page_data and "photosets" in page_data:
                all_photosets.extend(page_data["photosets"])

        # Update the photosets data with all results
        photosets_data["photosets"] = all_photosets
        photosets_data["total"] = len(all_photosets)

    # Print summary
    print(f"\nSummary:")
    print(f"Username: {TARGET_USERNAME}")
    print(f"User ID: {user_id}")
    print(f"Total photosets found: {len(all_photosets)}")

    # Print details of each photoset
    print(f"\nPhotosets:")
    for i, photoset in enumerate(all_photosets, 1):
        title = photoset.get("title", {}).get("_content", "Untitled")
        photos_count = photoset.get("photos", 0)
        videos_count = photoset.get("videos", 0)
        photoset_id = photoset.get("id", "Unknown")

        print(f"  {i:3d}. {title}")
        print(f"       ID: {photoset_id}")
        print(f"       Photos: {photos_count}, Videos: {videos_count}")

        # Show description if available (truncated)
        if "description" in photoset and "_content" in photoset["description"]:
            description = photoset["description"]["_content"]
            if description:
                # Truncate long descriptions
                if len(description) > 100:
                    description = description[:97] + "..."
                print(f"       Description: {description}")
        print()

    # Save to file
    output_file = os.path.join(OUTPUT_FOLDER, f"{TARGET_USERNAME}_photosets.json")
    if save_photosets_to_file(photosets_data, output_file):
        print(f"Data saved successfully to: {output_file}")
    else:
        print("Failed to save data to file")
        sys.exit(1)


if __name__ == "__main__":
    main()
