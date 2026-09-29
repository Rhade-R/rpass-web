'use strict';

/*
 * Frame-busting.
 *
 * The page must not be embeddable in an iframe on a foreign origin:
 * an attacker could frame rpass-web on a phishing page and rely on the
 * user not noticing they are typing their master password into the
 * wrong context. CSP's frame-ancestors directive would be cleaner, but
 * it is ignored when delivered via <meta>.
 *
 * If the parent cannot be navigated (cross-origin iframe), the
 * document is wiped. That is deliberate: it is better to show nothing
 * than to render a password field that might be read by the framer.
 */

if (window.top !== window.self) {
	try {
		window.top.location = window.self.location;
	} catch (e) {
		document.documentElement.innerHTML = '';
	}
}
