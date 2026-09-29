/*****************************************************
 This file is part of rpass.

    rpass is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    rpass is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with rpass.  If not, see <https://www.gnu.org/licenses/>.

	Home: https://github.com/Rhade-R/rpass-web

*******************************************************/

'use strict';

const cr = `\u00A9 ${new Date().getFullYear()} Rhade`;
const ui = document.getElementsByTagName('*');

const ALG_HINTS = {
	v1: 'v1 (legacy): 50 printable ASCII characters, may include spaces.',
	v2: 'v2: 32 characters from A-Z a-z 0-9 and !@#$%^&*()-_=+ (no spaces).'
};

let pw = null;
let algorithm = 'v1';
let importedVault = null;
let busy = false;
let resetTimer = null;
let generateStatusShown = false;

// This script is loaded at the end of <body>, so the DOM is ready.
ui.copyright.textContent = cr;
document.getElementsByTagName('footer')[0].hidden = false;

function setLabel(text) {
	ui.generate.firstElementChild.textContent = text;
}

function say(message, isError, fromGenerate) {
	ui.status.textContent = message;
	ui.status.classList.toggle('error', !!isError);
	generateStatusShown = !!fromGenerate && message !== '';
}

function isDone() {
	return ui.generate.classList.contains('done');
}

// Everything a derivation depends on, normalised the way derive.js does.
function inputKey() {
	return [
		ui.mp.value,
		RpassDerive.normalizeIdentifier(ui.service.value),
		RpassDerive.normalizeIdentifier(ui.user.value),
		RpassDerive.normalizeIter(ui.iter.value),
		algorithm
	].join('\u0000');
}

// Any edit invalidates a finished result.  While a derivation is running
// its result is checked against inputKey() when it completes instead.
function clearDone() {
	if (busy) return;
	clearTimeout(resetTimer);
	pw = null;
	ui.generate.classList.remove('done');
	setLabel('Generate');
	if (generateStatusShown) say('');
}

function setAlgorithm(next) {
	if (next === algorithm) return;
	algorithm = next;
	ui.algorithm.textContent = algorithm;
	ui.algorithm.classList.toggle('v2', algorithm === 'v2');
	ui.algorithm.setAttribute('aria-label', 'Algorithm ' + algorithm + ' (click to switch)');
	ui['alg-hint'].textContent = ALG_HINTS[algorithm];
	clearDone();
}

ui.algorithm.addEventListener('click', function (e) {
	setAlgorithm(algorithm === 'v1' ? 'v2' : 'v1');
});

ui['toggle-mp'].addEventListener('click', function (e) {
	const reveal = ui.mp.type === 'password';
	ui.mp.type = reveal ? 'text' : 'password';
	this.textContent = reveal ? 'hide' : 'show';
});

// A real <form>: the browser validates the `required` fields, and this
// fires for a click, the Enter key, and keyboard activation of the button.
ui.main.addEventListener('submit', function (e) {
	e.preventDefault();
	if (busy) return;
	if (isDone()) {
		copyPassword();
		return;
	}

	busy = true;
	const startKey = inputKey();
	ui.generate.disabled = true;
	ui.generate.setAttribute('aria-label', 'Generating');
	setLabel('');
	say('Generating\u2026', false, true);

	RpassDerive.derive(
		ui.mp.value,
		ui.service.value,
		ui.user.value,
		ui.iter.value,
		algorithm,
		function (derived) {
			busy = false;
			ui.generate.disabled = false;
			ui.generate.removeAttribute('aria-label');
			if (!document.activeElement || document.activeElement === document.body) {
				ui.generate.focus();
			}
			if (inputKey() !== startKey) {
				setLabel('Generate');
				say('Inputs changed while generating. Press Generate again.', true, true);
				return;
			}
			pw = derived;
			ui.generate.classList.add('done');
			setLabel('Copy to clipboard');
			say('Password ready. Press the button to copy it.', false, true);
		}
	);
});

function copyPassword() {
	clearTimeout(resetTimer);
	copyText(pw)
		.then(
			function () {
				setLabel('Copied!');
				say('Copied to clipboard.', false, true);
			},
			function () {
				setLabel('Copy failed');
				say('Could not write to the clipboard. Check this page\u2019s clipboard permission in your browser.', true, true);
			}
		)
		.then(function () {
			resetTimer = setTimeout(function () {
				if (isDone()) setLabel('Copy to clipboard');
			}, 2000);
		});
}

ui.mp.addEventListener('change', clearDone);
ui.mp.addEventListener('input', clearDone);

ui.service.addEventListener('input', clearDone);
ui.service.addEventListener('change', function () {
	this.value = RpassDerive.normalizeIdentifier(this.value);
	clearDone();
	maybeAutofillFromImport();
});

ui.user.addEventListener('input', clearDone);
ui.user.addEventListener('change', function () {
	this.value = RpassDerive.normalizeIdentifier(this.value);
	clearDone();
	maybeAutofillIter();
});

ui.iter.addEventListener('input', clearDone);
ui.iter.addEventListener('change', function () {
	this.value = RpassDerive.normalizeIter(this.value);
	clearDone();
});

// --- session hygiene ----------------------------------------------------
//
// Forget the master password (and any finished result) after a period of
// inactivity, and shortly after the tab has been hidden.  This limits what
// a walk-away or a shared screen can expose; it is not a defence against
// malware on the device.  Set a value to 0 to disable that rule.

const IDLE_MS = 5 * 60 * 1000;
const HIDDEN_MS = 60 * 1000;
let idleTimer = null;
let hiddenTimer = null;

function wipeSecrets(reason) {
	if (busy) {
		// Let a running derivation finish, then look again.
		setTimeout(function () { wipeSecrets(reason); }, 5000);
		return;
	}
	if (!ui.mp.value && pw === null) return;
	ui.mp.value = '';
	ui.mp.type = 'password';
	ui['toggle-mp'].textContent = 'show';
	clearDone();
	say(reason);
}

function armIdleTimer() {
	clearTimeout(idleTimer);
	if (IDLE_MS > 0) {
		idleTimer = setTimeout(function () {
			wipeSecrets('Master password cleared after ' + Math.round(IDLE_MS / 60000) + ' minutes of inactivity.');
		}, IDLE_MS);
	}
}

['keydown', 'pointerdown', 'input', 'focusin'].forEach(function (type) {
	document.addEventListener(type, armIdleTimer, { passive: true });
});
armIdleTimer();

document.addEventListener('visibilitychange', function () {
	clearTimeout(hiddenTimer);
	if (document.visibilityState === 'hidden' && HIDDEN_MS > 0) {
		hiddenTimer = setTimeout(function () {
			wipeSecrets('Master password cleared because this tab was in the background.');
		}, HIDDEN_MS);
	}
});

// --- import -------------------------------------------------------------

ui.import.addEventListener('click', function () {
	ui['import-file'].click();
});

ui['import-file'].addEventListener('change', async function (e) {
	const file = e.target.files && e.target.files[0];
	e.target.value = '';
	if (!file) return;

	let stored;
	try {
		const text = (await file.text()).replace(/^\uFEFF/, '');
		stored = JSON.parse(text);
	} catch (err) {
		say('Could not read the backup file: ' + (err && err.message), true);
		return;
	}

	if (
		!stored ||
		typeof stored !== 'object' ||
		(typeof stored._enc_ !== 'string' &&
			(typeof stored._hosts_ !== 'object' ||
				stored._hosts_ === null))
	) {
		say('This is not a valid rpass backup file.', true);
		return;
	}

	if (typeof stored._enc_ === 'string' && !ui.mp.value) {
		say('This backup is encrypted. Enter your master password above, then click Import backup again.', true);
		ui.mp.focus();
		return;
	}

	ui.import.disabled = true;
	say('Decrypting backup\u2026');
	let payload;
	try {
		payload = await RpassVault.load(stored, ui.mp.value);
	} catch (err) {
		if (err && err.message === 'wrong-password') {
			say('Wrong master password for this backup.', true);
			ui.mp.focus();
			ui.mp.select();
		} else {
			say('Could not read the backup: ' + (err && err.message ? err.message : err), true);
			console.error(err);
		}
		return;
	} finally {
		ui.import.disabled = false;
	}

	importedVault = payload;
	populateDatalists(payload);
	say('Backup imported. Service and username suggestions are now available in their fields.');
});

function populateDatalists(vault) {
	const servicesList = document.getElementById('services-list');
	const usersList = document.getElementById('users-list');
	servicesList.innerHTML = '';
	usersList.innerHTML = '';

	const services = Object.keys(vault.services || {}).sort();
	for (const s of services) {
		const opt = document.createElement('option');
		opt.value = s;
		servicesList.appendChild(opt);
	}

	const users = new Set();
	for (const s of services) {
		const record = vault.services[s] || {};
		for (const u of Object.keys(record)) users.add(u);
	}
	for (const u of Array.from(users).sort()) {
		const opt = document.createElement('option');
		opt.value = u;
		usersList.appendChild(opt);
	}
}

// Apply the algorithm the backup recorded for this service.  A wrong
// algorithm silently produces a different (wrong) password, so when the
// backup has no v1/v2 entry for the service, leave the toggle alone and say so.
function applyImportedAlgorithm(service) {
	const recorded = importedVault.algorithms && importedVault.algorithms[service];
	if (recorded === 'v1' || recorded === 'v2') {
		setAlgorithm(recorded);
		return;
	}
	say(
		'This backup records no v1/v2 algorithm for "' + service +
			'". Check the v1/v2 toggle (currently ' + algorithm + ').',
		false,
		true
	);
}

function maybeAutofillFromImport() {
	if (!importedVault) return;
	const service = ui.service.value;
	const record = importedVault.services[service];
	if (!record) return;
	applyImportedAlgorithm(service);
	const users = Object.keys(record);
	if (users.length === 0) return;
	if (!ui.user.value) ui.user.value = users[0];
	const iter = record[ui.user.value];
	if (iter !== undefined) ui.iter.value = String(iter);
}

function maybeAutofillIter() {
	if (!importedVault) return;
	const record = importedVault.services[ui.service.value];
	if (!record) return;
	applyImportedAlgorithm(ui.service.value);
	const iter = record[ui.user.value];
	if (iter !== undefined) ui.iter.value = String(iter);
}

// --- clipboard ----------------------------------------------------------
//
// navigator.clipboard.writeText needs a secure context and (in some
// browsers) transient user activation; fall back to execCommand('copy').
// Both paths return a promise that reflects whether the copy worked.

function copyText(str) {
	if (navigator.clipboard && navigator.clipboard.writeText) {
		return navigator.clipboard.writeText(str).catch(function () {
			return legacyCopy(str);
		});
	}
	return legacyCopy(str);
}

function legacyCopy(str) {
	/* https://github.com/30-seconds/30-seconds-of-code */
	return new Promise(function (resolve, reject) {
		const el = document.createElement('textarea');
		el.value = str;
		el.setAttribute('readonly', '');
		el.style.position = 'absolute';
		el.style.left = '-9999px';
		document.body.appendChild(el);
		const selected =
			document.getSelection().rangeCount > 0
				? document.getSelection().getRangeAt(0)
				: false;
		el.select();
		let ok = false;
		try {
			ok = document.execCommand('copy');
		} catch (err) {
			ok = false;
		}
		el.value = '';
		document.body.removeChild(el);
		if (selected) {
			document.getSelection().removeAllRanges();
			document.getSelection().addRange(selected);
		}
		if (ok) resolve();
		else reject(new Error('copy command failed'));
	});
}
