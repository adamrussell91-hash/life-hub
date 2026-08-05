import { load } from '../../vendor/js-yaml.mjs';
import { agentColour } from './agent-colour.js';
import { createSessionApi } from './api-session.js';
import {
  createAppController,
  CENTRAL_NODE_AGENT_SLUG,
  FITNESS_AGENT_SLUG,
  NUTRITION_AGENT_SLUG,
  SKINCARE_AGENT_SLUG
} from './app-controller.js';
import { buildCentralNodeModel } from './central-node-model.js';
import { createChatApi } from './chat-api.js';
import { createChatController } from './chat-controller.js';
import { createChatPanelController } from './chat-panel.js';
import { API_BASE_URL } from './config.js';
import { createFitnessLoggerController } from './fitness-logger-controller.js';
import { buildFitnessModel } from './fitness-model.js';
import { buildHomeModel } from './home-model.js';
import { loadLiveEvents } from './load-live-events.js';
import { buildNutritionModel } from './nutrition-model.js';
import { renderCentralNode } from './render-central-node.js';
import { renderFitness } from './render-fitness.js';
import { renderHome, renderUnavailable, renderWarnings } from './render-home.js';
import { renderNutrition } from './render-nutrition.js';
import { createRepositoryCache } from './repository-cache.js';
import { createSkincareController } from './skincare-controller.js';
import { buildSkincareModel } from './skincare-model.js';
import { SKINCARE_ROUTINES, currentRoutineKey } from './skincare-routines-data.js';
import { renderSkincare } from './render-skincare.js';
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

const chatPanel = createChatPanelController({ root: document });
const chatApi = createChatApi(fetchImpl);

let controller;
const fitnessLogger = createFitnessLoggerController({
  root: document,
  chatApi,
  storage: localStorage,
  onSessionWritten: () => void controller.refresh({ manual: true })
});
const skincareController = createSkincareController({
  root: document,
  chatApi,
  onRecordWritten: () => void controller.refresh({ manual: true })
});

controller = createAppController({
  root: document,
  sessionApi,
  cache,
  loadLive,
  loadCached,
  buildHomeModel,
  renderHome,
  renderWarnings,
  renderUnavailable,
  buildNutritionModel,
  renderNutrition,
  buildFitnessModel,
  renderFitness,
  fitnessLogger,
  buildSkincareModel,
  renderSkincare,
  skincareController,
  skincareRoutines: SKINCARE_ROUTINES,
  getCurrentRoutineKey: currentRoutineKey,
  buildCentralNodeModel,
  renderCentralNode,
  agentColour,
  chatPanel,
  sessionStorage,
  localStorage
});

controller.start();

const DEFAULT_AGENT_BY_SECTION = {
  nutrition: NUTRITION_AGENT_SLUG,
  fitness: FITNESS_AGENT_SLUG,
  skincare: SKINCARE_AGENT_SLUG,
  'central-node': CENTRAL_NODE_AGENT_SLUG
};

createChatController({
  root: document,
  chatApi,
  onRecordWritten: () => void controller.refresh({ manual: true }),
  getDefaultAgentSlug: () => DEFAULT_AGENT_BY_SECTION[controller.getCurrentSection()],
  agentColour,
  getAgentsConfig: () => controller.getAgentsConfig?.() ?? null
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js').catch(() => undefined);
}
