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

test('Shortcuts lists promoted drafts and opens a Confirm card before writing', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await signIn(page);
    await page.locator('.desktop-rail [data-section="shortcuts"]').click();
    await page.locator('#shortcuts-dashboard:not([hidden])').waitFor();
    await page.locator('#page-title', { hasText: 'Shortcuts' }).waitFor();
    assert.equal(await page.locator('.page-header__title-row .hub-mark').count(), 0);

    await page.locator('[data-shortcuts="promoted"] .shortcuts-item', { hasText: 'track.morning-weigh-in' }).waitFor();
    assert.match(await page.locator('[data-shortcuts="catalog"]').textContent(), /remember\.set-week-flag/);
    assert.equal(await page.locator('[data-shortcuts="confirm"] .confirm-card').count(), 0);

    await page.locator('[data-shortcuts="promoted"] button', { hasText: 'Run' }).click();
    await page.locator('[data-shortcuts="confirm"] .confirm-card').waitFor();
    assert.match(await page.locator('[data-shortcuts="confirm"]').textContent(), /data\/challenges\/2026-08-31-weigh-in\.json/);

    await page.locator('[data-shortcuts="confirm"] button', { hasText: 'Confirm' }).click();
    await page.locator('[data-shortcuts="confirm"] .confirm-card').waitFor({ state: 'detached' });
    await page.locator('[data-shortcuts="promoted"] .shortcuts-item', { hasText: 'track.morning-weigh-in' }).waitFor();
  } finally {
    await context.close();
  }
});

test('Shortcuts is reachable from the More sheet at 390 px', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await signIn(page);
    await page.locator('#more-nav-button').click();
    await page.locator('.hub-more-sheet [data-section="shortcuts"]').click();
    await page.locator('#shortcuts-dashboard:not([hidden])').waitFor();
    assert.equal(await page.locator('#page-title').textContent(), 'Shortcuts');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(overflow, false);
  } finally {
    await context.close();
  }
});
