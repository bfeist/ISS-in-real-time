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


def prepare_prompt(blog_contents, transcript):
    """
    Prepares the prompt for the OpenAI API by combining blog contents and transcript.

    Args:
        blog_contents (list of str): List of blog contents.
        transcript (list of dict): Parsed transcript entries.

    Returns:
        str: The prepared prompt.
    """
    prompt = (
        "You are an assistant that indexes daily events on the space station. "
        "Based on the following blog posts and transcript of conversations, "
        "create a JSON-formatted index containing between 20 and 40 events for the day. "
        "Each event should include a timestamp and a description.\n\n"
        "Blog Contents:\n"
    )

    for content in blog_contents:
        prompt += content + "\n\n"

    prompt += "Transcript:\n"
    for entry in transcript:
        prompt += f"{entry['timestamp']} - {entry['text']}\n"

    prompt += "\nPlease provide the JSON-formatted event index."
    return prompt


def generate_event_index(prompt):
    """
    Generates the event index using the local Ollama API.

    Args:
        prompt (str): The prepared prompt.

    Returns:
        dict: The event index as a dictionary.
    """

    try:
        # Prepare the payload for Ollama API
        payload = {"model": "gemma2:27b", "prompt": prompt}

        # Make a POST request to the local Ollama API
        response = requests.post("http://localhost:11434/api/generate", json=payload)
        response.raise_for_status()

        # Extract the content
        content = response.json()

        # Attempt to parse JSON from the response
        try:
            event_index = json.loads(content)
        except json.JSONDecodeError:
            print("Failed to parse JSON from Ollama response.")
            print("Response content:")
            print(content)
            event_index = {}

        return event_index

    except Exception as e:
        print(f"Error generating event index: {e}")
        return {}


def main():
    # Configuration
    blog_urls = [
        "https://blogs.nasa.gov/spacestation/2023/11/01/",
        "https://blogs.nasa.gov/stationreport/2023/11/01/",
    ]
    transcript_url = "https://ares-iss-in-real-time.s3.us-gov-west-1.amazonaws.com/comm/2023/11/01/_transcript_2023-11-01.csv"  # Updated to URL
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

    # Parse transcript
    print("Parsing transcript...")
    transcript = parse_transcript(transcript_url)

    # Prepare prompt
    print("Preparing prompt for Ollama...")
    prompt = prepare_prompt(blog_contents, transcript)

    # Generate event index
    print("Generating event index using Ollama...")
    event_index = generate_event_index(prompt)

    if event_index:
        # Save to JSON file
        try:
            with open(output_json_path, "w", encoding="utf-8") as json_file:
                json.dump(
                    event_index,  # Changed to dump the event_index dictionary
                    json_file,
                    indent=4,
                    ensure_ascii=False,
                )
            print(f"Event index saved to {output_json_path}")
        except Exception as e:
            print(f"Error saving JSON file: {e}")
    else:
        print("No event index generated.")


if __name__ == "__main__":
    main()
