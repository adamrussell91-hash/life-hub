import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateMinutesPending, validateMeetingFieldUpdate, projectMeeting, parseMeetingRecord
} from '../../netlify/functions/_shared/meeting-schema.mjs';

const MEETING = 'meeting_00000000-0000-4000-8000-000000000001';
const good = () => ({
  file_key: `meeting-minutes/${MEETING}/1762000000000.pdf`,
  added_at: '2026-11-01T02:00:00.000Z',
  source: 'chat',
  note: 'Faculty minutes from the head teacher'
});
const stored = (extra = {}) => ({
  schema_version: 2, id: MEETING, title: 'Faculty meeting', scheduled_start: '2026-11-01T00:00:00.000Z',
  scheduled_end: '2026-11-01T01:00:00.000Z', time_zone: 'Australia/Sydney', state: 'scheduled',
  occurrence_history: [], created_at: 'x', updated_at: 'x', ...extra
});

test('validateMinutesPending keeps a well-formed record, trims the note and allows null', () => {
  assert.deepEqual(validateMinutesPending(good()), good());
  assert.equal(validateMinutesPending(null), null);
  assert.equal(validateMinutesPending({ ...good(), note: '  hi  ' }).note, 'hi');
  assert.equal(validateMinutesPending({ ...good(), note: '   ' }).note, null);
  assert.equal(validateMinutesPending({ ...good(), note: undefined }).note, null);
  assert.equal(validateMinutesPending({ ...good(), note: 'x'.repeat(300) }).note.length, 300);
});

test('validateMinutesPending rejects bad keys, sources, timestamps and notes', () => {
  const bad = [
    'nope', [], { ...good(), file_key: '../secrets.pdf' }, { ...good(), file_key: null },
    { ...good(), source: 'page' }, { ...good(), added_at: 'yesterday' },
    { ...good(), note: 7 }, { ...good(), note: 'x'.repeat(301) }
  ];
  for (const value of bad) {
    assert.throws(() => validateMinutesPending(value), { code: 'invalid_minutes_pending' }, JSON.stringify(value)?.slice(0, 60));
  }
});

test('field update, parse and projection carry minutes_pending', () => {
  assert.deepEqual(validateMeetingFieldUpdate({ minutes_pending: good() }).minutes_pending, good());
  assert.equal(validateMeetingFieldUpdate({ minutes_pending: null }).minutes_pending, null);
  assert.throws(() => validateMeetingFieldUpdate({ minutes_pending: { source: 'chat' } }), { code: 'invalid_minutes_pending' });
  assert.deepEqual(parseMeetingRecord(stored({ minutes_pending: good() })).minutes_pending, good());
  assert.equal(parseMeetingRecord(stored()).minutes_pending, null);
  assert.equal(parseMeetingRecord(stored({ minutes_pending: [] })).minutes_pending, null);
  assert.deepEqual(projectMeeting({ id: MEETING, minutes_pending: good() }).minutes_pending, good());
  assert.equal(projectMeeting({ id: MEETING }).minutes_pending, null);
});
