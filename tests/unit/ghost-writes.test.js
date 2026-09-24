import test from 'node:test';
import assert from 'node:assert/strict';
import { acceptPlan, dismissPlan, validateGhost } from '../../apps/life/js/app/ghost-writes.js';
import { applyCentralNodePatch, classifyCentralNodePatchRisk } from '../../apps/life/js/core/central-node-patch.js';
import { validateCentralNodePatchInput } from '../../netlify/functions/_shared/hammond-tools.mjs';
import { lifeEventToBusySpan } from '../../netlify/functions/_shared/productivity-os.mjs';

const CN = `# Purpose
Purpose body.

## ⚡ Today's Status — Thursday, 24 September 2026
**Flags:** Sore throat.

## 📅 This Week
- Resource day Mon

## 🤝 Cross-Agent Coordination
- Chadwick→Brisket: training day

## 📝 Recent Agent Actions
- 23 Sep — Brisket: snack logged
`;

// The four ghosts on the Tideline reference week.
const SKIP = { id: 'g-skip', agent: 'sara', kind: 'skip_workout', date: '2026-09-24', reason: 'capacity 34%, sore throat', workoutPath: 'records/2026/09/24/workout-1815.md' };
const BED = { id: 'g-bed', agent: 'sara', kind: 'bedtime', date: '2026-09-24', time: '22:00', reason: '5.4 h last night' };
const GOOD = { id: 'g-good', agent: 'hammond', kind: 'protect_block', date: '2026-09-26', start: '18:00', end: '22:00', title: 'Dinner out + a show', with: 'corey' };
const MOVE = { id: 'g-move', agent: 'hammond', kind: 'move_task', taskId: 'task-josh-y10', title: 'Year 10 leadership opportunities for Josh Lizzio', from: '2026-09-25', to: '2026-10-13' };

function cnSteps(plan) {
  return plan.steps.filter(s => s.target === 'central_node').map(s => s.patch);
}

test('every Central Node step passes the server validator and is auto-class', () => {
  for (const ghost of [SKIP, BED, GOOD, MOVE]) {
    for (const patch of cnSteps(acceptPlan(ghost))) {
      assert.deepEqual(validateCentralNodePatchInput(patch), patch, `${ghost.id}: invalid patch`);
      assert.equal(classifyCentralNodePatchRisk(patch), 'auto', `${ghost.id}: ${patch.section}/${patch.op} is not auto`);
    }
  }
});

test('Sara skip workout: exact Cross-Agent line, workout marked skipped, one Recent Action', () => {
  const plan = acceptPlan(SKIP);
  let content = CN;
  for (const patch of cnSteps(plan)) content = applyCentralNodePatch(content, patch);
  assert.match(content, /## 🤝 Cross-Agent Coordination\n- Sara→Chadwick: skip Thu 24\/09 workout \(capacity 34%, sore throat\)\.\n- Chadwick→Brisket/);
  assert.match(content, /- 24 Sep — Sara: skip workout accepted \(capacity 34%, sore throat\)/);
  assert.deepEqual(plan.steps.find(s => s.target === 'life_record'), {
    target: 'life_record', mode: 'update', path: SKIP.workoutPath, fields: { status: 'skipped' }
  });
  assert.match(plan.receipt, /^Sara → Central Node: “Sara→Chadwick: skip Thu 24\/09 workout/);
});

test('Sara bedtime: Today’s Status Sleep field and a protected rest event', () => {
  const plan = acceptPlan(BED);
  let content = CN;
  for (const patch of cnSteps(plan)) content = applyCentralNodePatch(content, patch);
  assert.match(content, /\*\*Sleep:\*\* lights out 10:00 pm \(5\.4 h last night\)/);
  const rec = plan.steps.find(s => s.target === 'life_record').record;
  assert.equal(rec.type, 'calendar_block');
  assert.equal(rec.kind, 'rest');
  assert.equal(rec.time, '21:30');
  assert.equal(rec.end_time, '22:00');
  assert.deepEqual(lifeEventToBusySpan(rec), { start: 21 * 60 + 30, end: 22 * 60, title: rec.title, kind: 'life_event' });
  assert.equal(rec.protected, true);
});

test('Hammond good night with Corey: tentative protected corey event, This Week line, Clare told', () => {
  const plan = acceptPlan(GOOD);
  const rec = plan.steps.find(s => s.target === 'life_record').record;
  assert.equal(rec.type, 'calendar_block');
  assert.equal(rec.kind, 'corey');
  assert.equal(rec.status, 'tentative');
  assert.ok(lifeEventToBusySpan(rec), 'Clare treats the Corey block as busy');
  assert.equal(rec.end_time, '22:00');
  let content = CN;
  for (const patch of cnSteps(plan)) content = applyCentralNodePatch(content, patch);
  assert.match(content, /- Sat 26\/09 6:00 pm–10:00 pm: Dinner out \+ a show with Corey \(protected\)\./);
  assert.match(content, /- Hammond→Clare: keep Sat 26\/09 6:00 pm–10:00 pm clear \(Corey\)\./);
  assert.match(plan.receipt, /Nothing is booked or paid without you/);
});

test('move task goes through the Tasks API and nowhere else', () => {
  const plan = acceptPlan(MOVE);
  assert.deepEqual(plan.steps[0], { target: 'tasks', method: 'PATCH', id: 'task-josh-y10', body: { due_date: '2026-10-13' } });
  assert.equal(plan.steps.filter(s => s.target === 'tasks').length, 1);
  assert.match(plan.receipt, /due 25\/09\/26 → 13\/10\/26/);
  const recent = acceptPlan(MOVE, { today: '2026-09-24' }).steps.find(s => s.patch?.section === 'recent_actions');
  assert.match(recent.patch.payload.text, /^- 24 Sep — Hammond: moved/);
});

test('dismiss writes nothing and records the decision', () => {
  const plan = dismissPlan(SKIP, { reason: 'feel fine' });
  assert.deepEqual(plan.steps, []);
  assert.deepEqual(plan.decision, { agent: 'sara', kind: 'skip_workout', outcome: 'dismissed', reason: 'feel fine' });
});

test('bad proposals are rejected before any write exists', () => {
  assert.throws(() => validateGhost({ ...SKIP, agent: 'nobody' }), /Unknown agent/);
  assert.throws(() => validateGhost({ ...GOOD, start: '22:00', end: '18:00' }), /start < end/);
  assert.throws(() => validateGhost({ ...BED, time: '10pm' }), /HH:MM/);
  assert.throws(() => validateGhost({ ...MOVE, to: '13/10/26' }), /from and to/);
  assert.throws(() => acceptPlan({ ...SKIP, kind: 'book_flight' }), /Unknown ghost kind/);
});

test('Almanac: a lead-line step becomes a task due on its last safe day', () => {
  const plan = acceptPlan({ id: 'g-pet', agent: 'hammond', kind: 'create_task', title: 'Pet sitter for Leo, Maxxie, SJ & Hunter', due: '2026-10-28', source: 'almanac:korea:pet-sitter' }, { today: '2026-09-24' });
  assert.deepEqual(plan.steps[0], { target: 'tasks', method: 'POST', body: { title: 'Pet sitter for Leo, Maxxie, SJ & Hunter', due_date: '2026-10-28', status: 'open', source: 'almanac:korea:pet-sitter' } });
  assert.match(plan.receipt, /due 28\/10\/26 \(the last safe day\)/);
});

test('Almanac: a draft message is only ever a draft', () => {
  const plan = acceptPlan({ id: 'g-bob', agent: 'hammond', kind: 'draft_message', to: 'Bob', text: 'Lunch on Monday 28 September?' });
  assert.deepEqual(plan.steps, [{ target: 'draft', to: 'Bob', text: 'Lunch on Monday 28 September?' }]);
  assert.equal(plan.steps.some(s => s.target === 'central_node' || s.target === 'tasks'), false);
  assert.equal(plan.receipt, 'Draft ready for Bob. Nothing sent.');
  assert.throws(() => validateGhost({ id: 'x', agent: 'hammond', kind: 'draft_message', to: 'Bob', text: '' }), /needs to and text/);
});
