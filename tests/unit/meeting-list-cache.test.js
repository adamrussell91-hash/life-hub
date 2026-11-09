import test from 'node:test';
import assert from 'node:assert/strict';
import { createMeetingRepository } from '../../netlify/functions/_shared/meeting-repository.mjs';

// A store whose listing carries etags, like Netlify Blobs, and counts reads.
function etagStore({ etags = true } = {}) {
  const map = new Map();
  let version = 0;
  const reads = [];
  return {
    reads,
    map,
    async get(key, { type } = {}) {
      reads.push(key);
      if (!map.has(key)) return null;
      const { value } = map.get(key);
      return type === 'json' ? structuredClone(value) : value;
    },
    async setJSON(key, value) { map.set(key, { value: structuredClone(value), etag: `e${++version}` }); },
    async list({ prefix = '' } = {}) {
      return {
        blobs: [...map.entries()]
          .filter(([key]) => key.startsWith(prefix))
          .map(([key, { etag }]) => (etags ? { key, etag } : { key }))
      };
    }
  };
}

const meetingReads = (store) => store.reads.filter((key) => key.startsWith('meetings/'));

async function seed(store, titles) {
  const repo = createMeetingRepository({ store, env: {} });
  const ids = [];
  for (const [i, title] of titles.entries()) {
    const { meeting } = await repo.createMeeting({
      title,
      scheduled_start: `2026-11-1${i}T00:00:00.000Z`,
      scheduled_end: `2026-11-1${i}T01:00:00.000Z`,
      time_zone: 'Australia/Sydney'
    });
    ids.push(meeting.id);
  }
  return { repo, ids };
}

test('a second list reads no meetings when nothing changed', async () => {
  const store = etagStore();
  const { repo } = await seed(store, ['One', 'Two', 'Three']);
  const first = await repo.listMeetings();
  assert.deepEqual(first.map((m) => m.title), ['One', 'Two', 'Three']);

  store.reads.length = 0;
  const second = await repo.listMeetings();
  assert.deepEqual(second, first);
  assert.deepEqual(meetingReads(store), []);
});

test('an edit is read again and shows in the next list', async () => {
  const store = etagStore();
  const { repo, ids } = await seed(store, ['One', 'Two']);
  await repo.listMeetings();
  await repo.updateMeeting(ids[1], { title: 'Two, renamed' });

  store.reads.length = 0;
  const list = await repo.listMeetings();
  assert.deepEqual(list.map((m) => m.title), ['One', 'Two, renamed']);
  assert.deepEqual(meetingReads(store), [`meetings/records/${ids[1]}`]);
});

test('a meeting written straight to the store by another path still shows', async () => {
  const store = etagStore();
  const { repo, ids } = await seed(store, ['One']);
  await repo.listMeetings();
  const key = `meetings/records/${ids[0]}`;
  const record = store.map.get(key).value;
  await store.setJSON(key, { ...record, notes: 'Written by a background job' });

  const list = await repo.listMeetings();
  assert.equal(list[0].notes, 'Written by a background job');
});

test('new and removed meetings come and go', async () => {
  const store = etagStore();
  const { repo, ids } = await seed(store, ['One', 'Two']);
  await repo.listMeetings();
  store.map.delete(`meetings/index/${ids[0]}`);
  const { meeting } = await repo.createMeeting({
    title: 'Three',
    scheduled_start: '2026-11-20T00:00:00.000Z',
    scheduled_end: '2026-11-20T01:00:00.000Z',
    time_zone: 'Australia/Sydney'
  });
  const list = await repo.listMeetings();
  assert.deepEqual(list.map((m) => m.id), [ids[1], meeting.id]);
});

test('a store without etags reads everything every time and saves no copy', async () => {
  const store = etagStore({ etags: false });
  const { repo } = await seed(store, ['One', 'Two']);
  await repo.listMeetings();
  store.reads.length = 0;
  const list = await repo.listMeetings();
  assert.equal(list.length, 2);
  assert.ok(meetingReads(store).filter((key) => key.startsWith('meetings/records/')).length === 2);
  assert.equal(store.map.has('meeting-list-cache/v1'), false);
});
