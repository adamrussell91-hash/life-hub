// tests/unit/goal-checkin-v2.test.js
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createSessionToken } from '../../netlify/functions/_shared/auth-security.mjs';
import { buildGoalRead, stuckReasonGhost } from '../../netlify/functions/_shared/goal-read.mjs';
import { createGoalCheckinsHandler } from '../../netlify/functions/goal-checkins.mjs';

const SECRET = 's'.repeat(32);
const env = {
  LIFE_HUB_PASSPHRASE_HASH: 'configured',
  SESSION_SECRET: SECRET,
  SITE_ORIGIN: 'https://life-hub.adam-russell.com'
};
const session = createSessionToken(
  { now: Date.parse('2026-09-27T00:00:00Z'), randomBytes: () => Buffer.alloc(16, 4) },
  SECRET
).token;

const goal = {
  id: 'g1', title: 'Marking', sphere: 'work', status: 'active',
  lead_measure: { label: '2 packs', per_week: 2 },
  week_log: {}, rest_weeks: [], milestones: [],
  created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z'
};

function memoryStore(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    async get(key, { type } = {}) {
      return map.has(key) ? (type === 'json' ? structuredClone(map.get(key)) : map.get(key)) : null;
    },
    async setJSON(key, value) {
      map.set(key, structuredClone(value));
    },
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })) };
    }
  };
}

function request(url, { method = 'GET', body } = {}) {
  return new Request(url, {
    method,
    headers: {
      cookie: `life_hub_session=${session}`,
      origin: 'https://life-hub.adam-russell.com',
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
}

describe('G-36 stuck_reason drives next Hammond ghost', () => {
  it('maps too_big → split, unclear → SMARTER create, boring → if-then, no_time → block', () => {
    const task = {
      id: 't1', title: 'Big pack', status: 'open', kind: 'task',
      estimated_duration: 90, parent_goal_id: 'g1', due_date: '2026-11-06'
    };
    assert.equal(stuckReasonGhost({
      goal, stuck_reason: 'too_big', hostedTasks: [task], tasks: [], today: '2026-11-04', domain: 'teaching'
    })?.kind, 'split_task');

    const unclear = stuckReasonGhost({
      goal, stuck_reason: 'unclear', hostedTasks: [], tasks: [], today: '2026-11-04', domain: 'teaching'
    });
    assert.equal(unclear?.kind, 'create_task');
    assert.match(unclear.reason, /unclear|SMARTER/i);

    const boring = stuckReasonGhost({
      goal, stuck_reason: 'boring', hostedTasks: [], tasks: [], today: '2026-11-04', domain: 'teaching'
    });
    assert.match(boring.reason, /if-then|boring/i);

    assert.equal(stuckReasonGhost({
      goal, stuck_reason: 'no_time', hostedTasks: [task], tasks: [], today: '2026-11-04', domain: 'teaching',
      slots: [{ date: '2026-11-05', start: '12:00' }], count: 0, perWeek: 2
    })?.kind, 'protect_block');
  });

  it('puts the stuck ghost first on the read', () => {
    const read = buildGoalRead({
      goal: { ...goal, updated_at: '2026-10-20T00:00:00.000Z' },
      today: '2026-11-04',
      stuck_reason: 'unclear'
    });
    assert.equal(read.temperature, 'cold');
    assert.equal(read.ghosts[0]?.kind, 'create_task');
    assert.match(read.ghosts[0].reason, /unclear|SMARTER/i);
  });
});

describe('G-37 goal_checkins save + latest', () => {
  it('POSTs a check-in, writes stuck_reason, and GETs latest', async () => {
    const store = memoryStore();
    const handler = createGoalCheckinsHandler({
      env,
      getContentStore: async () => store
    });
    const post = await handler(request('https://api.adam-russell.com/api/goal-checkins', {
      method: 'POST',
      body: {
        date: '2026-09-27',
        moved: ['g1'],
        stuck: [{ id: 'g1', reason: 'too_big' }],
        moves_planned: 2
      }
    }));
    assert.equal(post.status, 200);
    const saved = (await post.json()).data.checkin;
    assert.equal(saved.date, '2026-09-27');
    assert.equal(saved.moves_planned, 2);
    assert.equal(store.map.get('goal_checkins/latest').moves_planned, 2);
    assert.equal(store.map.get('goal_reads/g1').stuck_reason, 'too_big');

    const get = await handler(request('https://api.adam-russell.com/api/goal-checkins'));
    assert.equal(get.status, 200);
    assert.equal((await get.json()).data.checkin.date, '2026-09-27');
  });
});
