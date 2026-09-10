import test from 'node:test';
import assert from 'node:assert/strict';
import { renderGovernance } from '../../apps/life/js/app/render-governance.js';
import { appendGovernanceEntry, emptyGovernanceLog } from '../../apps/life/js/core/governance-log.js';

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
  renderGovernance(root, log, { today: '2026-08-11' });

  assert.equal(container.children.length, 1);
  const entry = container.children[0];
  assert.equal(entry.className, 'governance-entry');
  assert.match(entry.textContent, /2026-08-09/);
  assert.match(entry.textContent, /Drift Detection/);
  assert.match(entry.textContent, /2d open/);
  assert.match(entry.textContent, /Life worth enjoying/);
  assert.match(entry.textContent, /Still Active/);
  assert.match(entry.textContent, /Stalled sleep goal/);
});

test('renderGovernance does not age Mind Insights or Weekly Reviews as open loops', () => {
  let log = emptyGovernanceLog();
  log = appendGovernanceEntry(log, {
    dateKey: '2026-03-10',
    entryType: 'Mind Insight',
    title: 'Mar 2026 — Pattern Review: First Year',
    body: 'Historical synthesis.'
  });
  log = appendGovernanceEntry(log, {
    dateKey: '2026-08-09',
    entryType: 'Weekly Review',
    title: 'Lock is marking',
    body: 'Protein held.'
  });
  const { root, container } = fakeRoot();
  renderGovernance(root, log, { today: '2026-09-06' });
  assert.match(container.textContent, /Pattern Review: First Year/);
  assert.match(container.textContent, /Weekly Review/);
  assert.doesNotMatch(container.textContent, /d open/);
});

test('renderGovernance shows Chosen, Reasoning, and Revisit on decision records', () => {
  const log = appendGovernanceEntry(emptyGovernanceLog(), {
    dateKey: '2026-09-05',
    entryType: 'Capability Action',
    title: 'Open a tracker',
    status: 'Resolved',
    chosen: 'Approved',
    reasoning: 'Keep the week honest',
    revisit: '2026-09-12',
    body: 'Wrote the challenge file'
  });
  const { root, container } = fakeRoot();
  renderGovernance(root, log, { today: '2026-09-05' });
  assert.match(container.textContent, /Chosen: Approved/);
  assert.match(container.textContent, /Reasoning: Keep the week honest/);
  assert.match(container.textContent, /Revisit: 12\/09\/26/);
});

test('renderGovernance shows decision fields and a same-title timeline', () => {
  let log = emptyGovernanceLog();
  log = appendGovernanceEntry(log, {
    dateKey: '2026-09-06',
    entryType: 'Major Decision',
    title: 'MEd load',
    chosen: 'Drop one elective',
    reasoning: 'Teaching clash',
    revisit: '2026-10-01',
    body: 'Later take.'
  });
  log = appendGovernanceEntry(log, {
    dateKey: '2026-08-01',
    entryType: 'Major Decision',
    title: 'MEd load',
    chosen: 'Take both units',
    body: 'First take.'
  });
  const { root, container } = fakeRoot();
  renderGovernance(root, log, { today: '2026-09-06' });
  assert.match(container.textContent, /How this changed/);
  assert.match(container.textContent, /Take both units/);
  assert.match(container.textContent, /Drop one elective/);
  assert.match(container.textContent, /Teaching clash/);
  assert.match(container.textContent, /01\/10\/26/);
});
