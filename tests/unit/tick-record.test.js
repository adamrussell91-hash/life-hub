import test from 'node:test';
import assert from 'node:assert/strict';
import { appendTickEvent, listTickRecords, recordDone, undoTick, TICK_RECORD_MAX } from '../../netlify/functions/_shared/profile-done.mjs';

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

const kinds = (events) => events.map((e) => e.kind);

test('tick, untick, tick keeps three events in order', async () => {
  const store = storeFixture();
  await recordDone(store, 'class1', 'st_a', 'l1', 'tick');
  await undoTick(store, 'class1', 'st_a', 'l1');
  await recordDone(store, 'class1', 'st_a', 'l1', 'tick');
  const records = await listTickRecords(store, 'class1', 'st_a');
  assert.deepEqual(kinds(records.l1), ['tick', 'untick', 'tick']);
  assert.ok(records.l1[0].at <= records.l1[2].at);
});

test('a repeat tick on a ticked lesson adds nothing', async () => {
  const store = storeFixture();
  await recordDone(store, 'class1', 'st_a', 'l1', 'tick');
  await recordDone(store, 'class1', 'st_a', 'l1', 'tick');
  assert.deepEqual(kinds((await listTickRecords(store, 'class1', 'st_a')).l1), ['tick']);
});

test('a quiz submission is recorded as quiz', async () => {
  const store = storeFixture();
  await recordDone(store, 'class1', 'st_a', 'l2', 'quiz');
  assert.deepEqual(kinds((await listTickRecords(store, 'class1', 'st_a')).l2), ['quiz']);
});

test('an untick with nothing ticked adds nothing', async () => {
  const store = storeFixture();
  await undoTick(store, 'class1', 'st_a', 'l1');
  assert.deepEqual(await listTickRecords(store, 'class1', 'st_a'), {});
});

test('the record caps at TICK_RECORD_MAX and keeps the first event', async () => {
  const store = storeFixture();
  for (let i = 0; i < TICK_RECORD_MAX + 5; i += 1) await appendTickEvent(store, 'class1', 'st_a', 'l1', i % 2 ? 'untick' : 'tick', new Date(Date.UTC(2026, 10, 1, 0, i)).toISOString());
  const events = (await listTickRecords(store, 'class1', 'st_a')).l1;
  assert.equal(events.length, TICK_RECORD_MAX);
  assert.equal(events[0].at, '2026-11-01T00:00:00.000Z');
  assert.equal(events.at(-1).at, new Date(Date.UTC(2026, 10, 1, 0, TICK_RECORD_MAX + 4)).toISOString());
});

test('a failing record write leaves the tick in place', async () => {
  const store = storeFixture();
  const setJSON = store.setJSON.bind(store);
  store.setJSON = async (key, value, options) => {
    if (key.includes('/ticks/')) throw new Error('store down');
    return setJSON(key, value, options);
  };
  const warn = console.warn;
  console.warn = () => {};
  try {
    await recordDone(store, 'class1', 'st_a', 'l1', 'tick');
  } finally {
    console.warn = warn;
  }
  assert.equal(store.data.get('profile/class1/st_a/done/l1').via, 'tick');
});
