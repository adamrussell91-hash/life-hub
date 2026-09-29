/**
 * Dexamphetamine timing: record type, usual times from logs, day status, prompt,
 * missed-dose evening plan, and one-tap logging from the Day dial.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { validateRecord } from '../../apps/life/js/core/validate.js';
import { validateLogEntry, buildRecordSlug, buildCanonicalPath } from '../../netlify/functions/_shared/chat-schema.mjs';
import { describeRecordForLog } from '../../netlify/functions/_shared/persist-log.mjs';
import {
  doseCandidate,
  medicationDay,
  usualDoseTimes
} from '../../packages/design-kit/js/calendar/medication-model.js';
import { buildTidelineModel } from '../../packages/design-kit/js/calendar/tideline-model.js';
import { renderDayDial, unmountDayDial } from '../../packages/design-kit/js/calendar/render-day-dial.js';

for (const g of [globalThis, global]) {
  g.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
  g.cancelAnimationFrame = (id) => clearTimeout(id);
}

const TODAY = '2026-09-29';
const log = (date, time, slot, status = 'taken') => ({
  type: 'medication', id: `m-${date}-${slot}`, date, ...(time ? { time } : {}), medication: 'Dexamphetamine', status, slot
});
const HISTORY = [
  log('2026-09-22', '07:40', 'am'), log('2026-09-22', '16:00', 'pm'),
  log('2026-09-23', '07:30', 'am'), log('2026-09-23', '16:10', 'pm'),
  log('2026-09-24', '07:50', 'am'), log('2026-09-24', '15:50', 'pm')
];

test('a dose is a valid Life record and saves through the confirm path', () => {
  const candidate = doseCandidate({ date: TODAY, status: 'taken', time: '07:45', slot: 'am' });
  const validated = validateLogEntry(candidate, { id: 'medication-x', now: '2026-09-29T07:46:00+10:00' });
  assert.equal(validated.valid, true, JSON.stringify(validated.errors));
  assert.deepEqual(validateRecord(validated.record), []);
  assert.equal(buildRecordSlug(validated.record), 'dex-am-0745');
  assert.equal(buildCanonicalPath({ type: 'medication', date: TODAY, slug: 'dex-am-0745' }), 'data/body/2026/09/2026-09-29-dex-am-0745.md');
  assert.match(describeRecordForLog(validated.record, ''), /morning dose taken at 07:45/);

  const skipped = validateLogEntry(doseCandidate({ date: TODAY, status: 'skipped', slot: 'pm' }), { id: 'm2', now: '2026-09-29T16:40:00+10:00' });
  assert.equal(skipped.valid, true);
  assert.equal(buildRecordSlug(skipped.record), 'dex-pm-skipped');
  assert.match(describeRecordForLog(skipped.record, ''), /afternoon dose skipped/);
  const { time: _time, ...untimed } = skipped.record;
  assert.ok(validateRecord({ ...untimed, status: 'taken' }).includes('time is required when status is taken'));
});

test('usual times are learned from at least two logs, never guessed', () => {
  assert.deepEqual(usualDoseTimes(HISTORY, TODAY), { am: 7 + 40 / 60, pm: 16 });
  assert.deepEqual(usualDoseTimes(HISTORY.slice(0, 1), TODAY), {}, 'one log is not a pattern');
});

test('today: prompt 30 min after the usual time; unknown after 90; skipped/late plan the evening', () => {
  const usual = usualDoseTimes(HISTORY, TODAY);
  const logs = [...HISTORY, log(TODAY, '07:45', 'am')];

  const at1615 = medicationDay({ date: TODAY, today: TODAY, nowHour: 16.25, logs, usual });
  assert.equal(at1615.prompt, null, 'not yet: only 15 min past');
  assert.equal(at1615.doses.find((d) => d.slot === 'pm').status, 'due');

  const at1640 = medicationDay({ date: TODAY, today: TODAY, nowHour: 16 + 40 / 60, logs, usual });
  assert.deepEqual(at1640.prompt, { slot: 'pm', usual: 16 });
  assert.equal(at1640.evening, null, 'no plan while it is still just due');

  const at1745 = medicationDay({ date: TODAY, today: TODAY, nowHour: 17.75, logs, usual });
  assert.equal(at1745.doses.find((d) => d.slot === 'pm').status, 'unknown', 'missing log is unknown, not skipped');
  assert.equal(at1745.evening.reason, 'unknown');
  assert.deepEqual(at1745.evening.rows.map((row) => row.title), ['Dinner, planned', 'Evening snack, planned']);
  assert.match(at1745.summary, /PM not logged/);

  const skipped = medicationDay({ date: TODAY, today: TODAY, nowHour: 16.6, logs: [...logs, log(TODAY, null, 'pm', 'skipped')], usual });
  assert.equal(skipped.prompt, null);
  assert.equal(skipped.evening.reason, 'skipped');

  const late = medicationDay({ date: TODAY, today: TODAY, nowHour: 18, logs: [...logs, log(TODAY, '17:30', 'pm')], usual });
  assert.equal(late.doses.find((d) => d.slot === 'pm').late, true);
  assert.equal(late.evening.reason, 'late');
  assert.deepEqual(late.doses.find((d) => d.slot === 'pm').window, [18, 21.5]);

  const noPattern = medicationDay({ date: TODAY, today: TODAY, nowHour: 18, logs: [], usual: {} });
  assert.deepEqual([noPattern.doses, noPattern.prompt, noPattern.evening], [[], null, null], 'no history: say nothing');
});

test('dose logs never become calendar chips; days carry a med status', () => {
  const events = [...HISTORY, log(TODAY, '07:45', 'am')].map((record) => ({ record }));
  const model = buildTidelineModel({ events, week: ['2026-09-28', TODAY, '2026-09-30'], today: TODAY, nowHour: 17.75 });
  assert.equal(model.days.flatMap((day) => day.chips).length, 0);
  const today = model.days.find((day) => day.date === TODAY);
  assert.match(today.med.summary, /AM 7:45 am · PM not logged/);
  assert.equal(model.days.find((day) => day.date === '2026-09-30').med, null, 'future days say nothing');
});

test('Day dial: dose band drawn, prompt shown, Taken now posts a medication record as Sara', async () => {
  const window = new Window({ url: 'https://life-hub.adam-russell.com/#/calendar/day' });
  window.requestAnimationFrame = undefined;
  const doc = window.document;
  const host = doc.createElement('div');
  doc.body.append(host);
  const calls = [];
  const events = [...HISTORY, log(TODAY, '07:45', 'am')].map((record) => ({ record }));
  renderDayDial(doc, host, {
    hub: 'life',
    events,
    ghosts: [],
    week: ['2026-09-28', TODAY, '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'],
    today: TODAY,
    selectedDate: TODAY,
    nowHour: 16 + 40 / 60,
    now: new Date('2026-09-29T06:40:00Z'),
    apiFetch: async (path, init) => {
      calls.push([path, JSON.parse(init.body)]);
      return new window.Response(JSON.stringify({ ok: true, data: {} }), { status: 200 });
    },
    onSourcesChanged: () => {},
    onSwitchView: () => {},
    onSelectDate: () => {}
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.ok(host.querySelector('[data-part="med-ring"] .dd-med'), 'morning dose band drawn');
  const panel = host.querySelector('[data-part="medication"]');
  assert.ok(panel?.classList.contains('is-prompt'), 'afternoon prompt showing');
  assert.match(panel.textContent, /usually take it around 4 pm/);
  panel.querySelector('[data-med-act="taken"]').click();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/api/chat/confirm');
  assert.equal(calls[0][1].slug, 'sara');
  assert.deepEqual(calls[0][1].candidate.fields, { medication: 'Dexamphetamine', status: 'taken', slot: 'pm' });
  assert.match(calls[0][1].candidate.time, /^\d{2}:\d{2}$/);
  unmountDayDial();
});
