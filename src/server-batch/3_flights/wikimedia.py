"""Normalize scraped Wikimedia images to their original-file URLs."""

import re
from urllib.parse import urlsplit, urlunsplit


def convert_wikimedia_url(url):
    if url.startswith("//"):
        url = "https:" + url

    parsed = urlsplit(url)
    if parsed.hostname not in {"upload.wikimedia.org", "thumb.wikimedia.org"}:
        return url

    # Originals live on upload, even when Wikipedia serves the thumbnail
    # from thumb. Preserve the repository (commons, en, etc.) and encoding.
    path = re.sub(
        r"^(/wikipedia/[^/]+)/thumb/([^/]+/[^/]+/[^/]+)/[^/]+$",
        r"\1/\2",
        parsed.path,
    )
    return urlunsplit(("https", "upload.wikimedia.org", path, parsed.query, parsed.fragment))
