import assert from 'node:assert/strict';
import test from 'node:test';
import { readShelf, savePlacements } from '../../netlify/functions/_shared/knowledge-shelf.mjs';
import { placeBodies, planShelfThemes, themePlacement, themesFromTags } from '../../netlify/functions/_shared/knowledge-shelf-themes.mjs';

const cognition = 'Learning Science and Cognition';
const child = 'Child and Adolescent Development';
const philosophy = 'Philosophy Knowledge and Society';
const pedagogy = 'Pedagogy and Instructional Design';

function memoryStore() {
  const values = new Map();
  return {
    async get(key) { return values.has(key) ? structuredClone(values.get(key)) : null; },
    async setJSON(key, value) { values.set(key, structuredClone(value)); }
  };
}

function note(id, label, tags, extra = {}) {
  return {
    id,
    tags,
    origins: [{ kind: 'book', label }],
    ...extra
  };
}

test('themesFromTags keeps at most three closed-vocabulary tags, in order', () => {
  assert.deepEqual(themesFromTags(['Note', 'learning science and cognition', 'EDST5805', child, 'invented', philosophy, pedagogy]), [
    cognition,
    child,
    philosophy
  ]);
  assert.deepEqual(themesFromTags(['Note', cognition, cognition]), [cognition]);
  assert.deepEqual(themesFromTags(['Note']), []);
});

test('themePlacement sends themes only, and skips a note that already has them', () => {
  assert.deepEqual(
    themePlacement({ id: 'page_hub_a', tags: ['Note', cognition] }, { page: 12, stance: 'supports', gaps: ['x'] }),
    { pageId: 'page_hub_a', themes: [cognition] }
  );
  assert.equal(themePlacement({ id: 'page_hub_a', tags: [cognition] }, { themes: ['Kept by Adam'] }), null);
  assert.equal(themePlacement({ id: 'page_hub_a', tags: ['Note'] }, {}), null);
  assert.equal(themePlacement({ id: '../x', tags: [cognition] }, {}), null);
});

test('plan counts notes per book and does not overwrite a stored field', async () => {
  const pages = [
    note('page_hub_a', 'The Knowledge Gene', ['Note', cognition]),
    note('page_hub_b', 'the knowledge gene', ['Note']),
    note('page_hub_c', 'The Knowledge Gene', [philosophy], { status: 'deleted' }),
    {
      id: 'page_hub_d',
      tags: [child, pedagogy],
      origins: [
        { kind: 'book', label: 'The Knowledge Gene' },
        { kind: 'book', label: 'The Enigma of Reason' },
        { kind: 'notebook', label: 'Literacy' }
      ]
    },
    note('page_note', 'Make It Stick', [cognition])
  ];
  const store = memoryStore();
  await savePlacements(store, [{ pageId: 'page_hub_a', page: 40, stance: 'extends', gaps: ['Replication?'], themes: ['Kept by Adam'] }]);
  const { placements } = await readShelf(store);
  const plan = planShelfThemes(pages, placements);
  assert.deepEqual(plan.books, [
    { label: 'The Knowledge Gene', notes: 3, themed: 1, already: 1, untagged: 1 },
    { label: 'Make It Stick', notes: 1, themed: 1, already: 0, untagged: 0 },
    { label: 'The Enigma of Reason', notes: 1, themed: 1, already: 0, untagged: 0 }
  ]);
  assert.deepEqual(plan.patches, [
    { pageId: 'page_hub_d', themes: [child, pedagogy] },
    { pageId: 'page_note', themes: [cognition] }
  ]);
  await savePlacements(store, plan.patches);
  const saved = (await readShelf(store)).placements;
  const kept = saved.find(item => item.pageId === 'page_hub_a');
  assert.equal(kept.page, 40);
  assert.equal(kept.stance, 'extends');
  assert.deepEqual(kept.gaps, ['Replication?']);
  assert.deepEqual(kept.themes, ['Kept by Adam']);
  const added = saved.find(item => item.pageId === 'page_hub_d');
  assert.deepEqual(added.themes, [child, pedagogy]);
  assert.equal(added.page, undefined);
  assert.deepEqual(planShelfThemes(pages, saved).patches, []);
});

test('place bodies match the shelf place op and stay within one write', () => {
  const patches = Array.from({ length: 501 }, (_, index) => ({ pageId: `page_${index}`, themes: [cognition] }));
  const bodies = placeBodies(patches);
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].op, 'place');
  assert.equal(bodies[0].placements.length, 500);
  assert.equal(bodies[1].placements.length, 1);
  assert.deepEqual(Object.keys(bodies[0].placements[0]), ['pageId', 'themes']);
});
