"""NASA archive discovery and full-post download regression coverage."""

import importlib.util
import json
from pathlib import Path
from unittest.mock import Mock, patch

import pytest
import requests
from bs4 import BeautifulSoup


def load_script(name, filename):
    spec = importlib.util.spec_from_file_location(
        name, Path(__file__).resolve().parents[1] / "2_articles" / filename
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


urls = load_script("blog_urls", "6c_raw_blog_urls.py")
articles = load_script("blog_articles", "6d_raw_blog_articles.py")
consolidate = load_script("blog_consolidate", "6j_web_consolidate_blog_articles.py")
POST = "https://www.nasa.gov/blogs/spacestation/2026/07/31/science/"
ARCHIVE = "https://www.nasa.gov/blogs/spacestation/2026/07/"
ARCHIVE_HTML = f"""
<article class="nasa-blog">
  <a href="{POST}"><h2 class="margin-bottom-4 margin-top-2">Science</h2></a>
  <div class="blog-excerpt"><p>Preview only.</p></div>
  <a href="{POST}" aria-label="Read full post: Science"><span>Read Full Post</span></a>
</article>
"""
FULL_HTML = """
<div itemprop="articleBody">
  <h1>Science</h1>
  <p>Complete first paragraph.</p>
  <p>Research details absent from the preview, with <a href="https://nasa.gov">links</a>.</p>
  <p>Final paragraph.</p>
  <div class="blog-sidebar"><p>Author Name</p></div>
  <footer><p>Unrelated post preview</p><img src="https://nasa.gov/unrelated.jpg"></footer>
</div>
"""


def response(html, url=POST):
    return Mock(text=html, url=url, status_code=200)


def test_read_full_post_is_preferred_over_heading_link():
    html = ARCHIVE_HTML.replace(
        f'<a href="{POST}"><h2', '<a href="/blogs/spacestation/2026/07/"><h2'
    )
    assert urls.extract_article_urls(BeautifulSoup(html, "html.parser"), ARCHIVE) == [
        POST
    ]


@pytest.mark.parametrize(
    "html",
    [
        f'<h2 class="margin-bottom-4 margin-top-2"><a href="{POST}">Science</a></h2>',
        f'<a href="{POST}"><h2 class="margin-bottom-4 margin-top-2">Science</h2></a>',
    ],
)
def test_both_heading_layouts(html):
    assert urls.extract_article_urls(BeautifulSoup(html, "html.parser"), ARCHIVE) == [
        POST
    ]


def test_pagination_follows_next_link_and_deduplicates():
    next_url = ARCHIVE + "page/2/"
    first = ARCHIVE_HTML + '<a class="next page-numbers" href="page/2/">Next</a>'
    with patch.object(
        urls.requests,
        "get",
        side_effect=[response(first, ARCHIVE), response(ARCHIVE_HTML, next_url)],
    ) as get:
        assert urls.get_blog_urls_for_month(2026, 7) == [POST]
        assert get.call_args_list[1].args == (next_url,)


def test_failed_pagination_does_not_return_partial_month():
    first = ARCHIVE_HTML + '<a class="next page-numbers" href="page/2/">Next</a>'
    with patch.object(
        urls.requests,
        "get",
        side_effect=[response(first, ARCHIVE), requests.Timeout("timeout")],
    ):
        with pytest.raises(requests.Timeout):
            urls.get_blog_urls_for_month(2026, 7)


def test_changed_archive_markup_is_an_error():
    with patch.object(
        urls.requests,
        "get",
        return_value=response("<article>Unrecognized post</article>", ARCHIVE),
    ):
        with pytest.raises(RuntimeError, match="No full-post links"):
            urls.get_blog_urls_for_month(2026, 7)


def test_one_unrecognized_entry_does_not_silently_save_partial_archive():
    html = ARCHIVE_HTML + '<article class="nasa-blog"><h2>Missing link</h2></article>'
    with patch.object(urls.requests, "get", return_value=response(html, ARCHIVE)):
        with pytest.raises(RuntimeError, match="no full-post link"):
            urls.get_blog_urls_for_month(2026, 7)


def test_genuinely_empty_archive_is_allowed():
    with patch.object(
        urls.requests,
        "get",
        return_value=response('<main id="blog-archive-content-feed"></main>', ARCHIVE),
    ):
        assert urls.get_blog_urls_for_month(2026, 7) == []


def test_cross_posted_commercial_crew_url():
    commercial = POST.replace("spacestation", "commercialcrew")
    assert urls.extract_article_urls(
        BeautifulSoup(ARCHIVE_HTML.replace(POST, commercial), "html.parser"), ARCHIVE
    ) == [commercial]
    assert articles.extract_date_from_url(commercial) == ("2026", "07", "31", "science")
    assert articles.extract_date_from_url(ARCHIVE) == (None, None, None, None)


def test_downloads_full_post_without_author_or_related_post_content():
    with patch.object(
        articles.requests, "get", return_value=response(FULL_HTML)
    ) as get:
        post = articles.scrape_article(POST)
    get.assert_called_once_with(POST, timeout=30)
    assert post["title"] == "Science"
    assert len(post["paragraphs"]) == 3
    assert post["paragraphs"][-1] == "Final paragraph."
    assert 'target="blog_article"' in post["paragraphs"][1]
    assert post["image_filename"] is None


def test_archive_excerpt_is_not_saved_as_full_article():
    with patch.object(articles.requests, "get", return_value=response(ARCHIVE_HTML)):
        assert articles.scrape_article(POST) is None


def test_broken_permalink_recovers_complete_post_from_nasa_api():
    api_post = {
        "id": 123,
        "status": "publish",
        "link": POST,
        "title": {"rendered": "Science"},
        "content": {
            "rendered": "<p>First paragraph.</p><ul><li>Landing schedule</li></ul><p>Final paragraph.</p>",
            "protected": False,
        },
    }
    with patch.object(
        articles.requests,
        "get",
        side_effect=[Mock(status_code=404), Mock(json=Mock(return_value=[api_post]))],
    ):
        post = articles.scrape_article(POST)
    assert post["paragraphs"] == [
        "First paragraph.",
        "&#8226; Landing schedule",
        "Final paragraph.",
    ]
    assert (
        post["content_source_url"] == "https://www.nasa.gov/wp-json/wp/v2/nasa-blog/123"
    )


def test_api_fallback_does_not_accept_a_different_post():
    with patch.object(
        articles.requests,
        "get",
        side_effect=[
            Mock(status_code=404),
            Mock(
                json=Mock(
                    return_value=[
                        {
                            "status": "publish",
                            "link": POST.replace("science", "different"),
                            "content": {"rendered": "<p>Wrong post</p>"},
                        }
                    ]
                )
            ),
        ],
    ):
        assert articles.scrape_article(POST) is None


def test_no_body_text_is_a_failed_download():
    with patch.object(
        articles.requests,
        "get",
        return_value=response('<div itemprop="articleBody"><h1>Science</h1></div>'),
    ):
        assert articles.scrape_article(POST) is None


def test_full_post_retains_schedules_and_subheadings_in_order():
    html = FULL_HTML.replace(
        "<p>Final paragraph.</p>",
        "<h2>Landing schedule</h2><ul><li>Undocking</li><li><p>Landing at 6:25</p></li></ul><p>Final paragraph.</p>",
    )
    with patch.object(articles.requests, "get", return_value=response(html)):
        post = articles.scrape_article(POST)
    assert post["paragraphs"][2:] == [
        "<strong>Landing schedule</strong>",
        "&#8226; Undocking",
        "&#8226; Landing at 6:25",
        "Final paragraph.",
    ]


def test_incomplete_folder_is_retried_and_full_content_is_saved(tmp_path):
    manifest = tmp_path / "urls.txt"
    manifest.write_text(POST + "\n")
    output = tmp_path / "articles"
    (output / "2026/07/31-science").mkdir(parents=True)
    with (
        patch.object(articles, "blog_articles_folder", str(output)),
        patch.object(articles.requests, "get", return_value=response(FULL_HTML)),
        patch.object(articles.time, "sleep"),
    ):
        articles.process_url_file(manifest)
    saved = json.loads((output / "2026/07/31-science/article.json").read_text())
    assert len(saved["paragraphs"]) == 3
    assert saved["source_url"] == POST


def test_article_failure_is_reported_to_pipeline(tmp_path):
    manifest = tmp_path / "urls.txt"
    manifest.write_text(POST + "\n")
    with (
        patch.object(articles, "blog_articles_folder", str(tmp_path / "articles")),
        patch.object(articles.requests, "get", return_value=response(ARCHIVE_HTML)),
    ):
        with pytest.raises(RuntimeError, match="Failed to download 1 articles"):
            articles.process_url_file(manifest)


def test_image_failure_does_not_commit_article_json(tmp_path):
    manifest = tmp_path / "urls.txt"
    manifest.write_text(POST + "\n")
    html = FULL_HTML.replace("<h1>", '<img src="https://nasa.gov/hero.jpg"><h1>')
    with (
        patch.object(articles, "blog_articles_folder", str(tmp_path / "articles")),
        patch.object(articles.requests, "get", return_value=response(html)),
        patch.object(articles, "download_image", return_value=False),
    ):
        with pytest.raises(RuntimeError):
            articles.process_url_file(manifest)
    assert not list(tmp_path.rglob("article.json"))


def test_long_image_path_is_shortened_and_metadata_matches_download(tmp_path):
    manifest = tmp_path / "urls.txt"
    manifest.write_text(POST + "\n")
    output = tmp_path / "articles"
    filename = "nasa-spacewalk-" * 18 + ".jpg"
    html = FULL_HTML.replace("<h1>", f'<img src="https://nasa.gov/{filename}"><h1>')

    def save_image(url, path):
        assert url == f"https://nasa.gov/{filename}"
        assert len(str(Path(path).absolute())) <= 240
        Path(path).write_bytes(b"image")
        return True

    with (
        patch.object(articles, "blog_articles_folder", str(output)),
        patch.object(articles.requests, "get", return_value=response(html)),
        patch.object(articles, "download_image", side_effect=save_image) as download,
        patch.object(articles.time, "sleep"),
    ):
        articles.process_url_file(manifest)
        # A subsequent run must recognize the shortened file as complete.
        articles.process_url_file(manifest)
    download.assert_called_once()
    folder = output / "2026/07/31-science"
    saved = json.loads((folder / "article.json").read_text())
    assert saved["image_filename"].endswith(".jpg")
    assert saved["image_filename"] != filename
    assert (folder / saved["image_filename"]).read_bytes() == b"image"
    assert articles.local_image_filename(filename, str(folder)) == saved["image_filename"]
    assert articles.local_image_filename(filename.replace("nasa", "esa"), str(folder)) != saved["image_filename"]
    assert articles.local_image_filename("hero.jpg", str(folder)) == "hero.jpg"


def test_consolidation_refreshes_days_with_new_posts(tmp_path):
    raw = tmp_path / "raw"
    web = tmp_path / "web"
    for slug in ("first", "second"):
        folder = raw / f"2026/07/31-{slug}"
        folder.mkdir(parents=True)
        (folder / "article.json").write_text(
            json.dumps({"title": slug, "paragraphs": ["Full content"]})
        )
    day = web / "2026/07/31"
    day.mkdir(parents=True)
    (day / "articles.json").write_text('[{"title": "first"}]')
    with (
        patch.object(consolidate, "input_modern_articles_folder", str(raw)),
        patch.object(consolidate, "web_blog_articles_folder", str(web)),
    ):
        consolidate.copy_blog_article_for_date("2026-07-31")
    assert {p["title"] for p in json.loads((day / "articles.json").read_text())} == {
        "first",
        "second",
    }
