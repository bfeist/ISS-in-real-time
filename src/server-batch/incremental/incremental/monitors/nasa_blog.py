"""
Monitor for NASA ISS Space Station blog.

Checks the NASA Space Station blog RSS feed for new articles:
https://blogs.nasa.gov/spacestation/feed/
"""

import asyncio
import xml.etree.ElementTree as ET
from datetime import date, datetime
from email.utils import parsedate_to_datetime
from typing import Any, Optional

import httpx

from .base import BaseMonitor, MonitorResult


class NASABlogMonitor(BaseMonitor):
    """
    Monitor for NASA Space Station blog.

    Parses the RSS feed to detect new articles about ISS activities.
    """

    # NASA Space Station blog RSS feed URL
    FEED_URL = "https://blogs.nasa.gov/spacestation/feed/"

    # Alternative: WordPress REST API endpoint
    API_URL = "https://blogs.nasa.gov/spacestation/wp-json/wp/v2/posts"

    @property
    def name(self) -> str:
        return "NASA Space Station Blog"

    @property
    def source_id(self) -> str:
        return "nasa_blog"

    async def check(self) -> MonitorResult:
        """
        Check for new blog articles.

        Returns:
            MonitorResult with information about new articles
        """
        try:
            client = await self.get_client()
            state = self.load_state()

            # Get the last known article
            last_guid = state.get("last_guid") if state else None
            last_pub_date = state.get("last_pub_date") if state else None

            # Fetch the RSS feed
            response = await client.get(self.FEED_URL)
            response.raise_for_status()

            # Parse the RSS XML
            articles = self._parse_rss_feed(response.text)

            if not articles:
                return MonitorResult(
                    has_new_data=False,
                    item_count=0,
                    details={"feed_url": self.FEED_URL},
                )

            # Get the newest article
            newest = articles[0]
            newest_guid = newest.get("guid")
            newest_pub_date = newest.get("pub_date")
            newest_date = self._parse_rss_date(newest_pub_date)

            if last_guid is None:
                # First run - record current state
                self._save_check_state(newest_guid, newest_pub_date)
                return MonitorResult(
                    has_new_data=False,
                    newest_date=newest_date,
                    item_count=0,
                    details={
                        "total_in_feed": len(articles),
                        "newest_article": newest.get("title"),
                        "first_run": True,
                    },
                )

            # Find new articles since last check
            new_articles = []
            for article in articles:
                if article.get("guid") == last_guid:
                    break
                new_articles.append(
                    {
                        "title": article.get("title"),
                        "link": article.get("link"),
                        "pub_date": article.get("pub_date"),
                        "guid": article.get("guid"),
                    }
                )

            has_new = len(new_articles) > 0

            if has_new:
                self._save_check_state(newest_guid, newest_pub_date)

            return MonitorResult(
                has_new_data=has_new,
                newest_date=newest_date,
                item_count=len(new_articles),
                details={
                    "total_in_feed": len(articles),
                    "newest_article": newest.get("title"),
                    "new_articles": new_articles[:10],
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
        except ET.ParseError as e:
            return MonitorResult(
                has_new_data=False,
                error=f"RSS parse error: {str(e)}",
            )
        except Exception as e:
            return MonitorResult(
                has_new_data=False,
                error=f"Unexpected error: {str(e)}",
            )

    def _parse_rss_feed(self, xml_content: str) -> list[dict[str, Any]]:
        """
        Parse RSS feed XML and extract article information.

        Args:
            xml_content: Raw XML content of the RSS feed

        Returns:
            List of article dictionaries
        """
        articles = []

        root = ET.fromstring(xml_content)
        channel = root.find("channel")

        if channel is None:
            return articles

        for item in channel.findall("item"):
            article = {
                "title": self._get_element_text(item, "title"),
                "link": self._get_element_text(item, "link"),
                "pub_date": self._get_element_text(item, "pubDate"),
                "guid": self._get_element_text(item, "guid"),
                "description": self._get_element_text(item, "description"),
                "creator": self._get_element_text(
                    item, "{http://purl.org/dc/elements/1.1/}creator"
                ),
            }
            articles.append(article)

        return articles

    @staticmethod
    def _get_element_text(parent: ET.Element, tag: str) -> Optional[str]:
        """Get text content of a child element."""
        elem = parent.find(tag)
        return elem.text if elem is not None else None

    def _save_check_state(self, guid: Optional[str], pub_date: Optional[str]) -> None:
        """Save the current check state."""
        self.save_state(
            {
                "last_guid": guid,
                "last_pub_date": pub_date,
            }
        )

    @staticmethod
    def _parse_rss_date(date_str: Optional[str]) -> Optional[date]:
        """
        Parse an RSS pubDate string (RFC 2822 format).

        Example: "Mon, 15 Jan 2024 12:00:00 +0000"
        """
        if not date_str:
            return None

        try:
            dt = parsedate_to_datetime(date_str)
            return dt.date()
        except (ValueError, TypeError):
            return None

    async def check_via_api(self) -> MonitorResult:
        """
        Alternative check using WordPress REST API.

        This can be used if the RSS feed is unavailable or
        more detailed information is needed.
        """
        try:
            client = await self.get_client()
            state = self.load_state()

            last_id = state.get("last_post_id") if state else None

            params = {
                "per_page": 20,
                "orderby": "date",
                "order": "desc",
            }

            response = await client.get(self.API_URL, params=params)
            response.raise_for_status()

            posts = response.json()

            if not posts:
                return MonitorResult(
                    has_new_data=False,
                    item_count=0,
                )

            newest = posts[0]
            newest_id = newest.get("id")
            newest_date_str = newest.get("date")

            # Parse date
            newest_date = None
            if newest_date_str:
                try:
                    newest_date = datetime.fromisoformat(
                        newest_date_str.replace("Z", "+00:00")
                    ).date()
                except ValueError:
                    pass

            if last_id is None:
                self.save_state({"last_post_id": newest_id})
                return MonitorResult(
                    has_new_data=False,
                    newest_date=newest_date,
                    item_count=0,
                    details={"first_run": True},
                )

            # Count new posts
            new_posts = []
            for post in posts:
                if post.get("id") == last_id:
                    break
                new_posts.append(
                    {
                        "id": post.get("id"),
                        "title": post.get("title", {}).get("rendered"),
                        "link": post.get("link"),
                        "date": post.get("date"),
                    }
                )

            has_new = len(new_posts) > 0

            if has_new:
                self.save_state({"last_post_id": newest_id})

            return MonitorResult(
                has_new_data=has_new,
                newest_date=newest_date,
                item_count=len(new_posts),
                details={
                    "newest_title": newest.get("title", {}).get("rendered"),
                    "new_posts": new_posts,
                },
            )

        except Exception as e:
            return MonitorResult(
                has_new_data=False,
                error=f"API error: {str(e)}",
            )
