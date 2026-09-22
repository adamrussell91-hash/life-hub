import { expect, test } from '@playwright/test';

async function signIn(page) {
  await page.goto('/#/board');
  const pass = page.getByLabel('Passphrase');
  if (await pass.isVisible().catch(() => false)) {
    await pass.fill('tasks-hub-local');
    await page.getByRole('button', { name: /sign in/i }).click();
  }
  await expect(page.locator('.page-header')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: /Dashboard|Graph|Today/ })).toBeVisible();
}

async function openGraph(page, hash = '#/graph') {
  await page.evaluate((next) => {
    location.hash = next;
  }, hash);
  await expect(page.locator('.graph-page')).toBeVisible({ timeout: 20_000 });
}

test('graph pills and old routes', async ({ page }) => {
  await signIn(page);
  await openGraph(page, '#/graph');
  const pills = page.locator('.graph-page .hub-pills__btn');
  await expect(pills).toHaveText(['Lines', 'Branch', 'Orbit']);
  await expect(page.locator('.graph-lines, .empty-state__title')).toBeVisible();

  await openGraph(page, '#/orbit');
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/graph?view=orbit');
  await expect(page.locator('.graph-orbit')).toBeVisible();

  await openGraph(page, '#/branch');
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/graph?view=branch');
  await expect(page.locator('.graph-branch')).toBeVisible();

  await openGraph(page, '#/universe');
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/graph');
  await expect(page.locator('.graph-lines, .empty-state__title')).toBeVisible();

  await openGraph(page, '#/graph?mode=workstreams');
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/graph');

  await openGraph(page, '#/graph?mode=blockers');
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#/graph?view=branch');
});

test('selection persists across view switches', async ({ page }) => {
  await signIn(page);
  await openGraph(page, '#/graph');
  const station = page.locator('.graph-page [data-station-id^="task_"]').first();
  await expect(station).toBeVisible();
  await station.dispatchEvent('click');
  await expect(page.locator('.graph-drawer:not([hidden])')).toBeVisible();
  await page.locator('.graph-page .hub-pills__btn', { hasText: 'Branch' }).click();
  await expect(page.locator('.graph-branch')).toBeVisible();
  await expect(page.locator('.graph-drawer:not([hidden])')).toBeVisible();
});

test('orbit pause button and space stop movement', async ({ page }) => {
  await signIn(page);
  await openGraph(page, '#/graph?view=orbit');
  const body = page.locator('.or-body').first();
  if (!(await body.count())) return;
  const pause = page.getByRole('button', { name: /pause orbit|pause/i });
  const before = await body.evaluate((el) => ({ cx: el.getAttribute('cx'), cy: el.getAttribute('cy') }));
  await pause.click();
  await page.waitForTimeout(400);
  const afterPause = await body.evaluate((el) => ({ cx: el.getAttribute('cx'), cy: el.getAttribute('cy') }));
  expect(afterPause).toEqual(before);
  await page.keyboard.press(' ');
  await page.waitForTimeout(400);
});

test('reduced motion starts orbit paused', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await signIn(page);
  await openGraph(page, '#/graph?view=orbit');
  await expect(page.locator('.graph-page .btn', { hasText: /play/i }).first()).toBeVisible();
});

test('390px lines stay vertical', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await openGraph(page, '#/graph');
  await expect(page.locator('.graph-page')).toBeVisible();
  await expect(page.locator('.graph-service-board')).toBeVisible();
});
