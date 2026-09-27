import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createNetworkEcologyWorldHandler } from '../../netlify/functions/network-ecology-world.mjs';
import { createNetworkEcologyWorldBuildHandler } from '../../netlify/functions/network-ecology-world-build.mjs';
import {
  WORLD_SNAPSHOT_KEY,
  WORLD_SNAPSHOT_VERSION,
  readWorldSnapshot
} from '../../netlify/functions/_shared/network-ecology-snapshot.mjs';
import { makeResolveEntity, memoryStore } from '../support/people-fixtures.mjs';

const SECRET = 's'.repeat(32);
const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  SITE_ORIGIN: 'https://life-hub.adam-russell.com'
};
const NOW = new Date('2026-09-17T00:00:00.000Z');
const session = createSessionToken({ now: NOW.getTime(), randomBytes: () => Buffer.alloc(16, 4) }, SECRET).token;
const URL_BASE = 'https://api.adam-russell.com/api/network-ecology/world';

function request(method = 'GET', url = URL_BASE) {
  return new Request(url, {
    method,
    headers: { cookie: `life_hub_session=${session}`, origin: 'https://life-hub.adam-russell.com' }
  });
}

function deps(store, professionalStore, overrides = {}) {
  return {
    env,
    now: () => NOW,
    getContentStore: async () => store,
    getProfessionalStore: async () => professionalStore,
    resolveEntity: makeResolveEntity(store, null, professionalStore),
    invokeWorldBuild: async () => true,
    ...overrides
  };
}

function storedWorld(builtAt, label = 'Snapshot person') {
  return {
    version: WORLD_SNAPSHOT_VERSION,
    built_at: builtAt,
    world: {
      nodes: [{ ref: 'shared:person:x', kind: 'person', label }],
      edges: [],
      clusters: [],
      bridge_people: [],
      links: [],
      timeline: {},
      upcoming_events: []
    }
  };
}

test('no snapshot: builds live, returns the world and stores a snapshot', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  let kicks = 0;
  const handler = createNetworkEcologyWorldHandler(deps(store, professionalStore, { invokeWorldBuild: async () => { kicks += 1; return true; } }));

  const response = await handler(request());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.built_at, NOW.toISOString());
  assert.equal(kicks, 0);

  const snapshot = await readWorldSnapshot(professionalStore);
  const { built_at: _builtAt, ...served } = body.data;
  assert.deepEqual(snapshot.world, served);
});

test('fresh snapshot is served without building or kicking a rebuild', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  await professionalStore.setJSON(WORLD_SNAPSHOT_KEY, storedWorld(new Date(NOW.getTime() - 30_000).toISOString()));
  let loads = 0;
  let kicks = 0;
  const handler = createNetworkEcologyWorldHandler(deps(store, professionalStore, {
    loadAllPeopleWithRelationships: async () => { loads += 1; return []; },
    invokeWorldBuild: async () => { kicks += 1; return true; }
  }));

  const body = await (await handler(request())).json();
  assert.equal(body.data.nodes[0].label, 'Snapshot person');
  assert.equal(loads, 0);
  assert.equal(kicks, 0);
});

test('stale snapshot is served immediately and kicks one background rebuild', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  await professionalStore.setJSON(WORLD_SNAPSHOT_KEY, storedWorld('2026-09-16T00:00:00.000Z'));
  let loads = 0;
  let kicks = 0;
  const handler = createNetworkEcologyWorldHandler(deps(store, professionalStore, {
    loadAllPeopleWithRelationships: async () => { loads += 1; return []; },
    invokeWorldBuild: async () => { kicks += 1; return true; }
  }));

  const first = await (await handler(request())).json();
  assert.equal(first.data.nodes[0].label, 'Snapshot person');
  await handler(request());
  assert.equal(loads, 0);
  assert.equal(kicks, 1, 'the build lock stops a second kick');
});

test('snapshot from an older version is ignored', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  await professionalStore.setJSON(WORLD_SNAPSHOT_KEY, { ...storedWorld(NOW.toISOString()), version: WORLD_SNAPSHOT_VERSION - 1 });
  const handler = createNetworkEcologyWorldHandler(deps(store, professionalStore));
  const body = await (await handler(request())).json();
  assert.equal(body.data.nodes.length, 0);
});

test('no snapshot and a build over budget: 202 world_building and a background kick', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  let kicks = 0;
  const handler = createNetworkEcologyWorldHandler(deps(store, professionalStore, {
    liveBuildBudgetMs: 10,
    loadAllPeopleWithRelationships: () => new Promise((resolve) => setTimeout(() => resolve([]), 100)),
    invokeWorldBuild: async () => { kicks += 1; return true; }
  }));

  const response = await handler(request());
  assert.equal(response.status, 202);
  const body = await response.json();
  assert.equal(body.ok, false);
  assert.equal(body.error.code, 'world_building');
  assert.equal(kicks, 1);
  await new Promise((resolve) => setTimeout(resolve, 150));
});

test('background build writes the snapshot and releases the lock', async () => {
  const store = memoryStore();
  const professionalStore = memoryStore();
  const build = createNetworkEcologyWorldBuildHandler(deps(store, professionalStore));

  const response = await build(request('POST', 'https://api.adam-russell.com/api/network-ecology/world-build'));
  assert.equal(response.status, 202);
  const snapshot = await readWorldSnapshot(professionalStore);
  assert.equal(snapshot.built_at, NOW.toISOString());
  assert.ok(Array.isArray(snapshot.world.nodes));
  const lock = await professionalStore.get('network-ecology/world-build-lock');
  assert.equal(lock.started_at, null);
});

test('background build rejects an unauthenticated request', async () => {
  const build = createNetworkEcologyWorldBuildHandler(deps(memoryStore(), memoryStore()));
  const response = await build(new Request('https://api.adam-russell.com/api/network-ecology/world-build', {
    method: 'POST',
    headers: { origin: 'https://life-hub.adam-russell.com' }
  }));
  assert.equal(response.status, 401);
});
