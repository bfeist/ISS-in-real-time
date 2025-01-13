import datetime
import requests
from bs4 import BeautifulSoup
import json
import os
import torch  # Added import
import numpy as np  # Added import

from sentence_transformers import SentenceTransformer, util

model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")

SG_RAW_FOLDER = os.getenv("SG_RAW_FOLDER")
S3_FOLDER = os.getenv("S3_FOLDER")


def find_timestamps_for_activity(
    activity_summary, eng_text_utterances, utterance_embeddings
):
    all_matched_timestamps = {}
    min_threshold = 0.2  # Minimum threshold to avoid very low similarity scores
    max_matches = 10  # Optional: limit the number of matches to the top N scores

    for category in activity_summary:
        for activity in activity_summary[category]:
            combined_text = f"{activity['name']} - {activity['description']}"
            print(f"Encoding: {activity['name']}")
            activity_embedding = model.encode(combined_text, convert_to_tensor=True)

            # Step: Compute similarity scores
            utterance_tensor = torch.stack(utterance_embeddings)  # Stack embeddings
            cosine_scores = util.pytorch_cos_sim(activity_embedding, utterance_tensor)[
                0
            ]
            # print("Cosine scores:", cosine_scores.tolist())  # Debug print

            # Step: Analyze score distribution
            mean_score = torch.mean(cosine_scores).item()
            std_score = torch.std(cosine_scores).item()
            print(f"Mean score: {mean_score}, Std score: {std_score}")

            # Step: Decide how many lines to consider a "match"
            # For example, pick the top lines above a dynamic threshold
            threshold = max(
                mean_score + std_score, min_threshold
            )  # Dynamic threshold with minimum
            best_matches_indices = (cosine_scores >= threshold).nonzero(as_tuple=True)[
                0
            ]

            # Optional: limit the number of matches to the top N scores
            if len(best_matches_indices) > max_matches:
                top_indices = torch.topk(cosine_scores, max_matches).indices
                best_matches_indices = top_indices[
                    cosine_scores[top_indices] >= threshold
                ]

            # Sort best_matches_indices based on descending cosine_scores
            sorted_scores, sorted_indices = torch.sort(
                cosine_scores[best_matches_indices], descending=True
            )
            sorted_best_matches_indices = best_matches_indices[sorted_indices]

            # Collect the matching lines and their timestamps
            matched_timestamps = [
                eng_text_utterances[idx]["timestamp"]
                for idx in sorted_best_matches_indices
            ]
            all_matched_timestamps[activity["name"]] = matched_timestamps

            print(f"Matched timestamps: {matched_timestamps}")

    return all_matched_timestamps


def main():
    # ...existing code...
    # model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
    summary_path = os.path.join(
        SG_RAW_FOLDER,
        "activity_summaries",
        "2024",
        "07",
        "activity_summary_2024-07-18.json",
    )
    with open(summary_path, "r") as f:
        activity_summary = json.load(f)

    # Load the transcript
    transcript_path = os.path.join(
        S3_FOLDER, "comm", "2024", "07", "18", "_transcript_2024-07-18.csv"
    )
    with open(transcript_path, "r", encoding="utf-8") as f:
        # read lines of this text file
        full_transcript = f.readlines()

    eng_text_utterances = []
    for line in full_transcript:
        this_line = line.split("|")
        if this_line[4] == "en":
            eng_text_utterances.append(
                {"timestamp": this_line[0], "text": this_line[5]}
            )

    utterance_embeddings = []
    print("Encoding utterances...")
    for line in eng_text_utterances:
        utterance_embeddings.append(
            model.encode(f"{line['text']}", convert_to_tensor=True)
        )

    find_timestamps_for_activity(
        activity_summary, eng_text_utterances, utterance_embeddings
    )


if __name__ == "__main__":
    main()
