import test from 'node:test';
import assert from 'node:assert/strict';
import { slotClashNote, withClashNote } from '../../netlify/functions/chat.mjs';
import {
  AGENT_CALENDAR_SOURCES,
  mergeAgentCalendarSlots
} from '../../netlify/functions/_shared/agent-calendar-merge.mjs';

const DAY = '2026-10-05';
const live = Object.fromEntries(AGENT_CALENDAR_SOURCES.map((id) => [id, { status: 'live', count: 0, error: null }]));
const merge = mergeAgentCalendarSlots({
  professionalEvents: [{
    path: 'professional:m1',
    record: { type: 'professional_meeting', id: 'm1', date: DAY, time: '11:00', end_time: '12:00', title: 'Staff briefing' }
  }],
  sourceStatus: live
});

test('a clash is a note, and the proposal result stays ok', () => {
  const note = slotClashNote(merge, { date: DAY, start: '11:30', end: '13:00' });
  assert.equal(note.warning, 'calendar_conflict');
  assert.match(note.message, /Scheduled anyway/);
  assert.match(note.message, /Staff briefing/);

  const out = JSON.parse(withClashNote({ ok: true, id: 'g1', ghost_status: 'queued' }, note));
  assert.equal(out.ok, true);
  assert.equal(out.ghost_status, 'queued');
  assert.equal(out.clash_note.conflicts[0].title, 'Staff briefing');
});

test('a clear slot adds no note', () => {
  assert.equal(slotClashNote(merge, { date: DAY, start: '13:00', end: '14:00' }), null);
  assert.deepEqual(JSON.parse(withClashNote({ ok: true }, null)), { ok: true });
});

test('an unloadable calendar is a note, not a refusal', () => {
  const note = slotClashNote(null, { date: DAY, start: '11:00', end: '12:00' });
  assert.equal(note.warning, 'calendar_unchecked');
  assert.equal(JSON.parse(withClashNote({ ok: true }, note)).ok, true);
});
