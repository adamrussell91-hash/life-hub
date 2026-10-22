// tests/unit/decision-book-catalogue.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOGUE, CATALOGUE_IDS, FAMILIES, REUSED_TOOL_IDS, SECTIONS, catalogueEntry, modelsInSection } from '../../packages/decision-book/catalogue.mjs';

const RANGES = { 1: [10, 49], 2: [52, 81], 3: [84, 123], 4: [126, 149] };

test('52 entries: 18, 13, 13 and 8 per section', () => {
  assert.equal(CATALOGUE.length, 52);
  assert.deepEqual(SECTIONS.map((s) => modelsInSection(s.id).length), [18, 13, 13, 8]);
});

test('ids are unique; only the four reused Problem Solver tools lack the dm_ prefix', () => {
  assert.equal(new Set(CATALOGUE_IDS).size, CATALOGUE_IDS.length);
  assert.deepEqual([...REUSED_TOOL_IDS].sort(), ['double_loop', 'morphological', 'pareto', 'swot']);
  for (const entry of CATALOGUE) assert.equal(entry.id.startsWith('dm_'), !entry.reuse, entry.id);
});

test('every family and tier is known; exactly seven lenses', () => {
  for (const entry of CATALOGUE) {
    assert.ok(FAMILIES.includes(entry.family), `${entry.id} family ${entry.family}`);
    assert.ok(['worksheet', 'lens'].includes(entry.tier), entry.id);
  }
  assert.deepEqual(CATALOGUE.filter((e) => e.tier === 'lens').map((e) => e.id), [
    'dm_choice_overload', 'dm_outside_box', 'dm_consequences', 'dm_sinus_bourdieu', 'dm_long_tail', 'dm_black_box', 'dm_future'
  ]);
});

test('pages sit inside their section and run in book order', () => {
  for (const section of SECTIONS) {
    const [lo, hi] = RANGES[section.id];
    let last = 0;
    for (const entry of modelsInSection(section.id)) {
      const [first, end] = entry.pages;
      assert.ok(first >= lo && end <= hi && first <= end, `${entry.id} pages ${entry.pages}`);
      assert.ok(first > last, `${entry.id} out of order`);
      last = end;
    }
  }
});

test('see-also links resolve, never point at themselves, and kit folders are unique per section', () => {
  for (const entry of CATALOGUE) {
    for (const id of entry.seeAlso) {
      assert.ok(catalogueEntry(id), `${entry.id} -> ${id}`);
      assert.notEqual(id, entry.id);
    }
  }
  const kits = CATALOGUE.map((e) => `${e.section}/${e.kit}`);
  assert.equal(new Set(kits).size, kits.length);
  assert.equal(catalogueEntry('nope'), null);
});
