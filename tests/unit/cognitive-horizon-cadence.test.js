import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createMemoryCognitiveStore, createR2CognitiveStore, sessionIndexRow } from '../../netlify/functions/_shared/cognitive-store.mjs';
import {
  createCognitiveService,
  HORIZON_MIN_DAYS,
  lastCompletedRun
} from '../../netlify/functions/_shared/cognitive-service.mjs';
import {
  horizonNeedsJustification,
  horizonNextReviewDue,
  horizonShowFrom,
  horizonCompletedDateKey,
  HORIZON_LEAD_DAYS,
  isHorizonReviewStepId
} from '../../netlify/functions/_shared/cognitive-horizon.mjs';
import {
  HORIZON_MIN_DAYS as RULES_MIN_DAYS,
  HORIZON_LEAD_DAYS as RULES_LEAD_DAYS
} from '../../packages/design-kit/js/calendar/almanac-rules.js';
import { buildProtocolWriteBackLines, centralNodeLineOk } from '../../netlify/functions/_shared/cognitive-writeback.mjs';
import { buildPrompt, act } from '../../netlify/functions/_shared/cognitive-controller.mjs';
import { addDays, daysBetween, leadLines } from '../../packages/design-kit/js/lead-lines.js';
import { ALMANAC_RULES } from '../../apps/life/js/app/almanac-rules.js';
import { buildAlmanac, ghostsForAlmanacAction } from '../../netlify/functions/almanac.mjs';
import { acceptPlan } from '../../apps/life/js/app/ghost-writes.js';

const LAST = '2026-06-01';
const STEP_ID = `horizon-review:${LAST}`;
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

async function seedCompleted(store, {
  id = randomUUID(),
  updatedAt,
  completedAt = updatedAt,
  status = 'completed',
  protocolId = 'horizon'
} = {}) {
  await store.write(OWNER, id, {
    id,
    protocolId,
    mode: 'full',
    status,
    stage: 'map',
    updatedAt,
    completedAt: status === 'completed' ? completedAt : undefined,
    createdAt: updatedAt,
    intake: { focus: 'Career' },
    summary: { title: 'Prior', keyFinding: 'Prior finding', summary: 'Done.', openQuestions: [], forHammond: null }
  }, null);
  return id;
}

function fakeS3Store() {
  const objects = new Map();
  const client = {
    send: async cmd => {
      const name = cmd?.constructor?.name;
      if (name === 'PutObjectCommand' || cmd?.input?.Body) {
        objects.set(cmd.input.Key, { Body: cmd.input.Body, ETag: `"${objects.size + 1}"` });
        return { ETag: `"${objects.size}"` };
      }
      if (name === 'ListObjectsV2Command' || cmd?.input?.Prefix) {
        const prefix = cmd.input.Prefix;
        const Contents = [...objects.keys()].filter(k => k.startsWith(prefix)).map(Key => ({ Key }));
        return { Contents, IsTruncated: false };
      }
      if (name === 'GetObjectCommand' || cmd?.input?.Key) {
        const row = objects.get(cmd.input.Key);
        if (!row) throw Object.assign(new Error('missing'), { name: 'NoSuchKey', $metadata: { httpStatusCode: 404 } });
        return { Body: { transformToString: async () => String(row.Body) }, ETag: row.ETag };
      }
      throw new Error(`unexpected command ${name}`);
    }
  };
  return createR2CognitiveStore({ client, bucket: 'test', encryptionSecret: 'x'.repeat(32) });
}

test('HORIZON_MIN_DAYS and HORIZON_LEAD_DAYS match across cognitive-horizon and almanac-rules', () => {
  assert.equal(HORIZON_MIN_DAYS, RULES_MIN_DAYS);
  assert.equal(HORIZON_LEAD_DAYS, RULES_LEAD_DAYS);
  assert.equal(HORIZON_MIN_DAYS, 90);
  assert.equal(HORIZON_LEAD_DAYS, 14);
});

test('lead lines skip a rule whose lastSafe is not a date key', () => {
  const lines = leadLines(
    [{ id: 'x', title: 'X', kind: 'event', date: '2026-12-01', tags: ['t'] }],
    [{ id: 'bad', title: 'Bad', by: 'not-a-date', appliesTo: { tags: ['t'] } }],
    { today: '2026-09-01' }
  );
  assert.equal(lines[0].steps.length, 0);
});

test('Horizon day math uses Sydney calendar days for the 90-day gate and Almanac lead', () => {
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

test('gate fails open with cadenceUnknown when store list throws', async () => {
  const store = {
    async read() { return null; },
    async write(_owner, id, value) { return { value, etag: '"1"' }; },
    async list() { throw new Error('index unavailable'); }
  };
  const service = createCognitiveService({
    store,
    model: async () => ({ text: 'x', question: null, done: true, evidenceIds: [] }),
    retrieve: async () => ({ evidence: [], status: 'none' }),
    now: () => Date.parse(sydneyNoon(addDays(LAST, 89)))
  });
  const created = await service.create(OWNER, {
    protocolId: 'horizon',
    intake: { focus: 'While index is down' },
    requestId: randomUUID()
  });
  assert.equal(created.protocolId, 'horizon');
  assert.equal(created.cadenceUnknown, true);
});

test('gate reads completed Horizon runs from the R2 index via fake S3 store', async () => {
  const store = fakeS3Store();
  const day89 = addDays(LAST, 89);
  await seedCompleted(store, { updatedAt: sydneyNoon(LAST), completedAt: sydneyNoon(LAST) });
  const listed = await store.list(OWNER, 10, 0);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].value.completedAt, sydneyNoon(LAST));
  assert.equal(sessionIndexRow({
    id: 'x', protocolId: 'horizon', mode: 'full', status: 'completed', stage: 'map',
    createdAt: sydneyNoon(LAST), updatedAt: sydneyNoon(LAST), completedAt: sydneyNoon(LAST),
    intake: { focus: 'Career' }
  }).completedAt, sydneyNoon(LAST));

  const service = createCognitiveService({
    store,
    model: async () => ({ text: 'x', question: null, done: true, evidenceIds: [] }),
    retrieve: async () => ({ evidence: [], status: 'none' }),
    now: () => Date.parse(sydneyNoon(day89))
  });
  await assert.rejects(
    () => service.create(OWNER, { protocolId: 'horizon', intake: { focus: 'Career' }, requestId: randomUUID() }),
    error => error.code === 'frequency_justification_required'
  );
  const last = await lastCompletedRun(store, OWNER, 'horizon');
  assert.equal(last.completedAt, sydneyNoon(LAST));
});

test('completedAt is set on advance and reflect; later updatedAt bumps do not move the review date', async () => {
  const store = createMemoryCognitiveStore();
  const id = randomUUID();
  const completedAt = sydneyNoon(LAST);
  await store.write(OWNER, id, {
    id,
    protocolId: 'horizon',
    mode: 'full',
    status: 'completed',
    stage: 'map',
    updatedAt: completedAt,
    completedAt,
    createdAt: completedAt,
    intake: { focus: 'Sticky' },
    summary: { title: 'Sticky', keyFinding: 'x', summary: 'Done.', openQuestions: [], forHammond: null }
  }, null);

  const row = await store.read(OWNER, id);
  row.value.updatedAt = '2099-01-01T00:00:00.000Z';
  const written = await store.write(OWNER, id, row.value, row.etag);
  assert.ok(written);
  assert.equal(written.value.completedAt, completedAt);
  assert.equal(written.value.updatedAt, '2099-01-01T00:00:00.000Z');

  const last = await lastCompletedRun(store, OWNER, 'horizon');
  assert.equal(last.id, id);
  assert.equal(last.completedAt, completedAt);
  assert.equal(horizonCompletedDateKey(last.completedAt), LAST);

  const legacyStore = createMemoryCognitiveStore();
  const legacyId = randomUUID();
  await legacyStore.write(OWNER, legacyId, {
    id: legacyId,
    protocolId: 'horizon',
    mode: 'full',
    status: 'completed',
    stage: 'map',
    updatedAt: completedAt,
    createdAt: completedAt,
    intake: { focus: 'Legacy' },
    summary: { title: 'Legacy', keyFinding: 'x', summary: 'Done.', openQuestions: [], forHammond: null }
  }, null);
  const legacy = await lastCompletedRun(legacyStore, OWNER, 'horizon');
  assert.equal(legacy.completedAt, completedAt);

  const reflected = act({
    id: randomUUID(),
    owner: OWNER,
    protocolId: 'horizon',
    mode: 'full',
    intake: { focus: 'Reflect path' },
    revision: 1,
    status: 'waiting',
    stage: 'map',
    speaker: 'controller',
    transcript: [],
    evidence: [],
    evidenceStatus: '',
    checkpoint: { kind: 'reflection', question: 'Converge?' },
    allowedActions: ['reflect'],
    error: null,
    createdAt: completedAt,
    updatedAt: completedAt,
    steps: [],
    cursor: 0,
    burst: 0,
    requests: {},
    dialogueCounts: {},
    answered: {},
    retrieved: true
  }, { action: 'reflect', text: 'Done.', revision: 1, requestId: randomUUID() });
  assert.equal(reflected.status, 'completed');
  assert.ok(reflected.completedAt);

  const { advance } = await import('../../netlify/functions/_shared/cognitive-controller.mjs');
  const advanced = await advance({
    id: randomUUID(),
    owner: OWNER,
    protocolId: 'horizon',
    mode: 'full',
    intake: { focus: 'Advance path' },
    revision: 0,
    status: 'queued',
    stage: 'map',
    speaker: null,
    transcript: [],
    evidence: [],
    evidenceStatus: '',
    checkpoint: null,
    allowedActions: ['pause', 'cancel'],
    error: null,
    createdAt: completedAt,
    updatedAt: completedAt,
    steps: [{ speaker: 'ketill', stage: 'ketill', gate: null, maxBursts: 1, burstWords: 90 }],
    cursor: 0,
    burst: 0,
    requests: {},
    dialogueCounts: {},
    answered: {},
    retrieved: false
  }, {
    model: async () => ({ text: 'Finding.', question: null, done: true, evidenceIds: [] }),
    retrieve: async () => ({ evidence: [], status: 'none' })
  });
  assert.equal(advanced.status, 'completed');
  assert.ok(advanced.completedAt);
  const sticky = advanced.completedAt;
  advanced.updatedAt = '2099-06-01T00:00:00.000Z';
  assert.equal(advanced.completedAt, sticky);
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
    completedAt: '2026-09-26T02:00:00.000Z',
    updatedAt: '2026-09-26T02:00:00.000Z',
    summary: { title: 'Career map', keyFinding: 'Two load-bearing choices', summary: 'Short.', openQuestions: [], forHammond: null }
  });
  assert.equal(lines.length, 1);
  assert.match(lines[0].payload.text, /next review due 2026-12-25/);
});

test('Horizon write-back reserves next-review due then trims a 160 character finding', () => {
  const finding = 'A'.repeat(160);
  const lines = buildProtocolWriteBackLines({
    protocolId: 'horizon',
    completedAt: sydneyNoon(LAST),
    updatedAt: sydneyNoon(addDays(LAST, 1)),
    summary: { title: 'Long', keyFinding: finding, summary: 'Short.', openQuestions: [], forHammond: null }
  });
  assert.equal(lines.length, 1);
  const text = lines[0].payload.text;
  assert.ok(text.length <= 200);
  assert.match(text, /; next review due 2026-08-30$/);
  assert.ok(centralNodeLineOk(text));
  assert.ok(!text.includes(finding));
});

test('Horizon write-back trims a 31 word finding so the line stays within 40 words', () => {
  const finding = Array.from({ length: 31 }, (_, i) => `word${i}`).join(' ');
  const lines = buildProtocolWriteBackLines({
    protocolId: 'horizon',
    completedAt: sydneyNoon(LAST),
    updatedAt: sydneyNoon(addDays(LAST, 1)),
    summary: { title: 'Words', keyFinding: finding, summary: 'Short.', openQuestions: [], forHammond: null }
  });
  assert.equal(lines.length, 1);
  const text = lines[0].payload.text;
  assert.ok(text.trim().split(/\s+/).length <= 40);
  assert.match(text, /; next review due 2026-08-30$/);
  assert.ok(centralNodeLineOk(text));
});

test('Almanac horizon-review step absent before day 76, present from 76, overdue past 90, silent with no baseline, cleared after new run', () => {
  const anchors = [];
  const base = { today: addDays(LAST, 75), from: addDays(LAST, 75), to: addDays(LAST, 120), anchors, done: [], terms: [] };

  const silent = buildAlmanac({ ...base, horizonCadence: null });
  assert.equal(silent.lines.some(line => line.steps.some(s => isHorizonReviewStepId(s.id))), false);

  const early = buildAlmanac({ ...base, horizonCadence: { lastCompletedAt: LAST } });
  assert.equal(early.lines.some(line => line.steps.some(s => isHorizonReviewStepId(s.id))), false);

  const day76 = addDays(LAST, 76);
  const due = buildAlmanac({
    ...base,
    today: day76,
    from: day76,
    horizonCadence: { lastCompletedAt: LAST }
  });
  const step76 = due.lines.flatMap(l => l.steps).find(s => s.id === STEP_ID);
  assert.ok(step76);
  assert.equal(step76.title, 'Run the Horizon Council');
  assert.equal(step76.lastSafe, addDays(LAST, 90));
  assert.match(step76.why, /Last review 2026-06-01/);
  assert.equal(step76.actionId, `alm-${STEP_ID}`);

  const day95 = addDays(LAST, 95);
  const overdue = buildAlmanac({
    ...base,
    today: day95,
    from: day95,
    horizonCadence: { lastCompletedAt: LAST }
  });
  const step95 = overdue.lines.flatMap(l => l.steps).find(s => s.id === STEP_ID);
  assert.ok(step95);
  assert.equal(step95.status, 'overdue');

  const cleared = buildAlmanac({
    ...base,
    today: day95,
    from: day95,
    horizonCadence: { lastCompletedAt: addDays(LAST, 94) }
  });
  assert.equal(cleared.lines.some(line => line.steps.some(s => isHorizonReviewStepId(s.id))), false);
});

test('dismissing one Horizon cycle does not hide the next cycle on day 76', () => {
  const later = addDays(LAST, 94);
  const day76Next = addDays(later, 76);
  const view = buildAlmanac({
    today: day76Next,
    from: day76Next,
    to: addDays(later, 120),
    anchors: [],
    done: [{ stepId: STEP_ID }],
    terms: [],
    horizonCadence: { lastCompletedAt: later }
  });
  const nextId = `horizon-review:${later}`;
  const step = view.lines.flatMap(l => l.steps).find(s => s.id === nextId);
  assert.ok(step, 'new cycle step should appear even when the prior cycle is done');
  assert.equal(step.status, 'soon');
  assert.equal(view.lines.flatMap(l => l.steps).some(s => s.id === STEP_ID), false);
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
  const ghosts = ghostsForAlmanacAction(`alm-${STEP_ID}`, view);
  assert.equal(ghosts.length, 1);
  assert.equal(ghosts[0].kind, 'create_task');
  assert.equal(ghosts[0].title, 'Run the Horizon Council review');
  assert.equal(ghosts[0].due, addDays(LAST, 90));
  assert.equal(ghosts[0].source, `almanac:${STEP_ID}`);
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
  const overdueGhost = ghostsForAlmanacAction(`alm-${STEP_ID}`, overdueView);
  assert.equal(overdueGhost[0].due, day95);
  assert.equal(overdueGhost[0].source, `almanac:${STEP_ID}`);
});

test('horizon-review rule is data in ALMANAC_RULES with per-cycle step id', () => {
  const rule = ALMANAC_RULES.find(r => r.id === 'horizon-review');
  assert.ok(rule);
  assert.equal(typeof rule.stepId, 'function');
  assert.equal(rule.title, 'Run the Horizon Council');
  const lines = leadLines(
    [{ id: 'horizon-council', title: 'Horizon Council', kind: 'event', tags: ['horizon-review'], sub: 'x' }],
    ALMANAC_RULES,
    { today: addDays(LAST, 80), horizon: { lastCompletedAt: LAST } }
  );
  assert.equal(lines[0].steps[0].id, STEP_ID);
  assert.equal(daysBetween(LAST, lines[0].steps[0].lastSafe), 90);
});
