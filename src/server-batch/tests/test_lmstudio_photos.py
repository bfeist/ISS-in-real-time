"""Photo classification integration with mocked native LM Studio streams."""

import importlib.util
import json
import os
import unittest
from pathlib import Path
from unittest.mock import Mock, patch


class LMStudioPhotoTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        path = Path(__file__).resolve().parents[1] / "4_photos" / "9h_make_flickr_flight_photos_list_using_ai.py"
        spec = importlib.util.spec_from_file_location("lmstudio_photo_script", path)
        cls.photos = importlib.util.module_from_spec(spec)
        with patch.dict(os.environ, {"RAW_FOLDER": str(path.parent),
                                     "LMSTUDIO_MODEL": "qwen3.8-27b"}):
            spec.loader.exec_module(cls.photos)

    def test_classification_consumes_answer_and_preserves_photo_metadata(self):
        response = Mock()
        response.iter_lines.return_value = iter([
            b'data: {"type":"message.delta","content":"FLIGHT"}',
            b'data: {"type":"chat.end","result":{"stats":{"total_output_tokens":1}}}',
        ])
        photo = {"id": "123", "title": "Crew", "description": "Aboard the ISS"}
        with patch("prompt_context.lmstudio.requests.post", return_value=response) as post:
            result = self.photos.classify_single_photo((7, photo, 2))
        self.assertEqual(result["classification"], "FLIGHT")
        self.assertEqual(result["photo_id"], "123")
        self.assertEqual(result["response"], "FLIGHT")
        self.assertEqual(result["photo_index"], 7)
        self.assertEqual(post.call_args.kwargs["json"]["model"], "qwen3.8-27b")
        self.assertEqual(post.call_args.kwargs["json"]["max_output_tokens"], 256)

    def test_failed_generation_becomes_error_instead_of_photo_classification(self):
        client = Mock()
        client.generate.side_effect = RuntimeError("model unavailable")
        with patch.object(self.photos, "LMStudioClient", return_value=client):
            result = self.photos.classify_single_photo((0, {"id": "123"}, 1))
        self.assertEqual(result["classification"], "ERROR")


if __name__ == "__main__":
    unittest.main()
