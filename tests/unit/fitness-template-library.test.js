import test from 'node:test';
import assert from 'node:assert/strict';
import { createFitnessTemplateLibrary } from '../../apps/life/js/app/fitness-template-library.js';

class FakeEl {
  constructor(tag) {
    this.tagName = tag;
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.textContent = '';
    this.disabled = false;
    this.className = '';
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(k, v) { this.attributes[k] = v; }
  removeAttribute(k) { delete this.attributes[k]; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  querySelector() { return null; }
  showModal() { this.attributes.open = ''; }
  close() { delete this.attributes.open; }
}

class FakeRoot {
  constructor() {
    this.nodes = new Map();
  }
  createElement(tag) {
    const el = new FakeEl(tag);
    el.ownerDocument = this;
    return el;
  }
  querySelector(sel) {
    if (!this.nodes.has(sel)) {
      const el = new FakeEl(sel);
      el.ownerDocument = this;
      this.nodes.set(sel, el);
    }
    return this.nodes.get(sel);
  }
}

test('Use today still works when a completed session already exists today', async () => {
  const root = new FakeRoot();
  const confirms = [];
  const library = createFitnessTemplateLibrary({
    root,
    templatesApi: { list: async () => ({ templates: [], libraryIndex: {} }) },
    chatApi: { confirm: async (payload) => { confirms.push(payload); return { ok: true }; } },
    getFitnessContext: () => ({ date: '2026-08-07', completedToday: true, plannedToday: null, plannedSessions: [] }),
    onPlanned: async () => {}
  });

  library.openTemplate({
    title: 'Evening Walk',
    focus: ['legs'],
    exercises: [{ name: 'Walk', sets: [{ reps: 1, weight_kg: 0, cable_type: 'none' }] }]
  });

  const btn = root.querySelector('#fitness-template-use-today');
  assert.equal(btn.disabled, false);
  assert.match(btn.textContent, /use today/i);
  assert.match(root.querySelector('#fitness-template-sheet-note').textContent, /another session/i);

  await library.useToday();
  assert.equal(confirms.length, 1);
  assert.equal(confirms[0].candidate.fields.title, 'Evening Walk');
  assert.equal(confirms[0].overwrite, false);
  assert.equal(confirms[0].slug, 'workout-evening-walk');
});

test('Use today confirms a planned candidate from the selected template', async () => {
  const root = new FakeRoot();
  const confirms = [];
  const library = createFitnessTemplateLibrary({
    root,
    templatesApi: { list: async () => ({ templates: [], libraryIndex: {} }) },
    chatApi: {
      confirm: async (payload) => {
        confirms.push(payload);
        return { ok: true };
      }
    },
    getFitnessContext: () => ({ date: '2026-08-07', completedToday: false, plannedToday: null, plannedSessions: [] }),
    onPlanned: async () => {}
  });

  library.openTemplate({
    title: 'Chest and Curls',
    session_kind: 'strength',
    day_type: 'workout_45_60',
    focus: ['chest', 'arms'],
    exercises: [{ name: 'Fly', sets: [{ reps: 10, weight_kg: 20, cable_type: 'constant_force' }] }]
  });

  await library.useToday();
  assert.equal(confirms.length, 1);
  assert.equal(confirms[0].candidate.fields.status, 'planned');
  assert.equal(confirms[0].candidate.fields.title, 'Chest and Curls');
  assert.equal(confirms[0].slug, 'workout-chest-and-curls');
  assert.equal(confirms[0].overwrite, false);
});

test('Use today overwrites only when the same titled plan already exists', async () => {
  const root = new FakeRoot();
  const confirms = [];
  const library = createFitnessTemplateLibrary({
    root,
    templatesApi: { list: async () => ({ templates: [], libraryIndex: {} }) },
    chatApi: { confirm: async (payload) => { confirms.push(payload); return { ok: true }; } },
    getFitnessContext: () => ({
      date: '2026-08-07',
      completedToday: false,
      plannedToday: { title: 'Chest and Curls' },
      plannedSessions: [{ title: 'Chest and Curls' }, { title: 'Dog Walk' }]
    }),
    onPlanned: async () => {}
  });

  library.openTemplate({
    title: 'Chest and Curls',
    exercises: [{ name: 'Fly', sets: [{ reps: 10, weight_kg: 20, cable_type: 'constant_force' }] }]
  });
  assert.match(root.querySelector('#fitness-template-use-today').textContent, /update/i);

  await library.useToday();
  assert.equal(confirms[0].overwrite, true);
});
