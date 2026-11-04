/**
 * Recover from a hub page whose main bundle no longer exists.
 *
 * GitHub Pages lets browsers keep HTML for ten minutes, and every deploy
 * replaces the hashed assets. For up to ten minutes after a deploy, a browser
 * can therefore load old HTML that points at a deleted bundle, which leaves an
 * empty page. packages/stale-chunk-reload.js cannot help because it ships
 * inside that bundle, so this guard has to sit inline in the HTML.
 *
 * It refetches the page past the HTTP cache, then reloads. While a deploy is
 * still rolling out it retries a little later, then shows a plain message.
 */
import { createHash } from 'node:crypto';

export const STALE_ENTRY_GUARD = `(function () {
  var KEY = 'life-hub:stale-entry-reload';
  var MAX_TRIES = 3;
  var WINDOW_MS = 120000;
  var handled = false;

  function giveUp() {
    var box = document.createElement('div');
    box.setAttribute('role', 'alert');
    box.style.cssText = 'max-width:32rem;margin:20vh auto;padding:0 1.5rem;font:16px/1.5 system-ui,sans-serif;text-align:center';
    var text = document.createElement('p');
    text.textContent = 'A new version is still arriving. Try again in a minute.';
    var button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Reload';
    button.style.cssText = 'font:inherit;padding:.5rem 1.25rem;cursor:pointer';
    button.addEventListener('click', function () {
      try { sessionStorage.removeItem(KEY); } catch (err) {}
      location.reload();
    });
    box.appendChild(text);
    box.appendChild(button);
    document.body.appendChild(box);
  }

  window.addEventListener('error', function (event) {
    var el = event.target;
    if (handled || !el || (el.tagName !== 'SCRIPT' && el.tagName !== 'LINK')) return;
    // Once the page has loaded, stale-chunk-reload owns failed lazy chunks.
    if (document.readyState === 'complete') return;
    var url = el.src || el.href || '';
    if (url.indexOf(location.origin + '/') !== 0) return;
    if (!/\\/assets\\/[^/?#]+\\.(?:js|css)(?:[?#]|$)/.test(url)) return;
    handled = true;

    var tries = 0;
    var now = Date.now();
    try {
      var saved = JSON.parse(sessionStorage.getItem(KEY) || '{}');
      if (now - (saved.at || 0) < WINDOW_MS) tries = saved.tries || 0;
      if (tries < MAX_TRIES) {
        sessionStorage.setItem(KEY, JSON.stringify({ at: now, tries: tries + 1 }));
      }
    } catch (err) {
      // Without storage a retry could loop forever.
      tries = MAX_TRIES;
    }

    if (tries >= MAX_TRIES) {
      if (document.body) giveUp();
      else document.addEventListener('DOMContentLoaded', giveUp);
      return;
    }

    setTimeout(function () {
      function reload() { location.reload(); }
      fetch(location.href, { cache: 'reload', credentials: 'same-origin' }).then(reload, reload);
    }, tries * 3000);
  }, true);
})();`;

/** Hash the browser checks against a hash-based script-src. */
export function staleEntryGuardHash() {
  return `'sha256-${createHash('sha256').update(STALE_ENTRY_GUARD).digest('base64')}'`;
}

/**
 * Put the guard ahead of every asset tag and let the page's CSP run it. A hash
 * is only added where the CSP lists hashes: alongside 'unsafe-inline' a hash
 * would switch 'unsafe-inline' off and block the page's other inline scripts.
 */
export function injectStaleEntryGuard(html) {
  const headOpen = html.match(/<head[^>]*>/i);
  if (!headOpen) throw new Error('stale-entry-guard: no <head> in built HTML');
  if (html.includes(STALE_ENTRY_GUARD)) return html;

  const at = headOpen.index + headOpen[0].length;
  const withGuard = `${html.slice(0, at)}\n    <script>${STALE_ENTRY_GUARD}</script>${html.slice(at)}`;

  return withGuard.replace(/script-src ([^;"]*)/, (directive, sources) => {
    if (sources.includes("'unsafe-inline'") || !sources.includes("'sha256-")) return directive;
    return `script-src ${sources} ${staleEntryGuardHash()}`;
  });
}
