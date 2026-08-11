import test from 'node:test';
import assert from 'node:assert/strict';
import { renderGovernance } from '../../js/app/render-governance.js';
import { appendGovernanceEntry, emptyGovernanceLog } from '../../js/core/governance-log.js';

class FakeElement {
  constructor(tag) {
    this.tagName = tag;
    this.className = '';
    this.dataset = {};
    this._textContent = '';
    this.children = [];
    this.attributes = {};
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

  querySelector(selector) {
    for (const child of this.children) {
      if (matches(child, selector)) return child;
      const nested = child.querySelector?.(selector);
      if (nested) return nested;
    }
    return null;
  }
}

function matches(el, selector) {
  if (!el?.dataset) return false;
  const dataMatch = selector.match(/^\[data-([a-z-]+)(?:="([^"]+)")?\]$/);
  if (!dataMatch) return false;
  const key = dataMatch[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  if (dataMatch[2]) return el.dataset[key] === dataMatch[2];
  return el.dataset[key] !== undefined;
}

function fakeRoot(markdown) {
  const container = new FakeElement('div');
  container.dataset.centralNode = 'governance-log';
  const root = {
    createElement: tag => new FakeElement(tag),
    querySelector: selector => (matches(container, selector) ? container : null)
  };
  return { root, container, markdown };
}

test('renderGovernance shows an empty-state when the log is absent or empty', () => {
  const { root, container } = fakeRoot();
  renderGovernance(root, null);
  assert.equal(container.children.length, 1);
  assert.match(container.textContent, /No governance entries yet/);

  renderGovernance(root, emptyGovernanceLog());
  assert.match(container.textContent, /No governance entries yet/);
});

test('renderGovernance renders dated entry blocks with status badges', () => {
  const log = appendGovernanceEntry(emptyGovernanceLog(), {
    dateKey: '2026-08-09',
    entryType: 'Drift Detection',
    title: 'Life worth enjoying',
    status: 'Still Active',
    body: 'Stalled sleep goal.'
  });
  const { root, container } = fakeRoot();
  renderGovernance(root, log);

  assert.equal(container.children.length, 1);
  const entry = container.children[0];
  assert.equal(entry.className, 'governance-entry');
  assert.match(entry.textContent, /2026-08-09/);
  assert.match(entry.textContent, /Drift Detection/);
  assert.match(entry.textContent, /Life worth enjoying/);
  assert.match(entry.textContent, /Still Active/);
  assert.match(entry.textContent, /Stalled sleep goal/);
});
