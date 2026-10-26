from __future__ import annotations

import json
import os
import re
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

import requests


@dataclass(slots=True)
class GenerationMetrics:
    eval_count: Optional[int] = None
    eval_duration: Optional[float] = None
    load_duration: Optional[float] = None
    total_duration: Optional[float] = None
    model: Optional[str] = None
    options: Dict[str, Any] = field(default_factory=dict)
    attempt: int = 1
    was_terminated: bool = False
    termination_reason: Optional[str] = None


@dataclass(slots=True)
class GenerationResult:
    text: str
    metrics: GenerationMetrics
    raw_events: List[dict]


class InfiniteLoopDetector:
    """Detect when AI model is stuck in an infinite loop during generation."""

    def __init__(
        self,
        *,
        stall_timeout: float = 30.0,
        max_duration: float = 300.0,
        repetition_window: int = 50,
        repetition_threshold: float = 0.8,
    ):
        """
        Initialize the infinite loop detector.

        Args:
            stall_timeout: Max seconds without new output before considering it stalled
            max_duration: Absolute max generation time in seconds
            repetition_window: Number of recent tokens to check for repetition
            repetition_threshold: Fraction of repeated tokens that indicates a loop (0.0-1.0)
        """
        self.stall_timeout = stall_timeout
        self.max_duration = max_duration
        self.repetition_window = repetition_window
        self.repetition_threshold = repetition_threshold

        self.start_time: Optional[float] = None
        self.last_token_time: Optional[float] = None
        self.recent_tokens: deque = deque(maxlen=repetition_window)
        self.total_tokens = 0
        self._word_pattern = re.compile(r"\w+", re.UNICODE)

    def start(self) -> None:
        """Start monitoring a new generation."""
        self.start_time = time.perf_counter()
        self.last_token_time = self.start_time
        self.recent_tokens.clear()
        self.total_tokens = 0

    def check_token(self, token: str) -> Optional[str]:
        """
        Check if we should terminate based on this new token.

        Args:
            token: The newly generated token text

        Returns:
            Termination reason if we should stop, None if we should continue
        """
        if self.start_time is None:
            return None

        now = time.perf_counter()

        # Check 1: Absolute timeout
        elapsed = now - self.start_time
        if elapsed > self.max_duration:
            return f"Generation exceeded maximum duration ({self.max_duration}s)"

        # Check 2: Stall detection (no new tokens)
        time_since_last = now - self.last_token_time
        if time_since_last > self.stall_timeout:
            return f"Generation stalled for {time_since_last:.1f}s without output"

        # Update state
        self.last_token_time = now
        normalized_tokens = self._extract_tokens(token)
        if not normalized_tokens:
            normalized_tokens = [token.lower().strip()] if token.strip() else []

        self.total_tokens += len(normalized_tokens)
        required_samples = max(
            5,
            min(self.repetition_window, int(self.repetition_window * 0.8) or 1),
        )

        for normal_token in normalized_tokens:
            if not normal_token:
                continue
            self.recent_tokens.append(normal_token)

            if len(self.recent_tokens) >= required_samples:
                repetition_rate = self._calculate_repetition_rate()
                if repetition_rate >= self.repetition_threshold:
                    return f"Detected repetition loop ({repetition_rate:.1%} repetition rate)"

        return None

    def _calculate_repetition_rate(self) -> float:
        """Calculate what fraction of recent tokens are repetitive."""
        if not self.recent_tokens:
            return 0.0

        # Count unique tokens vs total tokens
        unique_count = len(set(self.recent_tokens))
        total_count = len(self.recent_tokens)

        # Lower uniqueness = higher repetition
        repetition_rate = 1.0 - (unique_count / total_count)
        return repetition_rate

    def _extract_tokens(self, text: str) -> List[str]:
        """Split a chunk of model output into normalized tokens."""
        if not text:
            return []
        tokens = [token.lower() for token in self._word_pattern.findall(text)]
        return tokens


class StrataClient:
    """Strata chat-completions client with streaming and generation telemetry."""

    def __init__(
        self,
        *,
        base_url: Optional[str] = None,
        default_model: Optional[str] = None,
        request_timeout: int = 300,
        max_retries: int = 3,
        retry_backoff: float = 2.0,
        default_options: Optional[Dict[str, Any]] = None,
        enable_loop_detection: bool = True,
        loop_detector_config: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.base_url = base_url or os.getenv(
            "STRATA_BASE_URL", "http://127.0.0.1:47831/v1"
        )
        self.base_url = self.base_url.rstrip("/")
        if not self.base_url.endswith("/v1"):
            self.base_url += "/v1"
        self.default_model = default_model or os.getenv("STRATA_MODEL", "iq3_xxs")
        self.request_timeout = request_timeout
        self.max_retries = max_retries
        self.retry_backoff = retry_backoff
        # Context length and GPU placement are managed in Strata.
        self.default_options = default_options or {
            "temperature": 0.3,  # Low temperature for consistent vocabulary generation
            "top_p": 0.9,  # Standard nucleus sampling
            "top_k": 40,  # Standard top-k sampling
            "num_predict": 2048,
            "repeat_penalty": 1.1,  # Prevent repetition
        }
        self.enable_loop_detection = enable_loop_detection
        self.loop_detector_config = loop_detector_config or {}

    def generate(
        self,
        prompt: str,
        *,
        model: Optional[str] = None,
        options: Optional[Dict[str, Any]] = None,
        system: Optional[str] = None,
        suffix: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        on_event: Optional[Callable[[dict], None]] = None,
        max_length: Optional[int] = None,
    ) -> GenerationResult:
        if suffix:
            prompt += suffix
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        payload = {
            "model": model or self.default_model,
            "messages": messages,
            "stream": True,
            "stream_options": {"include_usage": True},
            "chat_template_kwargs": {"enable_thinking": False},
        }
        merged_options = {**self.default_options, **(options or {})}
        for key in ("temperature", "top_p", "top_k", "repeat_penalty"):
            if key in merged_options:
                payload[key] = merged_options[key]
        if merged_options.get("num_predict", -1) > 0:
            payload["max_tokens"] = merged_options["num_predict"]

        last_error: Optional[Exception] = None
        for attempt in range(1, self.max_retries + 1):
            try:
                return self._execute(
                    payload, attempt, on_event=on_event, max_length=max_length
                )
            except requests.HTTPError as exc:  # pylint: disable=broad-except
                # 4xx errors are client errors (e.g. model not found) — don't retry
                if exc.response is not None and exc.response.status_code < 500:
                    raise
                last_error = exc
                if attempt == self.max_retries:
                    raise
                time.sleep(self.retry_backoff ** (attempt - 1))
            except Exception as exc:  # pylint: disable=broad-except
                last_error = exc
                if attempt == self.max_retries:
                    raise
                time.sleep(self.retry_backoff ** (attempt - 1))
        assert last_error  # Should never reach here without raising
        raise last_error

    def _execute(
        self,
        payload: Dict[str, Any],
        attempt: int,
        *,
        on_event: Optional[Callable[[dict], None]] = None,
        max_length: Optional[int] = None,
    ) -> GenerationResult:
        url = f"{self.base_url}/chat/completions"
        started = time.perf_counter()
        headers = {}
        if api_key := os.getenv("STRATA_API_KEY"):
            headers["Authorization"] = f"Bearer {api_key}"
        response = requests.post(
            url, json=payload, headers=headers, stream=True, timeout=self.request_timeout
        )
        try:
            response.raise_for_status()
        except Exception:
            response.close()
            raise

        metrics = GenerationMetrics(
            model=payload["model"], options={
                key: value for key, value in payload.items()
                if key != "messages"
            }, attempt=attempt
        )

        # Initialize loop detector
        detector: Optional[InfiniteLoopDetector] = None
        if self.enable_loop_detection:
            detector = InfiniteLoopDetector(**self.loop_detector_config)
            detector.start()

        try:
            return self._read_stream(
                response, metrics, detector, on_event=on_event,
                max_length=max_length, started=started,
            )
        finally:
            response.close()

    def _read_stream(self, response, metrics, detector, *, on_event, max_length, started):
        text_parts: List[str] = []
        raw_events: List[dict] = []
        current_length = 0
        completed = False
        for line in response.iter_lines():
            if not line:
                continue
            if isinstance(line, bytes):
                line = line.decode("utf-8")
            if not line.startswith("data:"):
                continue
            line = line[5:].strip()
            if line == "[DONE]":
                break
            try:
                frame = json.loads(line)
            except json.JSONDecodeError:
                continue
            if frame.get("error"):
                raise RuntimeError(f"Strata stream error: {frame['error']}")
            choices = frame.get("choices", [])
            choice = next((item for item in choices if item.get("index", 0) == 0), {})
            delta = choice.get("delta", {})
            finish_reason = choice.get("finish_reason")
            if finish_reason and finish_reason != "stop":
                raise RuntimeError(f"Strata generation stopped with {finish_reason}")
            # Keep the pipeline's response/thinking event contract for its monitor.
            event = {
                "response": delta.get("content") or "",
                "thinking": delta.get("reasoning_content") or delta.get("reasoning") or "",
                "done": finish_reason == "stop",
                "raw": frame,
            }
            if event["done"]:
                completed = True
            metrics.model = frame.get("model", metrics.model)
            if frame.get("usage"):
                metrics.eval_count = frame["usage"].get("completion_tokens")
            if frame.get("timings", {}).get("predicted_ms") is not None:
                metrics.eval_duration = frame["timings"]["predicted_ms"] * 1e6
            raw_events.append(event)

            # Check for infinite loop before processing (check both response and thinking)
            token_to_check = None
            if detector:
                if event.get("response"):
                    token_to_check = event["response"]
                elif event.get("thinking"):
                    token_to_check = event["thinking"]

                if token_to_check:
                    termination_reason = detector.check_token(token_to_check)
                    if termination_reason:
                        # Add termination event to raw events
                        raw_events.append(
                            {
                                "terminated": True,
                                "reason": termination_reason,
                                "timestamp": time.perf_counter(),
                                "total_tokens": detector.total_tokens,
                            }
                        )
                        metrics.was_terminated = True
                        metrics.termination_reason = termination_reason
                        # Close the response to stop generation
                        response.close()
                        break

            if on_event:
                try:
                    on_event(event)
                except Exception:  # pragma: no cover - defensive
                    pass

            if event.get("response"):
                text_parts.append(event["response"])
                current_length += len(event["response"])
                if max_length and current_length > max_length:
                    termination_reason = (
                        f"Generation exceeded maximum length ({max_length} characters)"
                    )
                    metrics.was_terminated = True
                    metrics.termination_reason = termination_reason
                    raw_events.append(
                        {
                            "terminated": True,
                            "reason": termination_reason,
                            "timestamp": time.perf_counter(),
                            "current_length": current_length,
                        }
                    )
                    response.close()
                    break
        metrics.total_duration = (time.perf_counter() - started) * 1e9
        text = "".join(text_parts).strip()
        if not completed and not metrics.was_terminated:
            raise RuntimeError("Strata stream ended before a finish reason")
        if not text and not metrics.was_terminated:
            raise RuntimeError("Strata returned no answer text")
        return GenerationResult(text=text, metrics=metrics, raw_events=raw_events)
