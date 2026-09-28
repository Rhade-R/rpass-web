#!/usr/bin/env python3
"""
Build a self-contained copy of the rpass web app.

Produces dist/rpass.html: the HTML with every stylesheet, script, and
image inlined. The result has no external dependencies, so it can be
saved once and used offline, and it can be verified with a single
SHA-256 of the file.

The CSP in the single-file build permits 'unsafe-inline' for scripts
and styles (they are inline). This is the trade-off for portability;
the multi-file build keeps the strict CSP plus SRI.

USAGE
    python scripts/build-single-file.py
"""

import base64
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'main.htm'
OUT = ROOT / 'dist' / 'rpass.html'


def to_data_uri(path, mime):
    data = path.read_bytes()
    return f'data:{mime};base64,{base64.b64encode(data).decode("ascii")}'


def inline_css_urls(css, base_dir):
    def repl(match):
        url = match.group(1).strip('\'"')
        # strip cache-busting query, if any
        url = url.split('?', 1)[0]
        target = (base_dir / url).resolve()
        if not target.exists():
            return match.group(0)
        ext = target.suffix.lower()
        mime = {
            '.woff2': 'font/woff2',
            '.woff': 'font/woff',
            '.ttf': 'font/ttf',
            '.svg': 'image/svg+xml',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
        }.get(ext)
        if not mime:
            return match.group(0)
        return f'url("{to_data_uri(target, mime)}")'
    return re.sub(r'url\(([^)]+)\)', repl, css)


def main():
    if not SRC.exists():
        sys.exit(f"Run from the web repo root (main.htm not found).")
    OUT.parent.mkdir(parents=True, exist_ok=True)

    html = SRC.read_text(encoding='utf-8')

    # Inline stylesheets.
    def link_repl(match):
        attrs = match.group(0)
        href_m = re.search(r'href="([^"]+)"', attrs)
        if not href_m:
            return attrs
        path = ROOT / href_m.group(1)
        if not path.exists():
            return attrs
        css = inline_css_urls(path.read_text(encoding='utf-8'), path.parent)
        return f'<style>\n{css}\n</style>'

    html = re.sub(
        r'<link\b[^>]*rel="stylesheet"[^>]*>',
        link_repl,
        html,
        flags=re.IGNORECASE,
    )

    # Inline scripts.
    def script_repl(match):
        src_m = re.search(r'src="([^"]+)"', match.group(0))
        if not src_m:
            return match.group(0)
        path = ROOT / src_m.group(1)
        if not path.exists():
            return match.group(0)
        js = path.read_text(encoding='utf-8')
        # Guard against accidental '</script>' inside the source.
        js = js.replace('</script>', '<\\/script>')
        return f'<script>\n{js}\n</script>'

    html = re.sub(
        r'<script\b[^>]*src="[^"]+"[^>]*></script>',
        script_repl,
        html,
        flags=re.IGNORECASE,
    )

    # Inline images.
    def img_repl(match):
        src = match.group(1)
        path = ROOT / src
        if not path.exists():
            return match.group(0)
        mime = {
            '.svg': 'image/svg+xml',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
        }.get(path.suffix.lower())
        if not mime:
            return match.group(0)
        return f'src="{to_data_uri(path, mime)}"'

    html = re.sub(r'src="([^":]+\.(?:svg|png|jpe?g))"', img_repl, html)

    # Loosen the CSP for the inline payload.
    html = html.replace(
        "default-src 'self'; script-src 'self'; style-src 'self'; "
        "img-src 'self' data:; connect-src 'none'; form-action 'none'; "
        "base-uri 'none'",
        "default-src 'none'; script-src 'unsafe-inline'; "
        "style-src 'unsafe-inline'; img-src data:; connect-src 'none'; "
        "form-action 'none'; base-uri 'none'",
    )

    OUT.write_text(html, encoding='utf-8')
    size_kb = OUT.stat().st_size / 1024
    print(f"Wrote {OUT} ({size_kb:.1f} kB)")

    # Print the SHA-256 so the user can record it.
    import hashlib
    digest = hashlib.sha256(OUT.read_bytes()).hexdigest()
    print(f"SHA-256: {digest}")


if __name__ == '__main__':
    main()
