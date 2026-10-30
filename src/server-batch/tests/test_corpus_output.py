"""Corpus output stays visible through the incremental runner's line reader."""

import importlib.util
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

COMM_DIR = Path(__file__).resolve().parents[1] / "1_comm"
sys.path.insert(0, str(COMM_DIR))
spec = importlib.util.spec_from_file_location("corpus_output", COMM_DIR / "5_corpus_initial_prompt_ai_gen.py")
corpus = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = corpus
spec.loader.exec_module(corpus)


class CorpusOutputTests(unittest.TestCase):
    def test_reasoning_is_visible_before_completion_and_text_is_literal(self):
        output = StringIO()
        with redirect_stdout(output), patch.object(corpus.time, "monotonic", return_value=0) as clock:
            logger = corpus.CorpusOutputLogger("2026-10-25", "worker-1")
            logger.set_stage("brief")
            logger({"thinking": "Checking sources"})
            clock.return_value = 1.1
            logger({"thinking": " now"})
            self.assertIn("brief REASONING: Checking sources now\n", output.getvalue())
            logger({"response": '{"blog_topics": ["[bold]literal[/bold]"]}', "done": True})
        self.assertIn('brief TEXT: {"blog_topics": ["[bold]literal[/bold]"]}\n', output.getvalue())
        self.assertTrue(all(line.startswith("Comm 2026-10-25 / worker-1 / brief") for line in output.getvalue().splitlines()))

    def test_long_output_is_bounded_and_stage_change_flushes_short_tail(self):
        output = StringIO()
        with redirect_stdout(output):
            logger = corpus.CorpusOutputLogger("2026-10-25", "worker-1")
            logger.set_stage("brief")
            logger({"thinking": "x" * 1000})
            logger({"response": "brief tail"})
            logger.set_stage("prompt")
            logger({"response": "Houston, Moscow", "done": True})
        lines = output.getvalue().splitlines()
        reasoning = [line.split("REASONING: ", 1)[1] for line in lines if "REASONING:" in line]
        self.assertEqual("".join(reasoning), "x" * 1000)
        self.assertTrue(all(len(chunk) <= 240 for chunk in reasoning))
        self.assertIn("brief TEXT: brief tail", output.getvalue())
        self.assertIn("prompt TEXT: Houston, Moscow", output.getvalue())

    def test_worker_logs_saved_output_and_partial_failure_without_monitor(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            prompt = root / "prompt.txt"
            prompt.write_text("Saved final glossary", encoding="utf-8")
            corpus._init_worker({"repo_root": str(root), "show_output": True}, None)
            for failure in (False, True):
                with self.subTest(failure=failure), patch.object(corpus, "PromptContextConfig"), patch.object(corpus, "StrataClient"), patch.object(corpus, "PromptContextPipeline") as pipeline:
                    output = StringIO()

                    def process(date, **kwargs):
                        kwargs["status_callback"]("brief", {})
                        kwargs["on_event"]({"thinking": "Checking this date"})
                        if failure:
                            raise RuntimeError("Inference failed")
                        kwargs["on_event"]({"response": "Raw answer", "done": True})
                        return SimpleNamespace(skipped=False, characters=20, elapsed_seconds=1, prompt_path=prompt)

                    pipeline.return_value.process_date.side_effect = process
                    with redirect_stdout(output):
                        result = corpus._worker_task("2026-10-25")
                    self.assertIn("REASONING: Checking this date\n", output.getvalue())
                    if failure:
                        self.assertEqual(result.status, "error")
                        self.assertIn("ERROR: Inference failed", output.getvalue())
                        self.assertNotIn("FINAL OUTPUT", output.getvalue())
                    else:
                        self.assertEqual(result.status, "ok")
                        self.assertIn("TEXT: Raw answer", output.getvalue())
                        self.assertIn("FINAL OUTPUT: Saved final glossary", output.getvalue())


if __name__ == "__main__":
    unittest.main()
