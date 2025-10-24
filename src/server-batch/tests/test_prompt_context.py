from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Dict, List

PACKAGE_ROOT = Path(__file__).resolve().parents[1] / "1_comm"
sys.path.insert(0, str(PACKAGE_ROOT))

from prompt_context.config import PromptContextConfig  # type: ignore[import]
from prompt_context.crew import CrewPromptBuilder  # type: ignore[import]
from prompt_context.daily_brief import DailyBriefBuilder  # type: ignore[import]
from prompt_context.ollama import (  # type: ignore[import]
    GenerationMetrics,
    GenerationResult,
    OllamaClient,
)
from prompt_context.pipeline import PromptContextPipeline  # type: ignore[import]
from prompt_context.prompt_synthesizer import PromptSynthesizer  # type: ignore[import]

FIXTURE_DIR = Path(__file__).resolve().parents[2] / "tests" / "mock_data"
CREW_FIXTURE = FIXTURE_DIR / "iss_crew_arr_dep.json"


class FakeOllamaClient(OllamaClient):
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
        fake_client = FakeOllamaClient(
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

    def test_daily_brief_uses_cached_summary(self) -> None:
        responses = [
            json.dumps({"blog_topics": ["Maintenance"], "comms_focus": ["Cargo ops"]})
        ]
        first_client = FakeOllamaClient(list(responses))
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

        cached_client = FakeOllamaClient([])
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
        fake_client = FakeOllamaClient(fake_responses)
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
        fake_client = FakeOllamaClient(
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
