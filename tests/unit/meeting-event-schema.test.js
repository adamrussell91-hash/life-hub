import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MEETING_SCHEMA_VERSION,
  assertMeetingStateTransition,
  parseMeetingRecord,
  projectMeeting,
  validateMeetingCreateInput,
  validateMeetingFieldUpdate,
  validateMeetingRescheduleInput
} from '../../netlify/functions/_shared/meeting-schema.mjs';
import {
  EVENT_SCHEMA_VERSION,
  EVENT_TYPES,
  assertEventStateTransition,
  parseEventRecord,
  validateEventCreateInput,
  validateEventFieldUpdate
} from '../../netlify/functions/_shared/event-schema.mjs';
import {
  deriveProjectionId,
  lifeCalendarEventsFromProjections,
  mergeScheduleProjections,
  projectEventSchedule,
  projectMeetingSchedule
} from '../../netlify/functions/_shared/schedule-projection.mjs';

const MEETING_ID = 'meeting_00000000-0000-4000-8000-000000000001';
const EVENT_ID = 'event_00000000-0000-4000-8000-000000000001';

test('meeting create validation and parse reject relationship id fields', () => {
  const validated = validateMeetingCreateInput({
    title: 'Seth sync',
    scheduled_start: '2026-09-15T01:00:00.000Z',
    scheduled_end: '2026-09-15T02:00:00.000Z',
    time_zone: 'Australia/Sydney',
    links: [{ target_ref: 'shared:person:person_x', relationship_type: 'attendee' }]
  });
  assert.equal(validated.title, 'Seth sync');
  assert.throws(
    () =>
      validateMeetingCreateInput({
        title: 'x',
        scheduled_start: '2026-09-15T01:00:00.000Z',
        scheduled_end: '2026-09-15T02:00:00.000Z',
        time_zone: 'Australia/Sydney',
        person_id: 'person_x'
      }),
    (error) => error.code === 'unknown_field'
  );

  const record = {
    schema_version: 1,
    id: MEETING_ID,
    title: 'Seth sync',
    scheduled_start: '2026-09-15T01:00:00.000Z',
    scheduled_end: '2026-09-15T02:00:00.000Z',
    time_zone: 'Australia/Sydney',
    location_text: null,
    agenda: null,
    notes: null,
    state: 'scheduled',
    occurrence_history: [],
    created_at: '2026-09-12T00:00:00.000Z',
    updated_at: '2026-09-12T00:00:00.000Z'
  };
  assert.ok(parseMeetingRecord(record));
  assert.equal(parseMeetingRecord({ ...record, person_id: 'x' }), null);
  assert.equal(parseMeetingRecord({ ...record, attendee_ids: [] }), null);
});

test('meeting state transitions and reschedule history shape', () => {
  assertMeetingStateTransition('scheduled', 'completed');
  assertMeetingStateTransition('scheduled', 'rescheduled');
  assert.throws(() => assertMeetingStateTransition('completed', 'scheduled'), (e) => e.code === 'invalid_state_transition');
  const reschedule = validateMeetingRescheduleInput({
    scheduled_start: '2026-09-16T01:00:00.000Z',
    scheduled_end: '2026-09-16T02:00:00.000Z',
    time_zone: 'Australia/Sydney',
    reason: 'Seth travel'
  });
  assert.equal(reschedule.reason, 'Seth travel');
});

test('event PD fields validate and reject relationship ids on the record', () => {
  const validated = validateEventCreateInput({
    title: 'Gifted education PD',
    start: '2026-10-01T00:00:00.000Z',
    end: '2026-10-01T06:00:00.000Z',
    time_zone: 'Australia/Sydney',
    hours: 5,
    accreditation_category: 'NESA',
    attendance_state: 'registered',
    certificate: { name: 'Cert', issued_at: null, reference: 'C-1' }
  });
  assert.equal(validated.event_type, 'professional_development');
  assert.equal(validated.hours, 5);
  assert.equal(validated.priority_area, null);
  const withPriority = validateEventCreateInput({
    title: 'Gifted education PD',
    start: '2026-10-01T00:00:00.000Z',
    end: '2026-10-01T06:00:00.000Z',
    time_zone: 'Australia/Sydney',
    accreditation_category: 'Course',
    priority_area: 'Wellbeing'
  });
  assert.equal(withPriority.accreditation_category, 'Course');
  assert.equal(withPriority.priority_area, 'Wellbeing');
  const custom = validateEventCreateInput({
    title: 'Gifted education PD',
    start: '2026-10-01T00:00:00.000Z',
    end: '2026-10-01T06:00:00.000Z',
    time_zone: 'Australia/Sydney',
    priority_area: '  Gifted education  '
  });
  assert.equal(custom.priority_area, 'Gifted education');
  assert.throws(
    () =>
      validateEventCreateInput({
        title: 'Gifted education PD',
        start: '2026-10-01T00:00:00.000Z',
        end: '2026-10-01T06:00:00.000Z',
        time_zone: 'Australia/Sydney',
        priority_area: 'x'.repeat(81)
      }),
    (error) => error.code === 'priority_area_too_long'
  );
  assert.throws(
    () =>
      validateEventCreateInput({
        title: 'x',
        start: '2026-10-01T00:00:00.000Z',
        end: '2026-10-01T06:00:00.000Z',
        time_zone: 'Australia/Sydney',
        organisation_id: 'organisation_x'
      }),
    (error) => error.code === 'unknown_field'
  );

  const record = {
    schema_version: 1,
    id: EVENT_ID,
    title: 'Gifted education PD',
    event_type: 'professional_development',
    start: '2026-10-01T00:00:00.000Z',
    end: '2026-10-01T06:00:00.000Z',
    time_zone: 'Australia/Sydney',
    all_day: false,
    occurrence_state: 'scheduled',
    location_text: null,
    accreditation_category: 'NESA',
    hours: 5,
    attendance_state: 'registered',
    certificate: { name: 'Cert', issued_at: null, reference: 'C-1' },
    created_at: '2026-09-12T00:00:00.000Z',
    updated_at: '2026-09-12T00:00:00.000Z'
  };
  assert.equal(parseEventRecord(record).priority_area, null);
  assert.equal(parseEventRecord({ ...record, priority_area: 'Gifted education' }).priority_area, 'Gifted education');
  assert.equal(parseEventRecord({ ...record, priority_area: 'x'.repeat(81) }), null);
  assert.equal(parseEventRecord({ ...record, provider_id: 'x' }), null);
  assertEventStateTransition('scheduled', 'completed');
  assert.throws(() => assertEventStateTransition('cancelled', 'scheduled'), (e) => e.code === 'invalid_state_transition');
});

test('event field update accepts When fields without a reschedule state change', () => {
  const patch = validateEventFieldUpdate({
    title: 'Gifted education PD',
    start: '2026-10-02T00:00:00.000Z',
    end: '2026-10-02T06:00:00.000Z',
    time_zone: 'Australia/Sydney',
    hours: 6
  });
  assert.equal(patch.title, 'Gifted education PD');
  assert.equal(patch.start, '2026-10-02T00:00:00.000Z');
  assert.equal(patch.hours, 6);
  assert.throws(
    () => validateEventFieldUpdate({ links: [] }),
    (error) => error.code === 'unknown_field'
  );
});

test('schedule projections are deterministic and dedupe on merge', () => {
  const meeting = {
    id: MEETING_ID,
    title: 'Seth sync',
    scheduled_start: '2026-09-15T01:00:00.000Z',
    scheduled_end: '2026-09-15T02:00:00.000Z',
    time_zone: 'Australia/Sydney',
    state: 'rescheduled'
  };
  const event = {
    id: EVENT_ID,
    title: 'PD',
    start: '2026-10-01T00:00:00.000Z',
    end: '2026-10-01T06:00:00.000Z',
    time_zone: 'Australia/Sydney',
    all_day: false,
    occurrence_state: 'scheduled'
  };
  const a = projectMeetingSchedule(meeting);
  const b = projectMeetingSchedule({ ...meeting, state: 'completed' });
  assert.equal(a.projection_id, b.projection_id);
  assert.equal(a.projection_id, deriveProjectionId(a.source_ref));
  const eventProj = projectEventSchedule(event);
  const merged = mergeScheduleProjections([[a], [b, eventProj]]);
  assert.equal(merged.length, 2);
  assert.equal(merged.filter((p) => p.kind === 'meeting').length, 1);
  assert.equal(merged.find((p) => p.kind === 'meeting').status, 'completed');

  const lifeEvents = lifeCalendarEventsFromProjections(merged);
  assert.equal(lifeEvents.length, 2);
  assert.deepEqual(
    lifeEvents.map((e) => e.record.type).sort(),
    ['professional_event', 'professional_meeting']
  );
  assert.equal(projectMeeting({ ...meeting, schema_version: 1, location_text: null, agenda: null, notes: null, occurrence_history: [], created_at: 't', updated_at: 't' }).id, MEETING_ID);
});

const EVENT_V1 = {
  schema_version: 1,
  id: 'event_00000000-0000-4000-8000-000000000001',
  title: 'Warlight Professional Development',
  event_type: 'professional_development',
  start: '2026-09-17T23:00:00.000Z',
  end: '2026-09-18T05:00:00.000Z',
  time_zone: 'Australia/Sydney',
  all_day: false,
  occurrence_state: 'completed',
  location_text: "St Aloysius' College",
  accreditation_category: null,
  priority_area: null,
  hours: 6,
  attendance_state: 'attended',
  certificate: null,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z'
};

test('event v2: general type allowed and switchable; v1 reads with empty talks and blocks', () => {
  assert.equal(EVENT_SCHEMA_VERSION, 2);
  assert.ok(EVENT_TYPES.has('general'));
  const parsed = parseEventRecord(EVENT_V1);
  assert.deepEqual(parsed.talks, []);
  assert.deepEqual(parsed.blocks, []);
  assert.deepEqual(validateEventFieldUpdate({ event_type: 'general' }), { event_type: 'general' });
  assert.equal(
    validateEventCreateInput({
      title: EVENT_V1.title,
      event_type: 'general',
      start: EVENT_V1.start,
      end: EVENT_V1.end,
      time_zone: EVENT_V1.time_zone,
      all_day: EVENT_V1.all_day,
      location_text: EVENT_V1.location_text,
      hours: null,
      links: []
    }).event_type,
    'general'
  );
});

test('talks validate time, hours and title', () => {
  const patch = validateEventFieldUpdate({
    talks: [
      { id: 't1', time: '09:00', title: 'Keynote · Reading against the grain', presenter: 'Dr Mia L.', hours: 1.5 },
      { id: 't2', time: null, title: 'Panel', presenter: null, hours: null }
    ]
  });
  assert.equal(patch.talks.length, 2);
  assert.throws(() => validateEventFieldUpdate({ talks: [{ id: 't1', time: '9am', title: 'x', hours: 1 }] }), { code: 'invalid_talks' });
  assert.throws(() => validateEventFieldUpdate({ talks: [{ id: 't1', time: null, title: '', hours: 1 }] }), { code: 'invalid_talks' });
  assert.throws(() => validateEventFieldUpdate({ talks: [{ id: 't1', time: null, title: 'x', hours: 30 }] }), { code: 'invalid_talks' });
});

const MEETING_V1 = {
  schema_version: 1,
  id: 'meeting_00000000-0000-4000-8000-000000000001',
  title: 'HALT NSW board meeting',
  scheduled_start: '2026-09-24T08:00:00.000Z',
  scheduled_end: '2026-09-24T09:15:00.000Z',
  time_zone: 'Australia/Sydney',
  location_text: 'Teams',
  agenda: '1. Minutes\n2. Treasurer\n3. Medal ceremony run sheet',
  notes: null,
  state: 'scheduled',
  occurrence_history: [],
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z'
};

test('meeting v2 reads v1 with empty purpose, blocks and decisions', () => {
  assert.equal(MEETING_SCHEMA_VERSION, 2);
  const parsed = parseMeetingRecord(MEETING_V1);
  assert.equal(parsed.purpose, null);
  assert.deepEqual(parsed.blocks, []);
  assert.deepEqual(parsed.decisions, []);
  assert.equal(projectMeeting(parsed).agenda, MEETING_V1.agenda);
});

test('meeting update accepts purpose, blocks and decisions', () => {
  const patch = validateMeetingFieldUpdate({
    purpose: 'Present the run sheet; get a yes on the TeachMeet date.',
    blocks: [{ id: 'block_1', block_type: 'heading', content: { text: 'Minutes' } }],
    decisions: [{ id: 'd1', text: 'Minutes accepted', agenda_heading: 'Minutes' }]
  });
  assert.equal(patch.decisions[0].agenda_heading, 'Minutes');
  assert.throws(() => validateMeetingFieldUpdate({ decisions: [{ id: 'd1' }] }), { code: 'invalid_decisions' });
  assert.throws(() => validateMeetingFieldUpdate({ purpose: 'x'.repeat(501) }), { code: 'purpose_too_long' });
});
