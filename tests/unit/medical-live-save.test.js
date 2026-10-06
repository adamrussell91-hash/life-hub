import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAppController } from '../../apps/life/js/app/app-controller.js';
import { createMedicalController } from '../../apps/life/js/app/medical-controller.js';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '../..');
const EXPIRY = '2026-10-06T18:00:00.000Z';
const NOW = new Date('2026-10-06T01:00:00.000Z');

class FakeClassList {
  constructor() { this.classes = new Set(); }
  toggle(name, force) {
    const shouldAdd = force ?? !this.classes.has(name);
    if (shouldAdd) this.classes.add(name);
    else this.classes.delete(name);
    return shouldAdd;
  }
  add(name) { this.classes.add(name); }
  remove(name) { this.classes.delete(name); }
  contains(name) { return this.classes.has(name); }
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
    this.classList = new FakeClassList();
    this.style = { setProperty() {} };
    this.children = [];
    this.scrollTop = 0;
  }
  focus() { this.focused = true; }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === 'hidden') this.hidden = true;
  }
  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === 'hidden') this.hidden = false;
  }
  querySelector() { return null; }
  querySelectorAll() { return []; }
}

class FakeDocument extends EventTarget {
  constructor() {
    super();
    this.visibilityState = 'visible';
    this.scrollingElement = new FakeElement();
    this.elements = new Map([
      ['#sign-in-view', new FakeElement()],
      ['#app-shell', new FakeElement({ hidden: true })],
      ['#app', new FakeElement()],
      ['#sign-in-form', new FakeElement()],
      ['.sign-in__supporting', new FakeElement()],
      ['#sign-in-passphrase', new FakeElement()],
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
      ['#fitness-dashboard', new FakeElement({ hidden: true })],
      ['#body-dashboard', new FakeElement({ hidden: true })],
      ['#body-bloods-dashboard', new FakeElement({ hidden: true })],
      ['#body-medical-dashboard', new FakeElement({ hidden: true })],
      ['#unavailable-panel', new FakeElement({ hidden: true })],
      ['#retry-button', new FakeElement()],
      ['#page-eyebrow', new FakeElement()],
      ['#page-title', new FakeElement()],
      ['main', new FakeElement()]
    ]);
    this.medicalNav = new FakeElement();
    this.medicalNav.dataset.section = 'body-medical';
  }
  querySelector(selector) { return this.elements.get(selector) ?? null; }
  querySelectorAll(selector) {
    if (selector === '[data-section]') return [this.medicalNav];
    if (selector === '[data-section="body-medical"]') return [this.medicalNav];
    return [];
  }
}

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
}

const GP_EVENT = {
  path: 'data/body/2026/10/2026-10-06-medical-gp-0900.md',
  sha: 'a'.repeat(40),
  body: 'Check-in',
  record: {
    schema_version: 1,
    id: 'med-gp-1',
    type: 'medical',
    date: '2026-10-06',
    time: '09:00',
    title: 'GP',
    record_type: 'Appointment',
    lane: 'appointment'
  }
};

test('source: medical logging applies the record instead of force-refreshing the app', () => {
  const main = readFileSync(join(rootDir, 'apps/life/js/app/main.js'), 'utf8');
  const start = main.indexOf('const medicalController');
  const end = main.indexOf('controller = createAppController');
  assert.ok(start >= 0 && end > start);
  const block = main.slice(start, end);
  assert.match(block, /applyLoggedEvent/);
  assert.doesNotMatch(block, /notifyLogged/);
});

test('applyLoggedEvent paints the new medical card without a live sync', async () => {
  const root = new FakeDocument();
  const calls = { home: 0, medical: 0, syncs: 0, lastMedical: null };
  const controller = createAppController({
    root,
    windowTarget: Object.assign(new EventTarget(), { location: { hostname: '', hash: '#/body-medical' } }),
    documentTarget: root,
    navigatorTarget: { onLine: true },
    sessionStorage: memoryStorage({ 'life-hub:session-expiry': EXPIRY }),
    localStorage: memoryStorage(),
    now: () => new Date(NOW),
    setIntervalImpl: () => 1,
    clearIntervalImpl() {},
    setTimeoutImpl: () => 1,
    clearTimeoutImpl() {},
    sessionApi: {
      async getSession() { return { authenticated: true, expiresAt: EXPIRY }; },
      async signIn() { return { authenticated: true, expiresAt: EXPIRY }; },
      async signOut() {}
    },
    cache: { async clear() {}, async read() { return null; } },
    async loadLive() {
      calls.syncs += 1;
      return {
        events: [],
        targetsConfig: {},
        warnings: [],
        commitSha: 'b'.repeat(40),
        changed: true,
        freshness: 'confirmed'
      };
    },
    async loadCached() { throw new Error('unused'); },
    buildHomeModel: input => ({ date: input.date }),
    renderHome() {
      calls.home += 1;
      root.querySelector('#home-dashboard').hidden = false;
    },
    renderWarnings() {},
    renderUnavailable() {},
    renderMedical(_root, model) {
      calls.medical += 1;
      calls.lastMedical = model;
      root.querySelector('#body-medical-dashboard').hidden = false;
    },
    medicalController: createMedicalController({ getDate: () => '2026-10-06' })
  });

  await controller.start();
  assert.equal(controller.getCurrentSection(), 'body-medical');
  const homeAfterStart = calls.home;
  const syncsAfterStart = calls.syncs;
  const medicalAfterStart = calls.medical;
  assert.ok(medicalAfterStart >= 1);

  controller.applyLoggedEvent(GP_EVENT);

  assert.equal(calls.syncs, syncsAfterStart, 'must not kick a whole-app live sync');
  assert.equal(calls.home, homeAfterStart, 'must not rebuild Home');
  assert.ok(calls.medical > medicalAfterStart);
  assert.equal(root.querySelector('#home-dashboard').hidden, true);
  assert.equal(root.querySelector('#body-medical-dashboard').hidden, false);
  assert.equal(calls.lastMedical.visits.some(visit => visit.title === 'GP' && visit.id === 'med-gp-1'), true);
});

test('saving a new visit through the medical controller live-applies the card', async () => {
  const root = new FakeDocument();
  const calls = { home: 0, medical: 0, syncs: 0, lastMedical: null };
  let app;
  const medicalController = createMedicalController({
    chatApi: {
      async confirm() {
        return {
          path: GP_EVENT.path,
          sha: GP_EVENT.sha,
          record: GP_EVENT.record,
          notes: 'Check-in'
        };
      }
    },
    getDate: () => '2026-10-06',
    isOnline: () => true,
    onRecordWritten: event => app.applyLoggedEvent(event)
  });
  app = createAppController({
    root,
    windowTarget: Object.assign(new EventTarget(), { location: { hostname: '', hash: '#/body-medical' } }),
    documentTarget: root,
    navigatorTarget: { onLine: true },
    sessionStorage: memoryStorage({ 'life-hub:session-expiry': EXPIRY }),
    localStorage: memoryStorage(),
    now: () => new Date(NOW),
    setIntervalImpl: () => 1,
    clearIntervalImpl() {},
    setTimeoutImpl: () => 1,
    clearTimeoutImpl() {},
    sessionApi: {
      async getSession() { return { authenticated: true, expiresAt: EXPIRY }; },
      async signIn() { return { authenticated: true, expiresAt: EXPIRY }; },
      async signOut() {}
    },
    cache: { async clear() {}, async read() { return null; } },
    async loadLive() {
      calls.syncs += 1;
      return {
        events: [],
        targetsConfig: {},
        warnings: [],
        commitSha: 'b'.repeat(40),
        changed: true,
        freshness: 'confirmed'
      };
    },
    async loadCached() { throw new Error('unused'); },
    buildHomeModel: input => ({ date: input.date }),
    renderHome() {
      calls.home += 1;
      root.querySelector('#home-dashboard').hidden = false;
    },
    renderWarnings() {},
    renderUnavailable() {},
    renderMedical(_root, model) {
      calls.medical += 1;
      calls.lastMedical = model;
      root.querySelector('#body-medical-dashboard').hidden = false;
    },
    medicalController
  });

  await app.start();
  const homeAfterStart = calls.home;
  const syncsAfterStart = calls.syncs;
  const hooks = medicalController.hooks(() => {});
  hooks.onAdd();
  await hooks.onSave({ title: 'GP', date: '2026-10-06', record_type: 'Appointment', notes: 'Check-in' });

  assert.equal(calls.syncs, syncsAfterStart);
  assert.equal(calls.home, homeAfterStart);
  assert.equal(root.querySelector('#home-dashboard').hidden, true);
  assert.equal(calls.lastMedical.visits.some(visit => visit.title === 'GP'), true);
  assert.equal(calls.lastMedical.selected?.id, 'med-gp-1');
});

test('createMedicalController selects the saved record id for a new visit', async () => {
  const controller = createMedicalController({
    chatApi: {
      async confirm() {
        return {
          path: GP_EVENT.path,
          record: GP_EVENT.record,
          notes: 'Check-in'
        };
      }
    },
    getDate: () => '2026-10-06',
    isOnline: () => true
  });
  const hooks = controller.hooks(() => {});
  hooks.onAdd();
  await hooks.onSave({ title: 'GP', date: '2026-10-06', record_type: 'Appointment', notes: 'Check-in' });
  assert.equal(controller.filters().selectedId, 'med-gp-1');
  assert.equal(controller.view().mode, 'read');
});
