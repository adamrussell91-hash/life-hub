/**
 * The brief's last two visuals: the Rescue morph, and Dexy context on the Almanac
 * (lighter, not lower).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { captureChips, morphPairs, playArcs, playChips } from '../../packages/design-kit/js/calendar/rescue-morph.js';
import { medicationContext } from '../../packages/design-kit/js/calendar/medication-model.js';
import { buildAlmanac } from '../../netlify/functions/almanac.mjs';

const QUEUED = [
  { id: 'rescue-a', kind: 'move_block', blockId: 'wb-1', date: '2026-09-29', start: '17:00', end: '18:00' },
  { id: 'rescue-b', kind: 'protect_block', date: '2026-09-29', start: '19:00', end: '19:45' }
];

function stage({ reduced = false } = {}) {
  const window = new Window();
  window.matchMedia = (query) => ({ matches: reduced && query.includes('reduce') });
  const doc = window.document;
  doc.body.innerHTML = '<div id="h"><div class="cal-chip" data-id="wb-1"></div><div class="cal-chip is-ghost" data-id="rescue-a"></div><div class="cal-chip is-ghost" data-id="rescue-b"></div></div>';
  const calls = [];
  for (const node of doc.querySelectorAll('.cal-chip')) {
    const top = node.getAttribute('data-id') === 'wb-1' ? 100 : 300;
    node.getBoundingClientRect = () => ({ left: 10, top, width: 120, height: 40 });
    node.animate = (frames, options) => { calls.push({ id: node.getAttribute('data-id'), frames, options }); return {}; };
  }
  return { window, host: doc.getElementById('h'), calls };
}

test('morph: each proposal glides from its block; new protected time fades in; the original dims', () => {
  const pairs = morphPairs(QUEUED);
  assert.deepEqual(pairs.map((p) => [p.from, p.to]), [['wb-1', 'rescue-a'], [null, 'rescue-b']]);
  const { window, host, calls } = stage();
  const rects = captureChips(host, pairs);
  assert.deepEqual(rects.get('wb-1'), { left: 10, top: 100, width: 120, height: 40 });
  const played = playChips(host, pairs, rects, { view: window });
  assert.deepEqual(played, ['rescue-a', 'rescue-b']);
  assert.equal(calls[0].frames[0].transform, 'translate(0px, -200px) scaleY(1)', 'starts where the block was');
  assert.equal(calls[0].frames[1].transform, 'none');
  assert.equal(calls[1].options.delay, 70, 'staggered');
  assert.equal(calls[1].frames[0].opacity, 0, 'new time fades in');
  assert.ok(host.querySelector('[data-id="wb-1"]').classList.contains('is-moving-out'));
  window.close();
});

test('morph: reduced motion is instant, with the same end state', () => {
  const pairs = morphPairs(QUEUED);
  const { window, host, calls } = stage({ reduced: true });
  const played = playChips(host, pairs, captureChips(host, pairs), { view: window });
  assert.deepEqual(played, []);
  assert.equal(calls.length, 0);
  assert.ok(host.querySelector('[data-id="wb-1"]').classList.contains('is-moving-out'));
  assert.ok(host.querySelector('[data-id="rescue-a"]').classList.contains('is-morphing'));
  window.close();
});

test('dial morph: the arc turns from 1 pm to 5 pm (60°) about the centre', () => {
  const window = new Window();
  window.matchMedia = () => ({ matches: false });
  const doc = window.document;
  doc.body.innerHTML = '<svg><path data-id="wb-1"></path><path data-id="rescue-a"></path></svg>';
  const svg = doc.querySelector('svg');
  const calls = [];
  for (const node of svg.querySelectorAll('path')) node.animate = (frames) => { calls.push(frames); return {}; };
  const hours = { 'wb-1': 13, 'rescue-a': 17 };
  playArcs(svg, morphPairs(QUEUED.slice(0, 1)), { cx: 200, cy: 210, hourOf: (id) => hours[id] ?? null, view: window });
  assert.equal(calls[0][0].transform, 'rotate(-60deg)');
  assert.equal(svg.querySelector('[data-id="rescue-a"]').style.transformOrigin, '200px 210px');
  window.close();
});

const dose = (date, status, slot = 'am') => ({ type: 'medication', date, status, slot, ...(status === 'taken' ? { time: '07:45' } : {}) });

test('Dexy context: skipped is counted, unlogged is not missed; the day after a skip is lighter', () => {
  const logs = [dose('2026-09-20', 'taken'), dose('2026-09-24', 'skipped'), dose('2026-09-28', 'skipped'), dose('2026-09-29', 'taken')];
  const ctx = medicationContext(logs, { today: '2026-09-29', from: '2026-09-29', to: '2026-12-31' });
  assert.equal(ctx.taken, 2);
  assert.equal(ctx.skipped, 2);
  assert.equal(ctx.unlogged, 10);
  assert.equal(ctx.summary, 'Dexy: taken 2 of the last 14 days · 2 skipped · 10 not logged');
  assert.deepEqual(ctx.lighter, ['2026-09-29'], 'only days in view: the day after Monday’s skip');
});

test('Almanac: medication context rides the view; the forecast numbers are unchanged', () => {
  const base = { today: '2026-09-29', from: '2026-09-29', to: '2026-10-05', anchors: [] };
  const plain = buildAlmanac(base);
  const withDex = buildAlmanac({ ...base, medicationLogs: [dose('2026-09-28', 'skipped')] });
  assert.equal(plain.medication, undefined);
  assert.deepEqual(withDex.medication.lighter, ['2026-09-29']);
  assert.deepEqual(withDex.series.map((p) => p.pct), plain.series.map((p) => p.pct), 'lighter, not lower');
});
