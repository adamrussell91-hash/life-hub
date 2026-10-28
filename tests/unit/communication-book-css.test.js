// tests/unit/communication-book-css.test.js
// The Communication Book's stylesheet: the pack's screen palette, the .cmb-scope re-skin of
// Decision Maker's family charts, the emblems' currentColor set to the book's ink, and the text
// pairs it makes reading at 4.5:1 (the pack's grey and gold reach only 3:1, so they never carry
// text). The Tasks view's own stylesheet is checked by its app test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async (path) => (await readFile(new URL(path, import.meta.url), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
const cm = await read('../../packages/communication-book/communication-book.css');
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
const t = (name) => token(cm, `cmb-${name}`);

test('the pack’s screen palette: warm paper, black ink, warm grey and gold', () => {
  assert.deepEqual([t('paper'), t('ink'), t('grey'), t('gold')], ['#fffefb', '#000000', '#96938f', '#aa914e']);
  assert.doesNotMatch(cm, /#613fad|#007d97|#a06400|--cb-|--ch-|--cm-/i, 'neither the Collaboration Book’s nor the coverage map’s tokens');
});

test('the pack’s grey and gold reach 3:1 on paper, enough for marks and rules only', () => {
  for (const name of ['grey', 'gold']) {
    assert.ok(contrast(t(name), t('paper')) >= 3, name);
    assert.ok(contrast(t(name), t('paper')) < 4.5, `${name} is not a text colour`);
  }
  for (const m of cm.matchAll(/(?:^|[;{\s])color:\s*var\(--cmb-(grey|gold)\)/g)) assert.fail(`text in ${m[1]}`);
});

test('every Decision Maker token is remapped to a Communication Book one under .cmb-scope', () => {
  const block = /\.cmb-scope\s*\{([^}]*)\}/.exec(cm)[1];
  const names = [...new Set([...dm.matchAll(/^\s*(--dm-[a-z-]+):/gm)].map((m) => m[1]))];
  assert.ok(names.length >= 15, names.join(' '));
  for (const name of names) assert.match(block, new RegExp(`${name}:\\s*var\\(--cmb-[a-z-]+\\)`), name);
  // Decision Maker sets text in red and paper text on green: both take the label shades here.
  assert.match(block, /--dm-red:\s*var\(--cmb-gold-label\)/);
  assert.match(block, /--dm-green:\s*var\(--cmb-grey-label\)/);
});

test('the .dm-scope-only rules have .cmb-scope twins', () => {
  for (const selector of ['.dm-details__card', '.dm-details__card--red', '.dm-details__card--green', '.dm-details__card--tint']) {
    assert.match(cm, new RegExp(`\\.cmb-scope ${selector.replace(/[.-]/g, (c) => `\\${c}`)}\\s*\\{`), selector);
  }
});

test('the emblems’ currentColor is the book’s ink', () => {
  assert.match(/\.cmb-emblem\s*\{([^}]*)\}/.exec(cm)[1], /color:\s*var\(--cmb-ink/);
});

test('every text pair the re-skin makes reads at 4.5:1', () => {
  const pairs = [
    ['paper on grey label (DM green)', t('paper'), t('grey-label')],
    ['paper on gold label (DM red)', t('paper'), t('gold-label')],
    ['gold label on paper (DM red text)', t('gold-label'), t('paper')],
    ['grey label on paper', t('grey-label'), t('paper')],
    ['paper on ink', t('paper'), t('ink')],
    ['ink on paper', t('ink'), t('paper')],
    ['ink on gold tint', t('ink'), t('gold-tint')],
    ['ink on grey tint', t('ink'), t('grey-tint')],
    ['ink on soft', t('ink'), t('soft')],
    ['muted on paper', t('muted'), t('paper')],
    ['muted on soft', t('muted'), t('soft')],
    ['muted on grey tint', t('muted'), t('grey-tint')],
    ['gold label on gold tint', t('gold-label'), t('gold-tint')],
    ['grey label on grey tint', t('grey-label'), t('grey-tint')]
  ];
  for (const [name, fg, bg] of pairs) assert.ok(contrast(fg, bg) >= 4.5, `${name}: ${contrast(fg, bg).toFixed(2)}`);
});

test('no unscoped Problem Solver token; no text under 11px, no rounded corners, shadows or gradients in the book’s own rules', () => {
  assert.doesNotMatch(cm.replace(/\.cmb-scope[^{]*\{[^}]*\}/g, ''), /--ps-/, 'no unscoped Problem Solver token');
  for (const m of cm.matchAll(/font(?:-size)?:[^;]*?(\d+(?:\.\d+)?)px/g)) assert.ok(Number(m[1]) >= 11, m[0]);
  for (const m of cm.matchAll(/border-radius:\s*([^;]+);/g)) assert.equal(m[1].trim(), '0', 'the pack’s bars are square-ended');
  for (const m of cm.matchAll(/box-shadow:\s*([^;]+);/g)) assert.equal(m[1].trim(), 'none');
  assert.doesNotMatch(cm, /gradient\(/);
});
