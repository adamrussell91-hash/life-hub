// tests/unit/question-book-catalogue.test.js
// The Question Book's catalogue: five groups, 42 chapters (40 of questions, the rules card and
// Your questions), the cut and merged chapters absent, the five charts inside their parent
// chapters and building through the Decision Book's real family factories, an emblem for every
// chapter, chart and group, and the pack's screen palette in the stylesheet.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { CHAPTERS, CHAPTER_KINDS, CHARTS, GROUPS, OWN_CHAPTER, PRIVATE_QUESTIONS_PATH, RULES, RULES_CHAPTER, chapter, chaptersInGroup, chart, chartsInChapter } from '../../packages/question-book/catalogue.mjs';
import { FAMILY_FACTORIES } from '../../packages/decision-book/families/index.mjs';

test('five groups in the book’s order', () => {
  assert.deepEqual(GROUPS.map((g) => g.key), ['everyday_life', 'work_and_money', 'identity_and_convictions', 'relationships', 'life_course']);
  assert.deepEqual(GROUPS.map((g) => g.order), [1, 2, 3, 4, 5]);
});

test('42 chapters: 40 of questions, the rules card and Your questions; ids unique and prefixed qb_', () => {
  assert.equal(CHAPTERS.length, 42);
  assert.equal(new Set(CHAPTERS.map((c) => c.id)).size, 42);
  for (const c of CHAPTERS) {
    assert.match(c.id, /^qb_[a-z_]+$/);
    assert.ok(CHAPTER_KINDS.includes(c.kind), c.id);
    assert.ok(GROUPS.some((g) => g.key === c.group), c.id);
    assert.match(c.when, /^Use this when .+\.$/, c.id);
    assert.deepEqual(Object.keys(c).sort(), ['group', 'id', 'kind', 'order', 'title', 'when'], c.id);
  }
  assert.equal(CHAPTERS.filter((c) => c.kind === 'questions').length, 40);
  assert.deepEqual(CHAPTERS.filter((c) => c.kind === 'rules').map((c) => c.id), [RULES_CHAPTER]);
  assert.deepEqual(CHAPTERS.filter((c) => c.kind === 'own').map((c) => c.id), [OWN_CHAPTER]);
  assert.deepEqual(GROUPS.map((g) => chaptersInGroup(g.key).length), [6, 4, 9, 12, 11]);
  for (const g of GROUPS) assert.deepEqual(chaptersInGroup(g.key).map((c) => c.order), chaptersInGroup(g.key).map((_, i) => i + 1));
  assert.equal(RULES.length, 4);
});

test('cut and merged chapters are absent; the charts are not chapters', () => {
  for (const id of ['qb_men_and_women', 'qb_thanks', 'qb_authors', 'qb_confessions', 'qb_instructions', 'qb_still_got_questions']) assert.equal(chapter(id), null, id);
  for (const c of CHARTS) assert.equal(chapter(c.id), null, c.id);
});

test('five charts, each inside a question chapter, each building as its family', () => {
  assert.deepEqual(CHARTS.map((c) => [c.id, c.chapter, c.family]), [
    ['qb_communication_map', 'qb_communicating', 'quadrant'],
    ['qb_paid_work_map', 'qb_career', 'quadrant'],
    ['qb_pain_map', 'qb_mind_and_body', 'quadrant'],
    ['qb_possessions_map', 'qb_money_and_possessions', 'plot'],
    ['qb_friendship_map', 'qb_your_friends', 'quadrant']
  ]);
  for (const c of CHARTS) {
    assert.equal(chapter(c.chapter)?.kind, 'questions', c.id);
    assert.equal(chart(c.id), c);
    assert.deepEqual(chartsInChapter(c.chapter).map((x) => x.id), [c.id]);
    // The same call the book-pack checker makes: the real factory, with a Decision Book id.
    assert.doesNotThrow(() => FAMILY_FACTORIES[c.family]({ id: `dm_${c.id}`, name: c.title, when: 'Use this when testing.', tier: 'worksheet', failureModes: ['a', 'b'], steps: [{ id: 'place', title: 'Place', prompt: 'Place them.' }], chart: structuredClone(c.structure) }), c.id);
  }
  // The possessions plot keeps the book's − and + poles.
  assert.deepEqual([chart('qb_possessions_map').structure.axes.x.low, chart('qb_possessions_map').structure.axes.x.high], ['-', '+']);
});

test('the questions are read from the private data repository', () => {
  assert.equal(PRIVATE_QUESTIONS_PATH, 'data/tasks/question-book/questions.json');
});

test('no page numbers live in the catalogue', () => {
  for (const text of [...CHAPTERS, ...CHARTS, ...GROUPS, ...RULES].flatMap((e) => JSON.stringify(e))) assert.doesNotMatch(text, /\bpages?\b|\bpdf\b/i);
});

const dir = (sub) => new URL(`../../packages/question-book/glyphs/${sub}/`, import.meta.url);
const names = async (sub) => (await readdir(dir(sub))).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)).sort();

test('an emblem for every chapter and chart, every group, and three identity marks', async () => {
  assert.deepEqual(await names('models'), [...CHAPTERS, ...CHARTS].map((e) => e.id).sort());
  assert.deepEqual(await names('sections'), GROUPS.map((g) => g.key).sort());
  assert.deepEqual(await names('identity'), ['book-emblem', 'book-emblem-mono', 'wordmark']);
});

test('every glyph is a plain SVG in the book’s palette: no scripts, remote references or rasters', async () => {
  const allowed = new Set(['#181916', '#3d66cf', '#d73c2c', '#e9b92f', '#f4eedd']);
  for (const sub of ['models', 'sections', 'identity']) {
    for (const file of (await readdir(dir(sub))).filter((f) => f.endsWith('.svg'))) {
      const svg = await readFile(new URL(file, dir(sub)), 'utf8');
      assert.ok(svg.trimStart().startsWith('<svg'), `${sub}/${file}`);
      assert.ok(!/<script|href="https?:|<image/i.test(svg), `${sub}/${file}`);
      for (const colour of svg.toLowerCase().match(/#[0-9a-f]{6}\b/g) ?? []) assert.ok(allowed.has(colour), `${sub}/${file}: ${colour}`);
    }
  }
});

/* ------------------------------------------------------------------ the stylesheet */

const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const qb = strip(await readFile(new URL('../../packages/question-book/question-book.css', import.meta.url), 'utf8'));
const dm = strip(await readFile(new URL('../../packages/decision-book/decision-book.css', import.meta.url), 'utf8'));
const token = (name) => new RegExp(`--qb-${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(qb)?.[1];
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('the pack’s screen palette', () => {
  assert.deepEqual(['paper', 'ink', 'blue', 'red', 'yellow', 'blue-tint', 'red-tint', 'soft', 'line', 'red-label'].map(token), ['#f4eedd', '#181916', '#3d66cf', '#d73c2c', '#e9b92f', '#dce5fa', '#f3d8cf', '#eee5d1', '#655f52', '#9e2a20']);
});

test('every Decision Maker token is remapped to a Question Book one under .qb-scope', () => {
  const block = /\.qb-scope\s*\{([^}]*)\}/.exec(qb)[1];
  const tokens = [...new Set([...dm.matchAll(/^\s*(--dm-[a-z-]+):/gm)].map((m) => m[1]))];
  assert.ok(tokens.length >= 15);
  for (const name of tokens) assert.match(block, new RegExp(`${name}:\\s*var\\(--qb-[a-z-]+\\)`), name);
});

test('every text pair the re-skin makes reads at 4.5:1; red and yellow stay shapes', () => {
  const pairs = [
    ['paper on blue (DM green)', 'paper', 'blue'],
    ['paper on red label', 'paper', 'red-label'],
    ['ink on paper', 'ink', 'paper'],
    ['ink on yellow', 'ink', 'yellow'],
    ['ink on blue tint', 'ink', 'blue-tint'],
    ['ink on red tint', 'ink', 'red-tint'],
    ['ink on soft', 'ink', 'soft'],
    ['muted on paper', 'muted', 'paper'],
    ['muted on soft', 'muted', 'soft'],
    ['blue label on blue tint', 'blue-label', 'blue-tint'],
    ['red label on red tint', 'red-label', 'red-tint']
  ];
  for (const [name, fg, bg] of pairs) assert.ok(contrast(token(fg), token(bg)) >= 4.5, `${name}: ${contrast(token(fg), token(bg)).toFixed(2)}`);
  for (const bright of ['red', 'yellow']) assert.ok(contrast(token('paper'), token(bright)) < 4.5, bright);
});
