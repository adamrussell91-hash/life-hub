import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function nutritionGridMarkup() {
  const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
  const gridStart = html.indexOf('<div class="nutrition-grid">');
  assert.ok(gridStart >= 0, 'nutrition-grid should exist');
  const gridEnd = html.indexOf('meal-breakdown-card', gridStart);
  assert.ok(gridEnd > gridStart, 'meal-breakdown-card should follow nutrition-grid');
  return { html, grid: html.slice(gridStart, gridEnd) };
}

test('nutrition-grid drops the Energy, Protein, and Fat tiles', async () => {
  const { grid } = await nutritionGridMarkup();

  for (const ring of ['calories', 'protein', 'fat']) {
    assert.doesNotMatch(
      grid,
      new RegExp(`data-nutrition-ring="${ring}"`),
      `nutrition-grid should not contain a ${ring} ring`
    );
  }
});

test('nutrition-grid keeps Sodium, Calcium, and Polyphenols tiles', async () => {
  const { grid } = await nutritionGridMarkup();

  assert.match(grid, /data-nutrition-ring="sodium"/);
  assert.match(grid, /data-nutrition-ring="calcium"/);
  assert.match(grid, /data-nutrition="polyphenol"/);
});

test('the macro split hero remains intact', async () => {
  const { html } = await nutritionGridMarkup();

  assert.match(html, /id="nutrition-macro-split"/);
  assert.match(html, /data-split="protein"/);
  assert.match(html, /data-split="fat"/);
  assert.match(html, /data-split="energy"/);
});
