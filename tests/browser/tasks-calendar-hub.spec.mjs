/**
 * Tasks hub calendar proof (Step 6). Built app via prepare-web → dist/.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const OUT = path.join('/opt/cursor/artifacts', 'tasks-calendar-hub');
fs.mkdirSync(OUT, { recursive: true });

let browser;
let server;
let appUrl;

before(async () => {
  browser = await chromium.launch({ headless: true });
  await import(pathToFileURL(path.join(REPO, 'scripts/prepare-web.mjs')).href);
  const { createStaticServer } = await import(pathToFileURL(path.join(REPO, 'scripts/serve.mjs')).href);
  const { once } = await import('node:events');
  server = createStaticServer({
    root: pathToFileURL(path.join(REPO, 'dist/')),
    apiRoot: pathToFileURL(REPO + '/')
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  appUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await browser?.close();
  server?.close();
});

async function openTasksCalendar({
  width = 1280,
  height = 1120,
  reducedMotion = 'no-preference',
  hash = '#/week'
} = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    reducedMotion
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-09-24T18:05:00+10:00'));
  await page.goto(appUrl);
  await page.locator('#sign-in-passphrase').fill('life-hub-local');
  await page.locator('#sign-in-button').click();
  await page.locator('#app[data-state="ready"]').waitFor();
  await page.evaluate(async () => (await fetch('/api/calendar-visual-seed', { method: 'POST' })).ok);
  await page.goto(`${appUrl}/tasks/${hash}`);
  await page.locator('[data-part="hub-calendar-mount"]').waitFor({ timeout: 20000 });
  await page
    .locator('[data-part="tideline"], [data-part="day-dial"], [data-part="term-river"], [data-part="almanac"]')
    .first()
    .waitFor({ timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  return { context, page, errors };
}

test('tasks calendar: kit mount, Tasks filter on, no standing Add', async () => {
  const { context, page, errors } = await openTasksCalendar();
  try {
    assert.equal(errors.length, 0, errors.join('\n'));
    assert.ok(await page.locator('[data-part="tideline"]').count());
    assert.equal(
      await page.locator('[data-part="sources"] button[data-filter="tasks"]').getAttribute('aria-pressed'),
      'true'
    );
    assert.equal(await page.locator('[data-calendar-quick-add]').count(), 0);
    assert.equal(await page.locator('.calendar-compose-card').count(), 0);
    await page.screenshot({ path: path.join(OUT, 'week-1280-default.png') });
  } finally {
    await context.close();
  }
});

test('tasks calendar: Day → Week → Term → Year → Almanac; year hash reload', async () => {
  const { context, page, errors } = await openTasksCalendar();
  try {
    for (const zoom of ['day', 'week', 'term', 'year', 'almanac', 'week']) {
      await page.locator(`[data-part="zoom-pills"] button[data-zoom="${zoom}"]`).click();
      await page.waitForTimeout(350);
    }
    assert.equal(errors.length, 0, errors.join('\n'));
    await page.goto(`${appUrl}/tasks/#/year`);
    await page.locator('[data-part="term-river"]').waitFor({ timeout: 15000 });
    assert.match(page.url(), /#\/year/);
  } finally {
    await context.close();
  }
});

test('tasks calendar: #/month redirects to Week kit', async () => {
  const { context, page, errors } = await openTasksCalendar({ hash: '#/month?date=2026-08-17' });
  try {
    assert.equal(errors.length, 0, errors.join('\n'));
    assert.match(page.url(), /#\/week/);
    assert.ok(await page.locator('[data-part="tideline"]').count());
  } finally {
    await context.close();
  }
});

test('tasks calendar: reduced-motion + 390', async () => {
  const { context, page, errors } = await openTasksCalendar({
    width: 390,
    height: 844,
    reducedMotion: 'reduce'
  });
  try {
    assert.equal(errors.length, 0, errors.join('\n'));
    await page.screenshot({ path: path.join(OUT, 'week-390-default.png') });
  } finally {
    await context.close();
  }
});
