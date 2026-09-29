import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGoalProposal,
  buildGoalCheckinProposal,
  createGoalWriteExecutor,
  proposeGoalSchema,
  proposeGoalCheckinSchema
} from '../../netlify/functions/_shared/goal-agent.mjs';
import {
  classifyWriteTarget,
  validateProposeActionInput,
  executeProposeActionWrites
} from '../../netlify/functions/_shared/capabilities/propose-action.mjs';
import {
  buildAgentTools,
  capabilityIdsForAgent,
  isPathAllowedForAgent,
  resetCapabilityCaches
} from '../../netlify/functions/_shared/capabilities/registry.mjs';

function memoryStore() {
  const map = new Map();
  return {
    async get(key, { type } = {}) {
      if (!map.has(key)) return null;
      const raw = map.get(key);
      return type === 'json' ? JSON.parse(raw) : raw;
    },
    async setJSON(key, value) {
      map.set(key, JSON.stringify(value));
    },
    async list({ prefix = '' } = {}) {
      return { blobs: [...map.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) };
    },
    _get(key) {
      const raw = map.get(key);
      return raw ? JSON.parse(raw) : null;
    }
  };
}

test('goals tools are offered to Hammond and Clare only', () => {
  resetCapabilityCaches();
  for (const slug of ['hammond', 'clare']) {
    assert.ok(capabilityIdsForAgent(slug).includes('goals.propose'), slug);
    assert.ok(capabilityIdsForAgent(slug).includes('goals.checkin'), slug);
    const names = buildAgentTools({ slug }).map(tool => tool.name);
    assert.ok(names.includes('propose_goal'), slug);
    assert.ok(names.includes('propose_goal_checkin'), slug);
    assert.equal(isPathAllowedForAgent(slug, 'tasks:goal:goal_x', { mode: 'write' }), true, slug);
    assert.equal(isPathAllowedForAgent(slug, 'tasks:goal_checkin:2026-10-01', { mode: 'write' }), true, slug);
  }
  assert.ok(!capabilityIdsForAgent('ann').includes('goals.propose'));
  assert.ok(!buildAgentTools({ slug: 'ann' }).some(tool => tool.name === 'propose_goal'));
  assert.equal(proposeGoalSchema().name, 'propose_goal');
  assert.equal(proposeGoalCheckinSchema().name, 'propose_goal_checkin');
});

test('classifyWriteTarget routes tasks:goal and tasks:goal_checkin', () => {
  assert.deepEqual(classifyWriteTarget('tasks:goal:goal_abc'), {
    store: 'tasks', kind: 'goal', id: 'goal_abc', key: 'goals/goal_abc', path: 'tasks:goal:goal_abc'
  });
  assert.deepEqual(classifyWriteTarget('tasks:goal_checkin:2026-10-01'), {
    store: 'tasks',
    kind: 'goal_checkin',
    id: '2026-10-01',
    key: 'goal_checkins/2026-10-01',
    path: 'tasks:goal_checkin:2026-10-01'
  });
});

test('buildGoalProposal and checkin validate for Hammond/Clare', () => {
  const goal = buildGoalProposal({
    summary: 'Track sleep',
    title: 'Sleep 7h',
    sphere: 'life',
    parent_someday_id: 'someday_1',
    key: 'sleep'
  });
  assert.equal(goal.ok, true);
  assert.equal(goal.proposal.writes[0].path, 'tasks:goal:goal_sleep');
  assert.match(goal.proposal.writes[0].diff, /Grow someday/);
  assert.equal(validateProposeActionInput(goal.proposal, { agentSlug: 'hammond' }).ok, true);
  assert.equal(validateProposeActionInput(goal.proposal, { agentSlug: 'clare' }).ok, true);
  assert.equal(validateProposeActionInput(goal.proposal, { agentSlug: 'ann' }).ok, false);

  const checkin = buildGoalCheckinProposal({
    summary: 'Week check-in',
    date: '2026-10-01',
    moved: [{ id: 'goal_sleep' }],
    stuck: [{ id: 'goal_other', reason: 'no time' }],
    moves_planned: 2
  });
  assert.equal(checkin.ok, true);
  assert.equal(checkin.proposal.writes[0].path, 'tasks:goal_checkin:2026-10-01');
  assert.equal(validateProposeActionInput(checkin.proposal, { agentSlug: 'clare' }).ok, true);
});

test('Confirm executor writes goal and checkin into tasks store', async () => {
  const store = memoryStore();
  const executor = createGoalWriteExecutor({ store, nowIso: () => '2026-10-01T12:00:00.000Z' });
  const goal = buildGoalProposal({ summary: 'Add', title: 'Run 3x', key: 'run' });
  const applied = await executeProposeActionWrites({}, goal.proposal, {
    blobStores: { goals: executor }
  });
  assert.equal(applied.ok, true);
  const record = store._get('goals/goal_run');
  assert.equal(record.title, 'Run 3x');
  assert.deepEqual(store._get('goals/_index'), ['goal_run']);

  const checkin = buildGoalCheckinProposal({
    summary: 'Check',
    date: '2026-10-01',
    stuck: [{ id: 'goal_run', reason: 'rain' }],
    moves_planned: 1
  });
  const checked = await executeProposeActionWrites({}, checkin.proposal, {
    blobStores: { goals: executor }
  });
  assert.equal(checked.ok, true);
  assert.equal(store._get('goal_checkins/2026-10-01').moves_planned, 1);
  assert.equal(store._get('goal_checkins/latest').date, '2026-10-01');
  assert.equal(store._get('goal_reads/goal_run').stuck_reason, 'rain');
});
