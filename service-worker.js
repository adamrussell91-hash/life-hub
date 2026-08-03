const CACHE_NAME = 'life-hub-shell-v10';
// Deployed under a GitHub Pages project subpath (e.g. /life-hub/), not domain root,
// so every shell path is resolved against this worker's own registration scope
// instead of being hardcoded to "/".
const SCOPE_PATH = new URL(self.registration.scope).pathname;
const SHELL_FILES = [
  '',
  'index.html',
  'css/app.css',
  'js/app/main.js',
  'js/app/api-session.js',
  'js/app/app-controller.js',
  'js/app/chat-api.js',
  'js/app/chat-controller.js',
  'js/app/render-chat.js',
  'js/app/config.js',
  'js/app/home-model.js',
  'js/app/load-live-events.js',
  'js/app/render-home.js',
  'js/app/repository-cache.js',
  'js/app/sync-repository.js',
  'js/core/aggregate.js',
  'js/core/records.js',
  'js/core/targets.js',
  'js/core/time.js',
  'js/core/validate.js',
  'vendor/js-yaml.mjs',
  'manifest.webmanifest',
  'assets/icons/life-hub-192.png',
  'assets/icons/life-hub-512.png'
];
const PRECACHE_URLS = SHELL_FILES.map(file => SCOPE_PATH + file);
const SHELL_PATHS = new Set(PRECACHE_URLS);
const INDEX_PATH = SCOPE_PATH + 'index.html';

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
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith('life-hub-shell-') && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(INDEX_PATH))
    );
    return;
  }

  if (!SHELL_PATHS.has(url.pathname)) return;

  event.respondWith(
    caches.match(request).then(cached => cached ?? fetch(request))
  );
});
