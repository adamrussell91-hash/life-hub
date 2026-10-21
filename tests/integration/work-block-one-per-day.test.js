/**
 * One block per task per day, end to end and at every write layer. Reproduces the
 * 19 Oct bug: a task with a 16:30 block, "move it to 5pm", left two blocks. Every
 * entry path now leaves exactly one active block unless the parts are a marked split.
 * Invented names only: this repo is public.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createChatHandler } from '../../netlify/functions/chat.mjs';
import { createChatConfirmHandler } from '../../netlify/functions/chat-confirm.mjs';
import { executeProposeActionWrites } from '../../netlify/functions/_shared/capabilities/propose-action.mjs';
import { applyTaskStep } from '../../netlify/functions/calendar-ghosts.mjs';
import { createWorkBlocksHandler } from '../../netlify/functions/work-blocks.mjs';
import { blocksToSupersede } from '../../netlify/functions/_shared/work-block-guard.mjs';


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

/** Tuesday fixture — protected Pickup lives on tue. */
const DAY = '2026-09-08';

function confirmRequest(body) {
  return new Request('https://life.example/api/chat/confirm', {
    method: 'POST',
    headers: {
      cookie: `life_hub_session=${session}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

function sha40(n) {
  return String(n).padStart(40, '0');
}

function memoryStore(initial = {}) {
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

function statefulGithub(seed = {}) {
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
      const existing = blobs.get(path);
      if (body.sha && existing && existing.sha !== body.sha) {
        return Response.json({ message: 'conflict' }, { status: 409 });
      }
      const content = Buffer.from(body.content, 'base64').toString('utf8');
      const sha = sha40(seq++);
      blobs.set(path, { sha, content });
      return Response.json({ content: { sha }, commit: { sha: sha40(seq++) } });
    }
    return Response.json({ message: 'unused' }, { status: 404 });
  };
  return { blobs, fetchImpl };
}

const TODAY = DAY;

function chatRequest(body) {
  return new Request('https://life.example/api/chat', {
    method: 'POST',
    headers: {
      cookie: `life_hub_session=${session}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

async function readSse(response) {
  const text = await response.text();
  return text
    .trim()
    .split('\n\n')
    .filter(Boolean)
    .map((frame) => JSON.parse(frame.replace(/^data: /, '')));
}

function confirmHandler({ github, tasks, teaching }) {
  return createChatConfirmHandler({
    env: validEnv,
    fetchImpl: github.fetchImpl,
    now: () => NOW_MS,
    getTasksStore: async () => tasks,
    getTeachingStore: async () => teaching
  });
}

function block(id, overrides = {}) {
  return {
    schema_version: 1,
    id,
    task_id: 'task_card',
    project_id: null,
    title: 'Collect library card',
    date: TODAY,
    start_time: '16:30',
    duration_minutes: 30,
    depth: 'shallow',
    status: 'confirmed',
    source: 'clare',
    locked: false,
    created_at: `${TODAY}T00:00:00.000Z`,
    updated_at: `${TODAY}T00:00:00.000Z`,
    ...overrides
  };
}

function seededTasks(blocks = [block('wblock_card')], extra = {}) {
  const entries = {
    'tasks/_index': ['task_card'],
    'tasks/task_card': { id: 'task_card', title: 'Collect library card', status: 'open', due_date: null, due_time: null },
    'work_blocks/_index': blocks.map(item => item.id),
    ...extra
  };
  for (const item of blocks) entries[`work_blocks/${item.id}`] = item;
  return memoryStore(entries);
}

function storedBlocks(tasks) {
  return Object.entries(tasks.data)
    .filter(([key]) => key.startsWith('work_blocks/') && !key.endsWith('_index'))
    .map(([, value]) => value);
}

const active = (tasks, taskId = 'task_card') => storedBlocks(tasks).filter(item =>
  item.task_id === taskId && ['proposed', 'confirmed', 'in_progress'].includes(item.status));

describe('the 19 Oct bug, end to end', () => {
  it('chat "move it to 5pm" + Confirm leaves exactly one active block, at 17:00', async () => {
    const github = statefulGithub({});
    const tasks = seededTasks();
    const teaching = memoryStore();
    const chat = createChatHandler({
      env: validEnv,
      now: () => NOW_MS,
      fetchImpl: github.fetchImpl,
      getTasksStore: async () => tasks,
      getTeachingStore: async () => teaching,
      createAnthropicClient: () => ({
        async *streamMessage(args) {
          await args.executeTools({
            id: 'call_move',
            name: 'update_task',
            input: { task_id: 'task_card', start_time: '17:00' }
          });
          yield { type: 'done' };
        }
      })
    });
    const events = await readSse(
      await chat(chatRequest({ message: 'Move collect library card to 5pm', priorAgentSlug: 'clare', agentKernel: true }))
    );
    const proposal = events.find(event => event.type === 'action_proposal');
    assert.ok(proposal?.id, JSON.stringify(events.filter(event => event.type !== 'text')).slice(0, 600));
    const paths = (proposal.writes ?? proposal.proposal?.writes ?? []).map(write => write.path);
    assert.deepEqual(paths, ['tasks:work_block:wblock_card'], 'the Confirm card moves the existing block');

    const confirm = confirmHandler({ github, tasks, teaching });
    const response = await confirm(confirmRequest({ kind: 'action', slug: 'clare', id: proposal.id, accept: paths }));
    assert.equal(response.status, 200, await response.clone().text());

    const left = active(tasks);
    assert.equal(left.length, 1);
    assert.equal(left[0].id, 'wblock_card');
    assert.equal(left[0].start_time, '17:00');
  });
});

describe('one block per task per day at every write layer', () => {
  it('guard: an unmarked second block replaces the first; split parts and other days stay', () => {
    const first = block('a');
    assert.deepEqual(blocksToSupersede(block('b', { start_time: '17:00' }), [first]).map(item => item.id), ['a']);
    assert.deepEqual(blocksToSupersede(block('b', { date: '2026-09-09' }), [first]), []);
    assert.deepEqual(blocksToSupersede(block('b', { split_group: 'split_a' }), [first]), [], 'part 2 names part 1');
    assert.deepEqual(blocksToSupersede(block('b', { split_group: 'g' }), [block('a', { split_group: 'g' })]), []);
    assert.deepEqual(blocksToSupersede(block('b'), [block('a', { status: 'done' }), block('c', { status: 'cancelled' })]), []);
    assert.deepEqual(blocksToSupersede(block('b', { status: 'done' }), [first]), [], 'a finished block never displaces');
    assert.deepEqual(blocksToSupersede(block('b', { task_id: 'task_other' }), [first]), []);
  });

  it('propose-action (chat-confirm, Clare, compose_schedule): a new block for the same task/day cancels the old one', async () => {
    const tasks = seededTasks();
    const applied = await executeProposeActionWrites(null, {
      writes: [{
        path: 'tasks:work_block:wblock_new',
        mode: 'create',
        content: JSON.stringify(block('wblock_new', { start_time: '17:00' })),
        diff: 'block'
      }]
    }, { blobStores: { tasks } });
    assert.equal(applied.ok, true, JSON.stringify(applied));
    assert.deepEqual(applied.results[0].superseded, ['wblock_card']);
    assert.deepEqual(active(tasks).map(item => [item.id, item.start_time]), [['wblock_new', '17:00']]);
    const old = tasks.data['work_blocks/wblock_card'];
    assert.equal(old.status, 'cancelled');
    assert.equal(old.superseded_by, 'wblock_new');
  });

  it('propose-action keeps both parts of a marked split', async () => {
    const tasks = seededTasks();
    const applied = await executeProposeActionWrites(null, {
      writes: [{
        path: 'tasks:work_block:wblock_part2',
        mode: 'create',
        content: JSON.stringify(block('wblock_part2', { start_time: '18:00', split_group: 'split_wblock_card' })),
        diff: 'split part'
      }]
    }, { blobStores: { tasks } });
    assert.equal(applied.ok, true);
    assert.equal(active(tasks).length, 2);
  });

  it('calendar ghost accept (POST) replaces, and a ghost move (PATCH) onto a taken day replaces', async () => {
    const tasks = seededTasks();
    await applyTaskStep(tasks, {
      method: 'POST',
      collection: 'work_blocks',
      body: { title: 'Collect library card', date: TODAY, start_time: '17:00', duration_minutes: 30, task_id: 'task_card' }
    }, { ghostId: 'g-card' });
    assert.deepEqual(active(tasks).map(item => item.start_time), ['17:00']);

    const twoDays = seededTasks([block('wblock_mon'), block('wblock_wed', { date: '2026-09-09' })]);
    await applyTaskStep(twoDays, {
      method: 'PATCH',
      collection: 'work_blocks',
      id: 'wblock_wed',
      body: { date: TODAY, start_time: '09:00' }
    });
    assert.deepEqual(active(twoDays).map(item => item.id), ['wblock_wed']);
  });

  it('/api/work-blocks POST and PATCH (Tasks hub UI) replace instead of stacking', async () => {
    const tasks = seededTasks();
    const handler = createWorkBlocksHandler({ env: validEnv, now: () => NOW_MS, getContentStore: async () => tasks });
    const post = await handler(new Request('https://life.example/api/work-blocks', {
      method: 'POST',
      headers: { cookie: `life_hub_session=${session}`, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Collect library card', date: TODAY, start_time: '17:00', duration_minutes: 30, task_id: 'task_card' })
    }));
    assert.equal(post.status, 201, await post.clone().text());
    const created = (await post.json()).data;
    assert.deepEqual(created.superseded, ['wblock_card']);
    assert.deepEqual(active(tasks).map(item => item.id), [created.id]);

    // A marked split part posted through the same API keeps part 1.
    const split = await handler(new Request('https://life.example/api/work-blocks', {
      method: 'POST',
      headers: { cookie: `life_hub_session=${session}`, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Collect library card', date: TODAY, start_time: '18:00', duration_minutes: 30, task_id: 'task_card', split_group: `split_${created.id}` })
    }));
    assert.equal(split.status, 201);
    assert.equal(active(tasks).length, 2);

    const other = seededTasks([block('wblock_mon'), block('wblock_wed', { date: '2026-09-09' })]);
    const patchHandler = createWorkBlocksHandler({ env: validEnv, now: () => NOW_MS, getContentStore: async () => other });
    const patch = await patchHandler(new Request('https://life.example/api/work-blocks?id=wblock_wed', {
      method: 'PATCH',
      headers: { cookie: `life_hub_session=${session}`, 'content-type': 'application/json' },
      body: JSON.stringify({ date: TODAY })
    }));
    assert.equal(patch.status, 200);
    assert.deepEqual(active(other).map(item => item.id), ['wblock_wed']);
  });
});
