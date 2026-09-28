'use strict';

/*
 * Pure derivation logic shared by the main page and the test page.
 *
 * No DOM dependencies and no side effects on load: this file only
 * defines `RpassDerive`. It assumes `scrypt` (from
 * scrypt-async.min.js) is available as a global.
 *
 * The two algorithms and their normalization rules are documented in
 * the Firefox extension's docs/algorithms.md. This file mirrors
 * src/lib/crypto/legacy.ts and src/lib/crypto/v2.ts from that repo.
 */

const RpassDerive = (function () {
	const V1_PARAMS = {
		N: 32768,
		r: 8,
		p: 1,
		dkLen: 50,
		interruptStep: 1000,
		encoding: undefined
	};

	const V2_PARAMS = {
		N: 131072,
		r: 8,
		p: 1,
		dkLen: 32,
		interruptStep: 1000,
		encoding: undefined
	};

	const V2_PREFIX = 'rpass-v2';
	const V2_SEPARATOR = '|';
	const V2_ALPHABET =
		'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+';

	function normalizeIdentifier(input) {
		return String(input).replace(/^\s+|\s+$/g, '').toLowerCase();
	}

	function normalizeIter(input) {
		return String(input).replace(/\D|^0+(?=\d)/g, '');
	}

	function legacySalt(service, user, iter) {
		return (
			normalizeIter(iter) +
			normalizeIdentifier(service) +
			normalizeIdentifier(user)
		);
	}

	function v2Salt(service, user, iter) {
		return [
			V2_PREFIX,
			normalizeIdentifier(service),
			normalizeIdentifier(user),
			normalizeIter(iter)
		].join(V2_SEPARATOR);
	}

	function bytesToLegacyPassword(bytes) {
		let out = '';
		for (let i = 0; i < bytes.length; i++) {
			out += String.fromCharCode((bytes[i] % 95) + 32);
		}
		return out;
	}

	function bytesToV2Password(bytes) {
		let out = '';
		const len = V2_ALPHABET.length;
		for (let i = 0; i < bytes.length; i++) {
			out += V2_ALPHABET[bytes[i] % len];
		}
		return out;
	}

	function derive(mp, service, user, iter, algorithm, callback) {
		if (algorithm === 'v2') {
			scrypt(mp, v2Salt(service, user, iter), V2_PARAMS, function (derivedKey) {
				callback(bytesToV2Password(derivedKey));
			});
		} else {
			scrypt(
				mp,
				legacySalt(service, user, iter),
				V1_PARAMS,
				function (derivedKey) {
					callback(bytesToLegacyPassword(derivedKey));
				}
			);
		}
	}

	return {
		derive: derive,
		normalizeIdentifier: normalizeIdentifier,
		normalizeIter: normalizeIter,
		legacySalt: legacySalt,
		v2Salt: v2Salt,
		bytesToLegacyPassword: bytesToLegacyPassword,
		bytesToV2Password: bytesToV2Password,
		V1_PARAMS: V1_PARAMS,
		V2_PARAMS: V2_PARAMS,
		V2_ALPHABET: V2_ALPHABET
	};
})();
