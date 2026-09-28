/** Travel service worker (TR-54).
 *
 * Cache name is versioned. Bump SHELL_CACHE when install/fetch strategy changes
 * so returning clients drop stale HTML that still points at deleted Vite hashes
 * (that was the live /travel/ blank after #568: sw.js unchanged → cache-first
 * index.html → 404 on index-Dngzwec5.js → empty #app).
 *
 * HTML/navigation: network-first (immutable hashed assets may be cache-first).
 * Cross-origin API (api.adam-russell.com) is never intercepted.
 */
const SHELL_CACHE = 'travel-shell-v2';
const SHELL_URLS = ['/travel/', '/travel/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('travel-shell-') && key !== SHELL_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isHashedAsset(url) {
  return url.pathname.startsWith('/travel/assets/');
}

function isTravelDocument(url) {
  return (
    url.pathname === '/travel' ||
    url.pathname === '/travel/' ||
    url.pathname === '/travel/index.html' ||
    (url.pathname.startsWith('/travel/') && url.pathname.endsWith('.html'))
  );
}

function putInShellCache(request, response) {
  if (!response || !response.ok) return response;
  const copy = response.clone();
  caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
  return response;
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== 'GET') return;

  if (isHashedAsset(url)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => putInShellCache(event.request, response));
      })
    );
    return;
  }

  if (url.hostname === 'tiles.openfreemap.org' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ??
          fetch(event.request).then((response) => {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, copy)).catch(() => undefined);
            return response;
          })
      )
    );
    return;
  }

  if (!url.pathname.startsWith('/travel')) return;

  // Documents and other same-origin /travel paths: network-first so a Pages
  // deploy with new Vite hashes is visible without waiting for sw.js drift.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (isTravelDocument(url) || event.request.mode === 'navigate') {
          return putInShellCache(event.request, response);
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || Response.error()))
  );
});
