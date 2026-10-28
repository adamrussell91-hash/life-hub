// tests/unit/collaboration-book-catalogue.test.js
// The Collaboration Book's catalogue: the book's three parts and its 35 kept entries (15, 11 and
// 9), every link resolving, the two variants naming real tools, the four merges folded in, the
// cuts absent, the glyph set matching, and the group placement parser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { CATALOGUE, FAMILIES, SECTIONS, entriesInSection, entry } from '../../packages/collaboration-book/catalogue.mjs';
import { GROUPS, GROUP_IDS, groupSections, parseGroups } from '../../packages/collaboration-book/route.mjs';
import { TOOLS } from '../../packages/problem-solver/tools/index.mjs';

test('three parts in the book’s order, each with its group', () => {
  assert.deepEqual(SECTIONS.map((s) => s.key), ['solving_problems', 'achieving_goals', 'creating_trust']);
  assert.deepEqual(SECTIONS.map((s) => s.route), ['problems', 'goals', 'trust']);
});

test('35 kept entries in parts of 15, 11 and 9; ids unique and prefixed cb_', () => {
  assert.equal(CATALOGUE.length, 35);
  assert.equal(new Set(CATALOGUE.map((e) => e.id)).size, 35);
  assert.deepEqual(SECTIONS.map((s) => entriesInSection(s.key).length), [15, 11, 9]);
  for (const e of CATALOGUE) assert.match(e.id, /^cb_[a-z_]+$/);
  for (const e of CATALOGUE) assert.ok(['lens', 'worksheet'].includes(e.tier), e.id);
});

test('no page numbers or chapter ranges live in the catalogue', () => {
  for (const e of CATALOGUE) assert.deepEqual(Object.keys(e).sort(), ['family', 'id', 'merged', 'pairsWell', 'reuse', 'section', 'seeAlso', 'tier', 'title']);
});

test('the four merges are folded into their home, not tools; the three cuts are absent', () => {
  for (const id of ['cb_flat', 'cb_positive_intent', 'cb_two_workers', 'cb_saying_yes']) {
    assert.equal(entry(id), null, id);
    assert.equal(TOOLS[id], undefined, id);
  }
  assert.deepEqual(entry('cb_agility').merged, ['cb_flat']);
  assert.deepEqual(entry('cb_ladder').merged, ['cb_positive_intent']);
  assert.deepEqual(entry('cb_purpose').merged, ['cb_two_workers']);
  assert.deepEqual(entry('cb_saying_no').merged, ['cb_saying_yes']);
  for (const id of ['cb_foreword', 'cb_xy', 'cb_lift_out']) {
    assert.equal(entry(id), null, id);
    assert.equal(TOOLS[id], undefined, id);
  }
});

test('seeAlso holds kept entries; pairsWell holds kept entries or real tools, never repeating seeAlso', () => {
  const ids = new Set(CATALOGUE.map((e) => e.id));
  for (const e of CATALOGUE) {
    for (const id of e.seeAlso) assert.ok(ids.has(id), `${e.id} seeAlso ${id}`);
    for (const id of e.pairsWell) assert.ok(ids.has(id) || TOOLS[id], `${e.id} pairsWell ${id}`);
    for (const id of e.pairsWell) assert.ok(!e.seeAlso.includes(id), `${e.id} repeats ${id}`);
    assert.deepEqual([...TOOLS[e.id].pairsWell], [...e.pairsWell], `${e.id}: the tool and the catalogue agree`);
  }
  // Consensus versus Consent points at Two Workers, which is folded into Purpose.
  assert.deepEqual(entry('cb_consent').seeAlso, ['cb_purpose']);
  assert.deepEqual(entry('cb_sociocracy').seeAlso, ['cb_agility', 'cb_consent', 'cb_small_wins']);
});

test('Postmortem varies Problem Solver’s after action review and Corporate Culture Decision Maker’s Maslow pyramids; every model draws with a shared family', () => {
  assert.deepEqual(CATALOGUE.filter((e) => e.reuse).map((e) => [e.id, e.reuse]), [['cb_postmortem', 'after_action_review'], ['cb_corporate_culture', 'dm_maslow']]);
  assert.equal(TOOLS.cb_postmortem.variantOf, 'after_action_review');
  assert.equal(TOOLS.cb_corporate_culture.variantOf, 'dm_maslow');
  assert.ok(TOOLS.after_action_review && TOOLS.dm_maslow);
  const families = new Set(FAMILIES);
  for (const e of CATALOGUE) {
    assert.ok(families.has(e.family), `${e.id}: ${e.family}`);
    assert.equal(TOOLS[e.id].family, e.family, `${e.id}: the tool draws as its catalogue family`);
  }
});

test('the book’s structures survive: Psychological Safety’s axes, the Trust Triangle as three, Cooperation as rows', () => {
  const safety = TOOLS.cb_psych_safety.chart;
  assert.equal(safety.axes.x.label, 'Performance');
  assert.equal(safety.axes.y.label, 'How safe I feel');
  assert.deepEqual(safety.cells.find((c) => c.id === 'anxiety'), { id: 'anxiety', label: 'Anxiety zone', col: 1, row: 1, fill: 'red' });
  assert.equal(TOOLS.cb_trust_triangle.family, 'list');
  assert.equal(TOOLS.cb_trust_triangle.chart.minGroups, 3);
  assert.equal(TOOLS.cb_cooperation.chart.layout, 'rows');
  assert.equal(TOOLS.cb_cooperation.chart.groups.length, 4);
  assert.deepEqual(TOOLS.cb_tuckman.chart.stages.map((s) => s.label), ['Forming', 'Storming', 'Norming', 'Performing', 'Adjourning']);
  assert.equal(TOOLS.cb_ladder.chart.stages.length, 7);
  assert.equal(TOOLS.cb_integrative.chart.stages.length, 7);
});

test('the placement parser keeps up to two known groups, in the book’s order', () => {
  assert.deepEqual(GROUP_IDS, ['problems', 'goals', 'trust']);
  assert.deepEqual(GROUPS.map((g) => g.section), SECTIONS.map((s) => s.key));
  assert.deepEqual(parseGroups('trust+problems'), ['problems', 'trust']);
  assert.deepEqual(parseGroups('problems, goals and trust'), ['problems', 'goals']);
  assert.deepEqual(parseGroups('nowhere'), []);
  assert.deepEqual(parseGroups(undefined), []);
  assert.deepEqual(groupSections('trust+goals'), ['achieving_goals', 'creating_trust']);
});

const dir = (sub) => new URL(`../../packages/collaboration-book/glyphs/${sub}/`, import.meta.url);
const names = async (sub) => (await readdir(dir(sub))).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)).sort();

test('an emblem per entry (the two variants drawn for the Collaboration Book), three parts, three identity marks', async () => {
  assert.deepEqual(await names('models'), CATALOGUE.map((e) => e.id).sort());
  assert.deepEqual(await names('sections'), SECTIONS.map((s) => s.key).sort());
  assert.deepEqual(await names('identity'), ['book-emblem', 'book-emblem-mono', 'wordmark']);
});

test('every glyph is a plain SVG in the pack’s screen palette and stroke set: no scripts, remote references or rasters', async () => {
  const allowed = new Set(['#007d97', '#a06400']);
  for (const sub of ['models', 'sections', 'identity']) {
    for (const file of (await readdir(dir(sub))).filter((f) => f.endsWith('.svg'))) {
      const svg = await readFile(new URL(file, dir(sub)), 'utf8');
      assert.ok(svg.trimStart().startsWith('<svg'), `${sub}/${file}`);
      assert.ok(!/<script|href="https?:|<image|<style|<text/i.test(svg), `${sub}/${file}`);
      assert.match(svg, /<title>[^<]+<\/title>/, `${sub}/${file}`);
      for (const colour of svg.toLowerCase().match(/#[0-9a-f]{6}\b/g) ?? []) assert.ok(allowed.has(colour), `${sub}/${file}: ${colour}`);
      for (const width of svg.match(/stroke-width="(\d+)"/g) ?? []) assert.ok(/"(6|9|16)"/.test(width), `${sub}/${file}: ${width}`);
    }
  }
});

test('the hand-drawn variant emblems keep the pack’s grammar: viewBox 140, the safe box, one gold point of attention', async () => {
  for (const [id, title] of [['cb_postmortem', 'The Postmortem'], ['cb_corporate_culture', 'Corporate Culture']]) {
    const svg = await readFile(new URL(`${id}.svg`, dir('models')), 'utf8');
    assert.match(svg, /viewBox="0 0 140 140"/);
    assert.ok(svg.includes(`<title>${title}</title>`), id);
    assert.equal((svg.match(/#a06400/g) ?? []).length, 1, id);
    assert.ok(svg.length <= 3072, `${id}: ${svg.length} bytes`);
  }
});
