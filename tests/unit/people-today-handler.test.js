import test from 'node:test';
import assert from 'node:assert/strict';
import { createPeopleTodayHandler } from '../../netlify/functions/people-today.mjs';
import { nextSchoolDayKey } from '../../netlify/functions/_shared/today-availability.mjs';

function memoryStore(entries = {}) {
  const records = new Map(Object.entries(entries));
  return {
    get: async key => (records.has(key) ? structuredClone(records.get(key)) : null),
    list: async ({ prefix }) => ({
      blobs: [...records.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key }))
    })
  };
}

test('people today: reads Tasks work blocks into the strip instead of failing', async () => {
  const dayKey = nextSchoolDayKey(new Date());
  const tasksStore = memoryStore({
    'work_blocks/wb1': {
      id: 'wb1',
      title: 'Marking block',
      date: dayKey,
      start_time: '14:00',
      end_time: '15:00'
    }
  });
  const handler = createPeopleTodayHandler({
    env: { LIFE_HUB_PASSPHRASE_HASH: 'test-only', SESSION_SECRET: 'x'.repeat(32) },
    verifySessionToken: () => ({ valid: true }),
    professionalStore: memoryStore(),
    tasksStore
  });
  const response = await handler(
    new Request('https://life-hub.adam-russell.com/api/people/today', { method: 'GET' })
  );
  assert.equal(response.status, 200, await response.clone().text());
  const { data } = await response.json();
  assert.equal(data.day_key, dayKey);
  assert.ok(data.slots.some(slot => slot.title === 'Marking block'));
});
