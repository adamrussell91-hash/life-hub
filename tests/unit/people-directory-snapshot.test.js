import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIRECTORY_SNAPSHOT_KEY,
  createPeopleDirectoryHandler
} from '../../netlify/functions/people-directory.mjs';

const ORIGIN = 'https://life-hub.adam-russell.com';
const env = { SITE_ORIGIN: ORIGIN, SESSION_SECRET: 'x'.repeat(32), LIFE_HUB_PASSPHRASE_HASH: 'y' };
const SCANNED_AT = new Date('2026-10-20T03:14:00.000Z');

function memoryStore(seed = {}, { failWrites = false } = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    async get(key) {
      return map.has(key) ? structuredClone(map.get(key)) : null;
    },
    async setJSON(key, value) {
      if (failWrites) throw new Error('write failed');
      map.set(key, structuredClone(value));
    }
  };
}

function handlerFor(store, scans) {
  return createPeopleDirectoryHandler({
    env,
    getContentStore: async () => store,
    verifySessionToken: () => ({ valid: true }),
    now: () => SCANNED_AT,
    loadAllPeopleWithRelationships: async () => {
      scans.count += 1;
      return [];
    },
    assemblePeopleDirectory: () => ({
      people: [{ id: 'p1', display_name: 'Rowan Example' }],
      organisations: [],
      counts: { people: 1, organisations: 0 }
    })
  });
}

function get(path) {
  return new Request(`https://api.adam-russell.com${path}`, {
    headers: { origin: ORIGIN, cookie: 'life_hub_session=ok' }
  });
}

test('a scan saves the directory as the snapshot', async () => {
  const store = memoryStore();
  const scans = { count: 0 };
  const res = await handlerFor(store, scans)(get('/api/people/directory?fresh=1'));
  assert.equal(res.status, 200);
  assert.equal(scans.count, 1);
  const saved = store.map.get(DIRECTORY_SNAPSHOT_KEY);
  assert.equal(saved.as_of, SCANNED_AT.toISOString());
  assert.equal(saved.directory.people[0].display_name, 'Rowan Example');
});

test('?snapshot=1 serves the saved copy with its time and never scans', async () => {
  const store = memoryStore({
    [DIRECTORY_SNAPSHOT_KEY]: {
      as_of: '2026-10-19T01:00:00.000Z',
      directory: { people: [{ id: 'p2', display_name: 'Sam Placeholder' }], organisations: [], counts: { people: 1, organisations: 0 } }
    }
  });
  const scans = { count: 0 };
  const res = await handlerFor(store, scans)(get('/api/people/directory?snapshot=1'));
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(scans.count, 0);
  assert.equal(body.data.as_of, '2026-10-19T01:00:00.000Z');
  assert.equal(body.data.people[0].display_name, 'Sam Placeholder');
});

test('?snapshot=1 returns null before any scan has run', async () => {
  const scans = { count: 0 };
  const res = await handlerFor(memoryStore(), scans)(get('/api/people/directory?snapshot=1'));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).data, null);
  assert.equal(scans.count, 0);
});

test('a failed snapshot write still returns the fresh directory', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const scans = { count: 0 };
  const res = await handlerFor(memoryStore({}, { failWrites: true }), scans)(get('/api/people/directory?fresh=1'));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).data.people[0].display_name, 'Rowan Example');
});
