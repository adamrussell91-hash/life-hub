import test from 'node:test';
import assert from 'node:assert/strict';
import { createMeetingRepository } from '../../netlify/functions/_shared/meeting-repository.mjs';

function memoryStore() {
  const map = new Map();
  return {
    async get(key, { type } = {}) {
      if (!map.has(key)) return null;
      const raw = map.get(key);
      return type === 'json' ? structuredClone(raw) : raw;
    },
    async setJSON(key, value) { map.set(key, structuredClone(value)); },
    async set(key, value) { map.set(key, value); },
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) };
    }
  };
}

const CORRECTED = {
  scheduled_start: '2026-10-28T00:00:00.000Z',
  scheduled_end: '2026-10-28T00:20:00.000Z',
  time_zone: 'Australia/Sydney'
};

async function seeded() {
  const repo = createMeetingRepository({ store: memoryStore(), env: {} });
  const { meeting } = await repo.createMeeting({
    title: 'Faculty meeting',
    scheduled_start: '2026-10-28T00:00:00.000Z',
    scheduled_end: '2026-10-28T12:20:00.000Z',
    time_zone: 'Australia/Sydney'
  });
  return { repo, meeting };
}

for (const state of ['completed', 'cancelled', 'no_show']) {
  test(`a ${state} meeting's time can be corrected and it stays ${state}`, async () => {
    const { repo, meeting } = await seeded();
    await repo.transitionState(meeting.id, state);
    const fixed = await repo.rescheduleMeeting(meeting.id, CORRECTED);
    assert.equal(fixed.scheduled_end, CORRECTED.scheduled_end);
    assert.equal(fixed.state, state);
    assert.equal(fixed.occurrence_history.at(-1).scheduled_end, '2026-10-28T12:20:00.000Z');
    const reread = await repo.getMeeting(meeting.id);
    assert.equal(reread.scheduled_end, CORRECTED.scheduled_end);
  });
}

test('an open meeting still becomes rescheduled when its time moves', async () => {
  const { repo, meeting } = await seeded();
  const moved = await repo.rescheduleMeeting(meeting.id, CORRECTED);
  assert.equal(moved.state, 'rescheduled');
});
