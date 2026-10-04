/**
 * Clare brain-dump tasks land on the Week Due row but were invisible on Day Dial.
 * Untimed / deadline-only tasks are not dial arcs — they must still appear in Tonight.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { tonight } from '../../packages/design-kit/js/calendar/day-brief.js';
import { buildTidelineModel } from '../../packages/design-kit/js/calendar/tideline-model.js';
import { tasksEventsFromTasks } from '../../packages/design-kit/js/calendar/tasks-calendar.js';
import { renderDayDial, unmountDayDial } from '../../packages/design-kit/js/calendar/render-day-dial.js';
import { renderTideline } from '../../packages/design-kit/js/calendar/render-tideline.js';

const TODAY = '2026-10-04';
const WEEK = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];

for (const g of [globalThis, global]) {
  g.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  g.cancelAnimationFrame = (id) => clearTimeout(id);
}

/** Clare dump shape: due today, no clock, no work block. */
const DUMP = [
  { id: 'dump-emails', title: 'Reply to parent emails', due_date: TODAY, status: 'open' },
  { id: 'dump-pack', title: 'Pack swim bag', due_date: TODAY, status: 'open', due_time: '17:00' }
];

test('feedback loop: Week Due shows Clare dump tasks; Day Dial Tonight must too', async () => {
  const events = tasksEventsFromTasks(DUMP);
  const model = buildTidelineModel({ events, week: WEEK, today: TODAY, nowHour: 14.3 });
  const day = model.days.find((row) => row.date === TODAY);
  assert.deepEqual(day.due.map((row) => row.id), ['dump-emails', 'dump-pack']);
  assert.equal(day.chips.filter((chip) => chip.source === 'task').length, 0, 'tasks without end_time are never dial arcs');

  const weekWin = new Window({ url: 'https://life-hub.adam-russell.com/#/calendar/week' });
  weekWin.requestAnimationFrame = undefined;
  const weekHost = weekWin.document.createElement('div');
  weekWin.document.body.append(weekHost);
  renderTideline(weekWin.document, weekHost, {
    hub: 'life', events, ghosts: [], week: WEEK, today: TODAY, selectedDate: TODAY, nowHour: 14.3,
    onSourcesChanged: () => {}, onSwitchView: () => {}, onSelectDate: () => {}
  });
  await new Promise((r) => setTimeout(r, 40));
  assert.ok(weekHost.querySelector('[data-part="due"][data-id="dump-emails"]'));
  assert.ok(weekHost.querySelector('[data-part="due"][data-id="dump-pack"]'));
  weekWin.close();

  // Pure brief: Tonight must name today's dues (same contract as Tomorrow).
  const brief = tonight({
    date: TODAY,
    now: 14.3,
    chips: [],
    due: day.due.filter((item) => item.kind !== 'allday').map((item) => ({
      id: item.id,
      title: item.title,
      time: item.time,
      meta: item.meta
    })),
    ghosts: [],
    logs: []
  });
  assert.ok(brief.rows.some((row) => row.title === 'Reply to parent emails' && row.time === 'Due'));
  assert.ok(brief.rows.some((row) => row.title === 'Pack swim bag' && row.time === 'Due'));

  // Mounted Day Dial: Tonight panel must show the same dump tasks Week listed.
  const dialWin = new Window({ url: 'https://life-hub.adam-russell.com/#/calendar/day' });
  dialWin.requestAnimationFrame = undefined;
  const dialHost = dialWin.document.createElement('div');
  dialWin.document.body.append(dialHost);
  renderDayDial(dialWin.document, dialHost, {
    hub: 'life', events, ghosts: [], week: WEEK, today: TODAY, selectedDate: TODAY, nowHour: 14.3,
    now: new Date('2026-10-04T03:18:00Z'),
    apiFetch: async () => new dialWin.Response(JSON.stringify({ ok: true, data: {} })),
    onSourcesChanged: () => {}, onSwitchView: () => {}, onSelectDate: () => {}
  });
  await new Promise((r) => setTimeout(r, 60));
  const tonightPanel = dialHost.querySelector('[data-part="tonight"]');
  assert.ok(tonightPanel, 'Tonight panel mounts on today');
  assert.match(tonightPanel.textContent, /Reply to parent emails/);
  assert.match(tonightPanel.textContent, /Pack swim bag/);
  assert.ok(tonightPanel.querySelector('[data-row-item="dump-emails"]'));
  assert.ok(tonightPanel.querySelector('[data-row-item="dump-pack"]'));
  unmountDayDial();
  dialWin.close();
});
