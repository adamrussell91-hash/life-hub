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

test('the Central Node tab renders its markdown sections and logging-completion ring from the fixture repository', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await signIn(page);

    await page.locator('.desktop-rail [data-section="central-node"]').click();
    await page.locator('#central-node-dashboard').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#home-dashboard').isHidden(), true);

    assert.match(await page.locator('[data-central-node="todays-status"]').textContent(), /streak 1/);
    assert.match(await page.locator('[data-central-node="cross-agent"]').textContent(), /Chadwick.*Brisket/);
    assert.equal(await page.locator('[data-value="completion-ring-label"]').textContent(), '3 of 5');
    assert.equal(await page.locator('[data-live-complete="nutrition"]').count(), 1);
    assert.match(await page.locator('[data-live-snapshot]').textContent(), /Protein/);
    assert.equal(await page.locator('#central-node-week-chart [data-role="last-point"]').count(), 0);

    const constraintsPanel = page.locator('.constraints-card');
    assert.equal(await constraintsPanel.getAttribute('open'), null);
    assert.match(await page.locator('[data-central-node="constraints"] li').first().textContent(), /Test condition/);

    const loggingHeatmap = page.locator('#central-node-logging-heatmap .heatmap-tile');
    assert.equal(await loggingHeatmap.count(), 30);
    const exerciseHeatmap = page.locator('#central-node-exercise-heatmap .heatmap-tile');
    assert.equal(await exerciseHeatmap.count(), 30);
    assert.equal(await page.locator('#central-node-exercise-heatmap .heatmap-tile[data-hit="true"]').count(), 1);
    const eatingHeatmap = page.locator('#central-node-eating-heatmap .heatmap-tile');
    assert.equal(await eatingHeatmap.count(), 30);

    // Absent governance-log.md in the shared fixture → empty-state card, not an error.
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
