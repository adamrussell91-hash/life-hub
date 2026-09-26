/**
 * Shared calendar source filter (Life mode).
 * Gate for Step 2 of the hub calendar migration.
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

let browser;
let server;
let appUrl;

before(async () => {
  browser = await chromium.launch({ headless: true });
  await import(pathToFileURL(path.join(REPO, 'scripts/prepare-web.mjs')).href);
  const { createStaticServer } = await import(pathToFileURL(path.join(REPO, 'scripts/serve.mjs')).href);
  const { once } = await import('node:events');
  server = createStaticServer({ root: pathToFileURL(path.join(REPO, 'dist/')), apiRoot: pathToFileURL(REPO + '/') });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  appUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await browser?.close();
  server?.close();
});

async function openCalendar() {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1120 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.clock.setFixedTime(new Date('2026-09-24T18:05:00+10:00'));
  await page.goto(appUrl);
  await page.locator('#sign-in-passphrase').fill('life-hub-local');
  await page.locator('#sign-in-button').click();
  await page.locator('#app[data-state="ready"]').waitFor();
  const seeded = await page.evaluate(async () => (await fetch('/api/calendar-visual-seed', { method: 'POST' })).ok);
  assert.equal(seeded, true, 'calendar-visual-seed failed');
  await page.evaluate(() => {
    location.hash = '#/calendar';
  });
  await page.locator('[data-part="tideline"]').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(700);
  return { context, page };
}

test('toggling a source chip hides items only; capacity and band heights stay put', async () => {
  const { context, page } = await openCalendar();
  const chip = page.locator('[data-part="sources"] button[data-filter="fitness"]').first();
  await chip.waitFor();
  assert.equal(await chip.getAttribute('aria-pressed'), 'true');

  const before = await page.evaluate(() => {
    const tideline = document.querySelector('[data-part="tideline"]');
    window.__filterCard = tideline.querySelector('[data-part="card"]');
    return {
      caps: [...tideline.querySelectorAll('[data-part="capacity"]')].map((node) => node.dataset.pct),
      bands: window.__tideline?.heights?.() ?? null,
      fitnessTotal: tideline.querySelectorAll('.cal-chip.k-fitness').length,
      fitnessVisible: [...tideline.querySelectorAll('.cal-chip.k-fitness')].filter((n) => !n.hidden).length
    };
  });

  await chip.click();
  assert.equal(await chip.getAttribute('aria-pressed'), 'false');
  assert.equal(await chip.evaluate((node) => node.classList.contains('is-off')), true);

  const after = await page.evaluate(() => {
    const tideline = document.querySelector('[data-part="tideline"]');
    return {
      caps: [...tideline.querySelectorAll('[data-part="capacity"]')].map((node) => node.dataset.pct),
      bands: window.__tideline?.heights?.() ?? null,
      sameCard: tideline.querySelector('[data-part="card"]') === window.__filterCard,
      fitnessVisible: [...tideline.querySelectorAll('.cal-chip.k-fitness')].filter((n) => !n.hidden).length
    };
  });

  assert.deepEqual(after.caps, before.caps, 'capacity % must not change');
  if (before.bands && after.bands) assert.deepEqual(after.bands, before.bands, 'band heights must not change');
  assert.equal(after.sameCard, true, 'card node identity must survive toggle');
  if (before.fitnessTotal > 0) {
    assert.equal(after.fitnessVisible, 0, 'fitness chips hide when Fitness is off');
    const hidden = page.locator('[data-part="filter-hidden"]');
    await hidden.waitFor({ state: 'visible', timeout: 2000 });
    assert.match(await hidden.innerText(), /\d+ hidden · Show all/);
  }
  await context.close();
});

test('Show all restores chips; Day stop shares the same filter state', async () => {
  const { context, page } = await openCalendar();
  await page.locator('[data-part="sources"] button[data-filter="tasks"]').click();
  const hidden = page.locator('[data-part="filter-hidden"]');
  if (await hidden.isVisible()) await hidden.click();
  else await page.locator('[data-part="sources"] button[data-filter="all"]').click();
  assert.equal(await page.locator('[data-part="sources"] button[data-filter="tasks"]').getAttribute('aria-pressed'), 'true');

  await page.evaluate(() => {
    location.hash = '#/calendar/day';
  });
  await page.locator('[data-part="day-dial"]').waitFor();
  await page.waitForTimeout(500);
  await page.locator('[data-part="sources"] button[data-filter="tasks"]').first().waitFor();
  assert.equal(
    await page.locator('[data-part="sources"] button[data-filter="tasks"]').first().getAttribute('aria-pressed'),
    'true'
  );
  await context.close();
});
