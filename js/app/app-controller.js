import { getSydneyDateKey } from '../core/time.js';

const SESSION_EXPIRY_KEY = 'life-hub:session-expiry';
const LAST_SUCCESS_KEY = 'life-hub:last-success';
const REFRESH_INTERVAL_MS = 120_000;
const GENERIC_LOAD_ERROR = 'Life Hub could not load your data. Check your connection and try again.';

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
    fetchImpl,
    windowTarget = window,
    documentTarget = document,
    navigatorTarget = navigator,
    sessionStorage,
    localStorage,
    now = () => new Date(),
    setIntervalImpl = setInterval,
    clearIntervalImpl = clearInterval
  } = dependencies ?? {};

  if (!root || !sessionApi || !cache || typeof loadLive !== 'function' ||
      typeof loadCached !== 'function' || typeof buildHomeModel !== 'function' ||
      typeof renderHome !== 'function' || typeof fetchImpl !== 'function') {
    throw new TypeError('Application controller dependencies are unavailable');
  }

  let authenticated = false;
  let rendered = false;
  let activeRefresh = null;
  let intervalId = null;
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
    if (button.dataset.section === 'home') continue;
    bind(button, 'click', () => setStatus('This section arrives in a later Life Hub phase.'));
  }
  bind(windowTarget, 'online', updateNetworkState);
  bind(windowTarget, 'offline', updateNetworkState);
  bind(documentTarget, 'visibilitychange', () => {
    if (documentTarget.visibilityState === 'visible' && authenticated) void refresh();
  });

  async function start() {
    if (destroyed) return;
    setAppState('loading');
    try {
      const session = await sessionApi.getSession();
      if (!session?.authenticated || !validFutureExpiry(session.expiresAt)) {
        showSignedOut();
        return;
      }
      rememberExpiry(session.expiresAt);
      authenticated = true;
      showAuthenticated();
      await refresh();
      if (authenticated) scheduleRefresh();
    } catch (error) {
      if (canUseOfflineCache(error)) {
        await showOfflineCache();
        return;
      }
      showSignedOut();
    }
  }

  async function signIn(passphrase) {
    if (destroyed) return;
    setSignInBusy(true);
    clearSignInError();
    try {
      const session = await sessionApi.signIn(passphrase);
      if (!session?.authenticated || !validFutureExpiry(session.expiresAt)) throw new Error('Invalid session');
      rememberExpiry(session.expiresAt);
      authenticated = true;
      clearPassphrase();
      showAuthenticated();
      await refresh();
      if (authenticated) scheduleRefresh();
    } catch (error) {
      authenticated = false;
      forgetExpiry();
      clearPassphrase();
      showSignedOut(error?.status === 401
        ? 'That passphrase was not accepted.'
        : 'Sign-in is unavailable right now. Please try again.');
    } finally {
      setSignInBusy(false);
    }
  }

  function refresh(options = {}) {
    if (destroyed) return Promise.resolve();
    if (activeRefresh) return activeRefresh;
    if (!navigatorTarget.onLine && rendered) {
      updateNetworkState();
      return Promise.resolve();
    }

    const manual = options.manual === true;
    const button = root.querySelector('#refresh-button');
    if (button) button.disabled = true;
    if (manual) setStatus('Refreshing your Life Hub…');
    setAppState(rendered ? 'refreshing' : 'loading');

    activeRefresh = performRefresh()
      .finally(() => {
        if (button) button.disabled = !navigatorTarget.onLine;
        activeRefresh = null;
      });
    return activeRefresh;
  }

  async function performRefresh() {
    try {
      const date = getSydneyDateKey(currentDate());
      const result = await loadLive({ date });
      const model = buildHomeModel({ ...result, date });
      renderHome(root, model);
      renderWarnings?.(root, result.warnings.filter(warning => warning.path));
      rendered = true;
      recordSuccess();

      const stale = result.warnings.some(warning => warning.code === 'github_unavailable');
      if (stale) {
        showProvider('GitHub is unavailable. Showing your last saved view.', 'warning');
        setAppState('stale');
      } else {
        hideProvider();
        setAppState('ready');
      }
      await checkHealth();
      if (authenticated && !stale && root.querySelector('#provider-status')?.hidden !== false) {
        setAppState('ready');
      }
    } catch (error) {
      if (isSessionExpired(error)) {
        forgetExpiry();
        showSignedOut('Your session expired. Please sign in again.');
        return;
      }
      if (rendered) {
        showProvider('GitHub is unavailable. Showing your last saved view.', 'warning');
        setAppState(navigatorTarget.onLine ? 'stale' : 'offline');
        return;
      }
      renderUnavailable?.(root, GENERIC_LOAD_ERROR);
    }
  }

  async function checkHealth() {
    let response;
    try {
      response = await fetchImpl('/api/health');
    } catch {
      return;
    }
    if (response.status === 401) {
      forgetExpiry();
      showSignedOut('Your session expired. Please sign in again.');
      return;
    }
    if (!response.ok) return;

    let health;
    try {
      health = (await response.json()).data;
    } catch {
      return;
    }
    if (health.github !== 'healthy') {
      showProvider('GitHub is unavailable. Your saved view remains available.', 'warning');
    } else if (health.token === 'expiring' || health.token === 'expired') {
      const date = formatCalendarDate(health.expiresOn);
      showProvider(`GitHub access ${health.token === 'expired' ? 'expired' : 'expires'} ${date}.`, 'critical');
    }
  }

  async function showOfflineCache() {
    try {
      const date = getSydneyDateKey(currentDate());
      const result = await loadCached({ date });
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
    authenticated = false;
    clearRefreshTimer();
    forgetExpiry();
    try {
      await sessionApi.signOut();
    } catch {
      // Local privacy cleanup must not depend on the network response.
    }
    try {
      await cache.clear();
    } finally {
      rendered = false;
      showSignedOut();
    }
  }

  function destroy() {
    destroyed = true;
    clearRefreshTimer();
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
      if (authenticated && !validFutureExpiry(sessionStorage.getItem(SESSION_EXPIRY_KEY))) {
        forgetExpiry();
        showSignedOut('Your session expired. Please sign in again.');
      } else if (documentTarget.visibilityState === 'visible' && authenticated && navigatorTarget.onLine) {
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
  }

  function showSignedOut(message = '') {
    authenticated = false;
    clearRefreshTimer();
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
    const element = root.querySelector('#last-synced');
    if (element) element.textContent = `Last synced ${new Intl.DateTimeFormat('en-AU', {
      hour: 'numeric', minute: '2-digit', timeZone: 'Australia/Sydney'
    }).format(instant)}`;
  }

  function updateNetworkState() {
    const offline = !navigatorTarget.onLine;
    const chip = root.querySelector('#network-status');
    const button = root.querySelector('#refresh-button');
    if (chip) chip.hidden = !offline;
    if (button) button.disabled = offline;
    if (offline && rendered) setAppState('offline');
  }

  function rememberExpiry(expiry) {
    sessionStorage.setItem(SESSION_EXPIRY_KEY, expiry);
  }

  function forgetExpiry() {
    sessionStorage.removeItem(SESSION_EXPIRY_KEY);
  }

  function validFutureExpiry(expiry) {
    const timestamp = Date.parse(expiry);
    return Number.isFinite(timestamp) && timestamp > currentDate().getTime();
  }

  function canUseOfflineCache(error) {
    if (navigatorTarget.onLine || isSessionExpired(error)) return false;
    const expiry = sessionStorage.getItem(SESSION_EXPIRY_KEY);
    if (validFutureExpiry(expiry)) return true;
    forgetExpiry();
    return false;
  }

  function currentDate() {
    const value = now();
    return value instanceof Date ? new Date(value) : new Date(value);
  }

  return { start, refresh, signIn, signOut, destroy };
}

function isSessionExpired(error) {
  return error?.status === 401 || error?.code === 'session_expired' || error?.code === 'unauthenticated';
}

function formatCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return 'soon';
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Sydney'
  }).format(new Date(`${value}T12:00:00+10:00`));
}
