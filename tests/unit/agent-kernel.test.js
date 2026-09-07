/**
 * Phase 1 kernel: plan / retrieve / assess / compose / recover.
 * Pack-layer plus prompt Delivery. Not a live conversational behaviour suite.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt } from '../../netlify/functions/_shared/persona.mjs';
import { buildAgentTools, resetCapabilityCaches } from '../../netlify/functions/_shared/capabilities/registry.mjs';
import {
  agentKernelEnabled,
  applyKernelToTurn,
  planTurn,
  proposeAction,
  resumeAgentKernel,
  runAgentKernel
} from '../../netlify/functions/_shared/agent-kernel.mjs';

const TODAY = '2026-08-20';
const NOW = new Date('2026-08-20T01:00:00.000Z');

const WORKOUTS = [
  {
    type: 'workout',
    status: 'completed',
    date: '2026-08-18',
    title: 'Upper Pump',
    pain_flags: [{ site: 'left shoulder', note: 'twinge on press' }],
    exercises: [{ name: 'Bench Press', sets: [{ weight_kg: 60, reps: 8 }] }]
  },
  {
    type: 'workout',
    status: 'completed',
    date: '2026-08-04',
    title: 'Pull',
    exercises: [{ name: 'Lat Pulldown', sets: [{ weight_kg: 45, reps: 10 }] }]
  }
];

const TASKS = [
  { id: '1', title: 'Mark essays', status: 'open', due_date: '2026-08-10', domain: 'teaching', priority: 'high' },
  { id: '2', title: 'Email parent', status: 'open', due_date: TODAY, domain: 'teaching' }
];

const LESSONS = [{ id: 'l1', title: 'Year 10 essay', date: TODAY, class_id: 'c1' }];

const CHADWICK_PARAPHRASES = [
  'How has my training been going lately?',
  "how's my training looking",
  'how is gym going',
  'give me a training recap',
  'fitness check in',
  "how's lifting this month",
  'am I getting stronger',
  'review my workouts',
  "what's my workout situation",
  'how are the weights moving',
  'training overview please',
  'catch me up on fitness',
  "been a while — how's training",
  'gym progress report',
  'how have sessions been',
  'read on my lifting',
  'strength update',
  'how is the programme going',
  'are my workouts on track',
  'training status',
  'what does recent training look like',
  "how's my gym work",
  'session history check',
  'volume looking okay',
  "how's the fitness going",
  'can you review training',
  'look at my workouts',
  'training lately',
  'lifting lately',
  'how have I been training',
  'any thoughts on recent gym work',
  'evaluate my training',
  "how's progress in the gym",
  'workout recap',
  'fitness summary',
  'am I on track in the gym',
  'tell me about recent sessions',
  'how is strength work going',
  'check my training',
  "what's happening with workouts",
  'gym recap',
  'recent lifting review',
  'how did training go this week',
  'I want a fitness overview',
  'walk me through training lately',
  'are the sessions adding up',
  "how's my exercise going",
  'training check',
  'give me the workout picture',
  'should I be worried about training progress'
];

const CLARE_PARAPHRASES = [
  'What should I focus on today?',
  "what's on my plate today",
  'triage my day',
  'where should I start this morning',
  "what's overdue",
  'plan today',
  "help me pick today's work",
  'what matters today',
  'daily focus',
  'morning sweep',
  "what's the one thing today",
  'prioritise today',
  'prioritize my tasks',
  'what should I do first',
  "today's priorities",
  'what have I got today',
  'sort my day',
  'focus for today',
  'what needs attention today',
  "what's due today",
  "give me today's plan",
  'how should I spend today',
  "what's blocking me today",
  'stale work I should face',
  'what can I realistically do today',
  'start-of-day brief',
  "today's next move",
  'what is on today',
  'run me through today',
  "today's task picture",
  'which deadline is first',
  'capacity for today',
  'what should I not ignore today',
  'help me plan the day',
  "today's workload",
  'what is waiting today',
  'pick a focus',
  "today's triage",
  'what do I owe today',
  "look at today's tasks",
  'day plan please',
  "what's slipping today",
  'I need a focus',
  'what should I knock out today',
  "today's board",
  "hit me with today's priorities",
  'what is actually due',
  'make a today plan',
  "what's my day look like",
  'smallest next move today'
];

test('kernel flag stays off for unknown agents and when unset', () => {
  assert.equal(agentKernelEnabled({ slug: 'sterling', flag: true }), false);
  assert.equal(agentKernelEnabled({ slug: 'hammond', flag: true }), true);
  assert.equal(agentKernelEnabled({ slug: 'chadwick', env: {} }), false);
  assert.equal(agentKernelEnabled({ slug: 'clare', env: { LIFE_HUB_AGENT_KERNEL: '1' } }), true);
  assert.equal(agentKernelEnabled({ slug: 'chadwick', flag: true }), true);
});

test('Chadwick paraphrases select training_review (≥95% of 50)', () => {
  assert.equal(CHADWICK_PARAPHRASES.length, 50);
  const hits = CHADWICK_PARAPHRASES.filter(message => planTurn({ slug: 'chadwick', message }).plan.workflow === 'training_review');
  assert.ok(hits.length / 50 >= 0.95, `only ${hits.length}/50`);
});

test('Clare paraphrases select daily_focus (≥95% of 50)', () => {
  assert.equal(CLARE_PARAPHRASES.length, 50);
  const hits = CLARE_PARAPHRASES.filter(message => planTurn({ slug: 'clare', message }).plan.workflow === 'daily_focus');
  assert.ok(hits.length / 50 >= 0.95, `only ${hits.length}/50`);
});

test('greetings and off-domain asks do not retrieve', () => {
  for (const message of ['hey bro', 'hello', 'thanks', 'just saying hi']) {
    assert.equal(planTurn({ slug: 'chadwick', message }).plan.workflow, 'none', message);
    assert.equal(planTurn({ slug: 'clare', message }).plan.workflow, 'none', message);
  }
  assert.equal(planTurn({ slug: 'chadwick', message: "what's for dinner" }).plan.workflow, 'none');
  assert.equal(planTurn({ slug: 'clare', message: 'create a task called buy milk' }).plan.workflow, 'none');
});

test('decline wording adds pain and load to the Chadwick plan', () => {
  const plan = planTurn({ slug: 'chadwick', message: 'why is my performance declining' }).plan;
  assert.ok(plan.requiredSources.includes('get_pain_training_summary'));
  assert.ok(plan.requiredSources.includes('get_load_status'));
});

test('Chadwick training review retrieves snapshot, windows, and pain', () => {
  const kernel = runAgentKernel({
    slug: 'chadwick',
    message: 'How has my training been going lately?',
    today: TODAY,
    now: NOW,
    stores: { workouts: WORKOUTS, composition: [], measurements: [] }
  });
  assert.equal(kernel.plan.workflow, 'training_review');
  assert.equal(kernel.evidence.get_fitness_snapshot.last_completed_date, '2026-08-18');
  assert.ok(kernel.evidence.compare_workout_windows.current.from);
  assert.ok(kernel.claims.some(claim => claim.fact === 'last_completed_date'));
  assert.deepEqual(kernel.trace.map(item => item.stage), ['plan', 'retrieve', 'assess', 'resolve', 'compose']);
});

test('missing workouts are a named gap, not a complete review', () => {
  const kernel = runAgentKernel({
    slug: 'chadwick',
    message: 'review my workouts',
    today: TODAY,
    now: NOW,
    stores: { workouts: [] }
  });
  assert.equal(kernel.complete, false);
  assert.equal(kernel.sufficient, false);
  assert.ok(kernel.limitations.some(item => /No completed sessions/i.test(item.text)));
  assert.match(kernel.promptBlock, /incomplete/i);
});

test('conflicted evidence cannot compose as complete', () => {
  const kernel = runAgentKernel({
    slug: 'chadwick',
    message: 'training recap',
    today: TODAY,
    now: NOW,
    stores: { workouts: WORKOUTS }
  });
  kernel.evidence.get_fitness_snapshot = {
    ...kernel.evidence.get_fitness_snapshot,
    conflict: { kind: 'large_weight_delta' }
  };
  const assessed = runAgentKernel({ state: { ...kernel, stage: 'retrieved' } });
  assert.ok(assessed.limitations.some(item => item.kind === 'conflict'));
  assert.equal(assessed.complete, false);
});

test('truncated evidence stays visible', () => {
  const kernel = runAgentKernel({
    slug: 'clare',
    message: 'What should I focus on today?',
    today: TODAY,
    now: NOW,
    stores: { tasks: TASKS, projects: [], lessons: [] }
  });
  kernel.evidence.get_tasks_focus = {
    ...kernel.evidence.get_tasks_focus,
    truncated: true,
    kept: 1,
    omitted: 12
  };
  const assessed = runAgentKernel({ state: { ...kernel, stage: 'retrieved' } });
  assert.ok(assessed.limitations.some(item => item.kind === 'truncated'));
  assert.equal(assessed.complete, false);
});

test('Clare daily focus names overdue work and same-day teaching collisions', () => {
  const kernel = runAgentKernel({
    slug: 'clare',
    message: 'What should I focus on today?',
    today: TODAY,
    now: NOW,
    stores: { tasks: TASKS, projects: [], lessons: LESSONS }
  });
  assert.equal(kernel.plan.workflow, 'daily_focus');
  assert.equal(kernel.claims.find(claim => claim.fact === 'overdue_title')?.value, 'Mark essays');
  assert.ok(kernel.evidence.plan_work.collisions.length >= 1);
  assert.ok(Number(kernel.claims.find(claim => claim.fact === 'collision_count')?.value) >= 1);
});

test('failed tasks store is fail-visible', () => {
  const kernel = runAgentKernel({
    slug: 'clare',
    message: 'plan today',
    today: TODAY,
    now: NOW,
    stores: { tasks: [], loadErrors: { tasks: 'store_down' } }
  });
  assert.equal(kernel.sufficient, false);
  assert.ok(kernel.limitations.some(item => item.kind === 'failed'));
  assert.match(kernel.promptBlock, /store_down|unavailable|failed/i);
});

test('recovery resumes from the last safe stage without losing evidence or duplicating retrieve', () => {
  const halted = runAgentKernel({
    slug: 'chadwick',
    message: 'training recap',
    today: TODAY,
    now: NOW,
    stores: { workouts: WORKOUTS },
    failAt: 'retrieve'
  });
  assert.equal(halted.stage, 'planned');
  assert.equal(Object.keys(halted.evidence).length, 0);
  const resumed = resumeAgentKernel(halted);
  assert.equal(resumed.stage, 'composed');
  assert.ok(resumed.evidence.get_fitness_snapshot.last_completed_date);
  assert.equal(resumed.trace.filter(item => item.stage === 'retrieve').length, 1);
  assert.equal(resumed.trace.filter(item => item.stage === 'plan').length, 1);
});

test('proposeAction is idempotent for the same key', () => {
  const kernel = runAgentKernel({
    slug: 'clare',
    message: 'plan today',
    today: TODAY,
    now: NOW,
    stores: { tasks: TASKS }
  });
  const first = proposeAction(kernel, { intent: 'Create task: x', idempotencyKey: 'clare:create:x' });
  const second = proposeAction(kernel, { intent: 'Create task: x', idempotencyKey: 'clare:create:x' });
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(kernel.actions.length, 1);
});

test('Chadwick Delivery: pain claim and interpretation reach the system prompt', () => {
  const kernel = runAgentKernel({
    slug: 'chadwick',
    message: 'why is training declining',
    today: TODAY,
    now: NOW,
    stores: { workouts: WORKOUTS, composition: [{ date: TODAY, weight_kg: 84 }], measurements: [] }
  });
  assert.ok(kernel.claims.some(claim => claim.fact === 'pain_site' && claim.value === 'left shoulder'));
  const prompt = buildSystemPrompt({
    slug: 'chadwick',
    evidencePackBlock: kernel.promptBlock,
    kernelBlock: kernel.interpretationBlock
  });
  assert.match(prompt, /left shoulder/);
  assert.match(prompt, /Do not programme or recommend as if that constraint is absent/);
});

test('negative control: no pain store does not invent a pain constraint', () => {
  const clean = [
    { type: 'workout', status: 'completed', date: '2026-08-18', title: 'Easy', exercises: [] }
  ];
  const kernel = runAgentKernel({
    slug: 'chadwick',
    message: 'training recap',
    today: TODAY,
    now: NOW,
    stores: { workouts: clean }
  });
  assert.ok(!kernel.claims.some(claim => claim.fact === 'pain_site'));
  assert.match(kernel.interpretationBlock, /Do not invent a pain constraint/);
});

test('Clare Delivery: overdue title reaches the system prompt', () => {
  const kernel = runAgentKernel({
    slug: 'clare',
    message: 'What should I focus on today?',
    today: TODAY,
    now: NOW,
    stores: { tasks: TASKS, lessons: LESSONS }
  });
  const prompt = buildSystemPrompt({
    slug: 'clare',
    evidencePackBlock: kernel.promptBlock,
    kernelBlock: kernel.interpretationBlock
  });
  assert.match(prompt, /Mark essays/);
  assert.match(prompt, /Do not ignore it when naming the next move/);
  assert.match(prompt, /Teaching and tasks collide/);
});

test('flagged kernel trims Chadwick tools to the planned set plus write gateway', () => {
  resetCapabilityCaches();
  const full = buildAgentTools({
    slug: 'chadwick',
    allowedTypes: ['workout'],
    needsExerciseLibrary: true,
    message: 'How has my training been going lately?'
  });
  const applied = applyKernelToTurn({
    slug: 'chadwick',
    message: 'How has my training been going lately?',
    today: TODAY,
    now: NOW,
    stores: { workouts: WORKOUTS },
    tools: full,
    flag: true
  });
  assert.equal(applied.enabled, true);
  assert.ok(applied.tools.length < full.length);
  assert.ok(applied.tools.every(tool => [
    'get_fitness_snapshot', 'compare_workout_windows', 'get_training_volume',
    'get_body_state', 'get_load_status', 'get_pain_training_summary',
    'os_propose_action', 'create_task', 'update_task', 'clare_mutate',
    'propose_central_node_patch', 'remember_write_memory'
  ].includes(tool.name)));
});

test('kernel off leaves the existing tool list untouched', () => {
  resetCapabilityCaches();
  const full = buildAgentTools({ slug: 'clare', message: 'What should I focus on today?' });
  const applied = applyKernelToTurn({
    slug: 'clare',
    message: 'What should I focus on today?',
    today: TODAY,
    tools: full,
    flag: false
  });
  assert.equal(applied.enabled, false);
  assert.equal(applied.tools, full);
});
