// tests/unit/get-things-done-css.test.js
// Gear Shifter's stylesheet: its tokens, and the .gt-scope re-skin of Decision Maker's family
// charts and of Problem Solver's Kanban and 5 Whys (Plan 2).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async (path) => (await readFile(new URL(path, import.meta.url), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '');
const gt = await read('../../packages/get-things-done/get-things-done.css');
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

test('every Decision Maker token is remapped to a Gear Shifter one under .gt-scope', () => {
  const block = /\.gt-scope\s*\{([^}]*)\}/.exec(gt)[1];
  const names = [...new Set([...dm.matchAll(/^\s*(--dm-[a-z-]+):/gm)].map((m) => m[1]))];
  assert.ok(names.length >= 15, names.join(' '));
  for (const name of names) assert.match(block, new RegExp(`${name}:\\s*var\\(--gt-[a-z-]+\\)`), name);
});

test('Decision Maker keeps its own look: its hard-coded colours became tokens of the same value', () => {
  assert.equal(token(dm, 'dm-muted'), '#66675d');
  assert.equal(token(dm, 'dm-contested'), '#b8301f');
  assert.equal(token(dm, 'dm-band'), '#3c7420');
  const outsideTokens = dm.replace(/\.dm-scope\s*\{[^}]*\}/, '');
  for (const hex of ['#66675d', '#b8301f', '#3c7420']) assert.doesNotMatch(outsideTokens, new RegExp(hex, 'i'), hex);
});

test('the .dm-scope-only rules have .gt-scope twins', () => {
  for (const selector of ['.dm-details__card', '.dm-details__card--red', '.dm-details__card--green', '.dm-details__card--tint']) {
    assert.match(dm, new RegExp(`\\.dm-scope ${selector.replace(/[.-]/g, (c) => `\\${c}`)}\\s*\\{`), selector);
    assert.match(gt, new RegExp(`\\.gt-scope ${selector.replace(/[.-]/g, (c) => `\\${c}`)}\\s*\\{`), selector);
  }
});

test('every text pair the re-skin makes reads at 4.5:1', () => {
  const t = (name) => token(gt, `gt-${name}`);
  const pairs = [
    ['paper on blue label (DM green)', t('paper'), t('blue-label')],
    ['white on blue label (Kanban Doing, 5 Whys root)', '#ffffff', t('blue-label')],
    ['paper on red label', t('paper'), t('red-label')],
    ['white on red label (Kanban To do, 5 Whys problem)', '#ffffff', t('red-label')],
    ['ink on amber (Kanban Done)', t('ink'), t('amber')],
    ['paper on ink', t('paper'), t('ink')],
    ['ink on paper', t('ink'), t('paper')],
    ['ink on red tint', t('ink'), t('red-tint')],
    ['ink on blue tint', t('ink'), t('blue-tint')],
    ['ink on soft', t('ink'), t('soft')],
    ['muted on paper', t('muted'), t('paper')],
    ['muted on soft', t('muted'), t('soft')],
    ['contested on red tint', t('red-deep'), t('red-tint')],
    ['band on blue tint', t('blue-deep'), t('blue-tint')],
    ['amber label on paper', t('amber-label'), t('paper')]
  ];
  for (const [name, fg, bg] of pairs) assert.ok(contrast(fg, bg) >= 4.5, `${name}: ${contrast(fg, bg).toFixed(2)}`);
  // The bright cobalt and vermilion are for shapes, rings and gears: never for small text.
  for (const bright of [t('blue'), t('red')]) {
    assert.ok(contrast(t('paper'), bright) < 4.5);
    assert.ok(contrast(t('ink'), bright) < 4.5);
  }
});

test('where Decision Maker put ink on its red label, Gear Shifter puts paper', () => {
  assert.match(gt, /\.gt-scope \.dm-qk__row\[data-answer='no'\] \.dm-qk__chip,\s*\.gt-scope \.dm-qk__answer\[data-answer='no'\]\s*\{\s*color: var\(--gt-paper\);/);
});

test('Kanban and 5 Whys take the Gear Shifter palette inside .gt-scope only', () => {
  const kanban = /\.gt-scope \.ps-kanban\s*\{([^}]*)\}/.exec(gt)[1];
  assert.match(kanban, /--ps-red:\s*var\(--gt-red-label\)/);
  assert.match(kanban, /--ps-blue:\s*var\(--gt-blue-label\)/);
  assert.match(kanban, /--ps-yellow:\s*var\(--gt-amber\)/);
  assert.match(kanban, /--ps-on-yellow:\s*var\(--gt-ink\)/);
  assert.match(gt, /\.gt-scope \.ps-kanban__board\s*\{\s*--ps-kanban-on-red:\s*var\(--gt-paper\);/);
  const whys = /\.gt-scope \.ps-whys\s*\{([^}]*)\}/.exec(gt)[1];
  assert.match(whys, /--ps-red:\s*var\(--gt-red-label\)/);
  assert.match(whys, /--ps-yellow:\s*var\(--gt-blue-tint\)/);
  assert.match(whys, /--ps-blue:\s*var\(--gt-blue-label\)/);
  assert.doesNotMatch(gt.replace(/\.gt-scope[^{]*\{[^}]*\}/g, ''), /--ps-/, 'no unscoped Problem Solver token');
});

test('no text under 11px and no shadows or gradients in Gear Shifter\'s own rules', () => {
  for (const m of gt.matchAll(/font(?:-size)?:[^;]*?(\d+(?:\.\d+)?)px/g)) assert.ok(Number(m[1]) >= 11, m[0]);
  for (const m of gt.matchAll(/box-shadow:\s*([^;]+);/g)) assert.equal(m[1].trim(), 'none');
  assert.doesNotMatch(gt, /gradient\(/);
});
