from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Dict, List
from unittest.mock import Mock

PACKAGE_ROOT = Path(__file__).resolve().parents[1] / "1_comm"
sys.path.insert(0, str(PACKAGE_ROOT))

from prompt_context.config import PromptContextConfig  # type: ignore[import]
from prompt_context.crew import CrewPromptBuilder  # type: ignore[import]
from prompt_context.daily_brief import DailyBriefBuilder  # type: ignore[import]
from prompt_context.strata import (  # type: ignore[import]
    GenerationMetrics,
    GenerationResult,
    StrataClient,
)
from prompt_context.pipeline import PromptContextPipeline  # type: ignore[import]
from prompt_context.prompt_synthesizer import PromptSynthesizer  # type: ignore[import]

FIXTURE_DIR = Path(__file__).resolve().parents[2] / "tests" / "mock_data"
CREW_FIXTURE = FIXTURE_DIR / "iss_crew_arr_dep.json"


class FakeStrataClient(StrataClient):
    def __init__(self, responses: List[str]) -> None:  # type: ignore[override]
        self._responses = responses
        self.calls: List[str] = []

    def generate(self, prompt: str, **_: Dict) -> GenerationResult:  # type: ignore[override]
        self.calls.append(prompt)
        if not self._responses:
            raise RuntimeError("No fake responses remaining")
        text = self._responses.pop(0)
        metrics = GenerationMetrics(model="fake-model")
        return GenerationResult(
            text=text, metrics=metrics, raw_events=[{"response": text, "done": True}]
        )


class PromptContextTests(unittest.TestCase):
    def setUp(self) -> None:  # noqa: D401
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.raw_folder = Path(self.temp_dir.name) / "raw"
        self.raw_folder.mkdir(parents=True, exist_ok=True)
        self.web_assets = Path(self.temp_dir.name) / "web_assets"
        self.web_assets.mkdir(parents=True, exist_ok=True)

        os.environ["RAW_FOLDER"] = str(self.raw_folder)
        os.environ["WEB_ASSETS_FOLDER"] = str(self.web_assets)
        os.environ["IA_ZIP_SG_FOLDER"] = str(self.raw_folder / "ia_sg")
        os.environ["IA_ZIP_AG_FOLDER"] = str(self.raw_folder / "ia_ag")

        crew_target = self.web_assets / "crew_arr_dep.json"
        crew_target.write_text(
            CREW_FIXTURE.read_text(encoding="utf-8"), encoding="utf-8"
        )

        self.config = PromptContextConfig(
            repo_root=Path(self.temp_dir.name), env_file=None
        )
        self.crew_builder = CrewPromptBuilder(self.config)

    def test_roster_matches_typescript_expectations(self) -> None:
        roster = self.crew_builder.build_daily_roster(date_str="2000-12-01")
        first_sample = roster["samples"][0]["crew"]
        names = [member["name_first"] for member in first_sample]
        self.assertEqual(
            names,
            ["Yuri", "Sergei", "William"],
        )

    def test_roster_includes_handover_notes(self) -> None:
        roster = self.crew_builder.build_daily_roster(date_str="2001-03-21")
        self.assertIn("notes", roster)
        notes = roster["notes"]
        self.assertTrue(any("Departures" in note for note in notes))
        samples = roster["samples"]
        self.assertEqual(samples[0]["sample_time"], "2001-03-21T00:00:00Z")
        self.assertEqual(samples[-1]["sample_time"], "2001-03-21T23:59:59Z")

    def test_daily_brief_handles_missing_sources(self) -> None:
        fake_client = FakeStrataClient(
            [json.dumps({"blog_topics": [], "comms_focus": []})]
        )
        brief_builder = DailyBriefBuilder(self.config, fake_client)
        day_dir = self.config.prompt_context_root / "2000" / "12" / "01"
        brief = brief_builder.build_daily_brief(
            date_str="2000-12-01", output_dir=day_dir
        )
        self.assertEqual(brief["blog_topics"], [])
        self.assertEqual(brief["comms_focus"], [])
        self.assertTrue((day_dir / "daily_brief.json").exists())
        self.assertEqual(fake_client.calls, [])

    def test_empty_sources_ignore_previously_invented_cached_summary(self) -> None:
        client = FakeStrataClient([])
        builder = DailyBriefBuilder(self.config, client)
        sections = {"payload_highlights": [], "blog_headlines": []}
        day_dir = self.config.prompt_context_root / "2000" / "12" / "01"
        cache_dir = day_dir / "blog_cache"
        cache_dir.mkdir(parents=True)
        key = builder._compute_summary_cache_key([], sections)
        (cache_dir / f"summary_{key}.json").write_text(json.dumps({
            "blog_topics": ["Invented activity"], "comms_focus": ["Invented briefing"]
        }), encoding="utf-8")
        summary = builder._summarize_with_strata(
            date_str="2000-12-01", articles=[], summary_sections=sections, cache_dir=cache_dir
        )
        self.assertEqual(summary, ([], []))
        self.assertEqual(client.calls, [])

    def test_bad_json_summary_is_retried_and_failed_response_is_saved(self) -> None:
        client = FakeStrataClient([
            "There are no updates.",
            json.dumps({"blog_topics": ["Cargo transfer"], "comms_focus": ["Cargo ops"]}),
        ])
        builder = DailyBriefBuilder(self.config, client)
        cache_dir = self.raw_folder / "retry-cache"
        result = builder._summarize_with_strata(
            date_str="2000-12-01", articles=[],
            summary_sections={"payload_highlights": ["Cargo transfer"]}, cache_dir=cache_dir,
        )
        self.assertEqual(result, (["Cargo transfer"], ["Cargo ops"]))
        self.assertEqual(len(client.calls), 2)
        self.assertEqual(next(cache_dir.glob("*.attempt-1.txt")).read_text(encoding="utf-8"),
                         "There are no updates.")

    def test_bad_json_summary_retry_is_bounded_and_does_not_cache_success(self) -> None:
        client = FakeStrataClient(["Not JSON", '{"blog_topics": "wrong type", "comms_focus": []}'])
        builder = DailyBriefBuilder(self.config, client)
        cache_dir = self.raw_folder / "failed-cache"
        with self.assertRaisesRegex(ValueError, "after 2 attempts.*Response saved"):
            builder._summarize_with_strata(
                date_str="2000-12-01", articles=[],
                summary_sections={"payload_highlights": ["Cargo transfer"]}, cache_dir=cache_dir,
            )
        self.assertEqual(len(client.calls), 2)
        self.assertEqual(list(cache_dir.glob("summary_*.json")), [])
        self.assertEqual(len(list(cache_dir.glob("*.txt"))), 2)

    def test_interrupted_summary_is_retried_even_if_partial_text_is_valid_json(self) -> None:
        text = '{"blog_topics": ["Cargo transfer"], "comms_focus": []}'
        client = Mock()
        client.generate.side_effect = [
            GenerationResult(text, GenerationMetrics(was_terminated=True,
                termination_reason="length limit"), []),
            GenerationResult(text, GenerationMetrics(), []),
        ]
        result = DailyBriefBuilder(self.config, client)._summarize_with_strata(
            date_str="2000-12-01", articles=[],
            summary_sections={"payload_highlights": ["Cargo transfer"]},
            cache_dir=self.raw_folder / "interrupted-cache",
        )
        self.assertEqual(result, (["Cargo transfer"], []))
        self.assertEqual(client.generate.call_count, 2)
        self.assertEqual(client.generate.call_args.kwargs["max_length"], 12000)

    def test_json_extraction_handles_fences_and_unrelated_braces(self) -> None:
        builder = DailyBriefBuilder(self.config, FakeStrataClient([]))
        result = GenerationResult(
            text='Ignore {example}.\n```json\n{"blog_topics": ["Cargo"], "comms_focus": []}\n```',
            metrics=GenerationMetrics(), raw_events=[],
        )
        self.assertEqual(builder._parse_summary_response(result), (["Cargo"], []))
        for text in ('{}', '{"blog_topics": [42], "comms_focus": []}'):
            with self.subTest(text=text), self.assertRaises(ValueError):
                builder._parse_summary_response(GenerationResult(text, GenerationMetrics(), []))

    def test_pipeline_rebuilds_cached_prompt_with_unsupported_summary(self) -> None:
        day_dir = self.config.prompt_context_root / "2000" / "12" / "01"
        day_dir.mkdir(parents=True)
        (day_dir / "prompt.txt").write_text("Invented activities", encoding="utf-8")
        (day_dir / "daily_brief.json").write_text(json.dumps({
            "blog_topics": ["Invented activities"], "comms_focus": [],
            "payload_highlights": [], "systems_work": [], "planned_activities": [],
            "ground_ops": [], "blog_headlines": [],
        }), encoding="utf-8")
        glossary = "Yuri, Sergei, William, Houston, Moscow, Tsukuba, Munich, Huntsville, space-to-ground, Soyuz, Zvezda, Unity, Zarya, MCC, ISS, EVA, ECLSS, communications, crew, station, telemetry, docking, life support, orbital operations"
        client = FakeStrataClient([glossary])
        result = PromptContextPipeline(self.config, client).process_date("2000-12-01")
        self.assertFalse(result.skipped)
        self.assertNotIn("Invented", result.prompt_path.read_text(encoding="utf-8"))
        brief = json.loads(result.brief_path.read_text(encoding="utf-8"))
        self.assertEqual(brief["blog_topics"], [])
        self.assertEqual(len(client.calls), 1)

    def test_pipeline_still_skips_cached_prompt_with_grounded_brief(self) -> None:
        day_dir = self.config.prompt_context_root / "2000" / "12" / "01"
        day_dir.mkdir(parents=True)
        (day_dir / "prompt.txt").write_text("Cargo transfer", encoding="utf-8")
        (day_dir / "daily_brief.json").write_text(json.dumps({
            "payload_highlights": ["Cargo transfer"], "blog_topics": ["Cargo transfer"]
        }), encoding="utf-8")
        client = FakeStrataClient([])
        result = PromptContextPipeline(self.config, client).process_date("2000-12-01")
        self.assertTrue(result.skipped)
        self.assertEqual(client.calls, [])

    def test_daily_brief_uses_cached_summary(self) -> None:
        responses = [
            json.dumps({"blog_topics": ["Maintenance"], "comms_focus": ["Cargo ops"]})
        ]
        first_client = FakeStrataClient(list(responses))
        brief_builder = DailyBriefBuilder(self.config, first_client)
        day_dir = self.config.prompt_context_root / "2000" / "12" / "02"

        activity_dir = self.web_assets / "activity_summaries" / "2000" / "12"
        activity_dir.mkdir(parents=True, exist_ok=True)
        (activity_dir / "activity_summary_2000-12-02.json").write_text(
            json.dumps({"payloads": [{"name": "Experiment"}]}),
            encoding="utf-8",
        )

        articles_dir = self.web_assets / "blog_articles" / "2000" / "12" / "02"
        articles_dir.mkdir(parents=True, exist_ok=True)
        (articles_dir / "articles.json").write_text(
            json.dumps(
                [
                    {
                        "title": "Daily",
                        "paragraphs": ["Cargo transfer continues."],
                        "source_url": "https://example.test/article",
                    }
                ]
            ),
            encoding="utf-8",
        )

        brief_builder.build_daily_brief(date_str="2000-12-02", output_dir=day_dir)
        self.assertEqual(len(first_client.calls), 1)

        cached_client = FakeStrataClient([])
        cached_builder = DailyBriefBuilder(self.config, cached_client)
        brief = cached_builder.build_daily_brief(
            date_str="2000-12-02", output_dir=day_dir
        )
        self.assertEqual(brief["blog_topics"], ["Maintenance"])
        self.assertEqual(brief["comms_focus"], ["Cargo ops"])
        self.assertEqual(len(cached_client.calls), 0)

    def test_pipeline_generates_trimmed_prompt(self) -> None:
        activity_dir = self.web_assets / "activity_summaries" / "2000" / "12"
        activity_dir.mkdir(parents=True, exist_ok=True)
        (activity_dir / "activity_summary_2000-12-01.json").write_text(
            json.dumps(
                {
                    "payloads": [
                        {"name": "Microgravity ops", "description": "Science"}
                    ],
                    "systems": [{"name": "Life support"}],
                    "tasklist": [{"name": "Maintenance"}],
                    "ground": [{"name": "Network upgrade"}],
                }
            ),
            encoding="utf-8",
        )

        articles_dir = self.web_assets / "blog_articles" / "2000" / "12" / "01"
        articles_dir.mkdir(parents=True, exist_ok=True)
        (articles_dir / "articles.json").write_text(
            json.dumps(
                [
                    {
                        "title": "ISS Daily Report",
                        "paragraphs": [
                            "Crew completed maintenance and prepared for cargo operations.",
                            "Focus remains on expedition handover activities.",
                        ],
                        "source_url": "https://example.test/article",
                    }
                ]
            ),
            encoding="utf-8",
        )

        fake_responses = [
            json.dumps(
                {
                    "blog_topics": ["Maintenance operations"],
                    "comms_focus": ["Cargo prep timeline"],
                }
            ),
            "This is a deliberately long prompt describing operations and crew status that will be trimmed to meet the character requirement."
            * 5,
            # Add a shortened response for the refinement call
            "Yuri, Sergei, William, Maintenance, Cargo ops, Life support, Network, ISS, MCC, Houston, Moscow, Tsukuba, EVA, ECLSS, payload",
        ]
        fake_client = FakeStrataClient(fake_responses)
        pipeline = PromptContextPipeline(self.config, fake_client)

        result = pipeline.process_date("2000-12-01", force=True)

        prompt_text = result.prompt_path.read_text(encoding="utf-8")
        self.assertLessEqual(len(prompt_text), 250)
        self.assertTrue((result.meta_path).exists())
        self.assertTrue((result.brief_path).exists())
        self.assertTrue((result.prompt_input_path).exists())

    def test_static_vocab_is_combined_and_deduped(self) -> None:
        vocab_dir = Path(self.temp_dir.name) / "static_vocab"
        vocab_dir.mkdir(parents=True, exist_ok=True)
        (vocab_dir / "call_signs.txt").write_text(
            "Alpha\nBravo\n",
            encoding="utf-8",
        )
        (vocab_dir / "acronyms.txt").write_text(
            "EVA\nECLSS\n",
            encoding="utf-8",
        )
        (vocab_dir / "static_vocab.json").write_text(
            json.dumps(
                {"call_signs": ["Bravo", "Charlie"], "acronyms": ["EVA", "MCC"]}
            ),
            encoding="utf-8",
        )

        prev_vocab = os.environ.get("PROMPT_CONTEXT_STATIC_VOCAB")
        os.environ["PROMPT_CONTEXT_STATIC_VOCAB"] = str(vocab_dir)
        if prev_vocab is None:
            self.addCleanup(lambda: os.environ.pop("PROMPT_CONTEXT_STATIC_VOCAB", None))
        else:
            self.addCleanup(
                lambda: os.environ.__setitem__(
                    "PROMPT_CONTEXT_STATIC_VOCAB", prev_vocab
                )
            )
        config = PromptContextConfig(repo_root=Path(self.temp_dir.name), env_file=None)
        fake_client = FakeStrataClient(
            [json.dumps({"blog_topics": [], "comms_focus": []})]
        )
        crew_builder = CrewPromptBuilder(config)
        brief_builder = DailyBriefBuilder(config, fake_client)
        synthesizer = PromptSynthesizer(
            config, fake_client, crew_builder, brief_builder
        )

        vocab = synthesizer.load_static_vocab()
        self.assertEqual(vocab.call_signs, ["Alpha", "Bravo", "Charlie"])
        self.assertEqual(vocab.acronyms, ["EVA", "ECLSS", "MCC"])


if __name__ == "__main__":
    unittest.main()
