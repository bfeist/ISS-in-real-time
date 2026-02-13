"""
Monitor for Internet Archive ISS audio collection.

Checks for new uploads to the ISS audio collection at:
https://archive.org/details/iss-audio
"""

import asyncio
from datetime import date, datetime
from typing import Any, Optional

import httpx

from .base import BaseMonitor, MonitorResult


class InternetArchiveMonitor(BaseMonitor):
    """
    Monitor for Internet Archive ISS collection.

    Uses the Internet Archive's Advanced Search API to find items
    that have been added since the last check.
    """

    # IA collection identifier
    COLLECTION_ID = "iss-audio"

    # IA Advanced Search API endpoint
    SEARCH_API_URL = "https://archive.org/advancedsearch.php"

    # Rate limit: IA recommends max 1 request per second
    RATE_LIMIT_DELAY = 1.0

    @property
    def name(self) -> str:
        return "Internet Archive ISS Collection"

    @property
    def source_id(self) -> str:
        return "ia_collection"

    async def check(self) -> MonitorResult:
        """
        Check for new items in the IA collection.

        Returns:
            MonitorResult with information about new uploads
        """
        try:
            client = await self.get_client()
            state = self.load_state()

            # Get the last checked date/item
            last_checked_date = None
            last_item_id = None
            if state:
                last_checked_date = state.get("last_checked_date")
                last_item_id = state.get("last_item_id")

            # Query for items in the collection, sorted by addeddate descending
            query = f"collection:{self.COLLECTION_ID}"

            params = {
                "q": query,
                "fl[]": ["identifier", "title", "addeddate", "date", "publicdate"],
                "sort[]": "addeddate desc",
                "rows": 50,
                "page": 1,
                "output": "json",
            }

            response = await client.get(self.SEARCH_API_URL, params=params)
            response.raise_for_status()

            data = response.json()
            response_data = data.get("response", {})
            total_items = response_data.get("numFound", 0)
            docs = response_data.get("docs", [])

            if not docs:
                # No items in collection (unlikely for ISS)
                self._save_check_state(None, None)
                return MonitorResult(
                    has_new_data=False,
                    item_count=0,
                    details={"total_in_collection": total_items},
                )

            # Get the newest item
            newest_doc = docs[0]
            newest_id = newest_doc.get("identifier")
            newest_added = newest_doc.get("addeddate") or newest_doc.get("publicdate")

            # Parse the added date
            newest_date = self._parse_ia_date(newest_added)

            # Check if there are new items
            if last_item_id is None:
                # First run - no baseline, so we just record current state
                self._save_check_state(newest_id, newest_added)
                return MonitorResult(
                    has_new_data=False,  # Can't determine on first run
                    newest_date=newest_date,
                    item_count=0,
                    details={
                        "total_in_collection": total_items,
                        "newest_item": newest_id,
                        "first_run": True,
                    },
                )

            # Count new items since last check
            new_items = []
            for doc in docs:
                doc_id = doc.get("identifier")
                if doc_id == last_item_id:
                    break
                new_items.append(
                    {
                        "identifier": doc_id,
                        "title": doc.get("title"),
                        "addeddate": doc.get("addeddate"),
                    }
                )

            has_new = len(new_items) > 0

            if has_new:
                # Update state with newest item
                self._save_check_state(newest_id, newest_added)

            return MonitorResult(
                has_new_data=has_new,
                newest_date=newest_date,
                item_count=len(new_items),
                details={
                    "total_in_collection": total_items,
                    "newest_item": newest_id,
                    "new_items": new_items[:10],  # Limit details
                },
            )

        except httpx.HTTPStatusError as e:
            return MonitorResult(
                has_new_data=False,
                error=f"HTTP error {e.response.status_code}: {e.response.text[:200]}",
            )
        except httpx.RequestError as e:
            return MonitorResult(
                has_new_data=False,
                error=f"Request error: {str(e)}",
            )
        except Exception as e:
            return MonitorResult(
                has_new_data=False,
                error=f"Unexpected error: {str(e)}",
            )

    def _save_check_state(
        self,
        item_id: Optional[str],
        added_date: Optional[str],
    ) -> None:
        """Save the current check state."""
        self.save_state(
            {
                "last_item_id": item_id,
                "last_checked_date": added_date,
            }
        )

    @staticmethod
    def _parse_ia_date(date_str: Optional[str]) -> Optional[date]:
        """
        Parse an Internet Archive date string.

        IA uses formats like "2024-01-15T12:00:00Z" or "2024-01-15"
        """
        if not date_str:
            return None

        try:
            # Try ISO format with time
            if "T" in date_str:
                dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
                return dt.date()
            # Try date only
            return date.fromisoformat(date_str[:10])
        except (ValueError, TypeError):
            return None

    async def get_collection_stats(self) -> dict[str, Any]:
        """
        Get statistics about the ISS collection.

        Returns:
            Dictionary with collection statistics
        """
        try:
            client = await self.get_client()

            params = {
                "q": f"collection:{self.COLLECTION_ID}",
                "rows": 0,
                "output": "json",
            }

            response = await client.get(self.SEARCH_API_URL, params=params)
            response.raise_for_status()

            data = response.json()
            total = data.get("response", {}).get("numFound", 0)

            return {
                "collection_id": self.COLLECTION_ID,
                "total_items": total,
                "url": f"https://archive.org/details/{self.COLLECTION_ID}",
            }

        except Exception as e:
            return {
                "collection_id": self.COLLECTION_ID,
                "error": str(e),
            }
