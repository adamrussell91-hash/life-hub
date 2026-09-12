import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertMeetingStateTransition,
  parseMeetingRecord,
  projectMeeting,
  validateMeetingCreateInput,
  validateMeetingRescheduleInput
} from '../../netlify/functions/_shared/meeting-schema.mjs';
import {
  assertEventStateTransition,
  parseEventRecord,
  validateEventCreateInput
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
  assert.ok(parseEventRecord(record));
  assert.equal(parseEventRecord({ ...record, provider_id: 'x' }), null);
  assertEventStateTransition('scheduled', 'completed');
  assert.throws(() => assertEventStateTransition('cancelled', 'scheduled'), (e) => e.code === 'invalid_state_transition');
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
