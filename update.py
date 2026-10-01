#!/usr/bin/env python3
"""
Web-app side of the migration-assistant / HIBP changes.

Run from the rpass-web repository root: python patch.py

Adds a forward-compatibility guard on the vault version, surfaces a
migration state from an imported backup, and notes in about.htm that
the HIBP master-password check is extension-only.

Every edit asserts its anchor was found exactly once. If any misses,
nothing is written.
"""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent


class Patch:
    def __init__(self) -> None:
        self.files: dict[str, str] = {}
        self.errors: list[str] = []
        self.post_steps: list[list[str]] = []

    def post(self, argv: list[str]) -> None:
        self.post_steps.append(argv)

    def _get(self, rel: str) -> str:
        if rel not in self.files:
            self.files[rel] = (ROOT / rel).read_text(encoding='utf-8')
        return self.files[rel]

    def replace(self, rel: str, old: str, new: str, count: int = 1) -> None:
        text = self._get(rel)
        n = text.count(old)
        if n != count:
            self.errors.append(
                f'{rel}: expected {count}× {old[:60]!r}, found {n}'
            )
            return
        self.files[rel] = text.replace(old, new)

    def commit(self) -> None:
        if self.errors:
            for e in self.errors:
                print(f'MISS: {e}', file=sys.stderr)
            sys.exit(1)
        for rel, text in self.files.items():
            (ROOT / rel).write_text(text, encoding='utf-8', newline='\n')
            print(f'wrote {rel}')
        for argv in self.post_steps:
            print(f'\n$ {" ".join(argv)}')
            result = subprocess.run(argv, cwd=ROOT)
            if result.returncode != 0:
                print(
                    f'\npost-commit step failed: {" ".join(argv)}\n'
                    'Source files were written; only this follow-up is incomplete.',
                    file=sys.stderr,
                )
                sys.exit(1)


p = Patch()

# =============================================================================
# vault.js — add KNOWN_VAULT_VERSION and checkVersion
# =============================================================================

p.replace(
    'src/assets/js/vault.js',
    "\tconst VAULT_KEY_PARAMS = {\n"
    "\t\tN: 1 << 17,\n"
    "\t\tr: 8,\n"
    "\t\tp: 1,\n"
    "\t\tdkLen: 32,\n"
    "\t\tinterruptStep: 1000,\n"
    "\t\tencoding: undefined\n"
    "\t};",
    "\tconst VAULT_KEY_PARAMS = {\n"
    "\t\tN: 1 << 17,\n"
    "\t\tr: 8,\n"
    "\t\tp: 1,\n"
    "\t\tdkLen: 32,\n"
    "\t\tinterruptStep: 1000,\n"
    "\t\tencoding: undefined\n"
    "\t};\n"
    "\n"
    "\t/*\n"
    "\t * Highest vault format version this page knows how to interpret.\n"
    "\t * Bump in lockstep with the extension when a new format version\n"
    "\t * lands. A backup whose `_v_` exceeds this may carry fields this\n"
    "\t * page would silently misread (or miss entirely), so the importer\n"
    "\t * warns — it does not refuse. Silent wrong passwords are the\n"
    "\t * failure mode being guarded against.\n"
    "\t */\n"
    "\tconst KNOWN_VAULT_VERSION = 6;",
)

p.replace(
    'src/assets/js/vault.js',
    "\tfunction load(stored, mp) {\n"
    "\t\tif (!stored || typeof stored !== 'object') {\n"
    "\t\t\tthrow new Error('not a vault object');\n"
    "\t\t}",
    "\t/**\n"
    "\t * Return a human-readable warning if the stored vault declares a\n"
    "\t * format version higher than this page understands, or `null` if\n"
    "\t * it looks fine. A missing `_v_` is version 1 and never warns.\n"
    "\t */\n"
    "\tfunction checkVersion(stored) {\n"
    "\t\tif (!stored || typeof stored !== 'object') return null;\n"
    "\t\tconst v = stored._v_;\n"
    "\t\tif (typeof v !== 'number') return null;\n"
    "\t\tif (v > KNOWN_VAULT_VERSION) {\n"
    "\t\t\treturn (\n"
    "\t\t\t\t'This backup was written by a newer version of rpass (v' +\n"
    "\t\t\t\tv +\n"
    "\t\t\t\t'); this page understands up to v' +\n"
    "\t\t\t\tKNOWN_VAULT_VERSION +\n"
    "\t\t\t\t'. Some fields may be missing or interpreted ' +\n"
    "\t\t\t\t'incorrectly.'\n"
    "\t\t\t);\n"
    "\t\t}\n"
    "\t\treturn null;\n"
    "\t}\n"
    "\n"
    "\tfunction load(stored, mp) {\n"
    "\t\tif (!stored || typeof stored !== 'object') {\n"
    "\t\t\tthrow new Error('not a vault object');\n"
    "\t\t}",
)

p.replace(
    'src/assets/js/vault.js',
    "\treturn { load: load };\n"
    "})();",
    "\treturn { load: load, checkVersion: checkVersion };\n"
    "})();",
)

# =============================================================================
# main.htm — add migration badge and import-notice elements
# =============================================================================

p.replace(
    'src/main.htm',
    '\t\t\t\t<button id="algorithm" type="button" aria-describedby="alg-hint" aria-label="Algorithm v1 (click to switch)">v1</button>\n'
    '\t\t\t</div>',
    '\t\t\t\t<button id="algorithm" type="button" aria-describedby="alg-hint" aria-label="Algorithm v1 (click to switch)">v1</button>\n'
    '\t\t\t\t<span id="migration-badge" class="migration-badge" hidden></span>\n'
    '\t\t\t</div>',
)

p.replace(
    'src/main.htm',
    '\t\t\t<div class="row">\n'
    '\t\t\t\t<button id="import" type="button">Import backup</button>\n'
    '\t\t\t\t<input type="file" id="import-file" accept=".json,application/json" hidden>\n'
    '\t\t\t</div>',
    '\t\t\t<div class="row">\n'
    '\t\t\t\t<button id="import" type="button">Import backup</button>\n'
    '\t\t\t\t<input type="file" id="import-file" accept=".json,application/json" hidden>\n'
    '\t\t\t</div>\n'
    '\t\t\t<p id="import-notice" class="import-notice" hidden></p>',
)

# =============================================================================
# main.js — hook checkVersion, migration badge, per-pair annotation
# =============================================================================

# Input handlers gain updateMigrationBadge calls.
p.replace(
    'src/assets/js/main.js',
    "ui.service.addEventListener('input', clearDone);\n"
    "ui.service.addEventListener('change', function () {\n"
    "\tthis.value = RpassDerive.normalizeIdentifier(this.value);\n"
    "\tclearDone();\n"
    "\tmaybeAutofillFromImport();\n"
    "});\n"
    "\n"
    "ui.user.addEventListener('input', clearDone);\n"
    "ui.user.addEventListener('change', function () {\n"
    "\tthis.value = RpassDerive.normalizeIdentifier(this.value);\n"
    "\tclearDone();\n"
    "\tmaybeAutofillIter();\n"
    "});\n"
    "\n"
    "ui.iter.addEventListener('input', clearDone);\n"
    "ui.iter.addEventListener('change', function () {\n"
    "\tthis.value = RpassDerive.normalizeIter(this.value);\n"
    "\tclearDone();\n"
    "});",
    "ui.service.addEventListener('input', function () {\n"
    "\tclearDone();\n"
    "\tupdateMigrationBadge();\n"
    "});\n"
    "ui.service.addEventListener('change', function () {\n"
    "\tthis.value = RpassDerive.normalizeIdentifier(this.value);\n"
    "\tclearDone();\n"
    "\tmaybeAutofillFromImport();\n"
    "\tupdateMigrationBadge();\n"
    "});\n"
    "\n"
    "ui.user.addEventListener('input', function () {\n"
    "\tclearDone();\n"
    "\tupdateMigrationBadge();\n"
    "});\n"
    "ui.user.addEventListener('change', function () {\n"
    "\tthis.value = RpassDerive.normalizeIdentifier(this.value);\n"
    "\tclearDone();\n"
    "\tmaybeAutofillIter();\n"
    "\tupdateMigrationBadge();\n"
    "});\n"
    "\n"
    "ui.iter.addEventListener('input', function () {\n"
    "\tclearDone();\n"
    "\tupdateMigrationBadge();\n"
    "});\n"
    "ui.iter.addEventListener('change', function () {\n"
    "\tthis.value = RpassDerive.normalizeIter(this.value);\n"
    "\tclearDone();\n"
    "\tupdateMigrationBadge();\n"
    "});",
)

# Import handler: surface the version warning and the migration state.
p.replace(
    'src/assets/js/main.js',
    "\timportedVault = payload;\n"
    "\tpopulateDatalists(payload);\n"
    "\tsay('Backup imported. Service and username suggestions are now available in their fields.');\n"
    "});",
    "\timportedVault = payload;\n"
    "\tpopulateDatalists(payload);\n"
    "\tsay('Backup imported. Service and username suggestions are now available in their fields.');\n"
    "\n"
    "\t// A version mismatch is a persistent condition of this page's\n"
    "\t// state, not a transient status line, so it lives in its own\n"
    "\t// element and stays visible until a new import replaces it.\n"
    "\tconst versionWarning = RpassVault.checkVersion(stored);\n"
    "\tif (versionWarning) {\n"
    "\t\tui['import-notice'].textContent = '\\u26a0 ' + versionWarning;\n"
    "\t\tui['import-notice'].hidden = false;\n"
    "\t} else {\n"
    "\t\tui['import-notice'].hidden = true;\n"
    "\t\tui['import-notice'].textContent = '';\n"
    "\t}\n"
    "\n"
    "\tupdateMigrationBadge();\n"
    "});",
)

# Update maybeAutofill* to refresh the badge, and add the new functions.
p.replace(
    'src/assets/js/main.js',
    "function maybeAutofillFromImport() {\n"
    "\tif (!importedVault) return;\n"
    "\tconst service = ui.service.value;\n"
    "\tconst record = importedVault.services[service];\n"
    "\tif (!record) return;\n"
    "\tapplyImportedAlgorithm(service);\n"
    "\tconst users = Object.keys(record);\n"
    "\tif (users.length === 0) return;\n"
    "\tif (!ui.user.value) ui.user.value = users[0];\n"
    "\tconst iter = record[ui.user.value];\n"
    "\tif (iter !== undefined) ui.iter.value = String(iter);\n"
    "}\n"
    "\n"
    "function maybeAutofillIter() {\n"
    "\tif (!importedVault) return;\n"
    "\tconst record = importedVault.services[ui.service.value];\n"
    "\tif (!record) return;\n"
    "\tapplyImportedAlgorithm(ui.service.value);\n"
    "\tconst iter = record[ui.user.value];\n"
    "\tif (iter !== undefined) ui.iter.value = String(iter);\n"
    "}",
    "function maybeAutofillFromImport() {\n"
    "\tif (!importedVault) return;\n"
    "\tconst service = ui.service.value;\n"
    "\tconst record = importedVault.services[service];\n"
    "\tif (!record) return;\n"
    "\tapplyImportedAlgorithm(service);\n"
    "\tconst users = Object.keys(record);\n"
    "\tif (users.length === 0) return;\n"
    "\tif (!ui.user.value) ui.user.value = users[0];\n"
    "\tconst iter = record[ui.user.value];\n"
    "\tif (iter !== undefined) ui.iter.value = String(iter);\n"
    "\t// `ui.user.value` was set programmatically, which does not fire\n"
    "\t// a `change` event; refresh the badge here so it reflects the\n"
    "\t// newly-selected user.\n"
    "\tupdateMigrationBadge();\n"
    "}\n"
    "\n"
    "function maybeAutofillIter() {\n"
    "\tif (!importedVault) return;\n"
    "\tconst record = importedVault.services[ui.service.value];\n"
    "\tif (!record) return;\n"
    "\tapplyImportedAlgorithm(ui.service.value);\n"
    "\tconst iter = record[ui.user.value];\n"
    "\tif (iter !== undefined) ui.iter.value = String(iter);\n"
    "\tupdateMigrationBadge();\n"
    "}\n"
    "\n"
    "// Per-pair migration state of the currently-selected account, taken\n"
    "// from the imported backup. Shown only while a backup carrying a\n"
    "// non-empty `migration` map is loaded and both fields are filled.\n"
    "// Outside of that window the badge is hidden, matching the web\n"
    "// app's stateless-and-boring default.\n"
    "function updateMigrationBadge() {\n"
    "\tconst badge = ui['migration-badge'];\n"
    "\tif (!badge) return;\n"
    "\tif (!importedVault || !importedVault.migration) {\n"
    "\t\tbadge.hidden = true;\n"
    "\t\treturn;\n"
    "\t}\n"
    "\tconst svc = RpassDerive.normalizeIdentifier(ui.service.value);\n"
    "\tconst usr = RpassDerive.normalizeIdentifier(ui.user.value);\n"
    "\tif (!svc || !usr) {\n"
    "\t\tbadge.hidden = true;\n"
    "\t\treturn;\n"
    "\t}\n"
    "\tconst entry = importedVault.migration[svc];\n"
    "\tconst status = (entry && entry[usr]) || 'pending';\n"
    "\tbadge.hidden = false;\n"
    "\tbadge.textContent = status;\n"
    "\tbadge.classList.toggle('migrated', status === 'migrated');\n"
    "\tbadge.classList.toggle('pending', status === 'pending');\n"
    "\tbadge.title =\n"
    "\t\tstatus === 'migrated'\n"
    "\t\t\t? 'Backup recorded this account as migrated to the new master password'\n"
    "\t\t\t: 'Backup recorded this account as still on the previous master password';\n"
    "}",
)

# =============================================================================
# main.css — style the badge and the notice
# =============================================================================

p.replace(
    'src/assets/ss/main.css',
    '#local-hint {max-width: 25em;}',
    '#local-hint {max-width: 25em;}\n'
    '\n'
    '/* --- Migration state (from an imported backup) ----------------------- */\n'
    '\n'
    '.migration-badge {\n'
    '\tflex: 0 0 auto;\n'
    '\tfont-size: 0.75em;\n'
    '\tfont-weight: 700;\n'
    '\tmin-width: 4.5em;\n'
    '\tpadding: 0.25em 0.4em;\n'
    '\tmargin: 0.25em;\n'
    '\tborder-radius: 8px;\n'
    '\tbackground: var(--transp);\n'
    '\toutline: 1px solid var(--button-bgc);\n'
    '\tcolor: var(--button-bgc);\n'
    '\ttext-shadow: none;\n'
    '}\n'
    '\n'
    '.migration-badge.pending {\n'
    '\toutline-color: #FB4;\n'
    '\tcolor: #FB4;\n'
    '}\n'
    '\n'
    '.migration-badge.migrated {\n'
    '\toutline-color: var(--success-bgc);\n'
    '\tcolor: var(--success-bgc);\n'
    '}\n'
    '\n'
    '.import-notice {\n'
    '\tcolor: #FB4;\n'
    '\tfont-size: 0.8em;\n'
    '\tfont-weight: 700;\n'
    '\ttext-align: center;\n'
    '\ttext-align-last: center;\n'
    '\tline-height: 1.35;\n'
    '}',
)

# =============================================================================
# about.htm — HIBP note
# =============================================================================

p.replace(
    'src/about.htm',
    "\t\t<p>Moreover, hash functions, or key-derivation functions, are one-way algorithms, meaning they cannot be reversed to figure out the input (your master password and username) from the output (the hash, or password in this case), somewhat in the same way the exact addends of a regular summation of an arbitrary number of addends cannot be figured out from the sum.</p>",
    "\t\t<p>The Firefox extension offers an opt-in breach check for the master password during setup. That check is not available here. This page is designed to run from anywhere, including from hosts you do not control, and its content-security policy forbids outgoing network requests.</p>\n"
    "\n"
    "\t\t<p>Moreover, hash functions, or key-derivation functions, are one-way algorithms, meaning they cannot be reversed to figure out the input (your master password and username) from the output (the hash, or password in this case), somewhat in the same way the exact addends of a regular summation of an arbitrary number of addends cannot be figured out from the sum.</p>",
)

# =============================================================================
# Post-commit: rebuild the single-file pages
# =============================================================================

p.post([sys.executable, 'scripts/build-single-file.py'])

p.commit()