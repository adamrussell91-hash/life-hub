// Visual and motion contract for the Unified Timeline.
// Place at apps/tasks/tests/browser/timeline-visual.spec.mjs (it is picked up by test:browser).
//
// It runs against the app by default. With TIMELINE_REF=1 it runs against the reference
// prototype instead (docs/proposals/timeline-reference/timeline.html served from the repo root
// on TIMELINE_REF_URL). The reference passes every test here; the build must too.
//
// App requirements the spec relies on:
// - POST /api/timeline-visual-seed seeds fixture.json into the mock API (same pattern as
//   /api/graph-visual-seed and scripts/seed-graph-visual.ts).
// - The mock Hammond judge returns fixture.json "hammond_proposal" for timeline_rebalance.
// - In dev builds only (import.meta.env.DEV), the view exposes
//   window.__timeline = { engine, state, setZoom, setView, showHammond } like the prototype.
//
// Tests are named by the plan phase that must make them pass. Run a phase's tests with
//   npx playwright test tests/browser/timeline-visual.spec.mjs -g "phase 2"
// Earlier phases must keep passing. Later phases are expected to fail until their phase lands.
//
// Every selector uses data-part attributes. Add them in the view; do not change this file to fit
// the implementation. If an assertion is wrong, say why in the PR instead.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const REF = process.env.TIMELINE_REF === '1';
const REF_URL = process.env.TIMELINE_REF_URL ?? 'http://127.0.0.1:4173/docs/proposals/timeline-reference/timeline.html';
const REPO = process.env.TIMELINE_REPO_ROOT ?? path.resolve(REF ? '.' : '../..');
const OUT = path.join(REPO, 'docs/proposals/timeline-reference/compare');
fs.mkdirSync(OUT, { recursive: true });

const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};
const css = (loc, prop) => loc.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p).trim(), prop);
const attr = (loc, a) => loc.getAttribute(a);
const box = (loc) => loc.evaluate((el) => el.getBoundingClientRect().toJSON());

async function openTimeline(page) {
  if (REF) {
    await page.goto(REF_URL);
  } else {
    await page.clock.install({ time: new Date('2026-09-22T09:00:00+10:00') });
    await page.goto('/#/board');
    const pass = page.getByLabel('Passphrase');
    if (await pass.isVisible().catch(() => false)) {
      await pass.fill('tasks-hub-local');
      await page.getByRole('button', { name: /sign in/i }).click();
    }
    await expect(page.locator('.page-header')).toBeVisible({ timeout: 20_000 });
    const seeded = await page.evaluate(async () => {
      const res = await fetch('/api/timeline-visual-seed', { method: 'POST' });
      return { ok: res.ok, status: res.status };
    });
    expect(seeded).toMatchObject({ ok: true });
    await page.clock.resume();
    await page.evaluate(() => {
      location.hash = '#/timeline';
    });
  }
  await expect(page.locator('[data-part="timeline-card"]')).toBeVisible({ timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('[data-part="bar"][data-task-id="t3"]')).toBeVisible();
  await page.waitForTimeout(1200); // entrance finished
}

async function settle(page, ms = 700) {
  await page.waitForTimeout(ms);
}

test.describe('Timeline: layout and type', () => {
  test('phase 2: base layout matches the reference at Month zoom', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openTimeline(page);

    // Toolbar
    const zoom = page.locator('[data-part="zoom-pills"] button');
    await expect(zoom).toHaveText(['Year', 'Term', 'Month', 'Week', 'Day']);
    await expect(zoom.nth(2)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-part="view-toggle"] button')).toHaveText(['Bars', 'Lines']);

    // Axis: school weeks and dd/mm/yy dates
    await expect(page.locator('[data-part="axis-week"]').filter({ hasText: 'T3 W10' })).toHaveCount(1);
    await expect(page.locator('[data-part="axis-week"]').filter({ hasText: '12/10/26' })).toHaveCount(1);
    await expect(page.locator('[data-part="today"]')).toContainText('Today');

    // Task bar geometry and type
    const t3 = page.locator('[data-part="bar"][data-task-id="t3"]');
    const face = t3.locator('[data-part="bar-face"]');
    expect(parseFloat(await attr(face, 'height'))).toBe(24);
    expect(parseFloat(await attr(face, 'rx'))).toBe(6);
    const title = t3.locator('[data-part="bar-title"]');
    expect(await css(title, 'font-size')).toBe('13px');
    expect(await css(title, 'font-weight')).toBe('500');
    expect(parseFloat(await attr(t3.locator('[data-part="bar-stripe"]'), 'width'))).toBe(3);
    await expect(t3.locator('[data-part="bar-sub"]')).toHaveText('due 24/09/26');

    // Title and sub never overlap (measured after fonts load)
    const tb = await box(title);
    const sb = await box(t3.locator('[data-part="bar-sub"]'));
    expect(sb.left).toBeGreaterThanOrEqual(tb.right + 4);

    // Blocked bar
    const t5 = page.locator('[data-part="bar"][data-task-id="t5"]');
    expect(await css(t5.locator('[data-part="bar-stripe"]'), 'fill')).toBe(rgb('#9b2c2c'));
    await expect(t5.locator('[data-part="bar-sub"]')).toHaveText('blocked 4 days');

    // Milestone, undated chip, goal band
    await expect(page.locator('[data-part="milestone"][data-milestone-id="m-finals"]')).toContainText('Finals · 03/10/26');
    await expect(page.locator('[data-part="undated"]').first()).toContainText(/\+\d undated/);
    await expect(page.locator('[data-part="goal-band"]').first()).toContainText('2 projects');

    // Dependency curves: FS curves drawn with the kit arrowhead
    expect(await page.locator('[data-part="curve"]').count()).toBeGreaterThanOrEqual(6);

    // No SVG text under 12px except uppercase micro-labels at 11px
    const small = await page.locator('[data-part="timeline-card"] svg text').evaluateAll((els) =>
      els
        .filter((e) => e.textContent)
        .map((e) => {
          const s = getComputedStyle(e);
          return { size: parseFloat(s.fontSize), upper: s.textTransform === 'uppercase', text: e.textContent };
        })
        .filter((t) => t.size < 12 && !(t.size === 11 && (t.upper || /^[1-7H]$/.test(t.text))))
    );
    expect(small).toEqual([]);

    await page.screenshot({ path: path.join(OUT, 'timeline-1280.png'), fullPage: true });
  });

  test('phase 7: standards ribbon', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openTimeline(page);
    const segs = page.locator('[data-part="ribbon"] [data-part="ribbon-seg"]');
    await expect(segs).toHaveCount(7);
    const states = await segs.evaluateAll((els) => els.map((e) => e.getAttribute('data-state')));
    expect(states).toEqual(['evidenced', 'evidenced', 'evidenced', 'evidenced', 'none', 'some', 'some']);
  });

  test('phase 5: marking shadows and load strip', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openTimeline(page);
    // Marking shadows
    await expect(page.locator('[data-part="shadow"][data-task-id="k1"] [data-part="shadow-label"]')).toHaveText('9B · 18 of 28 · ~1 h left');
    const k2 = page.locator('[data-part="shadow"][data-task-id="k2"]');
    await expect(k2).toHaveAttribute('data-warn', 'true');
    await expect(k2.locator('[data-part="shadow-warn"]')).toHaveText('needs 84 min a day');
    // Load strip: at least one over-capacity week, capacity line present
    expect(await page.locator('[data-part="load-col"][data-over="true"]').count()).toBeGreaterThanOrEqual(1);
    await expect(page.locator('[data-part="capacity-line"]')).toHaveCount(1);
  });

  test('phase 4: life wall', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openTimeline(page);
    await expect(page.locator('[data-part="wall"]')).toContainText('Overseas trip · wall');
  });

  test('phase 2: critical path highlights the chain and dims the rest', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openTimeline(page);
    await page.getByRole('button', { name: 'Critical path' }).click();
    await settle(page);
    const crit = page.locator('[data-part="curve"][data-kind="critical"]');
    expect(await crit.count()).toBeGreaterThanOrEqual(3);
    expect(await css(crit.first().locator('path'), 'stroke')).toBe(rgb('#a85a0c'));
    expect(parseFloat(await css(crit.first().locator('path'), 'stroke-width'))).toBe(2.5);
    await page.screenshot({ path: path.join(OUT, 'critical-1280.png'), fullPage: true });
  });
});

test.describe('Timeline: motion', () => {
  test('phase 2: zoom keeps today anchored and changes semantic rows', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openTimeline(page);
    const todayX = async () => (await box(page.locator('[data-part="today"] line'))).left;
    const before = await todayX();
    await page.locator('[data-part="zoom-pills"] button', { hasText: 'Week' }).click();
    await page.waitForTimeout(120);
    const mid = await todayX();
    expect(Math.abs(mid - before)).toBeLessThan(3); // anchored during the tween
    await settle(page, 700);
    expect(Math.abs((await todayX()) - before)).toBeLessThan(3);
    // Week zoom opens tasks with dated steps
    await expect(page.locator('[data-part="step-bar"][data-task-id="t3a"]')).toBeVisible();
    await page.screenshot({ path: path.join(OUT, 'week-1280.png'), fullPage: true });
  });

  test('phase 2: live update animates from the old position (no jump, no redraw)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openTimeline(page);
    const bar = page.locator('[data-part="bar"][data-task-id="t6"]');
    const handle = await bar.elementHandle();
    const x0 = (await box(bar)).left;
    if (REF) await page.locator('#ref-live').click();
    else
      await page.evaluate(async () => {
        await fetch('/api/tasks/t6', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ due_date: '2026-10-01' }) });
      });
    await page.waitForTimeout(REF ? 90 : 250);
    const xm = (await box(bar)).left;
    await settle(page, 700);
    const x1 = (await box(bar)).left;
    expect(x1).toBeGreaterThan(x0 + 2);
    expect(xm).toBeGreaterThan(x0);
    expect(xm).toBeLessThan(x1);
    // Same DOM node: updated in place, not redrawn
    expect(await handle.evaluate((el) => el.isConnected)).toBe(true);
  });

  test('phase 5: drag is 1:1, curves follow, the ripple previews, release settles', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openTimeline(page);
    // Permission notes (due 24/09) moves 3 days earlier: every day involved is a term day.
    const bar = page.locator('[data-part="bar"][data-task-id="t3"]');
    const face = bar.locator('[data-part="bar-face"]');
    const b = await box(face);
    await page.mouse.move(b.left + 8, b.top + b.height / 2);
    await page.mouse.down();
    const dayW = await page.evaluate(() => window.__timeline.state.dayWidth);
    for (let i = 1; i <= 10; i++) await page.mouse.move(b.left + 8 - i * dayW * 0.3, b.top + b.height / 2);
    const dragged = await box(face);
    expect(Math.abs(dragged.left - (b.left - 3 * dayW))).toBeLessThan(1.5); // 1:1, no easing
    expect(await page.locator('[data-part="ripple"]').count()).toBeGreaterThanOrEqual(1);
    await page.mouse.up();
    await settle(page, 800);
    const released = await box(face);
    expect(Math.abs(released.left - (b.left - 3 * dayW))).toBeLessThan(1.5); // snapped to whole days
    await expect(page.locator('[data-part="ripple"]')).toHaveCount(0);
  });

  test('phase 6: Hammond ghosts and Apply all', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openTimeline(page);
    await page.getByRole('button', { name: 'Ask Hammond' }).click();
    await expect(page.locator('[data-part="ghost-tray"]')).toBeVisible({ timeout: 10_000 });
    await settle(page, 600);
    await expect(page.locator('[data-part="ghost"]')).toHaveCount(3);
    await expect(page.locator('[data-part="ghost-arrow"]')).toHaveCount(3);
    await page.screenshot({ path: path.join(OUT, 'hammond-1280.png'), fullPage: true });
    const target = await box(page.locator('[data-part="ghost"][data-task-id="h3"]').locator('rect').first());
    await page.getByRole('button', { name: 'Apply all' }).click();
    await settle(page, 800);
    await expect(page.locator('[data-part="ghost"]')).toHaveCount(0);
    const moved = await box(page.locator('[data-part="bar"][data-task-id="h3"] [data-part="bar-face"]'));
    expect(Math.abs(moved.left - target.left)).toBeLessThan(2);
  });

  test('phase 3: Bars to Lines morphs, reverses mid-flight and leaves nothing behind', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openTimeline(page);
    await page.locator('[data-part="view-toggle"] button', { hasText: 'Lines' }).click();
    await page.waitForTimeout(200);
    const overlay = page.locator('[data-part="morph-overlay"]');
    await expect(overlay).toHaveCount(1);
    expect(await overlay.locator('[data-morph-clone]').count()).toBeGreaterThanOrEqual(20);
    await settle(page, 900);
    await expect(overlay).toHaveCount(0);
    await expect(page.locator('[data-part="line"]')).toHaveCount(4);
    await page.screenshot({ path: path.join(OUT, 'lines-1280.png'), fullPage: true });

    // Reverse mid-flight: read the clone just before and just after reversing, in one task.
    await page.keyboard.press('l');
    await page.waitForTimeout(160);
    const jump = await page.evaluate(() => {
      const c = document.querySelector('[data-morph-clone="t3"]');
      const before = c.getBoundingClientRect().top;
      window.__timeline.setView(window.__timeline.state.view === 'bars' ? 'lines' : 'bars');
      return Math.abs(c.getBoundingClientRect().top - before);
    });
    expect(jump).toBeLessThan(1);
    await settle(page, 1000);
    await expect(overlay).toHaveCount(0);
    await expect(page.locator('[data-part="line"]').first()).toBeVisible();

    // 20 rapid toggles leave no orphans and no hidden entities
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press('l');
      await page.waitForTimeout(30 + (i % 4) * 40);
    }
    await settle(page, 1500);
    await expect(overlay).toHaveCount(0);
    const hidden = await page.locator('[data-entity-id]').evaluateAll((els) => els.filter((e) => e.style.visibility === 'hidden').length);
    expect(hidden).toBe(0);
  });

  test('phase 2: frame budget during zoom', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openTimeline(page);
    for (const z of [3, 4, 0, 2]) {
      await page.evaluate((i) => window.__timeline.setZoom(i), z);
      await page.waitForTimeout(450);
    }
    const s = await page.evaluate(() => window.__timeline.engine.stats());
    expect(s.frames).toBeGreaterThan(20);
    // Headless CI thresholds. On Adam's Mac the target is p95 < 8 and max < 16 (see VISUAL-SPEC.md).
    expect(s.p95).toBeLessThan(16.7);
    expect(s.max).toBeLessThan(50);
  });
});

test.describe('Timeline: reduced motion', () => {
  test('phase 3: reduced motion, no flight and no tweened geometry', async ({ page }) => {
    // emulateMedia before load; the test.use option does not reach matchMedia reliably.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 900 });
    await openTimeline(page);
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
    await page.locator('[data-part="view-toggle"] button', { hasText: 'Lines' }).click();
    await page.waitForTimeout(40);
    await expect(page.locator('[data-part="morph-overlay"]')).toHaveCount(0);
    await page.evaluate(() => window.__timeline.setZoom(3));
    await page.waitForTimeout(30);
    expect(await page.evaluate(() => window.__timeline.state.dayWidth)).toBe(34);
  });
});

test.describe('Timeline: focus lens and forecast', () => {
  test('phase 8: lens snaps to this week and tails use the domain P85', async ({ page }) => {
    test.skip(!REF, 'Reference only until the look is approved and the app is built');
    await page.setViewportSize({ width: 1280, height: 900 });
    await openTimeline(page);
    await expect(page.getByRole('button', { name: 'Focus' })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('button', { name: 'Forecast' })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('[data-part="lens"]')).toHaveCount(0);
    await expect(page.locator('[data-part="forecast-tail"]')).toHaveCount(0);

    await page.getByRole('button', { name: 'Focus' }).click();
    await settle(page);
    const lens = page.locator('[data-part="lens"]');
    await expect(lens).toHaveCount(1);
    await expect(lens).toHaveAttribute('data-start', '2026-09-21');
    await expect(lens).toHaveAttribute('data-end', '2026-10-04');
    await expect(page.locator('[data-part="lens-grab"]')).toContainText('21/09/26');
    const focused = page.locator('[data-part="bar"][data-task-id="t3"] [data-part="bar-face"]');
    expect(parseFloat(await attr(focused, 'width'))).toBeGreaterThan(80);

    await page.getByRole('button', { name: 'Forecast' }).click();
    await settle(page);
    const tail = page.locator('[data-part="forecast-tail"][data-task-id="t3"]');
    await expect(tail).toHaveCount(1);
    await expect(tail).toHaveAttribute('data-days', '0.71');
    await expect(tail).toHaveAttribute('data-domain', 'teaching');
    const barBox = await box(page.locator('[data-part="bar"][data-task-id="t3"]'));
    const tailBox = await box(tail);
    expect(tailBox.left).toBeGreaterThan(barBox.left + 40);
    await expect(page.locator('[data-part="forecast-tail"][data-milestone-id="m-finals"]')).toHaveAttribute('data-days', '4.75');
    const doneTail = page.locator('[data-part="forecast-tail"][data-task-id="t1"]');
    await expect(doneTail).toHaveCount(0);

    await page.screenshot({ path: path.join(OUT, 'focus-forecast-1280.png'), fullPage: true });

    const grab = page.locator('[data-part="lens-grab"]');
    const handle = await grab.boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + 96 * 4, handle.y + handle.height / 2, { steps: 10 });
    await page.mouse.up();
    await settle(page, 200);
    const moved = await lens.getAttribute('data-start');
    expect(moved > '2026-09-21').toBe(true);
  });
});

test.describe('Timeline: phone', () => {
  test('phase 3: 390px, no sideways page scroll, rows still named, vertical Lines', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openTimeline(page);
    const overflow = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(await page.locator('[data-part="row-title"]').count()).toBeGreaterThanOrEqual(5);
    await page.screenshot({ path: path.join(OUT, 'timeline-390.png'), fullPage: true });
    await page.locator('[data-part="view-toggle"] button', { hasText: 'Lines' }).click();
    await settle(page, 1200);
    const svgH = await page.locator('[data-part="line"] svg').first().evaluate((e) => e.getBoundingClientRect().height);
    expect(svgH).toBeGreaterThan(300);
    await page.screenshot({ path: path.join(OUT, 'lines-390.png'), fullPage: true });
  });
});
