#!/usr/bin/env python3
"""One-off utility to scrub repeated phrases from legacy translation segments."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
from pathlib import Path
from typing import Iterable, Sequence, TypeVar

from dotenv import load_dotenv

# --- Start of functions copied from 6_transcribe_using_corpus.py ---

_NON_WORD_RE = re.compile(r"[^\w']+")
_DEFAULT_MAX_PHRASE_LEN = 8
_SequenceItem = TypeVar("_SequenceItem")


def _normalize_repetition_token(token: str) -> str:
    token = token.strip().lower()
    if not token:
        return ""
    return _NON_WORD_RE.sub("", token)


def _collapse_repetition_sequences(
    items: Sequence[_SequenceItem],
    normalized_tokens: Sequence[str],
    *,
    max_phrase_len: int = _DEFAULT_MAX_PHRASE_LEN,
) -> list[_SequenceItem]:
    total = len(items)
    if total <= 1:
        return list(items)

    result: list[_SequenceItem] = []
    index = 0
    while index < total:
        max_candidate = min(max_phrase_len, total - index)
        repeated_length = 0
        repeated_count = 1

        for phrase_len in range(max_candidate, 0, -1):
            pattern = normalized_tokens[index : index + phrase_len]
            if not any(pattern):
                continue
            count = 1
            while (
                index + (count + 1) * phrase_len <= total
                and normalized_tokens[
                    index + count * phrase_len : index + (count + 1) * phrase_len
                ]
                == pattern
            ):
                count += 1
            if count >= 4:
                repeated_length = phrase_len
                repeated_count = count
                break

        if repeated_length:
            result.extend(items[index : index + repeated_length])
            index += repeated_length * repeated_count
        else:
            result.append(items[index])
            index += 1

    return result


def _dedupe_segment_words(
    words: Sequence[dict] | None,
    *,
    max_phrase_len: int = _DEFAULT_MAX_PHRASE_LEN,
) -> list[dict]:
    if not words:
        return []

    # Iterate until no more repetitions are found
    current_words = list(words)
    max_iterations = 10  # Safety limit to prevent infinite loops
    iteration = 0

    while iteration < max_iterations:
        normalized = [
            (
                _normalize_repetition_token(str(word.get("word", "")))
                if isinstance(word, dict)
                else ""
            )
            for word in current_words
        ]
        collapsed = _collapse_repetition_sequences(
            current_words, normalized, max_phrase_len=max_phrase_len
        )

        # If no change, we're done
        if len(collapsed) == len(current_words):
            break

        current_words = collapsed
        iteration += 1

    cleaned: list[dict] = []
    for word in current_words:
        if not isinstance(word, dict):
            continue
        word_text = str(word.get("word", "")).strip()
        if not word_text:
            continue
        cleaned.append(dict(word))
    return cleaned


def dedupe_segment_repetitions(
    segments: Sequence[dict],
    *,
    max_phrase_len: int = _DEFAULT_MAX_PHRASE_LEN,
) -> list[dict]:
    cleaned_segments: list[dict] = []
    for segment in segments:
        if not isinstance(segment, dict):
            continue
        segment_copy = dict(segment)
        words = segment_copy.get("words")
        cleaned_words = _dedupe_segment_words(words, max_phrase_len=max_phrase_len)
        if cleaned_words:
            segment_copy["words"] = cleaned_words
            segment_copy["text"] = " ".join(
                str(word.get("word", "")).strip() for word in cleaned_words
            ).strip()
        else:
            segment_copy.pop("words", None)
            existing_text = str(segment_copy.get("text", "")).strip()
            if existing_text:
                tokens = existing_text.split()

                # Iterate until no more repetitions found in text
                max_iterations = 10
                iteration = 0
                current_tokens = tokens

                while iteration < max_iterations:
                    normalized_tokens = [
                        _normalize_repetition_token(token) for token in current_tokens
                    ]
                    collapsed_tokens = _collapse_repetition_sequences(
                        current_tokens,
                        normalized_tokens,
                        max_phrase_len=max_phrase_len,
                    )

                    if len(collapsed_tokens) == len(current_tokens):
                        break

                    current_tokens = collapsed_tokens
                    iteration += 1

                segment_copy["text"] = " ".join(current_tokens).strip()
            elif "text" in segment_copy:
                segment_copy.pop("text")
        cleaned_segments.append(segment_copy)
    return cleaned_segments


def _segment_words_to_text(words: Sequence[dict] | None) -> str:
    if not words:
        return ""
    collected: list[str] = []
    for word in words:
        if not isinstance(word, dict):
            continue
        word_text = str(word.get("word", "")).strip()
        if word_text:
            collected.append(word_text)
    return " ".join(collected).strip()


def prune_empty_segments(
    segments: Sequence[dict],
) -> list[dict]:
    cleaned: list[dict] = []
    for segment in segments:
        text_value = str(segment.get("text", "")).strip()
        words_value = _segment_words_to_text(segment.get("words"))
        if not text_value and not words_value:
            continue
        segment_copy = dict(segment)
        if words_value:
            segment_copy["words"] = [
                dict(word)
                for word in segment.get("words", [])
                if isinstance(word, dict) and str(word.get("word", "")).strip()
            ]
        if text_value:
            segment_copy["text"] = text_value
        elif words_value:
            segment_copy["text"] = words_value
        cleaned.append(segment_copy)
    return cleaned


def load_environment(env_path: Path | None = None) -> None:
    env_path = env_path or ROOT_ENV_PATH
    if env_path.exists():
        load_dotenv(env_path)
    else:
        load_dotenv()


# --- End of functions copied from 6_transcribe_using_corpus.py ---

CLEANUP_MAX_PHRASE_LEN = 64
ROOT_ENV_PATH = Path(__file__).resolve().parents[3] / ".env"


def iter_utterance_json_files(
    root: Path, date_range: tuple[dt.date, dt.date] | None = None
) -> Iterable[Path]:
    if not date_range:
        for path in root.rglob("*.json"):
            if path.is_file():
                yield path
        return

    start_date, end_date = date_range
    current_date = start_date
    while current_date <= end_date:
        date_path = (
            root
            / str(current_date.year)
            / f"{current_date.month:02d}"
            / f"{current_date.day:02d}"
        )
        if date_path.exists() and date_path.is_dir():
            for path in date_path.rglob("*.json"):
                if path.is_file():
                    yield path
        current_date += dt.timedelta(days=1)


def get_date_from_path(path: Path) -> dt.date | None:
    """Attempt to extract a date from a path component."""
    # Example path: .../comm_transcripts_aacs/2024/01/15/...
    # Or: .../comm_transcripts_aacs/2024/2024-01-15/...
    for part in path.parts:
        try:
            # Handle YYYY-MM-DD format
            return dt.datetime.strptime(part, "%Y-%m-%d").date()
        except (ValueError, TypeError):
            pass
        # Handle YYYY/MM/DD structure by assembling parts
        try:
            # A bit fragile, assumes a certain path structure
            if len(part) == 4 and part.isdigit():  # Year
                year_index = path.parts.index(part)
                if year_index + 2 < len(path.parts):
                    year = int(path.parts[year_index])
                    month = int(path.parts[year_index + 1])
                    day = int(path.parts[year_index + 2])
                    return dt.date(year, month, day)
        except (ValueError, TypeError, IndexError):
            continue
    return None


def clean_translation_segments(data: dict) -> tuple[bool, list[dict]]:
    if not isinstance(data, dict):
        return False, []

    segments = data.get("segments")
    if not isinstance(segments, list) or not segments:
        return False, []

    detected_language = str(data.get("detectedLanguage", "")).strip().lower()
    has_original_segments = isinstance(data.get("origLangSegments"), list)

    # Only scrub translations (non-English source audio that has been translated to English).
    if not has_original_segments and detected_language in {"", "en"}:
        return False, []

    cleaned_segments = prune_empty_segments(
        dedupe_segment_repetitions(segments, max_phrase_len=CLEANUP_MAX_PHRASE_LEN)
    )

    if cleaned_segments == segments:
        return False, cleaned_segments

    return True, cleaned_segments


def process_file(
    path: Path, *, dry_run: bool = False, display_root: Path | None = None
) -> bool:
    try:
        original_text = path.read_text(encoding="utf-8")
    except OSError as exc:
        print(f"Failed to read {path}: {exc}", file=sys.stderr)
        return False

    try:
        payload = json.loads(original_text)
    except json.JSONDecodeError as exc:
        print(f"Skipping {path} (invalid JSON): {exc}", file=sys.stderr)
        return False

    # Store original segments for comparison
    original_segments = payload.get("segments", [])

    changed, cleaned_segments = clean_translation_segments(payload)
    if not changed:
        return False

    payload["segments"] = cleaned_segments

    display_path = path
    if display_root and path.is_relative_to(display_root):
        display_path = path.relative_to(display_root)

    # Print file path
    print(display_path)

    # Print original and deduped text for each changed segment
    for i, (orig_seg, clean_seg) in enumerate(zip(original_segments, cleaned_segments)):
        orig_text = orig_seg.get("text", "")
        clean_text = clean_seg.get("text", "")
        if orig_text != clean_text:
            print(f"  Segment {i + 1} - Original:")
            print(f"    {orig_text}")
            print()
            print(f"  Segment {i + 1} - Deduped:")
            print(f"    {clean_text}")
            print()

    if dry_run:
        return True

    payload_text = json.dumps(payload, ensure_ascii=False, indent=2)
    try:
        path.write_text(payload_text, encoding="utf-8")
    except OSError as exc:
        print(f"Failed to write {path}: {exc}", file=sys.stderr)
        return False

    return True


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "One-off repair tool to scrub repeated phrases from translated comm utterance JSON files."
        )
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Identify affected files without modifying them.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        help="Process at most N JSON files (for incremental verification).",
    )
    parser.add_argument(
        "--base",
        type=Path,
        help="Override the comm_transcripts_aacs root directory.",
    )
    parser.add_argument(
        "--start-date",
        help="Inclusive start date (YYYY-MM-DD).",
    )
    parser.add_argument(
        "--end-date",
        help="Inclusive end date (YYYY-MM-DD).",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    # Load .env so RAW_FOLDER is available
    load_environment(ROOT_ENV_PATH)

    base_path: Path
    if args.base is not None:
        base_path = args.base
    else:
        raw_folder = os.getenv("RAW_FOLDER")
        if not raw_folder:
            print("RAW_FOLDER environment variable is not defined.", file=sys.stderr)
            return 2
        base_path = Path(raw_folder) / "comm_transcripts_aacs"

    if not base_path.exists():
        print(
            f"Target directory {base_path} does not exist. Nothing to do.",
            file=sys.stderr,
        )
        return 3

    date_range: tuple[dt.date, dt.date] | None = None
    if args.start_date and args.end_date:
        try:
            start = dt.datetime.strptime(args.start_date, "%Y-%m-%d").date()
            end = dt.datetime.strptime(args.end_date, "%Y-%m-%d").date()
            if start > end:
                print(
                    "Error: --start-date cannot be after --end-date.", file=sys.stderr
                )
                return 1
            date_range = (start, end)
        except ValueError:
            print("Error: Invalid date format. Please use YYYY-MM-DD.", file=sys.stderr)
            return 1

    processed = 0
    updated = 0

    for json_path in iter_utterance_json_files(base_path, date_range):
        processed += 1
        if args.limit and updated >= args.limit:
            break
        if process_file(json_path, dry_run=args.dry_run, display_root=base_path):
            updated += 1

    print(
        f"Processed {processed} file(s); {'would update' if args.dry_run else 'updated'} {updated}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
