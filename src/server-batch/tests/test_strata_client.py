"""Strata API regression tests; all HTTP requests are mocked."""

import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "1_comm"))
from prompt_context.strata import StrataClient


def stream_response(*frames):
    response = Mock()
    lines = []
    for frame in frames:
        lines.extend([
            ("data: " + json.dumps(frame, ensure_ascii=False)).encode("utf-8"),
            b"",
        ])
    response.iter_lines.return_value = iter(lines)
    return response


def delta_frame(**delta):
    return {"model": "iq3_xxs", "choices": [{"index": 0, "delta": delta, "finish_reason": None}]}


def final_frame():
    return {
        "model": "iq3_xxs",
        "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
        "usage": {"completion_tokens": 6},
        "timings": {"predicted_ms": 2000},
    }


class StrataClientTests(unittest.TestCase):
    def test_queue_and_prompt_processing_do_not_trigger_generation_watchdog(self):
        for first_delta in ({"content": "OK"}, {"reasoning_content": "Check"}):
            clock = [0.0]
            response = Mock()

            def lines():
                yield ("data: " + json.dumps(delta_frame(role="assistant", content=""))).encode()
                clock[0] = 100.0
                yield b": keep-alive"
                clock[0] = 350.0
                yield ("data: " + json.dumps(delta_frame(**first_delta))).encode()
                clock[0] = 351.0
                if "reasoning_content" in first_delta:
                    yield ("data: " + json.dumps(delta_frame(content="OK"))).encode()
                yield ("data: " + json.dumps(final_frame())).encode()

            response.iter_lines.side_effect = lines
            with self.subTest(first_delta=first_delta), patch(
                "prompt_context.strata.requests.post", return_value=response
            ), patch("prompt_context.strata.time.perf_counter", side_effect=lambda: clock[0]):
                result = StrataClient(request_timeout=600, max_retries=1).generate("test")
            self.assertEqual(result.text, "OK")
            self.assertFalse(result.metrics.was_terminated)

    def test_heartbeats_cannot_keep_first_output_wait_alive_indefinitely(self):
        clock = [0.0]
        response = Mock()

        def lines():
            yield b": keep-alive"
            clock[0] = 301.0
            yield b": keep-alive"

        response.iter_lines.side_effect = lines
        with patch("prompt_context.strata.requests.post", return_value=response), patch(
            "prompt_context.strata.time.perf_counter", side_effect=lambda: clock[0]
        ):
            with self.assertRaisesRegex(requests.Timeout, "queued or processing the prompt"):
                StrataClient(max_retries=1).generate("test")
        response.close.assert_called()

    def test_real_stall_after_generation_starts_is_still_terminated(self):
        clock = [0.0]
        response = Mock()

        def lines():
            yield ("data: " + json.dumps(delta_frame(content="partial"))).encode()
            clock[0] = 40.0
            yield ("data: " + json.dumps(delta_frame(content="late"))).encode()

        response.iter_lines.side_effect = lines
        with patch("prompt_context.strata.requests.post", return_value=response), patch(
            "prompt_context.strata.time.perf_counter", side_effect=lambda: clock[0]
        ):
            result = StrataClient(max_retries=1).generate("test")
        self.assertTrue(result.metrics.was_terminated)
        self.assertIn("stalled", result.metrics.termination_reason)
        response.close.assert_called()

    def test_chat_stream_preserves_unicode_reasoning_and_monitor_contract(self):
        response = stream_response(
            delta_frame(role="assistant", content=""),
            delta_frame(reasoning_content="Check crew"),
            delta_frame(content="Soyuz, "),
            delta_frame(content="Zvezd\u00e1"),
            final_frame(),
        )
        events = []
        with patch("prompt_context.strata.requests.post", return_value=response) as post:
            result = StrataClient(base_url="http://example.test:47831/v1/").generate(
                "mission context", system="Only a glossary", on_event=events.append,
                options={"num_predict": 128, "num_ctx": 99999},
            )
        self.assertEqual(post.call_args.args[0], "http://example.test:47831/v1/chat/completions")
        payload = post.call_args.kwargs["json"]
        self.assertEqual(payload["messages"], [
            {"role": "system", "content": "Only a glossary"},
            {"role": "user", "content": "mission context"},
        ])
        self.assertEqual(payload["max_tokens"], 128)
        self.assertEqual(payload["chat_template_kwargs"], {"enable_thinking": False})
        self.assertEqual(payload["stream_options"], {"include_usage": True})
        self.assertNotIn("num_ctx", payload)
        self.assertEqual(result.text, "Soyuz, Zvezdá")
        self.assertEqual(events[1]["thinking"], "Check crew")
        self.assertTrue(events[-1]["done"])
        self.assertEqual(result.metrics.eval_count, 6)
        self.assertEqual(result.metrics.eval_duration, 2e9)
        self.assertIsNone(result.metrics.load_duration)
        response.close.assert_called()

    def test_defaults_ignore_old_provider_environment(self):
        with patch.dict(os.environ, {"LMSTUDIO_MODEL": "old", "OLLAMA_MODEL": "old"}, clear=True):
            client = StrataClient()
        self.assertEqual(client.base_url, "http://127.0.0.1:47831/v1")
        self.assertEqual(client.default_model, "iq3_xxs")

    def test_base_url_normalization_and_api_key(self):
        for base in ("http://example.test:47831", "http://example.test:47831/v1/"):
            response = stream_response(delta_frame(content="OK"), final_frame())
            with patch.dict(os.environ, {"STRATA_API_KEY": "test-key"}), patch(
                "prompt_context.strata.requests.post", return_value=response
            ) as post:
                StrataClient(base_url=base).generate("test")
            self.assertEqual(post.call_args.args[0], "http://example.test:47831/v1/chat/completions")
            self.assertEqual(post.call_args.kwargs["headers"], {"Authorization": "Bearer test-key"})

    def test_usage_only_frame_after_finish_is_consumed(self):
        response = stream_response(
            delta_frame(content="OK"),
            {"choices": [{"delta": {}, "finish_reason": "stop"}]},
            {"choices": [], "usage": {"completion_tokens": 42}},
        )
        with patch("prompt_context.strata.requests.post", return_value=response):
            result = StrataClient().generate("test")
        self.assertEqual(result.text, "OK")
        self.assertEqual(result.metrics.eval_count, 42)

    def test_explicit_model_wins_over_environment(self):
        with patch.dict(os.environ, {"STRATA_MODEL": "pipeline-instance"}):
            self.assertEqual(StrataClient().default_model, "pipeline-instance")
            self.assertEqual(StrataClient(default_model="explicit").default_model, "explicit")

    def test_stream_error_and_incomplete_stream_do_not_report_success(self):
        for response in (
            stream_response({"type": "error", "error": {"message": "failed"}}),
            stream_response(delta_frame(content="partial")),
            stream_response(final_frame()),
            stream_response(delta_frame(content="partial"), {"choices": [{"finish_reason": "length"}]}),
        ):
            with self.subTest(response=response), patch(
                "prompt_context.strata.requests.post", return_value=response
            ):
                with self.assertRaises(RuntimeError):
                    StrataClient(max_retries=1).generate("test")
                response.close.assert_called()

    def test_http_client_error_is_not_retried_and_response_is_closed(self):
        response = Mock(status_code=404)
        response.raise_for_status.side_effect = requests.HTTPError(response=response)
        with patch("prompt_context.strata.requests.post", return_value=response) as post:
            with self.assertRaises(requests.HTTPError):
                StrataClient().generate("test")
        self.assertEqual(post.call_count, 1)
        response.close.assert_called_once()

    def test_connection_failure_retries(self):
        response = stream_response(delta_frame(content="OK"), final_frame())
        with patch("prompt_context.strata.requests.post", side_effect=[
            requests.ConnectionError("offline"), response
        ]) as post, patch("prompt_context.strata.time.sleep"):
            result = StrataClient().generate("test")
        self.assertEqual(result.text, "OK")
        self.assertEqual(result.metrics.attempt, 2)
        self.assertEqual(post.call_count, 2)

    def test_length_guard_closes_generation(self):
        response = stream_response(delta_frame(content="too long"))
        with patch("prompt_context.strata.requests.post", return_value=response):
            result = StrataClient().generate("test", max_length=3)
        self.assertTrue(result.metrics.was_terminated)
        response.close.assert_called()


if __name__ == "__main__":
    unittest.main()
