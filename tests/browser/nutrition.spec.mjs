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
  await page.locator('#passphrase-input').fill(LOCAL_PASSPHRASE);
  await page.locator('#sign-in-button').click();
  await page.locator('#app[data-state="ready"]').waitFor();
}

test('the Nutrition tab renders today\'s macros from the fixture repository', async () => {
  const page = await browser.newPage();
  try {
    await signIn(page);

    await page.locator('.desktop-rail [data-section="nutrition"]').click();
    await page.locator('#nutrition-dashboard').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#home-dashboard').isHidden(), true);

    assert.equal(await page.locator('[data-nutrition="calories"]').textContent(), '1,130');
    assert.equal(await page.locator('[data-nutrition="protein"]').textContent(), '80 g');
    assert.equal(await page.locator('[data-meal-protein="breakfast"]').textContent(), '38 g');
    assert.equal(await page.locator('[data-meal-protein="lunch"]').textContent(), '42 g');

    const heatmapTiles = page.locator('#nutrition-heatmap .heatmap-tile');
    assert.equal(await heatmapTiles.count(), 30);
  } finally {
    await page.close();
  }
});

test('the floating chat button opens the shared chat panel themed in Brisket\'s colour', async () => {
  const page = await browser.newPage();
  try {
    await signIn(page);
    await page.locator('.desktop-rail [data-section="nutrition"]').click();
    await page.locator('#nutrition-dashboard').waitFor({ state: 'visible' });

    await page.locator('#nutrition-chat-button').click();
    await page.locator('#chat-view[data-panel-mode="overlay"]').waitFor({ state: 'visible' });

    const accent = await page.locator('#chat-view').evaluate(element => (
      getComputedStyle(element).getPropertyValue('--agent-accent').trim()
    ));
    assert.equal(accent, '#F0B843');

    await page.locator('#nutrition-chat-button').click();
    await page.locator('#chat-view').waitFor({ state: 'hidden' });
  } finally {
    await page.close();
  }
});
