import { load } from '/vendor/js-yaml.mjs';
import { loadEventManifest } from './load-events.js';
import { buildHomeModel, selectDisplayDate } from './home-model.js';
import { renderHome, renderUnavailable, renderWarnings } from './render-home.js';

const LAST_SUCCESS_KEY = 'life-hub:last-success';

function updateNetworkStatus(root = document) {
  const chip = root.querySelector('#network-status');
  if (!chip) return;
  chip.hidden = navigator.onLine;
  if (!navigator.onLine) {
    const savedAt = localStorage.getItem(LAST_SUCCESS_KEY);
    chip.querySelector('span:last-child').textContent = savedAt
      ? `Offline · saved ${new Intl.DateTimeFormat('en-AU', { hour: 'numeric', minute: '2-digit' }).format(new Date(savedAt))}`
      : 'Offline · saved view';
  }
}

export async function startApp({ root = document, fetchImpl = fetch } = {}) {
  root.querySelector('#app')?.setAttribute('data-state', 'loading');
  try {
    const [source, targetsResponse] = await Promise.all([
      loadEventManifest({ fetchImpl, loadYaml: load }),
      fetchImpl('/config/targets.yml')
    ]);
    if (!targetsResponse.ok) throw new Error('Targets are unavailable');

    const date = selectDisplayDate(source.events);
    const model = buildHomeModel({
      events: source.events,
      targetsConfig: load(await targetsResponse.text()),
      date
    });
    renderHome(root, model);
    renderWarnings(root, source.warnings);
    localStorage.setItem(LAST_SUCCESS_KEY, new Date().toISOString());
    updateNetworkStatus(root);
  } catch {
    renderUnavailable(
      root,
      'Life Hub could not load its saved data. Check your connection and try again.'
    );
  }
}

function bindInterface(root = document) {
  root.querySelector('#retry-button')?.addEventListener('click', () => startApp({ root }));

  root.querySelectorAll('[data-section]').forEach(button => {
    if (button.dataset.section === 'home') return;
    button.addEventListener('click', () => {
      const status = root.querySelector('#app-status');
      if (status) status.textContent = 'This section arrives in a later Life Hub phase.';
    });
  });

  window.addEventListener('online', () => updateNetworkStatus(root));
  window.addEventListener('offline', () => updateNetworkStatus(root));
}

bindInterface();
startApp();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').catch(() => undefined);
}
