import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countByFilterKey,
  countHidden,
  defaultFilterForHub,
  FILTER_CHIPS,
  filterKeyForItem,
  isItemVisible,
  readFilterState,
  writeFilterState
} from '../../packages/design-kit/js/calendar/calendar-filter.js';

test('Life default turns every chip on; Teaching defaults to Classes only', () => {
  const life = defaultFilterForHub('life');
  assert.equal(life.classes, true);
  assert.equal(life.tasks, true);
  assert.equal(life.corey, true);
  const teaching = defaultFilterForHub('teaching');
  assert.equal(teaching.classes, true);
  assert.equal(teaching.events, false);
  assert.equal(teaching.tasks, false);
});

test('filterKeyForItem maps teaching class/event and professional meeting/PD', () => {
  assert.equal(filterKeyForItem({ kind: 'teaching', isClass: true }), 'classes');
  assert.equal(filterKeyForItem({ kind: 'teaching', isClass: false }), 'events');
  assert.equal(filterKeyForItem({ kind: 'professional', source: 'professional_meeting' }), 'meetings');
  assert.equal(filterKeyForItem({ kind: 'professional', source: 'professional_event' }), 'pd');
  assert.equal(filterKeyForItem({ kind: 'task' }), 'tasks');
  assert.equal(filterKeyForItem({ kind: 'study' }), null);
});

test('isItemVisible and countHidden ignore always-on study items', () => {
  const state = defaultFilterForHub('tasks');
  const items = [
    { kind: 'task', id: '1' },
    { kind: 'teaching', isClass: true, id: '2' },
    { kind: 'study', id: '3' }
  ];
  assert.equal(isItemVisible(items[0], state), true);
  assert.equal(isItemVisible(items[1], state), false);
  assert.equal(isItemVisible(items[2], state), true);
  assert.equal(countHidden(items, state), 1);
  assert.equal(countByFilterKey(items).tasks, 1);
  assert.equal(countByFilterKey(items).classes, 1);
});

test('sessionStorage read/write is per hub and survives try/catch failure', () => {
  const store = new Map();
  globalThis.sessionStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key)
  };
  const next = { ...defaultFilterForHub('life'), fitness: false };
  writeFilterState('life', next);
  assert.equal(readFilterState('life').fitness, false);
  assert.equal(readFilterState('teaching').classes, true);
  globalThis.sessionStorage = {
    getItem() {
      throw new Error('blocked');
    },
    setItem() {
      throw new Error('blocked');
    }
  };
  assert.equal(readFilterState('life').classes, true);
  writeFilterState('life', next);
});

test('chips include Comms, Events and Promises for every hub', () => {
  const ids = FILTER_CHIPS.map((chip) => chip.id);
  assert.deepEqual(ids, [
    'classes', 'comms', 'meetings', 'events', 'pd', 'promises', 'tasks', 'health', 'fitness', 'corey'
  ]);
  for (const id of ['comms', 'events', 'promises']) {
    assert.equal(FILTER_CHIPS.find((chip) => chip.id === id).group, 'shared');
  }
});

test('hub defaults: Teaching, Professional and Tasks start with their comms-era chips on', () => {
  const on = (hub) => Object.entries(defaultFilterForHub(hub)).filter(([, v]) => v).map(([k]) => k).sort();
  assert.deepEqual(on('teaching'), ['classes', 'comms', 'promises']);
  assert.deepEqual(on('professional'), ['comms', 'events', 'meetings', 'pd', 'promises']);
  assert.deepEqual(on('tasks'), ['promises', 'tasks']);
  assert.equal(on('life').length, FILTER_CHIPS.length);
});

test('filterKeyForItem maps comms, promises and non-PD events', () => {
  assert.equal(filterKeyForItem({ source: 'professional_communication' }), 'comms');
  assert.equal(filterKeyForItem({ kind: 'comm' }), 'comms');
  assert.equal(filterKeyForItem({ source: 'ledger_item' }), 'promises');
  assert.equal(filterKeyForItem({ kind: 'promise' }), 'promises');
  assert.equal(
    filterKeyForItem({ record: { type: 'professional_event', event_type: 'ceremony' } }),
    'events'
  );
  assert.equal(
    filterKeyForItem({ record: { type: 'professional_event', event_type: 'professional_development' } }),
    'pd'
  );
  // Old projections without event_type stay PD, as today.
  assert.equal(filterKeyForItem({ kind: 'professional', source: 'professional_event' }), 'pd');
});
