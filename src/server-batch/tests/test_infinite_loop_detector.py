from __future__ import annotations

import sys
import unittest
from pathlib import Path

PACKAGE_ROOT = Path(__file__).resolve().parents[1] / "1_comm"
sys.path.insert(0, str(PACKAGE_ROOT))

from prompt_context.ollama import InfiniteLoopDetector  # type: ignore[import]


class InfiniteLoopDetectorTests(unittest.TestCase):
    def setUp(self) -> None:  # type: ignore[override]
        self.detector = InfiniteLoopDetector(
            stall_timeout=5.0,
            max_duration=60.0,
            repetition_window=12,
            repetition_threshold=0.7,
        )
        self.detector.start()

    def test_detects_high_repetition_from_chunked_words(self) -> None:
        reason = None
        for _ in range(8):
            reason = self.detector.check_token("Активировать, Активировать")
            if reason:
                break
        self.assertIsNotNone(reason)
        assert reason is not None
        self.assertIn("repetition", reason)

    def test_ignores_varied_tokens(self) -> None:
        varied_detector = InfiniteLoopDetector(
            stall_timeout=5.0,
            max_duration=60.0,
            repetition_window=12,
            repetition_threshold=0.7,
        )
        varied_detector.start()
        tokens = [
            "Huntsville, Houston",
            "Moscow, Tsukuba",
            "Munich, S-band",
            "Ku-band, Crew",
            "Experiments, Payload",
        ]
        for token in tokens:
            self.assertIsNone(varied_detector.check_token(token))


if __name__ == "__main__":
    unittest.main()
