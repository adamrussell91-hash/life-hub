import { expect, test } from '@playwright/test';

test('thread focus folds, survives stop change, and adapts 1440↔390', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/annotation-threads.html');

  const root = page.locator('.block-annotation');
  await expect(root).toBeVisible();

  await page.locator('[data-thread-id="ann_motif"]').click();
  await expect(page.getByRole('button', { name: 'Show whole text' })).toBeVisible();

  const folds = page.locator('.block-annotation__fold');
  await expect(folds.first()).toBeVisible();
  const firstLabel = await folds.first().getAttribute('aria-label');
  expect(firstLabel || '').toMatch(/Show \d+ hidden lines/);

  await expect(page.locator('[data-line-id="line_1"]')).toBeVisible();
  await expect(page.locator('[data-line-id="line_2"]')).toHaveCount(0);
  await expect(page.locator('.block-annotation__focus-bar')).toContainText('Following a thread');
  await expect(page.locator('.block-annotation__pip').first()).toBeVisible();

  await folds.first().click();
  await expect(folds.first()).toHaveAttribute('aria-expanded', 'true');
  const foldId = await folds.first().getAttribute('data-fold-id');

  await page.locator('.block-annotation__chip', { hasText: 'Structure' }).click();
  await expect(page.locator(`[data-fold-id="${foldId}"]`)).toHaveAttribute(
    'aria-expanded',
    'true'
  );
  await expect(page.getByRole('button', { name: 'Show whole text' })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.locator('.block-annotation__thread-pick').click();
  await page.locator('.block-annotation__sheet [data-thread-id="ann_motif"]').click();
  await expect(page.getByRole('button', { name: 'Show whole text' })).toBeVisible();
  await expect(page.locator('.block-annotation__arcs')).toHaveCount(0);
  await expect(page.locator('.block-annotation__pip').first()).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await page.locator('[data-thread-id="ann_motif"]').click();
  await expect(page.locator('.block-annotation__pip')).toHaveCount(5);
  await expect(page.locator('.block-annotation__fold').first()).toBeVisible();
});
