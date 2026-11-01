import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateMinutes, validateDecisions, validateMeetingFieldUpdate, projectMeeting, parseMeetingRecord
} from '../../netlify/functions/_shared/meeting-schema.mjs';

const MEETING = 'meeting_00000000-0000-4000-8000-000000000001';
const good = () => ({
  sections: [{ heading: 'Assessment', text: 'Exams move to Week 8.' }],
  file_key: `meeting-minutes/${MEETING}/1762000000000.pdf`,
  source: 'page',
  added_at: '2026-11-01T02:00:00.000Z',
  saved_counts: { tasks: 1, promises: 2, decisions: 1 }
});

test('validateMinutes keeps a well-formed record and allows null', () => {
  assert.deepEqual(validateMinutes(good()), good());
  assert.equal(validateMinutes(null), null);
  assert.equal(validateMinutes({ ...good(), file_key: null }).file_key, null);
});

test('validateMinutes rejects bad keys, sources, sizes and counts', () => {
  assert.throws(() => validateMinutes({ ...good(), file_key: '../secrets.pdf' }), { code: 'invalid_minutes' });
  assert.throws(() => validateMinutes({ ...good(), source: 'email' }), { code: 'invalid_minutes' });
  assert.throws(() => validateMinutes({ ...good(), sections: 'x' }), { code: 'invalid_minutes' });
  assert.throws(() => validateMinutes({ ...good(), sections: Array.from({ length: 41 }, () => ({ heading: 'h', text: 't' })) }), { code: 'invalid_minutes' });
  assert.throws(() => validateMinutes({ ...good(), saved_counts: { tasks: -1, promises: 0, decisions: 0 } }), { code: 'invalid_minutes' });
  assert.throws(() => validateMinutes({ ...good(), added_at: 'yesterday' }), { code: 'invalid_minutes' });
});

test('validateMinutes trims long section text', () => {
  const out = validateMinutes({ ...good(), sections: [{ heading: 'H', text: 'x'.repeat(9000) }] });
  assert.equal(out.sections[0].text.length, 6000);
});

test('decisions keep source minutes and drop unknown sources', () => {
  const out = validateDecisions([
    { id: 'd_1', text: 'From notes', agenda_heading: null },
    { id: 'dm_1', text: 'From minutes', agenda_heading: 'Assessment', source: 'minutes' },
    { id: 'd_2', text: 'Odd', agenda_heading: null, source: 'fax' }
  ]);
  assert.equal(out[0].source, undefined);
  assert.equal(out[1].source, 'minutes');
  assert.equal(out[2].source, undefined);
});

test('field update accepts minutes; projection and parse carry it', () => {
  assert.deepEqual(validateMeetingFieldUpdate({ minutes: good() }).minutes, good());
  const record = { id: MEETING, title: 'T', state: 'scheduled', minutes: good() };
  assert.deepEqual(projectMeeting(record).minutes, good());
  assert.equal(projectMeeting({ id: MEETING, title: 'T', state: 'scheduled' }).minutes, null);
  assert.equal(parseMeetingRecord({ schema_version: 2, id: MEETING, title: 'T', scheduled_start: '2026-11-01T00:00:00.000Z', scheduled_end: '2026-11-01T01:00:00.000Z', time_zone: 'Australia/Sydney', state: 'scheduled', occurrence_history: [], created_at: 'x', updated_at: 'x', minutes: good() }).minutes.source, 'page');
});
