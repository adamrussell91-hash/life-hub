import { getSydneyDateKey } from '../core/time.js';

const SESSION_EXPIRY_KEY = 'life-hub:session-expiry';
const LAST_SUCCESS_KEY = 'life-hub:last-success';
const LOGOUT_PENDING_KEY = 'life-hub:logout-pending';
const REFRESH_INTERVAL_MS = 600_000;
const GENERIC_LOAD_ERROR = 'Life Hub could not load your data. Check your connection and try again.';
export const NUTRITION_AGENT_SLUG = 'brisket';
export const CENTRAL_NODE_AGENT_SLUG = 'hammond';
export const FITNESS_AGENT_SLUG = 'chadwick';

export function createAppController(dependencies) {
  const {
    root,
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
    buildCentralNodeModel,
    renderCentralNode,
    agentColour,
    chatPanel,
    windowTarget = window,
    documentTarget = document,
    navigatorTarget = navigator,
    sessionStorage,
    localStorage,
    now = () => new Date(),
    setIntervalImpl = setInterval,
    clearIntervalImpl = clearInterval,
    setTimeoutImpl = setTimeout,
    clearTimeoutImpl = clearTimeout
  } = dependencies ?? {};

  if (!root || !sessionApi || !cache || typeof loadLive !== 'function' ||
      typeof loadCached !== 'function' || typeof buildHomeModel !== 'function' ||
      typeof renderHome !== 'function') {
    throw new TypeError('Application controller dependencies are unavailable');
  }

  let authenticated = false;
  let rendered = false;
  let latestResult = null;
  let currentSection = 'home';
  let activeRefresh = null;
  let refreshAbortController = null;
  let lifecycleVersion = 0;
  let intervalId = null;
  let expiryTimeoutId = null;
  let pendingLogoutPromise = null;
  let pendingLogoutCleanupPromise = null;
  let destroyed = false;
  const listeners = [];

  bind(root.querySelector('#sign-in-form'), 'submit', event => {
    event.preventDefault?.();
    void signIn(root.querySelector('#passphrase-input')?.value ?? '');
  });
  bind(root.querySelector('#refresh-button'), 'click', () => void refresh({ manual: true }));
  bind(root.querySelector('#retry-button'), 'click', () => void refresh({ manual: true }));
  bind(root.querySelector('#sign-out-button'), 'click', () => void signOut());
  for (const button of root.querySelectorAll?.('[data-section]') ?? []) {
    const target = button.dataset.section;
    if (target === 'home' || target === 'chat' || target === 'nutrition' || target === 'fitness' || target === 'central-node') continue;
    bind(button, 'click', () => {
      setStatus('This section arrives in a later Life Hub phase.');
      showProvider('This section arrives in a later Life Hub phase.', 'info');
    });
  }
  for (const button of root.querySelectorAll?.('[data-section="chat"]') ?? []) {
    bind(button, 'click', () => showSection('chat'));
  }
  for (const button of root.querySelectorAll?.('[data-section="home"]') ?? []) {
    bind(button, 'click', () => showSection('home'));
  }
  for (const button of root.querySelectorAll?.('[data-section="nutrition"]') ?? []) {
    bind(button, 'click', () => showSection('nutrition'));
  }
  for (const button of root.querySelectorAll?.('[data-section="fitness"]') ?? []) {
    bind(button, 'click', () => showSection('fitness'));
  }
  for (const button of root.querySelectorAll?.('[data-section="central-node"]') ?? []) {
    bind(button, 'click', () => showSection('central-node'));
  }
  bind(root.querySelector('#nutrition-chat-button'), 'click', () => {
    if (!chatPanel) return;
    if (chatPanel.isOpen()) {
      chatPanel.close();
      return;
    }
    const slot = root.querySelector('#nutrition-dashboard');
    if (slot) chatPanel.open(slot, agentColour?.(latestResult?.agentsConfig, NUTRITION_AGENT_SLUG));
  });
  bind(root.querySelector('#fitness-chat-button'), 'click', () => {
    if (!chatPanel) return;
    if (chatPanel.isOpen()) {
      chatPanel.close();
      return;
    }
    const slot = root.querySelector('#fitness-dashboard');
    if (slot) chatPanel.open(slot, agentColour?.(latestResult?.agentsConfig, FITNESS_AGENT_SLUG));
  });
  bind(root.querySelector('#central-node-chat-button'), 'click', () => {
    if (!chatPanel) return;
    if (chatPanel.isOpen()) {
      chatPanel.close();
      return;
    }
    const slot = root.querySelector('#central-node-dashboard');
    if (slot) chatPanel.open(slot, agentColour?.(latestResult?.agentsConfig, CENTRAL_NODE_AGENT_SLUG));
  });
  bind(windowTarget, 'online', () => void handleOnline());
  bind(windowTarget, 'offline', () => handleOffline());
  bind(documentTarget, 'visibilitychange', () => void handleVisibilityChange());

  async function start() {
    if (destroyed) return;
    const version = ++lifecycleVersion;
    setAppState('loading');
    restoreLastSuccess();

    if (hasPendingLogout() || pendingLogoutCleanupPromise) {
      const settled = await settleLogoutBarrier();
      if (!isCurrentLifecycle(version)) return;
      if (!settled) {
        showSignedOut();
        return;
      }
    }

    try {
      const session = await sessionApi.getSession();
      if (!isCurrentLifecycle(version)) return;
      if (!session?.authenticated || !validFutureExpiry(session.expiresAt)) {
        invalidateSession();
        return;
      }
      acceptExpiry(session.expiresAt);
      authenticated = true;
      showAuthenticated();
      await refresh();
      if (isCurrentLifecycle(version) && authenticated) scheduleRefresh();
    } catch (error) {
      if (!isCurrentLifecycle(version)) return;
      if (canUseOfflineCache(error)) {
        await showOfflineCache(version);
        return;
      }
      invalidateSession();
    }
  }

  async function signIn(passphrase) {
    if (destroyed) return;
    const version = ++lifecycleVersion;
    abortActiveRefresh(new DOMException('New sign-in lifecycle', 'AbortError'));
    setSignInBusy(true);
    clearSignInError();
    try {
      if ((hasPendingLogout() || pendingLogoutCleanupPromise) && !await settleLogoutBarrier()) {
        if (!isCurrentLifecycle(version)) return;
        throw Object.assign(new Error('Logout pending'), { code: 'logout_pending' });
      }
      if (!isCurrentLifecycle(version)) return;
      const session = await sessionApi.signIn(passphrase);
      if (!isCurrentLifecycle(version)) return;
      if (!session?.authenticated || !validFutureExpiry(session.expiresAt)) {
        clearPassphrase();
        invalidateSession();
        return;
      }
      acceptExpiry(session.expiresAt);
      authenticated = true;
      clearPassphrase();
      showAuthenticated();
      await refresh();
      if (isCurrentLifecycle(version) && authenticated) scheduleRefresh();
    } catch (error) {
      if (!isCurrentLifecycle(version)) return;
      authenticated = false;
      clearSessionExpiry();
      setSignInBusy(false);
      clearPassphrase();
      showSignedOut(error?.status === 401
        ? 'That passphrase was not accepted.'
        : 'Sign-in is unavailable right now. Please try again.');
    } finally {
      if (isCurrentLifecycle(version)) {
        clearPassphrase();
        setSignInBusy(false);
      }
    }
  }

  function refresh(options = {}) {
    if (destroyed) return Promise.resolve();
    if (activeRefresh) return activeRefresh;
    if (!requireUnexpiredSession()) return Promise.resolve();
    if (!navigatorTarget.onLine && rendered) {
      updateNetworkState();
      return Promise.resolve();
    }

    const manual = options.manual === true;
    const button = root.querySelector('#refresh-button');
    if (button) button.disabled = true;
    if (manual) setStatus('Refreshing your Life Hub…');
    setAppState(rendered ? 'refreshing' : 'loading');

    const version = lifecycleVersion;
    const abortController = new AbortController();
    refreshAbortController = abortController;
    const refreshPromise = performRefresh({ signal: abortController.signal, version, manual })
      .finally(() => {
        if (activeRefresh !== refreshPromise) return;
        if (button) button.disabled = !navigatorTarget.onLine;
        if (refreshAbortController === abortController) refreshAbortController = null;
        activeRefresh = null;
      });
    activeRefresh = refreshPromise;
    return refreshPromise;
  }

  async function performRefresh({ signal, version, manual = false }) {
    try {
      const date = getSydneyDateKey(currentDate());
      const result = await loadLive({ date, signal });
      if (!isCurrentRefresh(version, signal) || !requireUnexpiredSession()) return;
      latestResult = { ...result, date };
      if (!rendered || result.changed === true) {
        const model = buildHomeModel({ ...result, date });
        renderHome(root, model);
        if (currentSection === 'nutrition') renderNutritionSection();
        if (currentSection === 'fitness') renderFitnessSection();
        if (currentSection === 'central-node') renderCentralNodeSection();
      }
      renderWarnings?.(root, result.warnings.filter(warning => warning.path));
      rendered = true;
      if (result.freshness === 'confirmed') {
        recordSuccess();
        if (manual) {
          setStatus(result.changed === true ? 'Synced — updates applied.' : 'Synced — already up to date.');
        }
      } else {
        restoreLastSuccess();
        if (manual) setStatus('Showing your last saved view.');
      }

      if (result.freshness === 'fallback') {
        setAppState('stale');
      } else {
        hideProvider();
        setAppState('ready');
      }
    } catch (error) {
      if (!isCurrentRefresh(version, signal)) return;
      if (isSessionExpired(error)) {
        invalidateSession('Your session expired. Please sign in again.');
        return;
      }
      if (rendered) {
        setAppState(navigatorTarget.onLine ? 'stale' : 'offline');
        if (manual) setStatus('Refresh failed — showing your last saved view.');
        return;
      }
      renderUnavailable?.(root, GENERIC_LOAD_ERROR);
    }
  }

  async function showOfflineCache(version) {
    try {
      if (!requireUnexpiredSession()) return;
      const date = getSydneyDateKey(currentDate());
      const result = await loadCached({ date });
      if (!isCurrentLifecycle(version) || !requireUnexpiredSession()) return;
      latestResult = { ...result, date };
      const model = buildHomeModel({ ...result, date });
      renderHome(root, model);
      renderWarnings?.(root, result.warnings.filter(warning => warning.path));
      authenticated = true;
      rendered = true;
      showAuthenticated();
      showProvider('Offline. Showing your private saved view until this session expires.', 'warning');
      setAppState('offline');
      updateNetworkState();
      scheduleRefresh();
    } catch {
      showSignedOut();
    }
  }

  async function signOut() {
    const refreshToSettle = activeRefresh;
    lifecycleVersion += 1;
    authenticated = false;
    clearRefreshTimer();
    clearSessionExpiry();
    rendered = false;
    clearPassphrase();
    showSignedOut();
    abortActiveRefresh(new DOMException('Signed out', 'AbortError'));
    localStorage.setItem(LOGOUT_PENDING_KEY, '1');
    void settlePendingLogout();
    await beginLogoutCleanup(refreshToSettle);
  }

  function destroy() {
    destroyed = true;
    lifecycleVersion += 1;
    clearRefreshTimer();
    clearSessionExpiryTimer();
    abortActiveRefresh(new DOMException('Application destroyed', 'AbortError'));
    for (const [target, type, listener] of listeners.splice(0)) {
      target.removeEventListener(type, listener);
    }
  }

  function bind(target, type, listener) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, listener);
    listeners.push([target, type, listener]);
  }

  function scheduleRefresh() {
    if (intervalId !== null || destroyed) return;
    intervalId = setIntervalImpl(() => {
      if (authenticated && !requireUnexpiredSession()) return;
      if (documentTarget.visibilityState === 'visible' && authenticated && navigatorTarget.onLine) {
        void refresh();
      }
    }, REFRESH_INTERVAL_MS);
  }

  function clearRefreshTimer() {
    if (intervalId === null) return;
    clearIntervalImpl(intervalId);
    intervalId = null;
  }

  function showAuthenticated() {
    const signInView = root.querySelector('#sign-in-view');
    const shell = root.querySelector('#app-shell');
    if (signInView) signInView.hidden = true;
    if (shell) shell.hidden = false;
    showSection('home');
  }

  const SECTION_TITLES = {
    home: { eyebrow: 'Your day at a glance', title: 'Home' },
    chat: { eyebrow: 'Life Hub', title: 'Chat' },
    nutrition: { eyebrow: 'Nutrition', title: 'Nutrition' },
    fitness: { eyebrow: 'Fitness', title: 'Fitness' },
    'central-node': { eyebrow: 'Central Node', title: 'Central Node' }
  };

  function showSection(name) {
    const home = root.querySelector('#home-dashboard');
    const chat = root.querySelector('#chat-view');
    const nutrition = root.querySelector('#nutrition-dashboard');
    const fitness = root.querySelector('#fitness-dashboard');
    const centralNode = root.querySelector('#central-node-dashboard');
    if (home) home.hidden = name !== 'home';
    if (nutrition) nutrition.hidden = name !== 'nutrition';
    if (fitness) fitness.hidden = name !== 'fitness';
    if (centralNode) centralNode.hidden = name !== 'central-node';
    // #chat-view's own `hidden` attribute is owned by chatPanel while the panel is
    // open as an overlay elsewhere (its hosting section's hidden-cascade controls
    // visibility instead) -- only manage it here when the panel isn't currently open,
    // to avoid fighting chatPanel's own state.
    if (name === 'chat') {
      if (chatPanel?.isOpen()) chatPanel.close();
      if (chat) chat.hidden = false;
    } else if (chat && !chatPanel?.isOpen()) {
      chat.hidden = true;
    }
    currentSection = name;
    if (name === 'nutrition') renderNutritionSection();
    if (name === 'fitness') renderFitnessSection();
    if (name === 'central-node') renderCentralNodeSection();
    for (const button of root.querySelectorAll?.('[data-section]') ?? []) {
      const active = button.dataset.section === name;
      button.classList.toggle('is-active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    const titles = SECTION_TITLES[name];
    if (titles) {
      const eyebrow = root.querySelector('#page-eyebrow');
      const title = root.querySelector('#page-title');
      if (eyebrow) eyebrow.textContent = titles.eyebrow;
      if (title) title.textContent = titles.title;
    }
  }

  function renderNutritionSection() {
    if (!latestResult || !buildNutritionModel || !renderNutrition) return;
    renderNutrition(root, buildNutritionModel(latestResult));
    const button = root.querySelector('#nutrition-chat-button');
    button?.style?.setProperty('--agent-accent', agentColour?.(latestResult.agentsConfig, NUTRITION_AGENT_SLUG));
  }

  function renderFitnessSection() {
    if (!latestResult || !buildFitnessModel || !renderFitness) return;
    renderFitness(root, buildFitnessModel(latestResult), { logger: fitnessLogger });
    const button = root.querySelector('#fitness-chat-button');
    button?.style?.setProperty('--agent-accent', agentColour?.(latestResult.agentsConfig, FITNESS_AGENT_SLUG));
  }

  function renderCentralNodeSection() {
    if (!latestResult || !buildCentralNodeModel || !renderCentralNode) return;
    renderCentralNode(root, buildCentralNodeModel(latestResult));
    const button = root.querySelector('#central-node-chat-button');
    button?.style?.setProperty('--agent-accent', agentColour?.(latestResult.agentsConfig, CENTRAL_NODE_AGENT_SLUG));
  }

  function showSignedOut(message = '') {
    authenticated = false;
    clearRefreshTimer();
    clearSessionExpiryTimer();
    setSignInBusy(false);
    const signInView = root.querySelector('#sign-in-view');
    const shell = root.querySelector('#app-shell');
    if (signInView) signInView.hidden = false;
    if (shell) shell.hidden = true;
    setAppState('signed-out');
    if (message) showSignInError(message);
    else clearSignInError();
    root.querySelector('#passphrase-input')?.focus();
  }

  function showSignInError(message) {
    const error = root.querySelector('#sign-in-error');
    if (!error) return;
    error.textContent = message;
    error.hidden = false;
  }

  function clearSignInError() {
    const error = root.querySelector('#sign-in-error');
    if (!error) return;
    error.textContent = '';
    error.hidden = true;
  }

  function clearPassphrase() {
    const input = root.querySelector('#passphrase-input');
    if (!input) return;
    input.value = '';
    if (!authenticated) input.focus();
  }

  function setSignInBusy(busy) {
    const input = root.querySelector('#passphrase-input');
    const button = root.querySelector('#sign-in-button');
    if (input) input.disabled = busy;
    if (button) {
      button.disabled = busy;
      button.textContent = busy ? 'Signing in…' : 'Sign in';
    }
  }

  function setAppState(state) {
    const app = root.querySelector('#app');
    if (app) app.dataset.state = state;
  }

  function setStatus(message) {
    const status = root.querySelector('#app-status');
    if (status) status.textContent = message;
  }

  function showProvider(message, severity) {
    const status = root.querySelector('#provider-status');
    if (!status) return;
    status.textContent = message;
    status.dataset.severity = severity;
    status.hidden = false;
  }

  function hideProvider() {
    const status = root.querySelector('#provider-status');
    if (!status) return;
    status.textContent = '';
    status.hidden = true;
    delete status.dataset.severity;
  }

  function recordSuccess() {
    const instant = currentDate();
    localStorage.setItem(LAST_SUCCESS_KEY, instant.toISOString());
    renderLastSuccess(instant);
  }

  function restoreLastSuccess() {
    const timestamp = localStorage.getItem(LAST_SUCCESS_KEY);
    const instant = new Date(timestamp ?? '');
    if (Number.isFinite(instant.getTime())) renderLastSuccess(instant);
  }

  function renderLastSuccess(instant) {
    const element = root.querySelector('#last-synced');
    if (element) element.textContent = `Last synced ${new Intl.DateTimeFormat('en-AU', {
      hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: 'Australia/Sydney'
    }).format(instant)}`;
  }

  function updateNetworkState() {
    const offline = !navigatorTarget.onLine;
    const chip = root.querySelector('#network-status');
    const button = root.querySelector('#refresh-button');
    const rail = root.querySelector('#rail-sync-status');
    if (chip) chip.hidden = !offline;
    if (button) button.disabled = offline;
    if (rail) {
      rail.textContent = offline ? 'Private · offline cache' : 'Private · live sync';
    }
    if (offline && rendered) setAppState('offline');
  }

  function acceptExpiry(expiry) {
    sessionStorage.setItem(SESSION_EXPIRY_KEY, expiry);
    scheduleSessionExpiry(expiry);
  }

  function clearSessionExpiry() {
    sessionStorage.removeItem(SESSION_EXPIRY_KEY);
    clearSessionExpiryTimer();
  }

  function scheduleSessionExpiry(expiry) {
    clearSessionExpiryTimer();
    const delay = Date.parse(expiry) - currentDate().getTime();
    if (!Number.isFinite(delay) || delay <= 0) {
      invalidateSession('Your session expired. Please sign in again.');
      return;
    }
    expiryTimeoutId = setTimeoutImpl(() => {
      expiryTimeoutId = null;
      if (!validFutureExpiry(sessionStorage.getItem(SESSION_EXPIRY_KEY))) {
        invalidateSession('Your session expired. Please sign in again.');
      } else {
        scheduleSessionExpiry(sessionStorage.getItem(SESSION_EXPIRY_KEY));
      }
    }, delay);
  }

  function clearSessionExpiryTimer() {
    if (expiryTimeoutId === null) return;
    clearTimeoutImpl(expiryTimeoutId);
    expiryTimeoutId = null;
  }

  function validFutureExpiry(expiry) {
    const timestamp = Date.parse(expiry);
    return Number.isFinite(timestamp) && timestamp > currentDate().getTime();
  }

  function canUseOfflineCache(error) {
    if (navigatorTarget.onLine || !isNetworkFailure(error)) return false;
    const expiry = sessionStorage.getItem(SESSION_EXPIRY_KEY);
    if (validFutureExpiry(expiry)) {
      scheduleSessionExpiry(expiry);
      return true;
    }
    invalidateSession();
    return false;
  }

  function requireUnexpiredSession() {
    const expiry = sessionStorage.getItem(SESSION_EXPIRY_KEY);
    if (validFutureExpiry(expiry)) return true;
    invalidateSession('Your session expired. Please sign in again.');
    return false;
  }

  function invalidateSession(message = '') {
    lifecycleVersion += 1;
    authenticated = false;
    rendered = false;
    clearRefreshTimer();
    clearSessionExpiry();
    abortActiveRefresh(new DOMException('Session invalidated', 'AbortError'));
    showSignedOut(message);
  }

  function abortActiveRefresh(reason) {
    const controller = refreshAbortController;
    activeRefresh = null;
    refreshAbortController = null;
    controller?.abort(reason);
  }

  function hasPendingLogout() {
    return localStorage.getItem(LOGOUT_PENDING_KEY) === '1';
  }

  function settlePendingLogout() {
    if (!hasPendingLogout()) return Promise.resolve(true);
    if (pendingLogoutPromise) return pendingLogoutPromise;

    pendingLogoutPromise = Promise.resolve()
      .then(() => sessionApi.signOut())
      .then(() => {
        localStorage.removeItem(LOGOUT_PENDING_KEY);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        pendingLogoutPromise = null;
      });
    return pendingLogoutPromise;
  }

  function beginLogoutCleanup(refreshToSettle) {
    const priorCleanup = pendingLogoutCleanupPromise;
    const cleanupPromise = (async () => {
      if (priorCleanup) await priorCleanup;
      await cache.clear();
      if (refreshToSettle) {
        await refreshToSettle.catch(() => undefined);
        await cache.clear();
      }
    })();
    const trackedPromise = cleanupPromise.finally(() => {
      if (pendingLogoutCleanupPromise === trackedPromise) pendingLogoutCleanupPromise = null;
    });
    pendingLogoutCleanupPromise = trackedPromise;
    return trackedPromise;
  }

  async function settleLogoutBarrier() {
    while (pendingLogoutCleanupPromise) {
      await pendingLogoutCleanupPromise;
    }
    return hasPendingLogout() ? settlePendingLogout() : true;
  }

  async function handleOnline() {
    updateNetworkState();
    if (hasPendingLogout() || pendingLogoutCleanupPromise) {
      await settleLogoutBarrier();
      return;
    }
    if (authenticated) requireUnexpiredSession();
  }

  function handleOffline() {
    if (authenticated) requireUnexpiredSession();
    updateNetworkState();
  }

  async function handleVisibilityChange() {
    if (!authenticated || documentTarget.visibilityState !== 'visible') return;
    if (!requireUnexpiredSession()) return;
    await refresh();
  }

  function currentDate() {
    const value = now();
    return value instanceof Date ? new Date(value) : new Date(value);
  }

  function isCurrentRefresh(version, signal) {
    return version === lifecycleVersion && !signal.aborted;
  }

  function isCurrentLifecycle(version) {
    return version === lifecycleVersion && !destroyed;
  }

  return {
    start,
    refresh,
    signIn,
    signOut,
    destroy,
    getCurrentSection: () => currentSection,
    getAgentsConfig: () => latestResult?.agentsConfig ?? null
  };
}

function isSessionExpired(error) {
  return error?.status === 401 || error?.code === 'session_expired' || error?.code === 'unauthenticated';
}

function isNetworkFailure(error) {
  return error?.code === 'network_error' || (error instanceof TypeError && error?.status == null);
}
