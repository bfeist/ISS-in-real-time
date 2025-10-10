from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

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
transcribe_full_wav = TRANSCRIPTION_MODULE.transcribe_full_wav
WhisperResources = TRANSCRIPTION_MODULE.WhisperResources
AlignmentModelUnavailableError = TRANSCRIPTION_MODULE.AlignmentModelUnavailableError


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
        self.assertIn("Channel: SG 1", prompt)

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
        self.assertIn("Channel: SG 2", prompt)

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

    def test_slice_segments_to_interval_trims_text_without_words(self) -> None:
        segments = [
            {
                "start": 0.0,
                "end": 10.0,
                "text": "Houston Station on two, go ahead and confirm signal lock.",
            }
        ]

        sliced = slice_segments_to_interval(
            segments,
            2.0,
            4.0,
            allow_approximate_text=True,
        )

        self.assertEqual(len(sliced), 1)
        seg = sliced[0]
        self.assertAlmostEqual(seg["start"], 0.0)
        self.assertGreater(seg["end"], 0.0)
        self.assertTrue(seg.get("text"))
        self.assertNotEqual(seg.get("text"), segments[0]["text"])

    def test_slice_segments_to_interval_skips_text_without_words_when_disallowed(
        self,
    ) -> None:
        segments = [
            {
                "start": 0.0,
                "end": 5.0,
                "text": "Un-timestamped text should be dropped",
            }
        ]

        sliced = slice_segments_to_interval(segments, 0.0, 2.5)

        self.assertEqual(len(sliced), 1)
        seg = sliced[0]
        self.assertNotIn("text", seg)

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
        source_wav_path = Path(self.temp_dir.name) / "source.wav"
        export_handle = audio.export(source_wav_path, format="wav")
        if hasattr(export_handle, "close"):
            export_handle.close()
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
            end=0.6,
            words=[
                {"start": 0.0, "end": 0.5, "word": "Thank"},
                {"start": 0.5, "end": 0.6, "word": "you."},
            ],
        )

        output_root = Path(self.temp_dir.name) / "output"
        preview_segments = slice_segments_to_interval(
            transcription.alignment_segments,
            interval.start,
            interval.end,
        )
        self.assertEqual(preview_segments[0]["text"], "Thank you.")
        with mock.patch.object(
            TRANSCRIPTION_MODULE,
            "export_utterances_with_ffmpeg",
            return_value=False,
        ):
            outputs = render_utterances(
                source_wav_path,
                audio,
                transcription,
                [interval],
                "1_SG_1",
                TRANSCRIPTION_MODULE.dt.datetime(2024, 1, 1, 0, 0, 0),
                output_root,
            )

        self.assertEqual(outputs, [])
        self.assertFalse(output_root.exists())

    def test_render_utterances_skips_empty_segments(self) -> None:
        audio = AudioSegment.silent(duration=1000)
        source_wav_path = Path(self.temp_dir.name) / "empty_source.wav"
        export_handle = audio.export(source_wav_path, format="wav")
        if hasattr(export_handle, "close"):
            export_handle.close()
        transcription = TranscriptionArtifacts(
            language="en",
            detected_language="en",
            final_segments=[
                {
                    "start": 0.0,
                    "end": 0.5,
                    "text": " ",
                    "words": [],
                }
            ],
            source_segments=[
                {
                    "start": 0.0,
                    "end": 0.5,
                    "text": " ",
                    "words": [],
                }
            ],
            alignment_segments=[
                {
                    "start": 0.0,
                    "end": 0.5,
                    "words": [],
                }
            ],
            translation_segments=None,
            prompt_text="",
        )
        interval = Interval(index=0, start=0.0, end=0.5, words=[])
        output_root = Path(self.temp_dir.name) / "empty_output"

        with mock.patch.object(
            TRANSCRIPTION_MODULE,
            "export_utterances_with_ffmpeg",
            return_value=False,
        ) as mocked_export:
            outputs = render_utterances(
                source_wav_path,
                audio,
                transcription,
                [interval],
                "1_SG_1",
                TRANSCRIPTION_MODULE.dt.datetime(2024, 1, 1, 0, 0, 0),
                output_root,
            )

        self.assertEqual(outputs, [])
        mocked_export.assert_not_called()
        self.assertFalse(output_root.exists())

    def test_render_utterances_writes_valid_transcript(self) -> None:
        audio = AudioSegment.silent(duration=1000)
        source_wav_path = Path(self.temp_dir.name) / "valid_source.wav"
        export_handle = audio.export(source_wav_path, format="wav")
        if hasattr(export_handle, "close"):
            export_handle.close()
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
        with mock.patch.object(
            TRANSCRIPTION_MODULE,
            "export_utterances_with_ffmpeg",
            return_value=False,
        ):
            outputs = render_utterances(
                source_wav_path,
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

    def test_get_alignment_model_caches_missing_languages(self) -> None:
        resources = WhisperResources(base_model=mock.Mock(), align_models={})

        with mock.patch.object(
            TRANSCRIPTION_MODULE.whisperx,
            "load_align_model",
            side_effect=ValueError("No default align-model for language: haw"),
        ) as mocked_loader:
            with self.assertRaises(AlignmentModelUnavailableError):
                resources.get_alignment_model("haw")

            self.assertIn("haw", resources.align_models)
            self.assertEqual(resources.align_models["haw"], (None, None))

            with self.assertRaises(AlignmentModelUnavailableError):
                resources.get_alignment_model("haw")

            self.assertEqual(mocked_loader.call_count, 1)

    def test_transcribe_full_wav_falls_back_when_alignment_missing(self) -> None:
        cache_dir = Path(self.temp_dir.name) / "cache"
        cache_dir.mkdir(parents=True, exist_ok=True)

        wav_path = Path(self.temp_dir.name) / "hawaiian.wav"
        wav_path.write_bytes(b"\x00\x00")

        resources = WhisperResources(base_model=mock.Mock(), align_models={})

        primary_segments = [
            {
                "start": 0.0,
                "end": 0.5,
                "text": "aloha",
                "words": [
                    {"start": 0.0, "end": 0.25, "word": "alo"},
                    {"start": 0.25, "end": 0.5, "word": "ha"},
                ],
            }
        ]
        translation_segments = [
            {
                "start": 0.0,
                "end": 0.5,
                "text": "hello",
                "words": [
                    {"start": 0.0, "end": 0.5, "word": "hello"},
                ],
            }
        ]

        with mock.patch.object(
            TRANSCRIPTION_MODULE,
            "transcribe_with_model",
            side_effect=[
                {"language": "haw", "segments": primary_segments},
                {"segments": translation_segments},
            ],
        ) as mocked_transcribe, mock.patch.object(
            TRANSCRIPTION_MODULE.whisperx,
            "load_audio",
            return_value=mock.Mock(name="audio"),
        ), mock.patch.object(
            resources,
            "get_alignment_model",
            side_effect=AlignmentModelUnavailableError("haw"),
        ), mock.patch.object(
            TRANSCRIPTION_MODULE.whisperx,
            "align",
        ) as mocked_align:
            artifacts = transcribe_full_wav(
                wav_path,
                "1_SG_1",
                TRANSCRIPTION_MODULE.dt.datetime(2024, 1, 1, 0, 0, 0),
                "prompt",
                resources,
                cache_dir,
                force=True,
            )

        self.assertEqual(mocked_transcribe.call_count, 2)
        mocked_align.assert_not_called()
        self.assertEqual(artifacts.detected_language, "haw")
        self.assertEqual(artifacts.source_segments, primary_segments)
        self.assertEqual(artifacts.alignment_segments, primary_segments)
        self.assertEqual(artifacts.final_segments, translation_segments)


if __name__ == "__main__":
    unittest.main()
