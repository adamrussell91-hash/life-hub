const CACHE_NAME = 'life-hub-shell-v1';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/css/app.css',
  '/js/app/main.js',
  '/js/app/load-events.js',
  '/js/app/home-model.js',
  '/js/app/render-home.js',
  '/js/core/aggregate.js',
  '/js/core/records.js',
  '/js/core/targets.js',
  '/js/core/time.js',
  '/js/core/validate.js',
  '/vendor/js-yaml.mjs',
  '/config/targets.yml',
  '/fixtures/manifest.json',
  '/manifest.webmanifest',
  '/assets/icons/life-hub-192.png',
  '/assets/icons/life-hub-512.png',
  '/tests/fixtures/valid/data/nutrition/2026/07/2026-07-30-breakfast.md',
  '/tests/fixtures/valid/data/nutrition/2026/07/2026-07-30-lunch.md',
  '/tests/fixtures/valid/data/fitness/2026/07/2026-07-30-chest-curls.md',
  '/tests/fixtures/valid/data/mind/2026/07/2026-07-30-diary.md'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      const update = fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      });
      return cached ?? update;
    })
  );
});
