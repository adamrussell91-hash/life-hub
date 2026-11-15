import test from 'node:test';
import assert from 'node:assert/strict';
import { organiserHabits } from '../../netlify/functions/_shared/organiser.mjs';
import { workOwner } from '../../netlify/functions/_shared/lesson-work.mjs';

function storeFixture(entries = []) {
  const data = new Map(entries.map(([k, v]) => [k, structuredClone(v)]));
  return {
    data,
    async get(key) { return structuredClone(data.get(key) ?? null); },
    async getWithMetadata(key) { return data.has(key) ? { data: structuredClone(data.get(key)), etag: 'e' } : null; },
    async setJSON(key, value, options) {
      if (options?.onlyIfNew && data.has(key)) return { modified: false };
      data.set(key, structuredClone(value)); return { modified: true };
    },
    async delete(key) { data.delete(key); },
    async list({ prefix }) { return { blobs: [...data.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; }
  };
}

test('habits list the practice days of the last 28, sorted', async () => {
  const owner = workOwner('class1', 'st_a');
  const store = storeFixture([[`organiser_practice/class1/${owner}`, { boxes: {
    a: { box: 2, last: '2026-11-14', h: [{ d: '2026-11-14', ok: true }, { d: '2026-11-10', ok: false }, { d: '2026-09-01', ok: true }] },
    b: { box: 1, h: [{ d: '2026-11-12', ok: true }] }
  } }]]);
  const habits = await organiserHabits(store, 'class1', 'st_a', { now: new Date('2026-11-15T01:00:00Z') });
  assert.deepEqual(habits.days, ['2026-11-10', '2026-11-12', '2026-11-14']);
});
