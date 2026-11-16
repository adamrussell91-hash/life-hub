import { expect, test } from '@playwright/test';

/**
 * Returned work and feedback on the student page preview (invented student, no server):
 * the tab in time order, the three lines on a piece, and the guide (CURSOR-UI-FAILURES I19).
 */
for (const size of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
  test(`the guide never hides what it points at, at ${size.width}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/profile-preview.html?pointer=off');
    await page.locator('.pg-tab[data-tab="returned"]').click();
    const card = page.locator('.tour-card');
    await expect(card.locator('.tour-card__title')).toHaveText('Your feedback');
    const titles: string[] = [];
    for (let step = 1; step < 6; step += 1) {
      await card.locator('.tour-card__next').click();
      titles.push((await card.locator('.tour-card__title').textContent()) ?? '');
      const at = await page.evaluate(() => {
        const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect();
        const strip = document.querySelector('.ns-strip');
        return { spot: box('.tour-spot'), card: box('.tour-card'), strip: strip ? strip.getBoundingClientRect().bottom : 0, tall: window.innerHeight };
      });
      expect(at.spot.top, `${titles.at(-1)}: spotlight clears the Do this now strip`).toBeGreaterThanOrEqual(at.strip - 8);
      expect(at.card.bottom).toBeLessThanOrEqual(at.tall);
      if (size.width < 600) expect(at.card.top).toBeGreaterThanOrEqual(at.spot.top + 20);
    }
    expect(titles).toEqual(['New for you', 'What your teacher keeps saying', 'Every piece, in order', 'How you’re going', 'More detail']);
    await card.locator('.tour-card__next').click();
    await expect(card).toHaveCount(0);
    await expect(page.locator('.pg-panel .tour-help')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width);
  });
}

test('a dot previews its piece and opens it with three lines on top', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/profile-preview.html?pointer=off');
  await page.evaluate(() => localStorage.setItem('returned-feedback-tour:v1', 'seen'));
  await page.reload();
  await page.locator('.pg-tab[data-tab="returned"]').click();
  await expect(page.locator('.ru__card')).toHaveCount(2);
  // Two pieces came back on one day: their dots stack in one column.
  await expect(page.locator('.ft-day').last().locator('.ft-dot')).toHaveCount(2);
  await page.locator('.ft-chip').first().click();
  await expect(page.locator('.ft-say')).toContainText('The bright dots are where.');
  await page.locator('.ft-dot[data-piece="w:l1:b"]').click();
  await expect(page.locator('.ft-peek__title')).toHaveText('Harbour poems Q2');
  await page.locator('.ft-peek__open').click();
  await expect(page.locator('.fb3 dt')).toHaveText(['How you went', 'What changed', 'Your next step']);
  await expect(page.locator('.pg-piece details.pg-more')).not.toHaveAttribute('open', '');
});
