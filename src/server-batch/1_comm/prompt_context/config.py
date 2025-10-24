from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv


@dataclass
class PromptContextConfig:
    """Configuration for prompt context preprocessing."""

    repo_root: Path = field(default_factory=lambda: Path(__file__).resolve().parents[3])
    env_file: Optional[Path] = None
    raw_folder: Path = field(init=False)
    web_assets_folder: Path = field(init=False)
    ia_zip_sg_folder: Path = field(init=False)
    ia_zip_ag_folder: Path = field(init=False)
    prompt_context_root: Path = field(init=False)
    static_vocab_dir: Optional[Path] = None
    custom_terms: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        env_path = self.env_file or self.repo_root / ".env"
        if env_path.exists():
            load_dotenv(env_path)

        self.raw_folder = self._resolve_path("RAW_FOLDER")
        self.web_assets_folder = self._resolve_path("WEB_ASSETS_FOLDER")
        self.ia_zip_sg_folder = self._resolve_path("IA_ZIP_SG_FOLDER", missing_ok=True)
        self.ia_zip_ag_folder = self._resolve_path("IA_ZIP_AG_FOLDER", missing_ok=True)

        self.prompt_context_root = self.raw_folder / "prompt_context"
        self.prompt_context_root.mkdir(parents=True, exist_ok=True)

        static_vocab_env = os.getenv("PROMPT_CONTEXT_STATIC_VOCAB")
        if static_vocab_env:
            self.static_vocab_dir = Path(static_vocab_env).expanduser().resolve()

    def _resolve_path(self, env_name: str, *, missing_ok: bool = False) -> Path:
        value = os.getenv(env_name)
        if not value:
            if missing_ok:
                return Path()
            raise RuntimeError(
                f"Environment variable {env_name} is not set. Ensure your .env is configured."
            )
        resolved = Path(value).expanduser()
        if not resolved.is_absolute():
            resolved = (self.repo_root / resolved).resolve()
        return resolved
