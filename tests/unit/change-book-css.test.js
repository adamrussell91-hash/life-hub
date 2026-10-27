// tests/unit/change-book-css.test.js
// The Change Book's stylesheet: the pack's screen palette, the .ch-scope re-skin of Decision
// Maker's family charts and of Problem Solver's concept map, and the text pairs it makes reading
// at 4.5:1.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async (path) => (await readFile(new URL(path, import.meta.url), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
const ch = await read('../../packages/change-book/change-book.css');
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

test('the pack’s screen palette, not the Rules Book’s', () => {
  const t = (name) => token(ch, `ch-${name}`);
  assert.deepEqual([t('paper'), t('ink'), t('teal'), t('copper')], ['#f5f1e7', '#262625', '#084953', '#af6e41']);
  assert.doesNotMatch(ch, /#3a3a9a|#e0581a|--rb-/i);
});

test('every Decision Maker token is remapped to a Change Book one under .ch-scope', () => {
  const block = /\.ch-scope\s*\{([^}]*)\}/.exec(ch)[1];
  const names = [...new Set([...dm.matchAll(/^\s*(--dm-[a-z-]+):/gm)].map((m) => m[1]))];
  assert.ok(names.length >= 15, names.join(' '));
  for (const name of names) assert.match(block, new RegExp(`${name}:\\s*var\\(--ch-[a-z-]+\\)`), name);
});

test('the .dm-scope-only rules have .ch-scope twins', () => {
  for (const selector of ['.dm-details__card', '.dm-details__card--red', '.dm-details__card--green', '.dm-details__card--tint']) {
    assert.match(ch, new RegExp(`\\.ch-scope ${selector.replace(/[.-]/g, (c) => `\\${c}`)}\\s*\\{`), selector);
  }
});

test('every text pair the re-skin makes reads at 4.5:1', () => {
  const t = (name) => token(ch, `ch-${name}`);
  const pairs = [
    ['paper on teal (DM green)', t('paper'), t('teal')],
    ['paper on copper label (DM red label)', t('paper'), t('copper-label')],
    ['white on copper label (Rhizome centre pill)', '#ffffff', t('copper-label')],
    ['white on teal (Rhizome context pill)', '#ffffff', t('teal')],
    ['ink on teal tint (Rhizome context pill)', t('ink'), t('teal-tint')],
    ['paper on ink', t('paper'), t('ink')],
    ['ink on paper', t('ink'), t('paper')],
    ['ink on copper tint', t('ink'), t('copper-tint')],
    ['ink on soft', t('ink'), t('soft')],
    ['muted on paper', t('muted'), t('paper')],
    ['muted on soft', t('muted'), t('soft')],
    ['copper label on copper tint', t('copper-label'), t('copper-tint')],
    ['teal label on teal tint', t('teal-label'), t('teal-tint')],
    ['teal label on paper', t('teal-label'), t('paper')]
  ];
  for (const [name, fg, bg] of pairs) assert.ok(contrast(fg, bg) >= 4.5, `${name}: ${contrast(fg, bg).toFixed(2)}`);
  // Copper is for the one large hinge: never for small text on paper.
  assert.ok(contrast(t('paper'), t('copper')) < 4.5);
});

test('the concept map takes the Change Book palette inside .ch-scope only', () => {
  const cmap = /\.ch-scope \.ps-cmap\s*\{([^}]*)\}/.exec(ch)[1];
  assert.match(cmap, /--ps-red:\s*var\(--ch-copper-label\)/);
  assert.match(cmap, /--ps-blue:\s*var\(--ch-teal\)/);
  assert.match(cmap, /--ps-yellow:\s*var\(--ch-teal-tint\)/);
  assert.match(cmap, /--ps-on-yellow:\s*var\(--ch-ink\)/);
  assert.doesNotMatch(ch.replace(/\.ch-scope[^{]*\{[^}]*\}/g, ''), /--ps-/, 'no unscoped Problem Solver token');
});

test('no text under 11px and no shadows or gradients in the Change Book’s own rules', () => {
  for (const m of ch.matchAll(/font(?:-size)?:[^;]*?(\d+(?:\.\d+)?)px/g)) assert.ok(Number(m[1]) >= 11, m[0]);
  for (const m of ch.matchAll(/box-shadow:\s*([^;]+);/g)) assert.equal(m[1].trim(), 'none');
  assert.doesNotMatch(ch, /gradient\(/);
});
