from __future__ import annotations

import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

from .config import PromptContextConfig
from .crew import CrewPromptBuilder
from .daily_brief import DailyBriefBuilder
from .ollama import GenerationResult, OllamaClient

PROMPT_CHAR_LIMIT = 250


@dataclass(slots=True)
class StaticVocab:
    call_signs: List[str]
    acronyms: List[str]


class PromptSynthesizer:
    """Combine context inputs and call Ollama to synthesize final prompt."""

    def __init__(
        self,
        config: PromptContextConfig,
        ollama: OllamaClient,
        crew_builder: CrewPromptBuilder,
        brief_builder: DailyBriefBuilder,
    ) -> None:
        self.config = config
        self.ollama = ollama
        self.crew_builder = crew_builder
        self.brief_builder = brief_builder

    def load_static_vocab(self) -> StaticVocab:
        directory = self.config.static_vocab_dir
        if not directory or not directory.exists():
            return StaticVocab(call_signs=[], acronyms=[])

        call_signs = self._load_vocab_file(directory / "call_signs.txt")
        acronyms = self._load_vocab_file(directory / "acronyms.txt")

        if (directory / "static_vocab.json").exists():
            data = json.loads(
                (directory / "static_vocab.json").read_text(encoding="utf-8")
            )
            call_signs.extend(data.get("call_signs", []))
            acronyms.extend(data.get("acronyms", []))

        # Deduplicate while preserving order
        call_signs = list(
            dict.fromkeys(filter(None, (item.strip() for item in call_signs)))
        )
        acronyms = list(
            dict.fromkeys(filter(None, (item.strip() for item in acronyms)))
        )
        return StaticVocab(call_signs=call_signs, acronyms=acronyms)

    def _load_vocab_file(self, path: Path) -> List[str]:
        if not path.exists():
            return []
        return [
            line.strip()
            for line in path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]

    def assemble_prompt_input(
        self,
        *,
        date_str: str,
        roster: dict,
        brief: dict,
        vocab: StaticVocab,
        output_dir: Path,
    ) -> dict:
        prompt_input = {
            "date": date_str,
            "crew": roster,
            "activities": {
                "payload_highlights": brief.get("payload_highlights", []),
                "systems_work": brief.get("systems_work", []),
                "planned_activities": brief.get("planned_activities", []),
                "ground_ops": brief.get("ground_ops", []),
            },
            "blog_topics": brief.get("blog_topics", []),
            "comms_focus": brief.get("comms_focus", []),
            "call_signs": vocab.call_signs,
            "acronyms": vocab.acronyms,
            "custom_terms": self.config.custom_terms,
        }
        output_path = output_dir / "prompt_input.json"
        output_path.write_text(
            json.dumps(prompt_input, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        return prompt_input

    def synthesize_prompt(
        self,
        *,
        date_str: str,
        prompt_input: dict,
        output_dir: Path,
        on_event=None,
    ) -> tuple[str, GenerationResult, float]:
        if on_event:
            on_event({"debug": "[PROMPT] Building generation prompt"})
        prompt = self._build_generation_prompt(prompt_input)
        if on_event:
            on_event({"debug": f"[PROMPT] Prompt length: {len(prompt)} chars"})
        started = time.perf_counter()

        # First attempt: generate initial prompt
        if on_event:
            on_event({"debug": "[PROMPT] Calling Ollama (initial generation)"})
        result = self.ollama.generate(prompt, on_event=on_event, max_length=2000)

        # Check if generation was terminated due to infinite loop
        if result.metrics.was_terminated:
            msg = f"⚠️  Generation was terminated: {result.metrics.termination_reason}"
            print(msg)
            if on_event:
                on_event({"debug": f"[PROMPT] {msg}"})

        text = result.text.strip().replace("\n", " ")
        char_count = len(text)
        if on_event:
            on_event({"debug": f"[PROMPT] Initial generation: {char_count} chars"})

        iteration = 1
        all_raw_events = list(result.raw_events)

        # Smart truncation: if we have a simple comma-separated list, just truncate intelligently
        # Otherwise, use AI refinement for complex outputs
        use_smart_truncation = False
        if char_count > PROMPT_CHAR_LIMIT:
            # Check if it's a simple comma-separated list (common for our use case)
            if text.count(",") > 5 and "\n" not in text and ":" not in text[:50]:
                use_smart_truncation = True
                if on_event:
                    on_event(
                        {
                            "debug": f"[PROMPT] Using smart truncation (simple list detected)"
                        }
                    )

                # Smart processing: deduplicate, normalize, and prioritize
                # Split by common separators
                terms = []
                for part in text.replace(";", ",").split(","):
                    part = part.strip()
                    if part:
                        terms.append(part)

                # Deduplicate while preserving order (case-insensitive comparison)
                seen_lower = set()
                unique_terms = []
                for term in terms:
                    term_lower = term.lower()
                    if term_lower not in seen_lower:
                        seen_lower.add(term_lower)
                        unique_terms.append(term)

                if on_event and len(terms) > len(unique_terms):
                    on_event(
                        {
                            "debug": f"[PROMPT] Removed {len(terms) - len(unique_terms)} duplicate terms"
                        }
                    )

                # Prioritize terms (crew names, custom terms, acronyms come first)
                custom_terms_lower = {
                    t.lower() for t in prompt_input.get("custom_terms", [])
                }
                crew_names = {
                    member["name_first"].lower()
                    for sample in prompt_input.get("crew", {}).get("samples", [])
                    for member in sample.get("crew", [])
                }

                priority_terms = []
                normal_terms = []
                for term in unique_terms:
                    term_lower = term.lower()
                    # Check if it's a custom term, crew name, or looks like an acronym
                    is_priority = (
                        term_lower in custom_terms_lower
                        or term_lower in crew_names
                        or (term.isupper() and len(term) >= 2)  # Acronym
                    )
                    if is_priority:
                        priority_terms.append(term)
                    else:
                        normal_terms.append(term)

                # Rebuild text with priority terms first
                all_terms = priority_terms + normal_terms
                text = ", ".join(all_terms)
                char_count = len(text)

                if on_event:
                    on_event(
                        {
                            "debug": f"[PROMPT] After deduplication: {char_count} chars ({len(priority_terms)} priority, {len(normal_terms)} normal)"
                        }
                    )

                # Truncate at last complete term before limit if still too long
                if char_count > PROMPT_CHAR_LIMIT:
                    truncated = text[:PROMPT_CHAR_LIMIT]
                    last_comma = truncated.rfind(",")
                    if last_comma > 0:
                        text = truncated[:last_comma].rstrip()
                        char_count = len(text)
                        if on_event:
                            on_event(
                                {
                                    "debug": f"[PROMPT] After truncation: {char_count} chars"
                                }
                            )

        # Only refine if significantly outside the acceptable range (200-250)
        # We only do ONE refinement pass if needed
        if char_count > PROMPT_CHAR_LIMIT and not use_smart_truncation:
            # Too long - need to shorten
            difference = char_count - PROMPT_CHAR_LIMIT
            if on_event:
                on_event(
                    {
                        "debug": f"[PROMPT] Too long ({char_count} chars), refining to shorten by {difference} chars"
                    }
                )
            refinement_prompt = f"""Your previous response was {char_count} characters, which exceeds the {PROMPT_CHAR_LIMIT} character limit by {difference} characters.

Previous response:
{text}

Please shorten this glossary to be ≤{PROMPT_CHAR_LIMIT} characters by removing less critical terms. Keep crew names, mission callsigns, and custom terms (Huntsville, Houston, Moscow, Tsukuba, Munich, space-to-ground). Prioritize unique/uncommon spaceflight terms. Output ONLY the shortened glossary, no explanation."""

            result = self.ollama.generate(
                refinement_prompt, on_event=on_event, max_length=2000
            )
            text = result.text.strip().replace("\n", " ")
            char_count = len(text)
            all_raw_events.extend(result.raw_events)
            iteration += 1
            if on_event:
                on_event({"debug": f"[PROMPT] After refinement: {char_count} chars"})
        elif char_count < 200:
            # Too short - should add more terms
            difference = PROMPT_CHAR_LIMIT - char_count
            if on_event:
                on_event(
                    {
                        "debug": f"[PROMPT] Too short ({char_count} chars), refining to add {difference} chars"
                    }
                )
            refinement_prompt = f"""Your previous response was only {char_count} characters. You have {difference} more characters available (limit is {PROMPT_CHAR_LIMIT}).

Previous response:
{text}

Please expand this glossary by adding more relevant spaceflight terms, acronyms, or technical vocabulary. Aim for around {PROMPT_CHAR_LIMIT} characters. Output ONLY the expanded glossary, no explanation."""

            result = self.ollama.generate(
                refinement_prompt, on_event=on_event, max_length=2000
            )
            text = result.text.strip().replace("\n", " ")
            char_count = len(text)
            all_raw_events.extend(result.raw_events)
            iteration += 1
            if on_event:
                on_event({"debug": f"[PROMPT] After refinement: {char_count} chars"})

        # Final truncation if still over limit (fallback)
        if char_count > PROMPT_CHAR_LIMIT:
            if on_event:
                on_event(
                    {
                        "debug": f"[PROMPT] Still too long, truncating to {PROMPT_CHAR_LIMIT} chars"
                    }
                )
            text = text[:PROMPT_CHAR_LIMIT].rstrip()
            char_count = len(text)

        elapsed = time.perf_counter() - started
        if on_event:
            on_event(
                {
                    "debug": f"[PROMPT] Final result: {char_count} chars in {elapsed:.2f}s ({iteration} iterations)"
                }
            )
        prompt_path = output_dir / "prompt.txt"
        prompt_path.write_text(text, encoding="utf-8")

        meta = {
            "date": date_str,
            "model": result.metrics.model,
            "options": result.metrics.options,
            "elapsed_seconds": elapsed,
            "eval_count": result.metrics.eval_count,
            "eval_duration": result.metrics.eval_duration,
            "load_duration": result.metrics.load_duration,
            "total_duration": result.metrics.total_duration,
            "attempt": result.metrics.attempt,
            "prompt_version": 2,
            "characters": char_count,
            "iterations": iteration,
            "was_terminated": result.metrics.was_terminated,
            "termination_reason": result.metrics.termination_reason,
        }
        (output_dir / "prompt_meta.json").write_text(
            json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        (output_dir / "prompt_raw.jsonl").write_text(
            "\n".join(json.dumps(event) for event in all_raw_events),
            encoding="utf-8",
        )
        return text, result, elapsed

    def _build_generation_prompt(self, prompt_input: dict) -> str:
        crew_lines: List[str] = []
        for sample in prompt_input["crew"].get("samples", []):
            crew_lines.append(f"[{sample['sample_time']}]")
            for member in sample.get("crew", []):
                line = f"{member['name_first']} ({member['nationality']})"
                crew_lines.append(f"- {line}")
        if prompt_input["crew"].get("notes"):
            crew_lines.append("Notes: " + "; ".join(prompt_input["crew"]["notes"]))

        activity_lines: List[str] = []
        for key, bullets in prompt_input.get("activities", {}).items():
            if not bullets:
                continue
            activity_lines.append(key.replace("_", " ").title() + ":")
            for bullet in bullets:
                activity_lines.append(f"- {bullet}")

        blog_lines = [f"- {topic}" for topic in prompt_input.get("blog_topics", [])]
        comms_lines = [f"- {focus}" for focus in prompt_input.get("comms_focus", [])]

        call_signs = ", ".join(prompt_input.get("call_signs", []))
        acronyms = ", ".join(prompt_input.get("acronyms", []))
        custom_terms = ", ".join(prompt_input.get("custom_terms", []))

        template = f"""
Generate a glossary-style vocabulary prompt for WhisperX/Whisper transcription of ISS space-to-ground audio for {prompt_input['date']}.

IMPORTANT GUIDELINES:
- Use GLOSSARY FORMAT ONLY: just list terms separated by commas or simple list structure
- DO NOT include introductory phrases like "Transcribe ISS space-to-ground audio" or "The following is..."
- DO NOT use prose or full sentences - ONLY vocabulary terms
- Focus on proper nouns, technical terms, acronyms, and uncommon spaceflight vocabulary
- Include crew FIRST NAMES ONLY (no last names)
- Prioritize terms likely to be misspelled or misrecognized
- The prompt helps Whisper spell words correctly, not understand context
- Generate a comprehensive list - we'll refine the length afterwards

Custom terms (MUST include in output): {custom_terms or 'None'}

Crew onboard (use first names only):
{chr(10).join(crew_lines) if crew_lines else '-'}

Call signs: {call_signs or 'None'}
Acronyms: {acronyms or 'None'}

Comms focus:
{chr(10).join(comms_lines) if comms_lines else '-'}

Activities:
{chr(10).join(activity_lines) if activity_lines else '-'}

Blog topics:
{chr(10).join(blog_lines) if blog_lines else '-'}



EXAMPLE OUTPUT FORMAT (glossary style):
"Huntsville, Houston, Moscow, Tsukuba, Munich, space-to-ground, Radio Procedure Language, Satoshi, Sergey, Michael, TDRS, S-band, Ku-band, GPS. Activities: docking, EVA, telemetry, resupply."

Generate a comprehensive glossary now (target ~{PROMPT_CHAR_LIMIT} characters, but focus on completeness over exact length):
"""
        return template.strip()
