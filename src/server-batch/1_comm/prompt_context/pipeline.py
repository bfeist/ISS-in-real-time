from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional

from .config import PromptContextConfig
from .crew import CrewPromptBuilder
from .daily_brief import DailyBriefBuilder
from .ollama import OllamaClient
from .prompt_synthesizer import PromptSynthesizer


@dataclass(slots=True)
class DailyPipelineResult:
    date: str
    prompt_path: Path
    meta_path: Path
    roster_path: Path
    brief_path: Path
    prompt_input_path: Path
    elapsed_seconds: float
    characters: int


class PromptContextPipeline:
    """High-level orchestration for prompt context preprocessing."""

    def __init__(
        self,
        config: PromptContextConfig,
        ollama: Optional[OllamaClient] = None,
    ) -> None:
        self.config = config
        self.ollama = ollama or OllamaClient()
        self.crew_builder = CrewPromptBuilder(config)
        self.brief_builder = DailyBriefBuilder(config, self.ollama)
        self.prompt_synthesizer = PromptSynthesizer(
            config, self.ollama, self.crew_builder, self.brief_builder
        )

    def day_directory(self, date_str: str) -> Path:
        year, month, day = date_str.split("-")
        day_dir = self.config.prompt_context_root / year / month / day
        day_dir.mkdir(parents=True, exist_ok=True)
        return day_dir

    def process_date(
        self,
        date_str: str,
        *,
        force: bool = False,
        on_event=None,
        status_callback=None,
    ) -> DailyPipelineResult:
        day_dir = self.day_directory(date_str)
        prompt_path = day_dir / "prompt.txt"
        if prompt_path.exists() and not force:
            if status_callback:
                status_callback("skip", {"date": date_str, "reason": "prompt exists"})
            meta_path = day_dir / "prompt_meta.json"
            roster_path = day_dir / "crew_roster.json"
            brief_path = day_dir / "daily_brief.json"
            prompt_input_path = day_dir / "prompt_input.json"
            existing_meta = (
                json.loads(meta_path.read_text(encoding="utf-8"))
                if meta_path.exists()
                else {}
            )
            return DailyPipelineResult(
                date=date_str,
                prompt_path=prompt_path,
                meta_path=meta_path,
                roster_path=roster_path,
                brief_path=brief_path,
                prompt_input_path=prompt_input_path,
                elapsed_seconds=existing_meta.get("elapsed_seconds", 0.0),
                characters=len(prompt_path.read_text(encoding="utf-8")),
            )

        if status_callback:
            status_callback("crew", {"date": date_str, "stage": "building"})
        if on_event:
            on_event({"debug": "[CREW] Building daily roster"})
        roster = self.crew_builder.build_daily_roster(date_str=date_str)
        roster_path = self.crew_builder.save_roster(roster, output_dir=day_dir)
        if on_event:
            on_event(
                {
                    "debug": f"[CREW] Roster saved: {len(roster.get('samples', []))} samples"
                }
            )

        if status_callback:
            status_callback("brief", {"date": date_str, "stage": "building"})
        if on_event:
            on_event({"debug": "[BRIEF] Building daily brief"})
        brief = self.brief_builder.build_daily_brief(
            date_str=date_str, output_dir=day_dir, on_event=on_event
        )
        brief_path = day_dir / "daily_brief.json"
        if on_event:
            on_event({"debug": "[BRIEF] Brief completed"})

        if on_event:
            on_event({"debug": "[VOCAB] Loading static vocabulary"})
        vocab = self.prompt_synthesizer.load_static_vocab()
        if on_event:
            on_event(
                {
                    "debug": f"[VOCAB] Loaded {len(vocab.call_signs)} call signs, {len(vocab.acronyms)} acronyms"
                }
            )
        prompt_input = self.prompt_synthesizer.assemble_prompt_input(
            date_str=date_str,
            roster=roster,
            brief=brief,
            vocab=vocab,
            output_dir=day_dir,
        )
        prompt_input_path = day_dir / "prompt_input.json"
        if on_event:
            on_event({"debug": "[VOCAB] Prompt input assembled"})

        if status_callback:
            status_callback("prompt", {"date": date_str, "stage": "generating"})
        if on_event:
            on_event({"debug": "[PROMPT] Synthesizing final prompt"})
        prompt_text, _, elapsed = self.prompt_synthesizer.synthesize_prompt(
            date_str=date_str,
            prompt_input=prompt_input,
            output_dir=day_dir,
            on_event=on_event,
        )
        prompt_path = day_dir / "prompt.txt"
        meta_path = day_dir / "prompt_meta.json"

        if status_callback:
            status_callback(
                "done",
                {
                    "date": date_str,
                    "characters": len(prompt_text),
                    "elapsed": elapsed,
                    "prompt_path": str(prompt_path),
                },
            )

        return DailyPipelineResult(
            date=date_str,
            prompt_path=prompt_path,
            meta_path=meta_path,
            roster_path=roster_path,
            brief_path=brief_path,
            prompt_input_path=prompt_input_path,
            elapsed_seconds=elapsed,
            characters=len(prompt_text),
        )
