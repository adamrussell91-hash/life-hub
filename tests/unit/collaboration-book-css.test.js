// tests/unit/collaboration-book-css.test.js
// The Collaboration Book's stylesheet: the pack's screen palette, the .cb-scope re-skin of
// Decision Maker's family charts, the emblems' currentColor set to the book's purple, and the
// text pairs it makes reading at 4.5:1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async (path) => (await readFile(new URL(path, import.meta.url), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
const cb = await read('../../packages/collaboration-book/collaboration-book.css');
const view = await read('../../apps/tasks/src/views/collaboration-book/collaboration-book-view.css');
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
const t = (name) => token(cb, `cb-${name}`);

test('the pack’s screen palette, not the Change Book’s', () => {
  assert.deepEqual([t('paper'), t('ink'), t('purple'), t('cyan'), t('gold')], ['#fffdf6', '#241b36', '#613fad', '#007d97', '#a06400']);
  assert.doesNotMatch(cb + view, /#084953|#af6e41|--ch-|teal|copper/i);
});

test('every Decision Maker token is remapped to a Collaboration Book one under .cb-scope', () => {
  const block = /\.cb-scope\s*\{([^}]*)\}/.exec(cb)[1];
  const names = [...new Set([...dm.matchAll(/^\s*(--dm-[a-z-]+):/gm)].map((m) => m[1]))];
  assert.ok(names.length >= 15, names.join(' '));
  for (const name of names) assert.match(block, new RegExp(`${name}:\\s*var\\(--cb-[a-z-]+\\)`), name);
});

test('the .dm-scope-only rules have .cb-scope twins', () => {
  for (const selector of ['.dm-details__card', '.dm-details__card--red', '.dm-details__card--green', '.dm-details__card--tint']) {
    assert.match(cb, new RegExp(`\\.cb-scope ${selector.replace(/[.-]/g, (c) => `\\${c}`)}\\s*\\{`), selector);
  }
});

test('the emblems’ currentColor is the book’s purple', () => {
  assert.match(/\.cb-emblem\s*\{([^}]*)\}/.exec(cb)[1], /color:\s*var\(--cb-purple/);
});

test('every text pair the re-skin makes reads at 4.5:1', () => {
  const pairs = [
    ['paper on cyan (DM green)', t('paper'), t('cyan')],
    ['paper on gold label (DM red label)', t('paper'), t('gold-label')],
    ['paper on purple', t('paper'), t('purple')],
    ['purple on paper', t('purple'), t('paper')],
    ['paper on ink', t('paper'), t('ink')],
    ['ink on paper', t('ink'), t('paper')],
    ['ink on gold tint', t('ink'), t('gold-tint')],
    ['ink on cyan tint', t('ink'), t('cyan-tint')],
    ['ink on purple tint', t('ink'), t('purple-tint')],
    ['ink on soft', t('ink'), t('soft')],
    ['muted on paper', t('muted'), t('paper')],
    ['muted on soft', t('muted'), t('soft')],
    ['gold label on gold tint', t('gold-label'), t('gold-tint')],
    ['cyan label on cyan tint', t('cyan-label'), t('cyan-tint')],
    ['cyan label on paper', t('cyan-label'), t('paper')],
    ['gold on paper', t('gold'), t('paper')]
  ];
  for (const [name, fg, bg] of pairs) assert.ok(contrast(fg, bg) >= 4.5, `${name}: ${contrast(fg, bg).toFixed(2)}`);
});

test('no unscoped Problem Solver token; no text under 11px and no shadows or gradients in the book’s own rules', () => {
  assert.doesNotMatch(cb.replace(/\.cb-scope[^{]*\{[^}]*\}/g, ''), /--ps-/, 'no unscoped Problem Solver token');
  for (const m of cb.matchAll(/font(?:-size)?:[^;]*?(\d+(?:\.\d+)?)px/g)) assert.ok(Number(m[1]) >= 11, m[0]);
  for (const m of cb.matchAll(/box-shadow:\s*([^;]+);/g)) assert.equal(m[1].trim(), 'none');
  assert.doesNotMatch(cb, /gradient\(/);
});
