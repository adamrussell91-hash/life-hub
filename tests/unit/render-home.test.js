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
    this.onclick = null;
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  removeAttribute(name) {
    delete this.attributes[name];
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  querySelector(selector) {
    return this.nodes?.get(selector) ?? null;
  }

  replaceChildren() {}
}

class FakeDocument {
  constructor() {
    this.app = new FakeElement();
    this.home = new FakeElement();
    this.home.className = 'dashboard';
    this.openBody = new FakeElement();
    this.asLogged = pathHost();
    this.onPlan = pathHost();
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
      ['[data-value="sync"]', new FakeElement()],
      ['[data-home="paths-headline"]', new FakeElement()],
      ['[data-home="paths-detail"]', new FakeElement()],
      ['[data-home-path="as_logged"]', this.asLogged],
      ['[data-home-path="on_plan"]', this.onPlan],
      ['[data-home="stimulus-rate"]', new FakeElement()],
      ['[data-home="stimulus-detail"]', new FakeElement()],
      ['[data-home="stimulus-gate"]', new FakeElement()],
      ['[data-home="scale-headline"]', new FakeElement()],
      ['[data-home="scale-detail"]', new FakeElement()],
      ['[data-home="open-body"]', this.openBody],
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

function pathHost() {
  const host = new FakeElement();
  host.nodes = new Map([
    ['[data-home-path-status]', Object.assign(new FakeElement(), { dataset: { status: 'locked' } })],
    ['[data-home-path-main]', new FakeElement()],
    ['[data-home-path-detail]', new FakeElement()]
  ]);
  return host;
}

const baseModel = {
  date: '2026-07-30',
  nutrition: { calories: 800, protein_g: 40, fat_g: 55 },
  targets: { calories: 1900, protein_g: 120, fat_ceiling_g: 50 },
  dayType: 'movement',
  progress: { calories: 42, protein: 33, fat: 110 },
  overFatCeiling: true,
  forecastCards: {
    paths: {
      headline: 'As logged versus on plan.',
      detail: 'Independent clocks.',
      asLogged: { status: 'locked', main: 'Date locked', detail: 'Need more readings.' },
      onPlan: { status: 'dated', main: '01/10/26', detail: 'Weight is binding.' }
    },
    stimulus: {
      rate: '2/week loaded',
      detail: '10 upper-body loaded sets/week.',
      gate: 'Preservation gate met for the on-plan scenario.'
    },
    scale: {
      headline: '88 kg · 6 kg to enter 78–82 kg',
      detail: '8 points to enter 8–10% fat.'
    }
  }
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

test('renderHome paints forecast pulse cards and opens Body', () => {
  const root = new FakeDocument();
  const opened = [];
  renderHome(root, baseModel, { onOpenSection: section => opened.push(section) });
  assert.equal(root.nodes.get('[data-home="paths-headline"]').textContent, 'As logged versus on plan.');
  assert.equal(root.asLogged.querySelector('[data-home-path-main]').textContent, 'Date locked');
  assert.equal(root.onPlan.querySelector('[data-home-path-main]').textContent, '01/10/26');
  assert.equal(root.onPlan.querySelector('[data-home-path-status]').dataset.status, 'dated');
  assert.equal(root.nodes.get('[data-home="stimulus-rate"]').textContent, '2/week loaded');
  assert.equal(root.nodes.get('[data-home="scale-headline"]').textContent, '88 kg · 6 kg to enter 78–82 kg');
  root.openBody.onclick();
  assert.deepEqual(opened, ['body']);
});
