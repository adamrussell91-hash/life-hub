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

test('medical sheet View on Map morphs into an embedded map', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await signIn(page);
    await page.locator('.desktop-rail [data-section="body"]').click();
    await page.locator('#body-dashboard').waitFor({ state: 'visible' });
    await page.getByRole('button', { name: /View medical/ }).click();
    await page.locator('#body-medical-dashboard').waitFor({ state: 'visible' });
    const card = page.locator('#medical-timeline [data-visit-id]').filter({
      hasText: 'Kate Semple'
    });
    await card.waitFor();
    await card.click();
    const trigger = page.locator('#medical-sheet .view-on-map__trigger');
    await trigger.waitFor();
    assert.match(await page.locator('#medical-sheet .view-on-map__place').getAttribute('href'), /google\.com\/maps/);
    await trigger.click();
    const frame = page.locator('.hub-morph-dialog .view-on-map__frame');
    await frame.waitFor();
    const iframe = frame.locator('iframe');
    await iframe.waitFor();
    assert.match(await iframe.getAttribute('src'), /maps\.google\.com\/maps/);
    assert.match(await iframe.getAttribute('src'), /Ridge/);
    await page.locator('.hub-morph-dialog__close').click();
    await frame.waitFor({ state: 'hidden' });
  } finally {
    await context.close();
  }
});
