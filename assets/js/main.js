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

const cr = `¬© ${new Date().getFullYear()} Rhade`;
const ui = document.getElementsByTagName('*');

let pw;
let algorithm = 'v1';
let importedVault = null;

window.addEventListener('load', function (e) {
	ui.copyright.setAttribute('cont', cr);
	document.getElementsByTagName('footer')[0].hidden = false;
});

ui.algorithm.addEventListener('click', function (e) {
	algorithm = algorithm === 'v1' ? 'v2' : 'v1';
	this.textContent = algorithm;
	this.classList.toggle('v2', algorithm === 'v2');
	if (ui.generate.className) ui.generate.className = '';
});

ui.generate.addEventListener('mousedown', function (e) {
	if (this.className === 'done') {
		copyToClipboard(pw);
	} else if (
		ui.mp.reportValidity() &&
		ui.service.reportValidity() &&
		ui.user.reportValidity() &&
		ui.iter.reportValidity()
	) {
		ui.generate.disabled = true;
		RpassDerive.derive(
			ui.mp.value,
			ui.service.value,
			ui.user.value,
			ui.iter.value,
			algorithm,
			function (derived) {
				pw = derived;
				ui.generate.disabled = false;
				ui.generate.className = 'done';
			}
		);
	}
});

function clearDone() {
	if (ui.generate.className) ui.generate.className = '';
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
		alert('Could not read the backup file: ' + (err && err.message));
		return;
	}

	if (
		!stored ||
		typeof stored !== 'object' ||
		(typeof stored._enc_ !== 'string' &&
			(typeof stored._hosts_ !== 'object' ||
				stored._hosts_ === null))
	) {
		alert('This is not a valid rpass backup file.');
		return;
	}

	if (typeof stored._enc_ === 'string' && !ui.mp.value) {
		alert('Enter your master password above, then click Import again.');
		return;
	}

	let payload;
	try {
		payload = await RpassVault.load(stored, ui.mp.value);
	} catch (err) {
		if (err && err.message === 'wrong-password') {
			alert('Wrong master password for this backup.');
		} else {
			alert(
				'Could not read the backup: ' +
					(err && err.message ? err.message : err)
			);
			console.error(err);
		}
		return;
	}

	importedVault = payload;
	populateDatalists(payload);
	alert(
		'Backup imported. Service and username suggestions are now ' +
			'available in their fields.'
	);
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

function maybeAutofillFromImport() {
	if (!importedVault) return;
	const service = ui.service.value;
	const record = importedVault.services[service];
	if (!record) return;
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
	const iter = record[ui.user.value];
	if (iter !== undefined) ui.iter.value = String(iter);
}

// --- clipboard ----------------------------------------------------------

function copyToClipboard(str) {
	/* https://github.com/30-seconds/30-seconds-of-code */
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
	document.execCommand('copy');
	document.body.removeChild(el);
	if (selected) {
		document.getSelection().removeAllRanges();
		document.getSelection().addRange(selected);
	}
}
