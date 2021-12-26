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

const cr = `© ${new Date().getFullYear()} Rhade`;
const ui = document.getElementsByTagName('*');
const options = {
	N: 32768,
	r: 8,
	p: 1,
	dkLen: 50,
	interruptStep: 1000,
	encoding: undefined
};
let pw;

window.addEventListener('load', function(e) {
	ui.copyright.setAttribute('cont', cr);
	document.getElementsByTagName('footer')[0].hidden = false;
});

ui.generate.addEventListener('mousedown', function(e) {
	if (this.className === 'done') {
		copyToClipboard(pw);
	} else if (
		ui.mp.reportValidity() &&
		ui.service.reportValidity() &&
		ui.user.reportValidity() &&
		ui.iter.reportValidity()
	) {
		ui.generate.disabled = true;
		const salt = `${ui.iter.value}${ui.service.value}${ui.user.value}`;
		scrypt(ui.mp.value, salt, options, derivedKey => {
			for(const i in derivedKey) {
				derivedKey[i] = String.fromCharCode( derivedKey[i] % 95 + 32 );
			}
			pw = derivedKey.join('');
			ui.generate.disabled = false;
			ui.generate.className = 'done';
		});
	}
});
const inputListener = function(e) {
	if(ui.generate.className) ui.generate.className = '';
};
const changeListener = function(e) {
	this.value = this.value.replace(/^\s+|\s+$/g, '');
	if(ui.generate.className) ui.generate.className = '';
};
const iterChangeListener = function(e){
	this.value = this.value.replace(/\D|^0+(?=\d)/g,'');
	if(ui.generate.className) ui.generate.className = '';
};
const mpChangeListener = function(e){if(ui.generate.className) ui.generate.className = '';};
ui.mp.addEventListener('change', mpChangeListener);
ui.mp.addEventListener('input', mpChangeListener);
ui.service.addEventListener('change', changeListener);
ui.service.addEventListener('input', inputListener);
ui.user.addEventListener('change', changeListener);
ui.user.addEventListener('input', inputListener);
ui.iter.addEventListener('change', iterChangeListener);
ui.iter.addEventListener('input', iterChangeListener);

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
