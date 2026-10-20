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

/** Open the process record when a step's chart is on screen (a step with runs opens on its chart). */
async function openRecord(page) {
  const toggle = page.locator('.ps-canvas__title').getByRole('button', { name: 'Record', exact: true });
  if (await toggle.isVisible()) await toggle.click();
  await expect(page.locator('.ps-record')).toBeVisible();
}

async function answer(page, text) {
  await page.getByLabel('Your answer').fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByLabel('Your answer')).toBeEnabled();
}

/**
 * Describe a new problem and answer the three frame questions; the coach then suggests 5 Whys.
 * A third answer with `model: polya` or `model: triz` makes the scripted coach choose that model.
 */
async function frameProblem(page, text, third = 'We could change which day it is published') {
  await page.getByLabel('Describe the problem').fill(text);
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('.ps-frame')).toBeVisible();
  await answer(page, 'A rota that is fixed a full week ahead');
  await expect(page.locator('.ps-frame__row.is-answered')).toHaveCount(1);
  await answer(page, 'It changed late three of the last four weeks');
  await answer(page, third);
  await expect(page.locator('.ps-suggestion')).toContainText('5 Whys');
}

/** The open problem's id, and a reader for its saved session. */
async function sessionReader(page) {
  const id = await page.evaluate(() => new URLSearchParams(location.hash.split('?')[1] ?? '').get('id'));
  return { id, now: () => page.evaluate(async (sid) => (await fetch(`/api/problem-solver?id=${encodeURIComponent(sid)}`).then((r) => r.json())).data.session, id) };
}

/** Today's date as YYYYMMDD in the page's own clock, for a case-file name. */
const todayStamp = (page) => page.evaluate(() => {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
});

/** Wait for a chart-to-record morph (a spring run on animation frames) to land. */
const settled = (page) => expect(page.locator('.hub-morph-dialog__animating')).toHaveCount(0);

/** Leave a finished Implement: the dated review card appears and creating it links the review task. Returns its date. */
async function createReviewOnLeaving(page, viewport, sessionNow) {
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
  return due;
}

for (const viewport of [{ width: 900, height: 900 }, { width: 390, height: 844 }]) {
  test(`5 Whys, a switch to Problem tree, the record and a causal map, then Decide, Implement, the review and Improve at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize(viewport);
    await signIn(page);
    await frameProblem(page, 'The weekly rota keeps changing at the last minute');
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
    const { id: sessionId, now: sessionNow } = await sessionReader(page);
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
    const due = await createReviewOnLeaving(page, viewport, sessionNow);
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

    // Waiting: Improve waits for the review. The learning answer is kept and no tool is suggested.
    // The link already says step=improve, but a waiting Improve shows only its own Review now.
    const panel = page.locator('.ps-review');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Improve picks up at your review on');
    await expect(panel.getByRole('button', { name: 'Review now' })).toBeVisible();
    await expect(page.locator('.ps-resume')).toHaveCount(0);
    await expect(page.locator('.ps-coach__messages')).toContainText(/what did you learn/i);
    await answer(page, 'I hurry the last step when the end is in sight');
    const dueSaid = await page.evaluate((d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }), due);
    await expect(page.locator('.ps-coach__messages')).toContainText(`Improve picks up at your review on ${dueSaid}.`);
    await expect(page.locator('.ps-suggestion')).toHaveCount(0);
    await noOverflow(page);
    await shot(page, 'waiting', viewport);

    // Review now: a task is done in Tasks, then the panel's button starts the review with the counts.
    await page.evaluate(async (id) => {
      const res = await fetch(`/api/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'done' }) });
      if (!res.ok) throw new Error(`PATCH failed: ${res.status}`);
    }, created.id);
    await panel.getByRole('button', { name: 'Review now' }).click();
    await expect(panel).toBeHidden({ timeout: 20_000 });
    await expect.poll(async () => (await sessionNow()).reviewState?.status).toBe('reviewing');
    await expect(page.locator('.ps-record [data-step="improve"]')).toHaveAttribute('data-state', 'current');
    await expect(page.locator('.ps-suggestion')).toContainText('Next: After action review', { timeout: 20_000 });
    await page.getByRole('button', { name: 'Start it' }).click();
    await expect(page.locator('.ps-aar')).toBeAttached();
    await expect(page.locator('.ps-coach__messages')).toContainText('Let\'s look at how it went. 1 of 1 tasks are done.');

    // After action review: three full answers, a learned answer too short to be the heart of it, then a fuller one.
    await answer(page, 'Publish the rota a full week ahead every single week');
    await answer(page, 'It went out on time in three weeks out of four');
    await answer(page, 'The manager was away once and nobody else could sign it off');
    await expect(page.locator('.ps-aar [data-bar][data-filled="true"]')).toHaveCount(3);
    await answer(page, 'Name a deputy who can sign off');
    await expect(page.locator('.ps-coach__messages')).toContainText('Tell me more');
    await expect(page.locator('.ps-aar [data-bar][data-filled="true"]')).toHaveCount(3);
    await answer(page, 'A single person signing off is fragile, so we will name a deputy and write the steps down for them');
    await expect(page.locator('.ps-aar [data-bar][data-filled="true"]')).toHaveCount(4);
    await expect(page.locator('.ps-aar [data-share]')).toBeAttached();
    await noOverflow(page);
    await shot(page, 'aar', viewport);

    // Double loop: the problem came back, so the outer loop is drawn; the governing rule reopens Define.
    await answer(page, 'next: double_loop');
    await expect(page.locator('.ps-suggestion')).toContainText('Next: Double-loop learning');
    await page.getByRole('button', { name: 'Start it' }).click();
    await expect(page.locator('.ps-dloop')).toBeAttached();
    await answer(page, 'The rota is changed at the last minute most weeks');
    await answer(page, 'We moved the publish day from Friday to Wednesday');
    await answer(page, 'yes, it came back again in week four');
    await answer(page, 'Only the manager is allowed to approve any rota change');
    await expect(page.locator('.ps-dloop [data-loop="outer"][data-drawn="true"]')).toBeAttached();
    await noOverflow(page);
    await shot(page, 'dloop', viewport);
    await answer(page, 'reopen: define');
    await expect(page.locator('.ps-suggestion')).toContainText('Reopen: Define');
    await page.getByRole('button', { name: 'Reopen it' }).click();
    await expect(page.locator('.ps-track__stn', { hasText: 'Define' })).toHaveAttribute('data-state', 'now', { timeout: 20_000 });
    // Define already has runs, so it opens on its chart; the record shows Improve paused.
    await openRecord(page);
    await expect(page.locator('.ps-record [data-step="improve"]')).toHaveAttribute('data-state', 'waiting');
    await noOverflow(page);
    await shot(page, 'reopened', viewport);

    // Moving on from the reopened Define comes straight back to Improve, with the double loop kept.
    await page.getByRole('button', { name: 'Move on to Improve' }).click();
    await expect(page.locator('.ps-coach__messages')).toContainText(/what did you learn/i);
    await answer(page, 'I fix the symptom before I question the rule');
    await openRecord(page);
    await expect(page.locator('.ps-record [data-step="improve"]')).toHaveAttribute('data-state', 'current', { timeout: 20_000 });
    await expect(page.locator('.ps-record__strip[data-strip="improve"]')).toContainText('Double-loop learning');
    await noOverflow(page);
    await shot(page, 'back-to-improve', viewport);

    // Leaving Improve ends the review; Document and Finish close the problem.
    await page.getByRole('button', { name: 'Move on to Document' }).click();
    await expect(page.locator('.ps-coach__messages')).toContainText(/what did you learn/i);
    await expect.poll(async () => (await sessionNow()).reviewState?.status).toBe('done');
    await answer(page, 'I learn more when I wait for real results');
    await page.getByRole('button', { name: 'Finish' }).click();
    await expect.poll(async () => (await sessionNow()).phase).toBe('finished');
    await expect.poll(async () => (await sessionNow()).status).toBe('finished');
    await noOverflow(page);
    await shot(page, 'finished', viewport);

    // A done review cannot start again: the review link opens the problem with no banner.
    await page.goto(`/#/problem-solver?id=${encodeURIComponent(sessionId)}&step=improve`);
    await page.reload();
    await expect(page.locator('.ps-record')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.ps-resume')).toHaveCount(0);
    await expect(page.locator('.ps-review')).toBeHidden();
  });
  test(`a late review: Improve left waiting, Document writes the case file, then the review reopens Improve and adds an update at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize(viewport);
    await signIn(page);
    await frameProblem(page, 'The meeting notes never reach the people who missed it');
    const { id, now } = await sessionReader(page);

    // Skip the early steps untouched, then finish a Kanban board in Implement.
    for (const next of ['Analyse', 'Devise', 'Decide', 'Implement']) await page.getByRole('button', { name: `Move on to ${next}` }).click();
    // A step left untouched asks no learning question, so the next tool is suggested on the next turn.
    await answer(page, 'Ready to plan the work out now please');
    await expect(page.locator('.ps-suggestion')).toContainText('Next: Kanban', { timeout: 20_000 });
    await page.getByRole('button', { name: 'Start it' }).click();
    await expect(page.locator('.ps-kanban')).toBeAttached();
    for (const card of ['Notes template shared with the whole team', 'Notes posted in the channel within the hour', 'Absent people tagged in the posted notes']) await answer(page, `done: ${card}`);
    await expect(page.locator('.ps-kanban [data-node]')).toHaveCount(3);
    await createReviewOnLeaving(page, viewport, now);
    await expect(page.locator('.ps-coach__messages')).toContainText(/what did you learn/i);
    await answer(page, 'I stop checking once the work feels finished');
    await expect(page.locator('.ps-review')).toContainText('Improve picks up at your review on');

    // Move on past the waiting Improve: it stays waiting.
    await page.getByRole('button', { name: 'Move on to Document' }).click();
    await expect.poll(async () => (await now()).phase).toBe('document');
    await openRecord(page);
    await expect(page.locator('.ps-record [data-step="improve"]')).toHaveAttribute('data-state', 'waiting', { timeout: 20_000 });
    expect((await now()).reviewState.status).toBe('waiting');

    // Document: Improve was left untouched, so no learning question; the next turn suggests the 5 Cs.
    // Four full answers follow, then the name.
    await answer(page, 'Ready to write up what we have learned');
    await expect(page.locator('.ps-suggestion')).toContainText('Next: 5 Cs documentation', { timeout: 20_000 });
    await page.getByRole('button', { name: 'Start it' }).click();
    await expect(page.locator('.ps-fivecs')).toBeAttached();
    await answer(page, 'So the next person running the meeting knows what to send');
    await answer(page, 'Filed under team meetings in the shared drive for everyone');
    await answer(page, 'Notes go out within the hour with absent people tagged');
    await answer(page, 'correct: Nothing in the record needs correcting at this point');
    await expect(page.locator('.ps-fivecs [data-slice][data-filled="true"]')).toHaveCount(4);
    await noOverflow(page);
    await shot(page, 'fivecs', viewport);

    // The name: one without a date is challenged; the full one is accepted.
    await answer(page, 'Kitchen rota case file for the team');
    await expect(page.locator('.ps-coach__messages')).toContainText('That name needs one more thing');
    await expect(page.locator('.ps-fivecs [data-slice][data-filled="true"]')).toHaveCount(4);
    // The names only need a real date.
    const name = `Kitchen rota case file ${await todayStamp(page)} v1 Final`;
    await answer(page, name);
    await expect(page.locator('.ps-fivecs [data-slice][data-filled="true"]')).toHaveCount(5);
    // Every strict naming rule shows as met.
    for (const rule of ['date', 'length', 'version', 'final', 'characters']) await expect(page.locator(`.ps-fivecs [data-rule="${rule}"]`)).toHaveAttribute('data-ok', 'true');
    await noOverflow(page);
    await shot(page, 'fivecs-named', viewport);

    // Write: the problem links nothing, so the place is a new project named by the case file.
    const caseCard = page.locator('.ps-casefilecard');
    await expect(caseCard).toContainText('Write the case file?');
    await expect(caseCard.locator('select[name="place"]')).toHaveValue('new');
    await expect(caseCard.locator('select[name="place"] option:checked')).toHaveText(`New project: ${name}`);
    await noOverflow(page);
    await shot(page, 'casefilecard', viewport);
    const projectsNamed = () => page.evaluate(async (wanted) => {
      const res = await fetch('/api/projects').then((r) => r.json());
      return res.data.projects.filter((project) => project.title === wanted);
    }, name);
    const before = new Set((await projectsNamed()).map((item) => item.id));
    await caseCard.getByRole('button', { name: 'Write case file' }).click();
    await expect(caseCard).toHaveCount(0);
    await expect.poll(async () => (await now()).caseFile?.version).toBe(1);
    // The mock API is shared by both widths, so count the projects this write made.
    const target = (await now()).caseFile.target;
    expect(target.kind).toBe('project');
    const madeHere = (await projectsNamed()).filter((item) => !before.has(item.id));
    expect(madeHere.map((item) => item.id)).toEqual([target.id]);
    const [project] = madeHere;
    const blocks = project.page_blocks;
    expect(blocks[0].block_type).toBe('heading');
    expect(blocks[0].content.text).toBe(name);
    expect(blocks.at(-1).block_type).toBe('rich_text');
    expect(blocks.at(-1).content.html).toContain(`#/problem-solver?id=${encodeURIComponent(id)}`);

    // The project page carries the Problem Solver chip.
    await page.goto(`/#/project/${encodeURIComponent(project.id)}`);
    await expect(page.locator('a.ps-linkchip')).toBeVisible({ timeout: 20_000 });
    await noOverflow(page);
    await shot(page, 'casefile-project', viewport);

    // Finish: the case file is written, so no card.
    await page.goto(`/#/problem-solver?id=${encodeURIComponent(id)}`);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Finish' }).click();
    await expect.poll(async () => (await now()).phase).toBe('finished');
    await expect(page.locator('.ps-coach__messages')).toContainText(/what did you learn/i);
    await answer(page, 'I name things better when the rules are in front of me');
    await expect(caseCard).toHaveCount(0);

    // The review link: the problem has finished, the review reopens Improve, then it finishes again.
    await page.goto(`/#/problem-solver?id=${encodeURIComponent(id)}&step=improve`);
    await page.reload();
    const banner = page.locator('.ps-resume');
    await expect(banner).toContainText('This problem has moved on', { timeout: 20_000 });
    await noOverflow(page);
    await shot(page, 'late-banner', viewport);
    await banner.getByRole('button', { name: 'Review the results' }).click();
    await expect.poll(async () => (await now()).phase).toBe('improve');
    await openRecord(page);
    await expect(page.locator('.ps-record [data-step="improve"]')).toHaveAttribute('data-state', 'current', { timeout: 20_000 });
    await expect(page.locator('.ps-reviewcard')).toHaveCount(0);
    await expect(caseCard).toHaveCount(0);

    // A new after action review, whose learned goes into the case file's update.
    await expect(page.locator('.ps-suggestion')).toContainText('Next: After action review', { timeout: 20_000 });
    await page.getByRole('button', { name: 'Start it' }).click();
    await expect(page.locator('.ps-aar')).toBeAttached();
    await answer(page, 'Everyone gets the notes within the hour of the meeting');
    await answer(page, 'Most weeks they went out on time with people tagged');
    await answer(page, 'One week the note taker was away and nothing was sent');
    await answer(page, 'A named second note taker covers every absence, and the template sits pinned in the channel for them');
    await expect(page.locator('.ps-aar [data-bar][data-filled="true"]')).toHaveCount(4);
    await expect(caseCard).toHaveCount(0);

    // Leaving the review returns to where the problem was: finished.
    await page.getByRole('button', { name: 'Finish' }).click();
    await expect.poll(async () => (await now()).phase).toBe('finished');
    expect((await now()).reviewState.status).toBe('done');
    await expect(caseCard).toContainText('Add an update to the case file?', { timeout: 20_000 });
    await expect(caseCard.locator('.ps-casefilecard__sections')).toContainText('What was learned');
    await noOverflow(page);
    await shot(page, 'casefile-update', viewport);
    await caseCard.getByRole('button', { name: 'Add update' }).click();
    await expect(caseCard).toHaveCount(0);
    await expect.poll(async () => (await now()).caseFile?.version).toBe(2);
    const updated = (await projectsNamed()).find((item) => item.id === project.id);
    const after = updated.page_blocks;
    expect(after.length).toBeGreaterThan(blocks.length);
    expect(after.slice(0, blocks.length).map((b) => b.id)).toEqual(blocks.map((b) => b.id));
    const update = after[blocks.length];
    expect(update.block_type).toBe('heading');
    expect(update.variant).toBe('subsection');
    expect(update.content.text).toMatch(/^Update: Kitchen rota case file \d{8} v2 Final$/);
    expect(after.some((b) => b.block_type === 'rich_text' && b.content.html.includes('What was learned'))).toBe(true);
    expect(new Set(after.map((b) => b.id)).size).toBe(after.length);
    await noOverflow(page);
    await shot(page, 'late-finished', viewport);
  });
}

/** Move on from the current step; wait until the session has reached the next step (so the next answer goes to it) and the coach has answered. */
async function moveOnTo(page, next) {
  await page.getByRole('button', { name: next === 'Finish' ? 'Finish' : `Move on to ${next}` }).click();
  await expect(page.locator('.ps-composer__now')).toHaveText(next === 'Finish' ? 'Problem finished' : `Step: ${next}`, { timeout: 20_000 });
  await expect(page.getByLabel('Your answer')).toBeEnabled();
}

for (const viewport of [{ width: 900, height: 900 }, { width: 390, height: 844 }]) {
  test(`the seven-step process, one tool a step with Devise skipped, through the case file to Finish at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(300_000);
    await page.setViewportSize(viewport);
    await signIn(page);
    await frameProblem(page, `The stock count never matches the till at closing (${viewport.width}px)`);
    const { now } = await sessionReader(page);
    expect((await now()).model.id).toBe('seven_step');
    await noOverflow(page);
    await shot(page, 'walk-framed', viewport);

    // Define: 5 Whys, the problem, five whys and the root cause (named with its hint).
    await page.getByRole('button', { name: 'Start it' }).click();
    await expect(page.locator('.ps-whys')).toBeAttached();
    for (const line of [
      'The stock count is short of the till most evenings',
      'Items sold at the counter are not scanned every time',
      'The spare scanner at the counter has a flat battery',
      'Nobody is set to charge the spare scanner overnight',
      'The closing checklist leaves the scanner off entirely',
      'The checklist was written before the scanner was bought'
    ]) await answer(page, line);
    await answer(page, 'root: The closing checklist has no step to charge the scanner');
    await expect(page.locator('.ps-whys [data-node]')).toHaveCount(7);
    await noOverflow(page);
    await shot(page, 'walk-define', viewport);

    // Analyse: a causal map, the problem and three causes, each linked to the problem.
    await moveOnTo(page, 'Analyse');
    await expect(page.locator('.ps-coach__messages')).toContainText(/what did you learn/i);
    await answer(page, 'I stop at the first cause that sounds likely');
    await expect(page.locator('.ps-suggestion')).toContainText('Next: Causal map');
    await page.getByRole('button', { name: 'Start it' }).click();
    await expect(page.locator('.ps-causal')).toBeAttached();
    await answer(page, 'The stock count is short of the till most evenings');
    await answer(page, 'Counter sales are not scanned when the queue is long');
    await answer(page, 'Deliveries are booked in a day after they arrive');
    await answer(page, 'Damaged items are thrown out without being written off');
    for (const n of [1, 2, 3]) await answer(page, `link: cause ${n} to problem, plus`);
    await expect(page.locator('.ps-causal [data-edge]')).toHaveCount(3);
    await noOverflow(page);
    await shot(page, 'walk-analyse', viewport);

    // Devise is skipped untouched: no learning question, and Decide's tool is suggested without a reply.
    await moveOnTo(page, 'Devise');
    await expect(page.locator('.ps-coach__messages')).toContainText(/what did you learn/i);
    await answer(page, 'I trust the map more once every cause has a link');
    await expect(page.locator('.ps-suggestion')).toContainText('Next: Lotus blossom');
    const userTurns = async () => (await now()).turns.filter((turn) => turn.role === 'user').length;
    const before = await userTurns();
    await moveOnTo(page, 'Decide');
    await expect(page.locator('.ps-suggestion')).toContainText('Next: Decision matrix', { timeout: 20_000 });
    expect(await userTurns()).toBe(before + 1); // only the "Move on." turn
    expect((await now()).steps.devise.status).toBe('skipped');

    // Decide: two criteria, two options, scored, then the choice.
    await page.getByRole('button', { name: 'Start it' }).click();
    await expect(page.locator('.ps-matrix')).toBeAttached();
    await answer(page, 'criterion: The count matches the till every evening');
    await answer(page, 'criterion: Closing takes no longer than it does now');
    await answer(page, 'option: Add a scanner charging step to the checklist');
    await answer(page, 'option: Count the counter stock again before closing');
    await page.getByRole('button', { name: 'Score the options' }).click();
    const form = page.locator('.ps-matrix__form');
    await form.getByLabel('Percent').check();
    const weights = form.locator('input[data-weight]');
    await weights.nth(0).fill('70');
    await weights.nth(1).fill('30');
    const ratings = form.locator('input[data-rating]');
    for (const [i, value] of ['9', '4', '9', '3'].entries()) await ratings.nth(i).fill(value);
    await form.getByRole('button', { name: 'Save scores' }).click();
    await expect(page.locator('.ps-matrix [data-total]')).toHaveCount(2);
    await answer(page, 'choice: Add a scanner charging step to the checklist');
    await expect(page.locator('.ps-matrix [data-choice]')).toContainText('scanner charging step');
    await noOverflow(page);
    await shot(page, 'walk-decide', viewport);

    // Implement: a Kanban board. The first card becomes a real task and shows its live status.
    await moveOnTo(page, 'Implement');
    await answer(page, 'I decide faster once the weights are written down');
    await expect(page.locator('.ps-suggestion')).toContainText('Next: Kanban');
    await page.getByRole('button', { name: 'Start it' }).click();
    await expect(page.locator('.ps-kanban')).toBeAttached();
    await answer(page, 'Add the charging step to the closing checklist');
    const taskCard = page.locator('.ps-taskcard');
    await expect(taskCard).toHaveCount(1);
    await taskCard.getByRole('button', { name: 'Create task' }).click();
    await expect(taskCard).toHaveCount(0);
    await expect.poll(async () => (await now()).proposedTasks.filter((p) => p.status === 'confirmed').length).toBe(1);
    const confirmed = (await now()).proposedTasks.find((p) => p.status === 'confirmed');
    await expect(page.locator('.ps-kanban [data-column="todo"] [data-task-status="open"]')).toHaveCount(1);
    await page.evaluate(async (id) => {
      const res = await fetch(`/api/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: 'in_progress' }) });
      if (!res.ok) throw new Error(`PATCH failed: ${res.status}`);
      document.dispatchEvent(new Event('visibilitychange'));
    }, confirmed.taskId);
    await expect(page.locator('.ps-kanban [data-column="doing"] [data-task-status="in_progress"]')).toHaveCount(1);
    await answer(page, 'doing: Show the closing staff where the charger lives');
    await expect(taskCard).toHaveCount(1);
    await taskCard.getByRole('button', { name: 'Not this one' }).click();
    await expect(taskCard).toHaveCount(0);
    await answer(page, 'done: A second charger was bought for the counter last week');
    await expect(page.locator('.ps-kanban [data-node]')).toHaveCount(3);
    await noOverflow(page);
    await shot(page, 'walk-implement', viewport);

    // Improve: the review is set aside, so Improve opens at once with an after action review.
    await page.getByRole('button', { name: 'Move on to Improve' }).click();
    await expect(page.locator('.ps-composer__now')).toHaveText('Step: Improve', { timeout: 20_000 });
    const reviewCard = page.locator('.ps-reviewcard');
    await expect(reviewCard).toBeVisible();
    await reviewCard.getByRole('button', { name: 'Not now' }).click();
    await expect(reviewCard).toHaveCount(0);
    await expect(page.locator('.ps-coach__messages')).toContainText(/what did you learn/i);
    await answer(page, 'I plan better when each card is small enough to finish');
    await expect(page.locator('.ps-suggestion')).toContainText('Next: After action review', { timeout: 20_000 });
    await page.getByRole('button', { name: 'Start it' }).click();
    await expect(page.locator('.ps-aar')).toBeAttached();
    await answer(page, 'The count matches the till on every evening this week');
    await answer(page, 'It matched on four evenings out of five this week');
    await answer(page, 'One evening the charger was unplugged for the kettle');
    await answer(page, 'A checklist step only holds when the thing it needs has its own place, so the charger gets a fixed socket of its own');
    await expect(page.locator('.ps-aar [data-bar][data-filled="true"]')).toHaveCount(4);
    await noOverflow(page);
    await shot(page, 'walk-improve', viewport);

    // Document: the 5 Cs, a strict name, then the case file is written.
    await moveOnTo(page, 'Document');
    await answer(page, 'I learn most when I compare the aim with the facts');
    await expect(page.locator('.ps-suggestion')).toContainText('Next: 5 Cs documentation', { timeout: 20_000 });
    await page.getByRole('button', { name: 'Start it' }).click();
    await expect(page.locator('.ps-fivecs')).toBeAttached();
    await answer(page, 'So whoever closes the shop knows why the scanner matters');
    await answer(page, 'Filed under shop procedures in the shared drive for staff');
    await answer(page, 'The scanner is charged at a fixed socket every closing');
    await answer(page, 'correct: Nothing in the record needs correcting at this point');
    const name = `Stock count case file ${await todayStamp(page)} v1 Final`;
    await answer(page, name);
    await expect(page.locator('.ps-fivecs [data-slice][data-filled="true"]')).toHaveCount(5);
    const caseCard = page.locator('.ps-casefilecard');
    await expect(caseCard).toContainText('Write the case file?');
    await caseCard.getByRole('button', { name: 'Write case file' }).click();
    await expect(caseCard).toHaveCount(0);
    await expect.poll(async () => (await now()).caseFile?.version).toBe(1);
    await noOverflow(page);
    await shot(page, 'walk-document', viewport);

    // The record lights each step: done, Devise skipped and faint, Document current, with its case file.
    await openRecord(page);
    await settled(page);
    for (const step of ['define', 'analyse', 'decide', 'implement', 'improve']) {
      await expect(page.locator(`.ps-record [data-step="${step}"]`)).toHaveAttribute('data-state', 'done', { timeout: 20_000 });
    }
    const devise = page.locator('.ps-record [data-step="devise"]');
    await expect(devise).toHaveAttribute('data-state', 'skipped');
    await expect(devise.locator('.ps-record__box')).toHaveCSS('opacity', '0.45');
    await expect(page.locator('.ps-record [data-step="document"]')).toHaveAttribute('data-state', 'current');
    await expect(page.locator('.ps-record__strip[data-strip="document"] .ps-record__version')).toHaveText('Case file v1');
    await noOverflow(page);
    await shot(page, 'walk-record', viewport);

    // A filmstrip card morphs into its chart, and back.
    await page.locator('.ps-record__strip[data-strip="analyse"] .ps-record__card-button').click();
    await expect(page.locator('.ps-canvas__chart')).toBeVisible();
    await expect(page.locator('.ps-canvas__chart')).toHaveClass(/\bps-chart-reveal\b/);
    await expect(page.locator('.ps-causal [data-edge]')).toHaveCount(3);
    await settled(page);
    await noOverflow(page);
    await page.getByRole('button', { name: 'Back to record' }).click();
    await expect(page.locator('.ps-record [data-step="devise"]')).toBeVisible();

    // Finish at Document.
    await moveOnTo(page, 'Finish');
    await expect.poll(async () => (await now()).phase).toBe('finished');
    await expect(page.locator('.ps-coach__messages')).toContainText(/what did you learn/i);
    await answer(page, 'I keep a record better when the naming rules are shown');
    await expect.poll(async () => (await now()).steps.document.status).toBe('done');
    await noOverflow(page);
    await shot(page, 'walk-finished', viewport);
  });

  test(`Polya: the track and record follow its four steps and the Document extra, every step skipped to Finish at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    await signIn(page);
    await frameProblem(page, `The bike lock code is forgotten every spring (${viewport.width}px)`, 'Write the code somewhere safe, model: polya');
    const { now } = await sessionReader(page);
    expect((await now()).model.id).toBe('polya');
    await expect(page.locator('.ps-track__name')).toHaveText(['Frame', 'Identify the problem', 'Devise a solution', 'Implement the solution', 'Evaluate the solution', 'Document']);
    await expect(page.locator('.ps-track__stn').nth(1)).toHaveAttribute('data-state', 'now');
    await noOverflow(page);
    await shot(page, 'polya-framed', viewport);

    // Each step is left untouched, so the next one's tool is suggested at once.
    await moveOnTo(page, 'Devise a solution');
    await expect(page.locator('.ps-suggestion')).toContainText('Next: Lotus blossom', { timeout: 20_000 });
    await moveOnTo(page, 'Implement the solution');
    await expect(page.locator('.ps-suggestion')).toContainText('Next: Kanban', { timeout: 20_000 });
    await moveOnTo(page, 'Evaluate the solution');
    await expect(page.locator('.ps-suggestion')).toContainText('Next: After action review', { timeout: 20_000 });
    await moveOnTo(page, 'Document');
    await expect(page.locator('.ps-suggestion')).toContainText('Next: 5 Cs documentation', { timeout: 20_000 });
    await moveOnTo(page, 'Finish');
    await expect.poll(async () => (await now()).phase).toBe('finished');

    await openRecord(page);
    for (const step of ['identify', 'devise', 'implement', 'evaluate']) {
      await expect(page.locator(`.ps-record__map [data-step="${step}"]`)).toHaveAttribute('data-state', 'skipped', { timeout: 20_000 });
    }
    const extra = page.locator('.ps-record__extras [data-step="document"]');
    await expect(extra).toHaveAttribute('data-state', 'skipped');
    await expect(extra).toContainText('Optional');
    await expect(page.locator('.ps-track__stn[data-state="skipped"]')).toHaveCount(5);
    await noOverflow(page);
    await shot(page, 'polya-finished', viewport);
  });

  test(`TRIZ: the Contradiction step offers the contradiction tool, then every step and extra to Finish at ${viewport.width}px`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    await signIn(page);
    await frameProblem(page, `A faster kettle trips the kitchen fuse (${viewport.width}px)`, 'model: triz, faster boiling draws more power than the circuit allows');
    const { now } = await sessionReader(page);
    expect((await now()).model.id).toBe('triz');
    await expect(page.locator('.ps-track__name')).toHaveText(['Frame', 'Specific problem', 'General problem', 'General solution', 'Specific solution', 'Implement', 'Improve', 'Document']);

    // General problem is TRIZ's Contradiction step: its tool is the contradiction.
    await moveOnTo(page, 'General problem');
    await expect(page.locator('.ps-suggestion')).toContainText('Next: Contradiction', { timeout: 20_000 });
    await noOverflow(page);
    await shot(page, 'triz-contradiction', viewport);
    for (const next of ['General solution', 'Specific solution', 'Implement', 'Improve', 'Document', 'Finish']) await moveOnTo(page, next);
    await expect.poll(async () => (await now()).phase).toBe('finished');

    await openRecord(page);
    for (const step of ['specific_problem', 'general_problem', 'general_solution', 'specific_solution']) {
      await expect(page.locator(`.ps-record__map [data-step="${step}"]`)).toHaveAttribute('data-state', 'skipped', { timeout: 20_000 });
    }
    for (const step of ['implement', 'improve', 'document']) {
      await expect(page.locator(`.ps-record__extras [data-step="${step}"]`)).toHaveAttribute('data-state', 'skipped');
    }
    await noOverflow(page);
    await shot(page, 'triz-finished', viewport);
  });
}

/** A reply on a Lightning run. The coach answers before the next; the run's last reply closes the composer. */
async function ltnSay(page, text, { closes = false } = {}) {
  await page.getByLabel('Your answer').fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
  if (closes) await expect(page.getByLabel('Your answer')).toBeDisabled();
  else await expect(page.getByLabel('Your answer')).toBeEnabled();
}

/** The chart box waiting for an answer, and the question holding it. */
const ltnCurrent = (page) => page.locator('.ps-ltn-page .ps-ltn__node[aria-current="step"]');
const ltnQuestion = (page) => page.locator('.ps-ltn-strip li[aria-current="step"]');

/** Start a Lightning run from the landing card; the coach asks the first box. */
async function startLightning(page, snag) {
  await page.getByLabel('Describe the snag').fill(snag);
  await page.getByRole('button', { name: 'Go', exact: true }).click();
  await expect(page.locator('.ps-ltn-page')).toBeVisible();
  await expect(page.getByLabel('Your answer')).toBeEnabled();
  await expect(ltnQuestion(page)).toHaveAttribute('data-question', 'fix');
  await expect(ltnCurrent(page)).toHaveAttribute('data-lnode', 'start');
}

/** Answer Start with No on the chart, then give the goal. */
async function ltnToGoal(page, goal) {
  await page.getByRole('button', { name: 'No: Could you accept things as they are?' }).click();
  await expect(ltnCurrent(page)).toHaveAttribute('data-lnode', 'goal');
  await expect(page.getByLabel('Your answer')).toBeEnabled();
  await ltnSay(page, goal);
  await expect(ltnCurrent(page)).toHaveAttribute('data-lnode', 'subtract');
}

test.describe('Lightning', () => {
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    test(`a run to Relax, then It came back starts round two at ${viewport.width}px`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize(viewport);
      await signIn(page);
      await startLightning(page, `The back door sticks in wet weather (${viewport.width}px)`);
      await noOverflow(page);
      await shot(page, 'ltn-start', viewport);

      await ltnToGoal(page, 'Have the door shut without a shove');
      await ltnSay(page, 'no');
      await expect(ltnCurrent(page)).toHaveAttribute('data-lnode', 'one_step');
      await ltnSay(page, 'no');
      await expect(ltnCurrent(page)).toHaveAttribute('data-lnode', 'diagram');
      await ltnSay(page, 'no, sketched how the jam happens');
      await expect(ltnCurrent(page)).toHaveAttribute('data-lnode', 'work_backwards');
      await ltnSay(page, 'yes, working backwards found it');
      await expect(ltnCurrent(page)).toHaveAttribute('data-lnode', 'learn');
      await expect(ltnQuestion(page)).toHaveAttribute('data-question', 'learn');
      // The bottom path inks, and Relax inks at its middle spot (reached from the second "solved?").
      for (const edge of ['diagram>solved_1', 'solved_1>work_backwards', 'work_backwards>solved_2', 'solved_2>relax']) {
        await expect(page.locator(`.ps-ltn-page .ps-ltn__edge[data-edge="${edge}"]`)).toHaveAttribute('data-inked', 'true');
      }
      await expect(page.locator('.ps-ltn-page .ps-ltn__node[data-spot="relax_middle"]')).toHaveAttribute('data-state', 'done');
      await expect(page.locator('.ps-ltn-page .ps-ltn__node[data-spot="relax_bottom"]')).toHaveAttribute('data-state', 'ghost');
      await noOverflow(page);
      await shot(page, 'ltn-relax', viewport);

      await ltnSay(page, 'Check the hinge screws before anything else');
      await expect(ltnCurrent(page)).toHaveAttribute('data-lnode', 'next');
      await ltnSay(page, 'Plane the edge this weekend', { closes: true });
      await expect(page.getByText('That run is done', { exact: true })).toBeVisible();
      const again = page.getByRole('button', { name: 'It came back' });
      await expect(again).toBeVisible();
      await expect(ltnCurrent(page)).toHaveCount(0);
      await noOverflow(page);
      await shot(page, 'ltn-done', viewport);

      await again.click();
      await expect(ltnCurrent(page)).toHaveAttribute('data-lnode', 'start');
      await expect(ltnQuestion(page)).toHaveAttribute('data-question', 'fix');
      await expect(page.getByLabel('Your answer')).toBeEnabled();
      await expect(page.getByLabel('Your answer')).toBeFocused();
      await expect(page.locator('.ps-ltn-page__done')).toBeHidden();
      // The first round stays inked, faded a step.
      await expect(page.locator('.ps-ltn-page .ps-ltn__node[data-lnode="work_backwards"]')).toHaveAttribute('data-round', 'old');
      await expect(page.locator('.ps-ltn-page .ps-ltn__edge[data-edge="solved_1>work_backwards"]')).toHaveAttribute('data-round', 'old');
      await noOverflow(page);
      await shot(page, 'ltn-round2', viewport);
    });

    test(`escalation: the full process starts seeded, shows the run's chart, and the list says so at ${viewport.width}px`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize(viewport);
      await signIn(page);
      const snag = `The shared printer jams for the whole team (${viewport.width}px)`;
      await startLightning(page, snag);
      await ltnToGoal(page, 'Print without a jam every time');
      await ltnSay(page, 'escalate');
      const card = page.locator('.ps-suggestion');
      await expect(card.locator('.ps-suggestion__title')).toHaveText('This needs the full process');
      await expect(card.getByRole('button', { name: 'Not now' })).toBeVisible();
      await noOverflow(page);
      await shot(page, 'ltn-escalate', viewport);
      const runHash = await page.evaluate(() => location.hash);

      await card.getByRole('button', { name: 'Start the full process' }).click();
      await expect(page.locator('.ps-ltn-page')).toHaveCount(0);
      await expect(page.locator('.ps-frame')).toBeVisible();
      const from = page.locator('details.ps-ltn-from');
      await expect(from).toBeVisible();
      await expect(page.getByLabel('Your answer')).toBeEnabled({ timeout: 20_000 });
      const first = page.locator('.ps-coach .chat-message--assistant').first();
      await expect(first).toContainText('Carried over from Lightning');
      await expect(first).toContainText('Goal: Print without a jam every time');
      await from.locator('summary').click();
      await expect(from.locator('.ps-ltn')).toBeVisible();
      await expect(from.locator('.ps-ltn__node[data-lnode="goal"]')).toHaveAttribute('data-state', 'done');
      await expect(from.locator('.ps-ltn__ask')).toBeHidden();
      await expect(from.getByRole('link', { name: 'Open the Lightning run' })).toHaveAttribute('href', runHash);
      await noOverflow(page);
      await shot(page, 'ltn-from', viewport);

      // The run itself now says where it went.
      await page.goto(`/${runHash}`);
      const sent = page.locator('.ps-ltn-page__sent[role="status"]');
      await expect(sent).toContainText('This went to the full process.');
      await expect(page.locator('.ps-ltn-page__done')).toBeHidden();
      await noOverflow(page);

      await page.getByRole('link', { name: '← Problems' }).click();
      // The run and the full session share the title; the run's row carries the lightning glyph.
      const rows = page.locator('.ps-prob', { hasText: snag });
      await expect(rows).toHaveCount(2);
      const row = rows.filter({ has: page.locator('.ps-prob__medal--lightning') });
      await expect(row.locator('.ps-prob__phase')).toHaveText('Went to full process');
      await expect(row.locator('.ps-lightning-glyph svg')).toBeVisible();
      await expect(rows.filter({ hasNot: page.locator('.ps-prob__medal--lightning') }).locator('.ps-prob__phase')).toHaveText('Framing');
      await noOverflow(page);
      await shot(page, 'ltn-list', viewport);
    });
  }
});
