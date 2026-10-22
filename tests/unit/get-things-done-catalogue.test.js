// tests/unit/get-things-done-catalogue.test.js
// Gear Shifter's catalogue: the book's five sections and its 37 kept entries, with every link
// resolving and the two variants naming real Problem Solver tools.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGUE, SECTIONS, entriesInSection, entry } from '../../packages/get-things-done/catalogue.mjs';
import { TOOLS } from '../../packages/problem-solver/tools/index.mjs';

test('five sections in the book order, each with a chapter range', () => {
  assert.deepEqual(SECTIONS.map((s) => s.key), ['doing_things', 'before_doing', 'working_with_others', 'doing_differently', 'reviewing']);
  for (const s of SECTIONS) assert.ok(s.chapter[0] < s.chapter[1], s.key);
});

test('37 kept entries: 30 worksheets and 7 lenses, ids unique and prefixed', () => {
  assert.equal(CATALOGUE.length, 37);
  assert.equal(new Set(CATALOGUE.map((e) => e.id)).size, 37);
  assert.equal(CATALOGUE.filter((e) => e.tier === 'worksheet').length, 30);
  assert.equal(CATALOGUE.filter((e) => e.tier === 'lens').length, 7);
  for (const e of CATALOGUE) assert.match(e.id, /^gt_[a-z_]+$/);
});

test('every entry sits in a section, inside its chapter range', () => {
  for (const e of CATALOGUE) {
    const s = SECTIONS.find((x) => x.key === e.section);
    assert.ok(s, e.id);
    assert.ok(e.chapter[0] <= e.chapter[1], e.id);
  }
  assert.equal(SECTIONS.reduce((n, s) => n + entriesInSection(s.key).length, 0), 37);
});

test('merged and cut entries are not tools; the merges name their home', () => {
  for (const id of ['gt_new_work', 'gt_myth_of_achievement', 'gt_matthew_effect', 'gt_new_map_of_life']) assert.equal(entry(id), null, id);
  assert.deepEqual(entry('gt_rapid_prototyping').merged, ['gt_new_work']);
  assert.deepEqual(entry('gt_project_evaluation').merged, ['gt_myth_of_achievement']);
  assert.deepEqual(entry('gt_motivation').merged, ['gt_matthew_effect']);
});

test('seeAlso holds kept entries; pairsWell holds kept entries or real Problem Solver tools', () => {
  const ids = new Set(CATALOGUE.map((e) => e.id));
  for (const e of CATALOGUE) {
    for (const id of e.seeAlso) assert.ok(ids.has(id), `${e.id} seeAlso ${id}`);
    for (const id of e.pairsWell) assert.ok(ids.has(id) || TOOLS[id], `${e.id} pairsWell ${id}`);
    for (const id of e.pairsWell) assert.ok(!e.seeAlso.includes(id), `${e.id} repeats ${id}`);
  }
});

test('the two variants reuse Problem Solver tools; every other entry has a chart family', () => {
  assert.deepEqual(CATALOGUE.filter((e) => e.reuse).map((e) => [e.id, e.reuse]), [['gt_kanban', 'kanban'], ['gt_five_whys', 'five_whys']]);
  for (const e of CATALOGUE.filter((x) => x.reuse)) assert.ok(TOOLS[e.reuse], e.reuse);
  const families = new Set(['path', 'list', 'quadrant', 'curve', 'scales', 'ratings']);
  for (const e of CATALOGUE.filter((x) => !x.reuse)) assert.ok(families.has(e.family), `${e.id}: ${e.family}`);
});
