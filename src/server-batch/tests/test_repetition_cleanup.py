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

actual_transcription_text_to_test = """Tango, speed and rotation are normal. 2-3, on board is in order, ready for landing. Arrived. 530 seconds. There is a shutdown of the engine in the third stage. There is a detachment. Astray, I'm transmitting to Moscow, good luck with the flight. Astray, I'm transmitting to Moscow, good luck with the flight. Astray, I'm transmitting to Moscow, good luck with the flight. Astray, I'm transmitting to Moscow, good luck with the flight. Astray, I'm transmitting to Moscow, good luck with the flight. Astray, I'm transmitting to Moscow, good luck with the flight. Astray, I'm transmitting to Moscow, good luck with the flight. Astray, I'm transmitting to Moscow, good luck with the flight. Astray, I'm transmitting to Moscow, good luck with the flight. Astray, I'm transmitting to Moscow, good luck with the flight. Astray, I'm transmitting to Moscow, good luck with the flight. Astray, I'm transmitting to Moscow, good luck with the flight. Astray, I'm transmitting to Moscow, good luck with the flight. Astray, I'm transmitting to Moscow, good luck with the flight. I got you, Astray. The inflow is on. Everything is fine, listen to me. The inflow is on, the heating is on. We are waiting for your first measurements. The first is closed, the second is closed. Turn on the speedometer. Turn on the speedometer. We are waiting for you. We are waiting for you. We are waiting for you. We are waiting for you. The table on the KDU parameters, page 45. Over. So, I transfer the page to the table 45. The parameters are 17. 17.8. 18th 17.8 19th 268 20th 1.9 21st 1.2 22nd 330 23rd 326 24th, 17.6 25th, 17.7 26th, 56th How did you take it? 26th, repeat? I repeat, 26th, 766 Roger, 266 Astray, how do you feel? Astray-1, I feel good, the crew on board is in order. We checked the control, everything is working properly. Understood. Work further along the landing page. We'll give you a 27-30 five-minute measurement. Working on 30-46. Astray 73300, TV will be turned off via KRL. April 7, 33 via KRL. Anton, Stolyar 7. Thank you very much. We continue to work. Everything is going well. The crew is good. Congratulations! Astray and Yatsub, Moscow. Let's check the data on Yatsub, number 1. Page 59. Book of Exhibition of Art. Diaspora 1.20.2.59. We are ready. C, communication session 08.45.00, over. 08.45.00, over. RRP, 08.49.50, over. Departure 08.50.10, over. C3.9.01.10, over. Over. Next session, 08.46.00, over. 8.46, the start of the landing. Moscow, 5-minute measurement, the pressure is 790. Accepted, 790. I remind you that after this session of communication, do not forget to conduct VIPSH. And in the next session of communication, be always ready to conduct test-suit №1. The VIPSH is ready for test-suit №1. I will transmit the parameters of the orbit. The period is 88.8, the inclination is 51.64, the minimum altitude is 200, the maximum is 258. Roger that. Astray, this is Moscow. Astray-1, roger. The ship has been successfully taken into orbit. The construction elements are open. Allow us to loosen the shoulder straps, the straps are tightened. Raise the windscreen. Turn off the thermometers at the specified time. Astray, roger. Loosen the straps, open the windscreen. Thermometers at the specified time. At the specified time. Let me remind you, the next signal is 0846. Roger that, 0846. I-31, proceed to check the transparant of the CST. Proceed. 3 minutes before the end of the session. I remind you, the next session is at 8.46. Thank you. I got you. That's right."""


def test_normalize_repetition_token():
    """Test token normalization removes punctuation and lowercases."""
    assert _normalize_repetition_token("Hello") == "hello"
    assert _normalize_repetition_token("Hello,") == "hello"
    assert _normalize_repetition_token("I'm") == "i'm"  # apostrophes are preserved
    assert _normalize_repetition_token("  World!  ") == "world"
    assert _normalize_repetition_token("") == ""


def test_collapse_simple_word_repetition():
    """Test that repeated single words are collapsed to one instance when repeated 4+ times."""
    items = ["hello", "hello", "hello", "hello", "world"]
    normalized = ["hello", "hello", "hello", "hello", "world"]
    result = _collapse_repetition_sequences(items, normalized)
    assert result == ["hello", "world"]


def test_collapse_phrase_repetition():
    """Test that repeated phrases are collapsed to one instance when repeated 4+ times."""
    items = ["good", "luck", "good", "luck", "good", "luck", "good", "luck", "end"]
    normalized = ["good", "luck", "good", "luck", "good", "luck", "good", "luck", "end"]
    result = _collapse_repetition_sequences(items, normalized)
    assert result == ["good", "luck", "end"]


def test_collapse_long_phrase_repetition():
    """Test that longer repeated phrases are detected when repeated 4+ times."""
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
    """Test deduplication of segment with word-level repetitions (4+ times)."""
    segments = [
        {
            "start": 0.0,
            "end": 5.0,
            "text": "hello hello hello hello world",
            "words": [
                {"word": "hello", "start": 0.0, "end": 1.0},
                {"word": "hello", "start": 1.0, "end": 2.0},
                {"word": "hello", "start": 2.0, "end": 3.0},
                {"word": "hello", "start": 3.0, "end": 3.5},
                {"word": "world", "start": 3.5, "end": 4.0},
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


def test_dedupe_preserves_short_repetitions():
    """Test that repetitions of 3 or fewer are NOT deduplicated (threshold is 4+)."""
    # Test with 2 repetitions
    segments_2 = [
        {
            "start": 0.0,
            "end": 2.0,
            "text": "hello hello",
            "words": [
                {"word": "hello", "start": 0.0, "end": 1.0},
                {"word": "hello", "start": 1.0, "end": 2.0},
            ],
        }
    ]
    result_2 = dedupe_segment_repetitions(segments_2)
    assert len(result_2[0]["words"]) == 2, "Should NOT deduplicate 2 repetitions"

    # Test with 3 repetitions
    segments_3 = [
        {
            "start": 0.0,
            "end": 3.0,
            "text": "hello hello hello",
            "words": [
                {"word": "hello", "start": 0.0, "end": 1.0},
                {"word": "hello", "start": 1.0, "end": 2.0},
                {"word": "hello", "start": 2.0, "end": 3.0},
            ],
        }
    ]
    result_3 = dedupe_segment_repetitions(segments_3)
    assert len(result_3[0]["words"]) == 3, "Should NOT deduplicate 3 repetitions"

    # Test with 4 repetitions
    segments_4 = [
        {
            "start": 0.0,
            "end": 4.0,
            "text": "hello hello hello hello",
            "words": [
                {"word": "hello", "start": 0.0, "end": 1.0},
                {"word": "hello", "start": 1.0, "end": 2.0},
                {"word": "hello", "start": 2.0, "end": 3.0},
                {"word": "hello", "start": 3.0, "end": 4.0},
            ],
        }
    ]
    result_4 = dedupe_segment_repetitions(segments_4)
    assert len(result_4[0]["words"]) == 1, "Should deduplicate 4 repetitions"
    assert result_4[0]["words"][0]["word"] == "hello"


def test_dedupe_text_only_segment():
    """Test deduplication when segment has text but no words (4+ repetitions)."""
    segments = [
        {
            "start": 0.0,
            "end": 5.0,
            "text": "hello hello hello hello world world world world",
        }
    ]

    result = dedupe_segment_repetitions(segments)

    assert len(result) == 1
    # Should collapse repeated tokens in text
    assert "hello world" in result[0]["text"]
    # Should not have 4x "hello"
    assert result[0]["text"].count("hello") == 1
    assert result[0]["text"].count("world") == 1


def test_dedupe_mixed_content():
    """Test deduplication with mixed repeated and unique content (4+ repetitions)."""
    segments = [
        {
            "start": 0.0,
            "end": 10.0,
            "text": "start start start start unique content end end end end",
            "words": [
                {"word": "start", "start": 0.0, "end": 0.5},
                {"word": "start", "start": 0.5, "end": 1.0},
                {"word": "start", "start": 1.0, "end": 1.2},
                {"word": "start", "start": 1.2, "end": 1.4},
                {"word": "unique", "start": 1.4, "end": 1.9},
                {"word": "content", "start": 1.9, "end": 2.4},
                {"word": "end", "start": 2.4, "end": 2.9},
                {"word": "end", "start": 2.9, "end": 3.4},
                {"word": "end", "start": 3.4, "end": 3.9},
                {"word": "end", "start": 3.9, "end": 4.4},
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
    """Test deduplication across multiple segments (4+ repetitions)."""
    segments = [
        {
            "start": 0.0,
            "end": 2.0,
            "text": "repeat repeat repeat repeat",
            "words": [
                {"word": "repeat", "start": 0.0, "end": 0.5},
                {"word": "repeat", "start": 0.5, "end": 1.0},
                {"word": "repeat", "start": 1.0, "end": 1.5},
                {"word": "repeat", "start": 1.5, "end": 2.0},
            ],
        },
        {
            "start": 2.0,
            "end": 4.0,
            "text": "another another another another",
            "words": [
                {"word": "another", "start": 2.0, "end": 2.5},
                {"word": "another", "start": 2.5, "end": 3.0},
                {"word": "another", "start": 3.0, "end": 3.5},
                {"word": "another", "start": 3.5, "end": 4.0},
            ],
        },
    ]

    result = dedupe_segment_repetitions(segments)

    assert len(result) == 2
    assert len(result[0]["words"]) == 1
    assert result[0]["words"][0]["word"] == "repeat"
    assert len(result[1]["words"]) == 1
    assert result[1]["words"][0]["word"] == "another"


def test_dedupe_actual_full_transcription():
    """Test deduplication on the actual problematic transcription text.

    This text contains multiple repetition patterns:
    - 'Astray, I'm transmitting to Moscow, good luck with the flight.' repeated 14 times
    - 'Turn on the speedometer.' repeated 2 times (with period variation)
    - 'We are waiting for you.' repeated 4 times
    """
    # Parse the actual text into tokens
    tokens = actual_transcription_text_to_test.split()

    # Create words list with mock timestamps
    words = []
    time_offset = 0.0
    for token in tokens:
        words.append({"word": token, "start": time_offset, "end": time_offset + 0.3})
        time_offset += 0.3

    segments = [
        {
            "start": 0.0,
            "end": time_offset,
            "text": actual_transcription_text_to_test,
            "words": words,
        }
    ]

    result = dedupe_segment_repetitions(segments, max_phrase_len=12)

    assert len(result) == 1
    result_text = result[0]["text"]

    # Look for the pattern in the text
    import re

    waiting_matches = list(re.finditer(r"We are waiting for you", result_text))
    print(f"\nFound 'We are waiting for you' {len(waiting_matches)} times")
    for i, match in enumerate(waiting_matches):
        context_start = max(0, match.start() - 50)
        context_end = min(len(result_text), match.end() + 50)
        print(
            f"  Match {i+1}: ...{result_text[context_start:context_end].encode('ascii', errors='replace').decode()}..."
        )

    # Check that the 14-time repetition is now only 1
    astray_phrase = "Astray, I'm transmitting to Moscow, good luck with the flight."
    assert (
        result_text.count(astray_phrase) == 1
    ), f"Expected 1 occurrence of Astray phrase, got {result_text.count(astray_phrase)}"

    # Check that "Turn on the speedometer" appears only twice (not deduplicated, only 2 occurrences)
    # (it appears as "Turn on the speedometer." and then "Turn on the speedometer." again)
    speedometer_count = result_text.lower().count("turn on the speedometer")
    assert (
        speedometer_count == 2
    ), f"Expected 2 occurrences of speedometer phrase (not enough to dedupe), got {speedometer_count}"

    # Check that "We are waiting for you" appears only once (4 occurrences deduplicated)
    waiting_count = result_text.count("We are waiting for you.")
    assert (
        waiting_count == 1
    ), f"Expected 1 occurrence of waiting phrase (deduped from 4), got {waiting_count}"


if __name__ == "__main__":
    import pytest

    pytest.main([__file__, "-v"])
