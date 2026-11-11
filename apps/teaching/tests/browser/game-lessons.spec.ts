import { expect, test } from '@playwright/test';

/**
 * Game lessons, Phase 1 shells, on the invented Harbour Lights lesson the mock seeds
 * (scripts/mock-api.ts seedGameLesson; tests/unit/helpers/game-fixture.mjs): the
 * teacher's build tabs at desktop, the student's arcade at 390.
 */

test('teacher build tabs at desktop', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/lessons/lesson_game_harbour');
  const tabs = page.locator('.gm-tabs');
  await expect(tabs).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.gm-game-row')).toHaveCount(4);
  await expect(page.locator('.gm-game-head .gm-title-input')).toHaveValue('Technique crossword');
  // The block canvas is the "Before you play" page only.
  await expect(page.locator('.lesson-page__canvas')).toBeHidden();
  await tabs.locator('[data-tab="before"]').click();
  await expect(page.locator('.lesson-page__canvas')).toBeVisible();
  await tabs.locator('[data-tab="settings"]').click();
  await expect(page.locator('.lesson-page__canvas')).toBeHidden();
  await expect(page.getByText('Closes 18/12/26')).toBeVisible();
  await tabs.locator('[data-tab="results"]').click();
  await expect(page.locator('.gm-result')).toHaveCount(4, { timeout: 30_000 });
  // Kind picker: twelve kinds.
  await tabs.locator('[data-tab="games"]').click();
  await page.locator('.gm-side .hub-list__add').click();
  await expect(page.locator('.gm-kind')).toHaveCount(12);
});

test('student arcade at 390', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/s/classes/class_2026_09eng/lessons/lesson_game_harbour');
  await expect(page.locator('.lesson-hero__eyebrow')).toHaveText(/game/i, { timeout: 30_000 });
  const gate = page.locator('.gm-gate input');
  if (await gate.isVisible().catch(() => false)) {
    await gate.fill('EF');
    await page.locator('.gm-gate button').click();
  }
  await expect(page.locator('.gm-card')).toHaveCount(4);
  await expect(page.locator('[data-game-id="g_wager"]')).toContainText('Waiting for your teacher');
  const play = page.locator('[data-game-id="g_cross"] .gm-card__play');
  const box = await play.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  await play.click();
  await expect(page.locator('[data-game-id="g_cross"] .gm-card__soon')).toContainText('Coming next');
  const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scroll).toBeLessThanOrEqual(inner);
});
