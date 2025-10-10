"""Tests for repetition detection and cleanup in transcriptions."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

MODULE_PATH = (
    Path(__file__).resolve().parents[1] / "1_comm" / "6_transcribe_using_corpus.py"
)
SPEC = importlib.util.spec_from_file_location("transcription_first", MODULE_PATH)
TRANSCRIPTION_MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules["transcription_first"] = TRANSCRIPTION_MODULE
SPEC.loader.exec_module(TRANSCRIPTION_MODULE)

dedupe_segment_repetitions = TRANSCRIPTION_MODULE.dedupe_segment_repetitions
_collapse_repetition_sequences = TRANSCRIPTION_MODULE._collapse_repetition_sequences
_normalize_repetition_token = TRANSCRIPTION_MODULE._normalize_repetition_token


def test_normalize_repetition_token():
    """Test token normalization removes punctuation and lowercases."""
    assert _normalize_repetition_token("Hello") == "hello"
    assert _normalize_repetition_token("Hello,") == "hello"
    assert _normalize_repetition_token("I'm") == "i'm"  # apostrophes are preserved
    assert _normalize_repetition_token("  World!  ") == "world"
    assert _normalize_repetition_token("") == ""


def test_collapse_simple_word_repetition():
    """Test that repeated single words are collapsed to one instance."""
    items = ["hello", "hello", "hello", "world"]
    normalized = ["hello", "hello", "hello", "world"]
    result = _collapse_repetition_sequences(items, normalized)
    assert result == ["hello", "world"]


def test_collapse_phrase_repetition():
    """Test that repeated phrases are collapsed to one instance."""
    items = ["good", "luck", "good", "luck", "good", "luck", "end"]
    normalized = ["good", "luck", "good", "luck", "good", "luck", "end"]
    result = _collapse_repetition_sequences(items, normalized)
    assert result == ["good", "luck", "end"]


def test_collapse_long_phrase_repetition():
    """Test that longer repeated phrases are detected."""
    items = [
        "Astray",
        "I'm",
        "transmitting",
        "to",
        "Moscow",
        "good",
        "luck",
        "with",
        "the",
        "flight",
        "Astray",
        "I'm",
        "transmitting",
        "to",
        "Moscow",
        "good",
        "luck",
        "with",
        "the",
        "flight",
    ]
    normalized = [t.lower().replace("'", "") for t in items]
    result = _collapse_repetition_sequences(items, normalized, max_phrase_len=12)
    # Should collapse to single instance of the 10-word phrase
    assert len(result) == 10
    assert result[0] == "Astray"
    assert result[-1] == "flight"


def test_dedupe_segment_with_repeated_words():
    """Test deduplication of segment with word-level repetitions."""
    segments = [
        {
            "start": 0.0,
            "end": 5.0,
            "text": "hello hello hello world",
            "words": [
                {"word": "hello", "start": 0.0, "end": 1.0},
                {"word": "hello", "start": 1.0, "end": 2.0},
                {"word": "hello", "start": 2.0, "end": 3.0},
                {"word": "world", "start": 3.0, "end": 4.0},
            ],
        }
    ]

    result = dedupe_segment_repetitions(segments)

    assert len(result) == 1
    assert len(result[0]["words"]) == 2
    assert result[0]["words"][0]["word"] == "hello"
    assert result[0]["words"][1]["word"] == "world"
    assert result[0]["text"] == "hello world"


def test_dedupe_actual_russian_translation_repetition():
    """Test deduplication of the actual repetition pattern from Russian translation.

    This tests the exact pattern:
    'Astray, I'm transmitting to Moscow, good luck with the flight.' repeated 14 times.
    """
    # Simulate the word list from WhisperX for repeated phrase
    repeated_phrase_words = [
        {"word": "Astray,", "start": 0.0, "end": 0.5},
        {"word": "I'm", "start": 0.5, "end": 0.7},
        {"word": "transmitting", "start": 0.7, "end": 1.2},
        {"word": "to", "start": 1.2, "end": 1.3},
        {"word": "Moscow,", "start": 1.3, "end": 1.7},
        {"word": "good", "start": 1.7, "end": 1.9},
        {"word": "luck", "start": 1.9, "end": 2.1},
        {"word": "with", "start": 2.1, "end": 2.3},
        {"word": "the", "start": 2.3, "end": 2.4},
        {"word": "flight.", "start": 2.4, "end": 2.8},
    ]

    # Build 14 repetitions
    all_words = []
    phrase_duration = 2.8
    for i in range(14):
        offset = i * phrase_duration
        for word in repeated_phrase_words:
            word_copy = dict(word)
            word_copy["start"] = word["start"] + offset
            word_copy["end"] = word["end"] + offset
            all_words.append(word_copy)

    # Build text
    repeated_text = " ".join(
        "Astray, I'm transmitting to Moscow, good luck with the flight."
        for _ in range(14)
    )

    segments = [
        {
            "start": 0.0,
            "end": phrase_duration * 14,
            "text": repeated_text,
            "words": all_words,
        }
    ]

    result = dedupe_segment_repetitions(segments, max_phrase_len=12)

    assert len(result) == 1
    # Should have only 10 words (one instance of the phrase)
    assert len(result[0]["words"]) == 10
    assert result[0]["words"][0]["word"] == "Astray,"
    assert result[0]["words"][-1]["word"] == "flight."
    # Text should be deduplicated
    expected_text = "Astray, I'm transmitting to Moscow, good luck with the flight."
    assert result[0]["text"] == expected_text


def test_dedupe_preserves_non_repeated_content():
    """Test that non-repeated content is preserved."""
    segments = [
        {
            "start": 0.0,
            "end": 3.0,
            "text": "This is unique content.",
            "words": [
                {"word": "This", "start": 0.0, "end": 0.5},
                {"word": "is", "start": 0.5, "end": 0.7},
                {"word": "unique", "start": 0.7, "end": 1.2},
                {"word": "content.", "start": 1.2, "end": 1.8},
            ],
        }
    ]

    result = dedupe_segment_repetitions(segments)

    assert len(result) == 1
    assert len(result[0]["words"]) == 4
    assert result[0]["text"] == "This is unique content."


def test_dedupe_text_only_segment():
    """Test deduplication when segment has text but no words."""
    segments = [
        {
            "start": 0.0,
            "end": 5.0,
            "text": "hello hello hello world world",
        }
    ]

    result = dedupe_segment_repetitions(segments)

    assert len(result) == 1
    # Should collapse repeated tokens in text
    assert "hello world" in result[0]["text"]
    # Should not have triple "hello"
    assert result[0]["text"].count("hello") == 1


def test_dedupe_mixed_content():
    """Test deduplication with mixed repeated and unique content."""
    segments = [
        {
            "start": 0.0,
            "end": 10.0,
            "text": "start start unique content end end end",
            "words": [
                {"word": "start", "start": 0.0, "end": 0.5},
                {"word": "start", "start": 0.5, "end": 1.0},
                {"word": "unique", "start": 1.0, "end": 1.5},
                {"word": "content", "start": 1.5, "end": 2.0},
                {"word": "end", "start": 2.0, "end": 2.5},
                {"word": "end", "start": 2.5, "end": 3.0},
                {"word": "end", "start": 3.0, "end": 3.5},
            ],
        }
    ]

    result = dedupe_segment_repetitions(segments)

    assert len(result) == 1
    assert len(result[0]["words"]) == 4
    assert result[0]["words"][0]["word"] == "start"
    assert result[0]["words"][1]["word"] == "unique"
    assert result[0]["words"][2]["word"] == "content"
    assert result[0]["words"][3]["word"] == "end"


def test_dedupe_multiple_segments():
    """Test deduplication across multiple segments."""
    segments = [
        {
            "start": 0.0,
            "end": 2.0,
            "text": "repeat repeat repeat",
            "words": [
                {"word": "repeat", "start": 0.0, "end": 0.5},
                {"word": "repeat", "start": 0.5, "end": 1.0},
                {"word": "repeat", "start": 1.0, "end": 1.5},
            ],
        },
        {
            "start": 2.0,
            "end": 4.0,
            "text": "another another",
            "words": [
                {"word": "another", "start": 2.0, "end": 2.5},
                {"word": "another", "start": 2.5, "end": 3.0},
            ],
        },
    ]

    result = dedupe_segment_repetitions(segments)

    assert len(result) == 2
    assert len(result[0]["words"]) == 1
    assert result[0]["words"][0]["word"] == "repeat"
    assert len(result[1]["words"]) == 1
    assert result[1]["words"][0]["word"] == "another"


if __name__ == "__main__":
    import pytest

    pytest.main([__file__, "-v"])
