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
  <title>Workout card swipe</title>
  <link rel="stylesheet" href="/packages/design-kit/tokens.css">
  <link rel="stylesheet" href="/packages/design-kit/overlays.css">
  <link rel="stylesheet" href="/packages/design-kit/actions.css">
  <link rel="stylesheet" href="/packages/design-kit/motion.css">
  <link rel="stylesheet" href="/packages/design-kit/card-swipe.css">
  <link rel="stylesheet" href="/css/app.css">
</head>
<body>
  <div id="logger" class="fitness-logger"></div>
  <script type="module">
    import { renderFitnessLogger } from '/js/app/render-fitness-logger.js';

    const draft = {
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
        { name: 'Bench press', coach_cues: { start: 'Chest over the handles.' }, sets: [
          { reps: 8, weight_kg: 36, cable_type: 'constant_force' }
        ]},
        { name: 'Cable fly', sets: [{ reps: 12, weight_kg: 12, cable_type: 'constant_force' }] },
        { name: 'Bayesian curl', sets: [{ reps: 10, weight_kg: 14, cable_type: 'none' }] }
      ]
    };

    const root = {
      querySelector(sel) {
        return sel === '#fitness-logger' ? document.getElementById('logger') : document.querySelector(sel);
      },
      createElement: tag => document.createElement(tag)
    };

    let exerciseIndex = 0;
    let expandedExerciseIndex = null;

    function paint() {
      renderFitnessLogger(root, draft, {
        exerciseIndex,
        expandedExerciseIndex,
        timer: { state: 'running', everStarted: true, completeVisible: true },
        onExerciseIndexChange(next) {
          exerciseIndex = next;
          expandedExerciseIndex = null;
          paint();
        },
        onExpandExercise(next) {
          exerciseIndex = next;
          expandedExerciseIndex = next;
          paint();
        },
        onCollapseExercise() {
          expandedExerciseIndex = null;
          paint();
        }
      });
    }

    paint();
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

test('logger swipe moves between compact exercise cards', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/card-swipe-preview.html`);
    const logger = page.locator('#logger .fitness-logger__swipe');
    await logger.waitFor();
    assert.match(await logger.locator('.hub-card-swipe__status').textContent(), /1 of 3 · Bench press/);
    assert.equal(await page.locator('.fitness-logger__exercise').count(), 0);
    await logger.locator('.hub-card-swipe__dot').nth(2).click();
    assert.match(await logger.locator('.hub-card-swipe__status').textContent(), /3 of 3 · Bayesian curl/);
    assert.match(await logger.locator('.fitness-logger__peek .hub-card-swipe__title').textContent(), /Bayesian curl/);
  } finally {
    await context.close();
  }
});

test('tapping a compact card expands the set editor', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/card-swipe-preview.html`);
    await page.locator('#logger .fitness-logger__peek').first().click();
    const editor = page.locator('.fitness-logger__exercise');
    await editor.waitFor();
    assert.match(await editor.locator('h4').textContent(), /Bench press/);
    assert.equal(await editor.locator('.fitness-logger__sets input').first().inputValue(), '36');
    await page.locator('[data-hub-morph-close], [data-fitness-logger="collapse-exercise"]').first().click();
    await editor.waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.fitness-logger__exercise').count(), 0);
  } finally {
    await context.close();
  }
});
