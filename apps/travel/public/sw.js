/** Travel service worker (TR-54). ponytail: minimal precache + two runtime
 * strategies. Tile pre-saving for "Save this city for offline" (TR-56/57)
 * is a separate cache (`travel-tiles-v1`) added by the day map, not here. */
const SHELL_CACHE = 'travel-shell-v1';
const SHELL_URLS = ['/travel/', '/travel/index.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)).catch(() => undefined)
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

function isTripApi(url) {
  return url.pathname.startsWith('/api/travel-trip');
}

function isCacheFirstAsset(url) {
  return url.hostname === 'tiles.openfreemap.org' || url.hostname === 'fonts.gstatic.com';
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (isTripApi(url)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  if (isCacheFirstAsset(url)) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached ?? fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      }))
    );
    return;
  }

  if (url.pathname.startsWith('/travel/')) {
    event.respondWith(caches.match(event.request).then((cached) => cached ?? fetch(event.request)));
  }
});
