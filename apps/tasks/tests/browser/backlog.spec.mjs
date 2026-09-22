import { expect, test } from '@playwright/test';

async function signIn(page) {
  await page.goto('/');
  await page.evaluate(async () => {
    const session = await fetch('/api/session').then((res) => res.json());
    if (session?.data?.authenticated) return;
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ passphrase: 'tasks-hub-local' })
    });
    if (!res.ok) throw new Error('Could not sign in');
  });
  await page.goto('/');
  await expect(page.locator('.page-header__copy .page-header__title')).toBeVisible({
    timeout: 20_000
  });
}

async function openBacklog(page, hash = '#/list') {
  await expect(page.locator('.canvas-status')).toHaveCount(0, { timeout: 20_000 });
  const desktop = page.locator('.hub-rail__list--desktop').getByRole('link', { name: 'Backlog' });
  if (await desktop.isVisible()) {
    await desktop.click();
  } else {
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('link', { name: 'Backlog' }).click();
  }
  await expect(page.locator('.backlog-page')).toBeVisible({ timeout: 20_000 });
  if (hash.includes('triage')) {
    await page.getByRole('button', { name: 'Triage' }).click();
    await expect(page.locator('.backlog-triage')).toBeVisible({ timeout: 20_000 });
  }
}

async function dismissReminders(page) {
  for (let i = 0; i < 3; i += 1) {
    const dismiss = page.getByRole('button', { name: 'Dismiss' }).first();
    if (!(await dismiss.isVisible().catch(() => false))) break;
    await dismiss.click({ timeout: 2000 }).catch(() => undefined);
  }
}

async function createBacklogTask(page, title, extras = {}) {
  return page.evaluate(async ({ name, extra }) => {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: name,
        domain: extra.domain ?? 'life',
        kind: 'task',
        bucket: 'active',
        ...extra
      })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message || res.statusText);
    return json.data;
  }, { name: title, extra: extras });
}

async function ensureFreshRows(page, count) {
  const existing = await page.evaluate(async () => {
    const json = await fetch('/api/tasks').then((res) => res.json());
    return (json.data?.tasks ?? []).filter(
      (task) => !task.due_date && (task.status === 'open' || task.status === 'deferred') && task.bucket !== 'someday'
    ).length;
  });
  for (let i = existing; i < count; i += 1) {
    await createBacklogTask(page, `Backlog row ${String(i + 1).padStart(2, '0')} ${Date.now()}`);
  }
}

test.describe('Backlog', () => {
  test.describe.configure({ timeout: 60_000 });
  test('loads the dense list on #/list and #/backlog', async ({ page }) => {
    await signIn(page);
    await openBacklog(page, '#/list');
    await expect(page.getByRole('heading', { name: 'Backlog', level: 1 })).toBeVisible();
    await expect(page.locator('.page-header__copy > .page-header__eyebrow')).toHaveText('Views');
    await expect(page.locator('.backlog-zone')).toHaveCount(4);
    await expect(page.getByRole('button', { name: 'Triage' })).toBeVisible();

    await page.goto('/#/backlog');
    await expect(page.locator('.backlog-page')).toBeVisible();
    await expect(page.locator('.backlog-zone[data-zone="today"]')).toBeVisible();
  });

  test('quick add with a parsed date never lands in the backlog', async ({ page }) => {
    await signIn(page);
    await openBacklog(page);
    const title = `email Simone re room fri #teaching ${Date.now()}`;
    const field = page.getByLabel('New task title');
    await field.fill(title);
    await expect(page.locator('.quick-add__chips')).toContainText('Date');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(page.locator('.hub-toast')).toContainText(/Added to Fri/);
    await expect(page.locator('.backlog-row', { hasText: 'email Simone re room' })).toHaveCount(0);
  });

  test('dragging a row to Today removes it and Undo restores the original index', async ({ page }) => {
    await signIn(page);
    await openBacklog(page);
    const stamp = Date.now();
    const older = await createBacklogTask(page, `Drag older ${stamp}`);
    await page.waitForTimeout(20);
    const dragged = await createBacklogTask(page, `Drag me ${stamp}`);
    await page.reload();
    await expect(page.locator('.backlog-page')).toBeVisible();

    const idsBefore = await page.locator('.backlog-fresh .backlog-row').evaluateAll((rows) =>
      rows.map((row) => row.getAttribute('data-task-id'))
    );
    const fromIndex = idsBefore.indexOf(dragged.id);
    expect(fromIndex).toBeGreaterThan(-1);

    await page.evaluate((taskId) => {
      const row = document.querySelector(`[data-task-id="${taskId}"]`);
      const zone = document.querySelector('[data-zone="today"]');
      if (!row || !zone) throw new Error('missing drag nodes');
      const dt = new DataTransfer();
      dt.setData('text/task-ids', taskId);
      dt.setData('text/plain', taskId);
      row.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
      zone.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
      zone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
      row.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
    }, dragged.id);

    await expect(page.locator(`.backlog-fresh [data-task-id="${dragged.id}"]`)).toHaveCount(0, {
      timeout: 8_000
    });
    await expect(page.locator('.hub-toast')).toContainText(/Scheduled for today/);
    await page.locator('.hub-toast__action').click();
    await expect(page.locator(`.backlog-fresh [data-task-id="${dragged.id}"]`)).toBeVisible({
      timeout: 8_000
    });
    const idsAfter = await page.locator('.backlog-fresh .backlog-row').evaluateAll((rows) =>
      rows.map((row) => row.getAttribute('data-task-id'))
    );
    expect(idsAfter.indexOf(dragged.id)).toBe(fromIndex);
    expect(idsAfter).toContain(older.id);
  });

  test('keyboard T schedules the focused row for today', async ({ page }) => {
    await signIn(page);
    await openBacklog(page);
    const task = await createBacklogTask(page, `Keyboard today ${Date.now()}`);
    await page.reload();
    await expect(page.locator('.backlog-page')).toBeVisible();
    await page.locator(`[data-task-id="${task.id}"]`).click();
    await page.keyboard.press('t');
    await expect(page.locator(`.backlog-fresh [data-task-id="${task.id}"]`)).toHaveCount(0, {
      timeout: 8_000
    });
    await expect(page.locator('.hub-toast')).toContainText(/Scheduled for today/);
  });

  test('triage opens, W advances, and Z undoes', async ({ page }) => {
    await signIn(page);
    const first = await createBacklogTask(page, `Triage first ${Date.now()}`);
    await createBacklogTask(page, `Triage second ${Date.now()}`);
    await openBacklog(page, '#/backlog/triage');
    await expect(page.locator('.backlog-triage')).toBeVisible();
    await expect(page.locator('.backlog-triage__progress')).toContainText('Triage ·');
    const title = await page.locator('.backlog-triage__title').innerText();
    await page.keyboard.press('w');
    await expect(page.locator('.backlog-triage__title')).not.toHaveText(title, { timeout: 8_000 });
    await page.keyboard.press('z');
    await expect(page.locator('.backlog-triage__title')).toHaveText(title, { timeout: 8_000 });
    expect(first.id).toBeTruthy();
  });

  test('Keep on a stale row resets its age', async ({ page }) => {
    await signIn(page);
    const stale = await createBacklogTask(page, `Stale keep ${Date.now()}`, {
      updated_at: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString()
    });
    await openBacklog(page);
    await page.locator('.backlog-stale__toggle').click();
    const row = page.locator(`.backlog-stale [data-task-id="${stale.id}"]`);
    await expect(row).toBeVisible();
    const before = await row.locator('.backlog-row__age').innerText();
    expect(before).not.toBe('0d');
    await row.getByRole('button', { name: 'Keep' }).click();
    await expect(page.locator(`.backlog-fresh [data-task-id="${stale.id}"] .backlog-row__age`)).toHaveText(
      '0d',
      { timeout: 8_000 }
    );
    await expect(page.locator(`.backlog-stale [data-task-id="${stale.id}"]`)).toHaveCount(0);
  });

  test('reduced motion produces no transforms', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await signIn(page);
    await openBacklog(page);
    await expect(page.locator('.backlog-page')).toHaveAttribute('data-reduced', '1');
    const transforms = await page.locator('.backlog-row').evaluateAll((rows) =>
      rows.map((row) => getComputedStyle(row).transform)
    );
    expect(transforms.every((value) => value === 'none')).toBe(true);
    const task = await createBacklogTask(page, `Reduced ${Date.now()}`);
    await page.reload();
    await page.locator(`[data-task-id="${task.id}"]`).click();
    await page.keyboard.press('t');
    await expect(page.locator('.backlog-ghost')).toHaveCount(0);
    const after = await page.locator('.backlog-row').evaluateAll((rows) =>
      rows.map((row) => getComputedStyle(row).transform)
    );
    expect(after.every((value) => value === 'none')).toBe(true);
  });

  test('390px swipe right schedules Today', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page);
    const task = await createBacklogTask(page, `Swipe today ${Date.now()}`);
    await openBacklog(page);
    const row = page.locator(`[data-task-id="${task.id}"]`);
    await expect(row).toBeVisible();
    await row.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const y = box.top + box.height / 2;
      const startX = box.left + 12;
      const endX = box.left + box.width * 0.7;
      node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: startX, clientY: y }));
      node.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'touch', clientX: endX, clientY: y }));
      node.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', clientX: endX, clientY: y }));
    });
    await expect(page.locator(`.backlog-fresh [data-task-id="${task.id}"]`)).toHaveCount(0, {
      timeout: 8_000
    });
  });

  test('twelve fresh rows fit on a 1440×900 canvas', async ({ page }) => {
    await signIn(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    for (let i = 0; i < 12; i += 1) {
      await createBacklogTask(page, `Fit row ${String(i + 1).padStart(2, '0')} ${Date.now()}`, {
        domain: 'teaching'
      });
    }
    await openBacklog(page);
    await dismissReminders(page);
    await page.evaluate(() => {
      document.querySelector('.reminder-strip-host')?.setAttribute('hidden', '');
      document.querySelector('.backlog-suggestions')?.setAttribute('hidden', '');
    });
    const twelfth = page.locator('.backlog-fresh .backlog-row').nth(11);
    await expect(twelfth).toBeVisible();
    const box = await twelfth.boundingBox();
    expect(box).toBeTruthy();
    expect(box.y + box.height).toBeLessThan(900);
  });
});
