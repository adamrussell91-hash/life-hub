import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBody } from '../../js/app/render-body.js';

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

test('body fat and skeletal muscle charts sit side by side', () => {
  const host = renderComposition([
    metric('body_fat_pct', 'Body fat'),
    metric('skeletal_muscle_kg', 'Skeletal muscle')
  ]);
  const composition = host.children.find(child => child.dataset.bodySection === 'composition');
  const pair = findByClass(composition, 'body-metrics--pair');
  assert.ok(pair, 'expected a side-by-side composition row');
  const blocks = pair.children.filter(child => child.classList.contains('body-metric'));
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].children[0]?.children[0]?.textContent, 'Body fat');
  assert.equal(blocks[1].children[0]?.children[0]?.textContent, 'Skeletal muscle');
});
