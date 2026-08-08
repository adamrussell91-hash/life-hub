import { getSydneyDateKey } from '../core/time.js';
import { shiftYearMonth } from './calendar-model.js';
import { clearEphemeralMessage, showEphemeralMessage } from './ephemeral-message.js';

const SESSION_EXPIRY_KEY = 'life-hub:session-expiry';
const LAST_SUCCESS_KEY = 'life-hub:last-success';
const LOGOUT_PENDING_KEY = 'life-hub:logout-pending';
const REFRESH_INTERVAL_MS = 600_000;
const GENERIC_LOAD_ERROR = 'Life Hub could not load your data. Check your connection and try again.';
export const NUTRITION_AGENT_SLUG = 'brisket';
export const CENTRAL_NODE_AGENT_SLUG = 'hammond';
export const FITNESS_AGENT_SLUG = 'chadwick';
export const SKINCARE_AGENT_SLUG = 'hyaluronica';
export const BODY_AGENT_SLUG = 'sara';
export const PENELOPE_AGENT_SLUG = 'penelope';
export const VERA_AGENT_SLUG = 'vera';

const MORE_SECTIONS = new Set([
  'nutrition',
  'fitness',
  'body',
  'mind',
  'skincare',
  'central-node'
]);

function clampDateToYearMonth(date, yearMonth) {
  if (!date || date.slice(0, 7) === yearMonth) return date;
  const day = Number(date.slice(8, 10));
  const [year, month] = yearMonth.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const clamped = Math.min(Number.isFinite(day) ? day : 1, lastDay);
  return `${yearMonth}-${String(clamped).padStart(2, '0')}`;
}

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
    fitnessTemplateLibrary,
    buildSkincareModel,
    renderSkincare,
    skincareApi,
    skincareController,
    skincareRoutines,
    getCurrentRoutineKey,
    buildCalendarModel,
    renderCalendar,
    buildBodyModel,
    renderBody,
    bodyController,
    buildMindModel,
    renderMind,
    chatSelectAgent,
    buildCentralNodeModel,
    renderCentralNode,
    agentColour,
    chatPanel,
    chatClearUnread,
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
  let calendarSelectedDate = null;
  let calendarViewMonth = null;
  let bodyRange = 'monthly';
  let mindRange = 'monthly';
  let latestCatalog = null;
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
    if (target === 'home' || target === 'chat' || target === 'nutrition' || target === 'fitness' || target === 'skincare' || target === 'calendar' || target === 'body' || target === 'mind' || target === 'central-node' || target === 'more') continue;
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
  for (const button of root.querySelectorAll?.('[data-section="skincare"]') ?? []) {
    bind(button, 'click', () => showSection('skincare'));
  }
  for (const button of root.querySelectorAll?.('[data-section="calendar"]') ?? []) {
    bind(button, 'click', () => showSection('calendar'));
  }
  for (const button of root.querySelectorAll?.('[data-section="body"]') ?? []) {
    bind(button, 'click', () => showSection('body'));
  }
  for (const button of root.querySelectorAll?.('[data-section="mind"]') ?? []) {
    bind(button, 'click', () => showSection('mind'));
  }
  for (const button of root.querySelectorAll?.('[data-section="central-node"]') ?? []) {
    bind(button, 'click', () => showSection('central-node'));
  }
  bind(root.querySelector('#more-nav-button'), 'click', () => openMoreSheet());
  bind(root.querySelector('#more-sheet-close'), 'click', () => closeMoreSheet());
  bind(root.querySelector('#more-sheet'), 'click', event => {
    if (event.target === event.currentTarget) closeMoreSheet();
  });
  bind(root.querySelector('#nutrition-chat-button'), 'click', () => {
    toggleSectionChat('#nutrition-dashboard', NUTRITION_AGENT_SLUG);
  });
  bind(root.querySelector('#fitness-chat-button'), 'click', () => {
    toggleSectionChat('#fitness-dashboard', FITNESS_AGENT_SLUG);
  });
  bind(root.querySelector('#skincare-chat-button'), 'click', () => {
    toggleSectionChat('#skincare-dashboard', SKINCARE_AGENT_SLUG);
  });
  bind(root.querySelector('#body-chat-button'), 'click', () => {
    toggleSectionChat('#body-dashboard', BODY_AGENT_SLUG);
  });
  bind(root.querySelector('#central-node-chat-button'), 'click', () => {
    toggleSectionChat('#central-node-dashboard', CENTRAL_NODE_AGENT_SLUG);
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
    const force = options.force === true;
    if (activeRefresh && !force) return activeRefresh;
    if (force && activeRefresh) {
      abortActiveRefresh(new DOMException('Superseded by post-write refresh', 'AbortError'));
    }
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
    const refreshPromise = performRefresh({ signal: abortController.signal, version, manual, force })
      .finally(() => {
        if (activeRefresh !== refreshPromise) return;
        if (button) button.disabled = !navigatorTarget.onLine;
        if (refreshAbortController === abortController) refreshAbortController = null;
        activeRefresh = null;
      });
    activeRefresh = refreshPromise;
    return refreshPromise;
  }

  async function performRefresh({ signal, version, manual = false, force = false }) {
    try {
      const date = getSydneyDateKey(currentDate());
      const result = await loadLive({ date, signal });
      if (!isCurrentRefresh(version, signal) || !requireUnexpiredSession()) return;
      latestResult = { ...result, date };
      if (!rendered || result.changed === true || force === true) {
        const model = buildHomeModel({ ...result, date });
        renderHome(root, model);
        if (currentSection === 'nutrition') renderNutritionSection();
        if (currentSection === 'fitness') renderFitnessSection();
        if (currentSection === 'skincare') renderSkincareSection();
        if (currentSection === 'calendar') renderCalendarSection();
        if (currentSection === 'body') renderBodySection();
        if (currentSection === 'mind') renderMindSection();
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
    skincare: { eyebrow: 'Skincare', title: 'Skincare' },
    calendar: { eyebrow: 'Calendar', title: 'Calendar' },
    body: { eyebrow: 'Body', title: 'Body' },
    mind: { eyebrow: 'Mind', title: 'Mind' },
    'central-node': { eyebrow: 'Central Node', title: 'Central Node' }
  };

  function closeMoreSheet() {
    const sheet = root.querySelector('#more-sheet');
    if (sheet?.open) sheet.close();
  }

  function openMoreSheet() {
    const sheet = root.querySelector('#more-sheet');
    if (!sheet || typeof sheet.showModal !== 'function') return;
    if (sheet.open) {
      sheet.close();
      return;
    }
    sheet.showModal();
  }

  function toggleSectionChat(slotSelector, agentSlug) {
    if (!chatPanel) return;
    if (chatPanel.isOpen()) {
      chatPanel.close();
      return;
    }
    chatSelectAgent?.(agentSlug);
    const slot = root.querySelector(slotSelector);
    if (slot) {
      chatPanel.open(slot, agentColour?.(latestResult?.agentsConfig, agentSlug));
      chatClearUnread?.();
    }
  }

  function showSection(name) {
    closeMoreSheet();
    // Overlay chat lives inside a section host — leave it cleanly on any nav change
    // so the next FAB open isn't stuck in a half-closed toggle state.
    if (chatPanel?.isOpen()) chatPanel.close();

    const home = root.querySelector('#home-dashboard');
    const chat = root.querySelector('#chat-view');
    const nutrition = root.querySelector('#nutrition-dashboard');
    const fitness = root.querySelector('#fitness-dashboard');
    const skincare = root.querySelector('#skincare-dashboard');
    const calendar = root.querySelector('#calendar-dashboard');
    const body = root.querySelector('#body-dashboard');
    const mind = root.querySelector('#mind-dashboard');
    const centralNode = root.querySelector('#central-node-dashboard');
    if (home) home.hidden = name !== 'home';
    if (nutrition) nutrition.hidden = name !== 'nutrition';
    if (fitness) fitness.hidden = name !== 'fitness';
    if (skincare) skincare.hidden = name !== 'skincare';
    if (calendar) calendar.hidden = name !== 'calendar';
    if (body) body.hidden = name !== 'body';
    if (mind) mind.hidden = name !== 'mind';
    if (centralNode) centralNode.hidden = name !== 'central-node';
    if (name === 'chat') {
      if (chat) chat.hidden = false;
      chatClearUnread?.();
    } else if (chat) {
      chat.hidden = true;
    }
    currentSection = name;
    if (name === 'nutrition') renderNutritionSection();
    if (name === 'fitness') renderFitnessSection();
    if (name === 'skincare') {
      renderSkincareSection();
      void refreshSkincareCatalog();
    }
    if (name === 'calendar') renderCalendarSection();
    if (name === 'body') renderBodySection();
    if (name === 'mind') renderMindSection();
    if (name === 'central-node') renderCentralNodeSection();
    for (const button of root.querySelectorAll?.('[data-section]') ?? []) {
      const section = button.dataset.section;
      const active = section === name
        || (section === 'more' && MORE_SECTIONS.has(name));
      button.classList.toggle('is-active', active);
      if (active && section !== 'more') button.setAttribute('aria-current', 'page');
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
    const libraryByName = fitnessTemplateLibrary?.getState?.()?.libraryByName ?? null;
    const model = buildFitnessModel({ ...latestResult, libraryByName });
    const templates = fitnessTemplateLibrary?.getState?.() ?? { status: 'idle', templates: [] };
    renderFitness(root, model, {
      logger: fitnessLogger,
      templates,
      libraryByName,
      onSelectTemplate: template => fitnessTemplateLibrary?.openTemplate?.(template)
    });
    const button = root.querySelector('#fitness-chat-button');
    button?.style?.setProperty('--agent-accent', agentColour?.(latestResult.agentsConfig, FITNESS_AGENT_SLUG));
    void fitnessTemplateLibrary?.ensureLoaded?.().then(() => {
      if (currentSection !== 'fitness' || !latestResult) return;
      const nextLibrary = fitnessTemplateLibrary.getState()?.libraryByName ?? null;
      const nextModel = buildFitnessModel({ ...latestResult, libraryByName: nextLibrary });
      renderFitness(root, nextModel, {
        logger: fitnessLogger,
        templates: fitnessTemplateLibrary.getState(),
        libraryByName: nextLibrary,
        onSelectTemplate: template => fitnessTemplateLibrary.openTemplate(template)
      });
    });
  }

  function fitnessLibraryContext() {
    const date = latestResult?.date;
    const events = latestResult?.events ?? [];
    const todays = events.filter(({ record }) => record?.type === 'workout' && record.date === date);
    return {
      date,
      completedToday: todays.some(({ record }) => record.status === 'completed'),
      plannedToday: todays.find(({ record }) => record.status === 'planned')?.record ?? null
    };
  }

  function renderSkincareSection() {
    if (!latestResult || !buildSkincareModel || !renderSkincare || !skincareRoutines) return;
    const model = buildSkincareModel({
      ...latestResult,
      routines: skincareRoutines,
      catalog: latestCatalog,
      nowHourKey: typeof getCurrentRoutineKey === 'function'
        ? getCurrentRoutineKey(currentDate())
        : 'pm'
    });
    renderSkincare(root, model, {
      onLogRoutine: skincareController?.onLogRoutine,
      onLogProcedure: skincareController?.onLogProcedure,
      onAddProduct: skincareController?.onAddProduct,
      onRetireProduct: skincareController?.onRetireProduct
    });
    const button = root.querySelector('#skincare-chat-button');
    button?.style?.setProperty('--agent-accent', agentColour?.(latestResult.agentsConfig, SKINCARE_AGENT_SLUG));
  }

  async function refreshSkincareCatalog() {
    if (typeof skincareApi?.getCatalog !== 'function') return;
    try {
      latestCatalog = await skincareApi.getCatalog();
      if (currentSection === 'skincare') renderSkincareSection();
    } catch {
      // Retain the currently rendered catalog if it cannot be refreshed.
    }
  }

  function applySkincareCatalog(catalog) {
    latestCatalog = catalog ?? null;
    if (currentSection === 'skincare') renderSkincareSection();
  }

  function renderCalendarSection({ scrollToDetail = false, monthDelta = 0 } = {}) {
    if (!latestResult || !buildCalendarModel || !renderCalendar) return;
    const date = latestResult.date;
    if (!calendarSelectedDate) calendarSelectedDate = date;
    if (!calendarViewMonth) calendarViewMonth = calendarSelectedDate.slice(0, 7);
    const model = buildCalendarModel({
      events: latestResult.events,
      date,
      selectedDate: calendarSelectedDate,
      viewMonth: calendarViewMonth
    });
    renderCalendar(root, model, {
      scrollToDetail,
      monthDelta,
      onSelectDate: next => {
        const nextMonth = next.slice(0, 7);
        const monthChanged = nextMonth !== calendarViewMonth;
        const monthDelta = !monthChanged ? 0 : (nextMonth > calendarViewMonth ? 1 : -1);
        calendarSelectedDate = next;
        calendarViewMonth = nextMonth;
        renderCalendarSection({ scrollToDetail: true, monthDelta });
      },
      onShiftMonth: delta => {
        calendarViewMonth = shiftYearMonth(calendarViewMonth, delta);
        calendarSelectedDate = clampDateToYearMonth(calendarSelectedDate, calendarViewMonth);
        renderCalendarSection({ monthDelta: delta });
      }
    });
  }

  function renderBodySection() {
    if (!latestResult || !buildBodyModel || !renderBody) return;
    const model = buildBodyModel({
      events: latestResult.events,
      date: latestResult.date,
      range: bodyRange
    });
    renderBody(root, model, {
      onRangeChange: next => {
        bodyRange = next;
        renderBodySection();
      },
      onLogWeight: bodyController?.onLogWeight,
      onLogComposition: bodyController?.onLogComposition,
      onLogMeasurements: bodyController?.onLogMeasurements
    });
    const button = root.querySelector('#body-chat-button');
    button?.style?.setProperty('--agent-accent', agentColour?.(latestResult.agentsConfig, BODY_AGENT_SLUG));
  }

  function renderMindSection() {
    if (!latestResult || !buildMindModel || !renderMind) return;
    const model = buildMindModel({
      events: latestResult.events,
      date: latestResult.date,
      range: mindRange
    });
    renderMind(root, model, {
      onRangeChange: next => {
        mindRange = next;
        renderMindSection();
      },
      onOpenAgent: slug => {
        chatSelectAgent?.(slug);
        if (!chatPanel) return;
        const slot = root.querySelector('#mind-dashboard');
        if (slot) {
          chatPanel.open(slot, agentColour?.(latestResult.agentsConfig, slug));
          chatClearUnread?.();
        }
      }
    });
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
    showEphemeralMessage(status, message, { severity });
  }

  function hideProvider() {
    const status = root.querySelector('#provider-status');
    clearEphemeralMessage(status);
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
    getDisplayDate: () => latestResult?.date ?? null,
    getAgentsConfig: () => latestResult?.agentsConfig ?? null,
    getFitnessLibraryContext: () => fitnessLibraryContext(),
    applySkincareCatalog
  };
}

function isSessionExpired(error) {
  return error?.status === 401 || error?.code === 'session_expired' || error?.code === 'unauthenticated';
}

function isNetworkFailure(error) {
  return error?.code === 'network_error' || (error instanceof TypeError && error?.status == null);
}
