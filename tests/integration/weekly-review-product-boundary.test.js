/**
 * Weekly Review product boundary (WR1–WR7, WR9).
 *
 * Evidence levels — do not upgrade by renaming:
 * LEVEL 3 = store save → reload by review_id (not structuredClone)
 * LEVEL 4 = chat tool runtime → pending queue → SSE id → createChatConfirmHandler
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createChatHandler } from '../../netlify/functions/chat.mjs';
import { createChatConfirmHandler } from '../../netlify/functions/chat-confirm.mjs';
import { PENDING_ACTIONS_PATH } from '../../netlify/functions/_shared/capabilities/propose-action.mjs';
import {
  executeClareWork,
  loadWorkflowState,
  saveWorkflowState,
  clareWorkSchemas,
  workflowStateKey
} from '../../netlify/functions/_shared/clare-work.mjs';
import {
  createWeeklyReview,
  runWeeklyReviewStage,
  buildWeeklyPendingChanges,
  clarifyDump,
  WEEKLY_REVIEW_STAGES
} from '../../netlify/functions/_shared/productivity-os.mjs';

const SECRET = 's'.repeat(32);
const validEnv = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  GITHUB_REPOSITORY: 'life-owner/life-repo',
  GITHUB_BRANCH: 'main',
  GITHUB_TOKEN: 'github-secret-token',
  GITHUB_TOKEN_EXPIRES: '2026-09-01',
  ANTHROPIC_API_KEY: 'anthropic-secret-key'
};
const NOW_MS = Date.parse('2026-09-08T12:00:00Z');
const session = createSessionToken({
  now: NOW_MS,
  randomBytes: () => Buffer.alloc(16, 4)
}, SECRET).token;
const NOW = () => NOW_MS;

function chatRequest(body) {
  return new Request('https://life.example/api/chat', {
    method: 'POST',
    headers: { cookie: `life_hub_session=${session}`, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

function confirmRequest(body) {
  return new Request('https://life.example/api/chat/confirm', {
    method: 'POST',
    headers: { cookie: `life_hub_session=${session}`, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function readSse(response) {
  const text = await response.text();
  return text.trim().split('\n\n').filter(Boolean).map((frame) => JSON.parse(frame.replace(/^data: /, '')));
}

function sha40(n) {
  return String(n).padStart(40, '0');
}

function memoryTasksStore(initial = {}) {
  const data = { ...initial };
  return {
    data,
    async get(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    async setJSON(key, value) {
      data[key] = value;
    },
    async set(key, value) {
      data[key] = typeof value === 'string' ? JSON.parse(value) : value;
    },
    async list({ prefix } = {}) {
      return {
        blobs: Object.keys(data)
          .filter((key) => !prefix || key.startsWith(prefix))
          .map((key) => ({ key }))
      };
    }
  };
}

function statefulGithub(seed = {}, { enforceSha = false } = {}) {
  const blobs = new Map();
  for (const [path, content] of Object.entries(seed)) {
    blobs.set(path, { sha: sha40(11), content });
  }
  let seq = 100;
  const fetchImpl = async (url, options) => {
    if (url.includes('/commits/')) {
      return Response.json({ sha: sha40(9), commit: { tree: { sha: sha40(8) } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({
        tree: [...blobs.entries()].map(([path, blob]) => ({ path, type: 'blob', sha: blob.sha }))
      });
    }
    const blobMatch = /\/git\/blobs\/([0-9a-f]{40})/.exec(url);
    if (blobMatch) {
      const found = [...blobs.values()].find((item) => item.sha === blobMatch[1]);
      if (!found) return Response.json({ message: 'missing' }, { status: 404 });
      return Response.json({
        encoding: 'base64',
        content: Buffer.from(found.content, 'utf8').toString('base64')
      });
    }
    if (options?.method === 'PUT') {
      const path = decodeURIComponent(url.split('/contents/')[1] ?? '');
      const body = JSON.parse(options.body);
      const content = Buffer.from(body.content, 'base64').toString('utf8');
      const existing = blobs.get(path);
      if (enforceSha && existing) {
        if (!body.sha || body.sha !== existing.sha) {
          return Response.json({ message: 'sha mismatch' }, { status: 409 });
        }
      }
      const sha = sha40(seq++);
      blobs.set(path, { sha, content });
      return Response.json({ content: { sha }, commit: { sha: sha40(seq++) } });
    }
    return Response.json({ message: 'unused' }, { status: 404 });
  };
  return { blobs, fetchImpl };
}

const projectA = {
  id: 'proj_A',
  title: 'Year 10 marking',
  status: 'active',
  purpose: 'Mark and return Year 10 essays with clear feedback.'
};

const waitingTask = {
  id: 'task_wait_B',
  title: 'Awaiting exam board reply',
  status: 'open',
  bucket: 'active',
  waiting_on: 'Exam board',
  waiting_status: 'waiting',
  follow_up_at: '2026-09-01'
};

function advanceToConfirm(extra = {}) {
  let state = createWeeklyReview(extra.review_id || 'wr_boundary');
  let guard = 0;
  while (state.current_stage !== 'confirm' && guard < 20) {
    state = runWeeklyReviewStage(state, {
      dump_text: extra.dump_text ?? '',
      projects: extra.projects ?? [projectA],
      tasks: extra.tasks ?? [],
      today_key: '2026-09-08',
      past_notes: ['past'],
      upcoming_notes: ['upcoming'],
      schedule: { proposed: [] },
      next_action_titles: extra.next_action_titles,
      waiting_decisions: extra.waiting_decisions,
      someday_decisions: extra.someday_decisions
    });
    guard += 1;
  }
  assert.equal(state.current_stage, 'confirm');
  return state;
}

async function proposeWeeklyReviewViaChat({
  store,
  github,
  reviewId,
  selectedChanges,
  nextActionTitles,
  waitingDecisions,
  failQueue = false
}) {
  const state = advanceToConfirm({
    review_id: reviewId,
    next_action_titles: nextActionTitles,
    waiting_decisions: waitingDecisions,
    tasks: waitingDecisions ? [waitingTask] : [],
    projects: [projectA]
  });
  await saveWorkflowState(store, reviewId, state);

  const fetchImpl = async (url, options) => {
    if (
      failQueue
      && options?.method === 'PUT'
      && decodeURIComponent(url.split('/contents/')[1] ?? '') === PENDING_ACTIONS_PATH
    ) {
      return Response.json({ message: 'queue write failed' }, { status: 500 });
    }
    return github.fetchImpl(url, options);
  };

  const chat = createChatHandler({
    env: validEnv,
    now: NOW,
    fetchImpl,
    getTasksStore: async () => store,
    getTeachingStore: async () => memoryTasksStore(),
    createAnthropicClient: () => ({
      async *streamMessage(args) {
        await args.executeTools({
          id: 'call_wr_confirm',
          name: 'weekly_review',
          input: {
            review_id: reviewId,
            advance: false,
            confirm: true,
            selected_changes: selectedChanges
          }
        });
        yield { type: 'done' };
      }
    })
  });

  const events = await readSse(
    await chat(
      chatRequest({
        message: 'Continue Weekly Review and prepare the confirm proposal.',
        priorAgentSlug: 'clare',
        agentKernel: true
      })
    )
  );
  return { events };
}

describe('Weekly Review schema / runtime parity', () => {
  it('clareWorkSchemas weekly_review exposes decision + confirm fields', () => {
    const schema = clareWorkSchemas().find((item) => item.name === 'weekly_review');
    assert.ok(schema);
    const props = schema.input_schema.properties;
    for (const key of [
      'review_id',
      'advance',
      'next_action_titles',
      'waiting_decisions',
      'someday_decisions',
      'selected_changes',
      'confirm',
      'finalize',
      'repropose',
      'schedule'
    ]) {
      assert.ok(props[key], `missing ${key}`);
    }
    assert.match(String(props.confirm.description || ''), /Confirm proposal|does NOT|must Confirm/i);
  });
});

describe('LEVEL 3 decision persistence', () => {
  it('decisions survive store reload by review_id without structuredClone', async () => {
    const store = memoryTasksStore();
    const reviewId = 'wr_l3';

    await executeClareWork(
      'weekly_review',
      { review_id: reviewId, dump_text: '', advance: true, today_key: '2026-09-08' },
      {
        now: new Date('2026-09-08T12:00:00Z'),
        tasks: [waitingTask],
        projects: [projectA],
        tasksStore: store
      }
    );

    await executeClareWork(
      'weekly_review',
      {
        review_id: reviewId,
        advance: false,
        next_action_titles: { proj_A: 'Score Year 10 essays' },
        waiting_decisions: {
          task_wait_B: { action: 'follow_up', follow_up_at: '2026-09-15' }
        }
      },
      {
        now: new Date('2026-09-08T12:05:00Z'),
        tasks: [waitingTask],
        projects: [projectA],
        tasksStore: store
      }
    );

    const reloaded = await loadWorkflowState(store, reviewId);
    assert.equal(reloaded.next_action_titles.proj_A, 'Score Year 10 essays');
    assert.equal(reloaded.waiting_decisions.task_wait_B.action, 'follow_up');
    assert.equal(reloaded.waiting_decisions.task_wait_B.follow_up_at, '2026-09-15');

    let result = { state: reloaded };
    let guard = 0;
    while (result.state.current_stage !== 'confirm' && guard < 20) {
      result = await executeClareWork(
        'weekly_review',
        { review_id: reviewId, advance: true, today_key: '2026-09-08' },
        {
          now: new Date('2026-09-08T12:10:00Z'),
          tasks: [waitingTask],
          projects: [projectA],
          tasksStore: store
        }
      );
      guard += 1;
    }
    const matches = (result.state.pending_changes || []).filter((row) => row.id === 'next_action:proj_A');
    assert.equal(matches.length, 1);
  });
});

describe('LEVEL 4 Weekly Review Confirm chain', () => {
  it('WR1: SSE pending id → createChatConfirmHandler → task + parent + consumed + complete', async () => {
    const store = memoryTasksStore({ 'projects/proj_A': projectA });
    const github = statefulGithub();
    const reviewId = 'wr_wr1';
    const { events } = await proposeWeeklyReviewViaChat({
      store,
      github,
      reviewId,
      selectedChanges: ['next_action:proj_A'],
      nextActionTitles: { proj_A: 'Score Year 10 essays' }
    });

    const proposalEvent = events.find((event) => event.type === 'action_proposal');
    assert.ok(proposalEvent, 'expected action_proposal SSE');
    assert.ok(proposalEvent.id, 'expected durable pending id');

    const write = (proposalEvent.proposal?.writes || []).find((item) => String(item.path).includes('tasks:task:'));
    assert.ok(write);
    const proposed = typeof write.content === 'string' ? JSON.parse(write.content) : write.content;
    assert.equal(proposed.title, 'Score Year 10 essays');
    assert.equal(proposed.parent_project_id, 'proj_A');

    assert.equal((await loadWorkflowState(store, reviewId)).status, 'awaiting_confirm');

    const confirm = createChatConfirmHandler({
      env: validEnv,
      fetchImpl: github.fetchImpl,
      now: NOW,
      getTasksStore: async () => store
    });
    const response = await confirm(
      confirmRequest({ kind: 'action', slug: 'clare', id: proposalEvent.id })
    );
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.ok ?? payload.data?.ok ?? true, true);

    const saved = Object.values(store.data).find((row) => row && row.title === 'Score Year 10 essays');
    assert.ok(saved);
    assert.equal(saved.parent_project_id, 'proj_A');

    const queue = JSON.parse(github.blobs.get(PENDING_ACTIONS_PATH).content);
    const consumed = queue.find((item) => item.id === proposalEvent.id);
    assert.ok(consumed, 'pending id remains as terminal consumed tombstone');
    assert.equal(consumed.status, 'consumed');
    assert.equal((await loadWorkflowState(store, reviewId)).status, 'complete');
  });

  it('WR2: unrelated pending B survives Confirm of Weekly Review A', async () => {
    const unrelated = {
      id: 'act_unrelated_B',
      createdAt: '2026-09-08',
      slug: 'clare',
      proposal: {
        capability: 'os.propose-action',
        agent: 'clare',
        intent: 'Create unrelated Clare task',
        reads: [],
        writes: [{
          path: 'tasks:task:task_unrelated',
          mode: 'create',
          content: JSON.stringify({ title: 'Unrelated Clare task', status: 'open' }),
          diff: 'unrelated'
        }],
        surfaces: ['governance_log']
      },
      bases: {}
    };
    const store = memoryTasksStore({ 'projects/proj_A': projectA });
    const github = statefulGithub({
      [PENDING_ACTIONS_PATH]: JSON.stringify([unrelated])
    });
    const { events } = await proposeWeeklyReviewViaChat({
      store,
      github,
      reviewId: 'wr_wr2',
      selectedChanges: ['next_action:proj_A'],
      nextActionTitles: { proj_A: 'Score Year 10 essays' }
    });
    const proposalEvent = events.find((event) => event.type === 'action_proposal');
    assert.ok(proposalEvent?.id);

    const confirm = createChatConfirmHandler({
      env: validEnv,
      fetchImpl: github.fetchImpl,
      now: NOW,
      getTasksStore: async () => store
    });
    assert.equal(
      (await confirm(confirmRequest({ kind: 'action', slug: 'clare', id: proposalEvent.id }))).status,
      200
    );

    const queue = JSON.parse(github.blobs.get(PENDING_ACTIONS_PATH).content);
    const consumedA = queue.find((item) => item.id === proposalEvent.id);
    assert.ok(consumedA);
    assert.equal(consumedA.status, 'consumed');
    const stillB = queue.find((item) => item.id === 'act_unrelated_B');
    assert.ok(stillB);
    assert.equal(stillB.proposal.intent, unrelated.proposal.intent);
    assert.deepEqual(stillB.proposal.writes, unrelated.proposal.writes);
  });

  it('WR3: deselected waiting change does not persist', async () => {
    const store = memoryTasksStore({
      'projects/proj_A': projectA,
      'tasks/task_wait_B': waitingTask
    });
    const github = statefulGithub();
    const { events } = await proposeWeeklyReviewViaChat({
      store,
      github,
      reviewId: 'wr_wr3',
      selectedChanges: ['next_action:proj_A'],
      nextActionTitles: { proj_A: 'Score Year 10 essays' },
      waitingDecisions: {
        task_wait_B: { action: 'follow_up', follow_up_at: '2026-09-20' }
      }
    });
    const proposalEvent = events.find((event) => event.type === 'action_proposal');
    assert.ok(proposalEvent?.id);
    const writes = proposalEvent.proposal.writes || [];
    assert.equal(
      writes.some((write) => {
        const content = typeof write.content === 'string' ? JSON.parse(write.content) : write.content;
        return content?.id === 'task_wait_B' || content?.follow_up_at === '2026-09-20';
      }),
      false
    );

    const confirm = createChatConfirmHandler({
      env: validEnv,
      fetchImpl: github.fetchImpl,
      now: NOW,
      getTasksStore: async () => store
    });
    assert.equal(
      (await confirm(confirmRequest({ kind: 'action', slug: 'clare', id: proposalEvent.id }))).status,
      200
    );
    assert.equal(store.data['tasks/task_wait_B'].follow_up_at, '2026-09-01');
    const created = Object.values(store.data).find((row) => row && row.title === 'Score Year 10 essays');
    assert.ok(created);
    assert.equal(created.parent_project_id, 'proj_A');
  });

  it('WR4: invalid proposal fails before pending queue mutation', async () => {
    const store = memoryTasksStore({
      'projects/proj_A': projectA,
      'tasks/task_wait_B': waitingTask
    });
    const github = statefulGithub();
    const reviewId = 'wr_wr4';
    // Malformed confirmable waiting decision: rebuild still emits a confirmable row,
    // then writesFromWeeklyPendingChanges rejects the unsupported action before queueing.
    const state = advanceToConfirm({
      review_id: reviewId,
      next_action_titles: { proj_A: 'Score Year 10 essays' },
      waiting_decisions: {
        task_wait_B: { action: 'not_a_real_waiting_action', follow_up_at: '2026-09-20' }
      },
      tasks: [waitingTask]
    });
    await saveWorkflowState(store, reviewId, state);
    const badWaitingId = (state.pending_changes || []).find((row) => row.kind === 'waiting')?.id;
    assert.ok(badWaitingId, 'expected confirmable waiting row from malformed decision');

    const chat = createChatHandler({
      env: validEnv,
      now: NOW,
      fetchImpl: github.fetchImpl,
      getTasksStore: async () => store,
      getTeachingStore: async () => memoryTasksStore(),
      createAnthropicClient: () => ({
        async *streamMessage(args) {
          await args.executeTools({
            id: 'call_wr_bad',
            name: 'weekly_review',
            input: {
              review_id: reviewId,
              advance: false,
              confirm: true,
              selected_changes: [badWaitingId]
            }
          });
          yield { type: 'done' };
        }
      })
    });
    const events = await readSse(
      await chat(chatRequest({
        message: 'Confirm weekly review',
        priorAgentSlug: 'clare',
        agentKernel: true
      }))
    );
    assert.equal(events.some((event) => event.type === 'action_proposal' && event.id), false);
    assert.equal(github.blobs.has(PENDING_ACTIONS_PATH), false);
    assert.notEqual((await loadWorkflowState(store, reviewId)).status, 'awaiting_confirm');
  });

  it('WR5: complete only after Confirm; reload does not regenerate', async () => {
    const store = memoryTasksStore({ 'projects/proj_A': projectA });
    const github = statefulGithub();
    const reviewId = 'wr_wr5';
    const { events } = await proposeWeeklyReviewViaChat({
      store,
      github,
      reviewId,
      selectedChanges: ['next_action:proj_A'],
      nextActionTitles: { proj_A: 'Score Year 10 essays' }
    });
    const proposalEvent = events.find((event) => event.type === 'action_proposal');
    assert.ok(proposalEvent?.id);
    assert.equal((await loadWorkflowState(store, reviewId)).status, 'awaiting_confirm');

    const confirm = createChatConfirmHandler({
      env: validEnv,
      fetchImpl: github.fetchImpl,
      now: NOW,
      getTasksStore: async () => store
    });
    assert.equal(
      (await confirm(confirmRequest({ kind: 'action', slug: 'clare', id: proposalEvent.id }))).status,
      200
    );
    assert.equal((await loadWorkflowState(store, reviewId)).status, 'complete');

    const again = await executeClareWork(
      'weekly_review',
      { review_id: reviewId },
      {
        now: new Date('2026-09-08T13:00:00Z'),
        tasks: [],
        projects: [projectA],
        tasksStore: store
      }
    );
    assert.equal(again.already_complete, true);
    assert.notEqual(again.kind, 'propose');
  });

  it('WR6: failed Confirm leaves awaiting_confirm and pending recoverable', async () => {
    const store = memoryTasksStore({ 'projects/proj_A': projectA });
    const github = statefulGithub();
    const reviewId = 'wr_wr6';
    const { events } = await proposeWeeklyReviewViaChat({
      store,
      github,
      reviewId,
      selectedChanges: ['next_action:proj_A'],
      nextActionTitles: { proj_A: 'Score Year 10 essays' }
    });
    const proposalEvent = events.find((event) => event.type === 'action_proposal');
    assert.ok(proposalEvent?.id);

    const poisoned = {
      data: store.data,
      async get(key) {
        return store.get(key);
      },
      async list(arg) {
        return store.list(arg);
      },
      async setJSON() {
        throw new Error('forced write failure');
      },
      async set() {
        throw new Error('forced write failure');
      }
    };
    const confirm = createChatConfirmHandler({
      env: validEnv,
      fetchImpl: github.fetchImpl,
      now: NOW,
      getTasksStore: async () => poisoned
    });
    const response = await confirm(
      confirmRequest({ kind: 'action', slug: 'clare', id: proposalEvent.id })
    );
    assert.notEqual(response.status, 200);
    assert.equal((await loadWorkflowState(store, reviewId)).status, 'awaiting_confirm');
    const queue = JSON.parse(github.blobs.get(PENDING_ACTIONS_PATH).content);
    assert.ok(queue.some((item) => item.id === proposalEvent.id));
  });

  it('WR7: queue persistence failure does not strand awaiting_confirm', async () => {
    const store = memoryTasksStore({ 'projects/proj_A': projectA });
    const github = statefulGithub();
    const reviewId = 'wr_wr7';
    const { events } = await proposeWeeklyReviewViaChat({
      store,
      github,
      reviewId,
      selectedChanges: ['next_action:proj_A'],
      nextActionTitles: { proj_A: 'Score Year 10 essays' },
      failQueue: true
    });
    assert.equal(events.some((event) => event.type === 'action_proposal' && event.id), false);
    const workflow = await loadWorkflowState(store, reviewId);
    assert.notEqual(workflow.status, 'awaiting_confirm');
    assert.equal(github.blobs.has(PENDING_ACTIONS_PATH), false);

    const retryGithub = statefulGithub();
    const retry = await proposeWeeklyReviewViaChat({
      store,
      github: retryGithub,
      reviewId,
      selectedChanges: ['next_action:proj_A'],
      nextActionTitles: { proj_A: 'Score Year 10 essays' }
    });
    assert.ok(retry.events.find((event) => event.type === 'action_proposal' && event.id));
  });
});


describe('LEVEL 4 Weekly Review lifecycle integrity (WR10–WR13)', () => {
  it('WR10: writes succeed, queue consume fails → non-replayable + truthful response', async () => {
    const store = memoryTasksStore({ 'projects/proj_A': projectA });
    const github = statefulGithub();
    const reviewId = 'wr_wr10';
    const { events } = await proposeWeeklyReviewViaChat({
      store,
      github,
      reviewId,
      selectedChanges: ['next_action:proj_A'],
      nextActionTitles: { proj_A: 'Score Year 10 essays' }
    });
    const proposalEvent = events.find((event) => event.type === 'action_proposal');
    assert.ok(proposalEvent?.id);

    let consumeAttempts = 0;
    const fetchImpl = async (url, options) => {
      if (
        options?.method === 'PUT'
        && decodeURIComponent(url.split('/contents/')[1] ?? '') === PENDING_ACTIONS_PATH
      ) {
        const body = JSON.parse(options.body);
        const content = Buffer.from(body.content, 'base64').toString('utf8');
        const queue = JSON.parse(content);
        const entry = queue.find((item) => item.id === proposalEvent.id);
        // Allow pre-execution fence (executing); fail only terminal consume writes.
        if (entry?.status === 'consumed') {
          consumeAttempts += 1;
          return Response.json({ message: 'consume failed' }, { status: 500 });
        }
      }
      return github.fetchImpl(url, options);
    };

    const confirm = createChatConfirmHandler({
      env: validEnv,
      fetchImpl,
      now: NOW,
      getTasksStore: async () => store
    });
    const response = await confirm(
      confirmRequest({ kind: 'action', slug: 'clare', id: proposalEvent.id })
    );
    const payload = await response.json();
    assert.equal(response.status, 503);
    assert.equal(payload.error?.code, 'pending_action_consume_failed');
    assert.equal(payload.data?.writesApplied, true);
    assert.ok(consumeAttempts >= 1);

    const saved = Object.values(store.data).filter((row) => row && row.title === 'Score Year 10 essays');
    assert.equal(saved.length, 1);
    assert.equal(saved[0].parent_project_id, 'proj_A');

    // Workflow stamp should make the id non-replayable even though queue entry may still look pending.
    const workflow = await loadWorkflowState(store, reviewId);
    assert.equal(workflow.pending_action_status, 'consumed');
    assert.notEqual(workflow.status, 'complete');

    const replay = await confirm(
      confirmRequest({ kind: 'action', slug: 'clare', id: proposalEvent.id })
    );
    const replayPayload = await replay.json();
    assert.equal(replay.status, 409);
    assert.equal(replayPayload.error?.code, 'pending_action_consumed');
    assert.equal(
      Object.values(store.data).filter((row) => row && row.title === 'Score Year 10 essays').length,
      1
    );
  });

  it('WR11: complete save fails → consumed + awaiting_confirm; reconcile heals', async () => {
    const store = memoryTasksStore({ 'projects/proj_A': projectA });
    const github = statefulGithub();
    const reviewId = 'wr_wr11';
    const { events } = await proposeWeeklyReviewViaChat({
      store,
      github,
      reviewId,
      selectedChanges: ['next_action:proj_A'],
      nextActionTitles: { proj_A: 'Score Year 10 essays' }
    });
    const proposalEvent = events.find((event) => event.type === 'action_proposal');
    assert.ok(proposalEvent?.id);

    const originalSetJSON = store.setJSON.bind(store);
    let blockComplete = true;
    store.setJSON = async (key, value) => {
      if (
        blockComplete
        && String(key).includes(reviewId)
        && value
        && value.status === 'complete'
      ) {
        throw new Error('complete persist failed');
      }
      return originalSetJSON(key, value);
    };

    const confirm = createChatConfirmHandler({
      env: validEnv,
      fetchImpl: github.fetchImpl,
      now: NOW,
      getTasksStore: async () => store
    });
    const response = await confirm(
      confirmRequest({ kind: 'action', slug: 'clare', id: proposalEvent.id })
    );
    const payload = await response.json();
    assert.equal(response.status, 503);
    assert.equal(payload.error?.code, 'weekly_review_completion_pending');
    assert.equal(payload.data?.pendingActionStatus, 'consumed');

    let workflow = await loadWorkflowState(store, reviewId);
    assert.equal(workflow.status, 'awaiting_confirm');
    assert.equal(workflow.pending_action_status, 'consumed');
    assert.equal(
      Object.values(store.data).filter((row) => row && row.title === 'Score Year 10 essays').length,
      1
    );

    const queue = JSON.parse(github.blobs.get(PENDING_ACTIONS_PATH).content);
    assert.equal(queue.find((item) => item.id === proposalEvent.id)?.status, 'consumed');

    blockComplete = false;
    const healed = await executeClareWork(
      'weekly_review',
      { review_id: reviewId, advance: false },
      {
        now: new Date('2026-09-08T12:00:00Z'),
        tasks: [],
        projects: [projectA],
        tasksStore: store
      }
    );
    workflow = await loadWorkflowState(store, reviewId);
    assert.equal(workflow.status, 'complete');
    assert.notEqual(healed?.kind, 'propose');
    assert.equal(
      Object.values(store.data).filter((row) => row && row.title === 'Score Year 10 essays').length,
      1
    );
  });

  it('WR12: lost-response retry is idempotent', async () => {
    const store = memoryTasksStore({ 'projects/proj_A': projectA });
    const github = statefulGithub();
    const reviewId = 'wr_wr12';
    const { events } = await proposeWeeklyReviewViaChat({
      store,
      github,
      reviewId,
      selectedChanges: ['next_action:proj_A'],
      nextActionTitles: { proj_A: 'Score Year 10 essays' }
    });
    const proposalEvent = events.find((event) => event.type === 'action_proposal');
    assert.ok(proposalEvent?.id);

    const confirm = createChatConfirmHandler({
      env: validEnv,
      fetchImpl: github.fetchImpl,
      now: NOW,
      getTasksStore: async () => store
    });
    const first = await confirm(
      confirmRequest({ kind: 'action', slug: 'clare', id: proposalEvent.id })
    );
    assert.equal(first.status, 200);
    assert.equal((await loadWorkflowState(store, reviewId)).status, 'complete');

    const second = await confirm(
      confirmRequest({ kind: 'action', slug: 'clare', id: proposalEvent.id })
    );
    const secondPayload = await second.json();
    assert.equal(second.status, 409);
    assert.equal(secondPayload.error?.code, 'pending_action_consumed');
    assert.equal(
      Object.values(store.data).filter((row) => row && row.title === 'Score Year 10 essays').length,
      1
    );
    assert.equal((await loadWorkflowState(store, reviewId)).status, 'complete');
  });

  it('WR13: normal happy path still completes', async () => {
    const store = memoryTasksStore({ 'projects/proj_A': projectA });
    const github = statefulGithub();
    const reviewId = 'wr_wr13';
    const { events } = await proposeWeeklyReviewViaChat({
      store,
      github,
      reviewId,
      selectedChanges: ['next_action:proj_A'],
      nextActionTitles: { proj_A: 'Score Year 10 essays' }
    });
    const proposalEvent = events.find((event) => event.type === 'action_proposal');
    assert.ok(proposalEvent?.id);
    const confirm = createChatConfirmHandler({
      env: validEnv,
      fetchImpl: github.fetchImpl,
      now: NOW,
      getTasksStore: async () => store
    });
    const response = await confirm(
      confirmRequest({ kind: 'action', slug: 'clare', id: proposalEvent.id })
    );
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.data?.lifecycle?.pendingAction, 'consumed');
    assert.equal(payload.data?.lifecycle?.weeklyReview, 'complete');
    assert.equal((await loadWorkflowState(store, reviewId)).status, 'complete');
    assert.equal(
      JSON.parse(github.blobs.get(PENDING_ACTIONS_PATH).content).find((item) => item.id === proposalEvent.id)?.status,
      'consumed'
    );
  });
});

describe('LEVEL 4 Weekly Review UI selection binding (WR14–WR15)', () => {
  it('WR14: Generate Confirm proposal sends exact selected_changes', async () => {
    const store = memoryTasksStore({
      'projects/proj_A': projectA,
      'tasks/task_wait_B': waitingTask
    });
    const github = statefulGithub();
    const reviewId = 'wr_wr14';
    // Seed an awaiting confirm-stage review with two confirmable rows via chat proposal path machinery.
    const state = advanceToConfirm({
      review_id: reviewId,
      next_action_titles: { proj_A: 'Score Year 10 essays' },
      waiting_decisions: {
        task_wait_B: { action: 'follow_up', follow_up_at: '2026-09-20' }
      },
      tasks: [waitingTask],
      projects: [projectA]
    });
    await saveWorkflowState(store, reviewId, state);

    const selected = ['next_action:proj_A'];
    let capturedInput = null;
    const { createChatClareWorkHandler } = await import('../../netlify/functions/chat-clare-work.mjs');
    const { invokeWeeklyReviewProposal } = await import(
      '../../netlify/functions/_shared/invoke-weekly-review-proposal.mjs'
    );

    const result = await invokeWeeklyReviewProposal({
      tool: 'weekly_review',
      slug: 'clare',
      input: {
        review_id: reviewId,
        advance: false,
        confirm: true,
        selected_changes: selected
      },
      githubClient: {
        resolveTree: async () => ({
          tree: [...github.blobs.entries()].map(([path, blob]) => ({
            path,
            type: 'blob',
            sha: blob.sha
          }))
        }),
        readBlob: async (sha) => {
          const found = [...github.blobs.values()].find((item) => item.sha === sha);
          return {
            encoding: 'base64',
            content: Buffer.from(found.content, 'utf8').toString('base64')
          };
        },
        writeFile: async ({ path, content, sha }) => {
          github.blobs.set(path, { sha: sha || 'f'.repeat(40), content });
          return { content: { sha: 'f'.repeat(40) } };
        }
      },
      tasksStore: store,
      now: NOW_MS
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.selected_changes, selected);
    assert.ok(result.pendingId);
    const writes = result.proposal?.writes || [];
    assert.equal(
      writes.some((write) => {
        const content = typeof write.content === 'string' ? JSON.parse(write.content) : write.content;
        return content?.title === 'Score Year 10 essays';
      }),
      true
    );
    assert.equal(
      writes.some((write) => {
        const content = typeof write.content === 'string' ? JSON.parse(write.content) : write.content;
        return content?.id === 'task_wait_B' || content?.follow_up_at === '2026-09-20';
      }),
      false
    );

    // Endpoint rejects model-shaped prose and requires structured selected_changes.
    const handler = createChatClareWorkHandler({
      env: validEnv,
      fetchImpl: github.fetchImpl,
      now: NOW,
      getTasksStore: async () => store,
      createGitHubClient: () => ({
        resolveTree: async () => ({ tree: [] }),
        readBlob: async () => ({ encoding: 'base64', content: '' }),
        writeFile: async () => ({ content: { sha: '1'.repeat(40) } })
      }),
      invokeWeeklyReviewProposal: async (args) => {
        capturedInput = args.input;
        return {
          ok: true,
          pendingId: 'act_ui_bind',
          proposal: { intent: 'test', writes: [] },
          selected_changes: args.input.selected_changes,
          review_id: reviewId,
          state: { status: 'awaiting_confirm' },
          workflow_kind: 'weekly_review',
          workflow_id: reviewId
        };
      }
    });
    const response = await handler(
      new Request('https://life.example/api/chat/clare-work', {
        method: 'POST',
        headers: {
          cookie: `life_hub_session=${session}`,
          'content-type': 'application/json',
          origin: 'https://life.example'
        },
        body: JSON.stringify({
          tool: 'weekly_review',
          slug: 'clare',
          input: {
            review_id: reviewId,
            advance: false,
            confirm: true,
            selected_changes: selected
          }
        })
      })
    );
    assert.equal(response.status, 200);
    assert.deepEqual(capturedInput.selected_changes, selected);
    assert.equal(capturedInput.confirm, true);
    assert.equal(capturedInput.advance, false);
  });
});


describe('LEVEL 4 Weekly Review execution fence (WR19–WR23)', () => {
  it('WR19: both post-write terminal stores fail → stays non-executable; replay does not double-write', async () => {
    const store = memoryTasksStore({ 'projects/proj_A': projectA });
    const github = statefulGithub();
    const reviewId = 'wr_wr19';
    const { events } = await proposeWeeklyReviewViaChat({
      store,
      github,
      reviewId,
      selectedChanges: ['next_action:proj_A'],
      nextActionTitles: { proj_A: 'Score Year 10 essays' }
    });
    const proposalEvent = events.find((event) => event.type === 'action_proposal');
    assert.ok(proposalEvent?.id);

    const originalSetJSON = store.setJSON.bind(store);
    store.setJSON = async (key, value) => {
      if (
        String(key).includes(reviewId)
        && value
        && (value.pending_action_status === 'consumed' || value.status === 'complete')
      ) {
        throw new Error('workflow terminal stamp failed');
      }
      return originalSetJSON(key, value);
    };

    const fetchImpl = async (url, options) => {
      if (
        options?.method === 'PUT'
        && decodeURIComponent(url.split('/contents/')[1] ?? '') === PENDING_ACTIONS_PATH
      ) {
        const body = JSON.parse(options.body);
        const content = Buffer.from(body.content, 'base64').toString('utf8');
        const queue = JSON.parse(content);
        const entry = queue.find((item) => item.id === proposalEvent.id);
        if (entry?.status === 'consumed') {
          return Response.json({ message: 'consume failed' }, { status: 500 });
        }
      }
      return github.fetchImpl(url, options);
    };

    const confirm = createChatConfirmHandler({
      env: validEnv,
      fetchImpl,
      now: NOW,
      getTasksStore: async () => store
    });
    const response = await confirm(
      confirmRequest({ kind: 'action', slug: 'clare', id: proposalEvent.id })
    );
    const payload = await response.json();
    assert.notEqual(response.status, 200);
    assert.equal(payload.data?.writesApplied, true);

    const saved = Object.values(store.data).filter((row) => row && row.title === 'Score Year 10 essays');
    assert.equal(saved.length, 1);

    const queue = JSON.parse(github.blobs.get(PENDING_ACTIONS_PATH).content);
    const entry = queue.find((item) => item.id === proposalEvent.id);
    assert.ok(entry);
    assert.equal(entry.status, 'executing');

    const workflow = await loadWorkflowState(store, reviewId);
    assert.notEqual(workflow?.pending_action_status, 'consumed');

    const replay = await confirm(
      confirmRequest({ kind: 'action', slug: 'clare', id: proposalEvent.id })
    );
    const replayPayload = await replay.json();
    assert.equal(replay.status, 409);
    assert.equal(replayPayload.error?.code, 'pending_action_execution_in_progress');
    assert.equal(
      Object.values(store.data).filter((row) => row && row.title === 'Score Year 10 essays').length,
      1
    );
  });

  it('WR20: executing id cannot replay', async () => {
    const store = memoryTasksStore({ 'projects/proj_A': projectA });
    const github = statefulGithub();
    const reviewId = 'wr_wr20';
    const { events } = await proposeWeeklyReviewViaChat({
      store,
      github,
      reviewId,
      selectedChanges: ['next_action:proj_A'],
      nextActionTitles: { proj_A: 'Score Year 10 essays' }
    });
    const proposalEvent = events.find((event) => event.type === 'action_proposal');
    assert.ok(proposalEvent?.id);

    const queue = JSON.parse(github.blobs.get(PENDING_ACTIONS_PATH).content);
    github.blobs.set(PENDING_ACTIONS_PATH, {
      sha: github.blobs.get(PENDING_ACTIONS_PATH).sha,
      content: JSON.stringify(
        queue.map((item) =>
          item.id === proposalEvent.id
            ? { ...item, status: 'executing', executionStartedAt: new Date(NOW_MS).toISOString() }
            : item
        )
      )
    });

    const confirm = createChatConfirmHandler({
      env: validEnv,
      fetchImpl: github.fetchImpl,
      now: NOW,
      getTasksStore: async () => store
    });
    const response = await confirm(
      confirmRequest({ kind: 'action', slug: 'clare', id: proposalEvent.id })
    );
    const payload = await response.json();
    assert.equal(response.status, 409);
    assert.equal(payload.error?.code, 'pending_action_execution_in_progress');
    assert.equal(
      Object.values(store.data).filter((row) => row && row.title === 'Score Year 10 essays').length,
      0
    );
    const after = JSON.parse(github.blobs.get(PENDING_ACTIONS_PATH).content);
    assert.equal(after.find((item) => item.id === proposalEvent.id)?.status, 'executing');
  });

  it('WR21: concurrent confirm — only one write; loser fails before writes', async () => {
    const store = memoryTasksStore({ 'projects/proj_A': projectA });
    const github = statefulGithub({}, { enforceSha: true });
    const reviewId = 'wr_wr21';
    const { events } = await proposeWeeklyReviewViaChat({
      store,
      github,
      reviewId,
      selectedChanges: ['next_action:proj_A'],
      nextActionTitles: { proj_A: 'Score Year 10 essays' }
    });
    const proposalEvent = events.find((event) => event.type === 'action_proposal');
    assert.ok(proposalEvent?.id);

    const confirm = createChatConfirmHandler({
      env: validEnv,
      fetchImpl: github.fetchImpl,
      now: NOW,
      getTasksStore: async () => store
    });

    const [resA, resB] = await Promise.all([
      confirm(confirmRequest({ kind: 'action', slug: 'clare', id: proposalEvent.id })),
      confirm(confirmRequest({ kind: 'action', slug: 'clare', id: proposalEvent.id }))
    ]);
    const statuses = [resA.status, resB.status].sort((a, b) => a - b);
    assert.equal(
      Object.values(store.data).filter((row) => row && row.title === 'Score Year 10 essays').length,
      1
    );
    assert.ok(statuses.includes(200) || statuses.includes(503));
    assert.ok(statuses.includes(409));
    const queue = JSON.parse(github.blobs.get(PENDING_ACTIONS_PATH).content);
    const status = queue.find((item) => item.id === proposalEvent.id)?.status;
    assert.ok(status === 'consumed' || status === 'executing');
  });

  it('WR22: safe write failure before side effect restores pending', async () => {
    const store = memoryTasksStore({ 'projects/proj_A': projectA });
    const github = statefulGithub();
    const reviewId = 'wr_wr22';
    const { events } = await proposeWeeklyReviewViaChat({
      store,
      github,
      reviewId,
      selectedChanges: ['next_action:proj_A'],
      nextActionTitles: { proj_A: 'Score Year 10 essays' }
    });
    const proposalEvent = events.find((event) => event.type === 'action_proposal');
    assert.ok(proposalEvent?.id);

    const queue = JSON.parse(github.blobs.get(PENDING_ACTIONS_PATH).content);
    github.blobs.set(PENDING_ACTIONS_PATH, {
      sha: github.blobs.get(PENDING_ACTIONS_PATH).sha,
      content: JSON.stringify(
        queue.map((item) => {
          if (item.id !== proposalEvent.id) return item;
          return {
            ...item,
            proposal: {
              ...item.proposal,
              writes: [
                {
                  path: 'unknown:task:task_poison',
                  mode: 'create',
                  content: '{}',
                  diff: 'poison'
                }
              ]
            }
          };
        })
      )
    });

    const confirm = createChatConfirmHandler({
      env: validEnv,
      fetchImpl: github.fetchImpl,
      now: NOW,
      getTasksStore: async () => store
    });
    const response = await confirm(
      confirmRequest({ kind: 'action', slug: 'clare', id: proposalEvent.id })
    );
    assert.notEqual(response.status, 200);
    assert.equal(
      Object.values(store.data).filter((row) => row && row.title === 'Score Year 10 essays').length,
      0
    );
    const after = JSON.parse(github.blobs.get(PENDING_ACTIONS_PATH).content);
    const entry = after.find((item) => item.id === proposalEvent.id);
    assert.ok(entry);
    // Proven zero side effects may restore pending; ambiguous outcomes may remain executing.
    assert.ok(
      entry.status === 'pending'
      || entry.status === 'executing'
      || entry.status == null
      || entry.status === ''
    );
  });

  it('WR23: happy path pending → executing → consumed; replay consumed', async () => {
    const store = memoryTasksStore({ 'projects/proj_A': projectA });
    const github = statefulGithub();
    const reviewId = 'wr_wr23';
    const { events } = await proposeWeeklyReviewViaChat({
      store,
      github,
      reviewId,
      selectedChanges: ['next_action:proj_A'],
      nextActionTitles: { proj_A: 'Score Year 10 essays' }
    });
    const proposalEvent = events.find((event) => event.type === 'action_proposal');
    assert.ok(proposalEvent?.id);

    const statuses = [];
    const fetchImpl = async (url, options) => {
      if (
        options?.method === 'PUT'
        && decodeURIComponent(url.split('/contents/')[1] ?? '') === PENDING_ACTIONS_PATH
      ) {
        const body = JSON.parse(options.body);
        const content = Buffer.from(body.content, 'base64').toString('utf8');
        const queue = JSON.parse(content);
        const entry = queue.find((item) => item.id === proposalEvent.id);
        if (entry?.status) statuses.push(entry.status);
      }
      return github.fetchImpl(url, options);
    };

    const confirm = createChatConfirmHandler({
      env: validEnv,
      fetchImpl,
      now: NOW,
      getTasksStore: async () => store
    });
    const response = await confirm(
      confirmRequest({ kind: 'action', slug: 'clare', id: proposalEvent.id })
    );
    assert.equal(response.status, 200);
    assert.ok(statuses.includes('executing'));
    assert.ok(statuses.includes('consumed'));
    assert.equal((await loadWorkflowState(store, reviewId)).status, 'complete');
    assert.equal(
      Object.values(store.data).filter((row) => row && row.title === 'Score Year 10 essays').length,
      1
    );

    const replay = await confirm(
      confirmRequest({ kind: 'action', slug: 'clare', id: proposalEvent.id })
    );
    const replayPayload = await replay.json();
    assert.equal(replay.status, 409);
    assert.equal(replayPayload.error?.code, 'pending_action_consumed');
  });

  it('action_dismiss rejects executing pending actions', async () => {
    const store = memoryTasksStore({ 'projects/proj_A': projectA });
    const github = statefulGithub();
    const reviewId = 'wr_dismiss_exec';
    const { events } = await proposeWeeklyReviewViaChat({
      store,
      github,
      reviewId,
      selectedChanges: ['next_action:proj_A'],
      nextActionTitles: { proj_A: 'Score Year 10 essays' }
    });
    const proposalEvent = events.find((event) => event.type === 'action_proposal');
    assert.ok(proposalEvent?.id);
    const queue = JSON.parse(github.blobs.get(PENDING_ACTIONS_PATH).content);
    github.blobs.set(PENDING_ACTIONS_PATH, {
      sha: github.blobs.get(PENDING_ACTIONS_PATH).sha,
      content: JSON.stringify(
        queue.map((item) =>
          item.id === proposalEvent.id ? { ...item, status: 'executing' } : item
        )
      )
    });

    const confirm = createChatConfirmHandler({
      env: validEnv,
      fetchImpl: github.fetchImpl,
      now: NOW,
      getTasksStore: async () => store
    });
    const response = await confirm(
      confirmRequest({ kind: 'action_dismiss', slug: 'clare', id: proposalEvent.id })
    );
    const payload = await response.json();
    assert.equal(response.status, 409);
    assert.equal(payload.error?.code, 'pending_action_execution_in_progress');
    const after = JSON.parse(github.blobs.get(PENDING_ACTIONS_PATH).content);
    assert.equal(after.find((item) => item.id === proposalEvent.id)?.status, 'executing');
  });
});

describe('WR9 ambiguous data does not write placeholders', () => {
  it('waiting without person stays informational', () => {
    const dump = clarifyDump('waiting on a reply about the grant');
    const item = dump.items[0];
    assert.equal(item.destination, 'waiting');
    assert.equal(item.waiting_on, null);
    assert.equal(item.ambiguous, true);
    const pending = buildWeeklyPendingChanges({
      ...createWeeklyReview('wr9'),
      current_stage: 'confirm',
      capture: dump
    });
    const row = pending.find((change) => change.id === item.id);
    assert.ok(row);
    assert.equal(row.confirmable, false);
    assert.equal(row.kind, 'informational');
  });

  it('project without grounded next action stays informational', async () => {
    const dump = clarifyDump('plan the open day and the newsletter and the foyer display');
    const item = dump.items[0];
    assert.equal(item.destination, 'project');
    assert.equal(item.project_next_action, null);
    assert.equal(item.ambiguous, true);

    const store = memoryTasksStore();
    const state = advanceToConfirm({
      review_id: 'wr9b',
      dump_text: 'plan the open day and the newsletter and the foyer display'
    });
    state.capture = dump;
    state.pending_changes = buildWeeklyPendingChanges(state);
    const captureRow = state.pending_changes.find((change) => change.id === item.id);
    assert.equal(captureRow?.confirmable, false);

    const result = await executeClareWork(
      'weekly_review',
      {
        review_id: 'wr9b',
        state,
        advance: false,
        confirm: true,
        selected_changes: [item.id]
      },
      {
        now: new Date('2026-09-08T12:00:00Z'),
        tasks: [],
        projects: [],
        tasksStore: store
      }
    );
    assert.notEqual(result.kind, 'propose');
  });
});

describe('helpers', () => {
  it('workflowStateKey and stages remain stable', () => {
    assert.equal(workflowStateKey('wr_x'), 'workflow_state/wr_x');
    assert.deepEqual(WEEKLY_REVIEW_STAGES.slice(-1), ['confirm']);
  });
});
