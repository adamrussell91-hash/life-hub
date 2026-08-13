import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionApi } from '../../js/app/api-session.js';
import { createAppController } from '../../js/app/app-controller.js';

const EXPIRY = '2026-08-01T18:00:00.000Z';
const NOW = new Date('2026-08-01T01:00:00.000Z');

class FakeClassList {
  constructor() {
    this.classes = new Set();
  }

  toggle(name, force) {
    const shouldAdd = force ?? !this.classes.has(name);
    if (shouldAdd) this.classes.add(name);
    else this.classes.delete(name);
    return shouldAdd;
  }

  add(name) {
    this.classes.add(name);
  }

  remove(name) {
    this.classes.delete(name);
  }

  contains(name) {
    return this.classes.has(name);
  }
}

class FakeElement extends EventTarget {
  constructor({ hidden = false } = {}) {
    super();
    this.hidden = hidden;
    this.disabled = false;
    this.value = '';
    this.textContent = '';
    this.dataset = {};
    this.attributes = new Map();
    this.focused = false;
    this.classList = new FakeClassList();
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'hidden') this.hidden = true;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'hidden') this.hidden = false;
  }

  focus() {
    if (this.disabled) return;
    this.focused = true;
  }
}

class FakeDocument extends EventTarget {
  constructor() {
    super();
    this.visibilityState = 'visible';
    this.elements = new Map([
      ['#sign-in-view', new FakeElement()],
      ['#app-shell', new FakeElement({ hidden: true })],
      ['#app', new FakeElement()],
      ['#sign-in-form', new FakeElement()],
      ['#passphrase-input', new FakeElement()],
      ['#sign-in-button', new FakeElement()],
      ['#sign-in-error', new FakeElement({ hidden: true })],
      ['#refresh-button', new FakeElement()],
      ['#sign-out-button', new FakeElement()],
      ['#last-synced', new FakeElement()],
      ['#provider-status', new FakeElement({ hidden: true })],
      ['#network-status', new FakeElement({ hidden: true })],
      ['#app-status', new FakeElement()],
      ['#home-dashboard', new FakeElement({ hidden: true })],
      ['#chat-view', new FakeElement({ hidden: true })],
      ['#nutrition-dashboard', new FakeElement({ hidden: true })],
      ['#nutrition-chat-button', new FakeElement()],
      ['#fitness-dashboard', new FakeElement({ hidden: true })],
      ['#fitness-chat-button', new FakeElement()],
      ['#central-node-dashboard', new FakeElement({ hidden: true })],
      ['#central-node-chat-button', new FakeElement()],
      ['#unavailable-panel', new FakeElement({ hidden: true })],
      ['#retry-button', new FakeElement()]
    ]);
    this.futureNavigation = new FakeElement();
    this.futureNavigation.dataset.section = 'fragrance';
    this.nutritionNavigation = new FakeElement();
    this.nutritionNavigation.dataset.section = 'nutrition';
    this.fitnessNavigation = new FakeElement();
    this.fitnessNavigation.dataset.section = 'fitness';
    this.skincareNavigation = new FakeElement();
    this.skincareNavigation.dataset.section = 'skincare';
    this.centralNodeNavigation = new FakeElement();
    this.centralNodeNavigation.dataset.section = 'central-node';
    this.chatNavigation = new FakeElement();
    this.chatNavigation.dataset.section = 'chat';
  }

  querySelector(selector) {
    return this.elements.get(selector) ?? null;
  }

  querySelectorAll(selector) {
    if (selector === '[data-section]') {
      return [
        this.futureNavigation,
        this.nutritionNavigation,
        this.fitnessNavigation,
        this.skincareNavigation,
        this.centralNodeNavigation,
        this.chatNavigation
      ];
    }
    if (selector === '[data-section="nutrition"]') return [this.nutritionNavigation];
    if (selector === '[data-section="fitness"]') return [this.fitnessNavigation];
    if (selector === '[data-section="skincare"]') return [this.skincareNavigation];
    if (selector === '[data-section="central-node"]') return [this.centralNodeNavigation];
    if (selector === '[data-section="chat"]') return [this.chatNavigation];
    return [];
  }
}

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    snapshot: () => Object.fromEntries(values)
  };
}

function createClock() {
  let nextId = 0;
  const intervals = new Map();
  const timeouts = new Map();
  return {
    setInterval(callback) {
      const id = ++nextId;
      intervals.set(id, callback);
      return id;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    setTimeout(callback, delay) {
      const id = ++nextId;
      timeouts.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      timeouts.delete(id);
    },
    tick() {
      for (const callback of [...intervals.values()]) callback();
    },
    fireTimeouts() {
      for (const [id, timeout] of [...timeouts]) {
        timeouts.delete(id);
        timeout.callback();
      }
    },
    get activeIntervals() {
      return intervals.size;
    },
    get activeTimeouts() {
      return timeouts.size;
    },
    get timeoutDelays() {
      return [...timeouts.values()].map(timeout => timeout.delay);
    }
  };
}

function liveData(overrides = {}) {
  return {
    events: [],
    targetsConfig: {},
    warnings: [],
    commitSha: 'a'.repeat(40),
    changed: true,
    freshness: 'confirmed',
    ...overrides
  };
}

function harness(options = {}) {
  const root = new FakeDocument();
  const windowTarget = new EventTarget();
  const clock = createClock();
  const sessionStorage = memoryStorage(options.sessionMarker
    ? { 'life-hub:session-expiry': options.sessionMarker }
    : {});
  const localStorage = memoryStorage({
    ...(options.logoutPending ? { 'life-hub:logout-pending': '1' } : {}),
    ...(options.lastSuccess ? { 'life-hub:last-success': options.lastSuccess } : {})
  });
  const navigatorTarget = { onLine: options.online !== false };
  const calls = {
    sessions: 0,
    signsIn: [],
    signsOut: 0,
    syncs: 0,
    cached: 0,
    clears: 0,
    renders: 0,
    refreshSignals: []
  };
  calls.order = [];
  let currentNow = new Date(NOW);
  let privateCachePresent = options.privateCachePresent !== false;
  const session = options.session ?? { authenticated: true, expiresAt: EXPIRY };
  let releaseSync;
  const heldSync = options.holdSync ? new Promise(resolve => { releaseSync = resolve; }) : null;
  let releaseCached;
  const heldCached = options.holdCached ? new Promise(resolve => { releaseCached = resolve; }) : null;
  let releaseSignIn;
  const heldSignIn = options.holdSignIn ? new Promise(resolve => { releaseSignIn = resolve; }) : null;
  let releaseLogout;
  const heldLogout = options.holdLogout ? new Promise(resolve => { releaseLogout = resolve; }) : null;

  const dependencies = {
    root,
    windowTarget,
    documentTarget: root,
    navigatorTarget,
    sessionStorage,
    localStorage,
    now: () => new Date(currentNow),
    setIntervalImpl: callback => clock.setInterval(callback),
    clearIntervalImpl: id => clock.clearInterval(id),
    setTimeoutImpl: (callback, delay) => clock.setTimeout(callback, delay),
    clearTimeoutImpl: id => clock.clearTimeout(id),
    sessionApi: {
      async getSession() {
        calls.sessions += 1;
        calls.order.push('session');
        if (options.sessionError) throw options.sessionError;
        return session;
      },
      async signIn(passphrase) {
        calls.signsIn.push(passphrase);
        calls.order.push('sign-in');
        if (heldSignIn) await heldSignIn;
        if (passphrase !== (options.acceptedPassphrase ?? 'secret')) {
          throw Object.assign(new Error('invalid'), { status: 401, code: 'invalid_credentials' });
        }
        return options.signInSession ?? { authenticated: true, expiresAt: EXPIRY };
      },
      async signOut() {
        calls.signsOut += 1;
        calls.order.push('logout');
        if (heldLogout) await heldLogout;
        if (options.logoutError) throw options.logoutError;
      }
    },
    cache: {
      async clear() {
        calls.clears += 1;
        privateCachePresent = false;
      },
      async read() { return options.cachedRecord ?? null; }
    },
    async loadLive({ signal, onPartial } = {}) {
      calls.syncs += 1;
      calls.refreshSignals.push(signal);
      if (typeof options.loadLiveImpl === 'function') {
        return options.loadLiveImpl({
          call: calls.syncs,
          signal,
          onPartial,
          setPrivateCachePresent(value = true) {
            privateCachePresent = value;
          }
        });
      }
      if (heldSync) {
        const result = await heldSync;
        if (options.repopulateOnSync) privateCachePresent = true;
        await onPartial?.(result);
        return result;
      }
      if (options.liveError) throw options.liveError;
      const result = options.liveResults?.shift() ?? options.liveResult ?? liveData();
      await onPartial?.(result);
      return result;
    },
    async loadCached() {
      calls.cached += 1;
      if (heldCached) return heldCached;
      if (!options.cachedResult) throw new Error('cache unavailable');
      return options.cachedResult;
    },
    buildHomeModel: input => ({ date: input.date, source: input }),
    renderHome(documentRoot, model) {
      calls.renders += 1;
      documentRoot.querySelector('#home-dashboard').hidden = false;
      documentRoot.querySelector('#app').dataset.state = 'ready';
      documentRoot.querySelector('#app-status').textContent = `Loaded ${model.date}`;
    },
    renderWarnings() {},
    renderUnavailable(documentRoot, message) {
      documentRoot.querySelector('#unavailable-panel').hidden = false;
      documentRoot.querySelector('#app-status').textContent = message;
    },
    buildNutritionModel: input => ({ date: input.date, source: input, kind: 'nutrition' }),
    renderNutrition(documentRoot, model) {
      calls.nutritionRenders = (calls.nutritionRenders ?? 0) + 1;
      calls.lastNutritionSource = model.source;
      documentRoot.querySelector('#nutrition-dashboard').hidden = false;
    },
    buildFitnessModel: input => ({ date: input.date, source: input, kind: 'fitness' }),
    renderFitness(documentRoot, model) {
      calls.fitnessRenders = (calls.fitnessRenders ?? 0) + 1;
      documentRoot.querySelector('#fitness-dashboard').hidden = false;
    },
    buildCentralNodeModel: input => ({ date: input.date, source: input, kind: 'central-node' }),
    renderCentralNode(documentRoot, model) {
      calls.centralNodeRenders = (calls.centralNodeRenders ?? 0) + 1;
      documentRoot.querySelector('#central-node-dashboard').hidden = false;
    },
    agentColour: (agentsConfig, slug) => `#colour-for-${slug}`,
    chatClearUnread: () => {
      calls.chatClearUnreads = (calls.chatClearUnreads ?? 0) + 1;
    },
    chatPanel: {
      opens: [],
      closes: 0,
      open(slot, accentColour) {
        this.opens.push({ slot, accentColour });
      },
      close() {
        this.closes += 1;
      },
      isOpen() {
        return this.opens.length > this.closes;
      }
    }
  };

  return {
    root,
    calls,
    clock,
    sessionStorage,
    localStorage,
    windowTarget,
    navigatorTarget,
    controller: createAppController(dependencies),
    releaseSync: value => releaseSync?.(value ?? liveData()),
    releaseCached: value => releaseCached?.(value ?? liveData({ freshness: 'fallback', changed: false })),
    releaseSignIn: value => releaseSignIn?.(value),
    releaseLogout: () => releaseLogout?.(),
    privateCachePresent: () => privateCachePresent,
    setNow: value => { currentNow = new Date(value); },
    chatPanelCalls: dependencies.chatPanel
  };
}

test('session API sends only the passphrase contract and unwraps successful data', async () => {
  const calls = [];
  const api = createSessionApi(async (url, init = {}) => {
    calls.push({ url, init });
    if (url === '/api/logout') return new Response(null, { status: 204 });
    return Response.json({ ok: true, data: { authenticated: true, expiresAt: EXPIRY } });
  });

  assert.equal((await api.getSession()).authenticated, true);
  assert.equal((await api.signIn('only-on-the-wire')).expiresAt, EXPIRY);
  await api.signOut();

  assert.deepEqual(calls.map(call => call.url), ['/api/session', '/api/auth', '/api/logout']);
  assert.deepEqual(JSON.parse(calls[1].init.body), { passphrase: 'only-on-the-wire' });
  assert.equal(calls[1].init.method, 'POST');
  assert.equal(calls[2].init.method, 'POST');
  assert.equal(calls[2].init.keepalive, true);
});

test('session API maps sanitized HTTP failures without exposing response messages', async () => {
  const api = createSessionApi(async () => Response.json({
    ok: false,
    error: { code: 'invalid_credentials', message: 'provider detail' }
  }, { status: 401 }));

  await assert.rejects(api.signIn('wrong'), error => (
    error.status === 401 && error.code === 'invalid_credentials' && !error.message.includes('provider detail')
  ));
});

test('signed-out startup reveals only the sign-in view and focuses the passphrase', async () => {
  const state = harness({ sessionError: Object.assign(new Error('unauthenticated'), { status: 401 }) });

  await state.controller.start();

  assert.equal(state.root.querySelector('#sign-in-view').hidden, false);
  assert.equal(state.root.querySelector('#app-shell').hidden, true);
  assert.equal(state.root.querySelector('#passphrase-input').focused, true);
  assert.equal(state.calls.syncs, 0);
});

test('authoritative signed-out or malformed session data clears any prior expiry marker', async () => {
  for (const session of [
    { authenticated: false },
    { authenticated: true, expiresAt: 'not-a-date' },
    { authenticated: true, expiresAt: NOW.toISOString() }
  ]) {
    const state = harness({ session, sessionMarker: EXPIRY });
    await state.controller.start();

    assert.equal(state.sessionStorage.getItem('life-hub:session-expiry'), null);
    assert.equal(state.root.querySelector('#app-shell').hidden, true);
    assert.equal(state.calls.syncs, 0);
  }
});

test('successful sign-in loads live Home and stores only a tab expiry marker', async () => {
  const state = harness({ session: { authenticated: false }, acceptedPassphrase: 'secret' });

  await state.controller.signIn('secret');

  assert.equal(state.root.querySelector('#app-shell').hidden, false);
  assert.equal(state.root.querySelector('#sign-in-view').hidden, true);
  assert.equal(state.root.querySelector('#passphrase-input').value, '');
  assert.equal(state.sessionStorage.getItem('life-hub:session-expiry'), EXPIRY);
  assert.equal(state.localStorage.getItem('passphrase'), null);
  assert.deepEqual(state.sessionStorage.snapshot(), { 'life-hub:session-expiry': EXPIRY });
  assert.equal(state.calls.syncs, 1);
});

test('invalid credentials re-enable the passphrase before restoring focus', async () => {
  const state = harness({ acceptedPassphrase: 'secret' });
  const input = state.root.querySelector('#passphrase-input');
  input.value = 'wrong';

  await state.controller.signIn('wrong');

  assert.equal(state.root.querySelector('#app-shell').hidden, true);
  assert.equal(state.root.querySelector('#sign-in-view').hidden, false);
  assert.equal(state.root.querySelector('#sign-in-error').hidden, false);
  assert.equal(state.root.querySelector('#sign-in-error').textContent, 'That passphrase was not accepted.');
  assert.equal(input.value, '');
  assert.equal(input.disabled, false);
  assert.equal(input.focused, true);
});

test('malformed sign-in session fails closed and clears the submitted passphrase', async () => {
  const state = harness({ signInSession: { authenticated: true, expiresAt: 'not-a-date' } });
  const input = state.root.querySelector('#passphrase-input');
  input.value = 'secret';

  await state.controller.signIn('secret');

  assert.equal(input.value, '');
  assert.equal(state.root.querySelector('#app-shell').hidden, true);
  assert.equal(state.sessionStorage.getItem('life-hub:session-expiry'), null);
  assert.equal(state.calls.syncs, 0);
});

test('concurrent refreshes collapse and automatic refresh pauses while hidden', async () => {
  const state = harness({ holdSync: true, sessionMarker: EXPIRY });
  const first = state.controller.refresh();
  const second = state.controller.refresh();

  assert.equal(first, second);
  assert.equal(state.calls.syncs, 1);
  state.releaseSync();
  await first;

  state.root.visibilityState = 'hidden';
  state.clock.tick();
  assert.equal(state.calls.syncs, 1);
});

test('known session expiry is scheduled at the exact deadline and invalidates the shell', async () => {
  const state = harness();
  await state.controller.start();

  assert.deepEqual(state.clock.timeoutDelays, [Date.parse(EXPIRY) - NOW.getTime()]);
  state.setNow(EXPIRY);
  state.clock.fireTimeouts();

  assert.equal(state.root.querySelector('#app-shell').hidden, true);
  assert.equal(state.root.querySelector('#sign-in-view').hidden, false);
  assert.equal(state.sessionStorage.getItem('life-hub:session-expiry'), null);
  assert.equal(state.clock.activeIntervals, 0);
  assert.equal(state.calls.clears, 0);
});

test('expiry while live or cached data is loading prevents private rendering', async () => {
  const live = harness({ holdSync: true, sessionMarker: EXPIRY });
  const liveStart = live.controller.start();
  await new Promise(resolve => setImmediate(resolve));
  live.setNow(EXPIRY);
  live.releaseSync();
  await liveStart;
  assert.equal(live.calls.renders, 0);
  assert.equal(live.root.querySelector('#app-shell').hidden, true);
  assert.equal(live.sessionStorage.getItem('life-hub:session-expiry'), null);

  const offline = Object.assign(new TypeError('Failed to fetch'), { code: 'network_error' });
  const cached = harness({
    online: false,
    sessionError: offline,
    sessionMarker: EXPIRY,
    holdCached: true
  });
  const cachedStart = cached.controller.start();
  await new Promise(resolve => setImmediate(resolve));
  cached.setNow(EXPIRY);
  cached.releaseCached();
  await cachedStart;
  assert.equal(cached.calls.renders, 0);
  assert.equal(cached.root.querySelector('#app-shell').hidden, true);
  assert.equal(cached.sessionStorage.getItem('life-hub:session-expiry'), null);
});

test('refresh, visibility, and online entry fail closed after known expiry', async () => {
  for (const entry of ['refresh', 'visibility', 'online']) {
    const state = harness();
    await state.controller.start();
    const syncs = state.calls.syncs;
    state.setNow(EXPIRY);

    if (entry === 'refresh') await state.controller.refresh();
    if (entry === 'visibility') state.root.dispatchEvent(new Event('visibilitychange'));
    if (entry === 'online') state.windowTarget.dispatchEvent(new Event('online'));
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(state.calls.syncs, syncs, entry);
    assert.equal(state.root.querySelector('#app-shell').hidden, true, entry);
    assert.equal(state.sessionStorage.getItem('life-hub:session-expiry'), null, entry);
  }
});

test('session expiry during refresh returns to sign-in without clearing private cache', async () => {
  const expired = Object.assign(new Error('expired'), { code: 'session_expired', status: 401 });
  const state = harness({ liveError: expired, sessionMarker: EXPIRY });

  await state.controller.refresh();

  assert.equal(state.root.querySelector('#sign-in-view').hidden, false);
  assert.equal(state.root.querySelector('#app-shell').hidden, true);
  assert.equal(state.sessionStorage.getItem('life-hub:session-expiry'), null);
  assert.equal(state.calls.clears, 0);
});

test('fallback freshness retains Home visibly stale without advancing the prior confirmed time', async () => {
  const priorSuccess = '2026-08-01T00:30:00.000Z';
  const state = harness({
    lastSuccess: priorSuccess,
    liveResult: liveData({
      warnings: [{ code: 'github_invalid_response' }],
      changed: false,
      freshness: 'fallback'
    })
  });

  await state.controller.start();

  assert.equal(state.calls.renders, 1);
  assert.equal(state.root.querySelector('#home-dashboard').hidden, false);
  assert.equal(state.root.querySelector('#app').dataset.state, 'stale');
  assert.equal(state.localStorage.getItem('life-hub:last-success'), priorSuccess);
  assert.match(state.root.querySelector('#last-synced').textContent, /Last synced/);
});

test('confirmed unchanged refresh avoids rerender while advancing confirmation time', async () => {
  const state = harness({
    liveResults: [
      liveData({ changed: true, freshness: 'confirmed' }),
      liveData({ changed: false, freshness: 'confirmed' })
    ]
  });
  await state.controller.start();
  assert.equal(state.calls.renders, 1);

  state.setNow('2026-08-01T02:00:00.000Z');
  await state.controller.refresh();

  assert.equal(state.calls.renders, 1);
  assert.equal(state.localStorage.getItem('life-hub:last-success'), '2026-08-01T02:00:00.000Z');
});

test('force refresh aborts in-flight sync and re-renders even when changed is false', async () => {
  let resolveFirst;
  const firstHeld = new Promise(resolve => { resolveFirst = resolve; });
  const dinnerEvent = {
    record: {
      type: 'meal',
      date: '2026-07-30',
      meal: 'dinner',
      calories: 900,
      protein_g: 50,
      fat_g: 40,
      sodium_mg: 1,
      potassium_mg: 1,
      polyphenol_score: 1
    },
    body: '',
    path: 'x',
    legacy: false
  };
  const state = harness({
    loadLiveImpl: async ({ call }) => {
      if (call === 1) {
        return liveData({ changed: true, freshness: 'confirmed', events: [] });
      }
      if (call === 2) {
        await firstHeld;
        return liveData({ changed: false, freshness: 'confirmed', events: [] });
      }
      return liveData({
        changed: false,
        freshness: 'confirmed',
        events: [dinnerEvent]
      });
    }
  });

  await state.controller.start();
  state.root.nutritionNavigation.dispatchEvent(new Event('click'));
  assert.equal(state.calls.nutritionRenders, 1);

  const firstRefresh = state.controller.refresh({ manual: true });
  assert.equal(state.calls.syncs, 2);

  const forced = state.controller.refresh({ manual: true, force: true });
  assert.notEqual(forced, firstRefresh);
  assert.equal(state.calls.refreshSignals[1]?.aborted, true);
  assert.equal(state.calls.syncs, 3);

  const joined = state.controller.refresh({ manual: true });
  assert.equal(joined, forced);

  resolveFirst();
  await firstRefresh;
  await forced;

  assert.equal(state.calls.nutritionRenders, 2);
  assert.equal(state.calls.lastNutritionSource?.events?.[0]?.record?.meal, 'dinner');
});

test('manual refresh exposes progress then records the successful sync time', async () => {
  const state = harness({ holdSync: true, sessionMarker: EXPIRY });
  const click = new Event('click');
  state.root.querySelector('#refresh-button').dispatchEvent(click);

  assert.equal(state.root.querySelector('#refresh-button').disabled, true);
  assert.match(state.root.querySelector('#app-status').textContent, /Refreshing/);
  state.releaseSync();
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(state.root.querySelector('#refresh-button').disabled, false);
  assert.match(state.root.querySelector('#last-synced').textContent, /Last synced/);
  assert.equal(state.localStorage.getItem('life-hub:last-success'), NOW.toISOString());
});

test('offline startup uses private cache only with an unexpired same-tab marker', async () => {
  const offline = Object.assign(new TypeError('Failed to fetch'), { code: 'network_error' });
  const allowed = harness({ online: false, sessionError: offline, sessionMarker: EXPIRY, cachedResult: liveData() });

  await allowed.controller.start();

  assert.equal(allowed.calls.cached, 1);
  assert.equal(allowed.root.querySelector('#app-shell').hidden, false);
  assert.equal(allowed.root.querySelector('#refresh-button').disabled, true);
  assert.equal(allowed.root.querySelector('#app').dataset.state, 'offline');
  allowed.setNow('2026-08-01T18:00:01.000Z');
  allowed.clock.tick();
  assert.equal(allowed.root.querySelector('#sign-in-view').hidden, false);
  assert.equal(allowed.sessionStorage.getItem('life-hub:session-expiry'), null);

  const newTab = harness({ online: false, sessionError: offline, cachedResult: liveData() });
  await newTab.controller.start();
  assert.equal(newTab.calls.cached, 0);
  assert.equal(newTab.root.querySelector('#sign-in-view').hidden, false);

  const expiredTab = harness({
    online: false,
    sessionError: offline,
    sessionMarker: '2026-08-01T00:00:00.000Z',
    cachedResult: liveData()
  });
  await expiredTab.controller.start();
  assert.equal(expiredTab.calls.cached, 0);
  assert.equal(expiredTab.sessionStorage.getItem('life-hub:session-expiry'), null);
});

test('offline cache rejects non-network session-validation failures', async () => {
  for (const sessionError of [
    Object.assign(new Error('server failure'), { status: 500, code: 'request_failed' }),
    Object.assign(new Error('malformed success'), { status: 200, code: 'request_failed' })
  ]) {
    const state = harness({
      online: false,
      sessionError,
      sessionMarker: EXPIRY,
      cachedResult: liveData()
    });

    await state.controller.start();

    assert.equal(state.calls.cached, 0);
    assert.equal(state.root.querySelector('#app-shell').hidden, true);
    assert.equal(state.root.querySelector('#sign-in-view').hidden, false);
  }
});

test('future navigation retains its existing status announcement', () => {
  const state = harness();

  state.root.futureNavigation.dispatchEvent(new Event('click'));

  assert.equal(
    state.root.querySelector('#app-status').textContent,
    'This section arrives in a later Life Hub phase.'
  );
});

test('explicit logout clears the private cache and tab marker', async () => {
  const state = harness({ sessionMarker: EXPIRY });

  await state.controller.signOut();
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(state.calls.signsOut, 1);
  assert.equal(state.calls.clears, 1);
  assert.equal(state.sessionStorage.getItem('life-hub:session-expiry'), null);
  assert.equal(state.root.querySelector('#sign-in-view').hidden, false);
  assert.equal(state.localStorage.getItem('life-hub:logout-pending'), null);
});

test('offline logout persists a tombstone and reload retries it before session validation', async () => {
  const failed = harness({
    sessionMarker: EXPIRY,
    logoutError: new TypeError('offline')
  });
  await failed.controller.signOut();

  assert.equal(failed.localStorage.getItem('life-hub:logout-pending'), '1');
  assert.equal(failed.root.querySelector('#app-shell').hidden, true);
  assert.equal(failed.calls.clears, 1);

  const reloaded = harness({
    logoutPending: true,
    sessionError: Object.assign(new Error('unauthenticated'), { status: 401 })
  });
  await reloaded.controller.start();

  assert.deepEqual(reloaded.calls.order.slice(0, 2), ['logout', 'session']);
  assert.equal(reloaded.localStorage.getItem('life-hub:logout-pending'), null);
  assert.equal(reloaded.calls.syncs, 0);
  assert.equal(reloaded.root.querySelector('#app-shell').hidden, true);
});

test('rapid sign-in waits for delayed logout completion before authenticating', async () => {
  const state = harness({ holdLogout: true, sessionMarker: EXPIRY });
  await state.controller.signOut();
  const signingIn = state.controller.signIn('secret');
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(state.calls.signsIn.length, 0);
  assert.equal(state.localStorage.getItem('life-hub:logout-pending'), '1');

  state.releaseLogout();
  await signingIn;
  assert.deepEqual(state.calls.order.slice(0, 2), ['logout', 'sign-in']);
  assert.equal(state.localStorage.getItem('life-hub:logout-pending'), null);
  assert.equal(state.root.querySelector('#app-shell').hidden, false);
});

test('a delayed sign-in cannot reveal the shell after a newer logout lifecycle', async () => {
  const state = harness({ holdSignIn: true });
  const signingIn = state.controller.signIn('secret');
  await new Promise(resolve => setImmediate(resolve));
  await state.controller.signOut();
  state.releaseSignIn();
  await signingIn;

  assert.equal(state.root.querySelector('#app-shell').hidden, true);
  assert.equal(state.sessionStorage.getItem('life-hub:session-expiry'), null);
  assert.equal(state.calls.syncs, 0);
});

test('logout hides immediately and clears again after invalidating an active refresh', async () => {
  const state = harness({
    sessionMarker: EXPIRY,
    holdSync: true,
    holdLogout: true,
    repopulateOnSync: true
  });
  state.root.querySelector('#app-shell').hidden = false;
  state.root.querySelector('#sign-in-view').hidden = true;
  const refresh = state.controller.refresh();

  const logout = state.controller.signOut();

  assert.equal(state.root.querySelector('#app-shell').hidden, true);
  assert.equal(state.root.querySelector('#sign-in-view').hidden, false);
  assert.equal(state.sessionStorage.getItem('life-hub:session-expiry'), null);
  assert.equal(state.calls.clears, 1);
  assert.equal(state.calls.refreshSignals[0]?.aborted, true);

  state.releaseSync();
  await refresh;
  const outcome = await Promise.race([
    logout.then(() => 'complete'),
    new Promise(resolve => setTimeout(() => resolve('network-blocked'), 25))
  ]);

  assert.equal(outcome, 'complete');
  assert.equal(state.calls.renders, 0);
  assert.equal(state.calls.clears, 2);
  assert.equal(state.privateCachePresent(), false);
});

test('rapid re-authentication waits for all prior logout cache cleanup', async () => {
  let releaseOldRefresh;
  const oldRefreshResult = new Promise(resolve => { releaseOldRefresh = resolve; });
  const state = harness({
    sessionMarker: EXPIRY,
    loadLiveImpl: async ({ call, setPrivateCachePresent }) => {
      if (call === 1) return oldRefreshResult;
      setPrivateCachePresent(true);
      return liveData();
    }
  });
  const oldRefresh = state.controller.refresh();

  const logout = state.controller.signOut();
  const signingIn = state.controller.signIn('secret');
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(state.calls.signsIn.length, 0);
  assert.equal(state.calls.refreshSignals[0].aborted, true);

  releaseOldRefresh(liveData());
  await Promise.all([oldRefresh, logout, signingIn]);

  assert.equal(state.calls.syncs, 2);
  assert.equal(state.calls.clears, 2);
  assert.equal(state.privateCachePresent(), true);
  assert.equal(state.root.querySelector('#app-shell').hidden, false);
});

test('destroy clears refresh timers and removes bound listeners', async () => {
  const state = harness();
  await state.controller.start();
  assert.equal(state.clock.activeIntervals, 1);

  state.controller.destroy();
  state.windowTarget.dispatchEvent(new Event('offline'));
  state.root.querySelector('#refresh-button').dispatchEvent(new Event('click'));

  assert.equal(state.clock.activeIntervals, 0);
  assert.equal(state.calls.syncs, 1);
});

test('clicking the Nutrition nav item shows the dashboard and builds/renders it from the latest loaded sync data', async () => {
  const state = harness();
  await state.controller.start();

  state.root.nutritionNavigation.dispatchEvent(new Event('click'));

  assert.equal(state.root.querySelector('#nutrition-dashboard').hidden, false);
  assert.equal(state.root.querySelector('#home-dashboard').hidden, true);
  assert.equal(state.calls.nutritionRenders, 1);
});

test('getCurrentSection reflects the most recently shown section', async () => {
  const state = harness();
  await state.controller.start();
  assert.equal(state.controller.getCurrentSection(), 'home');

  state.root.nutritionNavigation.dispatchEvent(new Event('click'));
  assert.equal(state.controller.getCurrentSection(), 'nutrition');
});

test('the floating chat button opens the chat panel into the Nutrition section, themed with Brisket\'s colour', async () => {
  const state = harness();
  await state.controller.start();
  state.root.nutritionNavigation.dispatchEvent(new Event('click'));

  state.root.querySelector('#nutrition-chat-button').dispatchEvent(new Event('click'));

  assert.equal(state.chatPanelCalls.opens.length, 1);
  assert.equal(state.chatPanelCalls.opens[0].slot, state.root.querySelector('#nutrition-dashboard'));
  assert.equal(state.chatPanelCalls.opens[0].accentColour, '#colour-for-brisket');
});

test('clicking the floating chat button again closes an already-open panel', async () => {
  const state = harness();
  await state.controller.start();
  state.root.nutritionNavigation.dispatchEvent(new Event('click'));
  const button = state.root.querySelector('#nutrition-chat-button');
  button.dispatchEvent(new Event('click'));

  button.dispatchEvent(new Event('click'));

  assert.equal(state.chatPanelCalls.opens.length, 1);
  assert.equal(state.chatPanelCalls.closes, 1);
});

test('navigating to Chat closes an open overlay panel and returns the chat view to its home slot', async () => {
  const state = harness();
  await state.controller.start();
  state.root.nutritionNavigation.dispatchEvent(new Event('click'));
  state.root.querySelector('#nutrition-chat-button').dispatchEvent(new Event('click'));
  assert.equal(state.chatPanelCalls.opens.length, 1);

  state.root.chatNavigation.dispatchEvent(new Event('click'));

  assert.equal(state.chatPanelCalls.closes, 1);
  assert.equal(state.controller.getCurrentSection(), 'chat');
});

test('a completed refresh while viewing Nutrition re-renders the dashboard and re-themes the chat button', async () => {
  const state = harness({
    liveResults: [
      liveData({ changed: true, freshness: 'confirmed' }),
      liveData({ changed: true, freshness: 'confirmed', agentsConfig: { agents: [{ slug: 'brisket', colour: '#UPDATED' }] } })
    ]
  });
  await state.controller.start();
  state.root.nutritionNavigation.dispatchEvent(new Event('click'));
  assert.equal(state.calls.nutritionRenders, 1);

  await state.controller.refresh();

  assert.equal(state.calls.nutritionRenders, 2);
  assert.equal(state.root.querySelector('#home-dashboard').hidden, true);
  assert.equal(state.root.querySelector('#nutrition-dashboard').hidden, false);
});

test('a completed refresh while viewing Chat does not resurface the Home dashboard', async () => {
  const state = harness({
    liveResults: [
      liveData({ changed: true, freshness: 'confirmed' }),
      liveData({ changed: true, freshness: 'confirmed' })
    ]
  });
  await state.controller.start();
  state.root.chatNavigation.dispatchEvent(new Event('click'));
  assert.equal(state.controller.getCurrentSection(), 'chat');
  assert.equal(state.root.querySelector('#chat-view').hidden, false);
  assert.equal(state.root.querySelector('#home-dashboard').hidden, true);

  await state.controller.refresh();

  assert.equal(state.root.querySelector('#home-dashboard').hidden, true);
  assert.equal(state.root.querySelector('#chat-view').hidden, false);
});

test('clicking the Fitness nav item shows the dashboard and builds/renders it from the latest loaded sync data', async () => {
  const state = harness();
  await state.controller.start();

  state.root.fitnessNavigation.dispatchEvent(new Event('click'));

  assert.equal(state.root.querySelector('#fitness-dashboard').hidden, false);
  assert.equal(state.root.querySelector('#home-dashboard').hidden, true);
  assert.equal(state.calls.fitnessRenders, 1);
  assert.equal(state.controller.getCurrentSection(), 'fitness');
});

test('the floating chat button opens the chat panel into the Fitness section, themed with Chadwick\'s colour', async () => {
  const state = harness();
  await state.controller.start();
  state.root.fitnessNavigation.dispatchEvent(new Event('click'));

  state.root.querySelector('#fitness-chat-button').dispatchEvent(new Event('click'));

  assert.equal(state.chatPanelCalls.opens.length, 1);
  assert.equal(state.chatPanelCalls.opens[0].slot, state.root.querySelector('#fitness-dashboard'));
  assert.equal(state.chatPanelCalls.opens[0].accentColour, '#colour-for-chadwick');
});

test('a completed refresh while viewing Fitness re-renders the dashboard', async () => {
  const state = harness({
    liveResults: [
      liveData({ changed: true, freshness: 'confirmed' }),
      liveData({ changed: true, freshness: 'confirmed' })
    ]
  });
  await state.controller.start();
  state.root.fitnessNavigation.dispatchEvent(new Event('click'));
  assert.equal(state.calls.fitnessRenders, 1);

  await state.controller.refresh();

  assert.equal(state.calls.fitnessRenders, 2);
});

test('clicking the Central Node nav item shows the dashboard and builds/renders it from the latest loaded sync data', async () => {
  const state = harness();
  await state.controller.start();

  state.root.centralNodeNavigation.dispatchEvent(new Event('click'));

  assert.equal(state.root.querySelector('#central-node-dashboard').hidden, false);
  assert.equal(state.root.querySelector('#home-dashboard').hidden, true);
  assert.equal(state.calls.centralNodeRenders, 1);
  assert.equal(state.controller.getCurrentSection(), 'central-node');
});

test('the Central Node floating chat button opens the chat panel into its section, themed with Hammond\'s colour', async () => {
  const state = harness();
  await state.controller.start();
  state.root.centralNodeNavigation.dispatchEvent(new Event('click'));

  state.root.querySelector('#central-node-chat-button').dispatchEvent(new Event('click'));

  assert.equal(state.chatPanelCalls.opens.length, 1);
  assert.equal(state.chatPanelCalls.opens[0].slot, state.root.querySelector('#central-node-dashboard'));
  assert.equal(state.chatPanelCalls.opens[0].accentColour, '#colour-for-hammond');
});

test('clicking the Central Node floating chat button again closes an already-open panel', async () => {
  const state = harness();
  await state.controller.start();
  state.root.centralNodeNavigation.dispatchEvent(new Event('click'));
  const button = state.root.querySelector('#central-node-chat-button');
  button.dispatchEvent(new Event('click'));

  button.dispatchEvent(new Event('click'));

  assert.equal(state.chatPanelCalls.opens.length, 1);
  assert.equal(state.chatPanelCalls.closes, 1);
});

test('opening the floating chat button clears the chat unread flag', async () => {
  const state = harness();
  await state.controller.start();
  state.root.nutritionNavigation.dispatchEvent(new Event('click'));

  state.root.querySelector('#nutrition-chat-button').dispatchEvent(new Event('click'));

  assert.equal(state.calls.chatClearUnreads, 1);
});

test('closing the floating chat button does not clear the chat unread flag again', async () => {
  const state = harness();
  await state.controller.start();
  state.root.nutritionNavigation.dispatchEvent(new Event('click'));
  const button = state.root.querySelector('#nutrition-chat-button');
  button.dispatchEvent(new Event('click'));
  assert.equal(state.calls.chatClearUnreads, 1);

  button.dispatchEvent(new Event('click'));

  assert.equal(state.calls.chatClearUnreads, 1);
});

test('navigating to Chat clears the chat unread flag', async () => {
  const state = harness();
  await state.controller.start();

  state.root.chatNavigation.dispatchEvent(new Event('click'));

  assert.equal(state.calls.chatClearUnreads, 1);
  assert.equal(state.controller.getCurrentSection(), 'chat');
});

test('Home becomes ready after the first live window while a later slice is still pending', async () => {
  let release;
  const later = new Promise(resolve => { release = resolve; });
  const week = liveData({ events: [{ record: { date: '2026-08-01', type: 'weight' } }] });
  const full = liveData({
    events: [
      { record: { date: '2026-08-01', type: 'weight' } },
      { record: { date: '2026-07-01', type: 'weight' } }
    ]
  });
  const state = harness({
    loadLiveImpl: async ({ onPartial }) => {
      await onPartial(week);
      await later;
      await onPartial(full);
      return full;
    }
  });

  const started = state.controller.start();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.root.querySelector('#app-shell').hidden, false);
  assert.equal(state.calls.renders, 1);
  assert.equal(state.root.querySelector('#app').dataset.state, 'ready');
  assert.match(state.root.querySelector('#app-status').textContent, /earlier history/i);

  await started;
  assert.equal(state.calls.renders, 1);

  release();
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.calls.renders, 2);
});

test('a failed later slice does not show the unavailable panel after first paint', async () => {
  const week = liveData();
  const state = harness({
    loadLiveImpl: async ({ onPartial }) => {
      await onPartial(week);
      throw Object.assign(new Error('github_unavailable'), { code: 'github_unavailable' });
    }
  });

  await state.controller.start();
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(state.root.querySelector('#unavailable-panel').hidden, true);
  assert.equal(state.root.querySelector('#app-shell').hidden, false);
  assert.equal(state.root.querySelector('#app').dataset.state, 'ready');
});

test('a completed refresh while viewing Central Node re-renders the dashboard and re-themes the chat button', async () => {
  const state = harness({
    liveResults: [
      liveData({ changed: true, freshness: 'confirmed' }),
      liveData({ changed: true, freshness: 'confirmed', agentsConfig: { agents: [{ slug: 'hammond', colour: '#UPDATED' }] } })
    ]
  });
  await state.controller.start();
  state.root.centralNodeNavigation.dispatchEvent(new Event('click'));
  assert.equal(state.calls.centralNodeRenders, 1);

  await state.controller.refresh();

  assert.equal(state.calls.centralNodeRenders, 2);
});
