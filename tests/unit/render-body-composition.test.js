import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBody } from '../../apps/life/js/app/render-body.js';

function el() {
  const node = {
    className: '',
    textContent: '',
    dataset: {},
    children: [],
    style: {},
    attributes: {},
    listeners: [],
    classList: {
      contains(name) {
        return (node.className || '').split(/\s+/).includes(name);
      }
    },
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = [...nodes]; },
    addEventListener(type, fn) { this.listeners.push([type, fn]); },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    removeAttribute(name) { delete this.attributes[name]; },
    querySelectorAll() { return []; }
  };
  return node;
}

function findByClass(node, className) {
  if (node.classList?.contains(className)) return node;
  for (const child of node.children ?? []) {
    const hit = findByClass(child, className);
    if (hit) return hit;
  }
  return null;
}

function textOf(node) {
  return [node.textContent, ...(node.children ?? []).map(textOf)].filter(Boolean).join(' ');
}

function metric(key, label) {
  return {
    empty: false,
    key,
    label,
    latest: { value: 20 },
    series: [],
    primaryGrowth: { colour: 'neutral', label: 'held' },
    secondaryTrend: { colour: 'neutral', label: 'flat', direction: 'flat' }
  };
}

function renderComposition(metrics) {
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
    scale: { id: 'scale', title: 'Scale', metrics: [] },
    composition: { id: 'composition', title: 'Composition', metrics },
    tape: { id: 'tape', title: 'Tape', metrics: [] }
  });
  return host;
}

test('body fat and skeletal muscle are separate cards side by side', () => {
  const host = renderComposition([
    metric('body_fat_pct', 'Body fat'),
    metric('skeletal_muscle_kg', 'Skeletal muscle')
  ]);
  const pair = findByClass(host, 'body-composition-pair');
  assert.ok(pair, 'expected a side-by-side composition pair');
  const cards = pair.children.filter(child => child.classList.contains('metric-card'));
  assert.equal(cards.length, 2);
  assert.equal(cards[0].dataset.bodySection, 'body_fat_pct');
  assert.equal(cards[1].dataset.bodySection, 'skeletal_muscle_kg');
  assert.equal(host.children.some(child => child.dataset.bodySection === 'composition'), false);
  assert.equal(pair.classList.contains('metric-card'), false);
  assert.match(textOf(cards[0]), /Body fat/);
  assert.match(textOf(cards[1]), /Skeletal muscle/);
  assert.doesNotMatch(textOf(host), /Composition/);
});
