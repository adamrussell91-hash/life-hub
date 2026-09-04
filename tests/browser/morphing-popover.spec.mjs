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

test('Clare dump morphs open from Write a dump and focuses the textarea', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await signIn(page);
    const trigger = page.locator('.hub-pulse-clare [data-morphing-trigger]');
    await trigger.waitFor();
    assert.equal(await page.locator('#clare-dump-text').isVisible(), false);

    await trigger.click();
    const panel = page.locator('.morphing-popover__panel.is-floating');
    await panel.waitFor();
    await page.locator('#clare-dump-text').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.activeElement?.id === 'clare-dump-text');
    assert.match(await panel.locator('.morphing-popover__title').textContent(), /Dump for Clare/);

    await page.keyboard.press('Escape');
    await page.locator('#clare-dump-text').waitFor({ state: 'hidden' });
  } finally {
    await context.close();
  }
});

test('Body Log weight morphs into a value editor', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await signIn(page);
    await page.locator('.desktop-rail [data-section="body"]').click();
    await page.locator('#body-dashboard').waitFor({ state: 'visible' });

    const trigger = page.locator('.body-quick-log .morphing-popover__trigger').first();
    await trigger.waitFor();
    await trigger.click();

    const panel = page.locator('.morphing-popover__panel.is-floating');
    await panel.waitFor();
    await page.locator('#body-weight-kg').waitFor({ state: 'visible' });
    assert.match(await panel.locator('.morphing-popover__title').textContent(), /Weight/);
    await page.locator('#body-weight-kg').fill('82.4');
    await page.keyboard.press('Escape');
    await page.locator('#body-weight-kg').waitFor({ state: 'hidden' });
  } finally {
    await context.close();
  }
});
