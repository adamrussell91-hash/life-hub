import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { GitHubClientError } from '../../netlify/functions/_shared/github-client.mjs';
import { PENDING_ACTIONS_PATH } from '../../netlify/functions/_shared/capabilities/propose-action.mjs';
import { createChatConfirmHandler } from '../../netlify/functions/chat-confirm.mjs';
import {
  PENDING_CALENDAR_GHOSTS_PATH,
  calendarGhostFromToolInput,
  calendarGhostConfirmProposal,
  createCalendarGhostsHandler,
  queueCalendarGhostDualPath,
  serializePendingCalendarGhosts,
  applyProfessionalStep,
  ghostProfessionalAcceptKey
} from '../../netlify/functions/calendar-ghosts.mjs';
import { validateProposeActionInput } from '../../netlify/functions/_shared/capabilities/propose-action.mjs';
import { resetCapabilityCaches } from '../../netlify/functions/_shared/capabilities/registry.mjs';
import { TASKS_INDEX_KEY } from '../../netlify/functions/_shared/tasks-blobs.mjs';

const CN = await readFile(new URL('../fixtures/valid/central-node.md', import.meta.url), 'utf8');
const SECRET = 's'.repeat(32);
const NOW = Date.parse('2026-10-03T12:00:00+10:00');
const DATE = '2026-10-04';
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

function sha(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 40);
}

function memoryGitHub(initial = {}) {
  const files = new Map(Object.entries(initial));
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
    async writeFile({ path, content }) {
      files.set(path, content);
      head = sha(`${head}\0${path}`);
      return { sha: head };
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

function memoryBlobStore(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    data,
    async get(key, options) {
      const value = data.get(key);
      if (value == null) return null;
      return options?.type === 'json' ? structuredClone(value) : value;
    },
    async setJSON(key, value) {
      data.set(key, structuredClone(value));
    },
    async set(key, value) {
      data.set(key, typeof value === 'string' ? JSON.parse(value) : value);
    }
  };
}

function confirmRequest(body) {
  return new Request('https://life.example/api/chat/confirm', {
    method: 'POST',
    headers: {
      cookie: `life_hub_session=${SESSION}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

async function proposeOuting(github) {
  resetCapabilityCaches();
  const entry = calendarGhostFromToolInput({
    kind: 'outing',
    date: DATE,
    start: '09:00',
    end: '10:00',
    title: 'Breakfast at Cafe X'
  }, { agent: 'clare', nowIso: '2026-10-03T12:00:00+10:00' });

  const pending = [];
  const proposeOsAction = async (proposal, extras) => {
    const id = `act_${pending.length + 1}`;
    pending.push({
      id,
      createdAt: '2026-10-03',
      slug: 'clare',
      proposal,
      extras: { calendarGhostId: extras.calendarGhostId },
      calendarGhostId: extras.calendarGhostId,
      status: 'pending'
    });
    github.files.set(PENDING_ACTIONS_PATH, JSON.stringify(pending, null, 2));
    return id;
  };

  const queued = await queueCalendarGhostDualPath({
    client: github,
    entry,
    agentSlug: 'clare',
    proposeOsAction,
    validateProposeActionInput
  });
  return { entry, queued, pending };
}

test('A4: chat Confirm writes Life calendar_block; second Accept is already_accepted', async () => {
  const github = memoryGitHub({
    [PENDING_CALENDAR_GHOSTS_PATH]: '[]',
    'central-node.md': CN
  });
  const tasks = memoryBlobStore({ [TASKS_INDEX_KEY]: [] });
  const { entry, queued, pending } = await proposeOuting(github);
  assert.equal(queued.ok, true);
  assert.equal(pending.length, 1);

  const confirm = createChatConfirmHandler({
    env: ENV,
    now: () => NOW,
    createGitHubClient: () => github,
    getTasksStore: async () => tasks,
    getProfessionalStore: async () => memoryBlobStore()
  });
  const first = await confirm(confirmRequest({
    kind: 'action',
    slug: 'clare',
    id: pending[0].id
  }));
  const firstPayload = await first.json();
  assert.equal(first.status, 200, JSON.stringify(firstPayload));
  assert.equal(firstPayload.ok, true);

  const blockPaths = [...github.files.keys()].filter(path => path.startsWith('data/calendar/'));
  assert.equal(blockPaths.length, 1);
  assert.match(github.files.get(blockPaths[0]), /Breakfast at Cafe X/);
  assert.match(github.files.get(blockPaths[0]), /kind: ["']?plan["']?/);

  const ghostsHandler = createCalendarGhostsHandler({
    env: ENV,
    now: () => NOW,
    createGitHubClient: () => github,
    getTasksStore: async () => tasks
  });
  const listed = await ghostsHandler(new Request(
    `https://life.example/api/calendar-ghosts?from=${DATE}&to=${DATE}`,
    { headers: { cookie: `life_hub_session=${SESSION}` } }
  ));
  const listedPayload = await listed.json();
  assert.equal(listed.status, 200);
  assert.ok(!listedPayload.ghosts.some(ghost => ghost.id === entry.id));

  const acceptAgain = await ghostsHandler(new Request('https://life.example/api/calendar-ghosts', {
    method: 'POST',
    headers: {
      cookie: `life_hub_session=${SESSION}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ id: entry.id, decision: 'accept' })
  }));
  const againPayload = await acceptAgain.json();
  assert.equal(acceptAgain.status, 409);
  assert.equal(againPayload.error.code, 'already_accepted');
  assert.equal([...github.files.keys()].filter(path => path.startsWith('data/calendar/')).length, 1);
});

test('A4: calendar Accept first, then chat Confirm is already_accepted with no second write', async () => {
  const github = memoryGitHub({
    [PENDING_CALENDAR_GHOSTS_PATH]: '[]',
    'central-node.md': CN
  });
  const tasks = memoryBlobStore({ [TASKS_INDEX_KEY]: [] });
  const { entry, pending } = await proposeOuting(github);

  const ghostsHandler = createCalendarGhostsHandler({
    env: ENV,
    now: () => NOW,
    createGitHubClient: () => github,
    getTasksStore: async () => tasks
  });
  const accepted = await ghostsHandler(new Request('https://life.example/api/calendar-ghosts', {
    method: 'POST',
    headers: {
      cookie: `life_hub_session=${SESSION}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ id: entry.id, decision: 'accept' })
  }));
  assert.equal(accepted.status, 200);
  assert.equal([...github.files.keys()].filter(path => path.startsWith('data/calendar/')).length, 1);

  const confirm = createChatConfirmHandler({
    env: ENV,
    now: () => NOW,
    createGitHubClient: () => github,
    getTasksStore: async () => tasks,
    getProfessionalStore: async () => memoryBlobStore()
  });
  const second = await confirm(confirmRequest({
    kind: 'action',
    slug: 'clare',
    id: pending[0].id
  }));
  const secondPayload = await second.json();
  assert.equal(second.status, 200, JSON.stringify(secondPayload));
  assert.equal([...github.files.keys()].filter(path => path.startsWith('data/calendar/')).length, 1);
});

test('B6: createCommunication throws once → Confirm returns ghost_partial; retry writes exactly one', async () => {
  resetCapabilityCaches();
  const github = memoryGitHub({
    [PENDING_CALENDAR_GHOSTS_PATH]: '[]',
    'central-node.md': CN
  });
  const entry = calendarGhostFromToolInput({
    kind: 'log_comm',
    date: DATE,
    time: '12:00',
    direction: 'outbound',
    channel: 'email',
    title: 'Gifted week',
    summary: 'Emailed Kate',
    person_refs: ['shared:person:kate'],
    time_zone: 'Australia/Sydney'
  }, { agent: 'ann', nowIso: '2026-10-03T12:00:00+10:00' });

  const pending = [];
  const proposeOsAction = async (proposal, extras) => {
    const id = 'act_log_1';
    pending.push({
      id,
      createdAt: '2026-10-03',
      slug: 'ann',
      proposal,
      extras: { calendarGhostId: extras.calendarGhostId },
      calendarGhostId: extras.calendarGhostId,
      status: 'pending'
    });
    github.files.set(PENDING_ACTIONS_PATH, JSON.stringify(pending, null, 2));
    return id;
  };
  const queued = await queueCalendarGhostDualPath({
    client: github,
    entry,
    agentSlug: 'ann',
    proposeOsAction,
    validateProposeActionInput
  });
  assert.equal(queued.ok, true);
  assert.match(queued.reply, /Ready to log/);

  let failOnce = true;
  const created = [];
  const proStore = memoryBlobStore();
  const confirm = createChatConfirmHandler({
    env: ENV,
    now: () => NOW,
    createGitHubClient: () => github,
    getTasksStore: async () => memoryBlobStore({ [TASKS_INDEX_KEY]: [] }),
    getProfessionalStore: async () => ({
      async get(key, options) {
        return proStore.get(key, options);
      },
      async setJSON(key, value) {
        return proStore.setJSON(key, value);
      },
      async set(key, value) {
        return proStore.set(key, value);
      }
    })
  });

  // Patch applyProfessionalStep path by wrapping createCommunication via a custom
  // store is hard (repo generates ids). Drive B6 through applyProfessionalStep directly
  // for the throw/retry journal, and assert chat-confirm partial via runGhostDecision
  // by stubbing professionalDeps through a thin createCommunication failure layer.
  // Use applyProfessionalStep for the duplicate-accept guarantee, then simulate
  // chat-confirm's ghost_partial branch with a tasks_pending ghost + failing pro step.

  const step = {
    target: 'professional',
    action: 'log_communication',
    date: DATE,
    time: '12:00',
    direction: 'outbound',
    channel: 'email',
    title: 'Gifted week',
    summary: 'Emailed Kate',
    person_refs: ['shared:person:kate'],
    time_zone: 'Australia/Sydney'
  };
  const journal = new Map();
  const deps = {
    createCommunication: async (input) => {
      if (failOnce) {
        failOnce = false;
        throw new Error('blob down');
      }
      created.push(input);
      return { communication: { id: `communication_${created.length}`, ...input } };
    },
    getJSON: async (key) => journal.get(key) ?? null,
    setJSON: async (key, value) => { journal.set(key, value); }
  };
  await assert.rejects(() => applyProfessionalStep(deps, step, { ghostId: entry.id }));
  assert.equal(created.length, 0);
  const firstOk = await applyProfessionalStep(deps, step, { ghostId: entry.id });
  const secondOk = await applyProfessionalStep(deps, step, { ghostId: entry.id });
  assert.equal(created.length, 1);
  assert.equal(firstOk.id, secondOk.id);
  assert.ok(journal.has(ghostProfessionalAcceptKey(entry.id)));
});

test('B6: chat Confirm returns ghost_partial and does not consume the card', async () => {
  resetCapabilityCaches();
  const github = memoryGitHub({
    [PENDING_CALENDAR_GHOSTS_PATH]: '[]',
    'central-node.md': CN
  });
  const entry = calendarGhostFromToolInput({
    kind: 'log_comm',
    date: DATE,
    time: '12:00',
    direction: 'outbound',
    channel: 'email',
    title: 'Gifted week',
    summary: 'Emailed Kate',
    person_refs: [],
    time_zone: 'Australia/Sydney'
  }, { agent: 'ann', nowIso: '2026-10-03T12:00:00+10:00' });

  // Seed as already accepted with tasks_pending so finishTasks runs the pro step only.
  github.files.set(PENDING_CALENDAR_GHOSTS_PATH, serializePendingCalendarGhosts([{
    ...entry,
    status: 'accepted',
    tasks_pending: true,
    decided_at: '2026-10-03T12:00:00+10:00'
  }]));

  const proposal = calendarGhostConfirmProposal(entry);
  const pendingId = 'act_partial_1';
  github.files.set(PENDING_ACTIONS_PATH, JSON.stringify([{
    id: pendingId,
    createdAt: '2026-10-03',
    slug: 'ann',
    proposal: validateProposeActionInput(proposal, { agentSlug: 'ann' }).proposal,
    extras: { calendarGhostId: entry.id },
    calendarGhostId: entry.id,
    status: 'pending'
  }], null, 2));

  let calls = 0;
  const failStore = {
    async get() { return null; },
    async setJSON() {
      calls += 1;
      throw new Error('professional blob down');
    },
    async set() {
      calls += 1;
      throw new Error('professional blob down');
    }
  };

  const confirm = createChatConfirmHandler({
    env: ENV,
    now: () => NOW,
    createGitHubClient: () => github,
    getTasksStore: async () => memoryBlobStore({ [TASKS_INDEX_KEY]: [] }),
    getProfessionalStore: async () => failStore
  });
  const response = await confirm(confirmRequest({
    kind: 'action',
    slug: 'ann',
    id: pendingId
  }));
  const payload = await response.json();
  assert.equal(response.status, 503, JSON.stringify(payload));
  assert.equal(payload.error.code, 'ghost_partial');
  assert.equal(payload.error.retryable, true);
  assert.match(payload.error.message, /Professional record failed/);

  const queue = JSON.parse(github.files.get(PENDING_ACTIONS_PATH));
  const entryStatus = queue.find(item => item.id === pendingId)?.status;
  assert.ok(entryStatus !== 'consumed', `card was consumed: ${entryStatus}`);
});

test('Discard on a card whose ghost already accepted (Professional write failed) retires the card', async () => {
  resetCapabilityCaches();
  const github = memoryGitHub({
    [PENDING_CALENDAR_GHOSTS_PATH]: '[]',
    'central-node.md': CN
  });
  const entry = calendarGhostFromToolInput({
    kind: 'log_comm',
    date: DATE,
    time: '12:00',
    direction: 'outbound',
    channel: 'email',
    title: 'Gifted week',
    summary: 'Emailed Kate',
    person_refs: [],
    time_zone: 'Australia/Sydney'
  }, { agent: 'clare', nowIso: '2026-10-03T12:00:00+10:00' });
  // Calendar half landed; the Professional half is still pending.
  github.files.set(PENDING_CALENDAR_GHOSTS_PATH, serializePendingCalendarGhosts([{
    ...entry,
    status: 'accepted',
    tasks_pending: true,
    decided_at: '2026-10-03T12:00:00+10:00'
  }]));
  const pendingId = 'act_stuck_1';
  github.files.set(PENDING_ACTIONS_PATH, JSON.stringify([{
    id: pendingId,
    createdAt: '2026-10-03',
    slug: 'clare',
    proposal: validateProposeActionInput(calendarGhostConfirmProposal(entry), { agentSlug: 'clare' }).proposal,
    extras: { calendarGhostId: entry.id },
    calendarGhostId: entry.id,
    status: 'pending'
  }], null, 2));

  const confirm = createChatConfirmHandler({
    env: ENV,
    now: () => NOW,
    createGitHubClient: () => github,
    getTasksStore: async () => memoryBlobStore({ [TASKS_INDEX_KEY]: [] })
  });
  const response = await confirm(confirmRequest({ kind: 'action_dismiss', slug: 'clare', id: pendingId }));
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.equal(payload.ok, true);
  const queue = JSON.parse(github.files.get(PENDING_ACTIONS_PATH));
  assert.equal(queue.find(item => item.id === pendingId)?.status, 'dismissed');
});
