/**
 * Life Day/Week Tideline must receive the same hub overlay events as the
 * month model. Omitting professionalEvents made Meetings 0 with filters off
 * even when /api/schedule-projections had returned the meetings.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeLifeCalendarEvents } from '../../apps/life/js/app/calendar-model.js';
import { projectMeetingSchedule } from '../../netlify/functions/_shared/schedule-projection.mjs';
import { professionalEventsFromProjections } from '../../packages/design-kit/js/calendar/professional-calendar.js';
import { buildTidelineModel } from '../../packages/design-kit/js/calendar/tideline-model.js';
import { countByFilterKey } from '../../packages/design-kit/js/calendar/calendar-filter.js';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DAY = '2026-10-01';
const WEEK = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];

function meetingEvent(id, title, start, end) {
  const [row] = professionalEventsFromProjections([
    projectMeetingSchedule({
      id,
      title,
      scheduled_start: start,
      scheduled_end: end,
      time_zone: 'Australia/Sydney',
      state: 'scheduled'
    })
  ]);
  return row;
}

const THREE_MEETINGS = [
  meetingEvent(
    'meeting_00000000-0000-4000-8000-000000000011',
    'Faculty catch-up',
    '2026-09-30T23:00:00.000Z',
    '2026-09-30T23:45:00.000Z'
  ),
  meetingEvent(
    'meeting_00000000-0000-4000-8000-000000000012',
    'Parent call',
    '2026-10-01T01:00:00.000Z',
    '2026-10-01T01:30:00.000Z'
  ),
  meetingEvent(
    'meeting_00000000-0000-4000-8000-000000000013',
    'HSC planning',
    '2026-10-01T04:00:00.000Z',
    '2026-10-01T05:00:00.000Z'
  )
];

test('mergeLifeCalendarEvents keeps Professional overlays beside Life/Tasks/feeds', () => {
  const life = [{ path: 'life:meal', record: { type: 'meal', date: DAY } }];
  const teaching = [{ path: 't:1', record: { type: 'scheduled_lesson', date: DAY, time: '09:00' } }];
  const knowledge = [{ path: 'k:1', record: { type: 'knowledge_page', date: DAY } }];
  const tasks = [{ path: 'task:1', record: { type: 'task', date: DAY } }];
  const feeds = [{ path: 'ical:1', record: { type: 'ical_event', date: DAY, time: '11:00', feed: 'family' } }];
  const merged = mergeLifeCalendarEvents({
    lifeEvents: life,
    teachingEvents: teaching,
    knowledgeEvents: knowledge,
    tasksEvents: tasks,
    professionalEvents: THREE_MEETINGS,
    feedEvents: feeds
  });
  assert.equal(merged.length, 1 + 1 + 1 + 1 + 3 + 1);
  assert.equal(merged.filter((e) => e.record.type === 'professional_meeting').length, 3);
});

test('incomplete Life Tideline events (life+tasks+feeds only) yield Meetings 0 for 2026-10-01', () => {
  const incomplete = mergeLifeCalendarEvents({
    lifeEvents: [],
    tasksEvents: [],
    feedEvents: []
  });
  const model = buildTidelineModel({
    events: incomplete,
    week: WEEK,
    today: '2026-09-30',
    nowHour: 12,
    visual: null,
    terms: [{ id: 'hol', name: 'Holidays', starts_on: '2026-09-28', ends_on: '2026-10-12' }]
  });
  const day = model.days.find((d) => d.date === DAY);
  const dayChips = (day?.chips ?? []).concat(day?.due ?? []);
  assert.equal(countByFilterKey(dayChips).meetings, 0);
});

test('full merge puts three Sydney 2026-10-01 meetings on the day and Meetings 3', () => {
  for (const row of THREE_MEETINGS) {
    assert.equal(row.record.date, DAY, `${row.record.title} should date to Sydney ${DAY}`);
  }
  const events = mergeLifeCalendarEvents({ professionalEvents: THREE_MEETINGS });
  const model = buildTidelineModel({
    events,
    week: WEEK,
    today: '2026-09-30',
    nowHour: 12,
    visual: {
      ITEMS: [{ id: 'life-meds', date: DAY, start: '07:00', end: '07:15', kind: 'health', title: 'Meds' }],
      DUE: [],
      WALLS: [],
      FREE: []
    },
    terms: [{ id: 'hol', name: 'Holidays', starts_on: '2026-09-28', ends_on: '2026-10-12' }]
  });
  assert.ok(model.visual, 'holiday visual covers the week');
  const day = model.days.find((d) => d.date === DAY);
  const dayChips = (day?.chips ?? []).concat(day?.due ?? []);
  assert.equal(countByFilterKey(dayChips).meetings, 3);
  assert.deepEqual(
    day.chips.filter((c) => c.filterKey === 'meetings').map((c) => c.title).sort(),
    ['Faculty catch-up', 'HSC planning', 'Parent call']
  );
});

test('source: tasks-hub:tasks-changed repaints calendar so Day Dial is not left stale', () => {
  const src = readFileSync(join(rootDir, 'apps/life/js/app/app-controller.js'), 'utf8');
  const start = src.indexOf("tasks-hub:tasks-changed");
  assert.ok(start >= 0);
  const handler = src.slice(start, src.indexOf('bind(windowTarget, \'hashchange\'', start));
  assert.match(handler, /tasksEventsFromTasks/);
  // keepScroll wraps the remount so a tick does not throw the page to the top (I12).
  assert.match(
    handler,
    /if \(currentSection === 'calendar'\) keepScroll\(\(\) => renderCalendarSection\(\)\)/,
    'Clare dump / board edits must remount Day Dial and Week from the merged tasks'
  );
});

test('source: Life renderCalendarSection feeds Tideline the merged hub list', () => {
  const src = readFileSync(join(rootDir, 'apps/life/js/app/app-controller.js'), 'utf8');
  assert.match(src, /mergeLifeCalendarEvents/);
  assert.match(src, /const calendarEvents = mergeLifeCalendarEvents\(/);
  assert.match(src, /professionalEvents,/);
  const section = src.slice(src.indexOf('function renderCalendarSection'));
  const buildCall = section.indexOf('buildCalendarModel({');
  const renderCall = section.indexOf('renderCalendar(root, model,');
  assert.ok(buildCall >= 0 && renderCall > buildCall);
  const buildBlock = section.slice(buildCall, renderCall);
  const renderBlock = section.slice(renderCall, section.indexOf('planningProfile:', renderCall));
  assert.match(buildBlock, /events:\s*calendarEvents/);
  assert.match(renderBlock, /events:\s*calendarEvents/);
  assert.doesNotMatch(
    renderBlock,
    /events:\s*\[\s*\.\.\.\(latestResult\.events/,
    'must not rebuild a thinner events array for Tideline'
  );
});
