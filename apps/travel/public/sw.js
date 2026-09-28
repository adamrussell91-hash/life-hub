/** Travel service worker (TR-54).
 *
 * Cache name is versioned. Bump SHELL_CACHE when install/fetch strategy changes
 * so returning clients drop stale HTML that still points at deleted Vite hashes
 * (that was the live /travel/ blank after #568: sw.js unchanged → cache-first
 * index.html → 404 on index-Dngzwec5.js → empty #app).
 *
 * HTML/navigation: network-first (immutable hashed assets may be cache-first).
 * Cross-origin API / tiles / fonts are never intercepted.
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
    (async () => {
      const keys = await caches.keys();
      const stale = keys.filter((key) => key.startsWith('travel-shell-') && key !== SHELL_CACHE);
      await Promise.all(stale.map((key) => caches.delete(key)));
      await self.clients.claim();
      // First install (no older shell cache): the open tab already loaded
      // current HTML from the network — reloading it only doubled load time.
      if (stale.length === 0) return;
      // Upgrade from an older shell: stuck blank tabs never run page JS (old
      // HTML → 404 hashed bundle), so they cannot listen for controllerchange.
      // Force a navigate so the network-first handler loads current index.html.
      const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      await Promise.all(
        windowClients
          .filter((client) => {
            try {
              const path = new URL(client.url).pathname;
              return path === '/travel' || path.startsWith('/travel/');
            } catch {
              return false;
            }
          })
          .map((client) => client.navigate(client.url))
      );
    })()
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
