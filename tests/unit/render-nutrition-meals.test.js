import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMealBreakdown } from '../../js/app/render-nutrition.js';

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this.className = '';
    this.dataset = {};
    this._textContent = '';
    this.children = [];
    this.hidden = false;
  }

  set textContent(value) {
    this._textContent = value;
    this.children = [];
  }

  get textContent() {
    if (this.children.length) return this.children.map(child => child.textContent).join('');
    return this._textContent;
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes) {
    this.children = [...nodes];
  }

  setAttribute(name, value) {
    if (name === 'hidden') this.hidden = true;
  }

  removeAttribute(name) {
    if (name === 'hidden') this.hidden = false;
  }
}

function fakeMealBreakdownRoot() {
  const dl = new FakeElement('dl');
  const empty = new FakeElement('p');
  empty.textContent = 'No meals logged yet.';
  empty.hidden = true;
  return {
    createElement: tag => new FakeElement(tag),
    querySelector(selector) {
      if (selector === '.meal-breakdown') return dl;
      if (selector === '[data-meal-breakdown-empty]') return empty;
      return null;
    },
    _dl: dl,
    _empty: empty
  };
}

test('renderMealBreakdown lists only slots with protein_g > 0', () => {
  const root = fakeMealBreakdownRoot();
  renderMealBreakdown(root, {
    breakfast: { protein_g: 38 },
    lunch: { protein_g: 42 },
    dinner: { protein_g: 0 },
    snack: { protein_g: 0 }
  });

  const text = root._dl.textContent;
  assert.match(text, /Breakfast/);
  assert.match(text, /38 g/);
  assert.match(text, /Lunch/);
  assert.match(text, /42 g/);
  assert.equal(text.includes('Dinner'), false);
  assert.equal(text.includes('Snack'), false);
  assert.equal(text.includes('0 g'), false);
  assert.equal(root._dl.hidden, false);
  assert.equal(root._empty.hidden, true);
});

test('renderMealBreakdown shows empty state and hides the list when no meals have protein', () => {
  const root = fakeMealBreakdownRoot();
  renderMealBreakdown(root, {
    breakfast: { protein_g: 0 },
    lunch: { protein_g: 0 },
    dinner: { protein_g: 0 },
    snack: { protein_g: 0 }
  });

  assert.equal(root._dl.children.length, 0);
  assert.equal(root._dl.hidden, true);
  assert.equal(root._empty.hidden, false);
  assert.match(root._empty.textContent, /No meals logged yet\./);
});

test('renderMealBreakdown treats a missing meals object as empty', () => {
  const root = fakeMealBreakdownRoot();
  renderMealBreakdown(root, undefined);

  assert.equal(root._dl.children.length, 0);
  assert.equal(root._empty.hidden, false);
});

test('renderMealBreakdown re-renders cleanly on repeated calls', () => {
  const root = fakeMealBreakdownRoot();
  renderMealBreakdown(root, { breakfast: { protein_g: 20 } });
  renderMealBreakdown(root, { dinner: { protein_g: 55 } });

  const text = root._dl.textContent;
  assert.equal(text.includes('Breakfast'), false);
  assert.match(text, /Dinner/);
  assert.match(text, /55 g/);
});
