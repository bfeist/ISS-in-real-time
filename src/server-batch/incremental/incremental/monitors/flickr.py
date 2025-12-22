"""
Monitor for NASA JSC Flickr albums.

Checks for new albums in the NASA Johnson Space Center Flickr account:
https://www.flickr.com/photos/nasa_jsc/albums/

Requires FLICKR_API_KEY environment variable to be set for API access.
Falls back to scraping if API key is not available (less reliable).
"""

import os
import asyncio
import re
from datetime import date, datetime
from typing import Any, Optional

import httpx

from .base import BaseMonitor, MonitorResult


class FlickrMonitor(BaseMonitor):
    """
    Monitor for NASA JSC Flickr albums.

    Uses the Flickr API if FLICKR_API_KEY is set, otherwise attempts
    to scrape public album pages (less reliable).
    """

    # NASA JSC Flickr user ID
    JSC_USER_ID = "56069tried"  # NASA JSC's Flickr NSID

    # Flickr API endpoint
    API_URL = "https://www.flickr.com/services/rest/"

    # Public albums page (fallback)
    ALBUMS_URL = "https://www.flickr.com/photos/nasa_jsc/albums/"

    # Flickr API key environment variable
    API_KEY_ENV = "FLICKR_API_KEY"

    def __init__(self, cache_dir, http_client=None):
        super().__init__(cache_dir, http_client)
        self._api_key = os.environ.get(self.API_KEY_ENV)

    @property
    def name(self) -> str:
        return "NASA JSC Flickr Albums"

    @property
    def source_id(self) -> str:
        return "flickr_jsc"

    @property
    def has_api_key(self) -> bool:
        """Check if Flickr API key is available."""
        return bool(self._api_key)

    async def check(self) -> MonitorResult:
        """
        Check for new Flickr albums.

        Uses API if key is available, otherwise falls back to scraping.

        Returns:
            MonitorResult with information about new albums
        """
        if self.has_api_key:
            return await self._check_via_api()
        else:
            return await self._check_via_scrape()

    async def _check_via_api(self) -> MonitorResult:
        """Check for new albums using the Flickr API."""
        try:
            client = await self.get_client()
            state = self.load_state()

            last_album_id = state.get("last_album_id") if state else None

            # Get photosets (albums) for the user
            params = {
                "method": "flickr.photosets.getList",
                "api_key": self._api_key,
                "user_id": self.JSC_USER_ID,
                "per_page": 50,
                "page": 1,
                "format": "json",
                "nojsoncallback": 1,
            }

            response = await client.get(self.API_URL, params=params)
            response.raise_for_status()

            data = response.json()

            if data.get("stat") != "ok":
                error_msg = data.get("message", "Unknown Flickr API error")
                return MonitorResult(
                    has_new_data=False,
                    error=f"Flickr API error: {error_msg}",
                )

            photosets = data.get("photosets", {})
            albums = photosets.get("photoset", [])
            total_albums = photosets.get("total", 0)

            if not albums:
                return MonitorResult(
                    has_new_data=False,
                    item_count=0,
                    details={"total_albums": total_albums},
                )

            # Get the newest album
            newest = albums[0]
            newest_id = newest.get("id")
            newest_title = newest.get("title", {}).get("_content", "")

            # Parse creation date
            date_create = newest.get("date_create")
            newest_date = None
            if date_create:
                try:
                    newest_date = datetime.fromtimestamp(int(date_create)).date()
                except (ValueError, TypeError):
                    pass

            if last_album_id is None:
                # First run
                self._save_check_state(newest_id, newest_title)
                return MonitorResult(
                    has_new_data=False,
                    newest_date=newest_date,
                    item_count=0,
                    details={
                        "total_albums": total_albums,
                        "newest_album": newest_title,
                        "first_run": True,
                        "api_used": True,
                    },
                )

            # Find new albums
            new_albums = []
            for album in albums:
                album_id = album.get("id")
                if album_id == last_album_id:
                    break
                new_albums.append(
                    {
                        "id": album_id,
                        "title": album.get("title", {}).get("_content", ""),
                        "description": album.get("description", {}).get("_content", ""),
                        "photos": album.get("photos", 0),
                        "date_create": album.get("date_create"),
                    }
                )

            has_new = len(new_albums) > 0

            if has_new:
                self._save_check_state(newest_id, newest_title)

            return MonitorResult(
                has_new_data=has_new,
                newest_date=newest_date,
                item_count=len(new_albums),
                details={
                    "total_albums": total_albums,
                    "newest_album": newest_title,
                    "new_albums": new_albums[:10],
                    "api_used": True,
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

    async def _check_via_scrape(self) -> MonitorResult:
        """
        Fallback: Check for new albums by scraping the public page.

        This is less reliable than the API but works without an API key.
        """
        try:
            client = await self.get_client()
            state = self.load_state()

            last_album_id = state.get("last_album_id") if state else None

            response = await client.get(self.ALBUMS_URL)
            response.raise_for_status()

            # Parse album IDs from the page
            # Look for patterns like /photos/nasa_jsc/albums/72177720123456789
            album_pattern = r"/photos/nasa_jsc/albums/(\d+)"
            matches = re.findall(album_pattern, response.text)

            # Deduplicate while preserving order
            seen = set()
            album_ids = []
            for m in matches:
                if m not in seen:
                    seen.add(m)
                    album_ids.append(m)

            if not album_ids:
                return MonitorResult(
                    has_new_data=False,
                    item_count=0,
                    details={
                        "api_used": False,
                        "warning": "No albums found - page structure may have changed",
                    },
                )

            newest_id = album_ids[0]

            if last_album_id is None:
                # First run
                self._save_check_state(newest_id, None)
                return MonitorResult(
                    has_new_data=False,
                    item_count=0,
                    details={
                        "found_albums": len(album_ids),
                        "newest_album_id": newest_id,
                        "first_run": True,
                        "api_used": False,
                    },
                )

            # Find new albums
            new_album_ids = []
            for album_id in album_ids:
                if album_id == last_album_id:
                    break
                new_album_ids.append(album_id)

            has_new = len(new_album_ids) > 0

            if has_new:
                self._save_check_state(newest_id, None)

            return MonitorResult(
                has_new_data=has_new,
                item_count=len(new_album_ids),
                details={
                    "found_albums": len(album_ids),
                    "newest_album_id": newest_id,
                    "new_album_ids": new_album_ids[:10],
                    "api_used": False,
                    "warning": "Using scraping - set FLICKR_API_KEY for better reliability",
                },
            )

        except httpx.HTTPStatusError as e:
            return MonitorResult(
                has_new_data=False,
                error=f"HTTP error {e.response.status_code}",
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
        album_id: Optional[str],
        album_title: Optional[str],
    ) -> None:
        """Save the current check state."""
        self.save_state(
            {
                "last_album_id": album_id,
                "last_album_title": album_title,
            }
        )

    async def get_album_photos(self, album_id: str) -> Optional[list[dict]]:
        """
        Get photos from a specific album (requires API key).

        Args:
            album_id: Flickr album/photoset ID

        Returns:
            List of photo dictionaries or None if failed
        """
        if not self.has_api_key:
            return None

        try:
            client = await self.get_client()

            params = {
                "method": "flickr.photosets.getPhotos",
                "api_key": self._api_key,
                "photoset_id": album_id,
                "user_id": self.JSC_USER_ID,
                "extras": "date_taken,url_o,url_l,url_m,description",
                "per_page": 500,
                "format": "json",
                "nojsoncallback": 1,
            }

            response = await client.get(self.API_URL, params=params)
            response.raise_for_status()

            data = response.json()

            if data.get("stat") != "ok":
                return None

            return data.get("photoset", {}).get("photo", [])

        except Exception:
            return None
