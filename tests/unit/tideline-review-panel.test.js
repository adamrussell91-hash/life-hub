/**
 * Hammond Review must open the pending-changes panel — never a silent no-op.
 * openPop used to throw on bad acceptPlan or miss due-only ghosts.
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

// Bare identifiers in hub-motion-engine.js — assign on every global object Node may use.
for (const g of [globalThis, global]) {
  g.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  g.cancelAnimationFrame = (id) => clearTimeout(id);
}

const PROTECT = {
  id: 'g-protect',
  agent: 'hammond',
  kind: 'protect_block',
  label: 'Protect marking block',
  meta: 'Tue 16:00–18:00 · clears a collision',
  date: TODAY,
  start: '16:00',
  end: '18:00',
  title: 'Protect marking block',
  chip: {
    id: 'g-protect',
    title: 'Protect marking block',
    date: TODAY,
    start: '16:00',
    end: '18:00',
    kind: 'task',
    meta: 'Hammond · proposal'
  }
};

/** Invalid kind — old openPop threw on acceptPlan and Review looked like a no-op. */
const BROKEN = {
  id: 'g-broken',
  agent: 'hammond',
  kind: 'calendar_block',
  label: 'Broken proposal',
  meta: 'should still list',
  date: TODAY,
  chip: {
    id: 'g-broken',
    title: 'Broken proposal',
    date: TODAY,
    start: '10:00',
    end: '11:00',
    kind: 'task',
    meta: 'Hammond · proposal'
  }
};

function mount(ghosts) {
  const window = new Window({ url: 'https://tasks.example/' });
  // Force tideline's clockFor() onto the sync test clock (no browser raf).
  window.requestAnimationFrame = undefined;
  const doc = window.document;
  const host = doc.createElement('div');
  doc.body.append(host);
  renderTideline(doc, host, {
    hub: 'tasks',
    events: [],
    ghosts,
    week: WEEK,
    today: TODAY,
    nowHour: 12,
    apiFetch: async () =>
      new window.Response(JSON.stringify({ ok: true, receipt: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      }),
    routeFor: () => null,
    onSwitchView: () => {},
    onShiftRange: () => {},
    onSelectDate: () => {}
  });
  return { window, host, doc };
}

test('Review opens Waiting for review panel with pending changes', () => {
  const { host } = mount([PROTECT]);
  const reviewBtn = host.querySelector('[data-action="review"]');
  assert.ok(reviewBtn, 'Review button present');
  reviewBtn.click();
  const panel = host.querySelector('[data-part="review-panel"]');
  assert.ok(panel, 'review panel exists');
  assert.equal(panel.hasAttribute('hidden'), false);
  assert.equal(panel.hidden, false);
  assert.match(panel.textContent, /Waiting for review/);
  assert.match(panel.textContent, /Protect marking block/);
  assert.ok(panel.querySelector(`[data-accept="${PROTECT.id}"]`));
});

test('Review still lists a ghost when acceptPlan would throw', () => {
  const { host } = mount([BROKEN]);
  host.querySelector('[data-action="review"]').click();
  const panel = host.querySelector('[data-part="review-panel"]');
  assert.equal(panel.hasAttribute('hidden'), false);
  assert.match(panel.textContent, /Broken proposal/);
  assert.ok(panel.querySelector(`[data-accept="${BROKEN.id}"]`));
});

test('Review lists filter-hidden ghosts so the tray count is never a dead end', () => {
  const professional = {
    ...PROTECT,
    id: 'g-pro',
    label: 'Protect PD block',
    chip: { ...PROTECT.chip, id: 'g-pro', kind: 'professional' }
  };
  const { host } = mount([professional]);
  // Tasks hub filter keeps professional off — Apply says “0 · 1 hidden”.
  assert.match(host.querySelector('[data-part="apply-all"]')?.textContent || '', /hidden/);
  host.querySelector('[data-action="review"]').click();
  const panel = host.querySelector('[data-part="review-panel"]');
  assert.equal(panel.hasAttribute('hidden'), false);
  assert.match(panel.textContent, /Protect PD block/);
});

test('tideline CSS hides the review panel when [hidden]', () => {
  const css = readFileSync(join(rootDir, 'packages/design-kit/calendar-tideline.css'), 'utf8');
  assert.match(css, /\.cal-review\[hidden\]\s*\{\s*display:\s*none/);
});
