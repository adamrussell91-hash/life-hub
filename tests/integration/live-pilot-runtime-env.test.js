/**
 * Harness env bindings must reach createChatHandler, not only probeStores.
 * DETERMINISTIC TEST. Not a live model turn and not a deployed /api/chat gate.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createChatHandler } from '../../netlify/functions/chat.mjs';
import { tasksStoreOptions } from '../../netlify/functions/_shared/tasks-blobs.mjs';
import { teachingStoreOptions } from '../../netlify/functions/_shared/teaching-blobs.mjs';
import {
  PILOT_ROUTE_MODE,
  PILOT_RUNTIME_ENV_KEYS,
  buildPilotRuntime,
  buildPilotRuntimeEnv,
  probeStores,
  sanitizePilotTrace
} from '../../scripts/live-pilot-verify.mjs';

const DATE = '2026-08-20';
const SOURCE = Object.freeze({
  ANTHROPIC_API_KEY: 'anthropic-secret-key-do-not-log',
  LIFE_HUB_PASSPHRASE_HASH: 'passphrase-hash-secret-xx',
  SESSION_SECRET: 'pilot-session-secret-value-32ch!',
  GITHUB_REPOSITORY: 'life-owner/life-repo',
  GITHUB_BRANCH: 'main',
  GITHUB_TOKEN: 'github-secret-token-do-not-log',
  GITHUB_TOKEN_EXPIRES: '2099-01-01',
  TASKS_BLOBS_SITE_ID: 'tasks-site-from-harness',
  TEACHING_BLOBS_SITE_ID: 'teaching-site-from-harness',
  NETLIFY_BLOBS_TOKEN: 'netlify-blobs-secret-token',
  NETLIFY_BLOBS_CONTEXT: 'netlify-blobs-context-secret',
  NETLIFY_SITE_ID: 'netlify-site-from-harness',
  SITE_ORIGIN: 'https://life.example',
  UNRELATED_SECRET: 'should-never-be-forwarded-secret'
});

function memoryStore(records = {}) {
  return {
    async list({ prefix } = {}) {
      return {
        blobs: Object.keys(records)
          .filter(key => !prefix || key.startsWith(prefix))
          .map(key => ({ key }))
      };
    },
    async get(key) {
      return Object.hasOwn(records, key) ? records[key] : null;
    }
  };
}

function request(body, secret) {
  const session = createSessionToken({
    now: Date.parse(`${DATE}T00:00:00Z`),
    randomBytes: () => Buffer.alloc(16, 5)
  }, secret).token;
  return new Request('https://life.example/api/chat', {
    method: 'POST',
    headers: { cookie: `life_hub_session=${session}`, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function readSse(response) {
  const text = await response.text();
  return text.trim().split('\n\n').map(frame => JSON.parse(frame.replace(/^data: /, '')));
}

function githubStub() {
  return async url => {
    if (String(url).includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (String(url).includes('/git/trees/')) {
      return Response.json({ tree: [], truncated: false });
    }
    return Response.json({ message: 'not found' }, { status: 404 });
  };
}

const TASKS = {
  'tasks/pilot-binding': {
    id: 'pilot-binding',
    title: 'Pilot binding task',
    status: 'open',
    due_date: DATE,
    estimated_duration: 30,
    priority: 'high'
  }
};

const TEACHING = {
  'scheduled_lessons/pilot-lesson': {
    id: 'pilot-lesson',
    title: 'Pilot binding lesson',
    date: DATE,
    starts_at: '11:00',
    duration_minutes: 60
  }
};

test('allowlisted Tasks/Teaching bindings reach createChatHandler and its evidence path', async () => {
  const runtime = buildPilotRuntime(SOURCE);
  const env = runtime.env;
  assert.equal(runtime.routeMode, PILOT_ROUTE_MODE.LOCAL_HANDLER);
  assert.ok(!Object.hasOwn(env, 'UNRELATED_SECRET'));
  assert.equal(env.TASKS_BLOBS_SITE_ID, SOURCE.TASKS_BLOBS_SITE_ID);
  assert.equal(env.TEACHING_BLOBS_SITE_ID, SOURCE.TEACHING_BLOBS_SITE_ID);
  assert.equal(env.NETLIFY_BLOBS_TOKEN, SOURCE.NETLIFY_BLOBS_TOKEN);
  assert.equal(env.NETLIFY_BLOBS_CONTEXT, SOURCE.NETLIFY_BLOBS_CONTEXT);
  assert.equal(env.NETLIFY_SITE_ID, SOURCE.NETLIFY_SITE_ID);
  assert.equal(env.ANTHROPIC_API_KEY, SOURCE.ANTHROPIC_API_KEY);
  assert.equal(env.GITHUB_TOKEN, SOURCE.GITHUB_TOKEN);
  assert.deepEqual(runtime.forwardedKeys, [
    'ANTHROPIC_API_KEY',
    'GITHUB_BRANCH',
    'GITHUB_REPOSITORY',
    'GITHUB_TOKEN',
    'GITHUB_TOKEN_EXPIRES',
    'LIFE_HUB_PASSPHRASE_HASH',
    'NETLIFY_BLOBS_CONTEXT',
    'NETLIFY_BLOBS_TOKEN',
    'NETLIFY_SITE_ID',
    'SESSION_SECRET',
    'SITE_ORIGIN',
    'TASKS_BLOBS_SITE_ID',
    'TEACHING_BLOBS_SITE_ID'
  ]);

  const taskOptions = tasksStoreOptions(env);
  assert.equal(taskOptions.siteID, SOURCE.TASKS_BLOBS_SITE_ID);
  assert.equal(taskOptions.token, SOURCE.NETLIFY_BLOBS_TOKEN);
  const teachingOptions = teachingStoreOptions(env);
  assert.equal(teachingOptions.siteID, SOURCE.TEACHING_BLOBS_SITE_ID);
  assert.equal(teachingOptions.token, SOURCE.NETLIFY_BLOBS_TOKEN);

  const received = { tasks: null, teaching: null };
  const getTasksStore = async receivedEnv => {
    received.tasks = receivedEnv;
    assert.equal(receivedEnv, env);
    return memoryStore(TASKS);
  };
  const getTeachingStore = async receivedEnv => {
    received.teaching = receivedEnv;
    assert.equal(receivedEnv, env);
    return memoryStore(TEACHING);
  };

  const stores = await probeStores(env, { getTasksStore, getTeachingStore });
  assert.equal(stores.tasks.available, true);
  assert.equal(stores.teaching.available, true);

  let plan;
  const handler = createChatHandler({
    env,
    now: () => Date.parse(`${DATE}T01:00:00Z`),
    fetchImpl: githubStub(),
    getTasksStore,
    getTeachingStore,
    createAnthropicClient: () => ({
      async *streamMessage({ executeTools }) {
        plan = JSON.parse(await executeTools({
          id: 'call_plan',
          name: 'plan_work',
          input: { view: 'time_block', date: DATE, workday_start: '08:00', workday_end: '16:30' }
        }));
        yield { type: 'done' };
      }
    })
  });
  const events = await readSse(await handler(request({
    message: 'Clare, plan around any lessons or fixed commitments today.',
    priorAgentSlug: 'clare'
  }, env.SESSION_SECRET)));

  assert.equal(events[0].type, 'agent');
  assert.equal(received.tasks, env);
  assert.equal(received.teaching, env);
  assert.equal(received.tasks.TASKS_BLOBS_SITE_ID, SOURCE.TASKS_BLOBS_SITE_ID);
  assert.equal(received.teaching.TEACHING_BLOBS_SITE_ID, SOURCE.TEACHING_BLOBS_SITE_ID);
  assert.equal(received.tasks.NETLIFY_BLOBS_TOKEN, SOURCE.NETLIFY_BLOBS_TOKEN);
  assert.ok(plan.blocks?.some(item => item.id === 'pilot-binding'), JSON.stringify(plan));
  assert.ok(
    plan.reserved_lessons?.some(item => item.title === 'Pilot binding lesson'),
    JSON.stringify(plan)
  );

  const dirty = {
    routeMode: PILOT_ROUTE_MODE.LOCAL_HANDLER,
    accidentalEnv: env,
    finalAnswer: `used ${SOURCE.NETLIFY_BLOBS_TOKEN} and ${SOURCE.ANTHROPIC_API_KEY}`
  };
  const clean = sanitizePilotTrace(dirty, env);
  const json = JSON.stringify(clean);
  assert.ok(!json.includes(SOURCE.ANTHROPIC_API_KEY));
  assert.ok(!json.includes(SOURCE.GITHUB_TOKEN));
  assert.ok(!json.includes(SOURCE.NETLIFY_BLOBS_TOKEN));
  assert.ok(!json.includes(SOURCE.NETLIFY_BLOBS_CONTEXT));
  assert.ok(!json.includes(SOURCE.SESSION_SECRET));
  assert.ok(!json.includes(SOURCE.LIFE_HUB_PASSPHRASE_HASH));
  assert.match(json, /\[redacted\]/);
  assert.ok(PILOT_RUNTIME_ENV_KEYS.includes('TASKS_BLOBS_SITE_ID'));
  assert.ok(PILOT_RUNTIME_ENV_KEYS.includes('TEACHING_BLOBS_SITE_ID'));
});

test('narrow handler env without blob bindings does not invent Tasks/Teaching credentials', () => {
  const env = buildPilotRuntimeEnv({
    ANTHROPIC_API_KEY: SOURCE.ANTHROPIC_API_KEY,
    LIFE_HUB_PASSPHRASE_HASH: SOURCE.LIFE_HUB_PASSPHRASE_HASH,
    SESSION_SECRET: SOURCE.SESSION_SECRET
  });
  assert.equal(env.TASKS_BLOBS_SITE_ID, undefined);
  assert.equal(env.TEACHING_BLOBS_SITE_ID, undefined);
  assert.equal(env.NETLIFY_BLOBS_TOKEN, undefined);
  const taskOptions = tasksStoreOptions(env);
  assert.equal(taskOptions.token, undefined);
  const teachingOptions = teachingStoreOptions(env);
  assert.equal(teachingOptions.token, undefined);
});
