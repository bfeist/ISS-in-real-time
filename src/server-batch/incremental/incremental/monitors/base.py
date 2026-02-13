"""
Base class and types for source monitors.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any, Optional
import json
import httpx


@dataclass
class MonitorResult:
    """Result from checking a source for new data."""

    has_new_data: bool
    """Whether new data was found since last check."""

    newest_date: Optional[date] = None
    """Date of the newest item found (if applicable)."""

    item_count: Optional[int] = None
    """Number of new items found (if applicable)."""

    details: Optional[dict[str, Any]] = None
    """Additional source-specific details about new data."""

    error: Optional[str] = None
    """Error message if the check failed."""

    checked_at: datetime = field(default_factory=datetime.now)
    """Timestamp when the check was performed."""

    def __bool__(self) -> bool:
        """Returns True if new data was found without errors."""
        return self.has_new_data and self.error is None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            "has_new_data": self.has_new_data,
            "newest_date": self.newest_date.isoformat() if self.newest_date else None,
            "item_count": self.item_count,
            "details": self.details,
            "error": self.error,
            "checked_at": self.checked_at.isoformat(),
        }


class BaseMonitor(ABC):
    """
    Base class for source monitors.

    Monitors check external data sources for new content and track
    the last checked state to avoid redundant network calls.
    """

    # Default timeout for HTTP requests (seconds)
    DEFAULT_TIMEOUT = 30.0

    # Default rate limit delay between requests (seconds)
    DEFAULT_RATE_LIMIT_DELAY = 1.0

    def __init__(
        self,
        cache_dir: Path,
        http_client: Optional[httpx.AsyncClient] = None,
    ):
        """
        Initialize the monitor.

        Args:
            cache_dir: Directory for caching monitor state
            http_client: Optional shared HTTP client (created if not provided)
        """
        self.cache_dir = Path(cache_dir)
        self._client = http_client
        self._owns_client = http_client is None

        # Ensure cache directory exists
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable name for this monitor."""
        pass

    @property
    @abstractmethod
    def source_id(self) -> str:
        """Unique identifier for this source."""
        pass

    @property
    def state_file(self) -> Path:
        """Path to the state file for this monitor."""
        return self.cache_dir / f"{self.source_id}_state.json"

    @abstractmethod
    async def check(self) -> MonitorResult:
        """
        Check the source for new data.

        Returns:
            MonitorResult with information about new data found
        """
        pass

    async def get_client(self) -> httpx.AsyncClient:
        """
        Get or create the HTTP client.

        Returns:
            Async HTTP client for making requests
        """
        if self._client is None:
            self._client = httpx.AsyncClient(
                timeout=self.DEFAULT_TIMEOUT,
                follow_redirects=True,
                headers={"User-Agent": "ISSiRT-Monitor/1.0 (ISS History Project)"},
            )
        return self._client

    async def close(self) -> None:
        """Close the HTTP client if we own it."""
        if self._client is not None and self._owns_client:
            await self._client.aclose()
            self._client = None

    def load_state(self) -> Optional[dict[str, Any]]:
        """
        Load the last saved state from cache.

        Returns:
            State dictionary or None if no state exists
        """
        if self.state_file.exists():
            try:
                with open(self.state_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except (json.JSONDecodeError, IOError):
                return None
        return None

    def save_state(self, state: dict[str, Any]) -> None:
        """
        Save state to cache.

        Args:
            state: State dictionary to save
        """
        state["_saved_at"] = datetime.now().isoformat()
        with open(self.state_file, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2, default=str)

    def clear_state(self) -> None:
        """Clear the cached state."""
        if self.state_file.exists():
            self.state_file.unlink()

    async def __aenter__(self) -> "BaseMonitor":
        """Async context manager entry."""
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        """Async context manager exit."""
        await self.close()

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(source_id={self.source_id!r})"
