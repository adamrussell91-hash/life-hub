// tests/unit/rules-book-css.test.js
// The Rules Book's stylesheet: its tokens, the .rb-scope re-skin of Decision Maker's family charts
// and of Problem Solver's Pareto, and the text pairs it makes reading at 4.5:1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async (path) => (await readFile(new URL(path, import.meta.url), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
const rb = await read('../../packages/rules-book/rules-book.css');
const dm = await read('../../packages/decision-book/decision-book.css');
const token = (css, name) => new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(css)?.[1];

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('the book’s screen palette', () => {
  const t = (name) => token(rb, `rb-${name}`);
  assert.deepEqual([t('indigo'), t('orange'), t('yellow'), t('grey'), t('paper'), t('ink')], ['#3a3a9a', '#e0581a', '#fcea24', '#8e8f8a', '#fffef9', '#14142b']);
});

test('every Decision Maker token is remapped to a Rules Book one under .rb-scope', () => {
  const block = /\.rb-scope\s*\{([^}]*)\}/.exec(rb)[1];
  const names = [...new Set([...dm.matchAll(/^\s*(--dm-[a-z-]+):/gm)].map((m) => m[1]))];
  assert.ok(names.length >= 15, names.join(' '));
  for (const name of names) assert.match(block, new RegExp(`${name}:\\s*var\\(--rb-[a-z-]+\\)`), name);
});

test('the .dm-scope-only rules have .rb-scope twins', () => {
  for (const selector of ['.dm-details__card', '.dm-details__card--red', '.dm-details__card--green', '.dm-details__card--tint']) {
    assert.match(rb, new RegExp(`\\.rb-scope ${selector.replace(/[.-]/g, (c) => `\\${c}`)}\\s*\\{`), selector);
  }
});

test('every text pair the re-skin makes reads at 4.5:1', () => {
  const t = (name) => token(rb, `rb-${name}`);
  const pairs = [
    ['paper on indigo (DM green)', t('paper'), t('indigo')],
    ['paper on orange label (DM red label)', t('paper'), t('orange-label')],
    ['ink on yellow (Pareto bars)', t('ink'), t('yellow')],
    ['paper on ink', t('paper'), t('ink')],
    ['ink on paper', t('ink'), t('paper')],
    ['ink on orange tint', t('ink'), t('orange-tint')],
    ['ink on indigo tint', t('ink'), t('indigo-tint')],
    ['ink on soft', t('ink'), t('soft')],
    ['muted on paper', t('muted'), t('paper')],
    ['muted on soft', t('muted'), t('soft')],
    ['orange label on orange tint', t('orange-label'), t('orange-tint')],
    ['indigo label on indigo tint', t('indigo-label'), t('indigo-tint')],
    ['indigo label on paper', t('indigo-label'), t('paper')]
  ];
  for (const [name, fg, bg] of pairs) assert.ok(contrast(fg, bg) >= 4.5, `${name}: ${contrast(fg, bg).toFixed(2)}`);
  // The bright orange, yellow and grey are for shapes: never for small text on paper.
  for (const bright of [t('orange'), t('yellow'), t('grey')]) assert.ok(contrast(t('paper'), bright) < 4.5, bright);
});

test('Pareto takes the Rules Book palette inside .rb-scope only', () => {
  const pareto = /\.rb-scope \.ps-pareto\s*\{([^}]*)\}/.exec(rb)[1];
  assert.match(pareto, /--ps-red:\s*var\(--rb-orange-label\)/);
  assert.match(pareto, /--ps-yellow:\s*var\(--rb-yellow\)/);
  assert.match(pareto, /--ps-on-yellow:\s*var\(--rb-ink\)/);
  assert.match(pareto, /--ps-blue:\s*var\(--rb-indigo\)/);
  assert.doesNotMatch(rb.replace(/\.rb-scope[^{]*\{[^}]*\}/g, ''), /--ps-/, 'no unscoped Problem Solver token');
});

test('no text under 11px and no shadows or gradients in the Rules Book’s own rules', () => {
  for (const m of rb.matchAll(/font(?:-size)?:[^;]*?(\d+(?:\.\d+)?)px/g)) assert.ok(Number(m[1]) >= 11, m[0]);
  for (const m of rb.matchAll(/box-shadow:\s*([^;]+);/g)) assert.equal(m[1].trim(), 'none');
  assert.doesNotMatch(rb, /gradient\(/);
});
