"""Photo classification integration with mocked Strata chat-completion streams."""

import importlib.util
import json
import os
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


class StrataPhotoTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path = Path(__file__).resolve().parents[1] / "4_photos" / "9h_make_flickr_flight_photos_list_using_ai.py"
        spec = importlib.util.spec_from_file_location("strata_photo_script", path)
        cls.photos = importlib.util.module_from_spec(spec)
        with patch.dict(os.environ, {"RAW_FOLDER": str(path.parent),
                                     "STRATA_MODEL": "iq3_s"}):
            spec.loader.exec_module(cls.photos)

    def test_classification_consumes_answer_and_preserves_photo_metadata(self):
        response = Mock()
        response.iter_lines.return_value = iter([
            b'data: {"model":"iq3_s","choices":[{"delta":{"content":"FLIGHT"},"finish_reason":null}]}',
            b'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"completion_tokens":1}}',
        ])
        photo = {"id": "123", "title": "Crew", "description": "Aboard the ISS"}
        with patch("prompt_context.strata.requests.post", return_value=response) as post:
            result = self.photos.classify_single_photo((7, photo, 2))
        self.assertEqual(result["classification"], "FLIGHT")
        self.assertEqual(result["photo_id"], "123")
        self.assertEqual(result["response"], "FLIGHT")
        self.assertEqual(result["photo_index"], 7)
        self.assertEqual(post.call_args.kwargs["json"]["model"], "iq3_s")
        self.assertEqual(post.call_args.kwargs["json"]["max_tokens"], 256)

    def test_failed_generation_becomes_error_instead_of_photo_classification(self):
        client = Mock()
        client.generate.side_effect = RuntimeError("model unavailable")
        with patch.object(self.photos, "StrataClient", return_value=client):
            result = self.photos.classify_single_photo((0, {"id": "123"}, 1))
        self.assertEqual(result["classification"], "ERROR")

if __name__ == "__main__":
    unittest.main()
