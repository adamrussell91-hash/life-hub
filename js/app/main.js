import { load } from '../../vendor/js-yaml.mjs';
import { createSessionApi } from './api-session.js';
import { createAppController } from './app-controller.js';
import { API_BASE_URL } from './config.js';
import { buildHomeModel } from './home-model.js';
import { loadLiveEvents } from './load-live-events.js';
import { renderHome, renderUnavailable, renderWarnings } from './render-home.js';
import { createRepositoryCache } from './repository-cache.js';
import { syncRepository } from './sync-repository.js';

// The API lives on a different origin (Netlify Functions) from the site (GitHub
// Pages), so every /api/* call needs the full URL and must send the session cookie
// cross-site explicitly -- browsers never do that by default.
const fetchImpl = (input, init = {}) => {
  const path = typeof input === 'string' ? input : input.url;
  if (!path.startsWith('/api/')) return fetch(input, init);
  return fetch(`${API_BASE_URL}${path}`, { ...init, credentials: 'include' });
};
const cache = createRepositoryCache(caches);
const sessionApi = createSessionApi(fetchImpl);

const loadLive = ({ date, signal }) => loadLiveEvents({
  date,
  loadYaml: load,
  sync: options => syncRepository({ ...options, fetchImpl, cache, signal })
});

const loadCached = async ({ date }) => {
  return loadLiveEvents({
    date,
    loadYaml: load,
    sync: async ({ from, to }) => {
      const snapshot = await cache.read({ from, to });
      if (!snapshot) throw new Error('Private cache is unavailable');
      return {
        files: snapshot.files,
        warnings: snapshot.warnings ?? [],
        commitSha: snapshot.manifest.commitSha,
        manifestId: snapshot.manifest.manifestId,
        changed: false,
        freshness: 'fallback'
      };
    }
  });
};

const controller = createAppController({
  root: document,
  sessionApi,
  cache,
  loadLive,
  loadCached,
  buildHomeModel,
  renderHome,
  renderWarnings,
  renderUnavailable,
  fetchImpl,
  sessionStorage,
  localStorage
});

controller.start();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js').catch(() => undefined);
}
