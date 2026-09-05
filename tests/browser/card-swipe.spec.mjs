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
    import { collapseExerciseEditor, renderFitnessLogger } from '/js/app/render-fitness-logger.js';

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
          if (expandedExerciseIndex != null) {
            expandedExerciseIndex = null;
            collapseExerciseEditor(root);
          }
        },
        onExpandExercise(next) {
          exerciseIndex = next;
          expandedExerciseIndex = next;
          paint();
        },
        onCollapseExercise() {
          if (expandedExerciseIndex == null) return;
          expandedExerciseIndex = null;
          collapseExerciseEditor(root);
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
    assert.match(
      await logger.locator('.hub-card-swipe__slide[aria-hidden="false"] .hub-card-swipe__title').textContent(),
      /Bayesian curl/
    );
  } finally {
    await context.close();
  }
});

test('tapping a compact card expands the set editor', async () => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/card-swipe-preview.html`);
    const logger = page.locator('#logger .fitness-logger__swipe');
    await logger.locator('.hub-card-swipe__dot').nth(2).click();
    await logger.locator('.hub-card-swipe__slide[aria-hidden="false"] .fitness-logger__peek').click();
    const dialog = page.locator('.hub-morph-dialog.is-in');
    await dialog.waitFor();
    const editor = dialog.locator('.fitness-logger__exercise');
    await editor.waitFor();
    assert.match(await editor.locator('h4').textContent(), /Bayesian curl/);
    assert.equal(await editor.locator('.fitness-logger__sets input').first().inputValue(), '14');
    await dialog.locator('[data-hub-morph-close]').click();
    await page.locator('.hub-morph-dialog').waitFor({ state: 'detached' });
    assert.equal(await page.locator('.fitness-logger__exercise').count(), 0);
    const peek = page.locator('#logger .hub-card-swipe__slide[aria-hidden="false"] .fitness-logger__peek');
    await peek.waitFor();
    assert.equal(await peek.evaluate(el => getComputedStyle(el).visibility), 'visible');
    assert.match(await peek.locator('.hub-card-swipe__title').textContent(), /Bayesian curl/);
    const alignment = await page.evaluate(() => {
      const viewport = document.querySelector('#logger .hub-card-swipe__viewport');
      const slide = document.querySelector('#logger .hub-card-swipe__slide[aria-hidden="false"]');
      const vr = viewport.getBoundingClientRect();
      const sr = slide.getBoundingClientRect();
      return {
        leftDelta: Math.abs(sr.left - vr.left),
        widthDelta: Math.abs(sr.width - vr.width)
      };
    });
    assert.ok(alignment.leftDelta < 8, `expected current card flush in the viewport, left delta ${alignment.leftDelta}`);
    assert.ok(alignment.widthDelta < 8, `expected current card to fill the viewport, width delta ${alignment.widthDelta}`);
  } finally {
    await context.close();
  }
});

test('fluid logger deck stays phone-width with many exercises', async () => {
  const exercises = Array.from({ length: 18 }, (_, i) => ({
    name: i === 0 ? 'Bar Squat' : `Exercise ${i + 1}`,
    coach_cues: { start: 'Legs first, big guy — set the tone for everything else today.' },
    sets: [
      { reps: 10, weight_kg: 30, cable_type: 'none' },
      { reps: 10, weight_kg: 30, cable_type: 'none' }
    ]
  }));
  const mobilePreview = PREVIEW
    .replace(
      /exercises: \[[\s\S]*?\]\n    };/,
      `exercises: ${JSON.stringify(exercises)}\n    };`
    )
    .replace(
      '<div id="logger" class="fitness-logger"></div>',
      '<div style="padding:12px;width:100%;box-sizing:border-box"><div id="logger" class="fitness-logger"></div></div>'
    );
  await writeFile(new URL('../../dist/card-swipe-mobile-preview.html', import.meta.url), mobilePreview);

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/card-swipe-mobile-preview.html`);
    const logger = page.locator('#logger .fitness-logger__swipe');
    await logger.waitFor();
    assert.match(await logger.locator('.hub-card-swipe__status').textContent(), /1 of 18 · Bar Squat/);

    const metrics = await page.evaluate(() => {
      const viewport = document.querySelector('#logger .hub-card-swipe__viewport');
      const slide = document.querySelector('#logger .hub-card-swipe__slide[aria-hidden="false"]');
      const card = document.querySelector('#logger .fitness-logger__peek');
      const add = document.querySelector('#logger .fitness-logger__add-exercise');
      const vr = viewport.getBoundingClientRect();
      const sr = slide.getBoundingClientRect();
      const cr = card.getBoundingClientRect();
      const ar = add.getBoundingClientRect();
      return {
        docScrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        leftDelta: Math.abs(sr.left - vr.left),
        widthDelta: Math.abs(sr.width - vr.width),
        cardWidthDelta: Math.abs(cr.width - vr.width),
        addRight: ar.right,
        slideWidth: sr.width
      };
    });

    assert.ok(
      metrics.docScrollWidth <= metrics.innerWidth + 1,
      `expected no horizontal page overflow, scrollWidth ${metrics.docScrollWidth} vs ${metrics.innerWidth}`
    );
    assert.ok(metrics.leftDelta < 8, `expected current card flush in the viewport, left delta ${metrics.leftDelta}`);
    assert.ok(metrics.widthDelta < 8, `expected slide to fill the viewport, width delta ${metrics.widthDelta}`);
    assert.ok(metrics.cardWidthDelta < 8, `expected peek card to fill the viewport, width delta ${metrics.cardWidthDelta}`);
    assert.ok(metrics.addRight <= metrics.innerWidth + 1, `add-exercise row clipped at ${metrics.addRight}`);
    assert.ok(metrics.slideWidth < 420, `slide stayed phone-sized, got ${metrics.slideWidth}`);

    await logger.locator('.hub-card-swipe__dot').nth(1).click();
    await page.waitForTimeout(350);
    const afterSwipe = await page.evaluate(() => {
      const viewport = document.querySelector('#logger .hub-card-swipe__viewport');
      const slide = document.querySelector('#logger .hub-card-swipe__slide[aria-hidden="false"]');
      const vr = viewport.getBoundingClientRect();
      const sr = slide.getBoundingClientRect();
      return {
        docScrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        leftDelta: Math.abs(sr.left - vr.left),
        title: slide.querySelector('.hub-card-swipe__title')?.textContent ?? ''
      };
    });
    assert.match(afterSwipe.title, /Exercise 2/);
    assert.ok(afterSwipe.leftDelta < 8, `after swipe left delta ${afterSwipe.leftDelta}`);
    assert.ok(
      afterSwipe.docScrollWidth <= afterSwipe.innerWidth + 1,
      `horizontal overflow after swipe: ${afterSwipe.docScrollWidth}`
    );
  } finally {
    await context.close();
  }
});

test('pointer-only tap opens the set editor without a click event', async () => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true
  });
  const page = await context.newPage();
  try {
    await page.goto(`${baseUrl}/card-swipe-preview.html`);
    const peek = page.locator('#logger .hub-card-swipe__slide[aria-hidden="false"] .fitness-logger__peek');
    await peek.waitFor();
    const box = await peek.boundingBox();
    assert.ok(box, 'expected peek card box');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    // Real phones often never fire click after pointer capture — only pointer events.
    await page.evaluate(({ x, y }) => {
      const track = document.querySelector('#logger .hub-card-swipe__track');
      const fire = (type, cx, cy, buttons) => {
        track.dispatchEvent(new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: cx,
          clientY: cy,
          pointerId: 1,
          pointerType: 'touch',
          isPrimary: true,
          buttons
        }));
      };
      fire('pointerdown', x, y, 1);
      fire('pointermove', x + 18, y + 4, 1);
      fire('pointerup', x + 18, y + 4, 0);
    }, { x, y });
    const dialog = page.locator('.hub-morph-dialog.is-in');
    await dialog.waitFor();
    const editor = dialog.locator('.fitness-logger__exercise');
    await editor.waitFor();
    assert.match(await editor.locator('h4').textContent(), /Bench press/);
  } finally {
    await context.close();
  }
});
