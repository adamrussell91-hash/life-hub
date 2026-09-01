import test from 'node:test';
import assert from 'node:assert/strict';
import { renderHome } from '../../apps/life/js/app/render-home.js';

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this.className = '';
    this.dataset = {};
    this._textContent = '';
    this.children = [];
    this.attributes = {};
    this.style = { setProperty() {} };
  }

  set textContent(value) {
    this._textContent = value;
  }

  get textContent() {
    return this._textContent;
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes) {
    this.children = [...nodes];
  }

  querySelector(selector) {
    for (const child of this.children) {
      if (matches(child, selector)) return child;
      const nested = child.querySelector?.(selector);
      if (nested) return nested;
    }
    return null;
  }

  querySelectorAll() {
    return [];
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }
}

function matches(el, selector) {
  if (!el?.dataset) return false;
  if (selector === '#app') return el.id === 'app';
  if (selector === '#home-dashboard') return el.id === 'home-dashboard';
  if (selector === '.week-strip') return el.className === 'week-strip';
  const dataMatch = selector.match(/^\[data-([a-z-]+)(?:="([^"]+)")?\]$/);
  if (dataMatch) {
    const key = dataMatch[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (dataMatch[2]) return el.dataset[key] === dataMatch[2];
    return el.dataset[key] !== undefined;
  }
  return false;
}

function fakeHomeRoot() {
  const app = new FakeElement('div');
  app.id = 'app';
  const dashboard = new FakeElement('section');
  dashboard.id = 'home-dashboard';
  const hammondLine = new FakeElement('p');
  hammondLine.dataset.value = 'hammond-line';
  hammondLine.setAttribute('hidden', '');
  const weekStrip = new FakeElement('div');
  weekStrip.className = 'week-strip';
  dashboard.append(hammondLine, weekStrip);
  app.append(dashboard);

  const root = {
    createElement: tag => new FakeElement(tag),
    querySelector(selector) {
      if (matches(app, selector)) return app;
      if (matches(dashboard, selector)) return dashboard;
      return app.querySelector(selector);
    },
    querySelectorAll() {
      return [];
    }
  };
  return { root, hammondLine };
}

const baseModel = {
  date: '2026-08-11',
  nutrition: { calories: 0, protein_g: 0, fat_g: 0 },
  targets: { calories: 1600, protein_g: 120, fat_ceiling_g: 50 },
  dayType: 'movement',
  recovery: false,
  workoutStreak: 0,
  completeness: { complete: 0, total: 5 },
  weekDays: [],
  weekSummary: { loggedDays: 0, headline: 'Quiet', detail: 'Nothing yet' },
  overFatCeiling: false,
  progress: { calories: 0, protein: 0, fat: 0, logging: 0 },
  hammondLine: null
};

test('renderHome shows hammondLine and clears hidden when present', () => {
  const { root, hammondLine } = fakeHomeRoot();
  renderHome(root, { ...baseModel, hammondLine: 'Hammond: MEd Sem 2 — 79d open.' });
  assert.equal(hammondLine.textContent, 'Hammond: MEd Sem 2 — 79d open.');
  assert.equal(hammondLine.getAttribute('hidden'), null);
});

test('renderHome hides hammondLine when absent', () => {
  const { root, hammondLine } = fakeHomeRoot();
  hammondLine.removeAttribute('hidden');
  hammondLine.textContent = 'stale';
  renderHome(root, { ...baseModel, hammondLine: null });
  assert.equal(hammondLine.textContent, '');
  assert.equal(hammondLine.getAttribute('hidden'), '');
});
