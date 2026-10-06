/**
 * The readiness forecast is one number everywhere. The Day dial must show the same
 * caseback report (score, state, explanation, chart, window cards) whichever hub mounts it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { renderDayDial, unmountDayDial } from '../../packages/design-kit/js/calendar/render-day-dial.js';

const TODAY = '2026-10-04';
const WEEK = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];

for (const g of [globalThis, global]) {
  g.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  g.cancelAnimationFrame = (id) => clearTimeout(id);
}

const EVENTS = [
  { id: 'c1', title: 'Year 9 Maths', date: TODAY, start_time: '09:00', end_time: '10:00', record: { type: 'scheduled_lesson', id: 'c1', date: TODAY, start_time: '09:00', end_time: '10:00', title: 'Year 9 Maths' } },
  { id: 'm1', title: 'Staff meeting', date: TODAY, start_time: '15:00', end_time: '16:30', record: { type: 'meeting', id: 'm1', date: TODAY, start_time: '15:00', end_time: '16:30', title: 'Staff meeting' } }
];

async function caseback(hub, calls = []) {
  const win = new Window({ url: `https://${hub}-hub.adam-russell.com/#/calendar/day` });
  win.requestAnimationFrame = undefined;
  const host = win.document.createElement('div');
  win.document.body.append(host);
  renderDayDial(win.document, host, {
    hub, events: EVENTS, ghosts: [], week: WEEK, today: TODAY, selectedDate: TODAY, nowHour: 11.5,
    now: new Date('2026-10-04T00:30:00Z'),
    dayProfile: { wake: '06:30', sleep: '22:00' },
    apiFetch: async (path) => { calls.push(path); return new win.Response(JSON.stringify({ ok: true, data: {} })); },
    onSourcesChanged: () => {}, onSwitchView: () => {}, onSelectDate: () => {}
  });
  await new Promise((r) => setTimeout(r, 60));
  const cb = host.querySelector('.dd-cb');
  const out = {
    big: cb?.querySelector('.dd-cb__big')?.textContent,
    why: cb?.querySelector('.dd-cb__why')?.textContent,
    chart: Boolean(cb?.querySelector('svg')),
    cards: [...(cb?.querySelectorAll('.dd-cb__card') ?? [])].map((card) => card.textContent)
  };
  unmountDayDial();
  win.close();
  return out;
}

test('the caseback weather report is identical on Life and Tasks', async () => {
  // Tasks mounts first: trips are fetched once per session, by whichever hub gets there first.
  const calls = [];
  const tasks = await caseback('tasks', calls);
  const life = await caseback('life');
  assert.ok(calls.includes('/api/travel-trips'), 'Pilot GMT and Corey look up trips on Tasks, not only Life');
  assert.match(life.big, /\/100/, 'Life shows the full forecast');
  assert.ok(life.chart && life.cards.length > 0, 'Life shows the chart and window cards');
  assert.deepEqual(tasks, life);
});

test('every hub gets the full report, not the bare number', async () => {
  for (const hub of ['teaching', 'knowledge', 'professional']) {
    const row = await caseback(hub);
    assert.match(row.big, /\/100/, `${hub} caseback shows the forecast`);
    assert.ok(row.chart && row.cards.length > 0, `${hub} caseback shows the chart`);
  }
});
