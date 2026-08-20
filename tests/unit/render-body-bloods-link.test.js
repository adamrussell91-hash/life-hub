import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBody } from '../../js/app/render-body.js';

function el() {
  return {
    className: '',
    textContent: '',
    dataset: {},
    children: [],
    hidden: false,
    attributes: {},
    listeners: [],
    append(...nodes) {
      this.children.push(...nodes);
      const bits = this.children.map(n => n.textContent).filter(Boolean);
      if (bits.length) this.textContent = bits.join('');
    },
    replaceChildren(...nodes) {
      this.children = [...nodes];
      const bits = this.children.map(n => n.textContent).filter(Boolean);
      this.textContent = bits.join('');
    },
    addEventListener(type, fn) { this.listeners.push([type, fn]); },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    removeAttribute(name) { delete this.attributes[name]; if (name === 'hidden') this.hidden = false; },
    querySelectorAll() { return []; }
  };
}

test('renderBody appends a View bloods control that calls onViewBloods', () => {
  const dashboard = el();
  dashboard.id = 'body-dashboard';
  const host = el();
  host.id = 'body-sections';
  const ranges = el();
  ranges.id = 'body-range-control';
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
  let viewed = false;
  const emptySection = { id: 'scale', title: 'Scale', metrics: [] };
  renderBody(root, {
    range: 'six_month',
    scale: { ...emptySection, id: 'scale' },
    composition: { ...emptySection, id: 'composition' },
    tape: { ...emptySection, id: 'tape' }
  }, { onViewBloods: () => { viewed = true; } });
  const tile = findButton(host, /View bloods/);
  assert.ok(tile, 'expected a clickable View bloods control');
  tile.listeners[0][1]();
  assert.equal(viewed, true);
});

test('renderBody appends a View medical control that calls onViewMedical', () => {
  const dashboard = el();
  dashboard.id = 'body-dashboard';
  const host = el();
  host.id = 'body-sections';
  const ranges = el();
  ranges.id = 'body-range-control';
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
  let viewed = false;
  const emptySection = { id: 'scale', title: 'Scale', metrics: [] };
  renderBody(root, {
    range: 'six_month',
    scale: { ...emptySection, id: 'scale' },
    composition: { ...emptySection, id: 'composition' },
    tape: { ...emptySection, id: 'tape' }
  }, { onViewMedical: () => { viewed = true; } });
  const text = host.children.map(child => String(child.textContent)).join(' ');
  assert.match(text, /View medical/);
  const medical = findButton(host, /View medical/);
  assert.ok(medical, 'expected a clickable View medical control');
  medical.listeners[0][1]();
  assert.equal(viewed, true);
});

function findButton(node, pattern) {
  if (pattern.test(String(node.textContent)) && node.listeners?.length) return node;
  for (const child of node.children ?? []) {
    const found = findButton(child, pattern);
    if (found) return found;
  }
  return null;
}
