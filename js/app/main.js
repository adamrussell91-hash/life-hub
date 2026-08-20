import { load } from '../../vendor/js-yaml.mjs';
import { agentColour } from './agent-colour.js';
import { createSessionApi } from './api-session.js';
import {
  createAppController,
  BODY_AGENT_SLUG,
  CENTRAL_NODE_AGENT_SLUG,
  FITNESS_AGENT_SLUG,
  NUTRITION_AGENT_SLUG,
  PENELOPE_AGENT_SLUG,
  SKINCARE_AGENT_SLUG
} from './app-controller.js';
import { createBodyController } from './body-controller.js';
import { buildBodyModel } from './body-model.js';
import { buildBloodsModel } from './bloods-model.js';
import { createMedicalController } from './medical-controller.js';
import { buildCentralNodeModel } from './central-node-model.js';
import { createChatApi } from './chat-api.js';
import { createChatController } from './chat-controller.js';
import { createChatPanelController } from './chat-panel.js';
import { API_BASE_URL } from './config.js';
import { createFitnessLoggerController } from './fitness-logger-controller.js';
import { createFitnessTemplateLibrary } from './fitness-template-library.js';
import { createFitnessTemplatesApi } from './fitness-templates-api.js';
import { buildFitnessModel } from './fitness-model.js';
import { buildHomeModel } from './home-model.js';
import { loadLiveEvents } from './load-live-events.js';
import { buildMindModel } from './mind-model.js';
import { buildNutritionModel } from './nutrition-model.js';
import { renderBody } from './render-body.js';
import { renderBloods, renderBloodsSnapshot } from './render-bloods.js';
import { renderMedical } from './render-medical.js';
import { renderCentralNode } from './render-central-node.js';
import { renderGovernance } from './render-governance.js';
import { setChatUnread } from './render-chat.js';
import { renderFitness } from './render-fitness.js';
import { renderHome, renderUnavailable, renderWarnings } from './render-home.js';
import { renderMind } from './render-mind.js';
import { renderNutrition } from './render-nutrition.js';
import { createRepositoryCache } from './repository-cache.js';
import { createSkincareApi } from './skincare-api.js';
import { createSkincareController } from './skincare-controller.js';
import { buildSkincareModel } from './skincare-model.js';
import { SKINCARE_ROUTINES, currentRoutineKey } from './skincare-routines-data.js';
import { renderSkincare } from './render-skincare.js';
import { buildCalendarModel } from './calendar-model.js';
import { renderCalendar } from './render-calendar.js';
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

const loadLive = ({ date, signal, onPartial }) => loadLiveEvents({
  date,
  loadYaml: load,
  onPartial,
  sync: options => syncRepository({ ...options, fetchImpl, cache, signal })
});

const loadCached = async ({ date }) => loadLiveEvents({
  date,
  loadYaml: load,
  backfill: false,
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

const chatPanel = createChatPanelController({ root: document });
const chatApi = createChatApi(fetchImpl);
const skincareApi = createSkincareApi(fetchImpl);

let controller;
let chatController;
const fitnessLogger = createFitnessLoggerController({
  root: document,
  chatApi,
  storage: localStorage,
  onSessionWritten: () => void controller.refresh({ manual: true })
});
const fitnessTemplatesApi = createFitnessTemplatesApi(fetchImpl);
const fitnessTemplateLibrary = createFitnessTemplateLibrary({
  root: document,
  templatesApi: fitnessTemplatesApi,
  chatApi,
  getFitnessContext: () => controller?.getFitnessLibraryContext?.() ?? {},
  onPlanned: () => void controller.refresh({ manual: true, force: true })
});
const skincareController = createSkincareController({
  root: document,
  chatApi,
  skincareApi,
  onRecordWritten: () => void controller.refresh({ manual: true, force: true }),
  onShelfChanged: patch => controller?.applySkincareShelf?.(patch)
});
const bodyController = createBodyController({
  root: document,
  chatApi,
  getDate: () => controller.getDisplayDate?.() ?? null,
  onRecordWritten: () => void controller.refresh({ manual: true, force: true })
});
const medicalController = createMedicalController({
  chatApi,
  getDate: () => controller.getDisplayDate?.() ?? null,
  onRecordWritten: () => void controller.refresh({ manual: true, force: true })
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
  fitnessTemplateLibrary,
  buildSkincareModel,
  renderSkincare,
  skincareApi,
  skincareController,
  skincareRoutines: SKINCARE_ROUTINES,
  getCurrentRoutineKey: currentRoutineKey,
  buildCalendarModel,
  renderCalendar,
  buildBodyModel,
  renderBody,
  bodyController,
  buildBloodsModel,
  renderBloods,
  renderBloodsSnapshot,
  renderMedical,
  medicalController,
  buildMindModel,
  renderMind,
  chatSelectAgent: slug => chatController?.selectAgent?.(slug),
  chatSyncAccent: () => chatController?.syncAccent?.(),
  chatStartCentralNodeAudit: () => chatController?.startCentralNodeAudit?.(),
  chatFlushVeraSession: () => chatController?.flushVeraSession?.(),
  buildCentralNodeModel,
  renderCentralNode,
  renderGovernance,
  agentColour,
  chatPanel,
  chatClearUnread: () => chatController?.clearUnread?.(),
  sessionStorage,
  localStorage
});

controller.start();

const DEFAULT_AGENT_BY_SECTION = {
  nutrition: NUTRITION_AGENT_SLUG,
  fitness: FITNESS_AGENT_SLUG,
  skincare: SKINCARE_AGENT_SLUG,
  body: BODY_AGENT_SLUG,
  mind: PENELOPE_AGENT_SLUG,
  'central-node': CENTRAL_NODE_AGENT_SLUG
};

chatController = createChatController({
  root: document,
  chatApi,
  onRecordWritten: () => void controller.refresh({ manual: true, force: true }),
  getDefaultAgentSlug: () => DEFAULT_AGENT_BY_SECTION[controller.getCurrentSection()],
  agentColour,
  getAgentsConfig: () => controller.getAgentsConfig?.() ?? null,
  isChatVisible: () => chatPanel.isOpen() || controller.getCurrentSection?.() === 'chat',
  onUnreadChange: unread => setChatUnread(document, unread)
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js').catch(() => undefined);
}
