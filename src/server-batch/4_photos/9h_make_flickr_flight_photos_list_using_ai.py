"""
NASA ISS Photo AI Classification Filter

This script processes filtered Flickr photo albums (created by 9g_filter_against_existing_photos.py)
and uses AI classification to determine whether photos were taken during flight operations (keep)
or are ancillary photos like training, portraits, press events, etc. (exclude).

Uses OpenWebUI/Ollama API to classify photos based on their descriptions.

Processes all albums ending with _filtered.json from the albums folder.
Saves AI-classified results to albums_filtered folder with _flight and _ancillary suffixes.
"""

import json
import os
import requests
from pathlib import Path
from dotenv import load_dotenv
import sys
from datetime import datetime
import asyncio
import aiohttp
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Any

# Load environment variables
load_dotenv(dotenv_path="../../../.env")

RAW_FOLDER = os.getenv("RAW_FOLDER")
OPENWEBUI_URL = "http://localhost:1010"  # OpenWebUI endpoint
OLLAMA_DIRECT_URL = "http://localhost:11434"  # Direct Ollama API endpoint
OLLAMA_API_URL = f"{OPENWEBUI_URL}/ollama/api"

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

MODEL_NAME = "gemma3:27b"  # Using non-reasoning model for better classification

# ============================================================================
# GPU OPTIMIZATION SETTINGS - ADJUST THESE FOR YOUR HARDWARE
# ============================================================================
# For RTX 4090 with 24GB VRAM running Gemma 3:27B (~16GB model)
INITIAL_GPU_BATCH_SIZE = 16  # Starting batch size - back to concurrent processing
MIN_BATCH_SIZE = 4  # Minimum batch size (prevent over-optimization to size 1)
MAX_BATCH_SIZE = 32  # Maximum batch size (back to original)
MAX_CONCURRENT_REQUESTS = 32  # Maximum concurrent API requests

# For RTX 3090 or lower-end cards, consider:
# INITIAL_GPU_BATCH_SIZE = 4
# MAX_BATCH_SIZE = 8

# For RTX 4070/4080:
# INITIAL_GPU_BATCH_SIZE = 6
# MAX_BATCH_SIZE = 12

REQUEST_TIMEOUT = 60  # Increased timeout for batch processing

# Performance tracking for dynamic adjustment
GPU_BATCH_SIZE = INITIAL_GPU_BATCH_SIZE  # Will be adjusted during processing


def make_ollama_request(prompt, model=MODEL_NAME):
    """
    Make a request to Ollama API - try direct connection first, then OpenWebUI
    Optimized for GPU efficiency with better parameters

    Args:
        prompt: The text prompt to send
        model: The model to use (default: gemma3:27b)

    Returns:
        Response text or None if error
    """
    # Try direct Ollama API first with GPU-optimized parameters
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
            f"{OLLAMA_DIRECT_URL}/api/generate", json=payload, timeout=REQUEST_TIMEOUT
        )

        if response.status_code == 200:
            result = response.json()
            return result.get("response", "").strip()

    except Exception as e:
        print(f"Direct Ollama API failed: {e}")

    # Try via OpenWebUI if direct failed
    try:
        payload = {
            "model": model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": 0.2,  # Low temperature for consistent classification
                "top_p": 0.95,
                "max_tokens": 500,  # Longer response for batch processing
                "num_ctx": 4096,
                "num_batch": 512,
                "num_gpu_layers": -1,
            },
        }

        response = requests.post(
            f"{OLLAMA_API_URL}/generate", json=payload, timeout=REQUEST_TIMEOUT
        )

        if response.status_code == 200:
            result = response.json()
            return result.get("response", "").strip()
        else:
            print(f"OpenWebUI API Error: {response.status_code} - {response.text}")
            return None

    except Exception as e:
        print(f"Error making OpenWebUI API request: {e}")
        return None


async def make_ollama_request_async(session, prompt, model=MODEL_NAME):
    """
    Async version of Ollama API request for concurrent processing

    Args:
        session: aiohttp ClientSession
        prompt: The text prompt to send
        model: The model to use

    Returns:
        Response text or None if error
    """
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": 0.2,
            "top_p": 0.95,
            "top_k": 40,
            "num_predict": 30,
            "repeat_penalty": 1.1,
            "num_ctx": 4096,
            "num_batch": 512,
            "num_gpu_layers": -1,
            "num_thread": 8,
            "use_mmap": True,
            "use_mlock": True,
        },
    }

    try:
        async with session.post(
            f"{OLLAMA_DIRECT_URL}/api/generate",
            json=payload,
            timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT),
        ) as response:
            if response.status == 200:
                result = await response.json()
                return result.get("response", "").strip()
            else:
                print(f"Async API Error: {response.status}")
                return None
    except Exception as e:
        print(f"Async API request failed: {e}")
        return None


def classify_photos_batch(photos_batch: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Classify a batch of photos concurrently for better GPU utilization
    REVERTED: Back to original concurrent approach for better speed

    Args:
        photos_batch: List of photo dictionaries with id, title, description, tags

    Returns:
        List of classification results in same order as input
    """

    async def classify_batch_async():
        # Create semaphore to limit concurrent requests
        semaphore = asyncio.Semaphore(MAX_CONCURRENT_REQUESTS)

        async def classify_single_photo(session, photo):
            async with semaphore:  # Limit concurrent requests
                title = photo.get("title", "")
                description = photo.get("description", "")
                if isinstance(description, dict):
                    description = description.get("_content", "")
                elif description is None:
                    description = ""
                tags = photo.get("tags", "")

                # Create prompt for this photo
                prompt = f"""Classify this NASA ISS photo as FLIGHT or ANCILLARY.

FLIGHT = Photos taken aboard the ISS during flight operations (keep these photos)
ANCILLARY = Ground-based activities (exclude these photos)

Photo details:
- Title: {title}
- Description: {description}
- Tags: {tags}

Key indicators for FLIGHT (KEEP):
- ANY photo taken "aboard the International Space Station" or "inside the International Space Station"
- ANY photo taken in ISS modules (Unity, Harmony, Kibo, Columbus, Cupola, etc.)
- Portraits, crew photos, group photos taken INSIDE the ISS
- "microgravity", "zero-g"
- ISS experiments, crew activities, spacewalks (EVAs) in space
- Docking operations, spacecraft approaches to the ISS in orbit
- Astronauts working, eating, exercising, sleeping inside ISS
- Scientific research, equipment setup aboard ISS
- Spacecraft operations, maintenance aboard the ISS
- Earth photography taken FROM THE ISS (views of Earth from space)
- Photos with tags like "earth", "earth photography", or Earth observation from space
- Views of cities, oceans, weather, aurora, hurricanes from the ISS
- Terminator line photos (day/night boundary) from space

CRITICAL: If the description mentions any ISS location or "aboard/inside the International Space Station", classify as FLIGHT regardless of whether it's a portrait.
CRITICAL: Earth photography taken FROM THE ISS is considered FLIGHT operations, not ancillary.

Key indicators for ANCILLARY (EXCLUDE - Ground-based activities):
- Training activities on Earth (NBL, pools, simulators)
- Press events, family photos taken on Earth
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

CRITICAL: Launch operations and landing operations are GROUND-BASED activities that happen on EARTH - classify as ANCILLARY.
CRITICAL: Baikonur Cosmodrome, Kennedy Space Center activities are on EARTH - classify as ANCILLARY.
CRITICAL: Post-landing recovery, phone calls, ceremonies on Earth are ANCILLARY.

Answer with exactly one word: FLIGHT or ANCILLARY"""

                try:
                    response = await make_ollama_request_async(session, prompt)
                    result = process_classification_response(response)
                    result["photo_id"] = photo.get("id", "unknown")
                    return result
                except Exception as e:
                    return {
                        "classification": "ERROR",
                        "confidence": "none",
                        "ai_response": f"Processing error: {e}",
                        "reasoning": "Failed to process",
                        "photo_id": photo.get("id", "unknown"),
                    }

        async with aiohttp.ClientSession() as session:
            tasks = []

            for photo in photos_batch:
                # Create async task for this photo with concurrency control
                task = classify_single_photo(session, photo)
                tasks.append(task)

            # Wait for all tasks to complete
            results = await asyncio.gather(*tasks)
            return results

    # Run the async batch
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(classify_batch_async())
    finally:
        loop.close()


def parse_batch_response(
    response: str, photos_batch: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Parse the batch API response and extract classifications for each photo

    Args:
        response: Raw API response string
        photos_batch: Original photos list to match results with

    Returns:
        List of classification results in same order as input
    """
    results = []

    # Clean up response and split into lines
    lines = response.strip().split("\n")
    classifications = []

    # Extract classifications from response
    for line in lines:
        line = line.strip().upper()
        if "FLIGHT" in line or "ANCILLARY" in line:
            if "FLIGHT" in line and "ANCILLARY" not in line:
                classifications.append("FLIGHT")
            elif "ANCILLARY" in line and "FLIGHT" not in line:
                classifications.append("ANCILLARY")
            else:
                # Ambiguous line, try to get the last clear classification
                if line.endswith("FLIGHT"):
                    classifications.append("FLIGHT")
                elif line.endswith("ANCILLARY"):
                    classifications.append("ANCILLARY")
                else:
                    classifications.append("UNKNOWN")

    # Match classifications to photos
    for i, photo in enumerate(photos_batch):
        if i < len(classifications):
            classification = classifications[i]
            confidence = "high" if classification in ["FLIGHT", "ANCILLARY"] else "none"

            results.append(
                {
                    "classification": classification,
                    "confidence": confidence,
                    "ai_response": response,
                    "reasoning": f"Batch classification result: {classification}",
                    "photo_id": photo.get("id", "unknown"),
                }
            )
        else:
            # Not enough classifications returned, mark as error
            results.append(
                {
                    "classification": "ERROR",
                    "confidence": "none",
                    "ai_response": response,
                    "reasoning": "Insufficient classifications in batch response",
                    "photo_id": photo.get("id", "unknown"),
                }
            )

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
    For better GPU utilization, use classify_photos_batch() instead

    Args:
        description: Photo description text
        title: Photo title (optional)
        tags: Photo tags (optional)

    Returns:
        dict with classification result
    """
    # Use batch processing for single photo (more efficient)
    photo = {"id": "single", "title": title, "description": description, "tags": tags}

    results = classify_photos_batch([photo])
    if results:
        result = results[0]
        # Remove photo_id from result for backward compatibility
        result.pop("photo_id", None)
        return result
    else:
        return {
            "classification": "ERROR",
            "confidence": "none",
            "ai_response": "Batch processing failed",
            "reasoning": "Could not connect to AI model",
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
    Process a single album file and return classification results
    Supports resuming by loading existing filtered data and skipping already processed photos

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

    print(
        f"   🚀 Processing photos with dynamic batching (starting with {GPU_BATCH_SIZE})..."
    )

    # Process photos in batches for better GPU utilization
    total_processed = 0
    current_batch_size = GPU_BATCH_SIZE

    batch_start = 0
    while batch_start < len(photos_to_process):
        batch_end = min(batch_start + current_batch_size, len(photos_to_process))
        batch_photos = photos_to_process[batch_start:batch_end]
        batch_num = (batch_start // current_batch_size) + 1
        estimated_batches = (
            len(photos_to_process) + current_batch_size - 1
        ) // current_batch_size

        print(
            f"\n   📦 Processing batch {batch_num} (est. {estimated_batches} total, {len(batch_photos)} photos, batch size: {current_batch_size})..."
        )
        batch_start_time = time.time()

        # Classify entire batch concurrently
        try:
            batch_results = classify_photos_batch(batch_photos)
        except Exception as e:
            print(f"   ❌ Batch processing failed: {e}")
            # Fallback to individual processing for this batch
            batch_results = []
            for photo in batch_photos:
                try:
                    result = classify_photo_description(
                        photo.get("description", ""),
                        photo.get("title", ""),
                        photo.get("tags", ""),
                    )
                    result["photo_id"] = photo.get("id", "unknown")
                    batch_results.append(result)
                except Exception as photo_error:
                    print(f"   ❌ Individual photo failed: {photo_error}")
                    batch_results.append(
                        {
                            "classification": "ERROR",
                            "confidence": "none",
                            "ai_response": f"Error: {photo_error}",
                            "reasoning": "Processing failed",
                            "photo_id": photo.get("id", "unknown"),
                        }
                    )

        batch_end_time = time.time()
        batch_duration = batch_end_time - batch_start_time
        photos_per_second = (
            len(batch_photos) / batch_duration if batch_duration > 0 else 0
        )

        print(
            f"   ⏱️  Batch completed in {batch_duration:.1f}s ({photos_per_second:.1f} photos/sec)"
        )

        # Show GPU utilization tip if batch was very fast
        if batch_duration < 1.0:
            print(f"   💡 Batch processed very quickly - GPU may not be fully utilized")
        elif batch_duration > 10.0:
            print(
                f"   ⚠️  Batch took longer than expected - consider reducing batch size"
            )

        # Process results and update counters
        for i, (photo, result) in enumerate(zip(batch_photos, batch_results)):
            photo_id = photo.get("id", f"unknown_{batch_start + i + 1}")
            classification = result.get("classification", "ERROR")
            confidence = result.get("confidence", "none")
            ai_response = result.get("ai_response", "No response")

            total_processed += 1
            current_num = already_processed + total_processed

            # Show classification result (abbreviated for batch processing)
            if classification == "FLIGHT":
                status_icon = "✅"
                new_flight_count += 1
            elif classification == "ANCILLARY":
                status_icon = "🚫"
                new_ancillary_count += 1
            else:
                status_icon = "❓"
                new_error_count += 1

            print(
                f"   {status_icon} Photo {current_num}/{total_photos} - {photo_id} → {classification} ({confidence})"
            )

            # Add classification to photo metadata
            photo["ai_classification"] = result

            # Add to appropriate list
            if classification == "FLIGHT":
                new_flight_photos.append(photo)
            elif classification == "ANCILLARY":
                new_ancillary_photos.append(photo)
            # Errors are counted but not added to either list

        # Save progress after each batch
        all_flight_photos = existing_flight_photos + new_flight_photos
        all_ancillary_photos = existing_ancillary_photos + new_ancillary_photos
        total_flight_count = existing_stats["flight"] + new_flight_count
        total_ancillary_count = existing_stats["ancillary"] + new_ancillary_count
        total_error_count = existing_stats["errors"] + new_error_count

        print(
            f"   💾 Saving batch progress... ({current_num}/{total_photos} photos processed)"
        )

        save_success = save_filtered_albums(
            photoset_data,
            filename,
            all_flight_photos,
            all_ancillary_photos,
            total_flight_count,
            total_ancillary_count,
            total_error_count,
        )

        if not save_success:
            print(f"   ⚠️  Warning: Could not save batch progress")

        # Show batch summary
        print(
            f"   📊 Batch {batch_num}: {new_flight_count - (total_flight_count - existing_stats['flight'] - new_flight_count)} FLIGHT, "
            + f"{new_ancillary_count - (total_ancillary_count - existing_stats['ancillary'] - new_ancillary_count)} ANCILLARY, "
            + f"{new_error_count - (total_error_count - existing_stats['errors'] - new_error_count)} ERRORS"
        )

        print(f"   {'-' * 60}")

        # Dynamically adjust batch size based on performance
        if (
            len(batch_photos) == current_batch_size
        ):  # Only adjust if we processed a full batch
            current_batch_size = adjust_batch_size_dynamically(
                current_batch_size, batch_duration, len(batch_photos)
            )

        # Move to next batch
        batch_start += len(batch_photos)

        # Brief pause to prevent API overload (adjust as needed)
        if batch_start < len(photos_to_process):
            time.sleep(0.2)  # Reduced pause for better GPU utilization

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
        return {
            "status": "success",
            "filename": filename,
            "original_count": total_photos,
            "flight_count": total_flight_count,
            "ancillary_count": total_ancillary_count,
            "error_count": total_error_count,
            "new_processed": to_process,
        }
    else:
        return {
            "status": "error",
            "filename": filename,
            "error": "Failed to save final filtered results",
        }


def adjust_batch_size_dynamically(
    current_batch_size: int, processing_time: float, photos_count: int
) -> int:
    """
    Dynamically adjust batch size based on processing performance

    Args:
        current_batch_size: Current batch size
        processing_time: Time taken to process the batch (seconds)
        photos_count: Number of photos in the batch

    Returns:
        New optimal batch size
    """
    global GPU_BATCH_SIZE

    # Target: 0.5-1.2 photos per second (realistic for current API performance)
    target_photos_per_sec_min = 0.5
    target_photos_per_sec_max = 1.2

    photos_per_second = photos_count / processing_time if processing_time > 0 else 0

    if (
        photos_per_second > target_photos_per_sec_max
        and current_batch_size < MAX_BATCH_SIZE
    ):
        # Too fast, increase batch size to keep GPU busier
        new_size = min(current_batch_size + 2, MAX_BATCH_SIZE)
        print(
            f"   📈 Increasing batch size: {current_batch_size} → {new_size} (too fast: {photos_per_second:.2f} photos/sec)"
        )
        return new_size
    elif (
        photos_per_second < target_photos_per_sec_min
        and current_batch_size > MIN_BATCH_SIZE
    ):
        # Too slow, decrease batch size to avoid memory issues
        new_size = max(current_batch_size - 1, MIN_BATCH_SIZE)
        print(
            f"   📉 Decreasing batch size: {current_batch_size} → {new_size} (too slow: {photos_per_second:.2f} photos/sec)"
        )
        return new_size
    else:
        # Sweet spot - keep current size
        print(
            f"   ⚖️  Maintaining batch size: {current_batch_size} (optimal: {processing_time:.1f}s, {photos_per_second:.2f} photos/sec)"
        )
        return current_batch_size


def batch_process_albums():
    """
    Process all matching album files and create filtered versions
    Enhanced with GPU optimization and dynamic batch sizing
    """
    print("NASA ISS Photo Classification - Batch Processing (GPU Optimized)")
    print("=" * 60)

    # Check API connectivity
    print(f"Testing connection to Ollama API...")
    print(f"  Direct Ollama: {OLLAMA_DIRECT_URL}")
    print(f"  OpenWebUI: {OPENWEBUI_URL}")
    print(f"  Model: {MODEL_NAME}")
    print(f"  Initial batch size: {GPU_BATCH_SIZE}")
    print(f"  Batch size range: {MIN_BATCH_SIZE}-{MAX_BATCH_SIZE}")

    test_response = make_ollama_request("Hello", MODEL_NAME)
    if not test_response:
        print(f"❌ Cannot connect to Ollama API")
        print("Please ensure Ollama is running and model is available")
        print("\nTips for better GPU utilization:")
        print("  1. Make sure Gemma 3:27B is loaded: ollama pull gemma3:27b")
        print("  2. Check GPU memory: nvidia-smi")
        print("  3. Restart Ollama if needed: ollama serve")
        return False
    else:
        print(f"✅ API connection successful")
        print(f"✅ Using model: {MODEL_NAME}")
        print(f"✅ GPU optimization enabled")
        print(f"✅ Concurrent processing: {MAX_CONCURRENT_REQUESTS} requests")

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
    }

    for i, file_path in enumerate(album_files, 1):
        filename = os.path.basename(file_path)
        print(f"\n[{i}/{len(album_files)}] Processing: {filename}")

        try:
            result = process_album(file_path)

            if result["status"] == "success":
                results["success"] += 1
                results["total_photos"] += result["original_count"]
                results["total_flight"] += result["flight_count"]
                results["total_ancillary"] += result["ancillary_count"]
                results["total_errors"] += result["error_count"]

                new_processed = result.get("new_processed", 0)
                print(
                    f"   ✅ Success: {result['flight_count']} FLIGHT, {result['ancillary_count']} ANCILLARY, {result['error_count']} ERRORS (new: {new_processed})"
                )

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

    print(f"📁 Filtered albums saved to: {OUTPUT_FOLDER}")

    return True


# Old test function removed - now using batch_process_albums() for full processing


def main():
    """
    Main function for batch processing filtered NASA ISS photo albums
    """
    print("NASA ISS Photo AI Classification - Batch Processor")
    print(
        "Processing filtered albums (created by 9g_filter_against_existing_photos.py)"
    )
    print("Using Ollama API for AI classification")
    print(f"Direct Ollama: {OLLAMA_DIRECT_URL}")
    print(f"OpenWebUI: {OPENWEBUI_URL}")
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
    main()
