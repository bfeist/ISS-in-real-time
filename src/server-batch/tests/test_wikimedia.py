import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "3_flights" / "wikimedia.py"
SPEC = importlib.util.spec_from_file_location("wikimedia", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
convert_wikimedia_url = MODULE.convert_wikimedia_url


class WikimediaUrlTests(unittest.TestCase):
    def test_crew_7_thumbnail_hosts(self):
        for host in ("thumb", "upload"):
            with self.subTest(host=host):
                self.assertEqual(
                    convert_wikimedia_url(
                        f"//{host}.wikimedia.org/wikipedia/commons/thumb/b/b3/"
                        "SpaceX_Crew-7_logo.png/120px-SpaceX_Crew-7_logo.png"
                    ),
                    "https://upload.wikimedia.org/wikipedia/commons/b/b3/SpaceX_Crew-7_logo.png",
                )

    def test_repairs_already_generated_original_path(self):
        self.assertEqual(
            convert_wikimedia_url(
                "https://thumb.wikimedia.org/wikipedia/commons/b/b3/SpaceX_Crew-7_logo.png"
            ),
            "https://upload.wikimedia.org/wikipedia/commons/b/b3/SpaceX_Crew-7_logo.png",
        )

    def test_preserves_repository_svg_and_encoding(self):
        self.assertEqual(
            convert_wikimedia_url(
                "https://thumb.wikimedia.org/wikipedia/en/thumb/a/ab/"
                "Mission_%28patch%29.svg/120px-Mission_%28patch%29.svg.png"
            ),
            "https://upload.wikimedia.org/wikipedia/en/a/ab/Mission_%28patch%29.svg",
        )

    def test_leaves_originals_and_other_sources_unchanged(self):
        for url in (
            "",
            "https://upload.wikimedia.org/wikipedia/commons/b/b3/SpaceX_Crew-7_logo.png",
            "https://example.org/thumb/a/b/photo.jpg/120px-photo.jpg",
        ):
            with self.subTest(url=url):
                self.assertEqual(convert_wikimedia_url(url), url)


if __name__ == "__main__":
    unittest.main()
