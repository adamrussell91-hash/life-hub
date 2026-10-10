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

function mount(ghosts, { hub = 'tasks', phone = false } = {}) {
  const window = new Window({ url: 'https://tasks.example/' });
  globalThis.sessionStorage = window.sessionStorage;
  // Force tideline's clockFor() onto the sync test clock (no browser raf).
  window.requestAnimationFrame = undefined;
  if (phone) window.matchMedia = (query) => ({ matches: query === '(max-width: 719px)', addEventListener() {}, removeEventListener() {} });
  const doc = window.document;
  const requests = [];
  const host = doc.createElement('div');
  doc.body.append(host);
  renderTideline(doc, host, {
    hub,
    events: [],
    ghosts,
    week: WEEK,
    today: TODAY,
    nowHour: 12,
    apiFetch: async (...args) => {
      requests.push(args);
      return new window.Response(JSON.stringify({ ok: true, receipt: 'ok' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    },
    routeFor: () => null,
    onSwitchView: () => {},
    onShiftRange: () => {},
    onSelectDate: () => {}
  });
  return { window, host, doc, requests };
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

for (const phone of [false, true]) {
  test('Show on calendar reveals a filtered Clare proposal' + (phone ? ' on its phone day' : ''), () => {
    const clare = {
      ...PROTECT, id: 'g-clare', agent: 'clare', label: 'Prepare Term 4 resources',
      date: '2026-09-23',
      chip: { ...PROTECT.chip, id: 'g-clare', title: 'Prepare Term 4 resources', date: '2026-09-23' }
    };
    const { host, requests } = mount([clare], { hub: 'teaching', phone });
    assert.equal(host.querySelector('[data-filter="tasks"]').getAttribute('aria-pressed'), 'false');
    host.querySelector('[data-action="review"]').click();
    host.querySelector('[data-action="reveal-ghost"]').click();
    assert.equal(host.querySelector('[data-part="review-panel"]').hidden, true);
    assert.equal(host.querySelector('[data-filter="tasks"]').getAttribute('aria-pressed'), 'true');
    assert.equal(host.querySelector('[data-filter="fitness"]').getAttribute('aria-pressed'), 'false');
    const chip = host.querySelector('[data-id="g-clare"]');
    assert.ok(chip, 'proposal is painted on its date');
    assert.equal(chip.hidden, false);
    assert.equal(chip.classList.contains('is-filter-hidden'), false);
    const pop = host.querySelector('[data-part="chip-popover"]');
    assert.equal(pop.hidden, false);
    assert.match(pop.textContent, /Prepare Term 4 resources/);
    assert.ok(pop.querySelector('[data-accept="g-clare"]'));
    assert.equal(requests.length, 0, 'preview never sends an accept decision');
    if (phone) assert.equal(host.querySelector('[data-day="2026-09-23"]').getAttribute('aria-pressed'), 'true');
  });
}
