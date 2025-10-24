#!/usr/bin/env python3
"""
Fetch SPARQL results from Wikidata and save to JSON.
Batch processing script for ISS crewmember data.
"""

import json
import sys
import time
import os
from pathlib import Path
from dotenv import load_dotenv

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

load_dotenv(dotenv_path="../../../.env")
RAW_FOLDER = os.getenv("RAW_FOLDER")

WDQS_ENDPOINT = "https://query.wikidata.org/sparql"


def make_session(user_agent: str) -> requests.Session:
    s = requests.Session()
    retries = Retry(
        total=6,
        backoff_factor=1.5,  # exponential backoff: 0, 1.5, 3, 4.5, ...
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=frozenset(["GET", "POST"]),
        respect_retry_after_header=True,  # honor Retry-After on 429/503
    )
    s.mount("https://", HTTPAdapter(max_retries=retries))
    s.headers.update(
        {
            # Ask for SPARQL Results JSON (standard media type)
            "Accept": "application/sparql-results+json",
            # Identify yourself per WDQS etiquette
            "User-Agent": user_agent,
        }
    )
    return s


def run_query(session: requests.Session, sparql: str, timeout_s: int = 60) -> dict:
    # Use POST so long queries (VALUES lists, etc.) aren’t cut off
    resp = session.post(
        WDQS_ENDPOINT,
        data={"query": sparql},
        timeout=timeout_s,
    )
    # If throttled, respect Retry-After (requests+Retry above will generally handle this,
    # but in case it doesn’t, do a simple one-off wait here)
    if resp.status_code == 429 and "Retry-After" in resp.headers:
        wait = int(resp.headers["Retry-After"])
        time.sleep(wait)
        resp = session.post(WDQS_ENDPOINT, data={"query": sparql}, timeout=timeout_s)

    resp.raise_for_status()
    return resp.json()  # SPARQL 1.1/1.2 JSON results
    # (variables in head.vars, rows in results.bindings)


def main():
    # Configuration for batch processing
    script_dir = Path(__file__).parent
    sparql_file = script_dir / "1_crewmembers.sparql"
    output_file = "crewmembers_raw.json"
    user_agent = None
    timeout_s = 60

    sparql_path = Path(sparql_file)
    if not sparql_path.exists():
        print(f"ERROR: SPARQL file not found: {sparql_path}", file=sys.stderr)
        sys.exit(1)

    sparql = sparql_path.read_text(encoding="utf-8").strip()
    if not sparql:
        print("ERROR: SPARQL file is empty.", file=sys.stderr)
        sys.exit(1)

    session = make_session(user_agent)

    try:
        data = run_query(session, sparql, timeout_s=timeout_s)
    except requests.HTTPError as e:
        # Helpful diagnostics
        msg = getattr(e.response, "text", str(e))
        print(f"HTTP error: {e}\nResponse snippet:\n{msg[:500]}", file=sys.stderr)
        sys.exit(2)
    except requests.RequestException as e:
        print(f"Network error: {e}", file=sys.stderr)
        sys.exit(3)

    # Create output path in RAW_FOLDER
    output_path = os.path.join(RAW_FOLDER, output_file)
    out_path = Path(output_path)
    out_path.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        f"Wrote {out_path.resolve()} with {len(data.get('results', {}).get('bindings', []))} rows."
    )


if __name__ == "__main__":
    main()
