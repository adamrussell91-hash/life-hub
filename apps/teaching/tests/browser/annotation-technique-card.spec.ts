import { expect, test } from '@playwright/test';

for (const width of [1440, 390]) {
  test(`technique card is interactive at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/annotation-technique.html');
    await page.locator('[data-annotation-id="ann_beggars"]').first().click();

    const card = page.locator('.block-annotation__element');
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('data-technique-id', 'simile');

    // In this poem: jump to the other simile.
    await expect(card.locator('.block-annotation__element-spot')).toContainText(['like hags']);

    // Connections open a connected card, with a way back.
    const firstLink = card.locator('.block-annotation__element-rel, .block-annotation__element-relchip').first();
    await firstLink.click();
    await expect(card).not.toHaveAttribute('data-technique-id', 'simile');
    await card.locator('.block-annotation__element-back').click();
    await expect(card).toHaveAttribute('data-technique-id', 'simile');

    // Check yourself.
    await card.locator('.block-annotation__element-quiz-opt', { hasText: /^Simile$/ }).click();
    await expect(card.locator('.block-annotation__element-quiz-score')).toHaveText('1 of 1');

    // No sideways scroll at phone width.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    await card.screenshot({ path: `test-results/technique-card-${width}.png` });

    await card.locator('.block-annotation__element-spot').first().click();
    await expect(page.locator('.block-annotation__element')).toBeVisible();
  });
}

test('technique family colours recolour the marks and show a key', async ({ page }) => {
  await page.goto('/annotation-technique.html');
  const toggle = page.getByRole('button', { name: 'Colour by technique family' });
  await toggle.click();
  await expect(page.locator('.block-annotation__family-swatch')).toHaveText([
    'Descriptive',
    'Repetitive',
    'Comparative'
  ]);
  await expect(page.locator('[data-annotation-id="ann_beggars"]')).toHaveClass(/--fam-comparative/);
});
