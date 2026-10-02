import assert from 'node:assert/strict';
import test from 'node:test';
import { applyProfessionalStep, ghostProfessionalAcceptKey } from '../../netlify/functions/calendar-ghosts.mjs';
import { createMeetingRepository } from '../../netlify/functions/_shared/meeting-repository.mjs';
import { createEventRepository } from '../../netlify/functions/_shared/event-repository.mjs';

// Real repositories, not mocks: their create validators reject unknown fields,
// so anything the ghost accept adds to the input must be a field they accept.
function memoryStore() {
  const map = new Map();
  return {
    async get(key, { type } = {}) {
      if (!map.has(key)) return null;
      const raw = map.get(key);
      return type === 'json' ? structuredClone(raw) : raw;
    },
    async setJSON(key, value) {
      map.set(key, structuredClone(value));
    },
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })) };
    },
    _map: map
  };
}

function deps() {
  const store = memoryStore();
  const meetings = createMeetingRepository({ store, env: {} });
  const events = createEventRepository({ store, env: {} });
  const memo = new Map();
  return {
    createMeeting: (input) => meetings.createMeeting(input),
    createEvent: (input) => events.createEvent(input),
    getJSON: async (key) => memo.get(key) ?? null,
    setJSON: async (key, value) => { memo.set(key, value); },
    memo
  };
}

test('pro_meeting ghost accept creates a Meeting through the real repository', async () => {
  const d = deps();
  const step = {
    target: 'professional',
    action: 'create_meeting',
    title: 'HSC Meeting — Rohan',
    date: '2026-10-02',
    start: '12:30',
    end: '13:15',
    time_zone: 'Australia/Sydney'
  };
  const meeting = await applyProfessionalStep(d, step, { ghostId: 'clare-pro_meeting-2026-10-02-d1733a28' });
  assert.equal(meeting.title, 'HSC Meeting — Rohan');
  assert.ok(d.memo.get(ghostProfessionalAcceptKey('clare-pro_meeting-2026-10-02-d1733a28')));

  // Retry returns the remembered record rather than creating a second Meeting.
  const again = await applyProfessionalStep(d, step, { ghostId: 'clare-pro_meeting-2026-10-02-d1733a28' });
  assert.equal(again.id, meeting.id);
});

test('pro_event ghost accept creates an Event through the real repository', async () => {
  const d = deps();
  const event = await applyProfessionalStep(d, {
    target: 'professional',
    action: 'create_event',
    title: 'Mod C PD',
    date: '2026-10-02',
    start: '15:00',
    end: '16:00',
    time_zone: 'Australia/Sydney'
  }, { ghostId: 'clare-pro_event-2026-10-02-abc' });
  assert.equal(event.title, 'Mod C PD');
});
