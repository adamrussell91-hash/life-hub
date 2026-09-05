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

test('the Nutrition tab renders today\'s macros from the fixture repository', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await signIn(page);

    await page.locator('.desktop-rail [data-section="nutrition"]').click();
    await page.locator('#nutrition-dashboard').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#home-dashboard').isHidden(), true);
    assert.equal(await page.locator('#page-eyebrow').textContent(), "Today's macros");
    assert.equal(await page.locator('#page-title').textContent(), 'Nutrition');
    assert.equal(await page.locator('.page-header__title-row .hub-mark').count(), 1);

    assert.equal(await page.locator('[data-split="energy"]').textContent(), '1,130 / 1,900 kcal');
    assert.equal(await page.locator('[data-split="protein"]').textContent(), '80 g / 120 g');
    assert.equal(await page.locator('[data-split="fat"]').textContent(), '27 g / 50 g');
    assert.equal(await page.locator('#nutrition-meal-protein-pie').count(), 1);
    assert.equal(await page.getByText('Protein by meal', { exact: true }).count(), 1);
    assert.equal(await page.locator('.meal-breakdown-card').count(), 0);
    assert.equal(await page.locator('[data-meal-breakdown-empty]').count(), 0);
    assert.equal(await page.locator('[data-nutrition-ring="protein"]').count(), 0);
    assert.equal(await page.locator('[data-nutrition-ring="calories"]').count(), 0);
    assert.equal(await page.locator('[data-nutrition-ring="fat"]').count(), 0);
    assert.equal(await page.locator('[data-nutrition-ring="sodium"]').count(), 1);
    assert.equal(await page.locator('[data-nutrition-ring="calcium"]').count(), 1);
    assert.equal(await page.locator('#nutrition-protein-chart [data-role="last-point"]').count(), 0);
    assert.equal(await page.locator('#nutrition-calories-chart').count(), 1);
    assert.equal(await page.locator('#nutrition-meal-timing').count(), 0);
    assert.equal(await page.locator('[data-nutrition="polyphenol-pill"]').count(), 1);
    assert.equal(
      await page.locator('#nutrition-protein-chart').getAttribute('preserveAspectRatio'),
      'xMidYMid meet'
    );
    assert.equal(await page.locator('[data-nutrition="rolling-caption"]').count(), 0);
    assert.equal(await page.locator('#nutrition-protein-chart [data-role="guide-labels"] .chart-guide-label').count(), 2);
    assert.equal(await page.locator('#nutrition-fat-chart [data-role="guide-labels"] .chart-guide-label').count(), 1);
    assert.deepEqual(await page.locator('#nutrition-protein-chart .chart-guide-label').allTextContents(), ['goal', 'avg']);
    assert.deepEqual(await page.locator('#nutrition-fat-chart .chart-guide-label').allTextContents(), ['ceiling']);
    const avgLabelY = Number(await page.locator('#nutrition-protein-chart .chart-guide-label--avg').getAttribute('y'));
    const finalValueLabelY = Number(await page.locator('#nutrition-protein-chart [data-role="value-labels"] text').last().getAttribute('y'));
    assert.ok(avgLabelY < finalValueLabelY, 'average label sits above the final value label');
    assert.equal(await page.locator('#nutrition-week-compare').count(), 0);
    assert.equal(await page.locator('#nutrition-macro-split').count(), 1);

    const heatmapTiles = page.locator('#nutrition-heatmap .heatmap-tile');
    assert.equal(await heatmapTiles.count(), 30);

    await page.locator('#nutrition-challenges').waitFor({ state: 'visible' });
    assert.match(await page.locator('.nutrition-challenge__heading strong').textContent(), /No refined sugar/);
    assert.equal(await page.locator('.nutrition-challenge__day').count(), 7);
  } finally {
    await context.close();
  }
});

test('the floating chat button opens the shared chat panel themed in Brisket\'s colour', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await signIn(page);
    await page.locator('.desktop-rail [data-section="nutrition"]').click();
    await page.locator('#nutrition-dashboard').waitFor({ state: 'visible' });

    await page.locator('#nutrition-chat-button').click();
    await page.locator('#chat-view[data-panel-mode="overlay"]').waitFor({ state: 'visible' });

    const accent = await page.locator('#chat-view').evaluate(element => (
      getComputedStyle(element).getPropertyValue('--agent-accent').trim()
    ));
    assert.equal(accent, '#EEB046');

    await page.locator('#nutrition-chat-button').click();
    await page.locator('#chat-view').waitFor({ state: 'hidden' });
  } finally {
    await context.close();
  }
});
