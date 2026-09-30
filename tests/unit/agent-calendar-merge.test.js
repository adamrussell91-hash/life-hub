import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AGENT_CALENDAR_SOURCES,
  mergeAgentCalendarSlots,
  findSlotConflicts,
  conflictToolError,
  unavailableCalendarToolError,
  mergeHasUnavailableSources,
  describeMergedCalendarWindow,
  busySpansFromMergedSlots,
  professionalEventsFromRecords,
  checkCalendarsSchema,
  loadAgentCalendarMerge
} from '../../netlify/functions/_shared/agent-calendar-merge.mjs';
import { buildAuthoritativeHardBusy } from '../../netlify/functions/_shared/productivity-os.mjs';
import { buildAgentTools, resetCapabilityCaches } from '../../netlify/functions/_shared/capabilities/registry.mjs';

const DAY = '2026-10-01';

const PRO_MEETING = {
  path: 'professional:proj_meet',
  record: {
    type: 'professional_meeting',
    id: 'proj_meet',
    date: DAY,
    time: '10:00',
    duration_min: 60,
    title: 'HSC English Catch-up'
  }
};

const PRO_MEETING_2 = {
  path: 'professional:proj_staff',
  record: {
    type: 'professional_meeting',
    id: 'proj_staff',
    date: DAY,
    time: '14:00',
    end_time: '15:00',
    title: 'Staff briefing'
  }
};

const PRO_MEETING_3 = {
  path: 'professional:proj_pd',
  record: {
    type: 'professional_meeting',
    id: 'proj_pd',
    date: DAY,
    time: '16:00',
    end_time: '17:00',
    title: 'PD check-in'
  }
};

const LESSON = {
  path: 'teaching:les1',
  record: {
    type: 'scheduled_lesson',
    id: 'les1',
    date: DAY,
    time: '09:00',
    duration_min: 60,
    title: 'Year 10 essay hinge'
  }
};

const ICAL = {
  path: 'ical:work1',
  record: {
    type: 'ical_event',
    id: 'work1',
    feed: 'work',
    date: DAY,
    time: '11:30',
    end_time: '12:00',
    title: 'Faculty meeting'
  }
};

test('AGENT_CALENDAR_SOURCES matches Tideline full merge (6 hubs)', () => {
  assert.deepEqual([...AGENT_CALENDAR_SOURCES], [
    'life', 'teaching', 'knowledge', 'tasks', 'professional', 'feeds'
  ]);
});

test('thin Teaching+Tasks merge misses Professional meetings on the day', () => {
  // Before: Ann / check_calendars only saw Teaching + Tasks — the three meetings vanish.
  const thin = mergeAgentCalendarSlots({
    teachingEvents: [LESSON],
    tasksEvents: [{
      path: 'tasks:t1',
      record: { type: 'task', id: 't1', date: DAY, title: 'Mark essays', all_day: true }
    }],
    sourceStatus: {
      life: { status: 'unavailable', count: 0, error: 'not_loaded' },
      teaching: { status: 'live', count: 1, error: null },
      knowledge: { status: 'unavailable', count: 0, error: 'not_loaded' },
      tasks: { status: 'live', count: 1, error: null },
      professional: { status: 'unavailable', count: 0, error: 'not_loaded' },
      feeds: { status: 'unavailable', count: 0, error: 'not_loaded' }
    }
  });
  assert.equal(thin.slots.filter((s) => s.source === 'professional').length, 0);
  assert.equal(mergeHasUnavailableSources(thin.sourceStatus), true);
  // 10:00–11:00 does not overlap the 09:00 lesson; Professional meeting is invisible → false free.
  const againstLessonOnly = findSlotConflicts(
    thin.slots.filter((s) => s.source === 'teaching'),
    { date: DAY, start: '10:00', end: '11:00' }
  );
  assert.equal(againstLessonOnly.length, 0, 'thin teaching-only view falsely reports 10:00 free');
});

test('full multi-hub merge surfaces three Professional meetings for conflict checks', () => {
  const full = mergeAgentCalendarSlots({
    teachingEvents: [LESSON],
    professionalEvents: [PRO_MEETING, PRO_MEETING_2, PRO_MEETING_3],
    feedEvents: [ICAL],
    sourceStatus: Object.fromEntries(
      AGENT_CALENDAR_SOURCES.map((id) => [id, { status: 'live', count: 0, error: null }])
    )
  });
  assert.equal(full.slots.filter((s) => s.source === 'professional').length, 3);
  assert.equal(mergeHasUnavailableSources(full.sourceStatus), false);

  const hit = findSlotConflicts(full.slots, { date: DAY, start: '10:00', end: '11:00' });
  assert.equal(hit.length, 1);
  assert.equal(hit[0].title, 'HSC English Catch-up');

  const err = conflictToolError(hit);
  assert.equal(err.ok, false);
  assert.equal(err.error, 'calendar_conflict');
  assert.match(err.message, /HSC English Catch-up/);
  assert.match(err.message, /10:00/);
  assert.equal(err.conflicts[0].source_label, 'Professional');
});

test('unavailable Professional source refuses to pretend free', () => {
  const merged = mergeAgentCalendarSlots({
    teachingEvents: [LESSON],
    sourceStatus: {
      life: { status: 'live', count: 0, error: null },
      teaching: { status: 'live', count: 1, error: null },
      knowledge: { status: 'live', count: 0, error: null },
      tasks: { status: 'live', count: 0, error: null },
      professional: { status: 'unavailable', count: 0, error: 'blob_failed' },
      feeds: { status: 'live', count: 0, error: null }
    }
  });
  assert.equal(mergeHasUnavailableSources(merged.sourceStatus), true);
  const err = unavailableCalendarToolError(merged.sourceStatus);
  assert.equal(err.error, 'calendar_sources_unavailable');
  assert.match(err.message, /Professional/);
});

test('describeMergedCalendarWindow lists all sources and marks incomplete thin loads', () => {
  const thin = mergeAgentCalendarSlots({
    teachingEvents: [LESSON],
    tasksEvents: [],
    sourceStatus: {
      life: { status: 'unavailable', count: 0, error: 'x' },
      teaching: { status: 'live', count: 1, error: null },
      knowledge: { status: 'unavailable', count: 0, error: 'x' },
      tasks: { status: 'live', count: 0, error: null },
      professional: { status: 'unavailable', count: 0, error: 'x' },
      feeds: { status: 'unavailable', count: 0, error: 'x' }
    }
  });
  const described = describeMergedCalendarWindow({
    slots: thin.slots,
    sourceStatus: thin.sourceStatus,
    from: DAY,
    days: 1,
    tasks: []
  });
  assert.equal(described.ok, true);
  assert.equal(described.incomplete, true);
  assert.deepEqual(described.sources, [...AGENT_CALENDAR_SOURCES]);
  assert.equal(described.window[0].events[0].source, 'teaching');
});

test('busySpansFromMergedSlots feeds compose hard busy with Professional + iCal', () => {
  const full = mergeAgentCalendarSlots({
    professionalEvents: [PRO_MEETING],
    feedEvents: [ICAL]
  });
  const extra = busySpansFromMergedSlots(
    full.slots.filter((s) => s.source === 'professional' || s.source === 'feeds'),
    DAY
  );
  const hardBusy = buildAuthoritativeHardBusy({
    date: DAY,
    lessons: [],
    workBlocks: [],
    events: [],
    extraBusySpans: extra
  });
  assert.ok(hardBusy.some((s) => s.title === 'HSC English Catch-up'));
  assert.ok(hardBusy.some((s) => s.title === 'Faculty meeting'));
});

test('professionalEventsFromRecords projects meetings into calendar rows', () => {
  const rows = professionalEventsFromRecords({
    meetings: [{
      id: 'meeting_1',
      title: 'Catch-up',
      scheduled_start: '2026-09-30T23:00:00.000Z',
      scheduled_end: '2026-10-01T00:00:00.000Z',
      time_zone: 'Australia/Sydney',
      state: 'scheduled'
    }],
    events: []
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].record.type, 'professional_meeting');
  assert.equal(rows[0].record.date, DAY);
});

test('loadAgentCalendarMerge marks missing loaders unavailable (fail-visible)', async () => {
  const merge = await loadAgentCalendarMerge({
    from: DAY,
    to: DAY,
    loadTeaching: async () => ({
      scheduled_lessons: [{
        id: 'les1',
        date: DAY,
        start_time: '09:00',
        lesson_id: 'draft1',
        class_id: 'c1'
      }],
      lessons: [{ id: 'draft1', title: 'Year 10 essay hinge' }],
      classes: []
    })
    // all other loaders omitted → unavailable
  });
  assert.equal(merge.sourceStatus.teaching.status, 'live');
  assert.equal(merge.sourceStatus.professional.status, 'unavailable');
  assert.equal(merge.sourceStatus.feeds.status, 'unavailable');
  assert.equal(mergeHasUnavailableSources(merge.sourceStatus), true);
});

test('check_calendars schema and Ann/Hammond get the tool; Clare workbench owns hers', () => {
  resetCapabilityCaches();
  assert.equal(checkCalendarsSchema().name, 'check_calendars');
  assert.match(checkCalendarsSchema().description, /Professional/);

  for (const slug of ['ann', 'hammond', 'sara', 'clare']) {
    const tools = buildAgentTools({ slug, message: 'schedule something', selectedIds: [] });
    const names = tools.map((t) => t.name);
    assert.ok(names.includes('check_calendars'), `${slug} missing check_calendars`);
    assert.equal(names.filter((n) => n === 'check_calendars').length, 1, `${slug} duplicate check_calendars`);
  }
});
