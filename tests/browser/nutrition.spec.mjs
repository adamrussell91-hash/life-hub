import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
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
    apiRoot: new URL('../..', import.meta.url),
    extraFiles: [{
      path: 'data/nutrition/2026/07/2026-07-23-lunch.md',
      content: (await readFile(new URL('../fixtures/valid/data/nutrition/2026/07/2026-07-30-lunch.md', import.meta.url), 'utf8'))
        .replaceAll('2026-07-30', '2026-07-23').replace('id: meal-2', 'id: history-lunch')
    }]
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
    assert.equal(await page.locator('#page-eyebrow').textContent(), 'Life Hub');
    await page.locator('#page-title', { hasText: 'Nutrition' }).waitFor();
    assert.equal(await page.locator('.page-header__title-row .hub-mark').count(), 0);

    assert.equal(await page.locator('#nutrition-energy-slider').count(), 0);
    const legend = page.locator('#nutrition-ring-legend li');
    assert.deepEqual(await legend.evaluateAll(items => items.map(item => item.dataset.ring)), ['protein', 'energy', 'fat', 'sodium']);
    assert.equal(await page.locator('[data-ring="protein"] .nutrition-rings__amount').textContent(), '80 / 120 g');
    assert.equal(await page.locator('[data-ring="energy"] .nutrition-rings__amount').textContent(), '1,130 / 1,900 kcal');
    assert.equal(await page.locator('[data-ring="fat"] .nutrition-rings__amount').textContent(), '27 / 50 g ceiling');
    assert.equal(await page.locator('#nutrition-climb .climb-marker').count(), 2);
    assert.equal(await page.locator('#nutrition-climb .climb-now-label').textContent(), 'now · 12 pm');
    assert.equal(await page.locator('#nutrition-climb .climb-projection-label').textContent(), '40 g to go before bed');
    for (const retired of ['#nutrition-macro-split', '[data-nutrition-ring]', '#nutrition-meal-protein-pie',
      '#nutrition-protein-chart', '#nutrition-calories-chart', '#nutrition-heatmap', '#nutrition-week-compare', '.meal-history__strip']) {
      assert.equal(await page.locator(retired).count(), 0, `${retired} is retired`);
    }
    assert.equal(await page.locator('.week-grid__day').count(), 7);
    assert.equal(await page.locator('.week-grid__day').first().locator('.week-grid__cell').count(), 4);
    assert.equal(await page.locator('#nutrition-consistency-strip .consistency-strip__bar').count(), 30);

    await page.locator('#nutrition-challenges').waitFor({ state: 'visible' });
    assert.match(await page.locator('.nutrition-challenge__heading strong').textContent(), /No refined sugar/);
    assert.equal(await page.locator('.nutrition-challenge__day').count(), 7);

    // The entrance plays once and always rests on the finished chart.
    await page.waitForFunction(() => document.querySelectorAll('#nutrition-dashboard .is-playing').length === 0, null, { timeout: 4000 });
    const settled = await page.evaluate(() => {
      const line = document.querySelector('#nutrition-climb .climb-line');
      return { animations: line.getAnimations().length, d: line.getAttribute('d').length };
    });
    assert.equal(settled.animations, 0);
    assert.ok(settled.d > 0);

    // A quiet sync mid-entrance stops every animation on the final geometry.
    await page.locator('.desktop-rail [data-section="chat"]').click();
    await page.locator('.desktop-rail [data-section="nutrition"]').click();
    await page.evaluate(() => { document.querySelector('#app').dataset.syncQuiet = 'true'; });
    const duringQuiet = await page.evaluate(() => ['#nutrition-today', '.week-grid', '#nutrition-consistency']
      .reduce((count, selector) => count + document.querySelector(selector).getAnimations({ subtree: true }).length, 0));
    assert.equal(duringQuiet, 0);
    await page.evaluate(() => { delete document.querySelector('#app').dataset.syncQuiet; });

    // C1: climb labels never overlap each other or leave the SVG, at desktop and phone width.
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForTimeout(150);
      const collisions = await page.evaluate(() => {
        const svg = document.querySelector('#nutrition-climb');
        const view = svg.viewBox.baseVal;
        const boxes = [...svg.querySelectorAll('.climb-now-label, .climb-projection-label, .climb-goal-label, .climb-marker__label, .climb-hit-label')]
          .map(text => ({ text: text.textContent, box: text.getBBox() }));
        const problems = [];
        for (const { text, box } of boxes) {
          if (box.x < 0 || box.y < -2 || box.x + box.width > view.width + 1 || box.y + box.height > view.height + 1) problems.push(`${text} leaves the chart`);
        }
        for (let i = 0; i < boxes.length; i++) {
          for (let j = i + 1; j < boxes.length; j++) {
            const a = boxes[i].box; const b = boxes[j].box;
            if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) problems.push(`${boxes[i].text} overlaps ${boxes[j].text}`);
          }
        }
        return problems;
      });
      assert.deepEqual(collisions, [], `climb labels at ${width}px`);
      const fits = await page.evaluate(() => document.documentElement.scrollWidth === innerWidth);
      assert.ok(fits, `no horizontal scroll at ${width}px`);
    }

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

test('meal history browses previous weeks and dates with working detail, empty and mobile states', async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await signIn(page);
    await page.locator('.desktop-rail [data-section="nutrition"]').click();
    await page.locator('.meal-log__item').first().waitFor();
    assert.equal(await page.locator('#meal-history-day').isVisible(), true, 'the chosen day is open in its own card');
    assert.equal(await page.locator('.week-grid__day').count(), 7);
    await page.getByRole('button', { name: 'Previous week of meals' }).click();
    await page.locator('#meal-history-date', { hasText: 'Thu 23/07/26' }).waitFor();
    await page.locator('.meal-log__item').waitFor();
    assert.match(await page.locator('.meal-log__macros').textContent(), /carbs/);
    const detail = page.locator('.meal-log__item button');
    await detail.press('Enter');
    assert.equal(await detail.getAttribute('aria-expanded'), 'true');
    await page.locator('.hub-disclosure__body').waitFor({ state: 'visible' });
    assert.match(await page.locator('.hub-disclosure__body').textContent(), /Sodium/);
    await page.locator('#refresh-button').click();
    await page.locator('#app[data-state="ready"]').waitFor();
    assert.equal(await page.locator('#meal-history-date').textContent(), 'Thu 23/07/26');
    assert.equal(await detail.getAttribute('aria-expanded'), 'true');
    await page.locator('.week-grid__day[data-date="2026-07-23"]').press('Enter');
    assert.equal(await page.locator('#meal-history-day').isVisible(), true, 'choosing the open day never collapses it');
    assert.equal(await page.locator('.week-grid__day[data-date="2026-07-23"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await detail.getAttribute('aria-expanded'), 'true');
    await page.getByLabel('Jump to meal date').fill('2026-07-29');
    await page.getByLabel('Jump to meal date').press('Tab');
    await page.locator('.meal-log__empty').waitFor({ state: 'visible' });
    assert.match(await page.locator('.meal-log__empty').textContent(), /No meals logged/);
    assert.equal(await page.locator('.meal-history__totals').isHidden(), true);
    await page.getByLabel('Jump to meal date').fill('2026-07-23');
    await page.getByLabel('Jump to meal date').press('Tab');
    await page.locator('.meal-log__item').waitFor();
    for (const width of [390, 1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.waitForFunction(() => {
        const frame = document.querySelector('.page-frame');
        return innerWidth <= 720
          ? getComputedStyle(frame).marginLeft === '0px'
          : parseFloat(getComputedStyle(frame).marginLeft) > 0;
      });
      assert.equal(await page.locator('#meal-history-date').textContent(), 'Thu 23/07/26');
      const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
      assert.equal(dimensions.scroll, dimensions.width, `Nutrition must fit the ${width}px viewport`);
      const sizes = await page.locator('.week-grid__day:not([disabled])').evaluateAll(elements => elements.map(el => el.getBoundingClientRect().height));
      assert.ok(sizes.every(height => height >= 44));
      assert.ok(await page.locator('input[type="date"]').evaluate(el => parseFloat(getComputedStyle(el).fontSize) >= 16));
    }
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    await page.locator('#meal-history-date', { hasText: 'Today' }).waitFor();
    assert.equal(await page.locator('.meal-log__item').count(), 2);
    assert.equal(await page.locator('.week-grid__day[data-selected="true"]').getAttribute('data-date'), '2026-07-30');
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
  }
});
