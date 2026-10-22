import { expect, test } from '@playwright/test';

test('thread focus fades other lines, links places, and adapts 1440↔390', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/annotation-threads.html');

  const root = page.locator('.block-annotation');
  await expect(root).toBeVisible();

  await page.locator('[data-thread-id="ann_motif"]').click();
  await expect(page.getByRole('button', { name: 'Show whole text' })).toBeVisible();
  await expect(page.locator('.block-annotation__focus-bar')).toContainText('Following a thread');

  await expect(page.locator('.block-annotation__fold')).toHaveCount(0);
  await expect(page.locator('[data-line-id="line_1"]')).not.toHaveClass(/is-thread-faded/);
  await expect(page.locator('[data-line-id="line_2"]')).toHaveClass(/is-thread-faded/);
  await expect(page.locator('.block-annotation__pip')).toHaveCount(5);
  await expect(page.locator('.block-annotation__thread-link path')).toHaveCount(1);

  // Every place's note shows under its line; stepping happens from the note itself.
  await expect(page.locator('.block-annotation__stop-note')).toHaveCount(5);
  await page.getByRole('button', { name: 'Go through each place' }).click();
  const current = page.locator('.block-annotation__stop-note.is-current');
  await expect(current).toContainText('Place 1 of 5');
  await current.getByRole('button', { name: 'Next ›' }).click();
  await expect(current).toContainText('Place 2 of 5');
  await expect(current).toBeInViewport();

  await page.locator('.block-annotation__chip', { hasText: 'Structure' }).click();
  await expect(page.getByRole('button', { name: 'Show whole text' })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.locator('.block-annotation__thread-pick').click();
  await page.locator('.block-annotation__sheet [data-thread-id="ann_motif"]').click();
  await expect(page.getByRole('button', { name: 'Show whole text' })).toBeVisible();
  await expect(page.locator('[data-line-id="line_2"]')).toHaveClass(/is-thread-faded/);
  await expect(page.locator('.block-annotation__thread-link path')).toHaveCount(1);
});
