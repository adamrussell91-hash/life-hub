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

test('the Fitness tab renders the fixture workout and labeled analytics', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await signIn(page);

    await page.locator('.desktop-rail [data-section="fitness"]').click();
    await page.locator('#fitness-dashboard').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#home-dashboard').isHidden(), true);

    assert.equal(await page.locator('#fitness-hero-label').textContent(), 'Last session');
    assert.equal(await page.locator('[data-fitness="hero-title"]').textContent(), 'Chest and Curls');
    assert.equal(await page.locator('[data-fitness="hero-duration"]').textContent(), '26 min');
    assert.equal(await page.locator('[data-fitness="hero-status"]').textContent(), 'completed');
    const topTiles = await page.evaluate(() => {
      const hero = document.querySelector('.fitness-hero-card').getBoundingClientRect();
      const region = document.querySelector('.fitness-region-block').getBoundingClientRect();
      const week = document.querySelector('.fitness-board').getBoundingClientRect();
      return {
        heroTop: hero.top,
        regionTop: region.top,
        weekTop: week.top,
        heroRight: hero.right,
        regionLeft: region.left
      };
    });
    assert.ok(topTiles.heroTop < topTiles.weekTop, 'last session should sit above this week');
    assert.ok(topTiles.regionTop < topTiles.weekTop, 'region strength should sit above this week');
    assert.ok(topTiles.heroRight <= topTiles.regionLeft + 1, 'last session and region strength should sit side by side');
    assert.ok(Math.abs(topTiles.heroTop - topTiles.regionTop) < 8, 'last session and region strength should share the top row');
    assert.match(await page.locator('[data-fitness="streak"]').textContent(), /\d+/);
    assert.ok(await page.locator('#fitness-region-grid .fitness-region-card').count() >= 1);
    assert.ok(await page.locator('[data-fitness="week-strip"] span').count() >= 1);
    assert.match(await page.locator('#fitness-week-columns').textContent(), /This week/);
    assert.match(await page.locator('#fitness-week-columns').textContent(), /kg/);
    assert.equal(await page.locator('#fitness-dashboard [data-fitness-ring="sessions"]').count(), 1);
    assert.match(await page.locator('#fitness-loads').textContent(), /Chest Press|Bicep Curl/i);
    assert.equal(await page.locator('#fitness-volume-rows').count(), 0);
    assert.equal(await page.locator('#fitness-rep-card').isVisible(), true);
    assert.match(await page.locator('[data-fitness="rep-read"]').textContent(), /Hypertrophy|Strength|Endurance/);
    assert.ok(await page.locator('#fitness-rep-card .mind-chart-legend').count() >= 1);
    assert.equal(await page.locator('#fitness-region-vol-card').isVisible(), true);
    assert.ok(await page.locator('#fitness-region-donut circle').count() >= 1);
    assert.ok(await page.locator('#fitness-region-vol-card .mind-chart-legend').count() >= 1);
    assert.equal(await page.locator('#fitness-chord-card').count(), 0);
    assert.equal(await page.locator('#fitness-sankey-card').count(), 0);
    assert.equal(await page.locator('#fitness-library-card').count(), 0);
    assert.equal(await page.locator('#fitness-push-pull-card').isVisible(), true);
    assert.equal(await page.locator('#fitness-rest-card').isVisible(), true);
    assert.equal(await page.locator('#fitness-e1rm-card').isHidden(), true);
    assert.equal(await page.locator('#fitness-readings-card').isHidden(), true);
    assert.equal(await page.locator('#fitness-clock-card').isVisible(), true);
    assert.match(await page.locator('[data-fitness="when-read"]').textContent(), /Split mornings and evenings · typical start 12:25/);
    assert.match(await page.locator('#fitness-clock-chart').textContent(), /Morning/);
    assert.match(await page.locator('#fitness-clock-chart').textContent(), /Evening/);
    assert.equal(await page.locator('#fitness-orbit-card').isVisible(), true);
    assert.match(await page.locator('[data-fitness="orbit-read"]').textContent(), /2 sessions in the last 30 days/);
    assert.match(await page.locator('#fitness-year-card').textContent(), /2 sessions in 2026/);
    assert.match(await page.locator('#fitness-recent').textContent(), /Chest and Curls/);
    assert.equal(await page.locator('#fitness-comparisons-card').isHidden(), true);
    assert.ok(await page.locator('#fitness-exercise-list .fitness-exercise').count() >= 2);
    assert.match(await page.locator('#fitness-exercise-list').textContent(), /kg/i);
    assert.match(await page.locator('#fitness-exercise-list').textContent(), /constant force|concentric|eccentric|elastic|rowing|none/i);
  } finally {
    await context.close();
  }
});

test('the floating chat button opens the shared chat panel themed in Chadwick\'s colour', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await signIn(page);
    await page.locator('.desktop-rail [data-section="fitness"]').click();
    await page.locator('#fitness-dashboard').waitFor({ state: 'visible' });

    await page.locator('#fitness-chat-button').click();
    await page.locator('#chat-view[data-panel-mode="overlay"]').waitFor({ state: 'visible' });

    const accent = await page.locator('#chat-view').evaluate(element => (
      getComputedStyle(element).getPropertyValue('--agent-accent').trim()
    ));
    assert.equal(accent, '#D9683A');
  } finally {
    await context.close();
  }
});
