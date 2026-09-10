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

test('Mind board does not overflow at 390 px', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await signIn(page);
    await page.locator('#more-nav-button').click();
    await page.locator('.hub-more-sheet [data-section="mind"]').click();
    await page.locator('#mind-dashboard').waitFor({ state: 'visible' });

    const metrics = await page.evaluate(() => {
      const pills = document.querySelector('#mind-range-control');
      const board = document.querySelector('#mind-board');
      const main = document.querySelector('main');
      return {
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        pillsWidth: pills ? Math.round(pills.getBoundingClientRect().width) : 0,
        mainWidth: main ? Math.round(main.getBoundingClientRect().width) : 0,
        boardWidth: board ? Math.round(board.getBoundingClientRect().width) : 0,
        labels: pills
          ? [...pills.querySelectorAll('button')].map(button => button.textContent.trim())
          : []
      };
    });

    assert.equal(metrics.overflow, false, `horizontal overflow: ${metrics.scrollWidth} > ${metrics.clientWidth}`);
    assert.deepEqual(metrics.labels, ['Week', 'Month', '6M', 'Year']);
    assert.ok(metrics.pillsWidth <= metrics.mainWidth + 1, `pills ${metrics.pillsWidth} wider than main ${metrics.mainWidth}`);
    assert.ok(metrics.boardWidth <= metrics.mainWidth + 1, `board ${metrics.boardWidth} wider than main ${metrics.mainWidth}`);
  } finally {
    await context.close();
  }
});

test('Mind desktop main matches the shared Home canvas width', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  try {
    await signIn(page);
    const homeWidth = await page.evaluate(() => Math.round(document.querySelector('main').getBoundingClientRect().width));
    await page.locator('.desktop-rail [data-section="mind"]').click();
    await page.locator('#mind-dashboard').waitFor({ state: 'visible' });
    const mindWidth = await page.evaluate(() => Math.round(document.querySelector('main').getBoundingClientRect().width));
    assert.equal(mindWidth, homeWidth);
  } finally {
    await context.close();
  }
});
