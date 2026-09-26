import test from 'node:test';
import assert from 'node:assert/strict';
import { professionalEventsFromProjections } from '../../apps/life/js/shell/professional-calendar.js';

test('professional calendar merge emits one row per projection_id', () => {
  const projections = [
    {
      projection_id: 'proj_a',
      source_ref: 'professional:meeting:meeting_1',
      kind: 'meeting',
      title: 'Seth',
      start: '2026-09-15T01:00:00.000Z',
      end: '2026-09-15T02:00:00.000Z',
      time_zone: 'Australia/Sydney',
      all_day: false,
      status: 'scheduled'
    },
    {
      projection_id: 'proj_a',
      source_ref: 'professional:meeting:meeting_1',
      kind: 'meeting',
      title: 'Seth updated',
      start: '2026-09-16T01:00:00.000Z',
      end: '2026-09-16T02:00:00.000Z',
      time_zone: 'Australia/Sydney',
      all_day: false,
      status: 'rescheduled'
    },
    {
      projection_id: 'proj_b',
      source_ref: 'professional:event:event_1',
      kind: 'event',
      title: 'PD',
      start: '2026-10-01T00:00:00.000Z',
      end: '2026-10-01T06:00:00.000Z',
      time_zone: 'Australia/Sydney',
      all_day: false,
      status: 'scheduled'
    }
  ];
  const events = professionalEventsFromProjections(projections);
  assert.equal(events.length, 2);
  assert.equal(events[0].record.type, 'professional_meeting');
  assert.equal(events[0].record.title, 'Seth');
  assert.equal(events[1].record.type, 'professional_event');
});

import { projectEventSchedule, projectCommunicationSchedule } from '../../netlify/functions/_shared/schedule-projection.mjs';
import { professionalEventsFromProjections as kitProfessionalEventsFromProjections } from '../../packages/design-kit/js/calendar/professional-calendar.js';
import { filterKeyForItem } from '../../packages/design-kit/js/calendar/calendar-filter.js';

test('timed comms project as blocks; logged comms as pins', () => {
  const base = {
    id: 'communication_00000000-0000-4000-8000-000000000001',
    subject: 'Declan essay feedback',
    channel: 'in_person',
    direction: 'outbound',
    status: 'completed',
    occurred_at: '2026-10-14T00:50:00.000Z',
    time_zone: 'Australia/Sydney',
    scheduled_start: '2026-10-14T00:50:00.000Z',
    scheduled_end: '2026-10-14T01:05:00.000Z'
  };
  const timed = projectCommunicationSchedule(base);
  assert.equal(timed.kind, 'communication');
  assert.equal(timed.pin, false);
  assert.equal(timed.end, '2026-10-14T01:05:00.000Z');
  assert.equal(timed.href, '/professional/#/communication/communication_00000000-0000-4000-8000-000000000001');

  const logged = projectCommunicationSchedule({ ...base, channel: 'email', scheduled_start: null, scheduled_end: null, time_zone: null });
  assert.equal(logged.pin, true);
  assert.equal(logged.start, '2026-10-14T00:50:00.000Z');
  assert.equal(logged.time_zone, 'Australia/Sydney');
});


test('non-PD events project event_type and filter to Events', () => {
  const projection = projectEventSchedule({
    id: 'event_00000000-0000-4000-8000-000000000001',
    title: 'HALT medal ceremony',
    event_type: 'ceremony',
    start: '2026-09-25T08:00:00.000Z',
    end: '2026-09-25T09:45:00.000Z',
    time_zone: 'Australia/Sydney',
    all_day: false,
    occurrence_state: 'completed'
  });
  assert.equal(projection.event_type, 'ceremony');
  const [row] = kitProfessionalEventsFromProjections([projection]);
  assert.equal(row.record.event_type, 'ceremony');
  assert.equal(filterKeyForItem(row), 'events');
});
