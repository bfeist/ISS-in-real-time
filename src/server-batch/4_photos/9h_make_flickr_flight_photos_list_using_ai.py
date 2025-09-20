"""
NASA ISS Photo AI Classification Filter - Pipeline Processing

This script processes filtered Flickr photo albums (created by 9g_filter_against_existing_photos.py)
and uses AI classification to determine whether photos were taken during flight operations (keep)
or are ancillary photos like training, portraits, press events, etc. (exclude).

Uses Ollama API with pipeline processing for optimal performance:
- Processes results as they arrive (streaming)
- Better GPU utilization (no waiting for slow requests)
- Faster feedback (saves every 10 photos)
- Producer-consumer pattern with async queues

Processes all albums ending with _filtered.json from the albums folder.
Saves AI-classified results to albums_categorized_photos folder with _flight and _ancillary suffixes.
"""

import json
import os
import requests
from pathlib import Path
from dotenv import load_dotenv
import sys
from datetime import datetime
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from typing import List, Dict, Any
import multiprocessing as mp
from functools import partial

# Load environment variables
load_dotenv(dotenv_path="../../../.env")

RAW_FOLDER = os.getenv("RAW_FOLDER")
OLLAMA_API_URL = "http://localhost:11434"  # Direct Ollama API endpoint

# Configuration
# Process filtered albums (created by 9g_filter_against_existing_photos.py)
INPUT_FOLDER = (
    os.path.join(RAW_FOLDER, "photos_flickr", "albums") if RAW_FOLDER else None
)
OUTPUT_FOLDER = (
    os.path.join(RAW_FOLDER, "photos_flickr", "albums_categorized_photos")
    if RAW_FOLDER
    else None
)

# Recommended models for RTX 4090 (in order of preference - Updated Sept 2025)
# MODEL_NAME = "qwen3:14b"         # LATEST: Qwen3 series - excellent reasoning & classification
# MODEL_NAME = "qwen3:30b"         # LATEST: Best accuracy, slower but fits RTX 4090
# MODEL_NAME = "qwen3:8b"          # LATEST: Fastest Qwen3 option
# MODEL_NAME = "deepseek-r1:14b"   # Excellent reasoning model
# MODEL_NAME = "gemma3:27b"        # Google's latest, runs on single GPU
# MODEL_NAME = "llama3.3:70b"      # Meta's latest (may need quantization)
# MODEL_NAME = "qwen2.5:14b"       # Previous generation but proven
# MODEL_NAME = "mistral-nemo:12b"  # Good alternative

# MODEL_NAME = "gemma3:27b"  # Using non-reasoning model for better classification
MODEL_NAME = "gpt-oss:20b"  # Open-source GPT-style model with good reasoning

# ============================================================================
# MULTIPROCESSING CONFIGURATION
# ============================================================================
NUM_WORKERS = 3  # Fixed number of worker processes
REQUEST_TIMEOUT = 60  # Request timeout for API calls


def make_ollama_request_full(prompt, model=MODEL_NAME):
    """
    Make a request to Ollama API and return full JSON response

    Args:
        prompt: The text prompt to send
        model: The model to use

    Returns:
        Full JSON response dict or None if error
    """
    try:
        payload = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": 0.2,  # Low temperature for consistent classification
                "top_p": 0.95,
                "top_k": 40,
                "num_predict": -1,  # Let model determine response length for batch processing
                "repeat_penalty": 1.1,
                # GPU optimization parameters
                "num_ctx": 4096,  # Context window size
                "num_batch": 512,  # Batch size for processing
                "num_gpu_layers": -1,  # Use all GPU layers (-1 = auto)
                "num_thread": 8,  # CPU threads for non-GPU parts
                "use_mmap": True,  # Memory mapping for efficiency
                "use_mlock": True,  # Lock memory to prevent swapping
            },
        }

        response = requests.post(
            f"{OLLAMA_API_URL}/api/generate", json=payload, timeout=REQUEST_TIMEOUT
        )

        if response.status_code == 200:
            return response.json()
        else:
            print(f"Ollama API Error: {response.status_code} - {response.text}")
            return None

    except Exception as e:
        print(f"Error making Ollama API request: {e}")
        return None


def make_ollama_request(prompt, model=MODEL_NAME):
    """
    Make a request to Ollama API with GPU-optimized parameters

    Args:
        prompt: The text prompt to send
        model: The model to use (default: gemma3:27b)

    Returns:
        Response text or None if error
    """
    try:
        payload = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": 0.2,  # Low temperature for consistent classification
                "top_p": 0.95,
                "top_k": 40,
                "num_predict": -1,  # Let model determine response length for batch processing
                "repeat_penalty": 1.1,
                # GPU optimization parameters
                "num_ctx": 4096,  # Context window size
                "num_batch": 512,  # Batch size for processing
                "num_gpu_layers": -1,  # Use all GPU layers (-1 = auto)
                "num_thread": 8,  # CPU threads for non-GPU parts
                "use_mmap": True,  # Memory mapping for efficiency
                "use_mlock": True,  # Lock memory to prevent swapping
            },
        }

        response = requests.post(
            f"{OLLAMA_API_URL}/api/generate", json=payload, timeout=REQUEST_TIMEOUT
        )

        if response.status_code == 200:
            result = response.json()
            response_text = result.get("response", "").strip()
            thinking_text = result.get("thinking", "").strip()

            # For thinking models, return both thinking and response
            if thinking_text and response_text:
                # Both thinking and response available - combine them
                full_response = (
                    f"🧠 THINKING:\n{thinking_text}\n\n💡 RESPONSE:\n{response_text}"
                )
                return full_response
            elif response_text:
                return response_text
            elif thinking_text:
                return thinking_text
            else:
                return ""
        else:
            print(f"Ollama API Error: {response.status_code} - {response.text}")
            return None

    except Exception as e:
        print(f"Error making Ollama API request: {e}")
        return None


def queue_worker(photo_queue, result_queue, worker_id):
    """
    Queue-based worker function that processes photos from a shared queue

    Args:
        photo_queue: Queue containing photos to process
        result_queue: Queue to put results into
        worker_id: Unique identifier for this worker
    """
    processed_count = 0
    start_time = time.time()

    while True:
        try:
            # Get next photo from queue
            item = photo_queue.get(timeout=5)  # 5 second timeout
            if item is None:  # Sentinel value - worker should exit
                break

            photo_index, photo = item
            processed_count += 1

            # Process the photo
            result = classify_single_photo((photo_index, photo, worker_id))

            # Add worker statistics to result
            elapsed = time.time() - start_time
            worker_rate = processed_count / elapsed if elapsed > 0 else 0
            result["worker_stats"] = {
                "processed_count": processed_count,
                "worker_rate": worker_rate,
                "elapsed_time": elapsed,
            }

            # Put result in result queue
            result_queue.put(result)

        except Exception as e:
            # Handle errors
            error_result = {
                "classification": "ERROR",
                "confidence": "none",
                "ai_response": f"Queue worker error: {e}",
                "reasoning": "Processing failed",
                "photo_id": "unknown",
                "photo_index": -1,
                "photo": {},
                "worker_id": worker_id,
                "worker_stats": {
                    "processed_count": processed_count,
                    "worker_rate": 0,
                    "elapsed_time": time.time() - start_time,
                },
            }
            result_queue.put(error_result)

    # Worker finished - put final stats
    elapsed = time.time() - start_time
    final_rate = processed_count / elapsed if elapsed > 0 else 0
    print(
        f"   Worker {worker_id} finished: {processed_count} photos in {elapsed:.1f}s ({final_rate:.2f} photos/sec)"
    )


def classify_single_photo(photo_data):
    """
    Worker function to classify a single photo

    Args:
        photo_data: Tuple of (photo_index, photo_dict, worker_id)

    Returns:
        Classification result dictionary
    """
    photo_index, photo, worker_id = photo_data

    try:
        # Build prompt
        title = photo.get("title", "")
        description = photo.get("description", "")
        if isinstance(description, dict):
            description = description.get("_content", "")
        elif description is None:
            description = ""
        tags = photo.get("tags", "")

        prompt = f"""Classify this NASA photo as FLIGHT or ANCILLARY.

FLIGHT = Photos taken during flight operations (keep these photos)
ANCILLARY = Ground-based activities (exclude these photos)

Photo details:
- Title: {title}
- Description: {description}
- Tags: {tags}

Key indicators for FLIGHT (KEEP):
- ANY photo taken "aboard the International Space Station" or "inside the International Space Station"
- ANY photo taken in space. this includes other spacecraft such as Soyuz, Space Shuttle, SpaceX, Starliner, etc.
- ANY photo taken in ISS modules (Unity, Harmony, Kibo, Columbus, Cupola, etc.)
- ANY photo taken of an object in space
- ANY photo taken of the ISS. By definition any photo of the ISS is taken in space
- ANY photo that says "Backdropped" or "backdrop" - NASA frequently uses this term for space photos
- ANY photo "Backdropped against Earth's horizon" or with any backdrop mentioned. This is taken in space.
- ALL Space Shuttle photos - if Space Shuttle is mentioned, it's a FLIGHT photo
- ANY photo with Earth as backdrop, background, or any backdrop/background mentioned
- Portraits, crew photos, group photos taken while in space
- "microgravity", "zero-g"
- ISS experiments, crew activities, spacewalks (EVAs) in space
- Docking operations, spacecraft approaches to the ISS in orbit
- Photos of approaching spacecraft (Space Shuttle, Soyuz, Dragon, etc.) taken FROM the ISS
- Photos showing spacecraft "over Earth" or "against Earth's backdrop" - these are taken FROM the ISS
- If description mentions ISS components (Progress, Soyuz, etc.) "in the foreground", photo is taken FROM the ISS
- Astronauts working, eating, exercising, sleeping inside ISS
- Scientific research, equipment setup aboard ISS
- Spacecraft operations, maintenance aboard the ISS
- Earth photography taken FROM THE ISS (views of Earth from space)
- Photos with tags like "earth", "earth photography", or Earth observation from space
- Views of cities, oceans, weather, aurora, hurricanes from the ISS
- Terminator line photos (day/night boundary) from space


CRITICAL: We only want photography to be classified as FLIGHT, not illustrations or computer renderings
CRITICAL: Earth photography taken FROM THE ISS is considered FLIGHT operations, not ancillary.
CRITICAL: Photos of spacecraft "over Earth" or "approaching the ISS" are typically taken FROM the ISS - classify as FLIGHT
CRITICAL: ANY mention of "backdrop" or "backdropped" = FLIGHT (NASA's standard term for space photography)
CRITICAL: ANY photo with Earth or space as backdrop/background = FLIGHT

Key indicators for ANCILLARY (EXCLUDE - Ground-based activities):
- Training activities on Earth (NBL, pools, simulators)
- Photos in mission control rooms on Earth
- Press events, family photos taken on Earth
- Portraits taken on Earth
- NBL, Neutral Buoyancy Laboratory activities  
- Ceremonies and events on Earth
- ROCKET ASSEMBLY activities at Baikonur Cosmodrome or other launch sites
- LAUNCH PAD operations, rocket rollout, rocket in vertical position
- PRE-LAUNCH activities on Earth (rocket preparation, fueling, etc.)
- LAUNCH operations and rocket launches (these happen on EARTH, not aboard ISS)
- LANDING operations and spacecraft landings (these happen on EARTH, not aboard ISS)
- POST-LANDING activities on Earth (recovery operations, phone calls after landing)
- Activities at Baikonur, Kennedy Space Center, or other Earth-based facilities
- Soyuz capsule on ground, Dragon capsule recovery, parachute landings
- Crew talking to family after landing on Earth
- ANY activity that takes place on Earth's surface
- Ambiguous descriptions with only crew name and affiliation (no space context indicators)

CRITICAL: Launch operations and landing operations are GROUND-BASED activities that happen on EARTH - classify as ANCILLARY.
CRITICAL: Baikonur Cosmodrome, Kennedy Space Center activities are on EARTH - classify as ANCILLARY.
CRITICAL: Post-landing recovery, phone calls, ceremonies on Earth are ANCILLARY.
CRITICAL: If description is ambiguous with only crew name/affiliation and no clear space indicators - classify as ANCILLARY.

Answer with exactly one word: FLIGHT or ANCILLARY"""

        # Make API request and get full response
        full_json = make_ollama_request_full(prompt)
        if full_json:
            response_text = full_json.get("response", "").strip()
            thinking_text = full_json.get("thinking", "").strip()

            # Create detailed AI response for display
            if thinking_text and response_text:
                full_ai_response = (
                    f"🧠 THINKING:\n{thinking_text}\n\n💡 RESPONSE:\n{response_text}"
                )
                # Use just the response for classification processing
                classification_text = response_text
            elif response_text:
                full_ai_response = response_text
                classification_text = response_text
            elif thinking_text:
                full_ai_response = thinking_text
                classification_text = thinking_text
            else:
                full_ai_response = "No response"
                classification_text = ""
        else:
            full_ai_response = "API request failed"
            classification_text = ""

        result = process_classification_response(classification_text)

        # Add metadata
        result["photo_id"] = photo.get("id", "unknown")
        result["photo_index"] = photo_index
        result["photo"] = photo
        result["worker_id"] = worker_id
        result["ai_response"] = full_ai_response
        result["thinking"] = thinking_text if full_json else ""
        result["response"] = response_text if full_json else ""

        return result

    except Exception as e:
        error_result = {
            "classification": "ERROR",
            "confidence": "none",
            "ai_response": f"Processing error: {e}",
            "reasoning": "Failed to process",
            "photo_id": photo.get("id", "unknown"),
            "photo_index": photo_index,
            "photo": photo,
            "worker_id": worker_id,
        }
        return error_result


def classify_photos_multiprocessing(
    photos_list: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Queue-based multiprocessing photo classification with NUM_WORKERS workers
    This provides better resume functionality as workers pull photos from a shared queue

    Args:
        photos_list: List of photo dictionaries to classify

    Returns:
        List of all classification results
    """
    if not photos_list:
        return []

    # Create queues for communication
    photo_queue = mp.Queue()
    result_queue = mp.Queue()

    # Add all photos to the queue with their index
    for i, photo in enumerate(photos_list):
        photo_queue.put((i, photo))

    # Add sentinel values to signal workers to stop
    for _ in range(NUM_WORKERS):
        photo_queue.put(None)

    # Start worker processes
    processes = []
    for worker_id in range(NUM_WORKERS):
        p = mp.Process(target=queue_worker, args=(photo_queue, result_queue, worker_id))
        p.start()
        processes.append(p)

    # Collect results
    results = []
    for _ in range(len(photos_list)):
        try:
            result = result_queue.get(timeout=30)
            results.append(result)
        except Exception as e:
            print(f"Error getting result: {e}")
            break

    # Wait for all processes to finish
    for p in processes:
        p.join(timeout=10)
        if p.is_alive():
            p.terminate()
            p.join()

    # Sort results by photo_index to maintain order
    results.sort(key=lambda x: x.get("photo_index", 0))

    return results


def process_classification_response(response: str) -> Dict[str, Any]:
    """
    Process AI response and extract classification with confidence

    Args:
        response: Raw AI response string

    Returns:
        Dict with classification, confidence, and reasoning
    """
    if not response:
        return {
            "classification": "ERROR",
            "confidence": "none",
            "ai_response": "No response",
            "reasoning": "API request failed",
        }

    # Clean response - remove thinking tags and extra text
    clean_response = response.replace("<think>", "").replace("</think>", "").strip()

    # Extract classification from response
    response_upper = clean_response.upper()

    # Look for clear indicators
    flight_indicators = [
        "FLIGHT",
        "SPACE OPERATION",
        "ORBITAL",
        "MICROGRAVITY",
        "ZERO-G",
        "EXPERIMENT",
        "RESEARCH",
        "MAINTENANCE",
        "EARTH",
        "EARTH PHOTOGRAPHY",
        "CITY",
        "OCEAN",
        "LANDSCAPE",
        "PHOTOGRAPHY",
        "LIGHTS",
        "WEATHER",
        "AURORA",
        "HURRICANE",
        "TERMINATOR",
        "LAUNCH",
        "ROCKET",
        "SPACECRAFT",
        "SOYUZ",
        "DRAGON",
        "PROGRESS",
        "LANDING",
        "SPLASHDOWN",
    ]
    ancillary_indicators = [
        "ANCILLARY",
        "TRAINING",
        "NBL",
        "NEUTRAL BUOYANCY",
        "BUOYANCY LABORATORY",
        "UNDERWATER",
        "POOL",
        "SIMULATOR",
    ]

    flight_score = sum(
        1 for indicator in flight_indicators if indicator in response_upper
    )
    ancillary_score = sum(
        1 for indicator in ancillary_indicators if indicator in response_upper
    )

    # Determine confidence based on response clarity and content
    if clean_response.strip() == "FLIGHT":
        classification = "FLIGHT"
        confidence = "high"  # Clean, direct response
    elif clean_response.strip() == "ANCILLARY":
        classification = "ANCILLARY"
        confidence = "high"  # Clean, direct response
    elif flight_score > ancillary_score:
        classification = "FLIGHT"
        confidence = "medium" if flight_score == 1 else "high"
    elif ancillary_score > flight_score:
        classification = "ANCILLARY"
        confidence = "medium" if ancillary_score == 1 else "high"
    else:
        # Try last word or simple parsing
        words = clean_response.split()
        if words:
            last_word = words[-1].upper()
            if "FLIGHT" in last_word:
                classification = "FLIGHT"
                confidence = "low"  # Had to parse from longer response
            elif "ANCILLARY" in last_word:
                classification = "ANCILLARY"
                confidence = "low"  # Had to parse from longer response
            else:
                classification = "UNKNOWN"
                confidence = "none"
        else:
            classification = "UNKNOWN"
            confidence = "none"

    return {
        "classification": classification,
        "confidence": confidence,
        "ai_response": response,
        "reasoning": response,
    }


def classify_photo_description(description, title="", tags=""):
    """
    Legacy single-photo classification function - kept for backward compatibility
    Uses multiprocessing for single photo

    Args:
        description: Photo description text
        title: Photo title (optional)
        tags: Photo tags (optional)

    Returns:
        dict with classification result
    """
    # Use multiprocessing for single photo
    photo = {"id": "single", "title": title, "description": description, "tags": tags}

    try:
        results = classify_photos_multiprocessing([photo])

        if results:
            result = results[0]
            # Remove photo_id and multiprocessing-specific fields for backward compatibility
            result.pop("photo_id", None)
            result.pop("photo_index", None)
            result.pop("photo", None)
            result.pop("worker_id", None)
            return result
        else:
            return {
                "classification": "ERROR",
                "confidence": "none",
                "ai_response": "Multiprocessing failed",
                "reasoning": "Could not connect to AI model",
            }
    except Exception as e:
        return {
            "classification": "ERROR",
            "confidence": "none",
            "ai_response": f"Processing error: {e}",
            "reasoning": "Processing failed",
        }


def find_filtered_albums():
    """
    Find all filtered album JSON files (ending with _filtered.json)
    These are created by 9g_filter_against_existing_photos.py

    Returns:
        List of filtered album file paths or empty list if none found
    """
    if not INPUT_FOLDER or not os.path.exists(INPUT_FOLDER):
        print(f"❌ Input folder not found: {INPUT_FOLDER}")
        return []

    try:
        # Get all _filtered.json files in the albums folder
        filtered_files = [
            os.path.join(INPUT_FOLDER, f)
            for f in os.listdir(INPUT_FOLDER)
            if f.endswith("_filtered.json")
        ]

        # Sort in reverse alphabetical order
        filtered_files.sort(reverse=True)

        print(f"✅ Found {len(filtered_files)} filtered album files")
        return filtered_files

    except Exception as e:
        print(f"❌ Error scanning albums folder: {e}")
        return []


def load_photoset_from_file(file_path):
    """
    Load photoset data from a specific JSON file

    Args:
        file_path: Path to the JSON file

    Returns:
        Photoset data or None if error
    """
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        filename = os.path.basename(file_path)
        total_photos = len(data.get("photos", []))
        print(f"✅ Loaded album: {filename} ({total_photos} photos)")
        return data

    except Exception as e:
        print(f"❌ Error loading {file_path}: {e}")
        return None


def save_filtered_albums(
    photoset_data,
    original_filename,
    flight_photos,
    ancillary_photos,
    flight_count,
    ancillary_count,
    error_count,
):
    """
    Save both flight and ancillary photoset data to albums_categorized_photos folder

    Args:
        photoset_data: Original photoset data
        original_filename: Original filtered filename (e.g., "album_filtered.json")
        flight_photos: List of photos classified as FLIGHT
        ancillary_photos: List of photos classified as ANCILLARY
        flight_count: Number of flight photos
        ancillary_count: Number of ancillary photos
        error_count: Number of classification errors

    Returns:
        True if successful, False otherwise
    """
    if not OUTPUT_FOLDER:
        print("❌ Output folder not configured")
        return False

    # Create output directory if it doesn't exist
    os.makedirs(OUTPUT_FOLDER, exist_ok=True)

    # Extract base name from filtered filename
    name_part, ext = os.path.splitext(original_filename)
    if name_part.endswith("_filtered"):
        base_name = name_part[:-9]  # Remove "_filtered" suffix
    else:
        base_name = name_part

    # Common metadata
    base_metadata = {
        "filtered_at": datetime.now().isoformat(),
        "original_photo_count": len(photoset_data.get("photos", [])),
        "flight_photos": flight_count,
        "ancillary_photos": ancillary_count,
        "error_photos": error_count,
        "ai_model": MODEL_NAME,
        "original_file": original_filename,
    }

    success = True

    # Save flight photos
    flight_filename = f"{base_name}_flight{ext}"
    flight_path = os.path.join(OUTPUT_FOLDER, flight_filename)

    flight_data = photoset_data.copy()
    flight_data["photos"] = flight_photos

    if "metadata" not in flight_data:
        flight_data["metadata"] = {}

    flight_data["metadata"].update(base_metadata)
    flight_data["metadata"].update(
        {
            "filtered_photo_count": len(flight_photos),
            "filter_criteria": "FLIGHT operations only - photos taken aboard the ISS during flight operations",
            "file_type": "flight",
        }
    )

    try:
        with open(flight_path, "w", encoding="utf-8") as f:
            json.dump(flight_data, f, indent=2, ensure_ascii=False)
        print(f"✅ Saved flight album: {flight_filename}")
    except Exception as e:
        print(f"❌ Error saving flight album: {e}")
        success = False

    # Save ancillary photos
    ancillary_filename = f"{base_name}_ancillary{ext}"
    ancillary_path = os.path.join(OUTPUT_FOLDER, ancillary_filename)

    ancillary_data = photoset_data.copy()
    ancillary_data["photos"] = ancillary_photos

    if "metadata" not in ancillary_data:
        ancillary_data["metadata"] = {}

    ancillary_data["metadata"].update(base_metadata)
    ancillary_data["metadata"].update(
        {
            "filtered_photo_count": len(ancillary_photos),
            "filter_criteria": "ANCILLARY photos - Earth photography and ground-based activities",
            "file_type": "ancillary",
        }
    )

    try:
        with open(ancillary_path, "w", encoding="utf-8") as f:
            json.dump(ancillary_data, f, indent=2, ensure_ascii=False)
        print(f"✅ Saved ancillary album: {ancillary_filename}")
    except Exception as e:
        print(f"❌ Error saving ancillary album: {e}")
        success = False

    return success


def process_album(file_path):
    """
    Process a single album file using pipeline approach for better performance
    Processes results as they arrive instead of waiting for entire batches

    Args:
        file_path: Path to the album JSON file

    Returns:
        dict with processing results or None if error
    """
    filename = os.path.basename(file_path)

    # Extract base name from filtered filename (remove _filtered suffix)
    name_part, ext = os.path.splitext(filename)
    if name_part.endswith("_filtered"):
        base_name = name_part[:-9]  # Remove "_filtered" suffix
    else:
        base_name = name_part

    # Create output filenames based on the base name
    flight_filename = f"{base_name}_flight{ext}"
    ancillary_filename = f"{base_name}_ancillary{ext}"
    flight_path = (
        os.path.join(OUTPUT_FOLDER, flight_filename) if OUTPUT_FOLDER else None
    )
    ancillary_path = (
        os.path.join(OUTPUT_FOLDER, ancillary_filename) if OUTPUT_FOLDER else None
    )

    # Load existing data if it exists
    existing_processed_ids = set()
    existing_flight_photos = []
    existing_ancillary_photos = []
    existing_stats = {"flight": 0, "ancillary": 0, "errors": 0}

    # Load existing flight photos
    if flight_path and os.path.exists(flight_path):
        try:
            with open(flight_path, "r", encoding="utf-8") as f:
                flight_data = json.load(f)
            existing_flight_photos = flight_data.get("photos", [])
            for photo in existing_flight_photos:
                existing_processed_ids.add(photo.get("id"))
                existing_stats["flight"] += 1
            print(
                f"📂 Found existing flight file: {flight_filename} ({len(existing_flight_photos)} photos)"
            )
        except Exception as e:
            print(f"⚠️  Could not load existing flight file: {e}")

    # Load existing ancillary photos
    if ancillary_path and os.path.exists(ancillary_path):
        try:
            with open(ancillary_path, "r", encoding="utf-8") as f:
                ancillary_data = json.load(f)
            existing_ancillary_photos = ancillary_data.get("photos", [])
            for photo in existing_ancillary_photos:
                existing_processed_ids.add(photo.get("id"))
                existing_stats["ancillary"] += 1
            print(
                f"📂 Found existing ancillary file: {ancillary_filename} ({len(existing_ancillary_photos)} photos)"
            )
        except Exception as e:
            print(f"⚠️  Could not load existing ancillary file: {e}")

    if existing_processed_ids:
        print(f"   Total already processed: {len(existing_processed_ids)} photos")
        print(
            f"   Existing: {existing_stats['flight']} FLIGHT, {existing_stats['ancillary']} ANCILLARY, {existing_stats['errors']} ERRORS"
        )

    # Load original photoset data
    photoset_data = load_photoset_from_file(file_path)
    if not photoset_data or "photos" not in photoset_data:
        return {
            "status": "error",
            "filename": filename,
            "error": "Could not load photoset data",
        }

    all_photos = photoset_data["photos"]

    # Filter out already processed photos
    photos_to_process = [
        photo for photo in all_photos if photo.get("id") not in existing_processed_ids
    ]

    total_photos = len(all_photos)
    already_processed = len(existing_processed_ids)
    to_process = len(photos_to_process)

    print(f"\n📸 Filtered Album: {filename}")
    print(f"   Total photos in filtered album: {total_photos}")
    print(f"   Already AI-classified: {already_processed}")
    print(f"   Remaining to classify: {to_process}")

    if to_process == 0:
        print(f"✅ All photos already processed - skipping album")
        return {
            "status": "completed",
            "filename": filename,
            "original_count": total_photos,
            "flight_count": existing_stats["flight"],
            "ancillary_count": existing_stats["ancillary"],
            "error_count": existing_stats["errors"],
        }

    # Track results for new processing
    new_flight_photos = []
    new_ancillary_photos = []
    new_flight_count = 0
    new_ancillary_count = 0
    new_error_count = 0

    # Save frequency - save after every N completed photos
    SAVE_FREQUENCY = 10  # Save every 10 photos for faster feedback
    last_save_count = 0

    print(f"   🚀 Processing photos with pipeline approach (streaming results)...")
    start_time = time.time()

    def save_result(result):
        """Called immediately when each photo is processed"""
        nonlocal new_flight_count, new_ancillary_count, new_error_count
        nonlocal new_flight_photos, new_ancillary_photos, last_save_count

        classification = result.get("classification", "ERROR")
        photo = result.get("photo", {})

        # Add classification to photo metadata (without circular reference)
        photo["ai_classification"] = {
            "classification": result.get("classification", "ERROR"),
            "confidence": result.get("confidence", "none"),
            "ai_response": result.get("ai_response", ""),
            "reasoning": result.get("reasoning", ""),
            "photo_id": result.get("photo_id", "unknown"),
        }

        # Add to appropriate list
        if classification == "FLIGHT":
            new_flight_photos.append(photo)
            new_flight_count += 1
        elif classification == "ANCILLARY":
            new_ancillary_photos.append(photo)
            new_ancillary_count += 1
        else:
            new_error_count += 1

        # Save periodically for progress updates
        total_completed = new_flight_count + new_ancillary_count + new_error_count
        if total_completed - last_save_count >= SAVE_FREQUENCY:
            all_flight_photos = existing_flight_photos + new_flight_photos
            all_ancillary_photos = existing_ancillary_photos + new_ancillary_photos
            total_flight_count = existing_stats["flight"] + new_flight_count
            total_ancillary_count = existing_stats["ancillary"] + new_ancillary_count
            total_error_count = existing_stats["errors"] + new_error_count

            save_filtered_albums(
                photoset_data,
                filename,
                all_flight_photos,
                all_ancillary_photos,
                total_flight_count,
                total_ancillary_count,
                total_error_count,
            )
            last_save_count = total_completed
            print(
                f"   💾 Saved progress: {already_processed + total_completed}/{total_photos} photos processed"
            )

    # Run multiprocessing with streaming results
    try:
        print(f"   🚀 Processing {to_process} photos with {NUM_WORKERS} workers...")

        # Track processing statistics
        worker_stats = {}
        for i in range(NUM_WORKERS):
            worker_stats[i] = {"processed": 0, "start_time": time.time()}

        # Create a queue-based system for better resume functionality
        # Workers pull photos one at a time from the queue
        photo_queue = mp.Queue()
        result_queue = mp.Queue()

        # Add all photos to the queue with their index
        for i, photo in enumerate(photos_to_process):
            photo_queue.put((i, photo))

        # Add sentinel values to signal workers to stop
        for _ in range(NUM_WORKERS):
            photo_queue.put(None)

        results = []
        completed_count = 0

        # Start worker processes
        processes = []
        for worker_id in range(NUM_WORKERS):
            p = mp.Process(
                target=queue_worker, args=(photo_queue, result_queue, worker_id)
            )
            p.start()
            processes.append(p)

        # Process results as they come in (streaming)
        while completed_count < len(photos_to_process):
            try:
                result = result_queue.get(timeout=30)  # 30 second timeout
                if result is None:  # Error signal
                    break

                results.append(result)
                completed_count += 1

                # Process each result immediately as it completes
                save_result(result)

                # Update worker statistics
                worker_id = result.get("worker_id", 0)
                if worker_id in worker_stats:
                    worker_stats[worker_id]["processed"] += 1

                # Show progress for each photo as it completes
                classification = result.get("classification", "ERROR")
                confidence = result.get("confidence", "none")
                photo_id = result.get("photo_id", "unknown")
                ai_response = result.get("ai_response", "")

                # Show classification result
                if classification == "FLIGHT":
                    status_icon = "✅"
                elif classification == "ANCILLARY":
                    status_icon = "🚫"
                else:
                    status_icon = "❓"

                # Get photo details for context
                photo = result.get("photo", {})
                title = photo.get("title", "No title")
                description = photo.get("description", "")
                if isinstance(description, dict):
                    description = description.get("_content", "")
                elif description is None:
                    description = ""
                tags = photo.get("tags", "")

                current_num = already_processed + completed_count

                # Calculate current processing speed
                elapsed = time.time() - start_time
                current_rate = completed_count / elapsed if elapsed > 0 else 0

                # Get worker stats if available
                worker_stats_info = result.get("worker_stats", {})
                worker_rate = worker_stats_info.get("worker_rate", 0)
                worker_processed = worker_stats_info.get("processed_count", 0)

                print(f"\n" + "=" * 80)
                print(f"📁 ALBUM: {base_name}")
                print(f"📷 PHOTO {current_num}/{total_photos} - ID: {photo_id}")
                print(f"   Title: {title}")
                print(
                    f"   Description: {description[:200]}{'...' if len(description) > 200 else ''}"
                )
                print(f"   Tags: {tags}")
                print(f"\n🤖 FULL AI RESPONSE:")
                print(f"   {ai_response}")
                print(
                    f"\n🎯 CLASSIFICATION: {status_icon} {classification} (confidence: {confidence})"
                )
                print(
                    f"👷 Worker ID: {worker_id} (processed {worker_processed} photos at {worker_rate:.2f} photos/sec)"
                )
                print(
                    f"⚡ Overall Speed: {current_rate:.2f} photos/sec ({completed_count}/{to_process} completed)"
                )

            except Exception as e:
                print(f"❌ Error getting result from queue: {e}")
                break

        # Wait for all worker processes to finish
        for p in processes:
            p.join(timeout=10)
            if p.is_alive():
                print(f"⚠️ Force terminating worker process {p.pid}")
                p.terminate()
                p.join()

        # Calculate and display final worker statistics
        elapsed_total = time.time() - start_time
        total_processed = len(results)
        overall_rate = total_processed / elapsed_total if elapsed_total > 0 else 0

        print(f"\n📊 WORKER STATISTICS:")
        for worker_id, stats in worker_stats.items():
            worker_processed = stats["processed"]
            if worker_processed > 0:
                worker_rate = (
                    worker_processed / elapsed_total if elapsed_total > 0 else 0
                )
                print(
                    f"   Worker {worker_id}: {worker_processed} photos ({worker_rate:.2f} photos/sec)"
                )

        print(
            f"⚡ COMBINED RATE: {overall_rate:.2f} photos/sec across {NUM_WORKERS} workers"
        )

    except Exception as e:
        print(f"   ❌ Multiprocessing failed: {e}")
        return {
            "status": "error",
            "filename": filename,
            "error": f"Multiprocessing failed: {e}",
        }

    # Final save and return results
    all_flight_photos = existing_flight_photos + new_flight_photos
    all_ancillary_photos = existing_ancillary_photos + new_ancillary_photos
    total_flight_count = existing_stats["flight"] + new_flight_count
    total_ancillary_count = existing_stats["ancillary"] + new_ancillary_count
    total_error_count = existing_stats["errors"] + new_error_count

    if save_filtered_albums(
        photoset_data,
        filename,
        all_flight_photos,
        all_ancillary_photos,
        total_flight_count,
        total_ancillary_count,
        total_error_count,
    ):
        elapsed_total = time.time() - start_time
        avg_photos_per_sec = to_process / elapsed_total if elapsed_total > 0 else 0

        print(f"\n🏁 PROCESSING COMPLETE")
        print(f"   ⏱️  Total time: {elapsed_total:.1f}s")
        print(
            f"   ⚡ Overall rate: {avg_photos_per_sec:.2f} photos/sec across {NUM_WORKERS} workers"
        )
        print(f"   📸 New photos processed: {to_process}")
        print(
            f"   ✅ FLIGHT: {new_flight_count}, 🚫 ANCILLARY: {new_ancillary_count}, ❓ ERRORS: {new_error_count}"
        )

        return {
            "status": "success",
            "filename": filename,
            "original_count": total_photos,
            "flight_count": total_flight_count,
            "ancillary_count": total_ancillary_count,
            "error_count": total_error_count,
            "new_processed": to_process,
            "processing_time": elapsed_total,
            "photos_per_second": avg_photos_per_sec,
        }
    else:
        return {
            "status": "error",
            "filename": filename,
            "error": "Failed to save final filtered results",
        }


def batch_process_albums():
    """
    Process all matching album files using multiprocessing approach
    Enhanced with 4-worker processing and cross-worker statistics
    """
    print(f"NASA ISS Photo Classification - Multiprocessing ({NUM_WORKERS} Workers)")
    print("=" * 60)

    # Check API connectivity
    print(f"Testing connection to Ollama API...")
    print(f"  Ollama API: {OLLAMA_API_URL}")
    print(f"  Model: {MODEL_NAME}")
    print(f"  Workers: {NUM_WORKERS}")

    test_response = make_ollama_request("Hello", MODEL_NAME)
    if not test_response:
        print(f"❌ Cannot connect to Ollama API")
        print("Please ensure Ollama is running and model is available")
        print("\nTips for setup:")
        print(f"  1. Make sure {MODEL_NAME} is loaded: ollama pull {MODEL_NAME}")
        print("  2. Check GPU memory: nvidia-smi")
        print("  3. Restart Ollama if needed: ollama serve")
        return False
    else:
        print(f"✅ API connection successful")
        print(f"✅ Using model: {MODEL_NAME}")
        print(f"✅ Multiprocessing enabled with {NUM_WORKERS} workers")

    # Find filtered albums
    album_files = find_filtered_albums()
    if not album_files:
        print("❌ No filtered album files found")
        print(
            "   Please run 9g_filter_against_existing_photos.py first to create filtered albums"
        )
        return False

    print(f"\n📁 Found {len(album_files)} filtered albums to process")
    print(f"📁 Input folder (filtered albums): {INPUT_FOLDER}")
    print(f"📁 Output folder (AI classified): {OUTPUT_FOLDER}")

    # Process each album
    results = {
        "success": 0,
        "skipped": 0,
        "errors": 0,
        "total_photos": 0,
        "total_flight": 0,
        "total_ancillary": 0,
        "total_errors": 0,
        "total_processing_time": 0.0,
        "total_photos_per_second": 0.0,
    }

    for i, file_path in enumerate(album_files, 1):
        filename = os.path.basename(file_path)
        print(f"\n[{i}/{len(album_files)}] Processing: {filename}")

        try:
            # Use pipeline processing for all albums
            result = process_album(file_path)

            if result["status"] == "success":
                results["success"] += 1
                results["total_photos"] += result["original_count"]
                results["total_flight"] += result["flight_count"]
                results["total_ancillary"] += result["ancillary_count"]
                results["total_errors"] += result["error_count"]

                new_processed = result.get("new_processed", 0)
                processing_time = result.get("processing_time", 0)
                photos_per_second = result.get("photos_per_second", 0)
                results["total_processing_time"] += processing_time

                success_msg = f"   ✅ Success: {result['flight_count']} FLIGHT, {result['ancillary_count']} ANCILLARY, {result['error_count']} ERRORS (new: {new_processed})"
                if processing_time > 0:
                    success_msg += f" [{photos_per_second:.1f} photos/sec]"
                print(success_msg)

            elif result["status"] == "completed":
                results["success"] += 1
                results["total_photos"] += result["original_count"]
                results["total_flight"] += result["flight_count"]
                results["total_ancillary"] += result["ancillary_count"]
                results["total_errors"] += result["error_count"]

                print(
                    f"   ✅ Already completed: {result['flight_count']} FLIGHT, {result['ancillary_count']} ANCILLARY, {result['error_count']} ERRORS"
                )

            elif result["status"] == "skipped":
                results["skipped"] += 1

            else:
                results["errors"] += 1
                print(f"   ❌ Error: {result.get('error', 'Unknown error')}")

        except KeyboardInterrupt:
            print(f"\n⏸️  Process interrupted by user at album {i}/{len(album_files)}")
            break
        except Exception as e:
            results["errors"] += 1
            print(f"   ❌ Unexpected error: {e}")

    # Final summary
    print(f"\n" + "=" * 60)
    print(f"🏁 BATCH PROCESSING COMPLETE")
    print(f"📊 Albums processed: {results['success']}")
    print(f"⏭️  Albums skipped: {results['skipped']}")
    print(f"❌ Albums failed: {results['errors']}")
    print(f"📸 Total photos processed: {results['total_photos']}")
    print(f"✅ FLIGHT photos (kept): {results['total_flight']}")
    print(f"🚫 ANCILLARY photos (excluded): {results['total_ancillary']}")
    print(f"❓ Classification errors: {results['total_errors']}")

    if results["total_photos"] > 0:
        flight_percentage = (results["total_flight"] / results["total_photos"]) * 100
        print(f"📈 Flight photo percentage: {flight_percentage:.1f}%")

        # Show performance summary
        if results["total_processing_time"] > 0:
            avg_photos_per_sec = (
                results["total_photos"] / results["total_processing_time"]
            )
            print(f"⚡ OVERALL PROCESSING SPEED: {avg_photos_per_sec:.2f} photos/sec")
            print(f"   👷 {NUM_WORKERS} workers processing in parallel")
            print(
                f"   ⏱️  Total processing time: {results['total_processing_time']:.1f}s"
            )
            print(f"   📸 Total photos processed: {results['total_photos']}")

    print(f"\n📁 Filtered albums saved to: {OUTPUT_FOLDER}")
    print(f"🔧 Processing mode: Multiprocessing ({NUM_WORKERS} workers)")

    return True


# Pipeline processing only - old batch processing removed for cleaner, faster code


def main():
    """
    Main function for multiprocessing filtered NASA ISS photo albums
    """
    print("NASA ISS Photo AI Classification - Multiprocessing Processor")
    print(
        "Processing filtered albums (created by 9g_filter_against_existing_photos.py)"
    )
    print(
        f"Using Ollama API with {NUM_WORKERS} worker processes for optimal performance"
    )
    print(f"Ollama API: {OLLAMA_API_URL}")
    print(f"Model: {MODEL_NAME}")

    # Check configuration
    if not RAW_FOLDER:
        print("❌ RAW_FOLDER environment variable not found")
        sys.exit(1)

    if not INPUT_FOLDER or not os.path.exists(INPUT_FOLDER):
        print(f"❌ Input folder not found: {INPUT_FOLDER}")
        sys.exit(1)

    success = batch_process_albums()

    if success:
        print(f"\n✅ AI classification completed!")
        print(f"\nAI-classified albums are saved in: {OUTPUT_FOLDER}")
        print(f"_flight.json files contain FLIGHT photos (ISS operations)")
        print(
            f"_ancillary.json files contain ANCILLARY photos (ground activities, training)"
        )
    else:
        print(
            f"\n❌ AI classification failed. Please check configuration and try again."
        )


if __name__ == "__main__":
    # Enable multiprocessing on Windows
    mp.set_start_method("spawn", force=True)
    main()
