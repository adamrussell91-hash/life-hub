import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptPlan, validateGhost, GHOST_AGENTS, GHOST_KINDS } from '../../packages/design-kit/js/calendar/ghost-writes.js';
import { applyProfessionalStep, calendarGhostConfirmProposal } from '../../netlify/functions/calendar-ghosts.mjs';
import { validateProposeActionInput } from '../../netlify/functions/_shared/capabilities/propose-action.mjs';
import { resetCapabilityCaches } from '../../netlify/functions/_shared/capabilities/registry.mjs';

const outing = {
  id: 'clare-outing-2026-10-04',
  agent: 'clare',
  kind: 'outing',
  date: '2026-10-04',
  start: '09:00',
  end: '10:00',
  title: 'Breakfast at Cafe X',
  place: 'Cafe X',
  reason: 'Adam said Saturday breakfast'
};

const meal = {
  id: 'brisket-meal_block-2026-10-05',
  agent: 'brisket',
  kind: 'meal_block',
  date: '2026-10-05',
  start: '18:30',
  end: '19:30',
  title: 'Dinner prep window'
};

const workout = {
  id: 'chadwick-schedule_workout-2026-10-06',
  agent: 'chadwick',
  kind: 'schedule_workout',
  date: '2026-10-06',
  start: '06:30',
  end: '07:30',
  title: 'Lower body'
};

const reschedule = {
  id: 'hammond-reschedule_block-2026-10-07',
  agent: 'hammond',
  kind: 'reschedule_block',
  path: 'records/2026/10/04/calendar-breakfast-at-cafe-x-0900.md',
  date: '2026-10-07',
  start: '10:00',
  end: '11:00',
  title: 'Breakfast at Cafe X'
};

const cancel = {
  id: 'clare-cancel_block-2026-10-04',
  agent: 'clare',
  kind: 'cancel_block',
  path: 'records/2026/10/04/calendar-breakfast-at-cafe-x-0900.md',
  date: '2026-10-04',
  title: 'Breakfast at Cafe X'
};

const logComm = {
  id: 'ann-log_comm-2026-10-03',
  agent: 'ann',
  kind: 'log_comm',
  date: '2026-10-03',
  direction: 'outbound',
  channel: 'email',
  title: 'Gifted week plan',
  summary: 'Emailed Kate about gifted week.',
  person_refs: ['shared:person:p_kate'],
  reason: 'Adam asked to log it'
};

test('new agents and kinds are registered', () => {
  assert.ok(GHOST_AGENTS.hyaluronica);
  assert.ok(GHOST_AGENTS.ann);
  assert.ok(GHOST_AGENTS.clementine);
  for (const kind of ['outing', 'meal_block', 'schedule_workout', 'reschedule_block', 'cancel_block', 'log_comm']) {
    assert.ok(GHOST_KINDS.includes(kind), kind);
  }
});

test('outing / meal_block / schedule_workout create Life calendar_block plans', () => {
  for (const ghost of [outing, meal, workout]) {
    validateGhost(ghost);
    const plan = acceptPlan(ghost, { today: '2026-10-03' });
    const life = plan.steps.find(step => step.target === 'life_record');
    assert.equal(life.mode, 'create');
    assert.equal(life.record.type, 'calendar_block');
    assert.equal(life.record.date, ghost.date);
    assert.equal(life.record.time, ghost.start);
    assert.equal(life.record.end_time, ghost.end);
    assert.equal(life.record.title, ghost.title);
    assert.equal(life.record.status, 'tentative');
  }
  assert.equal(acceptPlan(outing).steps.find(s => s.target === 'life_record').record.kind, 'plan');
  assert.equal(acceptPlan(workout).steps.find(s => s.target === 'life_record').record.kind, 'workout');
  assert.throws(() => validateGhost({ ...outing, end: '08:00' }), /start < end/);
});

test('reschedule_block and cancel_block update Life records', () => {
  validateGhost(reschedule);
  const move = acceptPlan(reschedule, { today: '2026-10-03' });
  assert.deepEqual(move.steps.find(s => s.target === 'life_record'), {
    target: 'life_record',
    mode: 'update',
    path: reschedule.path,
    fields: { date: '2026-10-07', time: '10:00', end_time: '11:00', title: 'Breakfast at Cafe X' }
  });

  validateGhost(cancel);
  const drop = acceptPlan(cancel, { today: '2026-10-03' });
  assert.deepEqual(drop.steps.find(s => s.target === 'life_record'), {
    target: 'life_record',
    mode: 'update',
    path: cancel.path,
    fields: { status: 'cancelled' }
  });
  assert.throws(() => validateGhost({ ...cancel, path: '' }), /path/);
});

test('log_comm plans professional log_communication without duration', () => {
  validateGhost(logComm);
  validateGhost({ ...logComm, time: undefined, agent: 'hyaluronica', id: 'hyaluronica-log_comm-2026-10-03' });
  assert.throws(() => validateGhost({ ...logComm, direction: 'sideways' }), /direction/);
  const plan = acceptPlan(logComm, { today: '2026-10-03' });
  const step = plan.steps.find(s => s.target === 'professional');
  assert.equal(step.action, 'log_communication');
  assert.equal(step.time, '12:00');
  assert.equal(step.duration_min, undefined);
  assert.equal(step.direction, 'outbound');
  assert.equal(step.channel, 'email');
  assert.equal(step.title, 'Gifted week plan');
  assert.equal(step.summary, 'Emailed Kate about gifted week.');
  assert.deepEqual(step.person_refs, ['shared:person:p_kate']);
  assert.match(plan.receipt, /Comms: logged outbound email/);
});

test('applyProfessionalStep log_communication uses occurred_at and links people', async () => {
  const created = [];
  await applyProfessionalStep(
    {
      createCommunication: async (input) => {
        created.push(input);
        return { communication: { id: 'communication_log' } };
      },
      createLink: async () => { throw new Error('should not link thread'); }
    },
    acceptPlan(logComm, { today: '2026-10-03' }).steps.find(s => s.target === 'professional')
  );
  assert.equal(created[0].direction, 'outbound');
  assert.equal(created[0].channel, 'email');
  assert.equal(created[0].subject, 'Gifted week plan');
  assert.equal(created[0].summary, 'Emailed Kate about gifted week.');
  assert.ok(created[0].occurred_at);
  assert.equal(created[0].scheduled_start, undefined);
  assert.deepEqual(created[0].links, [{ relationship_type: 'recipient', target_ref: 'shared:person:p_kate' }]);
});

test('calendarGhostConfirmProposal is allowlisted display-only under data/os', () => {
  resetCapabilityCaches();
  const input = calendarGhostConfirmProposal(outing);
  assert.match(input.writes[0].path, /^data\/os\/calendar-ghost-confirm\//);
  const validated = validateProposeActionInput(input, { agentSlug: 'clare' });
  assert.equal(validated.ok, true, validated.error);
  assert.ok(validated.proposal.surfaces.includes('confirm_card'));
});
