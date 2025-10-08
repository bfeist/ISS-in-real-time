from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

MODULE_PATH = (
    Path(__file__).resolve().parents[1] / "1_comm" / "6_transcribe_using_corpus.py"
)
SPEC = importlib.util.spec_from_file_location("transcription_first", MODULE_PATH)
TRANSCRIPTION_MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules["transcription_first"] = TRANSCRIPTION_MODULE
SPEC.loader.exec_module(TRANSCRIPTION_MODULE)

SilenceConfig = TRANSCRIPTION_MODULE.SilenceConfig
Interval = TRANSCRIPTION_MODULE.Interval
build_initial_prompt = TRANSCRIPTION_MODULE.build_initial_prompt
derive_alignment_intervals = TRANSCRIPTION_MODULE.derive_alignment_intervals
slice_segments_to_interval = TRANSCRIPTION_MODULE.slice_segments_to_interval


class TranscriptionFirstHelpersTests(unittest.TestCase):
    def setUp(self) -> None:  # noqa: D401
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.prompt_root = Path(self.temp_dir.name) / "prompt_context"
        self.prompt_root.mkdir(parents=True, exist_ok=True)

    def test_build_initial_prompt_uses_prompt_text(self) -> None:
        day_dir = self.prompt_root / "2024" / "09" / "07"
        day_dir.mkdir(parents=True, exist_ok=True)
        (day_dir / "prompt.txt").write_text("Custom prompt", encoding="utf-8")

        comm_datetime = TRANSCRIPTION_MODULE.dt.datetime(2024, 9, 7, 15, 30)
        prompt = build_initial_prompt(comm_datetime, "1_SG_1", self.prompt_root)

        self.assertIn("Custom prompt", prompt)
        self.assertIn("Channel: 1 SG 1", prompt)

    def test_build_initial_prompt_falls_back_to_json(self) -> None:
        day_dir = self.prompt_root / "2024" / "09" / "08"
        day_dir.mkdir(parents=True, exist_ok=True)
        (day_dir / "prompt_input.json").write_text(
            json.dumps({"prompt": "Generated"}),
            encoding="utf-8",
        )

        comm_datetime = TRANSCRIPTION_MODULE.dt.datetime(2024, 9, 8, 10, 15)
        prompt = build_initial_prompt(comm_datetime, "1_SG_2", self.prompt_root)

        self.assertIn("Generated", prompt)
        self.assertIn("Channel: 1 SG 2", prompt)

    def test_derive_alignment_intervals_respects_silence_threshold(self) -> None:
        silence_cfg = SilenceConfig(
            frame_duration_seconds=0.02,
            min_gap_blocks=10,
            pre_roll_blocks=1,
            post_roll_blocks=2,
        )
        alignment_segments = [
            {
                "start": 0.0,
                "end": 2.0,
                "words": [
                    {"word": "hello ", "start": 0.0, "end": 0.5},
                    {"word": "there", "start": 0.6, "end": 1.0},
                    {"word": "friend", "start": 3.0, "end": 3.4},
                ],
            }
        ]

        intervals = derive_alignment_intervals(alignment_segments, 10.0, silence_cfg)

        self.assertEqual(len(intervals), 2)
        first, second = intervals
        self.assertAlmostEqual(first.start, 0.0)
        self.assertAlmostEqual(round(first.end, 2), 1.04, places=2)
        self.assertAlmostEqual(round(second.start, 2), 2.98, places=2)
        self.assertAlmostEqual(round(second.end, 2), 3.44, places=2)

    def test_slice_segments_to_interval_rebases_times(self) -> None:
        segments = [
            {
                "start": 10.0,
                "end": 12.0,
                "text": "hello world",
                "words": [
                    {"word": "hello", "start": 10.0, "end": 10.5},
                    {"word": "world", "start": 11.0, "end": 11.5},
                ],
            }
        ]

        sliced = slice_segments_to_interval(segments, 9.0, 12.0)

        self.assertEqual(len(sliced), 1)
        seg = sliced[0]
        self.assertAlmostEqual(seg["start"], 1.0)
        self.assertAlmostEqual(seg["end"], 3.0)
        self.assertEqual(seg["words"][0]["start"], 1.0)
        self.assertEqual(seg["words"][0]["end"], 1.5)
        self.assertEqual(seg["words"][1]["start"], 2.0)
        self.assertEqual(seg["words"][1]["end"], 2.5)


if __name__ == "__main__":
    unittest.main()
