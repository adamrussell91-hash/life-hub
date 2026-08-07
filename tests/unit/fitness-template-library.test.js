import test from 'node:test';
import assert from 'node:assert/strict';
import { createFitnessTemplateLibrary } from '../../js/app/fitness-template-library.js';

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

test('Use today is disabled when a completed session already exists today', async () => {
  const root = new FakeRoot();
  const confirms = [];
  const library = createFitnessTemplateLibrary({
    root,
    templatesApi: { list: async () => ({ templates: [], libraryIndex: {} }) },
    chatApi: { confirm: async (payload) => { confirms.push(payload); return { ok: true }; } },
    getFitnessContext: () => ({ date: '2026-08-07', completedToday: true, plannedToday: null }),
    onPlanned: async () => {}
  });

  library.openTemplate({
    title: 'Chest and Curls',
    focus: ['chest'],
    exercises: [{ name: 'Fly', sets: [{ reps: 10, weight_kg: 20, cable_type: 'constant_force' }] }]
  });

  const btn = root.querySelector('#fitness-template-use-today');
  assert.equal(btn.disabled, true);
  assert.match(btn.textContent, /already logged/i);

  await library.useToday();
  assert.equal(confirms.length, 0);
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
    getFitnessContext: () => ({ date: '2026-08-07', completedToday: false, plannedToday: null }),
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
  assert.equal(confirms[0].overwrite, false);
});
