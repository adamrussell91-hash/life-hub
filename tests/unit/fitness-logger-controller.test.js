import test from 'node:test';
import assert from 'node:assert/strict';
import { createFitnessLoggerController } from '../../js/app/fitness-logger-controller.js';

class FakeEl {
  constructor(tag = 'div') {
    this.tagName = tag;
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.textContent = '';
    this.value = '';
    this.disabled = false;
    this.hidden = false;
    this.className = '';
    this.listeners = new Map();
  }
  append(...nodes) { for (const n of nodes) this.children.push(n); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(name, value) { this.attributes.set(name, value); this.hidden = name === 'hidden'; }
  removeAttribute(name) { this.attributes.delete(name); if (name === 'hidden') this.hidden = false; }
  querySelector() { return null; }
  addEventListener(type, fn) {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }
}

class FakeRoot {
  constructor() {
    this.logger = new FakeEl('div');
    this.logger.id = 'fitness-logger';
    this.elements = new Map([['#fitness-logger', this.logger]]);
  }
  querySelector(sel) { return this.elements.get(sel) ?? null; }
  createElement(tag) { return new FakeEl(tag); }
}

const session = () => ({
  type: 'workout',
  date: '2026-08-05',
  title: 'Chest and Curls',
  session_kind: 'strength',
  day_type: 'workout_30',
  status: 'planned',
  focus: ['chest'],
  recovery_flag_next_day: false,
  pain_flags: [],
  path: 'data/fitness/2026/08/2026-08-05-chest-and-curls.md',
  notes: '',
  exercises: [{ name: 'Bench', sets: [{ reps: 8, weight_kg: 36, cable_type: 'constant_force' }] }]
});

test('finish confirms completed overwrite and clears the draft', async () => {
  const confirms = [];
  const store = new Map();
  const storage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
    removeItem: key => store.delete(key)
  };
  const root = new FakeRoot();
  const written = [];
  const controller = createFitnessLoggerController({
    root,
    storage,
    documentTarget: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    setIntervalImpl: () => 1,
    clearIntervalImpl() {},
    setTimeoutImpl: () => 1,
    clearTimeoutImpl() {},
    chatApi: {
      async confirm(payload) {
        confirms.push(payload);
        return { path: session().path };
      }
    },
    onSessionWritten: result => written.push(result),
    isOnline: () => true,
    idleMs: 60_000
  });

  controller.mount(session());
  assert.ok(controller.getDraft());
  await controller.finish();

  assert.equal(confirms.length, 1);
  assert.equal(confirms[0].overwrite, true);
  assert.equal(confirms[0].candidate.fields.status, 'completed');
  assert.equal(written.length, 1);
  assert.equal(controller.getDraft(), null);
  controller.destroy();
});

test('autosave sends planned overwrite when the draft changed', async () => {
  const confirms = [];
  const root = new FakeRoot();
  const controller = createFitnessLoggerController({
    root,
    storage: {
      getItem: () => null,
      setItem() {},
      removeItem() {}
    },
    documentTarget: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    setIntervalImpl: () => 1,
    clearIntervalImpl() {},
    setTimeoutImpl: () => 1,
    clearTimeoutImpl() {},
    chatApi: {
      async confirm(payload) {
        confirms.push(payload);
        return {};
      }
    },
    isOnline: () => true,
    idleMs: 60_000
  });

  controller.mount(session());
  const draft = controller.getDraft();
  draft.exercises[0].sets[0].weight_kg = 40;
  await controller.flushAutosave();

  assert.equal(confirms.length, 1);
  assert.equal(confirms[0].candidate.fields.status, 'planned');
  assert.equal(confirms[0].candidate.fields.exercises[0].sets[0].weight_kg, 40);
  controller.destroy();
});
