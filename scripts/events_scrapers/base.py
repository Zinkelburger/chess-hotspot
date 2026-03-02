from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
import hashlib
import re
from typing import Any


@dataclass
class ScrapedEvent:
    id: str
    name: str
    date: str
    type: str = "tournament"
    endDate: str | None = None
    time: str | None = None
    timezone: str | None = None
    hostClubId: str | None = None
    venue: str | None = None
    address: str | None = None
    lat: float | None = None
    lng: float | None = None
    format: str | None = None
    timeControl: dict[str, Any] | None = None
    rated: bool | None = None
    ratingSystem: str | None = None
    entryFeeText: str | None = None
    entryFeeUsdMin: int | None = None
    entryFeeUsdMax: int | None = None
    prizeFundGuaranteedUsd: int | None = None
    topPrizeUsd: int | None = None
    sections: list[dict[str, Any]] | None = None
    scheduleOptions: list[dict[str, Any]] | None = None
    tags: list[str] | None = None
    website: str | None = None
    notes: str | None = None

    def to_dict(self) -> dict[str, Any]:
        data: dict[str, Any] = {}
        for key, value in self.__dict__.items():
            if value is None:
                continue
            data[key] = value
        return data


class BaseEventScraper(ABC):
    source_id: str
    source_url: str
    words_at_top: str

    @abstractmethod
    def scrape(self) -> list[ScrapedEvent]:
        raise NotImplementedError

    def build_event_id(self, name: str, date: str | None, source_page: str) -> str:
        safe_name = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
        date_part = date or "unknown-date"
        short_hash = hashlib.sha1(source_page.encode("utf-8")).hexdigest()[:8]
        return f"{self.source_id}-{safe_name[:48]}-{date_part}-{short_hash}"

    @staticmethod
    def now_iso() -> str:
        return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
