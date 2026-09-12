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
