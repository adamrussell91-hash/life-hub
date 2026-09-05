import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import '../../scripts/prepare-web.mjs';
import { createStaticServer } from '../../scripts/serve.mjs';

let browser;
let server;
let baseUrl;

const PREVIEW = `<!doctype html>
<html lang="en-AU" data-hub="life">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Card swipe preview</title>
  <link rel="stylesheet" href="/packages/design-kit/tokens.css">
  <link rel="stylesheet" href="/packages/design-kit/overlays.css">
  <link rel="stylesheet" href="/packages/design-kit/actions.css">
  <link rel="stylesheet" href="/packages/design-kit/card-swipe.css">
</head>
<body>
  <div id="mount"></div>
  <div id="logger" class="fitness-logger"></div>
  <script type="module">
    import { createCardSwipe } from '/packages/design-kit/js/card-swipe.js';
    import { renderFitnessLogger } from '/js/app/render-fitness-logger.js';

    const swipe = createCardSwipe({
      root: document,
      label: 'Exercises'
    });
    document.getElementById('mount').append(swipe.el);

    const root = {
      querySelector(sel) {
        return sel === '#fitness-logger' ? document.getElementById('logger') : document.querySelector(sel);
      },
      createElement: tag => document.createElement(tag)
    };
    renderFitnessLogger(root, {
      title: 'Upper Body',
      session_kind: 'strength',
      notes: '',
      avg_hr: null,
      calories_kcal: null,
      distance_km: null,
      duration_min: null,
      recovery_flag_next_day: false,
      pain_flags: [],
      exercises: [
        { name: 'Bench press', sets: [{ reps: 8, weight_kg: 36, cable_type: 'constant_force' }] },
        { name: 'Cable fly', sets: [{ reps: 12, weight_kg: 12, cable_type: 'constant_force' }] },
        { name: 'Bayesian curl', sets: [{ reps: 10, weight_kg: 14, cable_type: 'none' }] }
      ]
    }, { exerciseIndex: 0, timer: { state: 'running', everStarted: true, completeVisible: true } });
  </script>
</body>
</html>`;

before(async () => {
  await writeFile(new URL('../../dist/card-swipe-preview.html', import.meta.url), PREVIEW);
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

test('kit card swipe moves to the next exercise on drag and dot', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/card-swipe-preview.html`);
    const deck = page.locator('#mount .hub-card-swipe');
    await deck.waitFor();
    assert.match(await deck.locator('.hub-card-swipe__status').textContent(), /1 of 5 · Bench press/);
    await deck.locator('.hub-card-swipe__dot').nth(1).click();
    assert.match(await deck.locator('.hub-card-swipe__status').textContent(), /2 of 5 · Cable fly/);

    const box = await deck.locator('.hub-card-swipe__viewport').boundingBox();
    assert.ok(box);
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.15, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    assert.match(await deck.locator('.hub-card-swipe__status').textContent(), /3 of 5 · Bayesian curl/);
  } finally {
    await context.close();
  }
});

test('fitness logger swipe shows one exercise card at a time', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/card-swipe-preview.html`);
    const logger = page.locator('#logger .fitness-logger__swipe');
    await logger.waitFor();
    assert.match(await logger.locator('.hub-card-swipe__status').textContent(), /1 of 3 · Bench press/);
    await logger.locator('.hub-card-swipe__dot').nth(2).click();
    assert.match(await logger.locator('.hub-card-swipe__status').textContent(), /3 of 3 · Bayesian curl/);
    assert.equal(await logger.locator('.fitness-logger__exercise').count(), 3);
  } finally {
    await context.close();
  }
});
