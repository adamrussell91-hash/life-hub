/**
 * Ann O'Tation kernel expansion. DETERMINISTIC TEST only — not a live deploy gate.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hydrateTeachingSchedule,
  statedTeachingConstraints,
  searchTeaching,
  getTeachingContext
} from '../../netlify/functions/_shared/domain-retrieval.mjs';
import { getTeachingDiagnosis } from '../../netlify/functions/_shared/domain-analysis.mjs';
import {
  kernelTraceEvent,
  planTurn,
  runAgentKernel
} from '../../netlify/functions/_shared/agent-kernel.mjs';

const TODAY = '2026-08-20';
const NOW = new Date('2026-08-20T01:00:00.000Z');

const DRAFT = {
  id: 'les_essay',
  type: 'lesson',
  title: 'Year 10 essay hinge',
  unit_id: 'unit_essay',
  sequence: 2,
  outcome_ids: ['EN5-1A'],
  blocks: [{ id: 'b1', block_type: 'heading', content: { text: 'Hook' } }],
  path: 'lessons/les_essay'
};
const DRAFT_NEXT = {
  id: 'les_peer',
  type: 'lesson',
  title: 'Peer review workshop',
  unit_id: 'unit_essay',
  sequence: 3,
  outcome_ids: ['EN5-2A'],
  blocks: [{ id: 'b2', block_type: 'heading', content: { text: 'Pairs' } }],
  path: 'lessons/les_peer'
};
const DRAFT_EMPTY = {
  id: 'les_empty',
  type: 'lesson',
  title: 'Bare draft',
  unit_id: 'unit_essay',
  sequence: 4,
  blocks: [],
  path: 'lessons/les_empty'
};
const SCHEDULED = {
  id: 'sched_1',
  type: 'scheduled_lesson',
  class_id: 'c10eng',
  lesson_id: 'les_essay',
  unit_id: 'unit_essay',
  date: TODAY,
  start_time: '09:00',
  schedule_order: 1,
  delivery_status: 'planned'
};
const SCHEDULED_NEXT = {
  id: 'sched_2',
  type: 'scheduled_lesson',
  class_id: 'c10eng',
  lesson_id: 'les_peer',
  unit_id: 'unit_essay',
  date: '2026-08-22',
  start_time: '09:00',
  schedule_order: 1,
  delivery_status: 'planned'
};
const CLASS = { id: 'c10eng', code: '10ENG', display_name: 'Year 10 English', status: 'active' };
const UNIT = {
  id: 'unit_essay',
  title: 'Essay craft',
  lesson_ids: ['les_essay', 'les_peer', 'les_empty']
};

function teachingStores(extra = {}) {
  return {
    classes: [CLASS],
    lessons: [DRAFT, DRAFT_NEXT, DRAFT_EMPTY, SCHEDULED, SCHEDULED_NEXT],
    units: [UNIT],
    ...extra
  };
}

function usableProvenance(provenance) {
  if (!provenance || typeof provenance !== 'object') return false;
  if (provenance.recordId || provenance.recordPath) return true;
  return typeof provenance.reason === 'string' && provenance.reason.length > 0;
}

const ANN_PARAPHRASES = [
  'what am I teaching today',
  "what's on for 10ENG today",
  'what is next for this class',
  'what lesson should follow the previous lesson',
  'what learning intentions are already attached',
  'what is missing from this lesson',
  'what needs preparation before this class',
  'how does this lesson connect to the unit',
  'what should I teach next based on the sequence',
  "help me improve tomorrow's lesson",
  'diagnose this Year 10 class',
  'find the Year 10 essay hinge lesson',
  'summarise what is already planned for 10ENG',
  'I only have 20 minutes for this lesson — what is missing',
  'curriculum check for this unit',
  'look at the upcoming lesson',
  'teach this better tomorrow',
  'unit and lesson diagnosis',
  'student lesson tomorrow',
  'teaching check for today'
];

test('Ann paraphrases route into lesson_diagnosis (≥95%)', () => {
  const hits = ANN_PARAPHRASES.filter(message => planTurn({ slug: 'ann', message }).plan.workflow === 'lesson_diagnosis');
  assert.ok(hits.length / ANN_PARAPHRASES.length >= 0.95, `${hits.length}/${ANN_PARAPHRASES.length}`);
});

test('hydrateTeachingSchedule joins scheduled rows to draft content', () => {
  const hydrated = hydrateTeachingSchedule([DRAFT, SCHEDULED, SCHEDULED_NEXT], { now: NOW });
  assert.equal(hydrated[0].title, 'Year 10 essay hinge');
  assert.equal(hydrated[0].block_count ?? hydrated[0].blocks.length, 1);
  assert.deepEqual(hydrated[0].outcome_ids, ['EN5-1A']);
  assert.equal(hydrated[0].date, TODAY);
});

test('statedTeachingConstraints marks current-turn time budget', () => {
  const stated = statedTeachingConstraints('I only have 20 minutes for this lesson');
  assert.equal(stated.minutes, 20);
});

test('Ann today question resolves the scheduled Teaching record', () => {
  const kernel = runAgentKernel({
    slug: 'ann',
    message: 'what am I teaching today',
    today: TODAY,
    now: NOW,
    stores: teachingStores()
  });
  assert.equal(kernel.plan.workflow, 'lesson_diagnosis');
  const title = kernel.claims.find(claim => claim.fact === 'lesson_title');
  assert.equal(title.value, 'Year 10 essay hinge');
  assert.equal(title.provenance.recordId, 'les_essay');
  assert.equal(title.provenance.store, 'teaching_hub');
  assert.match(kernel.interpretationBlock, /Lesson context is Year 10 essay hinge/);
});

test('Ann record provenance keeps lesson id/path; gaps are derived', () => {
  const kernel = runAgentKernel({
    slug: 'ann',
    message: 'what is missing from the Year 10 essay hinge lesson',
    today: TODAY,
    now: NOW,
    stores: teachingStores({
      lessons: [
        { ...DRAFT, blocks: [], outcome_ids: [] },
        SCHEDULED,
        SCHEDULED_NEXT,
        DRAFT_NEXT,
        DRAFT_EMPTY
      ]
    })
  });
  const title = kernel.claims.find(claim => claim.fact === 'lesson_title');
  assert.equal(title.provenance.sourceType, 'record');
  assert.ok(title.provenance.recordId || title.provenance.recordPath);
  const gaps = kernel.claims.find(claim => claim.fact === 'diagnosis_gaps');
  assert.ok(Array.isArray(gaps.value) && gaps.value.length);
  assert.equal(gaps.kind, 'calculation');
  assert.equal(gaps.provenance.reason, 'derived_from_aggregate');
});

test('Ann missing evidence does not invent a class', () => {
  const kernel = runAgentKernel({
    slug: 'ann',
    message: 'what am I teaching today',
    today: TODAY,
    now: NOW,
    stores: { classes: [], lessons: [], units: [] }
  });
  assert.ok(kernel.limitations.some(item => item.kind === 'missing'));
  assert.match(kernel.interpretationBlock, /Do not invent a class/);
  assert.equal(kernel.claims.find(claim => claim.fact === 'lesson_title'), undefined);
});

test('Ann truncated teaching search can queue a bounded second retrieve', () => {
  const many = Array.from({ length: 16 }, (_, i) => ({
    id: `les_${i}`,
    type: 'lesson',
    title: `Essay craft part ${i}`,
    unit_id: 'unit_essay'
  }));
  const kernel = runAgentKernel({
    slug: 'ann',
    message: 'find the essay craft lesson',
    today: TODAY,
    now: NOW,
    stores: {
      classes: [CLASS],
      // No schedule match → context lesson missing; truncated search should widen.
      lessons: many,
      units: [UNIT]
    }
  });
  assert.ok((kernel.retrieveLog?.length ?? 0) >= 2, 'expected a second retrieve round');
  const round1 = kernel.retrieveLog[0].tools.find(tool => tool.name === 'search_teaching');
  assert.equal(round1.truncated, true);
  assert.ok((round1.omitted ?? 0) > 0);
  assert.ok(kernel.sufficiencyDecision);
  assert.equal(kernel.sufficiencyDecision.anotherRound, false);
  assert.match(kernel.sufficiencyDecision.reason, /no further bounded retrieval|sufficient|present/);
});

test('Ann does not force a second retrieve when schedule context is already complete', () => {
  const kernel = runAgentKernel({
    slug: 'ann',
    message: 'what am I teaching today',
    today: TODAY,
    now: NOW,
    stores: teachingStores()
  });
  assert.equal(kernel.retrieveLog.length, 1);
  assert.equal(kernel.sufficiencyDecision.anotherRound, false);
  assert.match(kernel.sufficiencyDecision.reason, /sufficient|present/);
});

test('Ann current-turn time budget is user_stated_current_turn', () => {
  const kernel = runAgentKernel({
    slug: 'ann',
    message: 'I only have 20 minutes for this lesson — what is missing',
    today: TODAY,
    now: NOW,
    stores: teachingStores()
  });
  const minutes = kernel.claims.find(claim => claim.fact === 'stated_time_minutes');
  assert.equal(minutes.value, 20);
  assert.equal(minutes.provenance.reason, 'user_stated_current_turn');
  assert.match(kernel.interpretationBlock, /user_stated_current_turn/);
});

test('Ann unit sequence next is record when unit.lesson_ids determines it', () => {
  const diagnosis = getTeachingDiagnosis({
    classes: [CLASS],
    lessons: [DRAFT, DRAFT_NEXT, DRAFT_EMPTY, SCHEDULED],
    units: [UNIT],
    query: 'Year 10 essay hinge',
    message: 'what should I teach next based on the sequence',
    now: NOW
  });
  assert.equal(diagnosis.next_in_unit_basis, 'unit_lesson_ids');
  assert.equal(diagnosis.next_in_unit.id, 'les_peer');
  const kernel = runAgentKernel({
    slug: 'ann',
    message: 'what should I teach next based on the sequence for Year 10 essay hinge',
    today: TODAY,
    now: NOW,
    stores: teachingStores({ lessons: [DRAFT, DRAFT_NEXT, DRAFT_EMPTY, SCHEDULED] })
  });
  const next = kernel.claims.find(claim => claim.fact === 'next_in_unit_title');
  assert.ok(next);
  assert.equal(next.kind, 'record');
  assert.equal(next.provenance.sourceType, 'record');
});

test('Ann next_scheduled remains a calendar record distinct from unit order', () => {
  const ctx = getTeachingContext({
    classes: [CLASS],
    lessons: teachingStores().lessons,
    units: [UNIT],
    query: '10ENG',
    message: 'what is next for this class',
    now: NOW
  });
  assert.equal(ctx.lesson.title, 'Year 10 essay hinge');
  assert.equal(ctx.next_scheduled.id, 'les_peer');
  assert.equal(ctx.next_scheduled.date, '2026-08-22');
});

test('Ann material claims never leave silent null provenance', () => {
  const kernel = runAgentKernel({
    slug: 'ann',
    message: 'summarise what is already planned for 10ENG',
    today: TODAY,
    now: NOW,
    stores: teachingStores()
  });
  const unexplained = kernel.claims.filter(claim => !usableProvenance(claim.provenance));
  assert.deepEqual(unexplained.map(claim => `${claim.tool}:${claim.fact}`), []);
});

test('Ann live trace shape exposes retrieveLog and sufficiencyDecision', () => {
  const kernel = runAgentKernel({
    slug: 'ann',
    message: 'what am I teaching today',
    today: TODAY,
    now: NOW,
    stores: teachingStores()
  });
  const trace = kernelTraceEvent(kernel);
  assert.equal(trace.workflow, 'lesson_diagnosis');
  assert.ok(Array.isArray(trace.retrieveLog));
  assert.ok(trace.sufficiencyDecision);
  assert.ok(Array.isArray(trace.claims));
  assert.ok(trace.claims.every(claim => usableProvenance(claim.provenance)));
});

test('Ann diagnosis uses outcome_ids/blocks, not invented learning_intentions', () => {
  const diagnosis = getTeachingDiagnosis({
    classes: [CLASS],
    lessons: [{ ...DRAFT, outcome_ids: [], blocks: [] }, SCHEDULED],
    units: [UNIT],
    query: 'essay',
    now: NOW
  });
  assert.ok(diagnosis.diagnosis_gaps.some(gap => /outcome_ids/.test(gap)));
  assert.ok(diagnosis.diagnosis_gaps.some(gap => /blocks/.test(gap)));
  assert.ok(diagnosis.diagnosis_gaps.some(gap => /learning intention/i.test(gap)));
  assert.ok(!diagnosis.diagnosis_gaps.some(gap => /learning intentions\/objectives/.test(gap)));
});

test('outcome_ids are not aliased as learning_intentions', () => {
  const diagnosis = getTeachingDiagnosis({
    classes: [CLASS],
    lessons: [DRAFT, SCHEDULED],
    units: [UNIT],
    query: 'Year 10 essay hinge',
    message: 'What learning intentions are already attached?',
    now: NOW
  });
  assert.deepEqual(diagnosis.lesson.outcome_ids, ['EN5-1A']);
  assert.deepEqual(diagnosis.lesson.learning_intentions, []);
  assert.ok(diagnosis.diagnosis_gaps.some(gap => /No stored learning intention/i.test(gap)));

  const kernel = runAgentKernel({
    slug: 'ann',
    message: 'What learning intentions are already attached to the Year 10 essay hinge lesson?',
    today: TODAY,
    now: NOW,
    stores: teachingStores()
  });
  const outcomes = kernel.claims.find(claim => claim.fact === 'outcome_ids');
  assert.ok(outcomes);
  assert.deepEqual(outcomes.value, ['EN5-1A']);
  assert.equal(kernel.claims.find(claim => claim.fact === 'learning_intentions'), undefined);
  assert.doesNotMatch(kernel.interpretationBlock, /learning intention.*EN5-1A|EN5-1A.*learning intention/i);
  assert.match(kernel.interpretationBlock, /No stored learning intention|outcome_ids are curriculum codes/i);
});

test('genuine learning-intention block stays record-based when present', () => {
  const lesson = {
    ...DRAFT,
    blocks: [
      ...DRAFT.blocks,
      {
        id: 'li1',
        block_type: 'callout',
        style: 'learning_intention',
        content: { text: 'Students can craft a thesis that answers the prompt' }
      }
    ]
  };
  const diagnosis = getTeachingDiagnosis({
    classes: [CLASS],
    lessons: [lesson, SCHEDULED],
    units: [UNIT],
    query: 'Year 10 essay hinge',
    now: NOW
  });
  assert.deepEqual(diagnosis.lesson.outcome_ids, ['EN5-1A']);
  assert.deepEqual(diagnosis.lesson.learning_intentions, [
    'Students can craft a thesis that answers the prompt'
  ]);
  assert.ok(!diagnosis.diagnosis_gaps.some(gap => /No stored learning intention/i.test(gap)));
});

test('token teaching search finds Year 10 essay inside a natural question', () => {
  const result = searchTeaching({
    query: 'find the Year 10 essay hinge lesson please',
    classes: [CLASS],
    lessons: [DRAFT],
    units: [UNIT],
    limit: 5
  });
  assert.ok(result.count >= 1);
  assert.equal(result.results[0].id, 'les_essay');
});
