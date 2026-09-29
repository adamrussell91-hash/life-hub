/**
 * Day Sense steps 8 and 10: runway time-blocking, availability textures, resumability,
 * duration ranges, fragility, dependencies, regained time.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { dependencyIndex, durationRange, fragility, hoursText, remainingByEstimate } from '../../packages/design-kit/js/calendar/duration-model.js';
import { freedSpansFor, interruptibleSpans, regainedCost, textureFor } from '../../packages/design-kit/js/calendar/day-sense-plan.js';
import { proposeDeadlineRunwayGhosts } from '../../netlify/functions/_shared/deadline-runway-ghosts.mjs';
import { acceptPlan } from '../../packages/design-kit/js/calendar/ghost-writes.js';
import { applyTaskStep } from '../../netlify/functions/calendar-ghosts.mjs';
import { buildTidelineModel } from '../../packages/design-kit/js/calendar/tideline-model.js';
import { tasksEventsFromTasks, tasksEventsFromWorkBlocks, tasksEventsFromWorkSessions } from '../../packages/design-kit/js/calendar/tasks-calendar.js';
import { eventsFromCalendarFeeds } from '../../packages/design-kit/js/calendar/ical-calendar.js';
import { itemPatchRequest } from '../../packages/design-kit/js/calendar/calendar-item-actions.js';
import { bindItemCard, itemCardHtml, itemCardPatch } from '../../packages/design-kit/js/calendar/calendar-item-card.js';
import { freedEntry } from '../../netlify/functions/calendar-freed.mjs';
import { coerceIdList, mergeTask } from '../../netlify/functions/tasks.mjs';
import { icalOccurrences } from '../../netlify/functions/_shared/ical.mjs';

const TODAY = '2026-09-29'; // Tue
const NOW = '2026-09-29T06:45:00+10:00';
const WEEK = ['2026-09-28', TODAY, '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];

// ---------- step 10: durations ----------

const SESSIONS = [
  { task_id: 'marking', time: '16:00', end_time: '16:40', result: 'worked', scripts_marked: 4 }, // 10 min/script
  { task_id: 'marking', time: '16:00', end_time: '16:48', result: 'worked', scripts_marked: 4 }, // 12
  { task_id: 'marking', time: '19:00', end_time: '20:00', result: 'worked', scripts_marked: 4 }, // 15
  { task_id: 'marking', time: '13:00', end_time: '14:00', result: 'blocked' } // Sentral down: not pace
];

test('range: clean sessions give a pace range; blocked time is reported, never pace; no estimate is unknown', () => {
  const task = { id: 'marking', estimated_duration: 280, progress: { done: 12, total: 28, unit: 'scripts' } };
  const range = durationRange(task, SESSIONS);
  assert.equal(range.kind, 'range');
  assert.equal(range.observations, 3);
  assert.equal(range.blocked, 60);
  assert.deepEqual([range.low, range.high], [175, 190], '16 scripts at 11 and 12 min each');
  assert.match(range.text, /^about 3 h left \(3 tracked sessions\)$/);
  const early = durationRange(task, SESSIONS.slice(0, 2));
  assert.equal(early.kind, 'estimate', 'two sessions are not enough for a range');
  assert.equal(early.low, remainingByEstimate(task));
  assert.equal(early.low, 160, '16 of 28 scripts left of a 280 min estimate');
  assert.equal(durationRange({ id: 'x' }, []), null);
  assert.equal(hoursText(90, 150), '1½–2½ h');
  assert.equal(hoursText(40), '40 min');
});

test('fragility: fits, fits only at your fastest pace, does not fit', () => {
  const range = { kind: 'range', low: 120, high: 180 };
  assert.equal(fragility({ range, planned: 60, free: 150 }).status, 'fits');
  const fragile = fragility({ range, planned: 60, free: 90 });
  assert.equal(fragile.status, 'fragile');
  assert.match(fragile.text, /Fits only at your fastest pace\. At your usual pace it needs about 30 min more\./);
  const short = fragility({ range, planned: 0, free: 60 });
  assert.equal(short.status, 'short');
  assert.match(short.text, /even at your fastest pace: about 1 h short/);
});

test('dependencies: explicit links block and rank; step order is only a question until confirmed', () => {
  const tasks = [
    { id: 'venue', title: 'Book venue', status: 'open', due_date: '2026-10-05' },
    { id: 'invites', title: 'Send invites', status: 'open', depends_on: ['venue'] },
    { id: 'budget', title: 'Budget', status: 'open', depends_on: 'venue' }, // older string form
    { id: 's1', title: 'Draft', status: 'open', parent_task_id: 'p', step_order: 1 },
    { id: 's2', title: 'Edit', status: 'open', parent_task_id: 'p', step_order: 2 },
    { id: 's3', title: 'Publish', status: 'open', parent_task_id: 'p', step_order: 3, dismissed_inferred: ['s2'] }
  ];
  const deps = dependencyIndex(tasks);
  assert.deepEqual(deps.get('invites').blockedBy, [{ id: 'venue', title: 'Book venue', due: '2026-10-05' }]);
  assert.equal(deps.get('venue').unlocks, 2);
  assert.equal(deps.get('s2').inferredAfter.id, 's1');
  assert.equal(deps.get('s3')?.inferredAfter ?? null, null, 'a dismissed guess is never asked again');
  const done = dependencyIndex(tasks.map((t) => (t.id === 'venue' ? { ...t, status: 'done' } : t)));
  assert.equal(done.get('invites')?.blockedBy.length ?? 0, 0, 'a finished blocker blocks nothing');
});

test('server: resumability, longest stretch and dependency lists are coerced', () => {
  const merged = mergeTask({ id: 't', title: 'T' }, { resumability: 'runup', max_block_minutes: 500, depends_on: ['a', 'a', 't', 3] });
  assert.equal(merged.resumability, 'runup');
  assert.equal(merged.max_block_minutes, null, 'out of range clears it');
  assert.deepEqual(merged.depends_on, ['a']);
  assert.equal(mergeTask({ id: 't' }, { resumability: 'sometimes' }).resumability, null);
  assert.equal(mergeTask({ id: 't' }, { max_block_minutes: 60 }).max_block_minutes, 60);
  assert.deepEqual(coerceIdList('venue', 't'), ['venue']);
});

// ---------- step 8: runway ----------

const base = { id: 't', title: 'UNYouth pack', status: 'open', due_date: '2026-10-07', estimated_duration: 180, max_block_minutes: 90 };
const capacity = new Map([['2026-10-03', { pct: 30 }], ['2026-10-04', { pct: 90 }], ['2026-10-05', { pct: 85 }]]);

test('runway: split by the longest stretch, placed on the best-capacity days just before it is due, as real work blocks', () => {
  const ghosts = proposeDeadlineRunwayGhosts({ tasks: [base], today: TODAY, nowIso: NOW, capacity });
  assert.equal(ghosts.length, 2);
  assert.deepEqual(ghosts.map((g) => [g.date, g.start, g.end]), [['2026-10-04', '09:30', '11:00'], ['2026-10-05', '15:30', '17:00']]);
  assert.deepEqual(ghosts.map((g) => g.id), ['clare-runway-t-2026-10-07', 'clare-runway-t-2026-10-07-2']);
  assert.ok(ghosts.every((g) => g.kind === 'task_block' && g.taskId === 't' && g.chip.kind === 'task'));
  assert.match(ghosts[0].reason, /Due Wed 7 Oct\. About 3 h left\. Forecast 90% on Sun 4 Oct\./);
  assert.equal(ghosts[0].label, 'Work: UNYouth pack (1 of 2)');
  assert.ok(!ghosts.some((g) => g.date === '2026-10-03'), 'never on a day forecast under 40%');
});

test('runway: iCloud busy time, two-a-day cap, and already-planned blocks are respected', () => {
  const ical = [{ date: '2026-10-04', time: '09:00', end_time: '11:00', title: 'Brunch' }];
  const [first] = proposeDeadlineRunwayGhosts({ tasks: [base], today: TODAY, nowIso: NOW, capacity, icalRows: ical });
  assert.equal(first.start, '11:00', 'placed after brunch');
  const pending = [1, 2].map((n) => ({ id: `p${n}`, via: 'deadline-runway', status: 'pending', date: '2026-10-04' }));
  const capped = proposeDeadlineRunwayGhosts({ tasks: [base], today: TODAY, nowIso: NOW, capacity, pending });
  assert.ok(!capped.some((g) => g.date === '2026-10-04'), 'Sunday already has two');
  const planned = proposeDeadlineRunwayGhosts({
    tasks: [base], today: TODAY, nowIso: NOW, capacity,
    workBlocks: [{ id: 'wb', task_id: 't', date: '2026-10-02', start_time: '16:00', duration_minutes: 120 }]
  });
  assert.equal(planned.length, 1, 'only the hour still unplanned');
  assert.equal(planned[0].end, '10:30');
});

test('runway: run-up work never gets the school day; an undated blocker holds it; no estimate is never guessed', () => {
  const busyEvenings = ['2026-09-29', '2026-09-30'].map((date) => ({ date, time: '15:30', end_time: '21:00', title: 'Parent night' }));
  const due = { ...base, id: 'r', due_date: '2026-09-30', estimated_duration: 60 };
  const quick = proposeDeadlineRunwayGhosts({ tasks: [{ ...due, resumability: 'quick' }], today: TODAY, nowIso: NOW, icalRows: busyEvenings });
  assert.equal(quick[0]?.start, '07:30', 'quick work may use the morning');
  const runup = proposeDeadlineRunwayGhosts({ tasks: [{ ...due, resumability: 'runup' }], today: TODAY, nowIso: NOW, icalRows: busyEvenings });
  assert.equal(runup.length, 0, 'no evening room: nothing, rather than a slot between classes');

  const blocker = { id: 'venue', title: 'Book venue', status: 'open' };
  const waiting = { ...base, depends_on: ['venue'] };
  assert.equal(proposeDeadlineRunwayGhosts({ tasks: [blocker, waiting], today: TODAY, nowIso: NOW, capacity }).length, 0);
  const after = proposeDeadlineRunwayGhosts({ tasks: [{ ...blocker, due_date: '2026-10-05' }, waiting], today: TODAY, nowIso: NOW, capacity });
  const forWaiting = after.filter((g) => g.taskId === 't');
  assert.ok(forWaiting.length && forWaiting.every((g) => g.date > '2026-10-05'), 'only after the venue is due');
  assert.match(forWaiting[0].reason, /After Book venue\./);

  assert.equal(proposeDeadlineRunwayGhosts({ tasks: [{ ...base, estimated_duration: undefined }], today: TODAY, nowIso: NOW }).length, 0);
});

test('task_block accept creates one linked Tasks work block, even if accepted twice', async () => {
  const ghost = { id: 'clare-runway-t-2026-10-07', agent: 'clare', kind: 'task_block', taskId: 't', date: '2026-10-04', start: '09:30', end: '11:00', title: 'UNYouth pack', reason: 'Due Wed.' };
  const plan = acceptPlan(ghost, { today: TODAY });
  assert.deepEqual(plan.steps[0].body, { title: 'UNYouth pack', date: '2026-10-04', start_time: '09:30', duration_minutes: 90, task_id: 't', source: 'runway' });
  assert.match(plan.receipt, /Clare → Tasks: “UNYouth pack”, Sun 04\/10 9:30 am–11:00 am\./);
  const data = new Map();
  const store = { async get(key) { return data.get(key) ?? null; }, async setJSON(key, value) { data.set(key, structuredClone(value)); } };
  await applyTaskStep(store, plan.steps[0], { ghostId: ghost.id });
  await applyTaskStep(store, plan.steps[0], { ghostId: ghost.id });
  const blocks = [...data.keys()].filter((key) => key.startsWith('work_blocks/') && !key.endsWith('_index'));
  assert.equal(blocks.length, 1);
  const block = data.get(blocks[0]);
  assert.deepEqual([block.task_id, block.date, block.start_time, block.duration_minutes, block.status], ['t', '2026-10-04', '09:30', 90, 'confirmed']);
  assert.equal(data.get('work_blocks/_index').filter((id) => id === block.id).length, 1);
});

// ---------- the model: textures, freed time, ranges on the Due row ----------

const RECURRING = [
  { id: 'work:uny:1', uid: 'uny', feed: 'work', series: 'work:uny', title: 'UNYouth committee', date: '2026-09-22', time: '16:00', end_time: '17:30', all_day: false },
  { id: 'work:uny:2', uid: 'uny', feed: 'work', series: 'work:uny', title: 'UNYouth committee', date: TODAY, time: '16:00', end_time: '17:30', all_day: false },
  { id: 'work:uny:3', uid: 'uny', feed: 'work', series: 'work:uny', title: 'UNYouth committee', date: '2026-10-06', time: '16:00', end_time: '17:30', all_day: false },
  { id: 'work:train', uid: 'tr', feed: 'work', title: 'Train to Newcastle', date: '2026-10-02', time: '08:00', end_time: '10:30', all_day: false }
];
const FREED = [{ id: 'freed-1', series: 'work:uny', title: 'UNYouth committee', weekday: 2, start: '16:00', end: '17:30', from: TODAY, reason: 'too much this term', term_end: '2026-12-17' }];

function modelWith(extra = [], nowHour = 20) {
  const events = [
    ...tasksEventsFromTasks([
      { id: 'marking', title: 'Mark 9E essays', status: 'open', due_date: '2026-10-01', estimated_duration: 280, marking: { scripts: 28, scripts_marked: 12 }, resumability: 'runup' }
    ]),
    ...tasksEventsFromWorkSessions([
      { id: 's1', task_id: 'marking', started_at: '2026-09-28T06:00:00Z', finished_at: '2026-09-28T06:40:00Z', result: 'worked', scripts_marked: 4 },
      { id: 's2', task_id: 'marking', started_at: '2026-09-28T08:00:00Z', finished_at: '2026-09-28T08:48:00Z', result: 'worked', scripts_marked: 4 },
      { id: 's3', task_id: 'marking', started_at: '2026-09-29T06:00:00Z', finished_at: '2026-09-29T07:00:00Z', result: 'worked', scripts_marked: 4 }
    ], new Map([['marking', 'Mark 9E essays']]), { now: Date.parse('2026-09-29T10:00:00Z') }),
    ...tasksEventsFromWorkBlocks([{ id: 'wb-new', title: 'Coaching', date: TODAY, start_time: '16:30', duration_minutes: 60, status: 'confirmed' }]),
    { path: 'teaching:l1', record: { type: 'scheduled_lesson', id: 'l1', date: TODAY, time: '09:00', duration_min: 60, title: 'Year 9 English' } },
    ...eventsFromCalendarFeeds(RECURRING, FREED),
    ...extra
  ];
  return buildTidelineModel({ events, week: WEEK, today: TODAY, nowHour });
}
const dayOf = (m, date) => m.days.find((d) => d.date === date);

test('textures: school gaps are interruptible, a train is travel; freed time hides the dropped series and prices new use', () => {
  const m = modelWith();
  const tue = dayOf(m, TODAY);
  const gaps = tue.textures.map((t) => [Math.round(t.start * 100) / 100, Math.round(t.end * 100) / 100]);
  assert.deepEqual(gaps, [[8.25, 9], [10, 15.17]]);
  assert.equal(dayOf(m, '2026-10-03').textures.length, 0, 'Saturday has no school time');
  assert.equal(dayOf(m, '2026-10-02').chips.find((c) => c.title === 'Train to Newcastle').texture, 'travel');
  assert.ok(!tue.chips.some((c) => c.title === 'UNYouth committee'), 'dropped from today on');
  assert.equal(tue.freed[0].title, 'UNYouth committee');
  const coaching = tue.chips.find((c) => c.id === 'wb-new');
  assert.deepEqual(coaching.regained, { title: 'UNYouth committee', reason: 'too much this term', hours: 1, weeks: 12, termHours: 12 });
  assert.equal(coaching.texture, 'focus');
});

test('Due row: range from tracked pace and a fragility check against the evenings left', () => {
  const easy = dayOf(modelWith(), '2026-10-01').due.find((d) => d.id === 'marking');
  assert.equal(easy.range.kind, 'range');
  assert.equal(easy.fragility.status, 'fits');
  const busy = ['2026-09-30', '2026-10-01'].map((date, i) => ({ path: `x${i}`, record: { type: 'professional_event', id: `pe${i}`, date, time: '15:30', end_time: '21:00', title: 'Parent-teacher' } }));
  const tight = dayOf(modelWith(busy), '2026-10-01').due.find((d) => d.id === 'marking');
  assert.equal(tight.fragility.status, 'short');
});

test('ical: repeating events name their series; one-offs do not', () => {
  const text = [
    'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:uny', 'SUMMARY:UNYouth', 'DTSTART;TZID=Australia/Sydney:20260922T160000',
    'DTEND;TZID=Australia/Sydney:20260922T173000', 'RRULE:FREQ=WEEKLY;COUNT=3', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:once', 'SUMMARY:Dentist', 'DTSTART;TZID=Australia/Sydney:20260930T100000',
    'DTEND;TZID=Australia/Sydney:20260930T110000', 'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n');
  const rows = icalOccurrences(text, { feed: 'work', from: '2026-09-20', to: '2026-10-20' });
  assert.ok(rows.filter((r) => r.title === 'UNYouth').every((r) => r.series === 'work:uny'));
  assert.equal(rows.find((r) => r.title === 'Dentist').series, undefined);
});

test('freed: server entry remembers why and the term; card “I’ve dropped this” posts it', () => {
  const { entry } = freedEntry({ series: 'work:uny', title: 'UNYouth', date: TODAY, start: '16:00', end: '17:30', reason: ' too much ' }, {
    terms: [{ starts_on: '2026-07-14', ends_on: '2026-09-25' }, { starts_on: '2026-09-28', ends_on: '2026-12-17' }]
  });
  assert.deepEqual([entry.weekday, entry.from, entry.term_end, entry.reason], [2, TODAY, '2026-12-17', 'too much']);
  assert.equal(freedEntry({ series: 'x', title: 'y', date: TODAY, start: '17:00', end: '16:00' }).error, 'invalid_request');
  const chip = { record: { type: 'ical_event', id: 'work:uny:2', series: 'work:uny', title: 'UNYouth', date: TODAY, time: '16:00', end_time: '17:30' } };
  const request = itemPatchRequest(chip, { freed: { reason: 'too much' } });
  assert.equal(request.path, '/api/calendar-freed');
  assert.deepEqual(request.body, { series: 'work:uny', title: 'UNYouth', date: TODAY, start: '16:00', end: '17:30', reason: 'too much' });
  assert.equal(freedSpansFor('2026-10-06', FREED).length, 1);
  assert.equal(freedSpansFor('2026-09-22', FREED).length, 0, 'before it was dropped');
  assert.equal(regainedCost({ start: 18, end: 19 }, { start: 16, end: 17.5 }, TODAY), null, 'outside the slot');
});

test('card: resumability, longest stretch, and the inferred-order question save through the task', async () => {
  const task = { record: { type: 'task', id: 's2', title: 'Edit', date: '2026-10-02', resumability: 'runup', inferred_after: { id: 's1', title: 'Draft' }, depends_on: ['x'] } };
  const patch = itemCardPatch(task, { title: 'Edit', date: '2026-10-02', time: '', bookmark: '', resumability: 'quick', max_block: '45', notes: '' });
  assert.deepEqual(patch, { resumability: 'quick', max_block_minutes: 45, date: '2026-10-02' });
  const request = itemPatchRequest(task, patch);
  assert.equal(request.body.resumability, 'quick');
  assert.equal(request.body.max_block_minutes, 45);

  const window = new Window();
  const node = window.document.createElement('div');
  node.innerHTML = itemCardHtml(task);
  assert.match(node.textContent, /Probably after “Draft”\?/);
  assert.equal(node.querySelector('select[name="resumability"] option[selected]').value, 'runup');
  const saved = [];
  bindItemCard(node, task, { onSave: async (p) => { saved.push(p); }, onClose: () => {} });
  node.querySelector('[data-infer="yes"]').click();
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(saved[0], { depends_on: ['x', 's1'] });
  assert.deepEqual(itemPatchRequest(task, saved[0]).body, { depends_on: ['x', 's1'] });

  const ical = { record: { type: 'ical_event', id: 'work:uny:2', series: 'work:uny', title: 'UNYouth', date: TODAY, time: '16:00', end_time: '17:30', feed: 'work' } };
  node.innerHTML = itemCardHtml(ical);
  assert.ok(node.querySelector('[data-part="card-drop"]'), 'a repeating event offers “I’ve dropped this”');
  bindItemCard(node, ical, { onSave: async (p) => { saved.push(p); }, onClose: () => {} });
  node.querySelector('input[name="drop_reason"]').value = 'too much';
  node.querySelector('[data-part="card-drop"]').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(saved[1], { freed: { reason: 'too much' } });
  window.close();
});

test('texture rules: explicit availability wins; ghosts and plain items have none', () => {
  assert.equal(textureFor({ record: { availability: 'callback_wait' }, source: 'work_block' }), 'callback_wait');
  assert.equal(textureFor({ ghost: {}, source: 'work_block' }), null);
  assert.equal(textureFor({ protected: true, title: 'Rest, protected' }), 'recovery');
  assert.equal(textureFor({ source: 'meal', title: 'Lunch' }), null);
  assert.deepEqual(interruptibleSpans({ school: false, chips: [] }, { from: 8, to: 15 }), []);
});
