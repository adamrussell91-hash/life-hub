// apps/tasks/tests/browser/gear-shifter.spec.mjs
// Gear Shifter on the Tasks mock API (its scripted coach), at desktop and phone widths: the
// landing page with the three-way skills ribbon; a whole session from framing through the route,
// a recommended technique, Commit with both confirm cards, the action record on a new project
// page, the learning question and Review now; and Quick start, to done with a check task and It
// came back, and on to a full session with Go deeper. Every task here is invented.
import { expect, test } from '@playwright/test';

async function signIn(page) {
  await page.goto('/');
  await page.evaluate(async () => {
    const session = await fetch('/api/session').then((res) => res.json());
    if (session?.data?.authenticated) return;
    const res = await fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ passphrase: 'tasks-hub-local' }) });
    if (!res.ok) throw new Error('Could not sign in');
  });
  await page.goto('/#/gear-shifter');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'What do you need to get moving?' })).toBeVisible({ timeout: 30_000 });
}

const noOverflow = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

async function shot(page, name, viewport) {
  if (process.env.GT_SHOT_DIR) await page.screenshot({ path: `${process.env.GT_SHOT_DIR}/gt-${name}-${viewport.width > 600 ? 'desktop' : 'mobile'}.png`, fullPage: true });
}

async function answer(page, text) {
  await page.getByLabel('Your answer').fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByLabel('Your answer')).toBeEnabled({ timeout: 20_000 });
}

/** The open session's saved state, read from the mock API. */
async function sessionReader(page) {
  const id = await page.evaluate(() => new URLSearchParams(location.hash.split('?')[1] ?? '').get('id'));
  return { id, now: () => page.evaluate(async (sid) => (await fetch(`/api/get-things-done?id=${encodeURIComponent(sid)}`).then((r) => r.json())).data.session, id) };
}

const tasksNamed = (page, title) => page.evaluate(async (wanted) => {
  const res = await fetch('/api/tasks').then((r) => r.json());
  return res.data.tasks.filter((task) => task.title === wanted);
}, title);

/** The Quick start chart's station waiting for an answer. */
const startNow = (page) => page.locator('.gt-qs-page .gt-qs__stn[data-now="true"]');

async function startQuick(page, text) {
  await page.getByLabel('Describe the stalled task').fill(text);
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(page.locator('.gt-qs-page')).toBeVisible();
  await expect(page.locator('.ps-coach__messages')).toContainText('first small, safe action', { timeout: 20_000 });
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`the landing page: hero, Quick start, the five sections and the three-way skills ribbon at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await signIn(page);
    await expect(page.getByRole('heading', { name: 'Quick start' })).toBeVisible();
    await expect(page.getByLabel('Describe the stalled task')).toBeVisible();
    await expect(page.getByText('Not open yet')).toHaveCount(0);
    await expect(page.locator('.gt-sect')).toHaveCount(5);
    await expect(page.getByRole('heading', { name: 'Thinking skills you have used' })).toBeVisible();
    await expect(page.locator('.ps-ribbon__key')).toHaveText(['Gear Shifter', 'Decision Maker', 'Problem Solver']);
    await noOverflow(page);
    await shot(page, 'landing', viewport);
  });

  test(`a whole session: framed on the route, a technique, Commit with both cards, the record on a page, then Review at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize(viewport);
    await signIn(page);
    const title = `Get the team report out (${viewport.width}px)`;
    await page.getByLabel('Describe what needs to move').fill(title);
    await page.getByRole('button', { name: 'Start', exact: true }).click();
    await expect(page.locator('.ps-track')).toBeVisible();
    const { now } = await sessionReader(page);
    await expect(page.locator('.ps-coach__messages')).toContainText(/stuck/i, { timeout: 20_000 });
    await answer(page, 'It turns on two colleagues who hold the data.');
    await expect.poll(async () => (await now()).frame.route).toBe('others');
    await expect(page.locator('.gt-route')).toBeVisible();
    await answer(page, 'Due Friday; Priya has the sales data and Sam has the charts.');
    await expect(page.locator('.ps-suggestion')).toContainText('Appreciation');
    await noOverflow(page);
    await shot(page, 'framed', viewport);

    // Explore: the recommended technique, worked to its minimum.
    await page.locator('.ps-suggestion').getByRole('button', { name: 'Start it' }).click();
    await answer(page, 'Thank Priya for pulling the sales data together this week');
    await answer(page, 'reflection: Saying thanks first makes the next ask much easier');
    await expect.poll(async () => (await now()).steps.explore.runs[0].nodes.length).toBe(2);
    await noOverflow(page);
    await shot(page, 'explore', viewport);

    // Commit: move on, answer the learning question, then the experiment slot by slot.
    await answer(page, 'commit');
    await page.locator('.ps-suggestion').getByRole('button', { name: 'Move on' }).click();
    await expect(page.locator('.ps-coach__messages')).toContainText(/what did you learn/i, { timeout: 20_000 });
    await answer(page, 'I move faster when I thank people before I ask.');
    await page.locator('.ps-suggestion').getByRole('button', { name: 'Start it' }).click();
    for (const text of [
      'The team report goes out on Friday morning',
      'rests_on: Appreciation, thank Priya first before asking again',
      'Message Priya to thank her and ask for the figures',
      'Right after the Monday stand-up meeting ends',
      '2026-11-05',
      'Priya has not replied by Wednesday lunchtime'
    ]) await answer(page, text);
    await expect.poll(async () => (await now()).steps.commit.runs[0].nodes.length).toBe(6);
    await expect(page.locator('.gt-commit__turn')).toBeVisible();
    await noOverflow(page);
    await shot(page, 'commit', viewport);

    // The next action's task, the check-back's review task and the record on a new project page.
    const taskCard = page.locator('.ps-taskcard');
    await expect(taskCard).toBeVisible();
    await taskCard.getByRole('button', { name: 'Create task' }).click();
    await expect.poll(async () => (await now()).proposedTasks[0]?.status).toBe('confirmed');
    const linked = (await now()).proposedTasks[0];
    const [made] = (await tasksNamed(page, linked.title)).filter((task) => task.id === linked.taskId);
    expect(made.source).toBe('gear_shifter');
    const reviewCard = page.locator('.ps-reviewcard');
    await expect(reviewCard.locator('input[name="due"]')).toHaveValue('2026-11-05');
    await reviewCard.getByRole('button', { name: 'Create review task' }).click();
    await expect.poll(async () => Boolean((await now()).reviewTaskId)).toBe(true);
    const recordCard = page.locator('.ps-casefilecard');
    await expect(recordCard).toContainText('action record');
    await recordCard.locator('select[name="place"]').selectOption('new');
    await recordCard.getByRole('button', { name: 'Write action record' }).click();
    await expect.poll(async () => (await now()).caseFile?.version).toBe(1);
    const target = (await now()).caseFile.target;
    expect(target.kind).toBe('project');
    const blocks = await page.evaluate(async (id) => (await fetch('/api/projects').then((r) => r.json())).data.projects.find((project) => project.id === id).page_blocks, target.id);
    expect(blocks[0].block_type).toBe('image');
    expect(blocks[1].block_type).toBe('heading');
    await noOverflow(page);
    await shot(page, 'written', viewport);

    // Review waits for its date. Review now waits for the learning question too (Adam, 22 Oct).
    await page.getByRole('button', { name: 'Move on to Review' }).click();
    await expect(page.locator('.ps-coach__messages')).toContainText(/what did you learn/i, { timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Review now' })).toBeDisabled();
    await expect(page.locator('.ps-review__note')).toHaveText('Answer the coach’s question first, then start the review.');
    await answer(page, 'A dated check-back keeps me honest about the report.');
    await expect(page.getByRole('button', { name: 'Review now' })).toBeEnabled({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Review now' }).click();
    await expect.poll(async () => (await now()).reviewState?.status).toBe('reviewing');
    await noOverflow(page);
    await shot(page, 'review', viewport);
  });

  test(`a Quick start: the start picked on the chart, a check task, to done, then It came back at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    await signIn(page);
    const task = `Clear the inbox backlog (${viewport.width}px)`;
    await startQuick(page, task);
    const { now } = await sessionReader(page);
    await expect(startNow(page)).toHaveAttribute('data-box', 'action');
    await answer(page, 'Archive everything older than a month');
    await expect(startNow(page)).toHaveAttribute('data-box', 'how');
    await expect(page.locator('.gt-qs-page .gt-qs__action')).toHaveText('Archive everything older than a month');
    await noOverflow(page);
    await shot(page, 'quick-how', viewport);

    // The start picked on the chart; the dart flies in.
    await startNow(page).getByRole('button', { name: 'Start with a protected interval' }).click();
    await expect(startNow(page)).toHaveAttribute('data-box', 'cue');
    await expect(page.locator('.gt-qs-page .gt-qs')).toHaveAttribute('data-way', 'interval');
    await expect(page.getByLabel('Your answer')).toBeEnabled();
    await answer(page, 'Ten to ten thirty with notifications off');
    await answer(page, 'Check back on 2026-11-05');
    await expect(page.locator('.gt-qs-page [data-box="check"] .gt-qs__text')).toHaveText('5 Nov 2026');
    await noOverflow(page);
    await shot(page, 'quick-check', viewport);

    const check = page.locator('.gt-qs-check');
    await expect(check).toContainText('on 5 Nov 2026');
    await check.getByRole('button', { name: 'Create check task' }).click();
    await expect(check).toBeHidden();
    await expect.poll(async () => (await now()).start.check.taskId).toBeTruthy();
    const [made] = await tasksNamed(page, `Check back: ${task}`);
    expect(made.due_date).toBe('2026-11-05');
    expect(made.source).toBe('gear_shifter');

    await answer(page, 'Down to forty messages and the urgent ones answered');
    await page.getByLabel('Your answer').fill('Answer the five client emails tomorrow');
    await page.getByRole('button', { name: 'Send' }).click();
    const again = page.getByRole('button', { name: 'It came back' });
    await expect(again).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.gt-qs-page [data-box="next"] .gt-qs__text')).toHaveText('Answer the five client emails tomorrow');
    await noOverflow(page);
    await shot(page, 'quick-done', viewport);

    await again.click();
    await expect(page.locator('.gt-qs-page .gt-qs__rounds')).toHaveText('Round 2. Round 1: Archive everything older than a month, with a protected interval.');
    await expect(page.getByLabel('Your answer')).toBeFocused();
    await expect(again).toBeHidden();

    await page.getByRole('link', { name: '← Your work' }).click();
    const row = page.locator('.gt-prob', { hasText: task });
    await expect(row.locator('.ps-prob__phase')).toHaveText('Quick start');
    await noOverflow(page);
  });

  test(`Go deeper: a full session starts seeded, shows the Quick start, and both rows say so at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    await signIn(page);
    const task = `Get the renovation going (${viewport.width}px)`;
    await startQuick(page, task);
    await answer(page, 'Ring two builders for a quote');
    await answer(page, 'go deeper');
    const card = page.locator('.ps-suggestion');
    await expect(card.locator('.ps-suggestion__title')).toHaveText('This needs a full session');
    await noOverflow(page);
    await shot(page, 'quick-deeper', viewport);
    const runHash = await page.evaluate(() => location.hash);

    await card.getByRole('button', { name: 'Go deeper' }).click();
    await expect(page.locator('.gt-qs-page')).toHaveCount(0);
    await expect(page.locator('.ps-track')).toBeVisible();
    const from = page.locator('details.gt-qs-from');
    await expect(from).toBeVisible();
    await from.locator('summary').click();
    await expect(from.locator('.gt-qs')).toBeVisible();
    await expect(from.locator('.gt-qs__action')).toHaveText('Ring two builders for a quote');
    await expect(from.locator('.gt-qs__pick')).toHaveCount(0);
    await expect(from.getByRole('link', { name: 'Open the Quick start' })).toHaveAttribute('href', runHash);
    const { now } = await sessionReader(page);
    const full = await now();
    expect(full.kind).toBe('shift');
    expect(full.frameSeeds.from).toBe('start');
    await expect.poll(async () => (await now()).frame.need).toBe(task);
    await noOverflow(page);
    await shot(page, 'quick-from', viewport);

    await page.goto(`/${runHash}`);
    await expect(page.locator('.gt-qs-page__sent[role="status"]')).toContainText('This went on to a full session.');
    await page.getByRole('link', { name: '← Your work' }).click();
    const rows = page.locator('.gt-prob', { hasText: task });
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ has: page.locator('.ps-prob__medal--quick') }).locator('.ps-prob__phase')).toHaveText('Went deeper');
    await expect(rows.filter({ hasNot: page.locator('.ps-prob__medal--quick') }).locator('.ps-prob__phase')).toHaveText('Framing');
    await noOverflow(page);
  });
}
