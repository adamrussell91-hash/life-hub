// tests/unit/change-book-catalogue.test.js
// The Change Book's catalogue: the book's five parts and its 20 kept entries (4, 3, 6, 6 and 1),
// every link resolving, the Rhizome variant naming a real tool, the three merges folded in, the
// glyph set matching, and the group placement parser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { CATALOGUE, SECTIONS, entriesInSection, entry } from '../../packages/change-book/catalogue.mjs';
import { ANY_GROUP, GROUPS, GROUP_IDS, groupSections, parseGroups } from '../../packages/change-book/route.mjs';
import { TOOLS } from '../../packages/problem-solver/tools/index.mjs';

test('five parts in the book’s order; the four main parts have a group, the appendix belongs to all', () => {
  assert.deepEqual(SECTIONS.map((s) => s.key), ['explaining_our_world', 'explaining_my_world', 'changing_my_world', 'changing_our_world', 'appendix']);
  assert.deepEqual(SECTIONS.map((s) => s.route), ['world', 'self', 'mine', 'ours', null]);
  assert.deepEqual(ANY_GROUP, ['ch_anti_change']);
  assert.equal(entry('ch_anti_change').section, 'appendix');
});

test('20 kept entries in parts of 4, 3, 6, 6 and 1; ids unique and prefixed ch_', () => {
  assert.equal(CATALOGUE.length, 20);
  assert.equal(new Set(CATALOGUE.map((e) => e.id)).size, 20);
  assert.deepEqual(SECTIONS.map((s) => entriesInSection(s.key).length), [4, 3, 6, 6, 1]);
  for (const e of CATALOGUE) assert.match(e.id, /^ch_[a-z_]+$/);
  for (const e of CATALOGUE) assert.ok(['lens', 'worksheet'].includes(e.tier), e.id);
});

test('no page numbers or chapter ranges live in the catalogue', () => {
  for (const e of CATALOGUE) assert.deepEqual(Object.keys(e).sort(), ['family', 'id', 'merged', 'pairsWell', 'reuse', 'section', 'seeAlso', 'tier', 'title']);
});

test('the three merges are folded into their home, not tools; cut entries are absent', () => {
  for (const id of ['ch_back_of_napkin', 'ch_prejudice', 'ch_dictatorship']) {
    assert.equal(entry(id), null, id);
    assert.equal(TOOLS[id], undefined, id);
  }
  assert.deepEqual(entry('ch_innovation').merged, ['ch_back_of_napkin']);
  assert.deepEqual(entry('ch_othering').merged, ['ch_prejudice']);
  assert.deepEqual(entry('ch_unhappiness').merged, ['ch_dictatorship']);
  for (const id of ['ch_cosmogony', 'ch_singularity', 'ch_model_school', 'ch_dying', 'ch_religion', 'ch_basic_income']) assert.equal(entry(id), null, id);
});

test('seeAlso holds kept entries; pairsWell holds kept entries or real tools', () => {
  const ids = new Set(CATALOGUE.map((e) => e.id));
  for (const e of CATALOGUE) {
    for (const id of e.seeAlso) assert.ok(ids.has(id), `${e.id} seeAlso ${id}`);
    for (const id of e.pairsWell) assert.ok(ids.has(id) || TOOLS[id], `${e.id} pairsWell ${id}`);
  }
  assert.deepEqual(entry('ch_future').seeAlso, ['ch_sustainability']);
});

test('Rhizome reuses Problem Solver’s concept map; every other entry has a shared family (no new families)', () => {
  assert.deepEqual(CATALOGUE.filter((e) => e.reuse).map((e) => [e.id, e.reuse]), [['ch_rhizome', 'concept_map']]);
  assert.ok(TOOLS.concept_map);
  const families = new Set(['path', 'list', 'quadrant', 'curve', 'scales', 'plot', 'tension']);
  for (const e of CATALOGUE.filter((x) => !x.reuse)) assert.ok(families.has(e.family), `${e.id}: ${e.family}`);
  assert.equal(entry('ch_multitasking').family, 'scales');
  assert.equal(entry('ch_unhappiness').family, 'scales');
  for (const id of ['ch_braess', 'ch_innovation', 'ch_swarm_intelligence', 'ch_anti_change']) assert.equal(entry(id).family, 'list', id);
});

test('the placement parser keeps up to two known groups, in the book’s order', () => {
  assert.deepEqual(GROUP_IDS, ['world', 'self', 'mine', 'ours']);
  assert.deepEqual(GROUPS.map((g) => g.section), SECTIONS.slice(0, 4).map((s) => s.key));
  assert.deepEqual(parseGroups('ours+self'), ['self', 'ours']);
  assert.deepEqual(parseGroups('world, mine and ours'), ['world', 'mine']);
  assert.deepEqual(parseGroups('nowhere'), []);
  assert.deepEqual(parseGroups(undefined), []);
  assert.deepEqual(groupSections('ours+world'), ['explaining_our_world', 'changing_our_world']);
});

const dir = (sub) => new URL(`../../packages/change-book/glyphs/${sub}/`, import.meta.url);
const names = async (sub) => (await readdir(dir(sub))).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)).sort();

test('an emblem per entry (Rhizome drawn for the Change Book), five parts, three identity marks', async () => {
  assert.deepEqual(await names('models'), CATALOGUE.map((e) => e.id).sort());
  assert.deepEqual(await names('sections'), SECTIONS.map((s) => s.key).sort());
  assert.deepEqual(await names('identity'), ['book-emblem', 'book-emblem-mono', 'wordmark']);
});

test('every glyph is a plain SVG in the pack’s screen palette and stroke set: no scripts, remote references or rasters', async () => {
  const allowed = new Set(['#f5f1e7', '#262625', '#084953', '#af6e41']);
  for (const sub of ['models', 'sections', 'identity']) {
    for (const file of (await readdir(dir(sub))).filter((f) => f.endsWith('.svg'))) {
      const svg = await readFile(new URL(file, dir(sub)), 'utf8');
      assert.ok(svg.trimStart().startsWith('<svg'), `${sub}/${file}`);
      assert.ok(!/<script|href="https?:|<image/i.test(svg), `${sub}/${file}`);
      assert.match(svg, /<title>[^<]+<\/title>/, `${sub}/${file}`);
      for (const colour of svg.toLowerCase().match(/#[0-9a-f]{6}\b/g) ?? []) assert.ok(allowed.has(colour), `${sub}/${file}: ${colour}`);
      for (const width of svg.match(/stroke-width="(\d+)"/g) ?? []) assert.ok(/"(6|10|14)"/.test(width), `${sub}/${file}: ${width}`);
    }
  }
});

test('the hand-drawn Rhizome emblem keeps the pack’s grammar: viewBox 140, the two grid corners, one copper hinge', async () => {
  const svg = await readFile(new URL('ch_rhizome.svg', dir('models')), 'utf8');
  assert.match(svg, /viewBox="0 0 140 140"/);
  assert.match(svg, /<title>The Rhizome Model<\/title>/);
  assert.ok(svg.includes('M24 44V24H44 M116 96V116H96'));
  assert.equal((svg.match(/#af6e41/g) ?? []).length, 1);
  assert.ok(svg.includes('points="70,60 80,70 70,80 60,70"'));
});
