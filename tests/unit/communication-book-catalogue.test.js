// tests/unit/communication-book-catalogue.test.js
// The Communication Book's catalogue: the book's five sections and its 34 kept entries (10, 7, 9,
// 7 and 1), every link resolving, the variant naming a real tool, the seven merges folded in, the
// cuts absent, the glyph set matching the pack's screen palette, and the group placement parser.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { CATALOGUE, FAMILIES, SECTIONS, entriesInSection, entry } from '../../packages/communication-book/catalogue.mjs';
import { GROUPS, GROUP_IDS, groupSections, parseGroups } from '../../packages/communication-book/route.mjs';
import { TOOLS } from '../../packages/problem-solver/tools/index.mjs';

test('five sections in the book’s order, each routed to one of three groups', () => {
  assert.deepEqual(SECTIONS.map((s) => s.key), ['job_career', 'self_knowledge', 'love_friendship', 'words_meanings', 'conclusion']);
  assert.deepEqual(SECTIONS.map((s) => s.route), ['prepare', 'relate', 'relate', 'read', 'read']);
  for (const s of SECTIONS) assert.ok(GROUPS.find((g) => g.id === s.route).sections.includes(s.key), s.key);
});

test('34 kept entries in sections of 10, 7, 9, 7 and 1; ids unique and prefixed cm_', () => {
  assert.equal(CATALOGUE.length, 34);
  assert.equal(new Set(CATALOGUE.map((e) => e.id)).size, 34);
  assert.deepEqual(SECTIONS.map((s) => entriesInSection(s.key).length), [10, 7, 9, 7, 1]);
  assert.deepEqual(entriesInSection('conclusion').map((e) => e.id), ['cm_peak_end']);
  for (const e of CATALOGUE) assert.match(e.id, /^cm_[a-z_]+$/);
  for (const e of CATALOGUE) assert.ok(['lens', 'worksheet'].includes(e.tier), e.id);
});

test('no page numbers or chapter ranges live in the catalogue', () => {
  for (const e of CATALOGUE) assert.deepEqual(Object.keys(e).sort(), ['family', 'id', 'merged', 'pairsWell', 'reuse', 'section', 'seeAlso', 'tier', 'title']);
});

test('the seven merges are folded into their home, not tools; the three cuts are absent', () => {
  const merges = [['cm_cultivation', 'cm_groupthink'], ['cm_silence', 'cm_groupthink'], ['cm_euphemisms', 'cm_framing'], ['cm_fomo', 'cm_uses'], ['cm_small_talk', 'cm_listening'], ['cm_white_lies', 'cm_cooperative'], ['cm_watzlawick', 'cm_four_layers']];
  for (const [id, home] of merges) {
    assert.equal(entry(id), null, id);
    assert.equal(TOOLS[id], undefined, id);
    assert.ok(entry(home).merged.includes(id), `${id} folds into ${home}`);
  }
  assert.equal(CATALOGUE.flatMap((e) => e.merged).length, 7);
  for (const id of ['cm_power', 'cm_parenting', 'cm_visual']) {
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
  // The Iceberg points at Watzlawick, folded into Schulz von Thun; Proust at Small Talk, folded into Active Listening.
  assert.deepEqual(entry('cm_iceberg').seeAlso, ['cm_six_words', 'cm_four_layers', 'cm_lasswell']);
  assert.deepEqual(entry('cm_proust').seeAlso, ['cm_listening']);
  assert.deepEqual(entry('cm_storytelling').seeAlso, ['cm_rhetoric']);
});

test('Second-Order Observation varies Problem Solver’s perspective shift; every model draws with a shared family', () => {
  assert.deepEqual(CATALOGUE.filter((e) => e.reuse).map((e) => [e.id, e.reuse]), [['cm_second_order', 'perspective_shift']]);
  assert.equal(TOOLS.cm_second_order.variantOf, 'perspective_shift');
  assert.ok(TOOLS.perspective_shift);
  const families = new Set(FAMILIES);
  for (const e of CATALOGUE) {
    assert.ok(families.has(e.family), `${e.id}: ${e.family}`);
    assert.equal(TOOLS[e.id].family, e.family, `${e.id}: the tool draws as its catalogue family`);
  }
});

test('the book’s structures survive: the Sorry Matrix’s printed labels, Boss Talk’s and the Feedback Method’s axes, the six principles', () => {
  const sorry = TOOLS.cm_apology.chart;
  assert.equal(sorry.axes.x.label, 'Forget');
  assert.equal(sorry.axes.y.label, 'Forgive');
  // Row 0 is the top: forgiving without forgetting is resentful, forgetting without forgiving dysfunctional.
  assert.deepEqual(sorry.cells.find((c) => c.id === 'resentful'), { id: 'resentful', label: 'Resentful', col: 0, row: 0, fill: 'tint' });
  assert.deepEqual(sorry.cells.find((c) => c.id === 'dysfunctional'), { id: 'dysfunctional', label: 'Dysfunctional', col: 1, row: 1, fill: 'ink' });
  assert.deepEqual(TOOLS.cm_boss_talk.chart.axes.x, { label: 'Practise', low: 'Wine', high: 'Water' });
  assert.deepEqual(TOOLS.cm_feedback.chart.axes.y, { label: 'Feedback effect', low: 'Destructive', high: 'Constructive' });
  assert.equal(TOOLS.cm_feedback.chart.cells.find((c) => c.id === 'yes_and').col, 1);
  assert.deepEqual(TOOLS.cm_persuasion.chart.groups.map((g) => g.id), ['reciprocity', 'authority', 'consistency', 'consensus', 'scarcity', 'liking']);
  assert.deepEqual(TOOLS.cm_storytelling.chart.stages.map((s) => s.label), ['Abstract', 'Orientation', 'Complicating action', 'Resolution', 'Evaluation', 'Coda']);
  assert.equal(TOOLS.cm_proust.chart.variant, 'flow');
  assert.equal(TOOLS.cm_lasswell.chart.stages.length, 5);
});

test('the placement parser keeps up to two known groups, in the book’s order', () => {
  assert.deepEqual(GROUP_IDS, ['prepare', 'relate', 'read']);
  assert.deepEqual(GROUPS.flatMap((g) => g.sections), SECTIONS.map((s) => s.key));
  assert.deepEqual(parseGroups('read+prepare'), ['prepare', 'read']);
  assert.deepEqual(parseGroups('prepare, relate and read'), ['prepare', 'relate']);
  assert.deepEqual(parseGroups('nowhere'), []);
  assert.deepEqual(parseGroups(undefined), []);
  assert.deepEqual(groupSections('read+relate'), ['self_knowledge', 'love_friendship', 'words_meanings', 'conclusion']);
});

const dir = (sub) => new URL(`../../packages/communication-book/glyphs/${sub}/`, import.meta.url);
const names = async (sub) => (await readdir(dir(sub))).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)).sort();

test('an emblem per entry, five sections, three identity marks; none for the merged or cut entries', async () => {
  assert.deepEqual(await names('models'), CATALOGUE.map((e) => e.id).sort());
  assert.deepEqual(await names('sections'), SECTIONS.map((s) => s.key).sort());
  assert.deepEqual(await names('identity'), ['book-emblem', 'book-emblem-mono', 'wordmark']);
});

test('every glyph is a plain SVG in the pack’s screen palette (ink as currentColor, grey, gold) and bar set: no scripts, remote references or rasters', async () => {
  const allowed = new Set(['#96938f', '#aa914e']);
  for (const sub of ['models', 'sections', 'identity']) {
    for (const file of (await readdir(dir(sub))).filter((f) => f.endsWith('.svg'))) {
      const svg = await readFile(new URL(file, dir(sub)), 'utf8');
      assert.ok(svg.trimStart().startsWith('<svg'), `${sub}/${file}`);
      assert.ok(!/<script|href="https?:|<image|<style|<text/i.test(svg), `${sub}/${file}`);
      assert.match(svg, /<title>[^<]+<\/title>/, `${sub}/${file}`);
      assert.match(svg, new RegExp(`viewBox="0 0 ${sub === 'sections' ? 240 : 140} ${sub === 'sections' ? 240 : 140}"`), `${sub}/${file}`);
      for (const colour of svg.toLowerCase().match(/#[0-9a-f]{3,6}\b/g) ?? []) assert.ok(allowed.has(colour), `${sub}/${file}: ${colour}`);
      for (const width of svg.match(/stroke-width="(\d+)"/g) ?? []) assert.ok(/"(8|12|16)"/.test(width), `${sub}/${file}: ${width}`);
    }
  }
});
