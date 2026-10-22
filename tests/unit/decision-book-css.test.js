// tests/unit/decision-book-css.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../../packages/decision-book/decision-book.css', import.meta.url), 'utf8');
const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');
const token = (name) => new RegExp(`--dm-${name}:\\s*(#[0-9a-f]{6})`, 'i').exec(css)[1];

/** WCAG relative luminance and contrast ratio. */
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('no text under 11px', () => {
  const sizes = [...rules.matchAll(/font(?:-size)?:[^;]*?(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
  assert.ok(sizes.length > 20);
  for (const size of sizes) assert.ok(size >= 11, `font size ${size}px`);
});

test('flat: no shadows except removing one, no gradients', () => {
  for (const m of rules.matchAll(/box-shadow:\s*([^;]+);/g)) assert.equal(m[1].trim(), 'none');
  assert.doesNotMatch(rules, /gradient\(/);
});

test('one named chart container; phone rules for every family, never styling the container itself', () => {
  assert.equal([...rules.matchAll(/container:\s*dmchart \/ inline-size/g)].length, 1);
  assert.doesNotMatch(rules, /@container \(/);
  const phone = rules.slice(rules.indexOf('@container dmchart (max-width: 480px)'));
  assert.ok(phone.length > 100, 'phone block exists');
  assert.doesNotMatch(phone, /\.dm-chart\s*\{/);
  for (const family of ['dm-quad', 'dm-plot', 'dm-scales', 'dm-curve', 'dm-tension', 'dm-path', 'dm-list', 'dm-box', 'outside-box', 'dm-record']) assert.match(phone, new RegExp(family), family);
});

test('the palette pairs the charts use are readable', () => {
  const [ink, paper, red, green, soft] = ['ink', 'paper', 'red', 'green', 'soft'].map(token);
  const [redTint, greenTint, redLabel] = ['red-tint', 'green-tint', 'red-label'].map(token);
  const pairs = [
    ['ink on red label', ink, redLabel],
    ['paper on green', paper, green],
    ['paper on ink', paper, ink],
    ['ink on red tint', ink, redTint],
    ['ink on green tint', ink, greenTint],
    ['ink on soft', ink, soft],
    ['muted text on paper', '#66675d', paper],
    ['contested red on red tint', '#b8301f', redTint],
    ['band green on green tint', '#3c7420', greenTint]
  ];
  for (const [name, fg, bg] of pairs) assert.ok(contrast(fg, bg) >= 4.5, `${name}: ${contrast(fg, bg).toFixed(2)}`);
  // Why text on red sits on the brighter label red: neither ink nor white reads on --dm-red.
  assert.ok(contrast('#ffffff', red) < 4.5);
  assert.ok(contrast(ink, red) < 4.5);
});

test('the re-skin covers exactly the four reused Problem Solver charts', () => {
  assert.match(rules, /\.dm-scope :is\(\.ps-swot, \.ps-morph, \.ps-pareto, \.ps-dloop\) \{\s*--ps-red: var\(--dm-red-label\);\s*--ps-blue: var\(--dm-ink\);\s*--ps-yellow: var\(--dm-green\);\s*--ps-on-yellow: var\(--dm-paper\);/);
});
