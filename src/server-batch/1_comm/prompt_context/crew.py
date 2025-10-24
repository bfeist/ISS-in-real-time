from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Iterable, List, Optional, Sequence

from .config import PromptContextConfig

DATE_FMT = "%Y-%m-%d"
ISO_FMT = "%Y-%m-%dT%H:%M:%SZ"


@dataclass(slots=True)
class CrewStay:
    name_first: str
    name_middle: str
    name_last: str
    name_suffix: str
    nationality: str
    arrivalDate: str
    arrivalFlight: str
    departureDate: str
    departureFlight: str
    durationDays: str

    @property
    def name_full(self) -> str:
        parts = [self.name_first, self.name_middle, self.name_last, self.name_suffix]
        return " ".join(part for part in parts if part).replace("  ", " ").strip()

    @property
    def vehicle(self) -> str:
        return self.arrivalFlight

    @property
    def role(self) -> str:
        # Placeholder: real role metadata is not available in crew_arr_dep.json.
        return ""

    def to_prompt_dict(self) -> dict:
        return {
            "name_first": self.name_first,
            "nationality": self.nationality,
            "vehicle": self.vehicle,
            "arrivalDate": self.arrivalDate,
            "departureDate": self.departureDate,
            "role": self.role,
        }


class CrewPromptBuilder:
    """Build deterministic crew roster snapshots for prompt context."""

    def __init__(self, config: PromptContextConfig) -> None:
        self.config = config
        self._crew_data: Optional[List[CrewStay]] = None

    def load_crew_data(self, *, force_reload: bool = False) -> Sequence[CrewStay]:
        if self._crew_data is not None and not force_reload:
            return self._crew_data

        crew_path = self.config.web_assets_folder / "crew_arr_dep.json"
        if not crew_path.exists():
            raise FileNotFoundError(
                f"Could not locate crew_arr_dep.json at {crew_path}. Run flights pipeline first."
            )
        data = json.loads(crew_path.read_text(encoding="utf-8"))
        self._crew_data = [CrewStay(**item) for item in data]
        return self._crew_data

    def _validate_date(self, date_str: str) -> datetime:
        try:
            dt = datetime.strptime(date_str, DATE_FMT)
            return dt
        except ValueError as exc:
            raise ValueError("Invalid date format. Please use 'YYYY-MM-DD'.") from exc

    def _is_member_onboard(self, stay: CrewStay, query_dt: datetime) -> bool:
        arrival = datetime.fromisoformat(stay.arrivalDate.replace("Z", "+00:00"))
        departure = datetime.fromisoformat(stay.departureDate.replace("Z", "+00:00"))
        return arrival <= query_dt <= departure

    def _crew_onboard_at(self, *, date_str: str, app_seconds: int) -> List[CrewStay]:
        if not 0 <= app_seconds <= 86399:
            raise ValueError("app_seconds must be in range 0-86399")
        base_dt = datetime.fromisoformat(f"{date_str}T00:00:00+00:00")
        query_dt = base_dt + timedelta(seconds=app_seconds)
        crew = [
            stay
            for stay in self.load_crew_data()
            if self._is_member_onboard(stay, query_dt)
        ]
        crew.sort(key=lambda stay: (stay.nationality, stay.name_last, stay.name_first))
        return crew

    def _crew_onboard_full_day(self, *, date_str: str) -> List[CrewStay]:
        base_dt = datetime.fromisoformat(f"{date_str}T00:00:00+00:00")
        end_dt = datetime.fromisoformat(f"{date_str}T23:59:59+00:00")
        crew = [
            stay
            for stay in self.load_crew_data()
            if self._is_member_onboard(stay, base_dt)
            or self._is_member_onboard(stay, end_dt)
        ]
        crew.sort(key=lambda stay: (stay.nationality, stay.name_last, stay.name_first))
        return crew

    def build_daily_roster(
        self, *, date_str: str, seconds_samples: Iterable[int] = (0, 86399)
    ) -> dict:
        dt = self._validate_date(date_str)
        snapshots = []
        for seconds in seconds_samples:
            crew_list = self._crew_onboard_at(date_str=date_str, app_seconds=seconds)
            timestamp = (dt + timedelta(seconds=seconds)).replace(tzinfo=timezone.utc)
            snapshots.append(
                {
                    "sample_time": timestamp.strftime(ISO_FMT),
                    "crew": [stay.to_prompt_dict() for stay in crew_list],
                }
            )

        notes = self._generate_handover_notes(snapshots)
        roster = {
            "date": date_str,
            "samples": snapshots,
        }
        if notes:
            roster["notes"] = notes
        return roster

    def _generate_handover_notes(self, snapshots: Sequence[dict]) -> List[str]:
        if len(snapshots) < 2:
            return []
        notes: List[str] = []
        first = snapshots[0]["crew"]
        last = snapshots[-1]["crew"]

        def _names(crew_list: Sequence[dict]) -> set[str]:
            return {member["name_first"] for member in crew_list}

        left = _names(first) - _names(last)
        joined = _names(last) - _names(first)

        if left or joined:
            parts = []
            if left:
                parts.append("Departures: " + ", ".join(sorted(left)))
            if joined:
                parts.append("Arrivals: " + ", ".join(sorted(joined)))
            notes.append("; ".join(parts))
        return notes

    def save_roster(self, roster: dict, *, output_dir: Path) -> Path:
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / "crew_roster.json"
        output_path.write_text(json.dumps(roster, indent=2), encoding="utf-8")
        return output_path
