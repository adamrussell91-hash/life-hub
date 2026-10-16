// apps/tasks/tests/browser/problem-solver.spec.mjs
import { expect, test } from '@playwright/test';

async function signIn(page) {
  await page.goto('/');
  await page.evaluate(async () => {
    const session = await fetch('/api/session').then((res) => res.json());
    if (session?.data?.authenticated) return;
    const res = await fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ passphrase: 'tasks-hub-local' }) });
    if (!res.ok) throw new Error('Could not sign in');
  });
  await page.goto('/#/problem-solver');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'New problem' })).toBeVisible({ timeout: 20_000 });
}

async function answer(page, text) {
  await page.getByLabel('Your answer').fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByLabel('Your answer')).toBeEnabled();
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`5 Whys builds one shape per accepted answer at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await signIn(page);
    await page.getByLabel('Describe the problem').fill('The weekly rota keeps changing at the last minute');
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.locator('.ps-frame')).toBeVisible();

    await answer(page, 'A rota that is fixed a full week ahead');
    await expect(page.locator('.ps-frame__row.is-answered')).toHaveCount(1);
    await answer(page, 'It changed late three of the last four weeks');
    await answer(page, 'We could change which day it is published');
    await expect(page.locator('.ps-suggestion')).toContainText('5 Whys');
    await page.getByRole('button', { name: 'Start it' }).click();
    await expect(page.locator('.ps-whys')).toBeAttached();
    await expect(page.locator('.ps-whys [data-node]')).toHaveCount(0);

    await answer(page, 'The rota is finalised on Friday afternoon each week');
    await expect(page.locator('.ps-whys [data-node]')).toHaveCount(1);

    await answer(page, 'too short');
    await expect(page.locator('.ps-whys [data-node]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Keep it anyway' }).click();
    await expect(page.locator('.ps-whys .is-contested')).toHaveCount(1);
    if (process.env.PS_SHOT_DIR) {
      await page.screenshot({ path: `${process.env.PS_SHOT_DIR}/ps-${viewport.width > 600 ? 'desktop' : 'mobile'}.png`, fullPage: true });
    }

    await page.reload();
    await expect(page.locator('.ps-whys [data-node]')).toHaveCount(2, { timeout: 20_000 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
