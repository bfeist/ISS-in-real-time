import os
import json
import requests
import csv  # Added import for CSV parsing
from bs4 import BeautifulSoup

# import openai  # Removed import
from datetime import datetime


S3_FOLDER = os.getenv("S3_FOLDER")

"""
This script requires that ollama be running with a model on it at an API key be set in the environment.
ollama run gemma2:27b
"""


def fetch_blog_content(url):
    """
    Fetches and extracts text content from a NASA blog URL.

    Args:
        url (str): The URL of the NASA blog.

    Returns:
        str: The extracted text content.
    """
    try:
        response = requests.get(url)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")

        # Assuming blog content is within <article> tags
        article = soup.find("article")
        if not article:
            print(f"No article found at {url}")
            return ""

        paragraphs = article.find_all(["p", "h2", "h3", "li"])
        content = "\n".join(
            [para.get_text(separator=" ", strip=True) for para in paragraphs]
        )
        return content
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return ""


def parse_transcript(url):
    """
    Parses the transcript CSV from a URL to extract timestamped conversations.

    Args:
        url (str): URL to the transcript CSV file.

    Returns:
        list of dict: Parsed transcript entries.
    """
    transcript_entries = []
    try:
        response = requests.get(url)
        response.raise_for_status()
        lines = response.text.splitlines()
        reader = csv.reader(lines, delimiter="|")
        for parts in reader:
            if len(parts) >= 6:
                timestamp_str = parts[0]
                datetime_obj = datetime.strptime(timestamp_str, "%H:%M:%S")
                timestamp = datetime_obj.strftime("%H:%M:%S")

                transcript_entries.append(
                    {
                        "timestamp": timestamp,
                        "text": parts[5],
                    }
                )
        return transcript_entries
    except Exception as e:
        print(f"Error parsing transcript from URL: {e}")
        return []


def get_topics_summary(blog_contents):

    prompt_intro = "I want you to give me a list of the main activities that took place on the ISS today. The number of results should range from 20 - 40. No more than 60. Your results should be just a list of the names of each activity with no decription. One activity per line. Don't number the results. \n"

    prompt = prompt_intro + "\n".join(blog_contents)

    print("Prompt: ", prompt)

    try:
        # Prepare the payload for Ollama API
        # payload = {"model": "phi4", "prompt": prompt}
        payload = {"model": "gemma2:27b", "prompt": prompt}

        # Make a POST request to the local Ollama API
        response = requests.post("http://localhost:11434/api/generate", json=payload)
        response.raise_for_status()

        # Extract the content
        content = response.json()

        # Attempt to parse JSON from the response
        try:
            topics = json.loads(content)
        except json.JSONDecodeError:
            print("Failed to parse JSON from Ollama response.")
            print("Response content:")
            print(content)
            topics = {}

        return topics

    except Exception as e:
        print(f"Error generating event index: {e}")
        return {}


# def segment_transcript(transcript):
#     summarizer = pipeline("summarization", model="facebook/bart-large-cnn", device=0)
#     for utterance in transcript:
#         print(utterance["timestamp"], summarizer(utterance["text"]))

#     return {}


def main():
    # Configuration
    blog_urls = [
        "https://blogs.nasa.gov/stationreport/2023/12/04/",
    ]
    # blog_urls = [
    #     "https://blogs.nasa.gov/spacestation/2023/11/01/",
    #     "https://blogs.nasa.gov/stationreport/2023/11/01/",
    # ]
    transcript_url = "https://data.issinrealtime.org/ISSiRT_assets/comm/2023/11/01/_transcript_2023-11-01.csv"  # Updated to URL
    output_json_path = "event_index.json"

    # Removed OpenAI API key check
    # api_key = os.getenv("OPENAI_API_KEY")
    # if not api_key:
    #     print("Please set the OPENAI_API_KEY environment variable.")
    #     return

    # Fetch blog contents
    print("Fetching blog contents...")
    blog_contents = []
    for url in blog_urls:
        content = fetch_blog_content(url)
        if content:
            blog_contents.append(content)

    # Get topics summary
    print("Getting topics summary...")
    prompt = get_topics_summary(blog_contents)

    # # Parse transcript
    # print("Parsing transcript...")
    # transcript = parse_transcript(transcript_url)

    # # Segment transcript
    # print("Segmenting transcript...")
    # segments = segment_transcript(transcript)


if __name__ == "__main__":
    main()
