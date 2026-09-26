// Term River routing: Term/Year pills sync the hash, Back/Forward tween without remount,
// reload keeps the zoom, and ‹ › / Today step the term (or year) window.
//
// Requires RIVER_APP=1 (Life app at #/calendar/term after POST /api/calendar-visual-seed).
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = process.env.RIVER_REPO_ROOT ?? path.resolve(HERE, '../..');
const APP = process.env.RIVER_APP === '1';

let browser;
let server;
let appUrl;

before(async () => {
  if (!APP) return;
  browser = await chromium.launch({ headless: true });
  await import(pathToFileURL(path.join(REPO, 'scripts/prepare-web.mjs')).href);
  const { createStaticServer } = await import(pathToFileURL(path.join(REPO, 'scripts/serve.mjs')).href);
  const { once } = await import('node:events');
  server = createStaticServer({ root: pathToFileURL(path.join(REPO, 'dist/')), apiRoot: pathToFileURL(REPO + '/') });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  appUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await browser?.close(); server?.close(); });

async function openRiver({ hash = '#/calendar/term', settle = 1400 } = {}) {
  assert.equal(APP, true, 'RIVER_APP=1 is required');
  const context = await browser.newContext({ viewport: { width: 1280, height: 1100 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date('2026-09-24T18:05:00+10:00'));
  await page.goto(appUrl);
  await page.locator('#sign-in-passphrase').fill('life-hub-local');
  await page.locator('#sign-in-button').click();
  await page.locator('#app[data-state="ready"]').waitFor();
  assert.equal(await page.evaluate(async () => (await fetch('/api/calendar-visual-seed', { method: 'POST' })).ok), true);
  await page.evaluate(h => { location.hash = h; }, hash);
  await page.locator('[data-part="term-river"]').waitFor();
  await page.evaluate(() => document.fonts.ready);
  if (settle) await page.waitForTimeout(settle);
  return { context, page };
}

test('river routing: Year pill updates the hash and keeps controller zoom', { skip: !APP }, async () => {
  const { context, page } = await openRiver();
  try {
    assert.equal(await page.evaluate(() => location.hash), '#/calendar/term');
    await page.locator('[data-part="zoom-pills"] [data-zoom="year"]').click();
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => location.hash), '#/calendar/year');
    assert.equal(await page.locator('[data-part="zoom-pills"] [data-zoom="year"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => window.__termRiver.state.zoom), 'year');
  } finally { await context.close(); }
});

test('river routing: reload on #/calendar/year opens on Year', { skip: !APP }, async () => {
  const { context, page } = await openRiver({ hash: '#/calendar/year' });
  try {
    assert.equal(await page.evaluate(() => location.hash), '#/calendar/year');
    assert.equal(await page.locator('[data-part="zoom-pills"] [data-zoom="year"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => window.__termRiver.state.zoom), 'year');
    assert.ok(Math.abs(await page.evaluate(() => window.__termRiver.blend()) - 1) < 0.001);
  } finally { await context.close(); }
});

test('river routing: Back/Forward tween without remounting the chart svg', { skip: !APP }, async () => {
  const { context, page } = await openRiver();
  try {
    const idBefore = await page.evaluate(() => {
      const svg = document.querySelector('[data-part="term-river"] [data-part="chart"]');
      svg.__riverId = 1;
      return svg.__riverId;
    });

    await page.locator('[data-part="zoom-pills"] [data-zoom="year"]').click();
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => location.hash), '#/calendar/year');
    assert.equal(await page.evaluate(() => document.querySelector('[data-part="term-river"] [data-part="chart"]')?.__riverId), idBefore, 'Year pill must not remount');

    await page.goBack();
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => location.hash), '#/calendar/term');
    assert.equal(await page.evaluate(() => window.__termRiver.state.zoom), 'term');
    assert.equal(await page.evaluate(() => document.querySelector('[data-part="term-river"] [data-part="chart"]')?.__riverId), idBefore, 'Back must not remount');

    await page.goForward();
    await page.waitForTimeout(600);
    assert.equal(await page.evaluate(() => location.hash), '#/calendar/year');
    assert.equal(await page.evaluate(() => window.__termRiver.state.zoom), 'year');
    assert.equal(await page.evaluate(() => document.querySelector('[data-part="term-river"] [data-part="chart"]')?.__riverId), idBefore, 'Forward must not remount');
  } finally { await context.close(); }
});

test('river routing: ‹ › step adjacent terms; Today restores the seeded window', { skip: !APP }, async () => {
  const { context, page } = await openRiver();
  try {
    const period0 = await page.locator('[data-part="period"] b').textContent();
    assert.match(period0, /Term 3/);

    // Seeded Term window spans T3→T4; termNear(from) is T3, Later → Term 4.
    await page.locator('[data-part="nav"] [data-step="1"]').click();
    await page.waitForTimeout(200);
    const afterLater = await page.locator('[data-part="period"] b').textContent();
    assert.match(afterLater, /Term 4/);
    assert.notEqual(afterLater, period0);

    await page.locator('[data-part="nav"] [data-step="-1"]').click();
    await page.waitForTimeout(200);
    assert.match(await page.locator('[data-part="period"] b').textContent(), /Term 3/);

    // Step away, then Today restores seeded RIVER.ZOOMS (T3 → T4 span).
    await page.locator('[data-part="nav"] [data-step="1"]').click();
    await page.waitForTimeout(200);
    await page.locator('[data-part="nav"] [data-today]').click();
    await page.waitForTimeout(200);
    assert.equal(await page.locator('[data-part="period"] b').textContent(), period0);

    // Year: ‹ › shift the year window by calendar year.
    await page.locator('[data-part="zoom-pills"] [data-zoom="year"]').click();
    await page.waitForTimeout(600);
    const year0 = await page.locator('[data-part="period"] b').textContent();
    await page.locator('[data-part="nav"] [data-step="1"]').click();
    await page.waitForTimeout(200);
    const yearLater = await page.locator('[data-part="period"] b').textContent();
    assert.notEqual(yearLater, year0);
    await page.locator('[data-part="nav"] [data-today]').click();
    await page.waitForTimeout(200);
    assert.equal(await page.locator('[data-part="period"] b').textContent(), year0);
  } finally { await context.close(); }
});
