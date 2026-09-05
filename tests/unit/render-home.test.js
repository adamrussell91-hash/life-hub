import test from 'node:test';
import assert from 'node:assert/strict';
import { renderHome } from '../../apps/life/js/app/render-home.js';

class FakeClassList {
  constructor(owner) {
    this.owner = owner;
  }

  get tokens() {
    return (this.owner.className || '').split(/\s+/).filter(Boolean);
  }

  contains(name) {
    return this.tokens.includes(name);
  }

  add(name) {
    const tokens = this.tokens;
    if (!tokens.includes(name)) tokens.push(name);
    this.owner.className = tokens.join(' ');
  }

  remove(name) {
    this.owner.className = this.tokens.filter(token => token !== name).join(' ');
  }

  toggle(name, force) {
    const shouldHave = force === undefined ? !this.contains(name) : Boolean(force);
    if (shouldHave) this.add(name); else this.remove(name);
    return shouldHave;
  }
}

class FakeElement {
  constructor() {
    this.className = '';
    this.dataset = {};
    this.attributes = {};
    this.style = { setProperty() {} };
    this.classList = new FakeClassList(this);
    this.textContent = '';
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  replaceChildren() {}
}

class FakeDocument {
  constructor() {
    this.app = new FakeElement();
    this.home = new FakeElement();
    this.home.className = 'dashboard';
    this.nodes = new Map([
      ['#app', this.app],
      ['#home-dashboard', this.home],
      ['[data-value="date"]', new FakeElement()],
      ['[data-value="calories"]', new FakeElement()],
      ['[data-target="calories"]', new FakeElement()],
      ['[data-value="protein"]', new FakeElement()],
      ['[data-target="protein"]', new FakeElement()],
      ['[data-value="fat"]', new FakeElement()],
      ['[data-target="fat"]', new FakeElement()],
      ['[data-value="workout"]', new FakeElement()],
      ['[data-value="workout-state"]', new FakeElement()],
      ['[data-value="streak"]', new FakeElement()],
      ['[data-value="logging"]', new FakeElement()],
      ['[data-value="sync"]', new FakeElement()],
      ['#week-label', new FakeElement()],
      ['[data-week-detail]', new FakeElement()],
      ['.week-strip', new FakeElement()],
      ['[data-progress="logging"]', new FakeElement()],
      ['[data-percent="logging"]', new FakeElement()],
      ['[data-percent="calories"]', new FakeElement()],
      ['[data-percent="protein"]', new FakeElement()],
      ['[data-percent="fat"]', new FakeElement()],
      ['#app-status', new FakeElement()],
      ['#unavailable-panel', new FakeElement()]
    ]);
  }

  querySelector(selector) {
    return this.nodes.get(selector) ?? null;
  }

  createElement() {
    return new FakeElement();
  }
}

const baseModel = {
  date: '2026-07-30',
  nutrition: { calories: 800, protein_g: 40, fat_g: 55 },
  targets: { calories: 1900, protein_g: 120, fat_ceiling_g: 50 },
  dayType: 'movement',
  workoutStreak: 0,
  completeness: { complete: 1, total: 5 },
  weekDays: [],
  weekSummary: { headline: 'Quiet', detail: 'Detail' },
  progress: { calories: 42, protein: 33, fat: 110, logging: 20 },
  overFatCeiling: true
};

test('renderHome adds nutrition--fat-over on Home when over the fat ceiling', () => {
  const root = new FakeDocument();
  renderHome(root, baseModel);
  assert.equal(root.home.classList.contains('nutrition--fat-over'), true);
});

test('renderHome clears nutrition--fat-over when fat is within the ceiling', () => {
  const root = new FakeDocument();
  root.home.classList.add('nutrition--fat-over');
  renderHome(root, { ...baseModel, overFatCeiling: false, nutrition: { ...baseModel.nutrition, fat_g: 27 } });
  assert.equal(root.home.classList.contains('nutrition--fat-over'), false);
});

test('renderHome formats fat grams without float noise', () => {
  const root = new FakeDocument();
  renderHome(root, {
    ...baseModel,
    nutrition: { ...baseModel.nutrition, fat_g: 135.10000000000002, protein_g: 139.7 }
  });
  assert.equal(root.nodes.get('[data-value="fat"]').textContent, '135.1 g');
  assert.equal(root.nodes.get('[data-value="protein"]').textContent, '139.7 g');
});
