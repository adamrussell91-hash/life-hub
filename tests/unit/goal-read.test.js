// tests/unit/goal-read.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  basisUpdatedAt, buildGoalRead, crunchWeeks, goalIdFromGhostId, mondayOfKey, termsFromHubPrefs
} from '../../netlify/functions/_shared/goal-read.mjs';

const TERMS = [{ term: 4, starts_on: '2026-10-12', ends_on: '2026-12-18' }];
const TODAY = '2026-11-04';

function task(partial) {
  return { kind: 'task', bucket: 'active', status: 'open', domain: 'other', due_date: null, completed_at: null,
    estimated_duration: null, parent_goal_id: null, parent_project_id: null, parent_task_id: null,
    updated_at: '2026-09-01T00:00:00.000Z', ...partial };
}

const GOAL = {
  id: 'g1', title: 'HA evidence', sphere: 'professional', status: 'active',
  lead_measure: { label: '1 write-up', per_week: 1 }, rest_weeks: [], week_log: {}, next_start: null,
  created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-10-20T00:00:00.000Z'
};
const HEAVY = Array.from({ length: 6 }, (_, i) => task({ id: `h${i}`, title: `Report ${i}`, due_date: '2026-11-18' }));
const TASKS = [
  task({ id: 't1', title: 'Write up 6.3', parent_goal_id: 'g1', due_date: '2026-11-06', estimated_duration: 60 }),
  task({ id: 't2', title: 'Old chase', parent_goal_id: 'g1', due_date: '2026-11-01' }),
  ...HEAVY
];

test('helpers: Monday keys, ghost ids, hub-prefs terms in either shape', () => {
  assert.equal(mondayOfKey('2026-11-04'), '2026-11-02');
  assert.equal(goalIdFromGhostId('goal-goal_a1-split-task_x'), 'goal_a1');
  assert.equal(goalIdFromGhostId('goal-g-1-start'), 'g-1');
  assert.equal(goalIdFromGhostId('alm-hold-x'), null);
  assert.deepEqual(termsFromHubPrefs({ school_terms: [{ year: 2026, terms: TERMS }] }), TERMS);
  assert.deepEqual(termsFromHubPrefs({ school_terms: TERMS }), TERMS);
  assert.deepEqual(termsFromHubPrefs(null), []);
});

test('crunch weeks are future weeks at or over max(5, 1.5 × median) open due tasks', () => {
  assert.deepEqual(crunchWeeks(TASKS, TERMS, TODAY), ['2026-11-16']);
});

test('the read: cold, lead count, crunch, verdict, and proposals in order', () => {
  const read = buildGoalRead({ goal: GOAL, projects: [], tasks: TASKS, terms: TERMS, today: TODAY });
  assert.equal(read.goal_id, 'g1');
  assert.equal(read.computed_on, TODAY);
  assert.equal(read.temperature, 'cold');
  assert.equal(read.days_since_movement, 15);
  assert.deepEqual(read.week, { count: 0, per_week: 1 });
  assert.deepEqual(read.crunch_weeks, ['2026-11-16']);
  assert.match(read.verdict, /Gone quiet: nothing for 15 days\./);
  assert.match(read.verdict, /0 of 1 this week\./);
  assert.match(read.verdict, /16\/11/);
  assert.deepEqual(read.ghosts.map(g => g.id), ['goal-g1-split-t1', 'goal-g1-rest-2026-11-16', 'goal-g1-move-t2']);
  const [split, rest, move] = read.ghosts;
  assert.equal(split.kind, 'split_task');
  assert.equal(split.steps.length, 3);
  assert.deepEqual(rest.rest_weeks, ['2026-11-16']);
  assert.deepEqual({ from: move.from, to: move.to }, { from: '2026-11-01', to: '2026-11-05' });
  assert.equal(read.basis_updated_at, '2026-10-20T00:00:00.000Z');
});

test('dismissed ids are left out; an empty goal gets a start task', () => {
  const read = buildGoalRead({ goal: GOAL, tasks: TASKS, terms: TERMS, today: TODAY, dismissed: ['goal-g1-rest-2026-11-16'] });
  assert.deepEqual(read.ghosts.map(g => g.id), ['goal-g1-split-t1', 'goal-g1-move-t2']);
  const empty = buildGoalRead({ goal: { ...GOAL, id: 'g2', next_start: 'Open the spreadsheet' }, tasks: [], terms: TERMS, today: TODAY });
  assert.deepEqual(empty.ghosts[0], {
    id: 'goal-g2-start', agent: 'hammond', kind: 'create_task', title: 'Open the spreadsheet', due: '2026-11-06',
    goalId: 'g2', domain: 'other', reason: 'Nothing is open under this goal'
  });
});

test('basis includes hosted project and task stamps', () => {
  const projects = [{ id: 'p1', parent_goal_id: 'g1', status: 'active', updated_at: '2026-11-03T00:00:00.000Z' }];
  assert.equal(basisUpdatedAt(GOAL, projects, TASKS), '2026-11-03T00:00:00.000Z');
});

test('Mandala: hosted work not on the grid is proposed as pillars and actions', async () => {
  const { mandalaAdditions, applyMandalaAdditions } = await import('../../netlify/functions/_shared/goal-read.mjs');
  const goal = {
    ...GOAL, structure: 'mandala',
    frame: { mandala: { pillars: [
      { id: 'p1', label: 'Fitness', project_id: 'pr1', actions: [{ id: 'a1', label: 'Easy runs', promoted: { kind: 'task', task_id: 'tk1' } }] }
    ] } }
  };
  const projects = [
    { id: 'pr1', title: 'Training block', parent_goal_id: 'g1', status: 'active' },
    { id: 'pr2', title: 'Kit', parent_goal_id: 'g1', status: 'active' }
  ];
  const hosted = [
    task({ id: 'tk1', title: 'Easy runs', parent_project_id: 'pr1' }),
    task({ id: 'tk2', title: 'Long run Sunday', parent_project_id: 'pr1' }),
    task({ id: 'tk3', title: 'Buy shoes', parent_project_id: 'pr2' }),
    task({ id: 'tk4', title: 'Done thing', parent_project_id: 'pr1', status: 'done', completed_at: '2026-11-01T00:00:00Z' }),
    task({ id: 'tk5', title: 'Loose task', parent_goal_id: 'g1' })
  ];
  const additions = mandalaAdditions({ goal, hostedProjects: projects, hostedTasks: hosted });
  assert.deepEqual(additions, [
    { type: 'pillar', slot: 1, label: 'Kit', project_id: 'pr2' },
    { type: 'action', pillar: 0, pillar_label: 'Fitness', project_id: 'pr1', slot: 1, label: 'Long run Sunday', task_id: 'tk2' },
    { type: 'action', pillar: 1, pillar_label: 'Kit', project_id: 'pr2', slot: 0, label: 'Buy shoes', task_id: 'tk3' }
  ]);
  assert.deepEqual(mandalaAdditions({ goal: { ...goal, structure: 'woop' }, hostedProjects: projects, hostedTasks: hosted }), []);

  // A pillar typed into Kit's slot since the read is kept, and Kit's task does not land under it.
  const edited = { ...goal, frame: { mandala: { pillars: [goal.frame.mandala.pillars[0], { id: 'p2', label: 'Sleep', project_id: null, actions: [] }] } } };
  const { frame, applied } = applyMandalaAdditions(edited, additions);
  assert.equal(applied, 1);
  assert.equal(frame.mandala.pillars[1].label, 'Sleep');
  assert.deepEqual(frame.mandala.pillars[0].actions[1], { id: 'p1a2', label: 'Long run Sunday', promoted: { kind: 'task', task_id: 'tk2' } });
  assert.equal(frame.mandala.pillars[1].actions.every(a => !a.label), true);
  assert.equal(frame.mandala.pillars.length, 8);
});

test('Mandala proposal leads the read, and its id maps back to the goal', () => {
  const goal = { ...GOAL, structure: 'mandala', frame: {} };
  const projects = [{ id: 'pr1', title: 'Training block', parent_goal_id: 'g1', status: 'active' }];
  const read = buildGoalRead({ goal, projects, tasks: TASKS, terms: TERMS, today: TODAY });
  const ghost = read.ghosts[0];
  assert.equal(ghost.kind, 'goal_mandala');
  assert.match(ghost.id, /^goal-g1-mandala-[0-9a-z]+$/);
  assert.equal(goalIdFromGhostId(ghost.id), 'g1');
  const again = buildGoalRead({ goal, projects, tasks: TASKS, terms: TERMS, today: TODAY, dismissed: [ghost.id] });
  assert.equal(again.ghosts.some(g => g.kind === 'goal_mandala'), false);
});
