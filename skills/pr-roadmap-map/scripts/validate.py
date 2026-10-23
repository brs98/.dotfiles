#!/usr/bin/env python3
"""Check a built roadmap page before publishing it as an Artifact.

Usage: validate.py PAGE.html

Fails (exit 1) when:
  - a <script type="application/json"> block does not parse with json.loads
  - any other inline <script> fails `node --check`
  - an external script is off the Artifact CDN allowlist or not pinned to an exact version
  - a stylesheet loads from anywhere but Google Fonts
  - there is no <title> in the first 8 KB, or the page is over 16 MB
  - a build placeholder (__ROADMAP_...__) was left in the page
"""
import json
import os
import re
import subprocess
import sys
import tempfile

SCRIPT_HOSTS = ('https://cdnjs.cloudflare.com/', 'https://cdn.jsdelivr.net/npm/', 'https://unpkg.com/',
                'https://cdn.tailwindcss.com/', 'https://code.jquery.com/')
PINNED = re.compile(r'(@|/)\d+\.\d+\.\d+([-.][\w.]+)?(/|$)')


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    path = sys.argv[1]
    html = open(path, encoding='utf-8').read()
    errors = []

    if len(html.encode()) > 16 * 1024 * 1024:
        errors.append('page is over 16 MB')
    if not re.search(r'<title>[^<]+</title>', html[:8192]):
        errors.append('no <title> in the first 8 KB')
    if '__ROADMAP_' in html:
        errors.append('a __ROADMAP_ placeholder was left in the page')

    js_blocks, json_blocks = [], 0
    for m in re.finditer(r'<script([^>]*)>(.*?)</script>', html, re.S):
        attrs, body = m.group(1), m.group(2)
        src = re.search(r'src="([^"]+)"', attrs)
        if src:
            url = src.group(1)
            if not url.startswith(SCRIPT_HOSTS):
                errors.append(f'script host not allowed: {url}')
            elif not PINNED.search(url):
                errors.append(f'script not pinned to an exact version: {url}')
            continue
        kind = re.search(r'type="([^"]+)"', attrs)
        if kind and 'json' in kind.group(1):
            json_blocks += 1
            try:
                json.loads(body)
            except json.JSONDecodeError as e:
                errors.append(f'JSON block {json_blocks} does not parse: {e}')
        elif not kind or kind.group(1) in ('module', 'text/javascript'):
            js_blocks.append(body)

    for href in re.findall(r'<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"', html):
        if not href.startswith('https://fonts.googleapis.com/'):
            errors.append(f'stylesheet host not allowed: {href}')

    for i, body in enumerate(js_blocks, 1):
        with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False) as f:
            f.write(body)
            tmp = f.name
        try:
            out = subprocess.run(['node', '--check', tmp], capture_output=True, text=True)
            if out.returncode != 0:
                errors.append(f'inline script {i} fails node --check:\n{out.stderr.strip()}')
        finally:
            os.unlink(tmp)

    if errors:
        print('FAIL ' + path)
        for e in errors:
            print('  - ' + e)
        sys.exit(1)
    print(f'OK {path}: {json_blocks} JSON block(s) parse, {len(js_blocks)} script(s) pass node --check, {len(html):,} bytes')


if __name__ == '__main__':
    main()
