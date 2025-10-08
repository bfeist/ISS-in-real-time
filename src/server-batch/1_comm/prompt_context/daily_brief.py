from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Union

from bs4 import BeautifulSoup

from .config import PromptContextConfig
from .ollama import GenerationResult, OllamaClient


@dataclass(slots=True)
class Article:
    title: str
    paragraphs: List[str]
    source_url: Optional[str] = None
    image_caption: Optional[str] = None
    image_filename: Optional[str] = None
    source: Optional[str] = None

    def normalized_text(self) -> str:
        joined = "\n".join(self.paragraphs)
        return normalize_text(joined)

    def content_hash(self) -> str:
        digest = hashlib.sha256()
        digest.update(self.title.encode("utf-8"))
        digest.update("\n".encode("utf-8"))
        digest.update(self.normalized_text().encode("utf-8"))
        return digest.hexdigest()


def normalize_text(text: str) -> str:
    soup = BeautifulSoup(text, "html.parser")
    cleaned = soup.get_text(separator=" ")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


class DailyBriefBuilder:
    """Generate structured daily brief data for prompt context."""

    def __init__(self, config: PromptContextConfig, ollama: OllamaClient) -> None:
        self.config = config
        self.ollama = ollama

    def build_daily_brief(
        self, *, date_str: str, output_dir: Path, on_event=None
    ) -> dict:
        output_dir.mkdir(parents=True, exist_ok=True)

        if on_event:
            on_event({"debug": f"[BRIEF] Loading activity summary for {date_str}"})
        activities = self._load_activity_summary(date_str)
        if on_event:
            on_event({"debug": f"[BRIEF] Loading blog articles for {date_str}"})
        articles = self._load_blog_articles(date_str)

        payload_highlights = [
            self._activity_to_bullet(item) for item in activities.get("payloads", [])
        ]
        systems_work = [
            self._activity_to_bullet(item) for item in activities.get("systems", [])
        ]
        planned_activities = [
            self._activity_to_bullet(item) for item in activities.get("tasklist", [])
        ]
        ground_ops = [
            self._activity_to_bullet(item) for item in activities.get("ground", [])
        ]

        blog_headlines = [
            {
                "title": article.title,
                "source_url": article.source_url,
                "content_hash": article.content_hash(),
            }
            for article in articles
        ]

        summary_sections = {
            "payload_highlights": payload_highlights,
            "systems_work": systems_work,
            "planned_activities": planned_activities,
            "ground_ops": ground_ops,
            "blog_headlines": blog_headlines,
        }

        if on_event:
            on_event({"debug": f"[BRIEF] Calling Ollama to summarize blog articles"})
        blog_topics, comms_focus = self._summarize_with_ollama(
            date_str=date_str,
            articles=articles,
            summary_sections=summary_sections,
            cache_dir=output_dir / "blog_cache",
            on_event=on_event,
        )

        brief = {
            "date": date_str,
            "payload_highlights": payload_highlights,
            "systems_work": systems_work,
            "planned_activities": planned_activities,
            "ground_ops": ground_ops,
            "blog_headlines": blog_headlines,
            "blog_topics": blog_topics,
            "comms_focus": comms_focus,
        }

        # include source_url from activities if available
        if "source_url" in activities:
            brief["source_url"] = activities["source_url"]

        output_path = output_dir / "daily_brief.json"
        output_path.write_text(
            json.dumps(brief, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        return brief

    def _load_activity_summary(self, date_str: str) -> Dict[str, List[dict]]:
        year, month, day = date_str.split("-")
        path = (
            self.config.web_assets_folder
            / "activity_summaries"
            / year
            / month
            / f"activity_summary_{date_str}.json"
        )
        if not path.exists():
            return {}
        return json.loads(path.read_text(encoding="utf-8"))

    def _load_blog_articles(self, date_str: str) -> List[Article]:
        year, month, day = date_str.split("-")
        path = (
            self.config.web_assets_folder
            / "blog_articles"
            / year
            / month
            / day
            / "articles.json"
        )
        if not path.exists():
            return []
        data = json.loads(path.read_text(encoding="utf-8"))
        articles: List[Article] = []
        for item in data:
            paragraphs = item.get("paragraphs") or []
            if isinstance(paragraphs, str):
                paragraphs = [paragraphs]
            articles.append(
                Article(
                    title=item.get("title", ""),
                    paragraphs=[normalize_text(p) for p in paragraphs if p],
                    source_url=item.get("source_url"),
                    image_caption=item.get("image_caption"),
                    image_filename=item.get("image_filename"),
                    source=item.get("source"),
                )
            )
        return articles

    def _activity_to_bullet(self, item: dict) -> str:
        name = normalize_text(str(item.get("name", "")))
        description = (
            normalize_text(str(item.get("description", "")))
            if item.get("description")
            else ""
        )
        if name and description:
            return f"{name} — {description}"
        return name or description

    def _summarize_with_ollama(
        self,
        *,
        date_str: str,
        articles: Sequence[Article],
        summary_sections: Dict[str, List[Union[str, dict]]],
        cache_dir: Path,
        on_event=None,
    ) -> tuple[List[str], List[str]]:
        cache_dir.mkdir(parents=True, exist_ok=True)
        cache_key = self._compute_summary_cache_key(articles, summary_sections)
        cache_file = cache_dir / f"summary_{cache_key}.json"
        if cache_file.exists():
            if on_event:
                on_event(
                    {
                        "debug": f"[BRIEF] Using cached summary (key: {cache_key[:16]}...)"
                    }
                )
            cached = json.loads(cache_file.read_text(encoding="utf-8"))
            if "blog_topics" in cached and "comms_focus" in cached:
                return cached["blog_topics"], cached["comms_focus"]

        if on_event:
            on_event({"debug": f"[BRIEF] Building prompt for Ollama"})
        prompt = self._build_summary_prompt(
            date_str=date_str, articles=articles, summary_sections=summary_sections
        )
        if on_event:
            on_event(
                {
                    "debug": f"[BRIEF] Sending to Ollama (prompt length: {len(prompt)} chars)"
                }
            )
        result = self.ollama.generate(prompt, on_event=on_event)

        blog_topics, comms_focus = self._parse_summary_response(result)
        cache_file.write_text(
            json.dumps(
                {
                    "blog_topics": blog_topics,
                    "comms_focus": comms_focus,
                    "model": result.metrics.model,
                    "options": result.metrics.options,
                    "cache_key": cache_key,
                },
                indent=2,
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
        raw_path = cache_dir / f"summary_{cache_key}.jsonl"
        raw_path.write_text(
            "\n".join(json.dumps(event) for event in result.raw_events),
            encoding="utf-8",
        )
        return blog_topics, comms_focus

    def _compute_summary_cache_key(
        self,
        articles: Sequence[Article],
        summary_sections: Dict[str, List[Union[str, dict]]],
    ) -> str:
        payload = {
            "articles": [article.content_hash() for article in articles],
            "sections": summary_sections,
        }
        digest = hashlib.sha256(
            json.dumps(payload, sort_keys=True).encode("utf-8")
        ).hexdigest()
        return digest

    def _build_summary_prompt(
        self,
        *,
        date_str: str,
        articles: Sequence[Article],
        summary_sections: Dict[str, List[Union[str, dict]]],
    ) -> str:
        lines = [
            "You are an ISS mission analyst creating communication prep notes.",
            f"Date: {date_str}",
            "Return a compact JSON object with keys blog_topics (array of concise 8-16 word bullets) and comms_focus (array of no more than 5 bullets prioritised by mission relevance).",
            "Avoid prose. Use mission terminology and include context when needed.",
            "\nACTIVITY SUMMARY:",
        ]
        for key, bullets in summary_sections.items():
            if not bullets:
                continue
            lines.append(f"[{key}]")
            for bullet in bullets:
                if isinstance(bullet, dict):
                    bullet_text = ", ".join(f"{k}: {v}" for k, v in bullet.items())
                else:
                    bullet_text = str(bullet)
                lines.append(f"- {bullet_text}")

        if articles:
            lines.append("\nBLOG ARTICLES:")
        for article in articles:
            lines.append(f"Title: {article.title}")
            if article.source_url:
                lines.append(f"URL: {article.source_url}")
            for paragraph in article.paragraphs:
                lines.append(f"* {paragraph}")
            lines.append("")
        lines.append("Return only JSON. No markdown.")
        return "\n".join(lines)

    def _parse_summary_response(
        self, result: GenerationResult
    ) -> tuple[List[str], List[str]]:
        text = result.text.strip()
        try:
            payload = json.loads(text)
        except json.JSONDecodeError:
            payload = self._extract_json_object(text)

        if not isinstance(payload, dict):
            raise ValueError("Ollama summary response did not contain JSON object")

        blog_topics = [
            normalize_text(item) for item in payload.get("blog_topics", []) if item
        ]
        comms_focus = [
            normalize_text(item)[:250]
            for item in payload.get("comms_focus", [])
            if item
        ][:5]

        return blog_topics, comms_focus

    def _extract_json_object(self, text: str) -> dict:
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1:
            raise ValueError("Unable to locate JSON object in Ollama response")
        candidate = text[start : end + 1]
        return json.loads(candidate)
