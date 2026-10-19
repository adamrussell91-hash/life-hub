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

const noOverflow = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

async function shot(page, name, viewport) {
  if (process.env.PS_SHOT_DIR) await page.screenshot({ path: `${process.env.PS_SHOT_DIR}/ps-${name}-${viewport.width > 600 ? 'desktop' : 'mobile'}.png`, fullPage: true });
}

const tasksNamed = (page, title) => page.evaluate(async (wanted) => {
  const res = await fetch('/api/tasks').then((r) => r.json());
  return res.data.tasks.filter((task) => task.title === wanted || task.title.startsWith(wanted));
}, title);

async function answer(page, text) {
  await page.getByLabel('Your answer').fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByLabel('Your answer')).toBeEnabled();
}

for (const viewport of [{ width: 900, height: 900 }, { width: 390, height: 844 }]) {
  test(`5 Whys, a switch to Problem tree, the record and a causal map, then Decide, Implement and the review at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(240_000);
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

    // The boundary turn asks what was learned; the answer is kept and Analyse opens with a causal map suggested.
    await expect(page.locator('.ps-coach__messages')).toContainText(/what did you learn/i);
    const learning = `I reach for blame when I am tired (${viewport.width}px).`;
    await answer(page, learning);
    await expect(page.locator('.ps-suggestion')).toContainText('Next: Causal map');
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
    await page.getByRole('button', { name: 'Back to record' }).click();

    // Analyse: start the causal map, place the problem and three causes, then link one to the problem.
    await expect(page.locator('.ps-suggestion')).toContainText('Next: Causal map');
    await page.getByRole('button', { name: 'Start it' }).click();
    await expect(page.locator('.ps-causal')).toBeAttached();
    await answer(page, 'The weekly rota is changed at the last minute');
    await answer(page, 'Shift swaps are agreed privately by text message');
    await answer(page, 'The manager signs off the rota only on Fridays');
    await answer(page, 'Holiday requests arrive after the rota is drafted');
    await expect(page.locator('.ps-causal .ps-causal__shape')).toHaveCount(4);
    await answer(page, 'link: cause 1 to problem, plus');
    await expect(page.locator('.ps-causal [data-edge]')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    if (process.env.PS_SHOT_DIR) {
      await page.screenshot({ path: `${process.env.PS_SHOT_DIR}/ps-causal-${viewport.width > 600 ? 'desktop' : 'mobile'}.png`, fullPage: true });
    }

    // Leave Analyse for Devise, then skip Devise untouched into Decide.
    await page.getByRole('button', { name: 'Move on to Devise' }).click();
    await expect(page.locator('.ps-coach__messages')).toContainText(/what did you learn/i);
    await answer(page, 'I keep adding causes when I should start linking them');
    await expect(page.locator('.ps-suggestion')).toContainText('Next: Lotus blossom');
    await page.getByRole('button', { name: 'Move on to Decide' }).click();
    await expect(page.getByRole('button', { name: 'Move on to Implement' })).toBeVisible();
    await answer(page, 'Ready to compare the options now please');
    await expect(page.locator('.ps-suggestion')).toContainText('Next: Decision matrix');

    // Decide: two criteria and two options, scored in the matrix's own form, then the choice.
    await page.getByRole('button', { name: 'Start it' }).click();
    await expect(page.locator('.ps-matrix')).toBeAttached();
    await answer(page, 'criterion: Staff can plan their week well ahead');
    await answer(page, 'criterion: The manager spends less time on swaps');
    await answer(page, 'option: Publish the rota every Wednesday morning');
    await answer(page, 'option: Let staff swap shifts in a shared app');
    await expect(page.locator('.ps-matrix [data-row]')).toHaveCount(2);
    await expect(page.locator('.ps-matrix [data-option]')).toHaveCount(2);
    await page.getByRole('button', { name: 'Score the options' }).click();
    const form = page.locator('.ps-matrix__form');
    await form.getByLabel('Percent').check();
    const weights = form.locator('input[data-weight]');
    await weights.nth(0).fill('60');
    await weights.nth(1).fill('40');
    const ratings = form.locator('input[data-rating]');
    for (const [i, value] of ['8', '5', '6', '9'].entries()) await ratings.nth(i).fill(value);
    await form.getByRole('button', { name: 'Save scores' }).click();
    await expect(page.locator('.ps-matrix [data-total]')).toHaveCount(2);
    await expect(page.locator('.ps-matrix [data-option].is-leading')).toHaveCount(1);
    await noOverflow(page);
    await shot(page, 'matrix', viewport);
    await answer(page, 'choice: Let staff swap shifts in a shared app');
    await expect(page.locator('.ps-matrix [data-choice]')).toContainText('Let staff swap shifts in a shared app');
    await expect(page.locator('.ps-coach__messages')).toContainText('carrying your choice into Implement');
    await shot(page, 'choice', viewport);

    // Implement: the choice is the aim; the first Kanban card is proposed and created as a real task.
    await page.getByRole('button', { name: 'Move on to Implement' }).click();
    await expect(page.locator('.ps-coach__messages')).toContainText(/what did you learn/i);
    await answer(page, 'I compare better once the scores are written down');
    await expect(page.locator('.ps-suggestion')).toContainText('Next: Kanban');
    await expect(page.locator('.ps-record [data-step="decide"]')).toHaveAttribute('data-state', 'done', { timeout: 20_000 });
    await page.getByRole('button', { name: 'Start it' }).click();
    await expect(page.locator('.ps-kanban')).toBeAttached();
    await expect(page.locator('.ps-coach__messages')).toContainText('We are carrying forward');
    await expect(page.locator('.ps-canvas__aim')).toContainText('swap shifts');
    await answer(page, 'Draft the new Wednesday rota template for the team');
    const taskCard = page.locator('.ps-taskcard');
    await expect(taskCard).toHaveCount(1);
    await expect(taskCard.locator('input[name="title"]')).toHaveValue(/^Draft the new Wednesday rota template/);
    await noOverflow(page);
    await shot(page, 'taskcard', viewport);
    await taskCard.getByRole('button', { name: 'Create task' }).click();
    await expect(taskCard).toHaveCount(0);
    const sessionId = await page.evaluate(() => new URLSearchParams(location.hash.split('?')[1] ?? '').get('id'));
    const sessionNow = () => page.evaluate(async (id) => (await fetch(`/api/problem-solver?id=${encodeURIComponent(id)}`).then((r) => r.json())).data.session, sessionId);
    await expect.poll(async () => (await sessionNow()).proposedTasks.filter((p) => p.status === 'confirmed').length).toBe(1);
    const confirmed = (await sessionNow()).proposedTasks.find((p) => p.status === 'confirmed');
    const created = (await tasksNamed(page, 'Draft the new Wednesday rota template')).find((task) => task.id === confirmed.taskId);
    expect(created).toBeTruthy();
    expect(created.source).toBe('problem_solver');
    expect(created.tags).toContain('problem-solver');
    await expect(page.locator('.ps-kanban [data-column="todo"] [data-task-status="open"]')).toHaveCount(1);

    // Live status: the task moves in Tasks and the card follows.
    await page.evaluate(async (id) => {
      const res = await fetch(`/api/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'in_progress' }) });
      if (!res.ok) throw new Error(`PATCH failed: ${res.status}`);
      document.dispatchEvent(new Event('visibilitychange'));
    }, created.id);
    await expect(page.locator('.ps-kanban [data-column="doing"] [data-task-status="in_progress"]')).toHaveCount(1);

    // Finish the board: a Doing card is proposed (and set aside here); a Done card proposes nothing.
    await answer(page, 'doing: Tell the team about the Wednesday change');
    await answer(page, 'done: Old Friday rota process retired last month');
    await expect(page.locator('.ps-kanban [data-node]')).toHaveCount(3);
    await expect(taskCard).toHaveCount(1);
    await taskCard.getByRole('button', { name: 'Not this one' }).click();
    await expect(taskCard).toHaveCount(0);
    await noOverflow(page);
    await shot(page, 'kanban', viewport);

    // Review: leaving Implement proposes a dated review task; creating it links it back.
    await page.getByRole('button', { name: 'Move on to Improve' }).click();
    const reviewCard = page.locator('.ps-reviewcard');
    await expect(reviewCard).toBeVisible();
    const due = await reviewCard.locator('input[name="due"]').inputValue();
    expect(due).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await noOverflow(page);
    await shot(page, 'reviewcard', viewport);
    await reviewCard.getByRole('button', { name: 'Create review task' }).click();
    await expect(reviewCard).toHaveCount(0);
    await expect.poll(async () => Boolean((await sessionNow()).reviewTaskId)).toBe(true);
    const reviews = await tasksNamed(page, 'Review: The weekly rota keeps changing at the last minute');
    const session = await sessionNow();
    const review = reviews.find((task) => task.id === session.reviewTaskId);
    expect(review).toBeTruthy();
    expect(review.due_date).toBe(due);

    // The chip on the review task opens the problem at Improve.
    await page.goto(`/#/task/${encodeURIComponent(review.id)}`);
    const chip = page.locator('a.ps-linkchip');
    await expect(chip).toBeVisible({ timeout: 20_000 });
    await expect(chip).toHaveAttribute('href', /step=improve/);
    await noOverflow(page);
    await shot(page, 'chip', viewport);
    await chip.click();
    await expect(page).toHaveURL(new RegExp(`id=${sessionId}`));
    await expect(page.locator('.ps-record [data-step="improve"]')).toHaveAttribute('data-state', 'current', { timeout: 20_000 });
    await noOverflow(page);
    await shot(page, 'improve', viewport);
  });
}
