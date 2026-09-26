// tests/unit/goal-ghosts.test.js
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { taskKey, TASKS_INDEX_KEY } from '../../netlify/functions/_shared/tasks-blobs.mjs';
import { createCalendarGhostsHandler, ghostTaskId } from '../../netlify/functions/calendar-ghosts.mjs';
import { goalReadKey } from '../../netlify/functions/goal-reads.mjs';

const NOW = Date.parse('2026-11-04T09:00:00+11:00');
const SECRET = 's'.repeat(32);
const ENV = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured', SESSION_SECRET: SECRET, GITHUB_REPOSITORY: 'life-owner/life-repo',
  GITHUB_BRANCH: 'main', GITHUB_TOKEN: 'github-secret-token', GITHUB_TOKEN_EXPIRES: '2026-12-01'
};
const SESSION = createSessionToken({ now: NOW, randomBytes: () => Buffer.alloc(16, 4) }, SECRET).token;
const CN = await readFile(new URL('../fixtures/valid/central-node.md', import.meta.url), 'utf8');

function sha(text) { return createHash('sha256').update(text).digest('hex').slice(0, 40); }

function memoryGitHub(initial) {
  const files = new Map(initial);
  let head = 'a'.repeat(40);
  const commits = [];
  return {
    files, commits,
    async resolveTree() {
      return { commitSha: head, treeSha: head, tree: [...files.entries()].map(([path, content]) => ({ path, type: 'blob', sha: sha(content), size: Buffer.byteLength(content) })) };
    },
    async readBlob(blobSha) {
      for (const content of files.values()) {
        if (sha(content) === blobSha) return { encoding: 'base64', content: Buffer.from(content).toString('base64'), sha: blobSha, size: Buffer.byteLength(content) };
      }
      throw new Error('missing blob');
    },
    async commitFiles({ files: next, message, parentSha }) {
      if (parentSha !== head) throw new Error('write_conflict');
      for (const file of next) files.set(file.path, file.content);
      head = sha(`${head}\0${message}`);
      commits.push({ message, paths: next.map(file => file.path) });
      return { commitSha: head };
    }
  };
}

function memoryTasks(seed) {
  const data = new Map([[TASKS_INDEX_KEY, []], ...Object.entries(seed)]);
  return {
    data,
    async get(key, options) { const v = data.get(key); return v == null ? null : (options?.type === 'json' ? structuredClone(v) : v); },
    async setJSON(key, value) { data.set(key, structuredClone(value)); },
    async set(key, value) { data.set(key, typeof value === 'string' ? JSON.parse(value) : value); },
    async list({ prefix = '' } = {}) { return { blobs: [...data.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) }; }
  };
}

function harness() {
  const github = memoryGitHub(new Map([['central-node.md', CN]]));
  const store = memoryTasks({
    'meta/hub_prefs': { school_terms: [{ year: 2026, terms: [{ term: 4, starts_on: '2026-10-12', ends_on: '2026-12-18' }] }] },
    'goals/_index': ['g1'],
    'goals/g1': { schema_version: 1, id: 'g1', title: 'HA evidence', sphere: 'professional', status: 'active', created_at: 'a', updated_at: '2026-10-20T00:00:00.000Z' },
    'tasks/t1': { id: 't1', title: 'Write up 6.3', parent_goal_id: 'g1', status: 'open', kind: 'task', bucket: 'active', domain: 'other', due_date: '2026-11-06', updated_at: '2026-10-01T00:00:00.000Z' }
  });
  const handler = createCalendarGhostsHandler({
    env: ENV, now: () => NOW, createGitHubClient: () => github, getTasksStore: async () => store,
    loadLessons: async () => [], loadProfessionalEvents: async () => []
  });
  return { handler, github, store };
}

function post(body) {
  return new Request('https://life.example/api/calendar-ghosts', {
    method: 'POST',
    headers: { cookie: `life_hub_session=${SESSION}`, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

test('accepting a split proposal writes the steps and one Central Node line', async () => {
  const { handler, github, store } = harness();
  const response = await handler(post({ id: 'goal-g1-split-t1', decision: 'accept' }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.match(body.receipt, /now has 3 steps/);
  for (const n of [1, 2, 3]) {
    const step = store.data.get(taskKey(`${ghostTaskId('goal-g1-split-t1')}-s${n}`));
    assert.equal(step.kind, 'step');
    assert.equal(step.parent_task_id, 't1');
    assert.equal(step.parent_goal_id, 'g1');
  }
  assert.equal(github.commits.length, 1);
  assert.deepEqual(github.commits[0].paths, ['central-node.md']);
  assert.equal(store.data.get(goalReadKey('g1'))?.read ?? null, null);
});

test('dismissing records the id and writes nothing else', async () => {
  const { handler, github, store } = harness();
  const response = await handler(post({ id: 'goal-g1-split-t1', decision: 'dismiss' }));
  assert.equal(response.status, 200);
  assert.deepEqual(store.data.get(goalReadKey('g1')).dismissed, ['goal-g1-split-t1']);
  assert.equal(github.commits.length, 0);
});

test('accept uses the cached proposal when a fresh read would omit it', async () => {
  const { handler, store } = harness();
  store.data.set(goalReadKey('g1'), {
    read: {
      ghosts: [{
        id: 'goal-g1-start',
        agent: 'hammond',
        kind: 'create_task',
        title: 'First step: Study at Cambridge',
        due: '2026-11-06',
        goalId: 'g1',
        domain: 'other',
        reason: 'Nothing is open under this goal'
      }]
    },
    dismissed: []
  });
  const response = await handler(post({ id: 'goal-g1-start', decision: 'accept' }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.match(body.receipt, /First step: Study at Cambridge/);
  const created = [...store.data.values()].find(value => value && value.title === 'First step: Study at Cambridge');
  assert.equal(created.parent_goal_id, 'g1');
  assert.equal(store.data.get(goalReadKey('g1'))?.read ?? null, null);
});

test('a proposal that no longer applies is a 404', async () => {
  const { handler } = harness();
  assert.equal((await handler(post({ id: 'goal-g1-move-t1', decision: 'accept' }))).status, 404);
  assert.equal((await handler(post({ id: 'goal-nope-start', decision: 'accept' }))).status, 404);
});
