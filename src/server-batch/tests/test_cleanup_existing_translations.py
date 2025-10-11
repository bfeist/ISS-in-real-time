"""Tests for the cleanup utility that fixes legacy translation segments."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

SCRIPT_PATH = (
    Path(__file__).resolve().parents[1] / "1_comm" / "cleanup_existing_translations.py"
)
SPEC = importlib.util.spec_from_file_location(
    "cleanup_existing_translations", SCRIPT_PATH
)
CLEANUP_MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules["cleanup_existing_translations_test"] = CLEANUP_MODULE
SPEC.loader.exec_module(CLEANUP_MODULE)

clean_translation_segments = CLEANUP_MODULE.clean_translation_segments


def test_clean_translation_segments_collapses_long_repetition():
    repeated_phrase = "Astray, I'm transmitting to Moscow, good luck with the flight."
    repeated_text = " ".join(repeated_phrase for _ in range(14))

    data = {
        "detectedLanguage": "ru",
        "segments": [
            {
                "start": 0.04,
                "end": 28.81,
                "text": repeated_text,
            }
        ],
    }

    changed, cleaned_segments = clean_translation_segments(data)

    assert changed is True
    assert len(cleaned_segments) == 1
    assert cleaned_segments[0]["text"] == repeated_phrase
    assert cleaned_segments[0]["start"] == data["segments"][0]["start"]
    assert cleaned_segments[0]["end"] == data["segments"][0]["end"]
