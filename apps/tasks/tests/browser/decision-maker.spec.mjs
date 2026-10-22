// apps/tasks/tests/browser/decision-maker.spec.mjs
// Decision Maker on the Tasks mock API (its scripted coach), at desktop and phone widths: the
// landing page with the shared skills ribbon; a whole decision from framing through a model,
// another angle, Decide with the record on a new project page, to the waiting review and Review
// now; and the quick route, to proceed with a check task and It came back, and on to a full
// decision with Go deeper.
import { expect, test } from '@playwright/test';

async function signIn(page) {
  await page.goto('/');
  await page.evaluate(async () => {
    const session = await fetch('/api/session').then((res) => res.json());
    if (session?.data?.authenticated) return;
    const res = await fetch('/api/auth', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ passphrase: 'tasks-hub-local' }) });
    if (!res.ok) throw new Error('Could not sign in');
  });
  await page.goto('/#/decision-maker');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'New decision' })).toBeVisible({ timeout: 20_000 });
}

const noOverflow = async (page) => expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

async function shot(page, name, viewport) {
  if (process.env.DM_SHOT_DIR) await page.screenshot({ path: `${process.env.DM_SHOT_DIR}/dm-${name}-${viewport.width > 600 ? 'desktop' : 'mobile'}.png`, fullPage: true });
}

async function answer(page, text) {
  await page.getByLabel('Your answer').fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByLabel('Your answer')).toBeEnabled();
}

/** The open session's saved state, read from the mock API. */
async function sessionReader(page) {
  const id = await page.evaluate(() => new URLSearchParams(location.hash.split('?')[1] ?? '').get('id'));
  return { id, now: () => page.evaluate(async (sid) => (await fetch(`/api/decision-book?id=${encodeURIComponent(sid)}`).then((r) => r.json())).data.session, id) };
}

const tasksNamed = (page, title) => page.evaluate(async (wanted) => {
  const res = await fetch('/api/tasks').then((r) => r.json());
  return res.data.tasks.filter((task) => task.title === wanted);
}, title);

/** The quick chart's box waiting for an answer. */
const quickNow = (page) => page.locator('.dm-qk-page .dm-qk__row[data-now="true"]');

async function startQuick(page, text) {
  await page.getByLabel('Describe the quick decision').fill(text);
  await page.getByRole('button', { name: 'Go' }).click();
  await expect(page.locator('.dm-qk-page')).toBeVisible();
  await expect(page.locator('.ps-coach__messages')).toContainText('Set three yes/no tests', { timeout: 20_000 });
}

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`the landing page: hero, Quick decision, the sections and the shared skills ribbon at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await signIn(page);
    await expect(page.getByRole('heading', { name: 'Quick decision' })).toBeVisible();
    await expect(page.getByLabel('Describe the quick decision')).toBeVisible();
    await expect(page.locator('.dm-sect')).toHaveCount(4);
    await expect(page.getByRole('heading', { name: 'Thinking skills you have used' })).toBeVisible();
    await expect(page.locator('.ps-ribbon, .ps-skills-ribbon').first()).toBeVisible();
    await noOverflow(page);
    await shot(page, 'landing', viewport);
  });

  test(`a whole decision: framed, a model, another angle, Decide with the record on a page, then Review at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(viewport);
    await signIn(page);
    const title = `Should I take the Sydney job offer? (${viewport.width}px)`;
    await page.getByLabel('Describe the decision').fill(title);
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.locator('.ps-track')).toBeVisible();
    const { now } = await sessionReader(page);
    await answer(page, 'It is about me and I want to understand what I really want.');
    await answer(page, 'The offer closes Friday and the rent there is double.');
    await expect(page.locator('.dm-compass')).toBeVisible();
    await expect(page.locator('.ps-suggestion')).toContainText('Eisenhower');
    await noOverflow(page);
    await shot(page, 'framed', viewport);

    // Explore: the Eisenhower matrix, one item a cell, then the reflection.
    await page.getByRole('button', { name: 'Start it' }).click();
    for (const text of ['Reply to the Sydney offer letter, do immediately', 'Talk the move over with my partner, decide when', 'Sort out the lease renewal paperwork, do later', 'reflection: The offer reply is the only thing that cannot wait.']) await answer(page, text);
    await expect.poll(async () => (await now()).steps.explore.runs[0].nodes.length).toBe(4);
    const taskCard = page.locator('.ps-taskcard');
    await expect(taskCard).toBeVisible();
    await taskCard.getByRole('button', { name: 'Create task' }).click();
    // The mock API is shared by both widths, so look the task up by the id the proposal links.
    await expect.poll(async () => (await now()).proposedTasks[0]?.status).toBe('confirmed');
    const linked = (await now()).proposedTasks[0];
    expect((await tasksNamed(page, linked.title)).map((task) => task.id)).toContain(linked.taskId);
    await noOverflow(page);
    await shot(page, 'explore', viewport);

    // Another angle is offered, set aside, then Decide.
    await answer(page, 'another angle');
    await expect(page.locator('.ps-suggestion .ps-suggestion__title')).toContainText('Next:');
    await page.locator('.ps-suggestion').getByRole('button', { name: 'Not now' }).click();
    await answer(page, 'decide');
    await page.locator('.ps-suggestion').getByRole('button', { name: 'Move on' }).click();
    await expect(page.locator('.ps-coach__messages')).toContainText(/what did you learn/i);
    await answer(page, 'I decide faster once the urgent part is named.');
    await page.locator('.ps-suggestion').getByRole('button', { name: 'Start it' }).click();
    for (const text of ['I will take the Sydney job and move in March.', 'The offer reply cannot wait and it matters most.', 'The rent there goes above half of my pay.', 'Then I look at the flats further out instead.', 'Email my acceptance to the Sydney office on Monday.', 'Review it on 2027-01-21']) await answer(page, text);
    await expect(page.locator('.dm-record__stop')).toBeVisible();
    await noOverflow(page);
    await shot(page, 'record', viewport);

    // The first step's task, the review task and the record on a new project page.
    await page.locator('.ps-taskcard').getByRole('button', { name: 'Create task' }).click();
    await expect(page.locator('.ps-taskcard')).toHaveCount(0);
    const reviewCard = page.locator('.ps-reviewcard');
    await expect(reviewCard.locator('input[name="due"]')).toHaveValue('2027-01-21');
    await reviewCard.getByRole('button', { name: 'Create review task' }).click();
    await expect.poll(async () => Boolean((await now()).reviewTaskId)).toBe(true);
    const recordCard = page.locator('.ps-casefilecard');
    await expect(recordCard).toContainText('decision record');
    // The decision's own tasks are offered as places too; this one goes on a new project page.
    await recordCard.locator('select[name="place"]').selectOption('new');
    await recordCard.getByRole('button', { name: 'Write decision record' }).click();
    await expect.poll(async () => (await now()).caseFile?.version).toBe(1);
    const target = (await now()).caseFile.target;
    expect(target.kind).toBe('project');
    const blocks = await page.evaluate(async (id) => (await fetch('/api/projects').then((r) => r.json())).data.projects.find((project) => project.id === id).page_blocks, target.id);
    expect(blocks[0].block_type).toBe('image');
    expect(blocks[1].block_type).toBe('heading');
    await noOverflow(page);
    await shot(page, 'written', viewport);

    // Review waits for its date; Review now opens the feedback analysis.
    await page.getByRole('button', { name: 'Move on to Review' }).click();
    await expect(page.getByRole('button', { name: 'Review now' })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Review now' }).click();
    await expect.poll(async () => (await now()).reviewState?.status).toBe('reviewing');
    await noOverflow(page);
    await shot(page, 'review', viewport);
  });

  test(`a quick decision: tests answered on the chart, proceed with a Stop Rule and a check task, then It came back at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    await signIn(page);
    const call = `Should I take the weekend course? (${viewport.width}px)`;
    await startQuick(page, call);
    const { now } = await sessionReader(page);
    await answer(page, 'use those');
    await expect(quickNow(page)).toHaveAttribute('data-box', 'test_one');
    await expect(quickNow(page).locator('.dm-qk__label')).toHaveText('Do I want it?');
    await noOverflow(page);
    await shot(page, 'quick-tests', viewport);

    // Yes on the chart, twice; the third by reply.
    await quickNow(page).getByRole('button', { name: 'Yes: Do I want it?' }).click();
    await expect(quickNow(page)).toHaveAttribute('data-box', 'test_two');
    await expect(page.getByLabel('Your answer')).toBeEnabled();
    await quickNow(page).getByRole('button', { name: 'Yes: Can I do it?' }).click();
    await expect(quickNow(page)).toHaveAttribute('data-box', 'test_three');
    await expect(page.getByLabel('Your answer')).toBeEnabled();
    await answer(page, 'yes, it pays for itself');
    await expect(page.locator('.dm-qk-page .dm-qk__row[data-box="end"]')).toHaveAttribute('data-end', 'proceed');
    await answer(page, 'I miss two sessions');
    await answer(page, 'Ask to move to the spring run');
    await expect(page.locator('.dm-qk-page .dm-qk__band')).toContainText('Ask to move to the spring run');
    await answer(page, 'Check on 2027-01-21');
    await expect(page.locator('.dm-qk-page .dm-qk__check')).toHaveText('Check on 21 Jan 2027');
    await noOverflow(page);
    await shot(page, 'quick-band', viewport);

    const check = page.locator('.dm-qk-check');
    await expect(check).toContainText('on 21 Jan 2027');
    await check.getByRole('button', { name: 'Create check task' }).click();
    await expect(check).toBeHidden();
    await expect.poll(async () => (await now()).quick.check.taskId).toBeTruthy();
    const [task] = await tasksNamed(page, `Check: ${call}`);
    expect(task.due_date).toBe('2027-01-21');
    expect(task.source).toBe('decision_maker');

    await answer(page, 'I decide faster with the tests written down');
    await page.getByLabel('Your answer').fill('Book the first session');
    await page.getByRole('button', { name: 'Send' }).click();
    const again = page.getByRole('button', { name: 'It came back' });
    await expect(again).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.dm-qk-page .dm-qk__close')).toContainText('Book the first session');
    await noOverflow(page);
    await shot(page, 'quick-done', viewport);

    await again.click();
    await expect(page.locator('.dm-qk-page .dm-qk__rounds')).toHaveText('Round 2. Round 1 went ahead.');
    await expect(page.getByLabel('Your answer')).toBeFocused();
    await expect(again).toBeHidden();

    await page.getByRole('link', { name: '← Decisions' }).click();
    const row = page.locator('.dm-prob', { hasText: call });
    await expect(row.locator('.ps-prob__phase')).toHaveText('Quick decision');
    await noOverflow(page);
  });

  test(`Go deeper: a full decision starts seeded, shows the quick run, and both rows say so at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    await signIn(page);
    const call = `Should we move interstate for the job? (${viewport.width}px)`;
    await startQuick(page, call);
    await answer(page, 'use those');
    await answer(page, 'go deeper');
    const card = page.locator('.ps-suggestion');
    await expect(card.locator('.ps-suggestion__title')).toHaveText('This needs a full decision');
    await noOverflow(page);
    await shot(page, 'quick-deeper', viewport);
    const runHash = await page.evaluate(() => location.hash);

    await card.getByRole('button', { name: 'Go deeper' }).click();
    await expect(page.locator('.dm-qk-page')).toHaveCount(0);
    await expect(page.locator('.ps-track')).toBeVisible();
    const from = page.locator('details.dm-qk-from');
    await expect(from).toBeVisible();
    await from.locator('summary').click();
    await expect(from.locator('.dm-qk')).toBeVisible();
    await expect(from.locator('.dm-qk__row[data-box="test_one"] .dm-qk__label')).toHaveText('Do I want it?');
    await expect(from.locator('.dm-qk__ask')).toHaveCount(0);
    await expect(from.getByRole('link', { name: 'Open the quick decision' })).toHaveAttribute('href', runHash);
    const { now } = await sessionReader(page);
    expect((await now()).frameSeeds.from).toBe('quick');
    await noOverflow(page);
    await shot(page, 'quick-from', viewport);

    await page.goto(`/${runHash}`);
    await expect(page.locator('.dm-qk-page__sent[role="status"]')).toContainText('This went on to a full decision.');
    await page.getByRole('link', { name: '← Decisions' }).click();
    const rows = page.locator('.dm-prob', { hasText: call });
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ has: page.locator('.ps-prob__medal--quick') }).locator('.ps-prob__phase')).toHaveText('Went deeper');
    await expect(rows.filter({ hasNot: page.locator('.ps-prob__medal--quick') }).locator('.ps-prob__phase')).toHaveText('Framing');
    await noOverflow(page);
  });
}
