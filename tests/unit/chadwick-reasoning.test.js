/**
 * Chadwick evidence-reasoning pilot. Deterministic notes from retrieved sessions.
 * Not a live conversational gate.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyseTrainingEvidence,
  chadwickFitnessToolSchemas,
  executeFitnessReadTool,
  FITNESS_READ_TOOL_NAMES
} from '../../netlify/functions/_shared/fitness-tools.mjs';
import { runAgentKernel } from '../../netlify/functions/_shared/agent-kernel.mjs';
import { proposeAction } from '../../netlify/functions/_shared/agent-kernel.mjs';

const TODAY = '2026-08-20';

const ENOUGH = [
  {
    type: 'workout',
    status: 'completed',
    date: '2026-08-18',
    title: 'Upper',
    exercises: [{ name: 'Bench Press', sets: [{ weight_kg: 60, reps: 8 }] }]
  },
  {
    type: 'workout',
    status: 'completed',
    date: '2026-08-16',
    title: 'Lower',
    exercises: [{ name: 'Squat', sets: [{ weight_kg: 80, reps: 5 }] }]
  }
];

test('enough recent evidence is named and does not invent extra sessions', () => {
  const note = analyseTrainingEvidence(ENOUGH, TODAY, { query: 'training recap' });
  assert.equal(note.enough_evidence, true);
  assert.equal(note.missing_recent_sessions, false);
  assert.equal(note.recent_count, 2);
  assert.equal(note.last_completed_date, '2026-08-18');
  assert.equal(note.confirmation_required, true);
});

test('missing recent sessions stay a named gap', () => {
  const note = analyseTrainingEvidence([
    { type: 'workout', status: 'completed', date: '2026-07-01', title: 'Old', exercises: [] }
  ], TODAY, { query: 'training recap' });
  assert.equal(note.missing_recent_sessions, true);
  assert.equal(note.enough_evidence, false);
});

test('conflicting same-day sessions stay unresolved', () => {
  const note = analyseTrainingEvidence([
    {
      type: 'workout',
      status: 'completed',
      date: '2026-08-18',
      title: 'Upper A',
      exercises: [{ name: 'Bench Press', sets: [{ weight_kg: 60, reps: 8 }] }]
    },
    {
      type: 'workout',
      status: 'completed',
      date: '2026-08-18',
      title: 'Upper B',
      exercises: [{ name: 'Overhead Press', sets: [{ weight_kg: 30, reps: 8 }] }]
    }
  ], TODAY, { query: 'training recap' });
  assert.equal(note.conflict.kind, 'session_disagreement');
  assert.equal(note.conflict.method, 'unresolved');
  assert.equal(note.enough_evidence, false);
});

test('pain on a lift becomes a modification, not a medical diagnosis', () => {
  const note = analyseTrainingEvidence([
    {
      type: 'workout',
      status: 'completed',
      date: '2026-08-18',
      title: 'Upper',
      pain_flags: [{ site: 'left shoulder', note: 'twinge on press' }],
      exercises: [{ name: 'Bench Press', sets: [{ weight_kg: 60, reps: 8 }] }]
    }
  ], TODAY, { query: 'shoulder pain on bench' });
  assert.ok(note.pain_modifications.some(item => item.site === 'left shoulder' && item.action === 'modify_or_skip'));
  assert.ok(note.pain_modifications[0].boundary.includes('Sara'));
});

test('substitution request names a replacement and requires confirm', () => {
  const note = analyseTrainingEvidence(ENOUGH, TODAY, { query: 'substitute bench press — no bench today' });
  assert.equal(note.substitution.from, 'bench press');
  assert.match(note.substitution.replacement, /floor press/i);
  assert.equal(note.substitution.confirmation_required, true);
  assert.equal(note.write_required, true);
});

test('progression is blocked when the recent window is empty', () => {
  const note = analyseTrainingEvidence([], TODAY, { query: 'progress the programme next week' });
  assert.equal(note.progression.ok, false);
  assert.match(note.progression.reason, /14 days/);
});

test('kernel training review includes the reasoning note', () => {
  const kernel = runAgentKernel({
    slug: 'chadwick',
    message: 'training recap — am I ready to progress?',
    today: TODAY,
    now: new Date('2026-08-20T01:00:00.000Z'),
    stores: { workouts: ENOUGH }
  });
  assert.ok(kernel.evidence.analyse_training_evidence);
  assert.equal(kernel.evidence.analyse_training_evidence.enough_evidence, true);
  assert.ok(kernel.claims.some(claim => claim.fact === 'enough_evidence' || claim.tool === 'analyse_training_evidence'));
});

test('proposed training change stays pending until confirm', () => {
  const kernel = runAgentKernel({
    slug: 'chadwick',
    message: 'substitute bench press in training',
    today: TODAY,
    now: new Date('2026-08-20T01:00:00.000Z'),
    stores: { workouts: ENOUGH }
  });
  const proposed = proposeAction(kernel, {
    intent: 'update_workout_template',
    snapshot: { title: 'Upper' },
    idempotencyKey: 'chadwick-sub-1'
  });
  assert.equal(proposed.action.status, 'pending');
  assert.equal(kernel.evidence.analyse_training_evidence.confirmation_required, true);
});

test('every callable Chadwick fitness schema has an executeFitnessReadTool path', () => {
  const names = chadwickFitnessToolSchemas().map(schema => schema.name);
  assert.ok(names.includes('analyse_training_evidence'));
  assert.deepEqual(names, [...FITNESS_READ_TOOL_NAMES]);
  for (const name of names) {
    const result = executeFitnessReadTool(name, {
      workouts: ENOUGH,
      today: TODAY,
      compositionRecords: [{ date: TODAY, weight_kg: 90 }],
      measurementRecords: [],
      templates: [{ title: 'Upper', exercises: [{ name: 'Bench Press', sets: 3 }] }],
      input: { query: 'bench press' }
    });
    assert.ok(result, `missing executor for ${name}`);
    assert.notEqual(result, null);
  }
});

const GROIN_AND_RECENT = [
  {
    id: 'wo-upper',
    path: 'data/fitness/2026-08-18-upper.md',
    type: 'workout',
    status: 'completed',
    date: '2026-08-18',
    title: 'Upper',
    exercises: [
      { name: 'Bench Press', sets: [{ weight_kg: 60, reps: 8 }] },
      { name: 'Bar Press', sets: [{ weight_kg: 38, reps: 10 }] }
    ]
  },
  {
    id: 'wo-lower',
    path: 'data/fitness/2026-08-16-lower.md',
    type: 'workout',
    status: 'completed',
    date: '2026-08-16',
    title: 'Lower',
    pain_flags: [{ site: 'right groin', note: 'twinge on goblet squat' }],
    exercises: [{ name: 'Goblet Squat', sets: [{ weight_kg: 24, reps: 8 }] }]
  }
];

test('ambiguous bench substitution keeps the cause unknown and does not reuse groin or a PR', () => {
  const note = analyseTrainingEvidence(GROIN_AND_RECENT, TODAY, {
    query: "I can't do bench press today. What should I substitute?"
  });
  assert.equal(note.substitution.from, 'bench press');
  assert.equal(note.cause.status, 'unknown');
  assert.equal(note.cause.kind, 'unknown_cause');
  assert.equal(note.cause.stored_reason, null);
  assert.equal(note.cause.user_stated_reason, null);
  assert.ok(note.cause.unrelated_pain.some(item => /groin/i.test(item.site)));
  assert.equal(note.cause.unrelated_pain.some(item => /chest|pec|shoulder/i.test(item.site)), false);
  assert.doesNotMatch(JSON.stringify(note.cause), /aching pecs|bar press pr|failed session/i);
  assert.match(note.how_to_read, /unknown cause/i);
});

test('user-stated shoulder soreness is current-turn information, not a stored bench cause', () => {
  const note = analyseTrainingEvidence(GROIN_AND_RECENT, TODAY, {
    query: "My shoulder is sore today, so I don't want to bench. What should I substitute?"
  });
  assert.equal(note.cause.status, 'user_stated');
  assert.equal(note.cause.kind, 'user_stated_current_turn');
  assert.match(note.cause.user_stated_reason, /shoulder/i);
  assert.equal(note.cause.stored_reason, null);
  assert.ok(note.cause.unrelated_pain.some(item => /groin/i.test(item.site)));
});

test('stored shoulder pain can be a stored cause only for a matching lift', () => {
  const note = analyseTrainingEvidence([
    {
      id: 'wo-press',
      type: 'workout',
      status: 'completed',
      date: '2026-08-18',
      title: 'Upper',
      pain_flags: [{ site: 'left shoulder', note: 'twinge on press' }],
      exercises: [{ name: 'Bench Press', sets: [{ weight_kg: 60, reps: 8 }] }]
    }
  ], TODAY, { query: "I can't do bench press today. What should I substitute?" });
  assert.equal(note.cause.status, 'stored');
  assert.equal(note.cause.kind, 'stored_pain');
  assert.match(note.cause.stored_reason, /shoulder/i);
});

test('kernel interpretation forbids inventing a bench cause when evidence is silent', () => {
  const kernel = runAgentKernel({
    slug: 'chadwick',
    message: "I can't do bench press today. What should I substitute?",
    today: TODAY,
    now: new Date('2026-08-20T01:00:00.000Z'),
    stores: { workouts: GROIN_AND_RECENT }
  });
  const cause = kernel.claims.find(claim => claim.fact === 'unavailable_cause');
  assert.equal(cause?.value, 'unknown');
  assert.match(kernel.interpretationBlock, /unknown cause/i);
  assert.match(kernel.interpretationBlock, /do not invent/i);
  assert.match(kernel.interpretationBlock, /groin/i);
  assert.doesNotMatch(kernel.interpretationBlock, /aching pecs|bar press pr/i);
});

test('analyse_training_evidence executor returns the evidence shape', () => {
  const result = executeFitnessReadTool('analyse_training_evidence', {
    workouts: ENOUGH,
    today: TODAY,
    input: { query: 'substitute bench press in training' }
  });
  assert.equal(result.ok, true);
  assert.equal(result.store, 'life_hub_fitness');
  assert.equal(result.enough_evidence, true);
  assert.equal(result.substitution.from, 'bench press');
  assert.equal(result.confirmation_required, true);
});
