'use strict';

/*
 * Reference-vector tests for both derivation algorithms and for the
 * v4 vault decryption contract.
 *
 * Vectors are embedded directly in test.htm as application/json
 * <script> blocks, so this page works from file:// with no HTTP
 * server. The vault golden vector is inlined here; it was produced
 * by an independent implementation (Node's crypto.scryptSync +
 * crypto.hkdfSync + createCipheriv) and is the one test that pins
 * the vault key schedule.
 */

(function () {
	const summary = document.getElementById('summary');
	const results = document.getElementById('results');

	let passed = 0;
	let failed = 0;
	const lines = [];

	function report(ok, label) {
		if (ok) {
			passed++;
			lines.push('PASS  ' + label);
		} else {
			failed++;
			lines.push('FAIL  ' + label);
		}
	}

	function deriveAsync(mp, service, user, iter, algorithm) {
		return new Promise(function (resolve) {
			RpassDerive.derive(mp, service, user, iter, algorithm, resolve);
		});
	}

	function vectorLabel(v, algorithm) {
		return (
			algorithm +
			'  mp=' + JSON.stringify(v.mp) +
			'  service=' + JSON.stringify(v.service) +
			'  user=' + JSON.stringify(v.user) +
			'  iter=' + JSON.stringify(v.iter)
		);
	}

	async function runVectors(elementId, algorithm) {
		const el = document.getElementById(elementId);
		if (!el) throw new Error('Missing embedded vectors: ' + elementId);
		const data = JSON.parse(el.textContent);
		const vectors = Array.isArray(data) ? data : data.vectors;
		for (const v of vectors) {
			const derived = await deriveAsync(
				v.mp, v.service, v.user, v.iter, algorithm
			);
			report(derived === v.password, vectorLabel(v, algorithm));
		}
		return data;
	}

	async function runSeparation(data) {
		if (!data || !data.separation) return;
		for (const s of data.separation) {
			const a = await deriveAsync(
				s.mp, s.a.service, s.a.user, s.a.iter, 'v2'
			);
			const b = await deriveAsync(
				s.mp, s.b.service, s.b.user, s.b.iter, 'v2'
			);
			report(a === s.passwordA, 'v2 separation A ' + JSON.stringify(s.a));
			report(b === s.passwordB, 'v2 separation B ' + JSON.stringify(s.b));
			report(
				a !== b,
				'v2 separation distinct ' +
					JSON.stringify(s.a) + ' vs ' + JSON.stringify(s.b)
			);
		}
	}

	// --- vault golden vector ------------------------------------------
	//
	// Same blob as the extension's tests/vault-key-vector.test.ts.
	// Produced with Node's built-in crypto.scryptSync (N=131072, r=8,
	// p=1, dkLen=32), crypto.hkdfSync and createCipheriv('aes-256-gcm')
	// — implementations independent of this file — so this is a real
	// cross-implementation check, not a snapshot of our own output.
	//
	// One real scrypt call at N=2^17; expect a ~1s pause.

	const GOLDEN_BLOB = {
		salt: 'AQIDBAUGBwgJCgsMDQ4PEA==',
		iv: 'oKGio6Slpqeoqaqr',
		ciphertext:
			'0oAWSyH76FfATd3HIggwmkyIIL1gvKnxeg7OMQUY6bJ1mafEY0xsPA/Ryr6n5RdZp+rBjdVyQUo4nymvpFf+PpAx/HLvKfQeNjpS1n7bFh1wloGatXigaJdR6BIyrBYwJMkI7efIHPXcdtfURrzpt8gg/iZnwg26jgdr74aIdSAOwGGT0y+u+x7E/LKBlX7Slx7d+MgXcFoe8K+cDbgay7qy+/tbcBRaeSTRcWgdL8lthEG06swxqZY9EIZpgL39xA==',
		check: 'MPd8razWOiai+PpclI+Rz58c0gz0zCUWESzgy4Z9mow='
	};

	const GOLDEN_MP = 'correct horse battery staple';

	const GOLDEN_EXPECTED = {
		hosts: { 'example.com': 'example' },
		algorithms: { example: 'v2' },
		created: { example: { alice: '2026-01-01T00:00:00.000Z' } },
		lastExport: null,
		services: { example: { alice: 0 } }
	};

	// Order-insensitive structural comparison, matching what the
	// extension's test suite gets from Vitest's `toEqual`. Plain
	// JSON.stringify would be sensitive to key insertion order.
	function canonical(obj) {
		if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
		if (Array.isArray(obj)) {
			return '[' + obj.map(canonical).join(',') + ']';
		}
		const keys = Object.keys(obj).sort();
		return (
			'{' +
			keys.map(k => JSON.stringify(k) + ':' + canonical(obj[k])).join(',') +
			'}'
		);
	}

	async function runVaultVector() {
		let payload;
		try {
			payload = await RpassVault.load(GOLDEN_BLOB, GOLDEN_MP);
		} catch (err) {
			report(false, 'vault golden vector threw: ' + err.message);
			return;
		}
		const ok = canonical(payload) === canonical(GOLDEN_EXPECTED);
		report(ok, 'vault golden vector decrypts to expected payload');
		if (!ok) {
			lines.push('  expected: ' + canonical(GOLDEN_EXPECTED));
			lines.push('  actual:   ' + canonical(payload));
		}
	}

	async function run() {
		const v2Data = await runVectors('v2-vectors', 'v2');
		await runSeparation(v2Data);
		await runVectors('legacy-vectors', 'v1');
		await runVaultVector();

		summary.textContent =
			passed + ' passed, ' + failed + ' failed (' +
			(passed + failed) + ' total)';
		summary.style.color = failed === 0 ? '#6f6' : '#f66';
		results.textContent = lines.join('\n');
	}

	run().catch(function (err) {
		summary.textContent = 'Error: ' + err.message;
		summary.style.color = '#f66';
		console.error(err);
	});
})();
