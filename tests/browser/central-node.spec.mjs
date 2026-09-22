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

test('the Central Node tab renders the synthesis board from the fixture repository', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await signIn(page);

    await page.locator('.desktop-rail [data-section="central-node"]').click();
    await page.locator('#central-node-dashboard').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#home-dashboard').isHidden(), true);

    assert.equal(await page.locator('#cn-needs').count(), 1);
    assert.equal(await page.locator('#cn-board').count(), 1);
    assert.equal(await page.locator('#cn-tile-fat').count(), 1);
    assert.equal(await page.locator('#cn-tile-weight').count(), 1);
    assert.equal(await page.locator('#cn-tile-load').count(), 1);
    assert.equal(await page.locator('#cn-tile-collide').count(), 1);
    assert.equal(await page.locator('#cn-tile-mind').count(), 1);
    assert.equal(await page.locator('#cn-tile-train').count(), 1);
    assert.equal(await page.locator('#cn-tile-knowledge').count(), 1);
    assert.equal(await page.locator('#cn-tile-loops').count(), 1);
    assert.equal(await page.locator('#cn-tile-agents').count(), 1);
    assert.equal(await page.locator('#cn-tile-status').count(), 0);
    assert.equal(await page.locator('#central-node-chord').count(), 0);
    assert.equal(await page.locator('#central-node-week-horizon').count(), 0);
    assert.equal(await page.locator('#central-node-audit-button').count(), 1);
    assert.equal(await page.locator('#central-node-chat-button').count(), 1);

    assert.match(await page.locator('[data-cn="fat-read"]').textContent(), /ceiling|Need 1 logged fat days/);
    assert.match(await page.locator('#cn-tile-weight').textContent(), /Need 1 weigh-ins/);
    assert.match(await page.locator('[data-central-node="recent-actions"]').textContent(), /Chadwick|No agent deposits/);

    const constraintsPanel = page.locator('#cn-tile-constraints');
    assert.equal(await constraintsPanel.getAttribute('open'), null);
    assert.match(await page.locator('[data-central-node="constraints"] li').first().textContent(), /Test condition/);

    const aboutPanel = page.locator('#cn-tile-about');
    assert.equal(await aboutPanel.getAttribute('open'), null);
    assert.match(await page.locator('[data-central-node="about-me"]').textContent(), /English teaching/);

    assert.equal(await page.locator('[data-central-node="governance-log"]').count(), 1);
    assert.match(
      await page.locator('[data-central-node="governance-log"]').textContent(),
      /No governance entries yet/
    );
  } finally {
    await context.close();
  }
});

test('the floating chat button opens the shared chat panel themed in Hammond\'s colour', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await signIn(page);
    await page.locator('.desktop-rail [data-section="central-node"]').click();
    await page.locator('#central-node-dashboard').waitFor({ state: 'visible' });

    await page.locator('#central-node-chat-button').click();
    await page.locator('#chat-view[data-panel-mode="overlay"]').waitFor({ state: 'visible' });

    const accent = await page.locator('#chat-view').evaluate(element => (
      getComputedStyle(element).getPropertyValue('--agent-accent').trim()
    ));
    assert.equal(accent, '#2D2D2D');

    await page.locator('#central-node-chat-button').click();
    await page.locator('#chat-view').waitFor({ state: 'hidden' });
  } finally {
    await context.close();
  }
});

test('Central Node board does not overflow at 390 px', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await signIn(page);
    await page.locator('#more-nav-button').click();
    await page.locator('.hub-more-sheet [data-section="central-node"]').click();
    await page.locator('#central-node-dashboard').waitFor({ state: 'visible' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(overflow, false);
    assert.equal(await page.locator('#central-node-audit-button').isVisible(), true);
    assert.equal(await page.locator('#central-node-chat-button').isVisible(), true);
  } finally {
    await context.close();
  }
});
