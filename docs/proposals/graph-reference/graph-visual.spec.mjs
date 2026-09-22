// Visual contract for the Tasks Graph. Place at apps/tasks/tests/browser/graph-visual.spec.mjs
// and register it in test:browser. It seeds docs/proposals/graph-reference/fixture.json,
// freezes the clock, asserts the measurable parts of the design, and writes comparison
// screenshots next to the golden images so a human can check them side by side.
//
// Every selector here uses data-part attributes. Add them in the views; do not change this file
// to fit the implementation. If an assertion is wrong, say why in the PR instead.
import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('docs/proposals/graph-reference/compare');
fs.mkdirSync(OUT, { recursive: true });

async function signIn(page) {
  await page.clock.install({ time: new Date('2026-09-22T09:00:00+10:00') });
  await page.goto('/#/board');
  const pass = page.getByLabel('Passphrase');
  if (await pass.isVisible().catch(() => false)) {
    await pass.fill('tasks-hub-local');
    await page.getByRole('button', { name: /sign in/i }).click();
  }
  await expect(page.locator('.page-header')).toBeVisible({ timeout: 20_000 });
  // TODO(Cursor): seed fixture.json here through the same path the other browser specs use for fixtures.
}
async function open(page, hash) {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await expect(page.locator('.graph-page')).toBeVisible({ timeout: 20_000 });
  await page.clock.runFor(2600); // let entrance motion finish
}
const css = (loc, prop) => loc.evaluate((el, p) => getComputedStyle(el).getPropertyValue(p).trim(), prop);
const attr = (loc, a) => loc.getAttribute(a);
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`; };

test.describe('Lines', () => {
  test('matches the reference geometry and type', async ({ page }) => {
    await signIn(page);
    await open(page, '#/graph');
    const tom = page.locator('[data-part="line"][data-project-id="p-tom"]');
    await expect(tom).toBeVisible();

    // Track: 7px, round caps, travelled part faded to 0.32, ahead part full
    const ahead = tom.locator('[data-part="track-ahead"]');
    const travelled = tom.locator('[data-part="track-travelled"]');
    expect(Number(await css(ahead, 'stroke-width').then(parseFloat))).toBe(7);
    expect(await css(ahead, 'stroke-linecap')).toBe('round');
    expect(Number(await css(travelled, 'opacity'))).toBeCloseTo(0.32, 2);
    expect(await css(ahead, 'stroke')).toBe(rgb('#376fb7'));

    // Every station has a visible title (13px/500) and status (12px)
    const stations = tom.locator('[data-part="station"]');
    const n = await stations.count();
    expect(n).toBeGreaterThanOrEqual(6);
    for (let i = 0; i < n; i++) {
      const t = stations.nth(i).locator('[data-part="station-title"]');
      const s = stations.nth(i).locator('[data-part="station-sub"]');
      await expect(t).toBeVisible();
      await expect(s).toBeVisible();
      expect(await css(t, 'font-size')).toBe('13px');
      expect(await css(t, 'font-weight')).toBe('500');
      expect(await css(s, 'font-size')).toBe('12px');
    }

    // Done stations: filled with the LINE colour, white halo 2.5
    const done = tom.locator('[data-part="station"][data-state="done"] [data-part="station-mark"]').first();
    expect(await css(done, 'fill')).toBe(rgb('#376fb7'));
    expect(await css(done, 'stroke')).toBe('rgb(255, 255, 255)');
    expect(parseFloat(await attr(done, 'r'))).toBe(8);

    // Current station: r 11, stroke 4.5 in line colour; breathing ring r 18 pivots on itself
    const cur = tom.locator('[data-part="station"][data-state="current"]');
    expect(parseFloat(await attr(cur.locator('[data-part="station-mark"]'), 'r'))).toBe(11);
    const ring = cur.locator('[data-part="here-ring"]');
    expect(parseFloat(await attr(ring, 'r'))).toBe(18);
    expect(await css(ring, 'transform-box')).toBe('fill-box');
    expect(await css(ring, 'transform-origin')).not.toBe('0px 0px');
    await expect(cur.locator('[data-part="station-sub"]')).toHaveText('you are here');

    // Blocked: vertical danger bar 7 × 30, rx 3.5, through the track
    const bar = tom.locator('[data-part="station"][data-state="blocked"] [data-part="barrier"]');
    expect(parseFloat(await attr(bar, 'width'))).toBe(7);
    expect(parseFloat(await attr(bar, 'height'))).toBe(30);

    // Ghost: dashed r 13 at a FRACTIONAL position between two stations, with a leader and 12px label
    const ghost = tom.locator('[data-part="ghost"]');
    await expect(ghost).toBeVisible();
    await expect(ghost.locator('text')).toHaveText('pace says be here by today');

    // Terminus: filled pill, height 30, rx 15, white 13px/600 text "Finals · 03/10/26"
    const term = tom.locator('[data-part="terminus"]');
    expect(parseFloat(await attr(term.locator('rect'), 'height'))).toBe(30);
    expect(parseFloat(await attr(term.locator('rect'), 'rx'))).toBe(15);
    await expect(term.locator('text')).toHaveText('Finals · 03/10/26');

    // Branch: child tasks of Permission notes drawn as a branch line with its own stations
    const branch = tom.locator('[data-part="branch"]');
    await expect(branch).toBeVisible();
    await expect(branch.locator('[data-part="station"]')).toHaveCount(2);

    // Service board: tinted pills with dot + bold name
    const pill = page.locator('[data-part="service-pill"][data-status="minor_delays"]');
    await expect(pill).toContainText('Tournament of Minds');
    expect(await css(pill, 'height')).toBe('30px');

    // Clare alert: tinted card with avatar, bold headline, primary and ghost buttons
    const alert = tom.locator('[data-part="clare-alert"]');
    await expect(alert.getByRole('button')).toHaveCount(2);

    // No SVG text in Lines below 12px
    const small = await page.locator('.graph-lines svg text').evaluateAll((els) =>
      els.filter((e) => parseFloat(getComputedStyle(e).fontSize) < 12).length);
    expect(small).toBe(0);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: path.join(OUT, 'lines-1280.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.runFor(2600);
    await expect(page.locator('[data-part="line"][data-orientation="vertical"]').first()).toBeVisible();
    await page.screenshot({ path: path.join(OUT, 'lines-390.png'), fullPage: true });
  });

  test('entrance draws the track and pops stations', async ({ page }) => {
    await signIn(page);
    await page.evaluate(() => { location.hash = '#/graph'; });
    await page.clock.runFor(120);
    const ahead = page.locator('[data-part="line"] [data-part="track-ahead"]').first();
    const offset = await css(ahead, 'stroke-dashoffset');
    expect(parseFloat(offset)).toBeGreaterThan(0); // still drawing
    await page.clock.runFor(2600);
    expect(await css(ahead, 'stroke-dasharray')).toMatch(/none|^$/);
  });
});

test.describe('Branch', () => {
  test('matches the reference flowchart', async ({ page }) => {
    await signIn(page);
    await open(page, '#/graph?view=branch');
    const box = page.locator('[data-part="box"][data-task-id="t4"]');
    await expect(box).toBeVisible();
    expect(parseFloat(await attr(box.locator('[data-part="box-face"]'), 'width'))).toBe(164);
    expect(parseFloat(await attr(box.locator('[data-part="box-face"]'), 'height'))).toBe(64);
    expect(parseFloat(await attr(box.locator('[data-part="box-face"]'), 'rx'))).toBe(12);
    expect(await css(box.locator('[data-part="box-title"]'), 'font-size')).toBe('14px');
    expect(await css(box.locator('[data-part="box-title"]'), 'font-weight')).toBe('600');
    expect(await css(box.locator('[data-part="box-sub"]'), 'font-size')).toBe('12px');
    // status stripe is an inset rounded pill, not a single-sided border
    const stripe = box.locator('[data-part="box-stripe"]');
    expect(parseFloat(await attr(stripe, 'width'))).toBe(4);
    expect(parseFloat(await attr(stripe, 'rx'))).toBe(2);

    const risk = page.locator('[data-part="edge"][data-kind="critical-risk"]').first();
    expect(await css(risk, 'stroke')).toBe(rgb('#a85a0c'));
    expect(parseFloat(await css(risk, 'stroke-width'))).toBe(3);
    const normal = page.locator('[data-part="edge"][data-kind="normal"]').first();
    expect(await css(normal, 'stroke')).toBe(rgb('#a7abb9'));
    const suggested = page.locator('[data-part="edge"][data-kind="suggested"]').first();
    expect(await css(suggested, 'stroke-dasharray')).not.toBe('none');

    await expect(page.locator('[data-part="do-first"]').first()).toContainText(/Do first · frees \d/);
    await expect(page.locator('[data-part="clare-chip"]').first()).toHaveText('Clare: link?');
    // milestones are pills (rx 32) with a diamond glyph
    const ms = page.locator('[data-part="box"][data-state="milestone"] [data-part="box-face"]').first();
    expect(parseFloat(await attr(ms, 'rx'))).toBe(32);
    // Every connector is orthogonal: only H/V/Q commands after the first M
    const ds = await page.locator('[data-part="edge"]').evaluateAll((els) => els.map((e) => e.getAttribute('d')));
    for (const d of ds) expect(d).toMatch(/^M[\d.\s-]+([HVQ][\d.\s-]+)+$/);
    // Minimap only when content overflows
    await expect(page.locator('[data-part="minimap"]')).toHaveCount(0);

    await page.screenshot({ path: path.join(OUT, 'branch-1280.png'), fullPage: true });
    await page.locator('[data-part="box"][data-task-id="t5b"]').click();
    await page.clock.runFor(400);
    expect(await page.locator('[data-part="box"].is-dim, [data-part="box"][data-dim="true"]').count()).toBeGreaterThan(0);
    await expect(page.locator('[data-part="edge"][data-kind="traced"]').first()).toBeVisible();
    await page.screenshot({ path: path.join(OUT, 'branch-trace-1280.png'), fullPage: true });
  });
});

test.describe('Orbit', () => {
  test('matches the reference and pauses properly', async ({ page }) => {
    await signIn(page);
    await open(page, '#/graph?view=orbit');
    const bodies = page.locator('[data-part="orbit-body"]');
    expect(await bodies.count()).toBeGreaterThanOrEqual(12);
    const b0 = bodies.first();
    expect(await css(b0, 'stroke')).toBe('rgb(255, 255, 255)');
    expect(parseFloat(await css(b0, 'stroke-width'))).toBe(2);
    const lbl = page.locator('[data-part="ring-label"]').first();
    expect(await css(lbl, 'text-transform')).toBe('uppercase');
    expect(await css(lbl, 'font-weight')).toBe('600');
    await expect(page.locator('[data-part="ring-label"]')).toHaveText(['1 week', '2 weeks', '1 month', 'Later'], { ignoreCase: true });
    await expect(page.locator('[data-part="load-row"]')).toHaveCount(4);
    await expect(page.locator('[data-part="clare-note"]').first()).toContainText('Collision on');
    await expect(page.locator('[data-part="collision-arc"]')).toBeVisible();

    // Overdue bodies sit inside the core and are fully danger-coloured
    const overdue = page.locator('[data-part="orbit-body"][data-task-id="o10"]');
    expect(await css(overdue, 'fill')).toBe(rgb('#9b2c2c'));

    // Spread: start angles cover at least three quadrants
    const quads = await bodies.evaluateAll((els) => new Set(els.map((e) => {
      const svg = e.ownerSVGElement.viewBox.baseVal; const cx = svg.width / 2, cy = svg.height / 2;
      const x = +e.getAttribute('cx') - cx, y = +e.getAttribute('cy') - cy; return (x >= 0 ? 1 : 0) + (y >= 0 ? 2 : 0);
    })).size);
    expect(quads).toBeGreaterThanOrEqual(3);

    // Pause: positions freeze
    const pos = () => b0.evaluate((e) => `${e.getAttribute('cx')},${e.getAttribute('cy')}`);
    await page.getByRole('button', { name: /pause/i }).click();
    await page.clock.runFor(300);
    const p1 = await pos(); await page.clock.runFor(800); expect(await pos()).toBe(p1);
    await page.keyboard.press('Space');
    await page.clock.runFor(800); expect(await pos()).not.toBe(p1);
    // Hover freezes too
    await b0.hover(); await page.clock.runFor(300);
    const p2 = await pos(); await page.clock.runFor(800); expect(await pos()).toBe(p2);

    await page.mouse.move(0, 0);
    await page.screenshot({ path: path.join(OUT, 'orbit-1280.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.runFor(1000);
    await page.screenshot({ path: path.join(OUT, 'orbit-390.png'), fullPage: true });
  });
});
