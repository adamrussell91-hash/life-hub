import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function nutritionDashboardMarkup() {
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  const start = html.indexOf('id="nutrition-dashboard"');
  assert.ok(start >= 0);
  const end = html.indexOf('id="fitness-dashboard"', start);
  assert.ok(end > start);
  return html.slice(start, end);
}

test('nutrition-grid includes Sodium, Calcium, Polyphenols, and Protein by meal pie', async () => {
  const dash = await nutritionDashboardMarkup();
  assert.match(dash, /data-nutrition-ring="sodium"/);
  assert.match(dash, /data-nutrition-ring="calcium"/);
  assert.match(dash, /data-nutrition="polyphenol"/);
  assert.match(dash, /id="nutrition-meal-protein-pie"/);
  assert.match(dash, /Protein by meal/);
  assert.doesNotMatch(dash, /class="meal-breakdown-card"/);
  assert.doesNotMatch(dash, /class="meal-breakdown"/);
});

test('protein and fat week charts sit in a pair; energy and carbs sit in a pair', async () => {
  const dash = await nutritionDashboardMarkup();
  assert.match(dash, /id="nutrition-protein-chart"/);
  assert.match(dash, /id="nutrition-fat-chart"/);
  assert.match(dash, /id="nutrition-calories-chart"/);
  assert.match(dash, /id="nutrition-carbs-chart"/);
  assert.doesNotMatch(dash, /id="nutrition-hit-strip"/);
  assert.match(dash, /nutrition-week-charts/);
  assert.match(dash, /class="nutrition-week-charts nutrition-week-charts--macros"/);
  assert.match(dash, /class="nutrition-week-charts nutrition-week-charts--energy"/);
});

test('week compare exposes summary slots and 14-slot column host', async () => {
  const dash = await nutritionDashboardMarkup();
  assert.match(dash, /data-value="week-compare-this"/);
  assert.match(dash, /data-value="week-compare-prior"/);
  assert.match(dash, /data-value="week-compare-delta"/);
  assert.match(dash, /id="nutrition-week-compare"/);
  assert.match(dash, /week-compare-columns/);
  assert.doesNotMatch(dash, /id="nutrition-week-compare"[^>]*line-chart/);
  assert.doesNotMatch(dash, /id="nutrition-week-compare"[\s\S]*?data-role="value-labels"/);
});

test('nutrition-grid stays dense: smaller rings and 2×2 on narrow, not full-bleed stack', async () => {
  const css = await readFile(new URL('../../css/app.css', import.meta.url), 'utf8');
  assert.match(css, /\.nutrition-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*1fr\)/);
  assert.match(css, /\.nutrition-grid\s+\.metric-ring\s*\{[^}]*3\.5rem/);
  assert.match(css, /\.nutrition-grid\s*\{\s*grid-template-columns:\s*1fr 1fr\s*;\s*\}/);
  assert.equal((css.match(/\.nutrition-grid\s*\{\s*grid-template-columns:\s*1fr\s*;\s*\}/g) || []).length, 0);
});

test('the macro split hero remains intact', async () => {
  const dash = await nutritionDashboardMarkup();
  assert.match(dash, /id="nutrition-macro-split"/);
  assert.match(dash, /data-split="protein"/);
  assert.match(dash, /data-split="fat"/);
  assert.match(dash, /data-split="energy"/);
});
