import test from 'node:test';
import assert from 'node:assert/strict';
import {
  notionRowPeople,
  projectMeetingSchedule,
  projectNotionCommunicationSchedule
} from '../../netlify/functions/_shared/schedule-projection.mjs';
import { professionalEventsFromProjections } from '../../packages/design-kit/js/calendar/professional-calendar.js';
import { buildTidelineModel, withMeta } from '../../packages/design-kit/js/calendar/tideline-model.js';

const MEETING = {
  id: 'meeting_00000000-0000-4000-8000-000000000001',
  title: 'HSC English Catch-up',
  scheduled_start: '2026-09-30T05:30:00.000Z',
  scheduled_end: '2026-09-30T06:30:00.000Z',
  time_zone: 'Australia/Sydney',
  location_text: 'Library',
  state: 'scheduled'
};

test('a meeting projection carries where it is and who it is with', () => {
  const projection = projectMeetingSchedule(MEETING, ['Rohan Arianayagam']);
  assert.equal(projection.location, 'Library');
  assert.deepEqual(projection.with, ['Rohan Arianayagam']);
  const [row] = professionalEventsFromProjections([projection]);
  assert.equal(row.record.location, 'Library');
  assert.deepEqual(row.record.with, ['Rohan Arianayagam']);
});

test('a meeting with no one linked and no place projects empty context, not undefined', () => {
  const projection = projectMeetingSchedule({ ...MEETING, location_text: null });
  assert.equal(projection.location, null);
  assert.deepEqual(projection.with, []);
  const [row] = professionalEventsFromProjections([projection]);
  assert.equal('location' in row.record, false);
  assert.equal('with' in row.record, false);
});

test('Notion rows name attendees and the student, without the emoji or the operator', () => {
  const row = {
    notion_id: 'a'.repeat(32),
    title: 'Roaring Start planning',
    method: 'In-person Meeting',
    date_start: '2026-03-02T23:00:00.000Z',
    date_end: '2026-03-02T23:30:00.000Z',
    location: ' Library ',
    student_name: 'Aden D.',
    attendees: [
      { name: '👤 Adam Russell' },
      { name: '👤 Tania Hough' }
    ]
  };
  assert.deepEqual(notionRowPeople(row, 'Adam Russell'), ['Tania Hough', 'Aden D.']);
  const projection = projectNotionCommunicationSchedule(row, { selfName: 'Adam Russell' });
  assert.equal(projection.location, 'Library');
  assert.deepEqual(projection.with, ['Tania Hough', 'Aden D.']);
});

test('meeting chips read time · with · where', () => {
  assert.equal(withMeta('3:30 pm – 4:30 pm', { with: ['Rohan Arianayagam'], location: 'Library' }), '3:30 pm – 4:30 pm · with Rohan Arianayagam · Library');
  assert.equal(withMeta('9 am', { with: ['A', 'B', 'C', 'D'] }), '9 am · with A, B +2');
  assert.equal(withMeta('9 am', {}), '9 am');

  const [event] = professionalEventsFromProjections([projectMeetingSchedule(MEETING, ['Rohan Arianayagam'])]);
  const model = buildTidelineModel({
    events: [event],
    visual: null,
    week: ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'],
    today: '2026-09-30',
    nowHour: 12,
    terms: [{ term: 3, starts_on: '2026-07-21', ends_on: '2026-09-25' }, { term: 4, starts_on: '2026-10-13', ends_on: '2026-12-17' }]
  });
  const chip = model.days.flatMap((day) => day.chips).find((item) => item.title === 'HSC English Catch-up');
  assert.equal(chip.meta, '3:30 pm – 4:30 pm · with Rohan Arianayagam · Library');
});
