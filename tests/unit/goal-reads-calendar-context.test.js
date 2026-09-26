/**
 * G-30 / G-31 production wiring: default loadCalendarContext opens Life data
 * via createGitHubClient + githubOpenCommit + readEvents.
 */
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { GitHubClientError } from '../../netlify/functions/_shared/github-client.mjs';
import { renderMarkdown } from '../../netlify/functions/_shared/persist-log.mjs';
import {
  createGoalReadsHandler,
  defaultLoadCalendarContext,
  goalReadKey
} from '../../netlify/functions/goal-reads.mjs';

const SECRET = 's'.repeat(32);
const SESSION = createSessionToken(
  { now: Date.parse('2026-11-04T00:00:00Z'), randomBytes: () => Buffer.alloc(16, 4) },
  SECRET
).token;
const ENV = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  SITE_ORIGIN: 'https://life-hub.adam-russell.com',
  GITHUB_REPOSITORY: 'life-owner/life-repo',
  GITHUB_BRANCH: 'main',
  GITHUB_TOKEN: 'github-secret-token',
  GITHUB_TOKEN_EXPIRES: '2026-09-01'
};
const TODAY = '2026-11-04';
const NOW = Date.parse('2026-11-04T01:00:00Z');

function sha(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 40);
}

/** Same shape as tests/unit/almanac-api.test.js memoryGitHub. */
function memoryGitHub(initial) {
  const files = new Map(initial);
  let head = 'a'.repeat(40);
  const commits = [];
  return {
    files,
    commits,
    async resolveTree() {
      return {
        commitSha: head,
        treeSha: head,
        tree: [...files.entries()].map(([path, content]) => ({
          path, type: 'blob', sha: sha(content), size: Buffer.byteLength(content)
        }))
      };
    },
    async readBlob(blobSha) {
      for (const content of files.values()) {
        if (sha(content) === blobSha) {
          return {
            encoding: 'base64',
            content: Buffer.from(content).toString('base64'),
            sha: blobSha,
            size: Buffer.byteLength(content)
          };
        }
      }
      throw new GitHubClientError('repository_not_found', false);
    },
    async commitFiles({ files: next, message, parentSha }) {
      if (parentSha !== head) throw new GitHubClientError('write_conflict', true);
      for (const file of next) files.set(file.path, file.content);
      head = sha(`${head}\0${message}`);
      commits.push({ message, paths: next.map(file => file.path) });
      return { commitSha: head };
    }
  };
}

function memoryStore(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    async get(key, { type } = {}) {
      return map.has(key) ? (type === 'json' ? structuredClone(map.get(key)) : map.get(key)) : null;
    },
    async setJSON(key, value) { map.set(key, structuredClone(value)); },
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter(key => key.startsWith(prefix)).map(key => ({ key })) };
    }
  };
}

function request(url, { method = 'GET', body } = {}) {
  return new Request(url, {
    method,
    headers: {
      cookie: `life_hub_session=${SESSION}`,
      origin: 'https://life-hub.adam-russell.com',
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

function lifeFiles() {
  const calendar = renderMarkdown({
    schema_version: 1,
    id: 'cal-busy',
    type: 'calendar_block',
    kind: 'focus',
    date: '2026-11-05',
    time: '09:00',
    end_time: '12:00',
    title: 'Busy morning',
    status: 'confirmed',
    protected: false,
    created_at: '2026-11-01T00:00:00+11:00',
    updated_at: '2026-11-01T00:00:00+11:00',
    source: 'goal-reads-test'
  }, '');
  const composition = renderMarkdown({
    schema_version: 1,
    id: 'comp-1',
    type: 'composition',
    date: '2026-11-01',
    time: '07:00',
    weight_kg: 80,
    body_fat_pct: 14,
    created_at: '2026-11-01T00:00:00+11:00',
    updated_at: '2026-11-01T00:00:00+11:00',
    source: 'goal-reads-test'
  }, '');
  return new Map([
    ['data/calendar/2026/11/2026-11-05-busy.md', calendar],
    ['data/body/2026/11/2026-11-01-composition.md', composition]
  ]);
}

function seedGoals({ binding = false } = {}) {
  const goal = {
    schema_version: 1,
    id: 'g1',
    title: 'Recomp',
    sphere: 'life',
    status: 'active',
    lead_measure: { label: '4 sessions', per_week: 4 },
    week_log: {},
    rest_weeks: [],
    next_start: 'Lift session',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-10-20T00:00:00.000Z',
    ...(binding ? { signal: { source: 'binding_goal', row: 'fat' } } : {})
  };
  return memoryStore({
    'meta/hub_prefs': {
      school_terms: [{ year: 2026, terms: [{ term: 4, starts_on: '2026-10-12', ends_on: '2026-12-18' }] }]
    },
    'goals/_index': ['g1'],
    'goals/g1': goal,
    'tasks/t1': {
      id: 't1',
      title: 'Lift session',
      parent_goal_id: 'g1',
      status: 'open',
      kind: 'task',
      bucket: 'active',
      domain: 'life',
      due_date: '2026-11-06',
      estimated_duration: 45,
      updated_at: '2026-10-01T00:00:00.000Z'
    }
  });
}

function handlerWithGitHub(store, github) {
  return createGoalReadsHandler({
    env: ENV,
    now: () => NOW,
    getContentStore: async () => store,
    createGitHubClient: () => github
  });
}

test('(a) with no injected loader, handler uses default via createGitHubClient deps', async () => {
  const github = memoryGitHub(lifeFiles());
  let clientCalls = 0;
  const store = seedGoals();
  const handler = createGoalReadsHandler({
    env: ENV,
    now: () => NOW,
    getContentStore: async () => store,
    createGitHubClient: () => {
      clientCalls += 1;
      return github;
    }
  });
  const res = await handler(request('https://api.adam-russell.com/api/goal-reads?goal_id=g1'));
  assert.equal(res.status, 200);
  assert.equal(clientCalls, 1);
  const body = (await res.json()).data;
  assert.equal(body.read.goal_id, 'g1');
  assert.ok(body.read.looked_at.includes('Calendar'));
  assert.ok(body.read.looked_at.includes('Life Hub'));
});

test('(b) behind on lead measure gets goal-<id>-block-<date> protect_block', async () => {
  const store = seedGoals();
  const handler = handlerWithGitHub(store, memoryGitHub(lifeFiles()));
  const body = (await (await handler(request('https://api.adam-russell.com/api/goal-reads?goal_id=g1'))).json()).data;
  const block = body.read.ghosts.find(g => g.kind === 'protect_block');
  assert.ok(block, 'expected a protect_block ghost');
  assert.match(block.id, /^goal-g1-block-\d{4}-\d{2}-\d{2}$/);
  assert.equal(block.id, `goal-g1-block-${block.date}`);
  assert.equal(body.read.week.count, 0);
  assert.equal(body.read.week.per_week, 4);
});

test('(c) binding_goal signal fat row lands in the read with Calendar + Life Hub chips', async () => {
  const store = seedGoals({ binding: true });
  const handler = handlerWithGitHub(store, memoryGitHub(lifeFiles()));
  const body = (await (await handler(request('https://api.adam-russell.com/api/goal-reads?goal_id=g1'))).json()).data;
  assert.ok(body.read.looked_at.includes('Calendar'));
  assert.ok(body.read.looked_at.includes('Life Hub'));
  assert.match(body.read.verdict, /14%/);
  assert.match(body.read.signal_detail ?? '', /14%/);
  assert.ok(body.read.signal_detail.includes('above') || body.read.verdict.includes('above'));
});

test('(d) GitHub failure still returns a read without Calendar / Life Hub chips', async () => {
  const store = seedGoals({ binding: true });
  const handler = createGoalReadsHandler({
    env: ENV,
    now: () => NOW,
    getContentStore: async () => store,
    createGitHubClient: () => {
      throw new Error('github_unavailable');
    }
  });
  const res = await handler(request('https://api.adam-russell.com/api/goal-reads?goal_id=g1'));
  assert.equal(res.status, 200);
  const body = (await res.json()).data;
  assert.equal(body.read.goal_id, 'g1');
  assert.ok(Array.isArray(body.read.ghosts));
  assert.equal(body.read.looked_at.includes('Calendar'), false);
  assert.equal(body.read.looked_at.includes('Life Hub'), false);
  assert.equal(store.map.has(goalReadKey('g1')), true);
});

test('defaultLoadCalendarContext returns empty flags when today is missing', async () => {
  const ctx = await defaultLoadCalendarContext({ env: ENV, createGitHubClient: () => memoryGitHub(lifeFiles()) });
  assert.deepEqual(ctx, { slots: [], binding: null, calendarLooked: false, lifeHubLooked: false });
});

test('defaultLoadCalendarContext builds slots + binding from Life files', async () => {
  const ctx = await defaultLoadCalendarContext({
    env: ENV,
    today: TODAY,
    createGitHubClient: () => memoryGitHub(lifeFiles())
  });
  assert.equal(ctx.calendarLooked, true);
  assert.equal(ctx.lifeHubLooked, true);
  assert.ok(ctx.slots.length >= 1);
  assert.equal(ctx.binding?.bindingId, 'fat');
  assert.match(ctx.binding.rows.find(r => r.id === 'fat').detail, /14%/);
});
