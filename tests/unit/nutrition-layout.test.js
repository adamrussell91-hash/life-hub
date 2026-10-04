import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function nutritionDashboardMarkup() {
  const html = await readFile(new URL('../../apps/life/index.html', import.meta.url), 'utf8');
  const start = html.indexOf('id="nutrition-dashboard"');
  assert.ok(start >= 0);
  const end = html.indexOf('id="fitness-dashboard"', start);
  assert.ok(end > start);
  return html.slice(start, end);
}

test('the Today card holds the nested rings, the protein climb and the Brisket note', async () => {
  const dash = await nutritionDashboardMarkup();
  assert.match(dash, /id="nutrition-today"/);
  assert.match(dash, /id="nutrition-rings"/);
  assert.match(dash, /id="nutrition-ring-legend"/);
  assert.match(dash, /id="nutrition-climb"/);
  assert.match(dash, /data-nutrition="advice"/);
});

test('week grid and the chosen day share a row; the 30-day strip follows', async () => {
  const dash = await nutritionDashboardMarkup();
  const row = dash.indexOf('class="nutrition-week-row"');
  assert.ok(row > dash.indexOf('id="nutrition-today"'));
  assert.ok(dash.indexOf('id="nutrition-meal-history"') > row);
  assert.ok(dash.indexOf('id="nutrition-meal-day"') > dash.indexOf('id="nutrition-meal-history"'));
  assert.ok(dash.indexOf('id="nutrition-consistency-strip"') > dash.indexOf('id="nutrition-meal-day"'));
});

test('retired nutrition charts are removed, not hidden', async () => {
  const dash = await nutritionDashboardMarkup();
  for (const retired of [
    /nutrition-macro-split/, /data-split=/, /nutrition-grid/, /data-nutrition-ring=/, /nutrition-meal-protein-pie/,
    /nutrition-(protein|fat|calories|carbs)-chart/, /nutrition-heatmap/, /week-compare/, /This week vs prior/
  ]) {
    assert.doesNotMatch(dash, retired);
  }
});

test('nutrition charts rest on final geometry and only animate while a card is playing', async () => {
  const css = await readFile(new URL('../../apps/life/css/app.css', import.meta.url), 'utf8');
  for (const selector of ['nutrition-ring__fill', 'climb-line', 'week-grid__bar', 'consistency-strip__bar']) {
    const rule = new RegExp(`\\.is-playing \\.${selector}[^{]*\\{[^}]*animation:`);
    assert.match(css, rule, `${selector} animates only under .is-playing`);
  }
  assert.match(css, /prefers-reduced-motion: reduce\)\s*\{\s*\.is-playing \* \{ animation: none !important; \}/);
  assert.doesNotMatch(css, /\.nutrition-grid\b/);
  assert.doesNotMatch(css, /\.macro-split\b/);
});
