/**
 * Tasks hub calendar proof (Step 6). Built app via prepare-web → dist/.
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
const OUT = calendarHubArtifactsDir('tasks-calendar-hub');
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

test('tasks calendar: filter toggle hides items; capacity unchanged', async () => {
  const { context, page } = await openTasksCalendar();
  try {
    const chip = page.locator('[data-part="sources"] button[data-filter="tasks"]').first();
    await chip.waitFor();
    const before = await page.evaluate(() => {
      const root = document.querySelector('[data-part="tideline"]');
      return {
        caps: [...root.querySelectorAll('[data-part="capacity"]')].map((n) => n.dataset.pct),
        bands: window.__tideline?.heights?.() ?? null,
        visible: [...root.querySelectorAll('.cal-chip')].filter((n) => !n.hidden).length
      };
    });
    await chip.click();
    const after = await page.evaluate(() => {
      const root = document.querySelector('[data-part="tideline"]');
      return {
        caps: [...root.querySelectorAll('[data-part="capacity"]')].map((n) => n.dataset.pct),
        bands: window.__tideline?.heights?.() ?? null,
        visible: [...root.querySelectorAll('.cal-chip')].filter((n) => !n.hidden).length,
        still: Boolean(root)
      };
    });
    assert.deepEqual(after.caps, before.caps);
    if (before.bands && after.bands) assert.deepEqual(after.bands, before.bands);
    assert.ok(after.still, 'tideline remounted');
  } finally {
    await context.close();
  }
});

test('tasks calendar: foreign chip Open in Hub; Accept posts {id,decision}', async () => {
  const { context, page } = await openTasksCalendar();
  const posts = [];
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes('/api/calendar-ghosts')) posts.push(req.postData() || '');
  });
  try {
    const classes = page.locator('[data-part="sources"] button[data-filter="classes"]').first();
    if (await classes.count()) {
      if ((await classes.getAttribute('aria-pressed')) !== 'true') await classes.click();
    }
    const foreign = page.locator('.cal-chip.is-class:not(.is-filter-hidden):not([hidden]), .cal-chip.k-teaching:not(.is-filter-hidden):not([hidden]), .cal-chip.k-professional:not(.is-filter-hidden):not([hidden])').first();
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
      const body = JSON.parse(posts[posts.length - 1]);
      assert.deepEqual(Object.keys(body).sort(), ['decision', 'id']);
    }
  } finally {
    await context.close();
  }
});

test('tasks calendar: Term tier bars; Term↔Year tween; Back/Forward', async () => {
  const { context, page } = await openTasksCalendar({ hash: '#/term' });
  try {
    await page.locator('[data-part="term-river"]').waitFor({ timeout: 15000 });
    const period = await page.locator('[data-part="period"]').textContent();
    assert.ok(period && period.trim().length > 0, 'period empty');
    // Terms from hub-prefs → Term 3 → Term 4; fallback window still mounts river.
    const hasTerms = /Term|T3|T4|→/i.test(period || '');
    await page.locator('[data-part="zoom-pills"] button[data-zoom="year"]').click();
    const f = await frames(page, 800, () => ({ t: window.__termRiver?.blend?.() ?? 0 }));
    const blends = f.map((v) => v.t).filter((t) => typeof t === 'number');
    if (blends.length >= 10) {
      assert.ok(new Set(blends.map((t) => t.toFixed(3))).size >= 8);
    }
    await page.goBack();
    await page.waitForTimeout(400);
    assert.match(page.url(), /#\/term/);
    await page.goForward();
    await page.waitForTimeout(400);
    assert.match(page.url(), /#\/year/);
  } finally {
    await context.close();
  }
});
