const CACHE_NAME = 'life-hub-shell-v154';
const SHARE_CACHE = 'life-hub-share-target-v1';
const SHARE_HANDOFF = 'share-handoff';
// Deployed under a GitHub Pages project subpath (e.g. /life-hub/), not domain root,
// so every shell path is resolved against this worker's own registration scope
// instead of being hardcoded to "/".
const SCOPE_PATH = new URL(self.registration.scope).pathname;
const SHELL_FILES = [
  '',
  'index.html',
  'packages/design-kit/js/hub-rich-paste.js',
  'packages/design-kit/js/hub-places-map.js',
  'packages/design-kit/hub-places-map.css',
  'js/app/capture-inbox.js',
  'capture-inbox.html',
  'css/app.css',
  'packages/design-kit/tokens.css',
  'packages/design-kit/overlays.css',
  'packages/design-kit/actions.css',
  'packages/design-kit/filters.css',
  'packages/design-kit/sign-in.css',
  'packages/design-kit/motion.css',
  'packages/design-kit/morphing-popover.css',
  'packages/design-kit/hub-compose.css',
  'packages/design-kit/adaptive-slider.css',
  'packages/design-kit/view-on-map.css',
  'packages/design-kit/card-swipe.css',
  'packages/design-kit/hub-interactions.css',
  'packages/design-kit/chat-prose.css',
  'packages/design-kit/rail.css',
  'packages/design-kit/mobile.css',
  'packages/design-kit/calendar.css',
  'packages/design-kit/js/time-grid.js',
  'js/app/main.js',
  'js/app/api-session.js',
  'js/app/app-controller.js',
  'js/app/agent-avatars.js',
  'js/app/agent-colour.js',
  'js/app/agent-protocols.js',
  'js/app/body-controller.js',
  'js/app/body-model.js',
  'js/app/bloods-model.js',
  'js/app/medical-model.js',
  'js/app/medical-controller.js',
  'packages/design-kit/js/hub-filter-menu.js',
  'packages/design-kit/js/hub-floating.js',
  'packages/design-kit/js/hub-focus-trap.js',
  'packages/design-kit/js/agent-choice-card.js',
  'packages/design-kit/js/agent-sources-card.js',
  'packages/design-kit/js/agent-plan-card.js',
  'packages/design-kit/js/vendor/floating-ui/dom.browser.mjs',
  'packages/design-kit/js/vendor/floating-ui/core.browser.mjs',
  'packages/design-kit/js/format-display-date.js',
  'packages/design-kit/js/hub-motion.js',
  'packages/design-kit/js/hub-kinetic.js',
  'packages/design-kit/js/morphing-popover.js',
  'packages/design-kit/js/hub-compose.js',
  'packages/design-kit/js/adaptive-slider.js',
  'packages/design-kit/js/morphing-dialog.js',
  'packages/design-kit/js/view-on-map.js',
  'packages/design-kit/js/card-swipe.js',
  'packages/design-kit/js/hub-feedback.js',
  'packages/design-kit/js/hub-ai-bar.js',
  'packages/design-kit/js/hub-inline-edit.js',
  'packages/design-kit/js/hub-create-disclosure.js',
  'packages/design-kit/js/hub-capture.js',
  'packages/design-kit/js/hub-command-search.js',
  'packages/design-kit/js/hub-entity-search.js',
  'packages/design-kit/js/vendor/minisearch.js',
  'packages/design-kit/js/hub-surfaces.js',
  'js/app/bloods-explainers.js',
  'js/app/bloods-charts.js',
  'js/app/bloods-charts-layout.js',
  'js/app/calendar-model.js',
  'js/app/calendar-write.js',
  'js/app/central-node-charts.js',
  'js/app/central-node-model.js',
  'js/app/chart-kit/animate.js',
  'js/app/chart-kit/apply-ring.js',
  'js/app/chart-kit/area-line.js',
  'js/app/chart-kit/columns.js',
  'js/app/chart-kit/heatmap.js',
  'js/app/chart-kit/pie.js',
  'js/app/chart-kit/ring.js',
  'js/app/chart-kit/stream.js',
  'js/app/chart-kit/sankey-flow.js',
  'js/app/chart-kit/bump.js',
  'js/app/chart-kit/chord-layout.js',
  'js/app/chart-kit/clinical-slots.js',
  'js/app/chart-kit/radial-year.js',
  'js/app/chart-kit/mood-radial.js',
  'js/app/chart-kit/energy-orbit.js',
  'js/app/chart-kit/polar-clock.js',
  'js/app/chart-kit/range-bar.js',
  'js/app/chart-kit/watchlist-heat.js',
  'js/app/chart-kit/mood-mix.js',
  'js/app/chart-kit/theme-orbit.js',
  'js/app/chart-kit/theme-constellation.js',
  'js/app/chart-kit/horizon.js',
  'js/app/chart-kit/d3-layout.js',
  'js/app/chart-kit/vendor/d3-shape.min.js',
  'js/app/chart-kit/vendor/d3-sankey.min.js',
  'js/app/chart-kit/vendor/d3-chord.min.js',
  'js/app/chart-kit/vendor/d3-force.min.js',
  'js/app/chat-api.js',
  'js/app/chat-chrome.js',
  'js/app/chat-composer.js',
  'js/app/chat-controller.js',
  'js/app/chat-panel.js',
  'js/app/chat-turn-anchor.js',
  'js/app/confirm-card-receipt.js',
  'js/app/visual-viewport.js',
  'js/app/config.js',
  'js/app/ephemeral-message.js',
  'js/app/fitness-model.js',
  'js/app/fitness-charts-model.js',
  'js/app/fitness-logger-draft.js',
  'js/app/fitness-logger-controller.js',
  'js/app/fitness-template-library.js',
  'js/app/fitness-templates-api.js',
  'js/app/format-exercise.js',
  'js/app/hammond-audit.js',
  'js/app/hammond-audit-session-storage.js',
  'js/app/home-model.js',
  'js/app/load-live-events.js',
  'js/app/mind-model.js',
  'js/app/muscle-maps.js',
  'js/app/nutrition-charts.js',
  'js/app/nutrition-model.js',
  'js/app/render-agent-picker.js',
  'js/app/render-protocol-pills.js',
  'js/app/render-body.js',
  'js/app/render-bloods.js',
  'js/app/render-medical.js',
  'js/app/render-calendar.js',
  'js/app/render-central-node.js',
  'js/app/render-chat.js',
  'js/app/render-fitness.js',
  'js/app/render-fitness-charts.js',
  'js/app/render-fitness-logger.js',
  'js/app/render-workout-plan.js',
  'js/app/render-governance.js',
  'js/app/render-home.js',
  'js/app/render-mind.js',
  'js/app/chart-kit/masonry.js',
  'js/app/mind-thread-sheet.js',
  'js/app/render-nutrition.js',
  'js/app/render-shortcuts.js',
  'js/app/render-skincare.js',
  'js/app/shortcuts-api.js',
  'js/app/skincare-api.js',
  'js/app/skincare-controller.js',
  'js/app/skincare-model.js',
  'js/app/skincare-product-library.js',
  'js/app/skincare-routine-membership.js',
  'js/app/skincare-routines-data.js',
  'js/app/repository-cache.js',
  'js/app/sync-repository.js',
  'js/app/template-to-planned.js',
  'js/core/aggregate.js',
  'js/core/chat-history.js',
  'js/core/chat-blocks.js',
  'js/core/chat-turn-limits.js',
  'js/core/constraints.js',
  'js/core/workout-plan-detect.js',
  'js/core/governance-log.js',
  'js/core/open-loops.js',
  'js/core/records.js',
  'js/core/search.js',
  'js/core/targets.js',
  'js/core/time.js',
  'js/core/trends.js',
  'js/core/validate.js',
  'js/core/nutrition-challenges.js',
  'vendor/js-yaml.mjs',
  'manifest.webmanifest',
  'assets/icons/life-hub-192.png',
  'assets/icons/life-hub-512.png',
  'assets/body/full-body-diagram.png',
  'assets/agents/brisket.jpg',
  'assets/agents/chadwick.jpg',
  'assets/agents/hyaluronica.jpg',
  'assets/agents/hammond.jpg',
  'assets/agents/penelope.jpg',
  'assets/agents/vera.jpg',
  'assets/agents/sara.jpg',
  'assets/agents/full/brisket.png',
  'assets/agents/full/chadwick.png',
  'assets/agents/full/hyaluronica.png',
  'assets/agents/full/hammond.png',
  'assets/agents/full/penelope.png',
  'assets/agents/full/vera.png',
  'assets/agents/full/sara.png',
  'assets/fitness/muscles/abs-full.png',
  'assets/fitness/muscles/abs-lower.png',
  'assets/fitness/muscles/abs-obliques.png',
  'assets/fitness/muscles/abs-upper.png',
  'assets/fitness/muscles/arm-bicep.png',
  'assets/fitness/muscles/arm-forearm.png',
  'assets/fitness/muscles/back-full.png',
  'assets/fitness/muscles/back-lower.png',
  'assets/fitness/muscles/back-triceps.png',
  'assets/fitness/muscles/back-upper.png',
  'assets/fitness/muscles/calves.png',
  'assets/fitness/muscles/chest-inner.png',
  'assets/fitness/muscles/chest-lower.png',
  'assets/fitness/muscles/chest-traps.png',
  'assets/fitness/muscles/chest-upper.png',
  'assets/fitness/muscles/chest-whole.png',
  'assets/fitness/muscles/glutes.png',
  'assets/fitness/muscles/shoulders.png',
  'assets/fitness/muscles/thighs-back.png',
  'assets/fitness/muscles/thighs-front.png',
  'assets/fitness/regions/abs.png',
  'assets/fitness/regions/arms.png',
  'assets/fitness/regions/back.png',
  'assets/fitness/regions/chest.png',
  'assets/fitness/regions/legs.png'
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

  // Web Share Target POST → stash payload → redirect to Capture Inbox (online path; not offline-first).
  if (request.method === 'POST' && url.pathname.endsWith('/capture-inbox.html')) {
    event.respondWith(handleShareTarget(request, url));
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

  // Images: stale-while-revalidate so muscle maps, nav icons, and avatars
  // paint from cache on load instead of waiting on the network (that wait
  // was the load-up flicker). JS/CSS stay network-first so a deploy that
  // does not touch this file still reaches returning users.
  if (isStaticImage(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  event.respondWith(networkFirst(request));
});

const IMAGE_PATH = /\.(?:png|jpe?g|gif|webp|svg|ico)$/i;

function isStaticImage(pathname) {
  return IMAGE_PATH.test(pathname);
}

function putInShellCache(request, response) {
  const copy = response.clone();
  caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
  return response;
}

function networkFirst(request) {
  return fetch(request)
    .then(response => putInShellCache(request, response))
    .catch(() => caches.match(request));
}

function staleWhileRevalidate(request) {
  return caches.match(request).then(cached => {
    const fetched = fetch(request)
      .then(response => putInShellCache(request, response))
      .catch(() => cached);
    return cached || fetched;
  });
}

async function handleShareTarget(request, url) {
  try {
    const form = await request.formData();
    const files = [];
    for (const value of form.getAll('media')) {
      if (!(value instanceof Blob) || !value.size) continue;
      const name = typeof value.name === 'string' && value.name ? value.name : 'shared-file';
      const buffer = await value.arrayBuffer();
      files.push({
        name,
        type: value.type || 'application/octet-stream',
        size: value.size,
        base64: arrayBufferToBase64(buffer)
      });
    }
    const handoff = {
      title: String(form.get('title') || '').trim(),
      text: String(form.get('text') || '').trim(),
      url: String(form.get('url') || '').trim(),
      files
    };
    const cache = await caches.open(SHARE_CACHE);
    await cache.put(SHARE_HANDOFF, new Response(JSON.stringify(handoff), {
      headers: { 'Content-Type': 'application/json' }
    }));
  } catch {
    // Still redirect — inbox will show empty/waiting state.
  }
  const redirect = new URL('capture-inbox.html', url);
  redirect.searchParams.set('share', '1');
  return Response.redirect(redirect.href, 303);
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
