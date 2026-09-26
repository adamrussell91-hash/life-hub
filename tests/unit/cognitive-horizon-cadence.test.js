import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createMemoryCognitiveStore } from '../../netlify/functions/_shared/cognitive-store.mjs';
import {
  createCognitiveService,
  HORIZON_MIN_DAYS,
  lastCompletedRun
} from '../../netlify/functions/_shared/cognitive-service.mjs';
import {
  horizonNeedsJustification,
  horizonNextReviewDue,
  horizonShowFrom,
  HORIZON_LEAD_DAYS
} from '../../netlify/functions/_shared/cognitive-horizon.mjs';
import { buildProtocolWriteBackLines } from '../../netlify/functions/_shared/cognitive-writeback.mjs';
import { buildPrompt } from '../../netlify/functions/_shared/cognitive-controller.mjs';
import { addDays, daysBetween } from '../../packages/design-kit/js/lead-lines.js';
import { ALMANAC_RULES } from '../../apps/life/js/app/almanac-rules.js';
import { leadLines } from '../../packages/design-kit/js/lead-lines.js';
import { buildAlmanac, ghostsForAlmanacAction } from '../../netlify/functions/almanac.mjs';
import { acceptPlan } from '../../apps/life/js/app/ghost-writes.js';

const LAST = '2026-06-01';
const OWNER = 'owner';

function sydneyNoon(dateKey) {
  return `${dateKey}T12:00:00+10:00`;
}

function setup(nowIso) {
  const store = createMemoryCognitiveStore();
  const service = createCognitiveService({
    store,
    model: async () => ({ text: 'Horizon finding.', question: null, done: true, evidenceIds: [] }),
    retrieve: async () => ({ evidence: [], status: 'none' }),
    now: () => Date.parse(nowIso)
  });
  return { store, service };
}

async function seedCompleted(store, { id = randomUUID(), updatedAt, status = 'completed', protocolId = 'horizon' } = {}) {
  await store.write(OWNER, id, {
    id,
    protocolId,
    mode: 'full',
    status,
    stage: 'map',
    updatedAt,
    createdAt: updatedAt,
    intake: { focus: 'Career' },
    summary: { title: 'Prior', keyFinding: 'Prior finding', summary: 'Done.', openQuestions: [], forHammond: null }
  }, null);
  return id;
}

test('Horizon day math uses Sydney calendar days for the 90-day gate and Almanac lead', () => {
  assert.equal(HORIZON_MIN_DAYS, 90);
  assert.equal(HORIZON_LEAD_DAYS, 14);
  assert.equal(horizonShowFrom(sydneyNoon(LAST)), addDays(LAST, 76));
  assert.equal(horizonNextReviewDue(sydneyNoon(LAST)), addDays(LAST, 90));
  assert.equal(horizonNeedsJustification(sydneyNoon(LAST), addDays(LAST, 89)), true);
  assert.equal(horizonNeedsJustification(sydneyNoon(LAST), addDays(LAST, 90)), false);
  assert.equal(horizonNeedsJustification(sydneyNoon(LAST), addDays(LAST, 91)), false);
  assert.equal(horizonNextReviewDue(sydneyNoon(LAST), { today: addDays(LAST, 100) }), addDays(LAST, 100));
});

test('gate rejects at 89 days without justification, accepts with one, accepts at 91 days, accepts with no prior run', async () => {
  const day89 = addDays(LAST, 89);
  const day91 = addDays(LAST, 91);
  const { store, service } = setup(sydneyNoon(day89));
  await seedCompleted(store, { updatedAt: sydneyNoon(LAST) });

  await assert.rejects(
    () => service.create(OWNER, { protocolId: 'horizon', intake: { focus: 'Career forks' }, requestId: randomUUID() }),
    error => error.code === 'frequency_justification_required' && error.status === 400
      && /2026-06-01/.test(error.message) && /2026-08-30/.test(error.message)
  );

  const justified = await service.create(OWNER, {
    protocolId: 'horizon',
    intake: { focus: 'Career forks', frequencyJustification: 'Material change in role scope.' },
    requestId: randomUUID()
  });
  assert.equal(justified.protocolId, 'horizon');
  assert.equal(justified.intake.frequencyJustification, 'Material change in role scope.');

  const late = setup(sydneyNoon(day91));
  await seedCompleted(late.store, { updatedAt: sydneyNoon(LAST) });
  const ok = await late.service.create(OWNER, {
    protocolId: 'horizon',
    intake: { focus: 'Career forks' },
    requestId: randomUUID()
  });
  assert.equal(ok.protocolId, 'horizon');

  const fresh = setup(sydneyNoon(day89));
  const first = await fresh.service.create(OWNER, {
    protocolId: 'horizon',
    intake: { focus: 'First ever' },
    requestId: randomUUID()
  });
  assert.equal(first.protocolId, 'horizon');
});

test('cancelled or failed Horizon runs do not count as a completed review', async () => {
  const day89 = addDays(LAST, 89);
  const { store, service } = setup(sydneyNoon(day89));
  await seedCompleted(store, { updatedAt: sydneyNoon(LAST), status: 'cancelled' });
  await seedCompleted(store, { id: randomUUID(), updatedAt: sydneyNoon(LAST), status: 'failed' });
  const created = await service.create(OWNER, {
    protocolId: 'horizon',
    intake: { focus: 'After cancelled' },
    requestId: randomUUID()
  });
  assert.equal(created.protocolId, 'horizon');
  assert.equal(await lastCompletedRun(store, OWNER, 'horizon'), null);
});

test('buildPrompt passes lastReviewDate and frequencyJustification to Horizon voices', () => {
  const prompt = buildPrompt({
    protocolId: 'horizon',
    mode: 'full',
    intake: { focus: 'Career', frequencyJustification: 'Role changed.' },
    lastReviewDate: LAST,
    transcript: [],
    evidence: [],
    burst: 0
  }, { speaker: 'ketill', stage: 'ketill', maxBursts: 3, burstWords: 90 });
  const user = JSON.parse(prompt.user);
  assert.equal(user.cadence.lastReviewDate, LAST);
  assert.equal(user.cadence.frequencyJustification, 'Role changed.');
});

test('Horizon write-back appends next review due on the Recent Agent Actions line', () => {
  const lines = buildProtocolWriteBackLines({
    protocolId: 'horizon',
    updatedAt: '2026-09-26T02:00:00.000Z',
    summary: { title: 'Career map', keyFinding: 'Two load-bearing choices', summary: 'Short.', openQuestions: [], forHammond: null }
  });
  assert.equal(lines.length, 1);
  assert.match(lines[0].payload.text, /next review due 2026-12-25/);
});

test('Almanac horizon-review step absent before day 76, present from 76, overdue past 90, silent with no baseline, cleared after new run', () => {
  const anchors = [];
  const base = { today: addDays(LAST, 75), from: addDays(LAST, 75), to: addDays(LAST, 120), anchors, done: [], terms: [] };

  const silent = buildAlmanac({ ...base, horizonCadence: null });
  assert.equal(silent.lines.some(line => line.steps.some(s => s.id === 'horizon-review')), false);

  const early = buildAlmanac({ ...base, horizonCadence: { lastCompletedAt: LAST } });
  assert.equal(early.lines.some(line => line.steps.some(s => s.id === 'horizon-review')), false);

  const day76 = addDays(LAST, 76);
  const due = buildAlmanac({
    ...base,
    today: day76,
    from: day76,
    horizonCadence: { lastCompletedAt: LAST }
  });
  const step76 = due.lines.flatMap(l => l.steps).find(s => s.id === 'horizon-review');
  assert.ok(step76);
  assert.equal(step76.title, 'Run the Horizon Council');
  assert.equal(step76.lastSafe, addDays(LAST, 90));
  assert.match(step76.why, /Last review 2026-06-01/);
  assert.equal(step76.actionId, 'alm-horizon-review');

  const day95 = addDays(LAST, 95);
  const overdue = buildAlmanac({
    ...base,
    today: day95,
    from: day95,
    horizonCadence: { lastCompletedAt: LAST }
  });
  const step95 = overdue.lines.flatMap(l => l.steps).find(s => s.id === 'horizon-review');
  assert.ok(step95);
  assert.equal(step95.status, 'overdue');

  const cleared = buildAlmanac({
    ...base,
    today: day95,
    from: day95,
    horizonCadence: { lastCompletedAt: addDays(LAST, 94) }
  });
  assert.equal(cleared.lines.some(line => line.steps.some(s => s.id === 'horizon-review')), false);
});

test('alm-horizon-review builds confirm-first create_task due at +90 or today if past', () => {
  const day80 = addDays(LAST, 80);
  const view = buildAlmanac({
    today: day80,
    from: day80,
    to: addDays(LAST, 120),
    anchors: [],
    done: [],
    terms: [],
    horizonCadence: { lastCompletedAt: LAST }
  });
  const ghosts = ghostsForAlmanacAction('alm-horizon-review', view);
  assert.equal(ghosts.length, 1);
  assert.equal(ghosts[0].kind, 'create_task');
  assert.equal(ghosts[0].title, 'Run the Horizon Council review');
  assert.equal(ghosts[0].due, addDays(LAST, 90));
  const plan = acceptPlan(ghosts[0], { today: day80 });
  assert.ok(plan.steps.some(step => step.target === 'tasks' && step.method === 'POST'));

  const day95 = addDays(LAST, 95);
  const overdueView = buildAlmanac({
    today: day95,
    from: day95,
    to: addDays(LAST, 120),
    anchors: [],
    done: [],
    terms: [],
    horizonCadence: { lastCompletedAt: LAST }
  });
  const overdueGhost = ghostsForAlmanacAction('alm-horizon-review', overdueView);
  assert.equal(overdueGhost[0].due, day95);
});

test('horizon-review rule is data in ALMANAC_RULES', () => {
  const rule = ALMANAC_RULES.find(r => r.id === 'horizon-review');
  assert.ok(rule);
  assert.equal(rule.stepId, 'horizon-review');
  assert.equal(rule.title, 'Run the Horizon Council');
  const lines = leadLines(
    [{ id: 'horizon-council', title: 'Horizon Council', kind: 'event', tags: ['horizon-review'], sub: 'x' }],
    ALMANAC_RULES,
    { today: addDays(LAST, 80), horizon: { lastCompletedAt: LAST } }
  );
  assert.equal(lines[0].steps[0].id, 'horizon-review');
  assert.equal(daysBetween(LAST, lines[0].steps[0].lastSafe), 90);
});
