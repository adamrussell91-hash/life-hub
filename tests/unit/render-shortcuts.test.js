import test from 'node:test';
import assert from 'node:assert/strict';
import { renderShortcuts } from '../../apps/life/js/app/render-shortcuts.js';

function host() {
  const nodes = new Map();
  const create = (name) => {
    const children = [];
    const node = {
      name,
      className: '',
      textContent: '',
      hidden: false,
      attributes: {},
      children,
      listeners: [],
      setAttribute(key, value) { this.attributes[key] = value; },
      replaceChildren(...next) { children.splice(0, children.length, ...next); },
      append(...next) { children.push(...next); },
      addEventListener(type, fn) { this.listeners.push([type, fn]); }
    };
    return node;
  };
  const promoted = create('div');
  const catalog = create('div');
  const confirm = create('div');
  const dashboard = create('section');
  nodes.set('#shortcuts-dashboard', dashboard);
  nodes.set('[data-shortcuts="promoted"]', promoted);
  nodes.set('[data-shortcuts="catalog"]', catalog);
  nodes.set('[data-shortcuts="confirm"]', confirm);
  return {
    promoted,
    catalog,
    confirm,
    dashboard,
    createElement: create,
    querySelector(selector) { return nodes.get(selector) ?? null; }
  };
}

test('renderShortcuts lists promoted drafts with a Run button', () => {
  const root = host();
  const runs = [];
  renderShortcuts(root, {
    promoted: [{ proposed_id: 'track.morning-weigh-in', summary: 'Morning weigh-in', write_count: 1 }],
    catalog: [{ id: 'remember.set-week-flag', summary: 'Set a week flag' }],
    onRun: draft => runs.push(draft.proposed_id)
  });
  assert.equal(root.dashboard.hidden, false);
  const promotedRow = root.promoted.children[0].children[0];
  assert.equal(promotedRow.children[0].children[0].textContent, 'track.morning-weigh-in');
  const run = promotedRow.children[1];
  assert.equal(run.textContent, 'Run');
  run.listeners[0][1]();
  assert.deepEqual(runs, ['track.morning-weigh-in']);
  assert.equal(root.catalog.children[0].children[0].children[0].children[0].textContent, 'remember.set-week-flag');
});

test('renderShortcuts shows a Confirm card for a proposal', () => {
  const root = host();
  renderShortcuts(root, {
    catalog: [],
    promoted: [{ proposed_id: 'track.morning-weigh-in', summary: 'Morning weigh-in' }],
    proposal: {
      intent: 'Run promoted shortcut: track.morning-weigh-in',
      writes: [{ path: 'data/challenges/2026-08-31-weigh-in.json' }]
    }
  });
  assert.equal(root.confirm.children[0].className, 'confirm-card');
  assert.match(root.confirm.children[0].children[1].textContent, /track.morning-weigh-in/);
});
