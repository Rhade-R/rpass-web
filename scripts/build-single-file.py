#!/usr/bin/env python3
"""
Build the self-contained pages of the rpass web app.

    python scripts/build-single-file.py

Reads the multi-file sources in src/ and writes, at the repository root:

    index.html   <- src/main.htm    (the app: verify this file's SHA-256)
    about.html   <- src/about.htm

Every stylesheet, script, font and image is inlined, so each output is a
single file that can be hashed, saved, and used offline.

Nothing is written until the reference vectors (src/test.htm) have passed
against the scripts inlined in the built page; this needs Node.js 18+
(scripts/test-vectors.js).  Pass --skip-tests to build without Node.

The output is deterministic.  Sources are read with universal newlines and
the result is written as UTF-8 with LF line endings, so identical sources
give identical bytes (and an identical SHA-256) on Windows, macOS and Linux.

The single-file CSP permits 'unsafe-inline' for scripts and styles, because
they are inline; the multi-file sources keep the strict 'self' policy.
"""

import argparse
import base64
import hashlib
import html as htmllib
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'src'

MAIN_CSP_SOURCE = (
    "default-src 'self'; script-src 'self'; style-src 'self'; "
    "img-src 'self' data:; connect-src 'none'; form-action 'none'; "
    "base-uri 'none'"
)
# font-src is required: fonts fall back to default-src ('none' here), and
# the Hack font is inlined as a data: URI.
MAIN_CSP_SINGLE = (
    "default-src 'none'; script-src 'unsafe-inline'; "
    "style-src 'unsafe-inline'; img-src data:; font-src data:; "
    "connect-src 'none'; form-action 'none'; base-uri 'none'"
)
ABOUT_CSP_SOURCE = (
    "default-src 'self'; style-src 'self'; img-src 'self' data:; "
    "base-uri 'none'; form-action 'none'"
)
ABOUT_CSP_SINGLE = (
    "default-src 'none'; style-src 'unsafe-inline'; img-src data:; "
    "font-src data:; base-uri 'none'; form-action 'none'"
)

PAGES = [
    {
        'src': 'main.htm',
        'out': 'index.html',
        'csp': (MAIN_CSP_SOURCE, MAIN_CSP_SINGLE),
        'links': [('href="./about.htm"', 'href="about.html"')],
    },
    {
        'src': 'about.htm',
        'out': 'about.html',
        'csp': (ABOUT_CSP_SOURCE, ABOUT_CSP_SINGLE),
        'links': [('href="main.htm"', 'href="index.html"')],
    },
]

MIME = {
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
}


def fail(msg):
    sys.exit('build error: ' + msg)


def to_data_uri(path):
    mime = MIME.get(path.suffix.lower())
    if not mime:
        fail('no MIME type known for %s' % path)
    data = base64.b64encode(path.read_bytes()).decode('ascii')
    return 'data:%s;base64,%s' % (mime, data)


def inline_css_urls(css, base_dir):
    def repl(match):
        url = match.group(1).strip().strip('\'"')
        if url.startswith('data:'):
            return match.group(0)
        url = url.split('?', 1)[0]  # cache-busting query
        target = (base_dir / url).resolve()
        if not target.is_file():
            fail('CSS references a missing file: %s' % url)
        return 'url("%s")' % to_data_uri(target)

    return re.sub(r'url\(([^)]+)\)', repl, css)


def build(page):
    src = SRC / page['src']
    if not src.is_file():
        fail('%s not found (run from the repository root)' % src)
    html = src.read_text(encoding='utf-8')  # universal newlines -> LF

    def link_repl(match):
        m = re.search(r'href="([^"]+)"', match.group(0))
        if not m:
            fail('stylesheet <link> without href: %s' % match.group(0))
        path = SRC / m.group(1)
        if not path.is_file():
            fail('missing stylesheet: %s' % m.group(1))
        css = inline_css_urls(path.read_text(encoding='utf-8'), path.parent)
        return '<style>\n%s\n</style>' % css

    html = re.sub(r'<link\b[^>]*rel="stylesheet"[^>]*>', link_repl, html, flags=re.I)

    def script_repl(match):
        m = re.search(r'\bsrc="([^"]+)"', match.group(0))
        path = SRC / m.group(1)
        if not path.is_file():
            fail('missing script: %s' % m.group(1))
        js = path.read_text(encoding='utf-8')
        js = js.replace('</script>', '<\\/script>')
        return '<script>\n%s\n</script>' % js

    html = re.sub(r'<script\b[^>]*\bsrc="[^"]+"[^>]*></script>', script_repl, html, flags=re.I)

    def img_repl(match):
        path = SRC / match.group(2)
        if not path.is_file():
            fail('missing image: %s' % match.group(2))
        return match.group(1) + to_data_uri(path) + match.group(3)

    html = re.sub(r'(<img\b[^>]*?\bsrc=")([^":]+)(")', img_repl, html)

    for old, new in page['links']:
        if old not in html:
            fail('%s: expected link %s not found' % (page['src'], old))
        html = html.replace(old, new)

    csp_old, csp_new = page['csp']
    if csp_old not in html:
        fail('%s: source CSP not found; the single-file CSP would not apply' % page['src'])
    html = html.replace(csp_old, csp_new)

    problems = []
    if re.search(r'<script\b[^>]*\bsrc=', html, re.I):
        problems.append('external <script src=...> remains')
    if re.search(r'<link\b[^>]*rel="stylesheet"', html, re.I):
        problems.append('external stylesheet remains')
    for m in re.finditer(r'<img\b[^>]*\bsrc="([^"]*)"', html):
        if not m.group(1).startswith('data:'):
            problems.append('non-inline image: %s' % m.group(1))
    for style in re.findall(r'<style>(.*?)</style>', html, re.S):
        for u in re.findall(r'url\(([^)]*)\)', style):
            if not u.strip('\'"').startswith('data:'):
                problems.append('non-inline CSS url(): %s' % u[:60])
    if problems:
        fail('%s: %s' % (page['src'], '; '.join(problems)))

    out = ROOT / page['out']
    data = html.encode('utf-8')
    return out, data


def run_tests(data):
    """Run the reference vectors against the scripts inlined in `data`.

    Returns True/False, or None when Node.js is not installed."""
    node = shutil.which('node')
    if not node:
        return None
    with tempfile.TemporaryDirectory() as d:
        page = Path(d) / 'built.html'
        page.write_bytes(data)
        result = subprocess.run(
            [node, str(ROOT / 'scripts' / 'test-vectors.js'), '--html', str(page)],
            cwd=str(ROOT))
    return result.returncode == 0


def main():
    ap = argparse.ArgumentParser(description='Build the single-file pages.')
    ap.add_argument('--skip-tests', action='store_true',
                    help='do not run the reference vectors (output is UNTESTED)')
    args = ap.parse_args()

    # Build everything in memory first; write nothing until all tests pass.
    built = [build(page) + (page,) for page in PAGES]

    if args.skip_tests:
        print('WARNING: --skip-tests given; the output has NOT been tested.')
    else:
        for out, data, page in built:
            if b'RpassDerive' not in data:
                continue  # about.html has no scripts
            print('Testing %s ...' % page['out'])
            ok = run_tests(data)
            if ok is None:
                fail('Node.js not found. Install Node 18+, or pass --skip-tests '
                     '(the output would be untested).')
            if not ok:
                fail('reference vectors FAILED for %s; nothing was written.' % page['out'])

    for out, data, page in built:
        out.write_bytes(data)
        print('Wrote %s (%.1f kB)' % (out.relative_to(ROOT), len(data) / 1024))
        print('SHA-256 %s  %s' % (hashlib.sha256(data).hexdigest(), out.name))


if __name__ == '__main__':
    main()
