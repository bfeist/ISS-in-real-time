from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

from pydub import AudioSegment  # type: ignore

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
render_utterances = TRANSCRIPTION_MODULE.render_utterances
TranscriptionArtifacts = TRANSCRIPTION_MODULE.TranscriptionArtifacts
merge_intervals_with_vad = TRANSCRIPTION_MODULE.merge_intervals_with_vad


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

    def test_derive_alignment_intervals_falls_back_to_segments(self) -> None:
        silence_cfg = SilenceConfig(
            frame_duration_seconds=0.02,
            min_gap_blocks=10,
            pre_roll_blocks=1,
            post_roll_blocks=1,
        )
        alignment_segments: list[dict[str, object]] = [
            {
                "start": 0.0,
                "end": 0.7,
                "words": [],
            }
        ]
        fallback_segments = [
            {
                "start": 0.0,
                "end": 0.65,
                "text": "hello",
            }
        ]

        intervals = derive_alignment_intervals(
            alignment_segments,
            1.0,
            silence_cfg,
            fallback_segments=fallback_segments,
        )

        self.assertEqual(len(intervals), 1)
        interval = intervals[0]
        self.assertAlmostEqual(interval.start, 0.0)
        self.assertGreater(interval.end, 0.6)
        self.assertLessEqual(interval.end, 1.0)

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

    def test_merge_intervals_with_vad_merges_close_segments(self) -> None:
        silence_cfg = SilenceConfig()
        intervals = [
            Interval(
                index=0,
                start=0.0,
                end=1.0,
                words=[{"start": 0.0, "end": 0.5, "word": "hello"}],
            ),
            Interval(
                index=1,
                start=1.05,
                end=1.8,
                words=[{"start": 1.05, "end": 1.5, "word": "world"}],
            ),
        ]

        merged = merge_intervals_with_vad(intervals, [(0.0, 2.0)], 5.0, silence_cfg)

        self.assertEqual(len(merged), 1)
        combined = merged[0]
        self.assertAlmostEqual(combined.start, 0.0)
        self.assertAlmostEqual(combined.end, 1.8)
        self.assertEqual(len(combined.words), 2)
        self.assertEqual(combined.words[0]["word"], "hello")
        self.assertEqual(combined.words[1]["word"], "world")

    def test_render_utterances_skips_invalid_transcript_markers(self) -> None:
        audio = AudioSegment.silent(duration=1000)
        transcription = TranscriptionArtifacts(
            language="en",
            detected_language="en",
            final_segments=[{"start": 0.0, "end": 0.5, "text": " Thank you."}],
            source_segments=[{"start": 0.0, "end": 0.5, "text": " Thank you."}],
            alignment_segments=[
                {
                    "start": 0.0,
                    "end": 0.5,
                    "words": [
                        {"start": 0.0, "end": 0.5, "word": "Thank"},
                        {"start": 0.5, "end": 0.6, "word": "you."},
                    ],
                }
            ],
            translation_segments=None,
            prompt_text="",
        )
        interval = Interval(
            index=0,
            start=0.0,
            end=0.5,
            words=[{"start": 0.0, "end": 0.5, "word": "Thank you."}],
        )

        output_root = Path(self.temp_dir.name) / "output"
        outputs = render_utterances(
            audio,
            transcription,
            [interval],
            "1_SG_1",
            TRANSCRIPTION_MODULE.dt.datetime(2024, 1, 1, 0, 0, 0),
            output_root,
        )

        self.assertEqual(outputs, [])
        self.assertFalse(output_root.exists())

    def test_render_utterances_writes_valid_transcript(self) -> None:
        audio = AudioSegment.silent(duration=1000)
        transcription = TranscriptionArtifacts(
            language="en",
            detected_language="en",
            final_segments=[
                {
                    "start": 0.0,
                    "end": 0.5,
                    "text": "Hello from orbit",
                    "words": [
                        {"start": 0.0, "end": 0.25, "word": "Hello"},
                        {"start": 0.25, "end": 0.5, "word": "from"},
                        {"start": 0.5, "end": 0.75, "word": "orbit"},
                    ],
                }
            ],
            source_segments=[
                {
                    "start": 0.0,
                    "end": 0.5,
                    "text": "Hello from orbit",
                    "words": [
                        {"start": 0.0, "end": 0.25, "word": "Hello"},
                        {"start": 0.25, "end": 0.5, "word": "from"},
                        {"start": 0.5, "end": 0.75, "word": "orbit"},
                    ],
                }
            ],
            alignment_segments=[
                {
                    "start": 0.0,
                    "end": 0.5,
                    "words": [
                        {"start": 0.0, "end": 0.25, "word": "Hello"},
                        {"start": 0.25, "end": 0.5, "word": "from"},
                        {"start": 0.5, "end": 0.75, "word": "orbit"},
                    ],
                }
            ],
            translation_segments=None,
            prompt_text="",
        )
        interval = Interval(
            index=0,
            start=0.0,
            end=0.5,
            words=[
                {"start": 0.0, "end": 0.25, "word": "Hello"},
                {"start": 0.25, "end": 0.5, "word": "from"},
                {"start": 0.5, "end": 0.75, "word": "orbit"},
            ],
        )

        output_root = Path(self.temp_dir.name) / "valid_output"
        outputs = render_utterances(
            audio,
            transcription,
            [interval],
            "1_SG_1",
            TRANSCRIPTION_MODULE.dt.datetime(2024, 1, 1, 0, 0, 0),
            output_root,
        )

        self.assertEqual(len(outputs), 1)
        json_path = outputs[0]
        self.assertTrue(json_path.exists())
        aac_path = json_path.with_suffix(".aac")
        self.assertTrue(aac_path.exists())


if __name__ == "__main__":
    unittest.main()
