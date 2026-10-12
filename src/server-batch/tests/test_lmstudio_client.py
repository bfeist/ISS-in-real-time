"""LM Studio API regression tests; all HTTP requests are mocked."""

import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "1_comm"))
from prompt_context.lmstudio import LMStudioClient


def stream_response(*frames):
    response = Mock()
    lines = []
    for frame in frames:
        lines.extend([
            f"event: {frame['type']}".encode(),
            ("data: " + json.dumps(frame, ensure_ascii=False)).encode("utf-8"),
            b"",
        ])
    response.iter_lines.return_value = iter(lines)
    return response


def final_frame():
    return {
        "type": "chat.end",
        "result": {
            "model_instance_id": "gemma-instance",
            "stats": {"total_output_tokens": 6, "tokens_per_second": 3,
                      "model_load_time_seconds": 1},
        },
    }


class LMStudioClientTests(unittest.TestCase):
    def test_native_stream_preserves_unicode_reasoning_and_monitor_contract(self):
        response = stream_response(
            {"type": "chat.start", "model_instance_id": "gemma-instance"},
            {"type": "reasoning.delta", "content": "Check crew"},
            {"type": "message.delta", "content": "Soyuz, "},
            {"type": "message.delta", "content": "Zvezdá"},
            final_frame(),
        )
        events = []
        with patch("prompt_context.lmstudio.requests.post", return_value=response) as post:
            result = LMStudioClient(base_url="http://example.test:1234/v1/").generate(
                "mission context", system="Only a glossary", on_event=events.append,
                options={"num_predict": 128, "num_ctx": 99999},
            )
        self.assertEqual(post.call_args.args[0], "http://example.test:1234/api/v1/chat")
        payload = post.call_args.kwargs["json"]
        self.assertEqual(payload["input"], "mission context")
        self.assertEqual(payload["system_prompt"], "Only a glossary")
        self.assertEqual(payload["max_output_tokens"], 128)
        self.assertEqual(payload["reasoning"], "off")
        self.assertFalse(payload["store"])
        self.assertNotIn("num_ctx", payload)
        self.assertEqual(result.text, "Soyuz, Zvezdá")
        self.assertEqual(events[1]["thinking"], "Check crew")
        self.assertTrue(events[-1]["done"])
        self.assertEqual(result.metrics.eval_count, 6)
        self.assertEqual(result.metrics.eval_duration, 2e9)
        self.assertEqual(result.metrics.load_duration, 1e9)
        response.close.assert_called()

    def test_explicit_model_wins_over_environment(self):
        with patch.dict(os.environ, {"LMSTUDIO_MODEL": "pipeline-instance"}):
            self.assertEqual(LMStudioClient().default_model, "pipeline-instance")
            self.assertEqual(LMStudioClient(default_model="explicit").default_model, "explicit")

    def test_stream_error_and_incomplete_stream_do_not_report_success(self):
        for response in (
            stream_response({"type": "error", "error": {"message": "failed"}}),
            stream_response({"type": "message.delta", "content": "partial"}),
            stream_response(final_frame()),
        ):
            with self.subTest(response=response), patch(
                "prompt_context.lmstudio.requests.post", return_value=response
            ):
                with self.assertRaises(RuntimeError):
                    LMStudioClient(max_retries=1).generate("test")
                response.close.assert_called()

    def test_http_client_error_is_not_retried_and_response_is_closed(self):
        response = Mock(status_code=404)
        response.raise_for_status.side_effect = requests.HTTPError(response=response)
        with patch("prompt_context.lmstudio.requests.post", return_value=response) as post:
            with self.assertRaises(requests.HTTPError):
                LMStudioClient().generate("test")
        self.assertEqual(post.call_count, 1)
        response.close.assert_called_once()

    def test_connection_failure_retries(self):
        response = stream_response({"type": "message.delta", "content": "OK"}, final_frame())
        with patch("prompt_context.lmstudio.requests.post", side_effect=[
            requests.ConnectionError("offline"), response
        ]) as post, patch("prompt_context.lmstudio.time.sleep"):
            result = LMStudioClient().generate("test")
        self.assertEqual(result.text, "OK")
        self.assertEqual(result.metrics.attempt, 2)
        self.assertEqual(post.call_count, 2)

    def test_length_guard_closes_generation(self):
        response = stream_response({"type": "message.delta", "content": "too long"})
        with patch("prompt_context.lmstudio.requests.post", return_value=response):
            result = LMStudioClient().generate("test", max_length=3)
        self.assertTrue(result.metrics.was_terminated)
        response.close.assert_called()


if __name__ == "__main__":
    unittest.main()
