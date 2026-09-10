import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHubEntityIndex,
  filterCommandGroups,
  searchHubEntities
} from '../../packages/design-kit/js/hub-entity-search.js';

const groups = [
  {
    heading: 'Go to',
    items: [
      { id: 'cn', label: 'Central Node', hint: 'Shared agent log' },
      { id: 'chat', label: 'Chat', hint: 'Personality agents' },
      { id: 'fit', label: 'Fitness', hint: 'Workouts and training' },
      { id: 'cw', label: 'Chadwick', hint: 'Fitness coach' }
    ]
  },
  {
    heading: 'Teaching',
    items: [
      { id: 'cog', label: 'Cognitive Load Theory', hint: 'Year 11 Psychology' },
      { id: 'mem', label: 'Working Memory Model', hint: 'Baddeley & Hitch' }
    ]
  }
];

test('MiniSearch fuzzy recovers Central Node from typo', () => {
  const hits = filterCommandGroups(groups, 'centrul node');
  assert.deepEqual(
    hits.flatMap((g) => g.items.map((i) => i.id)),
    ['cn']
  );
});

test('MiniSearch prefix matches Fitness', () => {
  const hits = filterCommandGroups(groups, 'fitn');
  assert.ok(hits.some((g) => g.items.some((i) => i.id === 'fit')));
});

test('MiniSearch fuzzy matches Chadwick typo', () => {
  const hits = filterCommandGroups(groups, 'chadwik');
  assert.deepEqual(
    hits.flatMap((g) => g.items.map((i) => i.label)),
    ['Chadwick']
  );
});

test('AND combineWith avoids soft multi-term noise', () => {
  const index = buildHubEntityIndex([
    { id: 'cn', label: 'Central Node', hint: 'Shared agent log' },
    { id: 'note', label: 'Note 2: Metacognition reflections', hint: 'Synthetic' }
  ]);
  const hits = searchHubEntities(index, 'central node');
  assert.deepEqual(
    hits.map((h) => h.id),
    ['cn']
  );
});

test('empty query returns all groups unchanged', () => {
  const hits = filterCommandGroups(groups, '');
  assert.equal(hits.length, groups.length);
  assert.equal(hits[0].items.length, 4);
});

test('substring still works for exact needles', () => {
  const hits = filterCommandGroups(groups, 'working mem');
  assert.ok(hits.some((g) => g.items.some((i) => i.id === 'mem')));
});
