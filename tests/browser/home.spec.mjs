import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { chromium } from 'playwright';
import '../../scripts/prepare-web.mjs';
import { createStaticServer } from '../../scripts/serve.mjs';

let browser;
let server;
let baseUrl;

before(async () => {
  server = createStaticServer({ root: new URL('../..', import.meta.url) });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});

after(async () => {
  await browser?.close();
  server?.close();
});

async function readHome(page) {
  await page.goto(baseUrl);
  await page.locator('#app[data-state="ready"]').waitFor();
  return page.evaluate(() => ({
    calories: document.querySelector('[data-value="calories"]')?.textContent,
    protein: document.querySelector('[data-value="protein"]')?.textContent,
    fat: document.querySelector('[data-value="fat"]')?.textContent,
    streak: document.querySelector('[data-value="streak"]')?.textContent,
    logging: document.querySelector('[data-value="logging"]')?.textContent,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    railDisplay: getComputedStyle(document.querySelector('.desktop-rail')).display,
    mobileDisplay: getComputedStyle(document.querySelector('.mobile-nav')).display
  }));
}

test('renders the approved Home values at desktop width', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const home = await readHome(page);

  assert.deepEqual(home, {
    calories: '1,130',
    protein: '80 g',
    fat: '27 g',
    streak: '1',
    logging: '3 of 5',
    overflow: false,
    railDisplay: 'flex',
    mobileDisplay: 'none'
  });
  await context.close();
});

test('uses mobile navigation without overflow at 390 px', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const home = await readHome(page);

  assert.equal(home.overflow, false);
  assert.equal(home.railDisplay, 'none');
  assert.equal(home.mobileDisplay, 'grid');

  const targetHeights = await page.locator('.mobile-nav button').evaluateAll(
    buttons => buttons.map(button => button.getBoundingClientRect().height)
  );
  assert.ok(targetHeights.every(height => height >= 44));

  await page.locator('.mobile-nav [data-section="chat"]').click();
  assert.equal(
    await page.locator('#app-status').textContent(),
    'This section arrives in a later Life Hub phase.'
  );
  await context.close();
});

test('reloads the saved read-only view after network loss', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await readHome(page);
  await page.evaluate(() => navigator.serviceWorker.ready);

  await context.setOffline(true);
  await page.reload();
  await page.locator('#app[data-state="ready"]').waitFor();

  assert.equal(await page.locator('[data-value="calories"]').textContent(), '1,130');
  assert.equal(await page.locator('#network-status').isVisible(), true);
  await context.close();
});
