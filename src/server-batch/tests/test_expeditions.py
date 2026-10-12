"""Regression coverage for refreshing expedition metadata."""

import importlib.util
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import Mock, call, patch


spec = importlib.util.spec_from_file_location(
    "expeditions", Path(__file__).resolve().parents[1] / "3_flights/11_web_expeditions.py"
)
expeditions = importlib.util.module_from_spec(spec)
spec.loader.exec_module(expeditions)


class ExpeditionRefreshTests(unittest.TestCase):
    @patch.object(expeditions.time, "sleep")
    def test_commons_patch_url_with_query_parameters_is_accepted(self, sleep):
        for extension in ("png", "svg"):
            with self.subTest(extension=extension):
                url = f"https://upload.wikimedia.org/patch.{extension}?utm_source=commons.wikimedia.org&utm_content=original"
                response = Mock(json=Mock(return_value={
                    "query": {"pages": {"1": {"imageinfo": [{"url": url}]}}}
                }))
                with patch.object(expeditions.requests, "get", return_value=response) as get:
                    self.assertEqual(expeditions.get_expedition_patch_url(75), url)
                get.assert_called_once()

    def setUp(self):
        self.record = {
            "expedition": 74,
            "start": "2025-12-08",
            "end": "2026-07-26",
            "expeditionBlurb": "Mission description",
            "patchUrl": "https://example.com/patch.png",
        }
        self.today = date(2026, 9, 30)

    def test_missing_end_is_refreshed(self):
        del self.record["end"]
        self.assertTrue(expeditions.needs_refresh(self.record, self.today))

    def test_incomplete_or_provisional_mission_is_refreshed(self):
        for end in (None, "", "Spring 2027", "2027-04-01", "2026-09-30"):
            with self.subTest(end=end):
                self.record["end"] = end
                self.assertTrue(expeditions.needs_refresh(self.record, self.today))

    def test_complete_past_mission_is_skipped(self):
        self.assertFalse(expeditions.needs_refresh(self.record, self.today))

    @patch.object(expeditions.time, "sleep")
    def test_routine_update_skips_history_and_commons(self, sleep):
        active = dict(self.record, expedition=75, end=None)
        with patch.object(expeditions, "scrape_expedition", side_effect=[active, None]) as scrape, patch.object(
            expeditions, "get_expedition_patch_url"
        ) as lookup:
            result = expeditions.update_expeditions([self.record, active], {}, self.today)
        self.assertEqual(scrape.call_args_list, [call(75), call(76)])
        lookup.assert_not_called()
        self.assertEqual(result, [self.record, active])

    @patch.object(expeditions.time, "sleep")
    def test_discovers_new_mission_and_caches_missing_patch(self, sleep):
        new = dict(self.record, expedition=75, end=None, patchUrl=None)
        checks = {}
        with patch.object(expeditions, "scrape_expedition", side_effect=[new, None]), patch.object(
            expeditions, "get_expedition_patch_url", return_value=None
        ) as lookup:
            result = expeditions.update_expeditions([self.record], checks, self.today)
        lookup.assert_called_once_with(75)
        self.assertEqual(checks, {"75": "2026-09-30"})
        self.assertEqual(len(result), 2)
        for day, expected in ((date(2026, 10, 1), 0), (date(2026, 10, 7), 1)):
            with patch.object(expeditions, "scrape_expedition", side_effect=[new, None]), patch.object(
                expeditions, "get_expedition_patch_url", return_value=None
            ) as lookup:
                expeditions.update_expeditions(result, checks, day)
                self.assertEqual(lookup.call_count, expected)

    @patch.object(expeditions.time, "sleep")
    def test_network_failure_does_not_count_as_missing_expedition(self, sleep):
        with patch.object(expeditions, "scrape_expedition", side_effect=expeditions.requests.Timeout), patch.object(
            expeditions, "get_expedition_patch_url"
        ) as lookup:
            with self.assertRaises(expeditions.requests.Timeout):
                expeditions.update_expeditions([self.record], {}, self.today)
        lookup.assert_not_called()

    @patch.object(expeditions.time, "sleep")
    def test_patch_titles_and_search_results_are_batched(self, sleep):
        responses = [
            {"query": {"pages": {}}},
            {"query": {"search": [{"title": "File:one.png"}, {"title": "File:two.svg"}]}},
            {"query": {"pages": {"1": {"imageinfo": [{"url": "https://example.com/patch.svg"}]}}}},
        ]
        with patch.object(expeditions.requests, "get", side_effect=[
            Mock(json=Mock(return_value=data)) for data in responses
        ]) as get:
            self.assertEqual(expeditions.get_expedition_patch_url(75), "https://example.com/patch.svg")
        self.assertEqual(get.call_count, 3)
        self.assertEqual(len(get.call_args_list[0].kwargs["params"]["titles"].split("|")), 6)
        self.assertEqual(get.call_args_list[2].kwargs["params"]["titles"], "File:one.png|File:two.svg")


if __name__ == "__main__":
    unittest.main()
