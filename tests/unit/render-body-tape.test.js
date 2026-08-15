import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBody } from '../../js/app/render-body.js';

class FakeClassList {
  constructor(owner) { this.owner = owner; }
  get tokens() { return (this.owner.className || '').split(/\s+/).filter(Boolean); }
  contains(name) { return this.tokens.includes(name); }
  add(name) {
    if (!this.contains(name)) this.owner.className = [...this.tokens, name].join(' ');
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

function el() {
  const node = {
    className: '',
    textContent: '',
    dataset: {},
    children: [],
    style: {},
    attributes: {},
    listeners: [],
    classList: null,
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = [...nodes]; },
    addEventListener(type, fn) { this.listeners.push([type, fn]); },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    removeAttribute(name) { delete this.attributes[name]; },
    querySelector(selector) {
      return findAll(this, selector)[0] ?? null;
    },
    querySelectorAll(selector) {
      return findAll(this, selector);
    }
  };
  node.classList = new FakeClassList(node);
  return node;
}

function matches(node, selector) {
  if (selector.startsWith('.')) {
    return node.classList.contains(selector.slice(1).split('.')[0])
      && selector.split('.').slice(1).every(part => !part || node.classList.contains(part));
  }
  if (selector.startsWith('#')) return node.id === selector.slice(1);
  return false;
}

function findAll(node, selector) {
  const found = [];
  for (const child of node.children ?? []) {
    if (matches(child, selector)) found.push(child);
    found.push(...findAll(child, selector));
  }
  return found;
}

function findByClass(node, className) {
  if (node.classList?.contains(className)) return node;
  for (const child of node.children ?? []) {
    const hit = findByClass(child, className);
    if (hit) return hit;
  }
  return null;
}

const emptySection = (id, title) => ({ id, title, metrics: [] });

function tapeMetric(site, label, sideHint) {
  return {
    empty: false,
    key: site,
    site,
    label,
    current: 40,
    lastDelta: 0.5,
    overallDelta: 1,
    lastColour: 'green',
    overallColour: 'green',
    history: [{ date: '2026-08-01', value: 40, pct: null }],
    sideHint
  };
}

test('tape labels live in side rails beside the diagram, not over the image', () => {
  const dashboard = el();
  const host = el();
  const ranges = el();
  ranges.querySelectorAll = () => [];
  const root = {
    createElement: () => el(),
    querySelector(selector) {
      if (selector === '#body-dashboard') return dashboard;
      if (selector === '#body-sections') return host;
      if (selector === '#body-range-control') return ranges;
      return null;
    }
  };

  renderBody(root, {
    range: 'six_month',
    scale: emptySection('scale', 'Scale'),
    composition: emptySection('composition', 'Composition'),
    tape: {
      id: 'tape',
      title: 'Tape',
      metrics: [
        tapeMetric('neck', 'Neck'),
        tapeMetric('shoulders', 'Shoulders'),
        tapeMetric('chest', 'Chest')
      ]
    }
  });

  const tape = findByClass(host, 'body-tape');
  const img = findByClass(tape, 'body-figure__img');
  const figure = findByClass(tape, 'body-figure');
  const left = findByClass(tape, 'body-figure__rail--left');
  const right = findByClass(tape, 'body-figure__rail--right');

  assert.ok(tape);
  assert.ok(img);
  assert.ok(left);
  assert.ok(right);
  assert.equal(figure.children.includes(img), true);
  assert.equal(figure.children.some(child => String(child.className).includes('label')), false);
  assert.ok(left.children.some(child => child.dataset.site === 'neck'));
  assert.ok(left.children.some(child => child.dataset.site === 'chest'));
  assert.ok(right.children.some(child => child.dataset.site === 'shoulders'));
  const historyDate = findByClass(tape, 'body-tape-history__date');
  assert.equal(historyDate?.textContent, '01/08/26');
});

test('a quiet body rerender reuses the tape diagram image node', () => {
  const dashboard = el();
  const host = el();
  const ranges = el();
  ranges.querySelectorAll = () => [];
  const root = {
    createElement: () => el(),
    querySelector(selector) {
      if (selector === '#body-dashboard') return dashboard;
      if (selector === '#body-sections') return host;
      if (selector === '#body-range-control') return ranges;
      return null;
    }
  };
  const model = {
    range: 'six_month',
    scale: emptySection('scale', 'Scale'),
    composition: emptySection('composition', 'Composition'),
    tape: {
      id: 'tape',
      title: 'Tape',
      metrics: [tapeMetric('neck', 'Neck')]
    }
  };

  renderBody(root, model);
  const firstImg = findByClass(host, 'body-figure__img');
  assert.ok(firstImg);

  renderBody(root, model, { quiet: true });
  const secondImg = findByClass(host, 'body-figure__img');
  assert.equal(secondImg, firstImg);
});
