/**
 * Professional hub calendar proof (Step 5). Built app via prepare-web → dist/.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const OUT = path.join('/opt/cursor/artifacts', 'professional-calendar-hub');
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

async function openProfessionalCalendar({
  width = 1280,
  height = 1120,
  reducedMotion = 'no-preference',
  hash = '#/calendar'
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
  await page.goto(`${appUrl}/professional/${hash}`);
  await page.locator('[data-part="hub-calendar-mount"]').waitFor({ timeout: 20000 });
  await page.locator('[data-part="tideline"], [data-part="day-dial"], [data-part="term-river"], [data-part="almanac"]').first().waitFor({ timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  return { context, page, errors };
}

test('professional calendar: kit mount, PD+Meetings on, no standing Add', async () => {
  const { context, page, errors } = await openProfessionalCalendar();
  try {
    assert.equal(errors.length, 0, errors.join('\n'));
    assert.ok(await page.locator('[data-part="tideline"]').count());
    assert.equal(
      await page.locator('[data-part="sources"] button[data-filter="pd"]').getAttribute('aria-pressed'),
      'true'
    );
    assert.equal(
      await page.locator('[data-part="sources"] button[data-filter="meetings"]').getAttribute('aria-pressed'),
      'true'
    );
    assert.equal(await page.locator('[data-calendar-quick-add]').count(), 0);
    await page.screenshot({ path: path.join(OUT, 'week-1280-default.png') });
  } finally {
    await context.close();
  }
});

test('professional calendar: Day → Week → Term → Year → Almanac; year hash reload', async () => {
  const { context, page, errors } = await openProfessionalCalendar();
  try {
    for (const zoom of ['day', 'week', 'term', 'year', 'almanac', 'week']) {
      await page.locator(`[data-part="zoom-pills"] button[data-zoom="${zoom}"]`).click();
      await page.waitForTimeout(350);
    }
    assert.equal(errors.length, 0, errors.join('\n'));
    await page.goto(`${appUrl}/professional/#/calendar/year`);
    await page.locator('[data-part="term-river"]').waitFor({ timeout: 15000 });
    assert.match(page.url(), /#\/calendar\/year/);
  } finally {
    await context.close();
  }
});

test('professional home embeds kit calendar without pro-home skin', async () => {
  const { context, page, errors } = await openProfessionalCalendar({ hash: '#/home' });
  try {
    assert.equal(errors.length, 0, errors.join('\n'));
    await page.locator('[data-part="hub-calendar-mount"]').waitFor({ timeout: 20000 });
    assert.equal(await page.locator('.pro-home__day').count(), 0);
    assert.equal(await page.locator('.pro-home__chip').count(), 0);
    assert.ok(await page.locator('a.btn--primary', { hasText: 'Log PD event' }).count());
  } finally {
    await context.close();
  }
});

test('professional calendar: reduced-motion + 390', async () => {
  const { context, page, errors } = await openProfessionalCalendar({
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
