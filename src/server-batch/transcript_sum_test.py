from datetime import datetime
import json
import os
import re
from dotenv import load_dotenv
from transformers import pipeline, AutoTokenizer, AutoModelForSeq2SeqLM
import torch
from datasets import Dataset

load_dotenv(dotenv_path="../../.env")
S3_COMM = os.getenv("S3_FOLDER") + "comm/"


# Helper function: Convert time to seconds
def timestamp_to_seconds(timestamp):
    time_obj = datetime.strptime(timestamp, "%H:%M:%S")
    return time_obj.hour * 3600 + time_obj.minute * 60 + time_obj.second


# Convert CSV transcript rows to transcript items
def csvTranscriptRowToTranscriptItem(csvTranscriptRow):
    [time, filename, start, end, language, text, textOriginalLang] = (
        csvTranscriptRow.strip().split("|")
    )
    seconds = timestamp_to_seconds(time)
    channel = int(re.search(r"_SG_(\d+)", filename).group(1))
    return {"seconds": seconds, "channel": channel, "text": text}


# Convert entire CSV transcript to items
def csvTranscriptToTranscriptItems(csvTranscript):
    rows = csvTranscript.splitlines()
    return [csvTranscriptRowToTranscriptItem(row) for row in rows]


# Chunk transcript into groups
def chunk_transcript(transcript, max_chars=1000):
    chunks = []
    current_chunk = []
    current_length = 0

    for entry in transcript:
        text = entry["text"]
        if current_length + len(text) > max_chars:
            chunks.append(current_chunk)
            current_chunk = []
            current_length = 0
        current_chunk.append(entry)
        current_length += len(text)
    if current_chunk:
        chunks.append(current_chunk)
    return chunks


# Initialize tokenizer and model
tokenizer = AutoTokenizer.from_pretrained("facebook/bart-large-cnn")
model = AutoModelForSeq2SeqLM.from_pretrained("facebook/bart-large-cnn").to("cuda")


# Modify summarize_chunk to handle batches using PyTorch
def summarize_chunks(batch):
    chunk_texts = [
        ". ".join([entry["text"] for entry in chunk]) for chunk in batch["chunks"]
    ]

    # Tokenize inputs and move to GPU
    inputs = tokenizer(
        chunk_texts,
        padding=True,
        truncation=True,
        return_tensors="pt",
        max_length=1024,  # Adjust max_length as needed
    ).to("cuda")

    # Generate summaries
    with torch.no_grad():
        summary_ids = model.generate(
            inputs["input_ids"],
            attention_mask=inputs["attention_mask"],
            max_length=100,
            min_length=30,
            num_beams=4,  # You can adjust num_beams for faster processing
            no_repeat_ngram_size=3,
        )

    # Decode summaries
    summaries = tokenizer.batch_decode(summary_ids, skip_special_tokens=True)

    results = []
    for i, summary in enumerate(summaries):
        start_time = batch["chunks"][i][0]["seconds"]
        end_time = batch["chunks"][i][-1]["seconds"]
        results.append(
            {
                "start_time": start_time,
                "end_time": end_time,
                "summary": summary,
            }
        )
    return {"events": results}


# Remove the create_event_index function since it's no longer needed
# def create_event_index(transcript, max_events=40):
#     # ...existing code...
#     return sorted(events, key=lambda x: x["start_time"])[:max_events]


# Save event index to JSON
def save_event_index(event_index, output_path):
    with open(output_path, "w", encoding="utf-8") as json_file:
        json.dump(event_index, json_file, indent=4, ensure_ascii=False)


# Main Script
if __name__ == "__main__":
    date = "2023-11-01"
    year, month, day = date.split("-")

    # Load the CSV transcript
    transcript_path = os.path.join(S3_COMM, year, month, day, f"_transcript_{date}.csv")
    with open(transcript_path, "r", encoding="utf-8") as f:
        csv_transcript = f.read()

    # Convert CSV to transcript items
    transcript = csvTranscriptToTranscriptItems(csv_transcript)

    # Create dataset from chunks
    print("Processing transcript with optimized batching...")
    chunks = chunk_transcript(transcript)
    dataset = Dataset.from_dict({"chunks": chunks})

    # Apply summarization using map with batched processing
    event_dataset = dataset.map(
        summarize_chunks,
        batched=True,
        batch_size=8,  # Adjust batch size based on GPU memory
    )

    # Extract the events
    event_index = []
    for events in event_dataset["events"]:
        event_index.extend(events)

    # Limit to max_events
    max_events = 40
    event_index = sorted(event_index, key=lambda x: x["start_time"])[:max_events]

    # Output results
    output_json_path = f"event_index_{date}.json"
    save_event_index(event_index, output_json_path)

    print(f"Event index saved to {output_json_path}")
    print(f"Extracted {len(event_index)} events.")
