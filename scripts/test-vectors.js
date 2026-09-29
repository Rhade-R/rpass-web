#!/usr/bin/env node
'use strict';

/*
 * Headless run of the reference vectors under Node (18 or newer).
 *
 *   node scripts/test-vectors.js               test the sources in src/
 *   node scripts/test-vectors.js --html FILE   test the scripts inlined in a
 *                                              built page (e.g. index.html)
 *
 * This runs the unmodified src/assets/js/test.js -- the same code src/test.htm
 * runs in a browser -- against a stubbed DOM.  The vectors are read from
 * src/test.htm.  The libraries under test come either from the source files
 * or from the inline <script> blocks of a built page, so the artifact that
 * gets published can be tested, not just the sources.
 *
 * Exit status 0 only if every check passed AND the number of checks that ran
 * equals the number of vectors present (so silently skipped tests fail).
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const TIMEOUT_MS = 180000;

function read(p) {
	return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
}

// Scripts that need a real DOM are not part of what the vectors exercise.
const NEEDS_DOM = /frame-bust\.js$|\/main\.js$/;

function libsFromSource() {
	const page = read(path.join(SRC, 'main.htm'));
	const files = Array.from(page.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g), m => m[1])
		.filter(s => !NEEDS_DOM.test(s));
	return files.map(f => ({ name: f, code: read(path.join(SRC, f)) }));
}

function libsFromBuilt(file) {
	const page = read(file);
	const blocks = Array.from(page.matchAll(/<script>\n([\s\S]*?)\n<\/script>/g), m => m[1]);
	return blocks
		.map(js => js.replace(/<\\\/script>/g, '</script>'))
		.filter(js => !js.includes('window.top !== window.self') && !js.includes("getElementsByTagName('*')"))
		.map((code, i) => ({ name: 'inline script #' + i, code: code }));
}

function main() {
	const args = process.argv.slice(2);
	const at = args.indexOf('--html');
	const builtFile = at !== -1 ? args[at + 1] : null;
	if (at !== -1 && !builtFile) {
		console.error('--html needs a file argument');
		process.exit(2);
	}

	const testPage = read(path.join(SRC, 'test.htm'));
	function embedded(id) {
		const m = testPage.match(new RegExp('<script type="application/json" id="' + id + '">([\\s\\S]*?)</script>'));
		if (!m) {
			console.error('test.htm has no embedded vectors with id ' + id);
			process.exit(2);
		}
		return m[1];
	}
	const v2 = JSON.parse(embedded('v2-vectors'));
	const legacy = JSON.parse(embedded('legacy-vectors'));
	const list = d => (Array.isArray(d) ? d : d.vectors) || [];
	const expected = list(v2).length + 3 * (v2.separation || []).length + list(legacy).length + 1;

	let resolveDone;
	const done = new Promise(resolve => { resolveDone = resolve; });
	const summary = {
		style: {},
		_text: 'Loading...',
		get textContent() { return this._text; },
		set textContent(v) {
			this._text = v;
			if (!/^Loading/.test(v)) resolveDone();
		}
	};
	const results = { style: {}, textContent: '' };
	const elements = {
		summary: summary,
		results: results,
		'v2-vectors': { textContent: embedded('v2-vectors') },
		'legacy-vectors': { textContent: embedded('legacy-vectors') }
	};

	globalThis.self = globalThis;
	globalThis.window = globalThis;
	globalThis.document = { getElementById: id => elements[id] || null };
	if (!globalThis.crypto || !globalThis.crypto.subtle) {
		Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
	}

	const libs = builtFile ? libsFromBuilt(builtFile) : libsFromSource();
	if (libs.length === 0) {
		console.error('no library scripts found to test');
		process.exit(2);
	}
	for (const lib of libs) {
		try {
			vm.runInThisContext(lib.code, { filename: lib.name });
		} catch (err) {
			console.error('could not load ' + lib.name + ': ' + err.message);
			process.exit(2);
		}
	}
	for (const name of ['scrypt', 'RpassDerive', 'RpassVault']) {
		if (vm.runInThisContext('typeof ' + name) === 'undefined') {
			console.error('after loading the libraries, ' + name + ' is not defined');
			process.exit(2);
		}
	}

	console.log('Testing ' + (builtFile ? 'scripts inlined in ' + builtFile : 'sources in src/') +
		' (' + libs.length + ' scripts, ' + expected + ' checks expected)');

	vm.runInThisContext(read(path.join(SRC, 'assets/js/test.js')), { filename: 'test.js' });

	const timeout = new Promise((_, reject) => {
		setTimeout(() => reject(new Error('timed out after ' + TIMEOUT_MS / 1000 + ' s')), TIMEOUT_MS).unref();
	});
	Promise.race([done, timeout]).then(() => {
		const m = /^(\d+) passed, (\d+) failed \((\d+) total\)$/.exec(summary.textContent);
		if (!m) {
			console.error(summary.textContent);
			process.exit(1);
		}
		const passed = Number(m[1]);
		const failed = Number(m[2]);
		const total = Number(m[3]);
		const bad = results.textContent.split('\n').filter(l => !l.startsWith('PASS'));
		console.log(summary.textContent);
		if (failed !== 0 || total !== expected || passed !== expected) {
			if (bad.length) console.error(bad.join('\n'));
			if (total !== expected) {
				console.error('expected ' + expected + ' checks but ' + total + ' ran');
			}
			process.exit(1);
		}
	}).catch(err => {
		console.error(err.message);
		process.exit(1);
	});
}

main();
