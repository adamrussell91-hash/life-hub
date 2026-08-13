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
  const tile = host.children.at(-1);
  assert.match(String(tile.textContent), /View bloods/);
  const button = tile.listeners?.length
    ? tile
    : tile.children.find(child => child.listeners?.length);
  assert.ok(button, 'expected a clickable View bloods control');
  button.listeners[0][1]();
  assert.equal(viewed, true);
});
