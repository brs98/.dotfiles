#!/usr/bin/env python3
"""Search Wikimedia Commons for chapter-plate candidates.

Usage: python3 commons-search.py "query one" "query two" ...

Prints title, license, and a 560px thumb URL for each bitmap hit. Prefer
Public domain / CC0 results; CC BY works need the source named in the
plate's caption. Pass the winning File: title to embed-images.mjs as
%%PLATE:File:...%% — do not hand-build thumb URLs (they 400 for many files).

Query tips learned the hard way:
- "wood engraving" / "etching" + a concrete noun beats abstract themes.
- Watch for false cognates ("door" is Dutch for "by" — Rijksmuseum titles
  are Dutch; searching Dutch terms like "vliegende ganzen" can help).
- Book-cover PDFs pollute results; this script filters to jpg/png already.
"""
import json
import sys
import urllib.parse
import urllib.request

UA = {"User-Agent": "codebase-storybook/1.0 (agent skill)"}
OK_EXT = (".jpg", ".jpeg", ".png")


def search(query, limit=10, width=560):
    params = urllib.parse.urlencode({
        "action": "query", "format": "json",
        "generator": "search", "gsrsearch": query,
        "gsrnamespace": 6, "gsrlimit": limit,
        "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": width,
    })
    req = urllib.request.Request(
        f"https://commons.wikimedia.org/w/api.php?{params}", headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        data = json.load(r)
    rows = []
    for p in (data.get("query", {}).get("pages", {}) or {}).values():
        title = p.get("title", "")
        if not title.lower().endswith(OK_EXT):
            continue
        ii = (p.get("imageinfo") or [{}])[0]
        md = ii.get("extmetadata", {}) or {}
        lic = (md.get("LicenseShortName", {}) or {}).get("value", "?")
        rows.append((p.get("index", 99), title, lic, ii.get("thumburl", "")))
    if not rows:
        print("  (no bitmap results — rephrase; see the query tips in this script's docstring)")
    for _, title, lic, thumb in sorted(rows)[:6]:
        print(f"{title}\n    [{lic}] {thumb}")


if __name__ == "__main__":
    queries = [a for a in sys.argv[1:] if not a.startswith("-")]
    if not queries or any(a in ("-h", "--help") for a in sys.argv[1:]):
        print(__doc__)
        sys.exit(0 if queries or len(sys.argv) > 1 else 1)
    for q in queries:
        print(f"== {q} ==")
        try:
            search(q)
        except Exception as e:  # noqa: BLE001
            print("ERROR:", e)
        print()
