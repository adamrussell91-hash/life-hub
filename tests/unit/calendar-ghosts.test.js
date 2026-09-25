import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'js-yaml';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { GitHubClientError } from '../../netlify/functions/_shared/github-client.mjs';
import { buildCanonicalPath } from '../../netlify/functions/_shared/chat-schema.mjs';
import { isAllowedRepositoryPath } from '../../netlify/functions/_shared/repo-policy.mjs';
import { renderMarkdown } from '../../netlify/functions/_shared/persist-log.mjs';
import { taskKey, TASKS_INDEX_KEY } from '../../netlify/functions/_shared/tasks-blobs.mjs';
import { acceptPlan } from '../../apps/life/js/app/ghost-writes.js';
import { applyCentralNodePatch } from '../../apps/life/js/core/central-node-patch.js';
import { parseEventDocument } from '../../apps/life/js/core/records.js';
import { getSydneyTimestamp } from '../../apps/life/js/core/time.js';
import { validateRecord } from '../../apps/life/js/core/validate.js';
import {
  CALENDAR_GHOST_DECISIONS_PATH,
  PENDING_CALENDAR_GHOSTS_PATH,
  createCalendarGhostsHandler,
  serializePendingCalendarGhosts
} from '../../netlify/functions/calendar-ghosts.mjs';
import { loadCalendarVisualSeed } from '../../scripts/calendar-visual-seed.mjs';

const NOW = Date.parse('2026-09-24T18:05:00+10:00');
const TODAY = '2026-09-24';
const NOW_ISO = getSydneyTimestamp(new Date(NOW));
const SECRET = 's'.repeat(32);
const ENV = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  GITHUB_REPOSITORY: 'life-owner/life-repo',
  GITHUB_BRANCH: 'main',
  GITHUB_TOKEN: 'github-secret-token',
  GITHUB_TOKEN_EXPIRES: '2026-09-01'
};
const SESSION = createSessionToken({
  now: NOW,
  randomBytes: () => Buffer.alloc(16, 4)
}, SECRET).token;

const CN = await readFile(new URL('../fixtures/valid/central-node.md', import.meta.url), 'utf8');
const SEEDED = await loadCalendarVisualSeed();

const SKIP = { id: 'g-skip', agent: 'sara', kind: 'skip_workout', date: '2026-09-24', reason: 'capacity 34%, sore throat', workoutPath: 'records/2026/09/24/workout-1815.md' };
const BED = { id: 'g-bed', agent: 'sara', kind: 'bedtime', date: '2026-09-24', time: '22:00', reason: '5.4 h last night' };
const GOOD = { id: 'g-good', agent: 'hammond', kind: 'protect_block', date: '2026-09-26', start: '18:00', end: '22:00', title: 'Dinner out + a show', with: 'corey' };
const MOVE = { id: 'g-move', agent: 'hammond', kind: 'move_task', taskId: 'task-josh-y10', title: 'Year 10 leadership opportunities for Josh Lizzio', from: '2026-09-25', to: '2026-10-13' };

const TASK = {
  schema_version: 1,
  id: 'task-josh-y10',
  title: 'Year 10 leadership opportunities for Josh Lizzio',
  description: '',
  kind: 'task',
  bucket: 'active',
  domain: 'teaching',
  status: 'open',
  priority: 'medium',
  due_date: '2026-09-25',
  created_at: '2026-09-24T08:00:00.000Z',
  updated_at: '2026-09-24T08:00:00.000Z',
  depends_on: [],
  tags: [],
  attachments: [],
  source: 'calendar-visual-seed'
};

function sha(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 40);
}

function blockSlug(record) {
  const stem = String(record.title || record.kind || 'block')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const time = String(record.time || '00:00').replace(/[^0-9]/g, '').slice(0, 4) || '0000';
  return `${stem || 'block'}-${time}`;
}

function splitDocument(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)?([\s\S]*)$/.exec(String(text ?? '').trim());
  return { yaml: match[1], body: match[2].trim() };
}

function expectedCentral(ghost) {
  let content = CN;
  for (const step of acceptPlan(ghost, { today: TODAY }).steps) {
    if (step.target !== 'central_node') continue;
    content = applyCentralNodePatch(content, step.patch);
    assert.equal(typeof content, 'string');
  }
  return content;
}

function expectedFiles(ghost, prior) {
  const files = new Map();
  for (const step of acceptPlan(ghost, { today: TODAY }).steps) {
    if (step.target !== 'life_record') continue;
    if (step.mode === 'create') {
      const record = {
        ...step.record,
        schema_version: 1,
        id: `cb-${ghost.id}`,
        type: 'calendar_block',
        created_at: NOW_ISO,
        updated_at: NOW_ISO,
        source: 'calendar-ghost'
      };
      const path = buildCanonicalPath({ type: record.type, date: record.date, slug: blockSlug(record) });
      files.set(path, renderMarkdown(record, ''));
    } else {
      const parts = splitDocument(prior.get(step.path));
      const record = { ...load(parts.yaml), ...step.fields, updated_at: NOW_ISO };
      files.set(step.path, renderMarkdown(record, parts.body));
    }
  }
  return files;
}

function memoryGitHub(initial) {
  const files = new Map(initial);
  let head = 'a'.repeat(40);
  const commits = [];
  let failCommits = 0;
  let rejectCommit = null;
  return {
    files,
    commits,
    failNext(count) { failCommits = count; },
    rejectOn(fn) { rejectCommit = fn; },
    async resolveTree() {
      return {
        commitSha: head,
        treeSha: head,
        tree: [...files.entries()].map(([path, content]) => ({
          path,
          type: 'blob',
          sha: sha(content),
          size: Buffer.byteLength(content)
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
      if (failCommits > 0) {
        failCommits -= 1;
        throw new GitHubClientError('write_conflict', true);
      }
      if (typeof rejectCommit === 'function') {
        const rejected = rejectCommit(commits.length);
        if (rejected) throw rejected;
      }
      for (const file of next) files.set(file.path, file.content);
      head = sha(`${head}\0${message}`);
      commits.push({ message, paths: next.map(file => file.path) });
      return { commitSha: head };
    }
  };
}

function memoryTasks(records, { failWrites = 0 } = {}) {
  const data = new Map();
  for (const task of records) data.set(taskKey(task.id), structuredClone(task));
  data.set(TASKS_INDEX_KEY, records.map(task => task.id));
  let remaining = failWrites;
  return {
    data,
    writes: 0,
    async get(key, options) {
      const value = data.get(key);
      if (value == null) return null;
      return options?.type === 'json' ? structuredClone(value) : value;
    },
    async setJSON(key, value) {
      if (remaining > 0 && key.startsWith('tasks/') && !key.endsWith('/_index')) {
        remaining -= 1;
        throw new Error('tasks down');
      }
      data.set(key, structuredClone(value));
      this.writes += 1;
    },
    async set(key, value) {
      data.set(key, typeof value === 'string' ? JSON.parse(value) : value);
    }
  };
}

function harness({ ghosts, tasks = [], workout = false, failWrites = 0, failCommits = 0 } = {}) {
  const files = new Map([
    ['central-node.md', CN],
    [PENDING_CALENDAR_GHOSTS_PATH, serializePendingCalendarGhosts(ghosts.map(ghost => ({
      ...ghost,
      created_at: '2026-09-24T08:00:00+10:00',
      status: 'pending'
    })))]
  ]);
  if (workout) files.set(SKIP.workoutPath, SEEDED.files.get(SKIP.workoutPath));
  const github = memoryGitHub(files);
  github.failNext(failCommits);
  const store = memoryTasks(tasks, { failWrites });
  const handler = createCalendarGhostsHandler({
    env: ENV,
    now: () => NOW,
    createGitHubClient: () => github,
    getTasksStore: async () => store
  });
  return { handler, github, store };
}

function post(body) {
  return new Request('https://life.example/api/calendar-ghosts', {
    method: 'POST',
    headers: {
      cookie: `life_hub_session=${SESSION}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

function snapshot(files) {
  return new Map(files);
}

async function decide(handler, id, decision, reason) {
  const response = await handler(post({ id, decision, ...(reason ? { reason } : {}) }));
  const payload = await response.json();
  return { status: response.status, payload, cache: response.headers.get('cache-control') };
}

test('visual seed freezes now and loads the reference week', () => {
  assert.equal(SEEDED.now, '2026-09-24T18:05:00+10:00');
  assert.equal(SEEDED.counts.ghosts, 4);
  assert.equal(SEEDED.counts.logs, 12);
  assert.ok(SEEDED.files.has(PENDING_CALENDAR_GHOSTS_PATH));
  assert.ok(SEEDED.files.has('calendar-visual.json'));
  assert.equal(SEEDED.tasks[0].id, 'task-josh-y10');
  assert.equal(SEEDED.tasks[0].due_date, '2026-09-25');
});

test('accept skip workout writes the Cross-Agent line, the skipped session, and nothing else', async () => {
  const { handler, github, store } = harness({ ghosts: [SKIP], workout: true });
  const before = snapshot(github.files);
  const result = await decide(handler, 'g-skip', 'accept');
  assert.equal(result.status, 200);
  assert.equal(result.cache, 'private, no-store');
  assert.equal(result.payload.writes, 'applied');
  assert.equal(result.payload.receipt, acceptPlan(SKIP, { today: TODAY }).receipt);
  assert.equal(github.files.get('central-node.md'), expectedCentral(SKIP));
  assert.match(github.files.get('central-node.md'), /- Sara→Chadwick: skip Thu 24\/09 workout \(capacity 34%, sore throat\)\./);
  const records = expectedFiles(SKIP, before);
  for (const [path, content] of records) assert.equal(github.files.get(path), content);
  const workout = load(splitDocument(github.files.get(SKIP.workoutPath)).yaml);
  assert.equal(workout.status, 'skipped');
  assert.equal(workout.title, 'Gym');
  assert.deepEqual(validateRecord(workout), []);
  assert.equal(store.writes, 0);
  assert.equal(github.commits.length, 1);
  assert.deepEqual(github.commits[0].paths.sort(), [...records.keys(), 'central-node.md', PENDING_CALENDAR_GHOSTS_PATH].sort());
  const queue = JSON.parse(github.files.get(PENDING_CALENDAR_GHOSTS_PATH));
  assert.equal(queue[0].status, 'accepted');
  assert.equal(queue[0].tasks_pending, undefined);

  const again = await handler(new Request(`https://life.example/api/calendar-ghosts?from=2026-09-21&to=2026-09-27`, {
    headers: { cookie: `life_hub_session=${SESSION}` }
  }));
  const listed = await again.json();
  assert.equal(again.status, 200);
  // Accepted ghosts stay out of the pending list (refresh may append new ones).
  assert.ok(!listed.ghosts.some(ghost => ghost.id === 'g-skip'));
  assert.ok(listed.ghosts.every(ghost => ghost.status === 'pending' || ghost.status == null));
});

test('accept bedtime writes Today’s Status and one protected rest block', async () => {
  const { handler, github, store } = harness({ ghosts: [BED] });
  const result = await decide(handler, 'g-bed', 'accept');
  assert.equal(result.status, 200);
  assert.equal(github.files.get('central-node.md'), expectedCentral(BED));
  const records = expectedFiles(BED, github.files);
  assert.equal(records.size, 1);
  for (const [path, content] of records) {
    assert.equal(isAllowedRepositoryPath(path), true, path);
    assert.equal(github.files.get(path), content);
    const event = parseEventDocument(content, path, load);
    assert.equal(event.record.kind, 'rest');
    assert.equal(event.record.time, '21:30');
    assert.equal(event.record.end_time, '22:00');
    assert.equal(event.record.protected, true);
    assert.equal(event.record.status, 'confirmed');
    assert.deepEqual(validateRecord(event.record), []);
  }
  assert.equal(store.writes, 0);
  assert.match(github.files.get('central-node.md'), /\*\*Sleep:\*\* lights out 10:00 pm \(5\.4 h last night\)/);
});

test('accept protect block writes the Corey block, This Week, and the Clare line', async () => {
  const { handler, github } = harness({ ghosts: [GOOD] });
  const result = await decide(handler, 'g-good', 'accept');
  assert.equal(result.status, 200);
  assert.equal(github.files.get('central-node.md'), expectedCentral(GOOD));
  const records = expectedFiles(GOOD, github.files);
  for (const [path, content] of records) {
    assert.equal(github.files.get(path), content);
    const event = parseEventDocument(content, path, load);
    assert.equal(event.record.kind, 'corey');
    assert.equal(event.record.status, 'tentative');
    assert.equal(event.record.protected, true);
    assert.equal(event.record.title, 'Dinner out + a show');
    assert.equal(event.record.date, '2026-09-26');
  }
  assert.match(github.files.get('central-node.md'), /- Hammond→Clare: keep Sat 26\/09 6:00 pm–10:00 pm clear \(Corey\)\./);
});

test('accept move task patches the task after the Central Node commit', async () => {
  const { handler, github, store } = harness({ ghosts: [MOVE], tasks: [TASK] });
  const result = await decide(handler, 'g-move', 'accept');
  assert.equal(result.status, 200);
  assert.equal(result.payload.writes, 'applied');
  assert.equal(github.files.get('central-node.md'), expectedCentral(MOVE));
  assert.equal(store.data.get(taskKey(TASK.id)).due_date, '2026-10-13');
  assert.equal(store.data.get(taskKey(TASK.id)).title, TASK.title);
  assert.equal(github.commits[0].paths.includes('central-node.md'), true);
  assert.equal(github.commits.at(-1).paths.includes('central-node.md'), false);
  assert.equal(JSON.parse(github.files.get(PENDING_CALENDAR_GHOSTS_PATH))[0].tasks_pending, false);
  assert.equal([...github.files.keys()].some(path => path.startsWith('data/calendar/')), false);
});

test('dismiss writes no Life, Central Node, or Tasks data', async () => {
  const { handler, github, store } = harness({ ghosts: [SKIP], tasks: [TASK], workout: true });
  const central = github.files.get('central-node.md');
  const workout = github.files.get(SKIP.workoutPath);
  const result = await decide(handler, 'g-skip', 'dismiss', 'feel fine');
  assert.equal(result.status, 200);
  assert.equal(result.payload.receipt, 'Dismissed. Nothing written.');
  assert.equal(github.files.get('central-node.md'), central);
  assert.equal(github.files.get(SKIP.workoutPath), workout);
  assert.equal(store.writes, 0);
  assert.equal(store.data.get(taskKey(TASK.id)).due_date, '2026-09-25');
  assert.equal([...github.files.keys()].some(path => path.startsWith('data/')), false);
  const queue = JSON.parse(github.files.get(PENDING_CALENDAR_GHOSTS_PATH));
  assert.equal(queue[0].status, 'dismissed');
  const [line] = github.files.get(CALENDAR_GHOST_DECISIONS_PATH).trim().split('\n');
  assert.deepEqual(JSON.parse(line), {
    agent: 'sara',
    kind: 'skip_workout',
    outcome: 'dismissed',
    reason: 'feel fine',
    at: NOW_ISO
  });
});

test('replaying an accepted id is a no-op 409', async () => {
  const { handler, github } = harness({ ghosts: [BED] });
  const first = await decide(handler, 'g-bed', 'accept');
  assert.equal(first.status, 200);
  const committed = snapshot(github.files);
  const commits = github.commits.length;
  const again = await decide(handler, 'g-bed', 'accept');
  assert.equal(again.status, 409);
  assert.equal(again.payload.error.code, 'already_accepted');
  assert.equal(github.commits.length, commits);
  assert.equal(github.files.size, committed.size);
  for (const [path, content] of committed) assert.equal(github.files.get(path), content);
});

test('a tasks failure returns 207 and a retry only reruns tasks', async () => {
  const { handler, github, store } = harness({ ghosts: [MOVE], tasks: [TASK], failWrites: 1 });
  const partial = await decide(handler, 'g-move', 'accept');
  assert.equal(partial.status, 207);
  assert.equal(partial.payload.writes, 'partial');
  assert.equal(partial.payload.retry, 'tasks');
  assert.equal(github.files.get('central-node.md'), expectedCentral(MOVE));
  assert.equal(store.data.get(taskKey(TASK.id)).due_date, '2026-09-25');
  assert.equal(JSON.parse(github.files.get(PENDING_CALENDAR_GHOSTS_PATH))[0].tasks_pending, true);
  const landed = github.files.get('central-node.md');
  const commitCount = github.commits.length;
  assert.equal(github.commits[0].paths.includes('central-node.md'), true);

  const retry = await decide(handler, 'g-move', 'accept');
  assert.equal(retry.status, 200);
  assert.equal(retry.payload.writes, 'applied');
  assert.equal(retry.payload.retry, undefined);
  assert.equal(github.files.get('central-node.md'), landed);
  assert.equal(store.data.get(taskKey(TASK.id)).due_date, '2026-10-13');
  assert.equal(JSON.parse(github.files.get(PENDING_CALENDAR_GHOSTS_PATH))[0].tasks_pending, false);
  for (const commit of github.commits.slice(commitCount)) {
    assert.equal(commit.paths.includes('central-node.md'), false);
  }
});

test('the client cannot send writes', async () => {
  const { handler, github } = harness({ ghosts: [SKIP], workout: true });
  const central = github.files.get('central-node.md');
  const response = await handler(post({ id: 'g-skip', decision: 'accept', steps: [] }));
  const payload = await response.json();
  assert.equal(response.status, 400);
  assert.equal(payload.error.code, 'client_write_rejected');
  assert.equal(github.commits.length, 0);
  assert.equal(github.files.get('central-node.md'), central);
});

test('a stale commit is retried once from the current tree', async () => {
  const { handler, github } = harness({ ghosts: [SKIP], workout: true, failCommits: 1 });
  const result = await decide(handler, 'g-skip', 'accept');
  assert.equal(result.status, 200);
  assert.equal(github.files.get('central-node.md'), expectedCentral(SKIP));
  const lines = github.files.get('central-node.md').match(/Sara→Chadwick: skip Thu 24\/09 workout/g);
  assert.equal(lines.length, 1);
  assert.equal(github.commits.length, 1);
});

test('a create_task retry after the task landed does not create a second task', async () => {
  const create = { id: 'g-task', agent: 'hammond', kind: 'create_task', title: 'Book the pet sitter', due: '2026-10-28' };
  const { handler, github, store } = harness({ ghosts: [create] });
  github.rejectOn(n => (n === 1 ? new Error('clear pending failed') : null));
  const partial = await decide(handler, 'g-task', 'accept');
  assert.equal(partial.status, 207);
  assert.equal(partial.payload.writes, 'partial');
  assert.equal(partial.payload.retry, 'tasks');
  github.rejectOn(() => null);
  const retry = await decide(handler, 'g-task', 'accept');
  assert.equal(retry.status, 200);
  assert.equal(retry.payload.writes, 'applied');
  const taskIds = [...store.data.keys()].filter(key => key.startsWith('tasks/') && key !== TASKS_INDEX_KEY);
  assert.deepEqual(taskIds, [taskKey('ghost-g-task')]);
  assert.equal(store.data.get(taskKey('ghost-g-task')).due_date, '2026-10-28');
  assert.deepEqual(store.data.get(TASKS_INDEX_KEY), ['ghost-g-task']);
});

test('GET returns only pending ghosts inside the range', async () => {
  const { handler } = harness({ ghosts: [SKIP, BED, GOOD, MOVE] });
  const response = await handler(new Request('https://life.example/api/calendar-ghosts?from=2026-09-26&to=2026-09-27', {
    headers: { cookie: `life_hub_session=${SESSION}` }
  }));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(payload.ghosts.map(ghost => ghost.id), ['g-good']);
});
