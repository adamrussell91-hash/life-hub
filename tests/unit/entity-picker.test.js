import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { createEntityPicker } from '../../packages/design-kit/js/entity-picker.js';
import { createEntityChipList, renderEntityChips } from '../../packages/design-kit/js/entity-chips.js';
import { renderRelationshipTimeline } from '../../packages/design-kit/js/relationship-timeline.js';

function setupDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.HTMLElement = dom.window.HTMLElement;
  globalThis.Event = dom.window.Event;
  return dom;
}

test('entity picker debounces, aborts prior search, and ignores stale responses', async () => {
  setupDom();
  const input = document.createElement('input');
  document.body.append(input);
  const calls = [];
  let resolveFirst;
  const firstPromise = new Promise((resolve) => {
    resolveFirst = resolve;
  });
  const search = async (query, signal) => {
    calls.push({ query, signal });
    if (calls.length === 1) {
      await firstPromise;
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      return [{ ref: 'shared:person:a', kind: 'person', display_label: 'Stale' }];
    }
    return [{ ref: 'shared:person:b', kind: 'person', display_label: 'Fresh' }];
  };
  const selected = [];
  const picker = createEntityPicker({
    input,
    search,
    allowedKinds: ['person'],
    onSelect: (item) => selected.push(item),
    debounceMs: 150
  });
  document.body.append(picker.root);

  input.value = '@Se';
  input.selectionStart = input.value.length;
  input.dispatchEvent(new Event('input'));
  await new Promise((r) => setTimeout(r, 160));
  input.value = '@Set';
  input.selectionStart = input.value.length;
  input.dispatchEvent(new Event('input'));
  await new Promise((r) => setTimeout(r, 160));
  resolveFirst();
  await new Promise((r) => setTimeout(r, 20));

  assert.equal(calls.length >= 2, true);
  assert.equal(calls[0].signal.aborted, true);
  assert.match(picker.root.textContent, /Fresh/);
  assert.equal(picker.root.textContent.includes('Stale'), false);
});

test('entity picker supports keyboard selection and Escape close', async () => {
  setupDom();
  const input = document.createElement('input');
  document.body.append(input);
  const selected = [];
  const picker = createEntityPicker({
    input,
    debounceMs: 150,
    search: async () => [
      { ref: 'shared:person:1', kind: 'person', display_label: 'Seth Example' },
      { ref: 'shared:person:2', kind: 'person', display_label: 'Sam Example' }
    ],
    onSelect: (item) => selected.push(item)
  });
  document.body.append(picker.root);
  input.value = '@Se';
  input.selectionStart = 3;
  input.dispatchEvent(new Event('input'));
  await new Promise((r) => setTimeout(r, 160));
  assert.equal(picker.isOpen, true);
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  assert.equal(selected[0].display_label, 'Sam Example');
  assert.equal(picker.isOpen, false);

  input.value = '@Se';
  input.selectionStart = 3;
  input.dispatchEvent(new Event('input'));
  await new Promise((r) => setTimeout(r, 160));
  input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(picker.isOpen, false);
});

test('entity chips retain refs and pending removal does not silently drop saved chips', () => {
  setupDom();
  const container = document.createElement('div');
  document.body.append(container);
  const removed = [];
  const ended = [];
  const list = createEntityChipList({
    container,
    chips: [
      {
        id: 'saved:1',
        ref: 'shared:person:1',
        label: 'Seth',
        relationshipType: 'recipient',
        state: 'saved'
      }
    ],
    onRemovePending: (chip) => removed.push(chip),
    onEndSaved: (chip) => ended.push(chip)
  });
  list.addPending({
    id: 'pending:2',
    ref: 'shared:person:2',
    label: 'Sam',
    relationshipType: 'recipient',
    state: 'pending'
  });
  assert.equal(container.querySelectorAll('.entity-chip').length, 2);
  container.querySelector('.entity-chip--pending .entity-chip__action').click();
  assert.equal(removed.length, 1);
  assert.equal(container.querySelectorAll('.entity-chip--saved').length, 1);
  container.querySelector('.entity-chip--saved .entity-chip__action').click();
  assert.equal(ended.length, 1);
  assert.equal(container.querySelectorAll('.entity-chip--saved').length, 1);
});

test('relationship timeline preserves server order within a year', () => {
  setupDom();
  const container = document.createElement('div');
  document.body.append(container);
  renderRelationshipTimeline(container, [
    {
      id: '1',
      kind: 'point',
      date: '2026-06-01T00:00:00.000Z',
      end_date: null,
      label: 'First',
      context_key: null,
      source_ref: 'a',
      href: null
    },
    {
      id: '2',
      kind: 'point',
      date: '2026-05-01T00:00:00.000Z',
      end_date: null,
      label: 'Second',
      context_key: null,
      source_ref: 'a',
      href: null
    }
  ]);
  const labels = [...container.querySelectorAll('.relationship-timeline__label')].map(
    (node) => node.textContent
  );
  assert.deepEqual(labels, ['First', 'Second']);
});

test('renderEntityChips never invents StudentReference offerings', () => {
  setupDom();
  const container = document.createElement('div');
  renderEntityChips({
    container,
    chips: [
      {
        id: '1',
        ref: 'shared:person:1',
        label: 'Seth',
        state: 'pending',
        relationshipType: 'recipient'
      }
    ]
  });
  assert.equal(container.textContent.includes('student'), false);
});
