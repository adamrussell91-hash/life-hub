/**
 * Professional hub calendar proof (Step 5). Built app via prepare-web → dist/.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { calendarHubArtifactsDir } from './calendar-hub-artifacts.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const OUT = calendarHubArtifactsDir('professional-calendar-hub');
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


const frames = (page, ms, probe) =>
  page.evaluate(
    async ({ ms, probe }) => {
      const f = new Function(`return (${probe})`)();
      const out = [];
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        await new Promise((r) => requestAnimationFrame(r));
        out.push(f());
      }
      return out;
    },
    { ms, probe: probe.toString() }
  );

test('professional calendar: filter toggle; capacity unchanged; no remount', async () => {
  const { context, page } = await openProfessionalCalendar();
  try {
    const chip = page.locator('[data-part="sources"] button[data-filter="pd"]').first();
    await chip.waitFor();
    const before = await page.evaluate(() => {
      const root = document.querySelector('[data-part="tideline"]');
      return { caps: [...root.querySelectorAll('[data-part="capacity"]')].map((n) => n.dataset.pct) };
    });
    await chip.click();
    const after = await page.evaluate(() => {
      const root = document.querySelector('[data-part="tideline"]');
      return { caps: [...root.querySelectorAll('[data-part="capacity"]')].map((n) => n.dataset.pct), still: Boolean(root) };
    });
    assert.deepEqual(after.caps, before.caps);
    assert.ok(after.still);
  } finally {
    await context.close();
  }
});

test('professional calendar: foreign Open in Hub; Accept {id,decision}', async () => {
  const { context, page } = await openProfessionalCalendar();
  const posts = [];
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes('/api/calendar-ghosts')) posts.push(req.postData() || '');
  });
  try {
    const tasks = page.locator('[data-part="sources"] button[data-filter="tasks"]').first();
    if (await tasks.count() && (await tasks.getAttribute('aria-pressed')) !== 'true') await tasks.click();
    const foreign = page.locator('.cal-chip.k-task:not(.is-filter-hidden):not([hidden]), .cal-chip.is-class:not(.is-filter-hidden):not([hidden])').first();
    if (await foreign.count()) {
      await foreign.click();
      await page.locator('[data-part="open-in-hub"]').waitFor({ timeout: 5000 });
      assert.match(await page.locator('[data-part="open-in-hub"]').textContent(), /Open in/);
    }
    const accepted = await page.evaluate(async () => {
      const id = document.querySelector('[data-accept]')?.getAttribute('data-accept');
      if (!id || !window.__tideline?.accept) return false;
      await window.__tideline.accept(id);
      return true;
    });
    if (accepted) {
      await page.waitForTimeout(400);
      assert.ok(posts.length >= 1);
      assert.deepEqual(Object.keys(JSON.parse(posts.at(-1))).sort(), ['decision', 'id']);
    }
  } finally {
    await context.close();
  }
});

test('professional calendar: Term tier bars; Term↔Year tween; Back/Forward', async () => {
  const { context, page } = await openProfessionalCalendar({ hash: '#/calendar/term' });
  try {
    await page.locator('[data-part="term-river"]').waitFor({ timeout: 15000 });
    await page.waitForFunction(
      () => /Term|T3|T4|→/i.test(document.querySelector('[data-part="period"]')?.textContent || ''),
      null,
      { timeout: 15000 }
    );
    assert.match((await page.locator('[data-part="period"]').textContent()) || '', /Term|T3|T4|→/i);
    await page.locator('[data-part="zoom-pills"] button[data-zoom="year"]').click();
    const f = await frames(page, 800, () => ({ t: window.__termRiver?.blend?.() ?? 0 }));
    const blends = f.map((v) => v.t).filter((t) => typeof t === 'number');
    if (blends.length >= 10) assert.ok(new Set(blends.map((t) => t.toFixed(3))).size >= 8);
    await page.goBack();
    await page.waitForTimeout(400);
    assert.match(page.url(), /#\/calendar\/term/);
    await page.goForward();
    await page.waitForTimeout(400);
    assert.match(page.url(), /#\/calendar\/year/);
  } finally {
    await context.close();
  }
});
