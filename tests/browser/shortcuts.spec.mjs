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

test('Life Hub no longer exposes a Shortcuts page', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  try {
    await signIn(page);
    assert.equal(await page.locator('[data-section="shortcuts"]').count(), 0);
    assert.equal(await page.locator('#shortcuts-dashboard').count(), 0);

    await page.goto(`${baseUrl}/#shortcuts`);
    await page.locator('#app[data-state="ready"]').waitFor();
    await page.locator('#page-title', { hasText: 'Home' }).waitFor();
    assert.equal(await page.locator('#home-dashboard:not([hidden])').count(), 1);
  } finally {
    await context.close();
  }
});

test('More sheet no longer lists Shortcuts at 390 px', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await signIn(page);
    await page.locator('#more-nav-button').click();
    await page.locator('.hub-more-sheet[open], #more-sheet[open]').waitFor();
    assert.equal(await page.locator('.hub-more-sheet [data-section="shortcuts"]').count(), 0);
    assert.equal(await page.locator('.hub-more-sheet', { hasText: 'Shortcuts' }).count(), 0);
  } finally {
    await context.close();
  }
});
