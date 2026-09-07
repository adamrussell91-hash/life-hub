/**
 * Production /api/chat tool executors for Clare planner inputs and Chadwick analysis.
 * DETERMINISTIC TEST. Not a live model turn.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { createChatHandler } from '../../netlify/functions/chat.mjs';

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
const session = createSessionToken({
  now: Date.parse('2026-08-20T00:00:00Z'),
  randomBytes: () => Buffer.alloc(16, 5)
}, SECRET).token;

function request(body) {
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

function workoutMarkdown({ date, title, exercises, shaName }) {
  const exerciseYaml = exercises.map(exercise => [
    `  - name: ${exercise.name}`,
    '    sets:',
    `      - { reps: ${exercise.reps}, weight_kg: ${exercise.weight}, cable_type: constant_force }`
  ].join('\n')).join('\n');
  return [
    '---',
    'schema_version: 1',
    `id: "workout-${shaName || date}"`,
    'type: "workout"',
    `date: "${date}"`,
    'time: "16:28"',
    'created_at: 2026-08-18T18:26:45+10:00',
    'updated_at: 2026-08-18T18:26:45+10:00',
    'source: chat',
    `title: ${title}`,
    'session_kind: strength',
    'day_type: workout_30',
    'status: completed',
    'duration_min: 30',
    'exercises:',
    exerciseYaml,
    '---',
    'Completed session'
  ].join('\n');
}

function githubWithWorkouts(files) {
  const blobs = new Map(Object.entries(files).map(([path, content], index) => {
    const sha = String.fromCharCode(97 + index).repeat(40);
    return [path, { sha, content }];
  }));
  return async url => {
    if (url.includes('/commits/')) {
      return Response.json({ sha: 'c'.repeat(40), commit: { tree: { sha: 'd'.repeat(40) } } });
    }
    if (url.includes('/git/trees/')) {
      return Response.json({
        tree: [...blobs.entries()].map(([path, blob]) => ({
          path,
          type: 'blob',
          sha: blob.sha,
          size: blob.content.length
        }))
      });
    }
    for (const blob of blobs.values()) {
      if (url.includes(`/git/blobs/${blob.sha}`)) {
        return Response.json({
          encoding: 'base64',
          content: Buffer.from(blob.content, 'utf8').toString('base64')
        });
      }
    }
    return Response.json({ message: 'not found' }, { status: 404 });
  };
}

test('production chat route passes Clare planner inputs', async () => {
  const tasks = {
    'tasks/overdue': {
      id: 'overdue',
      title: 'Reports',
      status: 'open',
      due_date: '2026-08-10',
      estimated_duration: 30,
      priority: 'high'
    },
    'tasks/later': {
      id: 'later',
      title: 'Newsletter',
      status: 'open',
      due_date: '2026-08-20',
      estimated_duration: 30
    },
    'tasks/short': {
      id: 'short',
      title: 'Send reminder',
      status: 'open',
      estimated_duration: 15,
      tags: ['comms'],
      priority: 'high'
    },
    'tasks/long': {
      id: 'long',
      title: 'Rewrite unit',
      status: 'open',
      estimated_duration: 90
    }
  };
  let energyResult;
  let tightResult;
  let messageEnergy;
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-20T01:00:00Z'),
    fetchImpl: githubWithWorkouts({}),
    getTasksStore: async () => memoryStore(tasks),
    getTeachingStore: async () => memoryStore({}),
    createAnthropicClient: () => ({
      async *streamMessage({ executeTools }) {
        energyResult = JSON.parse(await executeTools({
          id: 'call_energy',
          name: 'plan_work',
          input: { view: 'energy', energy_level: 'low', cognitive_load: 8 }
        }));
        tightResult = JSON.parse(await executeTools({
          id: 'call_cap',
          name: 'plan_work',
          input: {
            view: 'time_block',
            date: '2026-08-20',
            capacity_minutes: 40,
            workday_start: '09:00',
            workday_end: '12:00'
          }
        }));
        yield { type: 'done' };
      }
    })
  });
  const events = await readSse(await handler(request({
    message: 'Clare, what should I focus on today?',
    priorAgentSlug: 'clare'
  })));
  assert.equal(events[0].type, 'agent');
  assert.equal(energyResult.energy_applied, true);
  assert.equal(energyResult.sequence[0].id, 'short');
  assert.match(tightResult.workday, /09:00–12:00 tool_input/);
  assert.ok(tightResult.deferred.some(item => item.id === 'later' && /capacity/i.test(item.reason)));

  const messageHandler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-20T01:00:00Z'),
    fetchImpl: githubWithWorkouts({}),
    getTasksStore: async () => memoryStore(tasks),
    getTeachingStore: async () => memoryStore({}),
    createAnthropicClient: () => ({
      async *streamMessage({ executeTools }) {
        messageEnergy = JSON.parse(await executeTools({
          id: 'call_msg',
          name: 'plan_work',
          input: { view: 'energy' }
        }));
        yield { type: 'done' };
      }
    })
  });
  await readSse(await messageHandler(request({
    message: 'Clare, my energy is low today. Reorder what I should tackle.',
    priorAgentSlug: 'clare'
  })));
  assert.equal(messageEnergy.energy_applied, true);
  assert.equal(messageEnergy.sequence[0].energy_level_used, 'low');
});

test('production chat route executes Chadwick analysis tool', async () => {
  const files = {
    'data/fitness/2026/08/2026-08-18-upper.md': workoutMarkdown({
      date: '2026-08-18',
      title: 'Upper',
      exercises: [{ name: 'Bench Press', reps: 8, weight: 60 }]
    }),
    'data/fitness/2026/08/2026-08-16-lower.md': workoutMarkdown({
      date: '2026-08-16',
      title: 'Lower',
      exercises: [{ name: 'Squat', reps: 5, weight: 80 }]
    })
  };
  let analysis;
  const handler = createChatHandler({
    env: validEnv,
    now: () => Date.parse('2026-08-20T01:00:00Z'),
    fetchImpl: githubWithWorkouts(files),
    createAnthropicClient: () => ({
      async *streamMessage({ executeTools }) {
        analysis = JSON.parse(await executeTools({
          id: 'call_an',
          name: 'analyse_training_evidence',
          input: { query: 'How is my training going lately?' }
        }));
        yield { type: 'done' };
      }
    })
  });
  const events = await readSse(await handler(request({
    message: 'Chadwick, how is my training going lately?',
    priorAgentSlug: 'chadwick',
    agentKernel: true
  })));
  assert.ok(events.some(event => event.type === 'kernel_trace' && event.workflow === 'training_review'));
  assert.equal(analysis?.ok, true, JSON.stringify(analysis));
  assert.equal(analysis.store, 'life_hub_fitness');
  assert.equal(analysis.enough_evidence, true, JSON.stringify(analysis));
  assert.equal(analysis.recent_count, 2);
  assert.equal(analysis.last_completed_date, '2026-08-18');
  assert.ok(!analysis.invented);
});
