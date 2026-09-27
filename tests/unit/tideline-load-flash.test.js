/**
 * Tideline must not replay column entrance (opacity flash) on data refresh.
 * Shell stays for the same host; unchanged inputs are a no-op.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Window } from 'happy-dom';
import { renderTideline } from '../../packages/design-kit/js/calendar/render-tideline.js';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '../..');
const TODAY = '2026-09-26';
const WEEK = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27'];

for (const g of [globalThis, global]) {
  g.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  g.cancelAnimationFrame = (id) => clearTimeout(id);
}

test('source: Tideline skips entrance replay and identical re-paints', () => {
  const src = readFileSync(join(rootDir, 'packages/design-kit/js/calendar/render-tideline.js'), 'utf8');
  assert.match(src, /function paintKey/);
  assert.match(src, /mount\(\{\s*entrance:\s*false\s*\}\)/);
  assert.match(src, /if \(key === lastPaintKey\) return/);
  assert.match(src, /entranceGuardUntil/);
});

test('source: mount-hub-calendar paints immediately, then settles on a budget', () => {
  const src = readFileSync(join(rootDir, 'packages/design-kit/js/calendar/mount-hub-calendar.js'), 'utf8');
  assert.match(src, /let ready = false/);
  assert.match(src, /if \(!destroyed && ready\) schedulePaint/);
  assert.match(src, /ready = true/);
  assert.match(src, /FIRST_PAINT_MS/);
  assert.match(src, /paintLoading/);
  // Immediate first paint — do not await loadAll before schedulePaint.
  const boot = src.slice(src.indexOf('paintLoading();'));
  const firstReady = boot.indexOf('ready = true');
  const firstSchedule = boot.indexOf('schedulePaint();');
  const firstAwaitAll = boot.indexOf('await raceMs(all, FIRST_PAINT_MS)');
  assert.ok(firstReady >= 0 && firstSchedule >= 0 && firstAwaitAll >= 0);
  assert.ok(firstReady < firstAwaitAll, 'ready before loadAll budget');
  assert.ok(firstSchedule < firstAwaitAll, 'schedulePaint before loadAll budget');
});

test('source: Life calendar does not hold first paint for refresh+ghosts', () => {
  const src = readFileSync(join(rootDir, 'apps/life/js/app/app-controller.js'), 'utf8');
  assert.match(src, /paintCalendarLoadingIfEmpty/);
  assert.match(src, /Paint the grid immediately/);
  // First-open path must call renderCalendarSection before awaiting refresh.
  const cal = src.slice(src.indexOf("if (name === 'calendar')"));
  const block = cal.slice(0, cal.indexOf("if (name === 'body')"));
  assert.match(block, /paintCalendarLoadingIfEmpty\(\)/);
  assert.match(block, /renderCalendarSection\(\)/);
  assert.doesNotMatch(block, /holdCalendarPaint\s*=\s*true/);
  const firstRender = block.indexOf('renderCalendarSection()');
  const firstRefresh = block.indexOf('refresh({ force: true })');
  assert.ok(firstRender >= 0 && firstRefresh >= 0);
  assert.ok(firstRender < firstRefresh, 'paint before forced refresh');
});

test('identical re-render keeps the same tideline shell node', () => {
  const window = new Window({ url: 'https://tasks.example/' });
  window.requestAnimationFrame = undefined;
  const doc = window.document;
  const host = doc.createElement('div');
  doc.body.append(host);
  const input = {
    hub: 'tasks',
    events: [],
    ghosts: [],
    week: WEEK,
    today: TODAY,
    nowHour: 12,
    apiFetch: async () =>
      new window.Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }),
    routeFor: () => null,
    onSwitchView: () => {},
    onShiftRange: () => {},
    onSelectDate: () => {}
  };
  renderTideline(doc, host, input);
  const first = host.querySelector('[data-part="tideline"]');
  assert.ok(first, 'first mount paints tideline');
  renderTideline(doc, host, input);
  const second = host.querySelector('[data-part="tideline"]');
  assert.equal(second, first, 'unchanged inputs must not remount Tideline');
});
