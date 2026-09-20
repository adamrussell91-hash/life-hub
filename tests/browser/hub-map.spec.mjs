import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { chromium } from 'playwright';
import '../../scripts/prepare-web.mjs';
import { createStaticServer } from '../../scripts/serve.mjs';

const LOCAL_PASSPHRASE = 'life-hub-local';

let browser;
let server;
let baseUrl;

before(async () => {
  server = createStaticServer({
    root: new URL('../../dist/', import.meta.url),
    apiRoot: new URL('../..', import.meta.url)
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  server?.close();
});

async function signIn(page) {
  await page.clock.setFixedTime(new Date('2026-07-30T12:00:00+10:00'));
  await page.goto(baseUrl);
  await page.locator('#sign-in-view').waitFor();
  await page.locator('#sign-in-passphrase').fill(LOCAL_PASSPHRASE);
  await page.locator('#sign-in-button').click();
  await page.locator('#app[data-state="ready"]').waitFor();
}

async function openHubMap(page) {
  await page.locator('.desktop-rail [data-section="central-node"]').click();
  await page.locator('#central-node-dashboard:not([hidden])').waitFor();
  await page.locator('#central-node-map-button').click();
  await page.locator('#hub-map-dashboard:not([hidden])').waitFor();
  await page.locator('#page-title', { hasText: 'Hub map' }).waitFor();
  await page.locator('[data-node-id="hub-life"]').waitFor();
  await page.locator('[data-node-id="hub-life"] .hub-map-card__toggle').click();
  await page.locator('[data-node-id="life-home"]').waitFor();
}

test('Hub map opens from Central Node, saves an edit, and remembers it after a reload', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  try {
    await signIn(page);
    await openHubMap(page);

    assert.equal(await page.locator('.desktop-rail [data-section="hub-map"]').count(), 0, 'not a rail item');
    assert.equal(await page.locator('[data-node-id="life-body-bloods"]').count(), 0, 'sections start hidden');
    await page.locator('[data-node-id="life-body"] .hub-map-card__toggle').focus();
    await page.locator('[data-node-id="life-body"] .hub-map-card__toggle').click();
    await page.locator('[data-node-id="life-body-bloods"]').waitFor();

    // Tabbing to a card that has panned out of view brings it back into view.
    await page.locator('[data-node-id="life-home"] .hub-map-card__main').focus();
    await page.locator('[data-node-id="life-home"] .hub-map-card__main').click();
    await page.locator('#hub-map-panel:not([hidden])').waitFor();
    await page.locator('#hub-map-panel select').first().selectOption('built');
    await page.locator('#hub-map-panel [data-focus="add-plan"]').fill('Add a weekly summary');
    await page.locator('#hub-map-panel [data-focus="add-plan"]').press('Enter');
    await page.locator('#hub-map-save-state', { hasText: /^Saved$/ }).waitFor();

    await page.reload();
    await page.locator('#app[data-state="ready"]').waitFor();
    await openHubMap(page);
    const home = page.locator('[data-node-id="life-home"]');
    assert.match(await home.textContent(), /Built/);
    assert.match(await home.textContent(), /0\/1 plans/);
    assert.match(await page.locator('#hub-map-save-state').textContent(), /^Saved$/);
  } finally {
    await context.close();
  }
});

test('the status filter and Fit view work', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  try {
    await signIn(page);
    await openHubMap(page);
    await page.locator('[data-hub-map-filter="partial"]').click();
    const dimmed = await page.locator('[data-node-id="life-chat"]').evaluate(card => card.classList.contains('is-dim'));
    assert.equal(dimmed, true);
    await page.locator('[data-hub-map="zoom-in"]').click();
    const zoomed = await page.locator('#hub-map-zoom-label').textContent();
    await page.locator('[data-hub-map="fit"]').click();
    assert.notEqual(await page.locator('#hub-map-zoom-label').textContent(), zoomed);
  } finally {
    await context.close();
  }
});

test('Hub map fits a 390 px phone without sideways page scroll', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await signIn(page);
    await page.locator('#more-nav-button').click();
    await page.locator('.hub-more-sheet [data-section="central-node"]').click();
    await page.locator('#central-node-map-button').click();
    await page.locator('#hub-map-dashboard:not([hidden])').waitFor();
    await page.locator('[data-node-id="hub-life"] .hub-map-card__toggle').click();
    await page.locator('[data-node-id="life-home"]').waitFor();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(overflow, false);
  } finally {
    await context.close();
  }
});
