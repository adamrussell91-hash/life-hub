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
  test(`5 Whys, a switch to Problem tree and the record at ${viewport.width}px`, async ({ page }) => {
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

    // Switch to a problem tree, add the problem and a cause, then move on from Define.
    await answer(page, 'switch: the causes branch in several directions');
    await expect(page.locator('.ps-suggestion')).toContainText('Switch to: Problem tree');
    await expect(page.locator('.ps-suggestion .ps-emblem svg')).toBeVisible();
    await page.getByRole('button', { name: 'Start it' }).click();
    await expect(page.locator('.ps-tree')).toBeAttached();
    await expect(page.locator('.ps-canvas__title')).toContainText('Problem tree');
    await answer(page, 'The weekly rota is changed at the last minute');
    await answer(page, 'Shift swaps are agreed privately by text message');
    await expect(page.locator('.ps-tree [data-node]')).toHaveCount(2);
    await page.getByRole('button', { name: 'Move on to Analyse' }).click();

    // The boundary turn asks what was learned; the answer is kept and Analyse opens with no tool yet.
    await expect(page.locator('.ps-coach__messages')).toContainText(/what did you learn/i);
    const learning = `I reach for blame when I am tired (${viewport.width}px).`;
    await answer(page, learning);
    await expect(page.locator('.ps-coach__messages')).toContainText(/no tool for this step yet/i);
    const learnings = await page.evaluate(async () => {
      const list = await fetch('/api/problem-solver?list=1').then((res) => res.json());
      const all = await Promise.all(list.data.sessions.map((item) => fetch(`/api/problem-solver?id=${encodeURIComponent(item.id)}`).then((res) => res.json())));
      return all.flatMap((res) => res.data.session.learnings ?? []).map((item) => item.text);
    });
    expect(learnings).toContain(learning);

    // The record opens with Define done and Analyse current; the 5 Whys run is on the filmstrip as switched.
    const define = page.locator('.ps-record [data-step="define"]');
    await expect(define).toHaveAttribute('data-state', /done|skipped/, { timeout: 20_000 });
    await expect(page.locator('.ps-record [data-step="analyse"]')).toHaveAttribute('data-state', 'current');
    await expect(page.locator('.ps-record__card.is-switched')).toContainText('Switched');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    if (process.env.PS_SHOT_DIR) {
      await page.screenshot({ path: `${process.env.PS_SHOT_DIR}/ps-record-${viewport.width > 600 ? 'desktop' : 'mobile'}.png`, fullPage: true });
    }

    // Define morphs into the coloured chart, and back.
    await define.getByRole('button').click();
    await expect(page.locator('.ps-canvas__chart')).toBeVisible();
    await expect(page.locator('.ps-tree [data-node]')).toHaveCount(2);
    await page.getByRole('button', { name: 'Back to record' }).click();
    await expect(define).toBeVisible();
    await page.locator('.ps-record__card.is-switched button').click();
    await expect(page.locator('.ps-whys [data-node]')).toHaveCount(2);
  });
}
