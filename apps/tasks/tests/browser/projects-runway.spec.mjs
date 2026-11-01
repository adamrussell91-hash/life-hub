// Smoke test: Projects lands on the runway (mock API, invented projects).
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
}

function dateKey(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function seedProject(page, body) {
  return page.evaluate(async (payload) => {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(`project ${res.status}`);
    return res.json();
  }, body);
}

test('projects page renders the runway with a dated and an undated project', async ({ page }) => {
  await signIn(page);
  const stamp = Date.now().toString(36);
  const dated = `Runway smoke dated ${stamp}`;
  const undated = `Runway smoke undated ${stamp}`;
  const created = await seedProject(page, { title: dated, current_end_date: dateKey(20) });
  const projectId = created?.data?.id ?? created?.id;
  await seedProject(page, { title: undated });
  if (projectId) {
    await page.evaluate(async (id) => {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'Runway smoke task', domain: 'teaching', parent_project_id: id, kind: 'task', bucket: 'active', estimated_duration: 90 })
      });
    }, projectId);
  }

  await page.goto('/#/projects');
  const runway = page.locator('#projects-runway');
  await expect(runway).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.runway-lede')).not.toBeEmpty();
  await expect(page.locator('.runway-axis .runway-knob')).toHaveText('TODAY');

  const datedRow = page.locator('.runway-row', { hasText: dated });
  await expect(datedRow.locator('.runway-flag')).toBeVisible();
  await expect(datedRow.locator('.runway-seg')).toHaveCount(1);
  await expect(page.locator('.runway-row', { hasText: undated }).locator('.runway-ground')).toBeVisible();

  // Scrub ahead and back.
  const scale = page.locator('.runway-scale');
  const box = await scale.boundingBox();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('.runway-lede')).toContainText('Looking ahead to');
  await page.getByRole('button', { name: 'Back to today' }).click();
  await expect(page.locator('.runway-axis .runway-knob')).toHaveText('TODAY');

  // Phone width: no horizontal page scroll.
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
