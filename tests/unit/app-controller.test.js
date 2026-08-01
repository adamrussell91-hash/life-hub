import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionApi } from '../../js/app/api-session.js';
import { createAppController } from '../../js/app/app-controller.js';

const EXPIRY = '2026-08-01T18:00:00.000Z';
const NOW = new Date('2026-08-01T01:00:00.000Z');

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
      ['#unavailable-panel', new FakeElement({ hidden: true })],
      ['#retry-button', new FakeElement()]
    ]);
    this.futureNavigation = new FakeElement();
    this.futureNavigation.dataset.section = 'chat';
  }

  querySelector(selector) {
    return this.elements.get(selector) ?? null;
  }

  querySelectorAll(selector) {
    return selector === '[data-section]' ? [this.futureNavigation] : [];
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
  return {
    setInterval(callback) {
      const id = ++nextId;
      intervals.set(id, callback);
      return id;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    tick() {
      for (const callback of [...intervals.values()]) callback();
    },
    get activeIntervals() {
      return intervals.size;
    }
  };
}

function liveData(overrides = {}) {
  return {
    events: [],
    targetsConfig: {},
    warnings: [],
    commitSha: 'a'.repeat(40),
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
  const localStorage = memoryStorage();
  const navigatorTarget = { onLine: options.online !== false };
  const calls = {
    sessions: 0,
    signsIn: [],
    signsOut: 0,
    syncs: 0,
    cached: 0,
    health: 0,
    clears: 0,
    renders: 0,
    refreshSignals: []
  };
  let currentNow = new Date(NOW);
  let privateCachePresent = options.privateCachePresent !== false;
  const session = options.session ?? { authenticated: true, expiresAt: EXPIRY };
  let releaseSync;
  const heldSync = options.holdSync ? new Promise(resolve => { releaseSync = resolve; }) : null;
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
    sessionApi: {
      async getSession() {
        calls.sessions += 1;
        if (options.sessionError) throw options.sessionError;
        return session;
      },
      async signIn(passphrase) {
        calls.signsIn.push(passphrase);
        if (passphrase !== (options.acceptedPassphrase ?? 'secret')) {
          throw Object.assign(new Error('invalid'), { status: 401, code: 'invalid_credentials' });
        }
        return { authenticated: true, expiresAt: EXPIRY };
      },
      async signOut() {
        calls.signsOut += 1;
        if (heldLogout) await heldLogout;
      }
    },
    cache: {
      async clear() {
        calls.clears += 1;
        privateCachePresent = false;
      },
      async read() { return options.cachedRecord ?? null; }
    },
    async loadLive({ signal } = {}) {
      calls.syncs += 1;
      calls.refreshSignals.push(signal);
      if (heldSync) {
        const result = await heldSync;
        if (options.repopulateOnSync) privateCachePresent = true;
        return result;
      }
      if (options.liveError) throw options.liveError;
      return options.liveResult ?? liveData();
    },
    async loadCached() {
      calls.cached += 1;
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
    async fetchImpl(url) {
      assert.equal(url, '/api/health');
      calls.health += 1;
      if (options.healthResponse) return options.healthResponse;
      return Response.json({ ok: true, data: options.health ?? {
        github: 'healthy', token: 'healthy', expiresOn: '2026-09-01', code: 'ok', retryable: false
      } });
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
    releaseLogout: () => releaseLogout?.(),
    privateCachePresent: () => privateCachePresent,
    setNow: value => { currentNow = new Date(value); }
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

test('concurrent refreshes collapse and automatic refresh pauses while hidden', async () => {
  const state = harness({ holdSync: true });
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

test('session expiry during refresh returns to sign-in without clearing private cache', async () => {
  const expired = Object.assign(new Error('expired'), { code: 'session_expired', status: 401 });
  const state = harness({ liveError: expired, sessionMarker: EXPIRY });

  await state.controller.refresh();

  assert.equal(state.root.querySelector('#sign-in-view').hidden, false);
  assert.equal(state.root.querySelector('#app-shell').hidden, true);
  assert.equal(state.sessionStorage.getItem('life-hub:session-expiry'), null);
  assert.equal(state.calls.clears, 0);
});

test('session expiry reported by health returns to sign-in', async () => {
  const state = harness({ healthResponse: Response.json({
    ok: false, error: { code: 'unauthenticated', message: 'Please sign in.' }
  }, { status: 401 }) });

  await state.controller.start();

  assert.equal(state.root.querySelector('#sign-in-view').hidden, false);
  assert.equal(state.root.querySelector('#app-shell').hidden, true);
  assert.equal(state.root.querySelector('#app').dataset.state, 'signed-out');
  assert.equal(state.clock.activeIntervals, 0);
});

test('stale GitHub warning retains the rendered cached Home', async () => {
  const state = harness({ liveResult: liveData({ warnings: [{ code: 'github_unavailable' }] }) });

  await state.controller.start();

  assert.equal(state.calls.renders, 1);
  assert.equal(state.root.querySelector('#home-dashboard').hidden, false);
  assert.equal(state.root.querySelector('#provider-status').hidden, false);
  assert.match(state.root.querySelector('#provider-status').textContent, /GitHub.*saved/i);
  assert.equal(state.root.querySelector('#app').dataset.state, 'stale');
});

test('health token expiry displays a provider notice without hiding Home', async () => {
  const state = harness({ health: {
    github: 'healthy', token: 'expiring', expiresOn: '2026-08-10', code: 'ok', retryable: false
  } });

  await state.controller.start();

  assert.equal(state.root.querySelector('#provider-status').hidden, false);
  assert.match(state.root.querySelector('#provider-status').textContent, /10 August 2026/);
  assert.equal(state.root.querySelector('#home-dashboard').hidden, false);
});

test('manual refresh exposes progress then records the successful sync time', async () => {
  const state = harness({ holdSync: true });
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

  assert.equal(state.calls.signsOut, 1);
  assert.equal(state.calls.clears, 1);
  assert.equal(state.sessionStorage.getItem('life-hub:session-expiry'), null);
  assert.equal(state.root.querySelector('#sign-in-view').hidden, false);
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
