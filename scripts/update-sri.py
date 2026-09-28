#!/usr/bin/env python3
"""
Recompute the SRI integrity attributes in main.htm.

Run after editing any of the JS files (or after the vendored scrypt
library changes). The multi-file page will refuse to load its own
scripts if a hash is stale, which is exactly the point: a stale hash
means the file changed and needs review.

USAGE
    python scripts/update-sri.py
"""

import base64
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAIN = ROOT / 'main.htm'


def sri_for(path):
    digest = hashlib.sha384(path.read_bytes()).digest()
    return 'sha384-' + base64.b64encode(digest).decode('ascii')


def main():
    html = MAIN.read_text(encoding='utf-8')
    changed = 0

    def repl(match):
        nonlocal changed
        src = match.group('src')
        path = ROOT / src
        if not path.exists():
            print(f"  ! missing {src}", file=sys.stderr)
            return match.group(0)
        new_hash = sri_for(path)
        if new_hash != match.group('hash'):
            changed += 1
            print(f"  ~ {src}")
        return (
            f'<script src="{src}" '
            f'integrity="{new_hash}" '
            f'crossorigin="anonymous"></script>'
        )

    pattern = re.compile(
        r'<script\s+src="(?P<src>[^"]+)"\s+'
        r'integrity="(?P<hash>[^"]+)"\s+'
        r'crossorigin="anonymous"></script>'
    )
    html = pattern.sub(repl, html)
    MAIN.write_text(html, encoding='utf-8')
    print(f"Updated {changed} hash(es).")


if __name__ == '__main__':
    main()
