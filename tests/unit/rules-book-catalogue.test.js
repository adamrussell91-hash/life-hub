// tests/unit/rules-book-catalogue.test.js
// The Rules Book's catalogue: the book's four parts and its 30 kept entries (11, 7, 7 and 5),
// every link resolving, the two variants naming real tools, the glyph set matching, and the
// group placement parser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { CATALOGUE, SECTIONS, entriesInSection, entry } from '../../packages/rules-book/catalogue.mjs';
import { GROUPS, GROUP_IDS, groupSections, parseGroups } from '../../packages/rules-book/route.mjs';
import { TOOLS } from '../../packages/problem-solver/tools/index.mjs';

test('four parts in the book’s order, each with a route id', () => {
  assert.deepEqual(SECTIONS.map((s) => s.key), ['workplace', 'change', 'people', 'life']);
  for (const s of SECTIONS) assert.equal(s.route, s.key);
});

test('30 kept entries in groups of 11, 7, 7 and 5; ids unique and prefixed rb_', () => {
  assert.equal(CATALOGUE.length, 30);
  assert.equal(new Set(CATALOGUE.map((e) => e.id)).size, 30);
  assert.deepEqual(SECTIONS.map((s) => entriesInSection(s.key).length), [11, 7, 7, 5]);
  for (const e of CATALOGUE) assert.match(e.id, /^rb_[a-z_]+$/);
  assert.equal(CATALOGUE.filter((e) => e.tier === 'lens').length + CATALOGUE.filter((e) => e.tier === 'worksheet').length, 30);
});

test('no page numbers or chapter ranges live in the catalogue', () => {
  for (const e of CATALOGUE) assert.deepEqual(Object.keys(e).sort(), ['family', 'id', 'merged', 'pairsWell', 'reuse', 'section', 'seeAlso', 'tier', 'title']);
});

test('merged entries are folded into their home, not tools; cut entries are absent', () => {
  for (const id of ['rb_brach', 'rb_box', 'rb_instrument', 'rb_canada', 'rb_agnes_allen', 'rb_gall', 'rb_lindy', 'rb_sutton', 'rb_write_it_down', 'rb_two_sides', 'rb_clothes_chair', 'rb_three_minutes']) {
    assert.equal(entry(id), null, id);
    assert.equal(TOOLS[id], undefined, id);
  }
  assert.deepEqual(entry('rb_korzybski').merged, ['rb_box', 'rb_brach', 'rb_instrument']);
  assert.deepEqual(entry('rb_plotz').merged, ['rb_agnes_allen', 'rb_canada']);
  assert.deepEqual(entry('rb_three_three_three').merged, ['rb_clothes_chair', 'rb_three_minutes']);
  for (const id of ['rb_pascal', 'rb_sturgeon', 'rb_foreword', 'rb_popsicle']) assert.equal(entry(id), null, id);
});

test('seeAlso holds kept entries; pairsWell holds kept entries or real tools', () => {
  const ids = new Set(CATALOGUE.map((e) => e.id));
  for (const e of CATALOGUE) {
    for (const id of e.seeAlso) assert.ok(ids.has(id), `${e.id} seeAlso ${id}`);
    for (const id of e.pairsWell) assert.ok(ids.has(id) || TOOLS[id], `${e.id} pairsWell ${id}`);
  }
});

test('the two variants reuse Problem Solver’s Pareto and the Decision Book’s conflict model; every other entry has a family', () => {
  assert.deepEqual(CATALOGUE.filter((e) => e.reuse).map((e) => [e.id, e.reuse]), [['rb_pareto', 'pareto'], ['rb_one_step', 'dm_conflict']]);
  for (const e of CATALOGUE.filter((x) => x.reuse)) assert.ok(TOOLS[e.reuse], e.reuse);
  const families = new Set(['path', 'list', 'quadrant', 'curve', 'scales', 'plot', 'tension']);
  for (const e of CATALOGUE.filter((x) => !x.reuse)) assert.ok(families.has(e.family), `${e.id}: ${e.family}`);
});

test('the placement parser keeps up to two known groups, in the book’s order', () => {
  assert.deepEqual(GROUP_IDS, ['workplace', 'change', 'people', 'life']);
  assert.deepEqual([...GROUPS.map((g) => g.section)].sort(), SECTIONS.map((s) => s.key).sort());
  assert.deepEqual(parseGroups('people+workplace'), ['workplace', 'people']);
  assert.deepEqual(parseGroups('life, change and people'), ['change', 'people']);
  assert.deepEqual(parseGroups('nowhere'), []);
  assert.deepEqual(parseGroups(undefined), []);
  assert.deepEqual(groupSections('life+change'), ['change', 'life']);
});

const dir = (sub) => new URL(`../../packages/rules-book/glyphs/${sub}/`, import.meta.url);
const names = async (sub) => (await readdir(dir(sub))).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)).sort();

test('an emblem per entry (the two variants drawn for the Rules Book), four parts, three identity marks', async () => {
  assert.deepEqual(await names('models'), CATALOGUE.map((e) => e.id).sort());
  assert.deepEqual(await names('sections'), SECTIONS.map((s) => s.key).sort());
  assert.deepEqual(await names('identity'), ['book-emblem', 'book-emblem-mono', 'wordmark']);
});

test('every glyph is a plain SVG in the book’s palette: no scripts, remote references or rasters', async () => {
  const allowed = new Set(['#3a3a9a', '#e0581a', '#14142b', '#fffef9', '#fcea24', '#8e8f8a']);
  for (const sub of ['models', 'sections', 'identity']) {
    for (const file of (await readdir(dir(sub))).filter((f) => f.endsWith('.svg'))) {
      const svg = await readFile(new URL(file, dir(sub)), 'utf8');
      assert.ok(svg.trimStart().startsWith('<svg'), `${sub}/${file}`);
      assert.ok(!/<script|href="https?:|<image/i.test(svg), `${sub}/${file}`);
      for (const colour of svg.toLowerCase().match(/#[0-9a-f]{6}\b/g) ?? []) assert.ok(allowed.has(colour), `${sub}/${file}: ${colour}`);
    }
  }
});
