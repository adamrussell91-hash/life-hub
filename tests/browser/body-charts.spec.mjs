import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { chromium } from 'playwright';
import '../../scripts/prepare-web.mjs';
import { createStaticServer } from '../../scripts/serve.mjs';
import { bodyChartExtraFiles } from '../fixtures/body-chart-events.mjs';

const LOCAL_PASSPHRASE = 'life-hub-local';

let browser;
let server;
let baseUrl;

before(async () => {
  server = createStaticServer({
    root: new URL('../../dist/', import.meta.url),
    apiRoot: new URL('../..', import.meta.url),
    extraFiles: bodyChartExtraFiles()
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
  await page.clock.setFixedTime(new Date('2026-09-22T12:00:00+10:00'));
  await page.goto(baseUrl);
  await page.locator('#sign-in-view').waitFor();
  await page.locator('#sign-in-passphrase').fill(LOCAL_PASSPHRASE);
  await page.locator('#sign-in-button').click();
  await page.locator('#app[data-state="ready"]').waitFor();
}

async function openBody(page) {
  await page.locator('.desktop-rail [data-section="body"]').click();
  await page.locator('#body-dashboard').waitFor({ state: 'visible' });
  await page.locator('#body-chart-weight .hc-chart').waitFor();
}

test('Body Weight, fat and muscle use the new scene charts, not the old line graphs', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try {
    await signIn(page);
    await openBody(page);

    assert.equal(await page.locator('#body-dashboard .line-chart.body-chart').count(), 0);
    await page.locator('#body-chart-weight .bc-shed').first().waitFor();
    assert.ok(await page.locator('#body-chart-weight .bc-block').count() > 0);
    assert.equal(await page.locator('[data-body-chart="weight"] [role="tab"]').count(), 2);

    await page.locator('[data-body-chart="weight"] [data-body-view="stairs"]').click();
    await page.locator('#body-chart-weight .bc-ball').waitFor();
    assert.ok(await page.locator('#body-chart-weight .bc-step').count() > 0);

    await page.locator('#body-chart-fat .bc-carved').waitFor();
    await page.locator('#body-chart-fat .bc-fat-line').waitFor();

    await page.locator('#body-chart-muscle .bc-muscle-line').waitFor();
    await page.locator('#body-chart-muscle .bc-fat-line').waitFor();
    await page.locator('[data-body-chart="muscle"] [data-body-view="squares"]').click();
    await page.locator('#body-chart-muscle .bc-cell--fat').first().waitFor();
    assert.equal(await page.locator('#body-chart-muscle .bc-cell[data-cell]').count(), 100);
    await page.locator('#body-squares-scrub').waitFor();
    await page.locator('#body-squares-scrub').fill('0');
    await page.locator('#body-chart-muscle .hc-readout').waitFor();
  } finally {
    await context.close();
  }
});

test('Body range change redraws stairs and carved away', async () => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  try {
    await signIn(page);
    await openBody(page);
    await page.locator('[data-body-chart="weight"] [data-body-view="stairs"]').click();
    await page.locator('#body-chart-weight .bc-ball').waitFor();
    const sixMonthSteps = await page.locator('#body-chart-weight .bc-step').count();
    await page.locator('#body-range-control [data-body-range="five_year"]').click();
    await page.locator('#body-chart-weight .bc-ball').waitFor();
    const fiveYearSteps = await page.locator('#body-chart-weight .bc-step').count();
    assert.ok(fiveYearSteps > sixMonthSteps, `5Y stairs (${fiveYearSteps}) should have more steps than 6M (${sixMonthSteps})`);
    await page.locator('#body-chart-fat .bc-carved').waitFor();
  } finally {
    await context.close();
  }
});
