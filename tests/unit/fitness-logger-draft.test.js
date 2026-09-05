import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendSet,
  createExercise,
  cloneLoggerDraft,
  draftFingerprint,
  finishLabel,
  formatElapsed,
  loadDraft,
  normalizeLoggerCableType,
  saveDraft,
  clearDraft,
  moveExercise,
  optionalNumber,
  parsePainFlag,
  resolveDraft,
  slugFromWorkoutPath,
  slugifyWorkoutTitle,
  toConfirmPayload,
  planFingerprint,
  ensureCompletedNotes
} from '../../apps/life/js/app/fitness-logger-draft.js';

const planned = () => ({
  type: 'workout',
  date: '2026-08-05',
  title: 'Chest and Curls',
  session_kind: 'strength',
  day_type: 'workout_30',
  status: 'planned',
  focus: ['chest'],
  recovery_flag_next_day: false,
  pain_flags: [],
  path: 'data/fitness/2026/08/2026-08-05-chest-and-curls.md',
  notes: 'Go hard',
  exercises: [{
    name: 'Bench',
    bench_angle_deg: 0,
    sets: [{ reps: 8, weight_kg: 36, cable_type: 'constant_force' }]
  }]
});

test('slug helpers match confirm path conventions', () => {
  assert.equal(slugifyWorkoutTitle('Chest and Curls'), 'chest-and-curls');
  assert.equal(
    slugFromWorkoutPath('data/fitness/2026/08/2026-08-05-chest-and-curls.md'),
    'chest-and-curls'
  );
});

test('finishLabel is Pump for strength and Session otherwise', () => {
  assert.equal(finishLabel('strength'), 'Pump finished');
  assert.equal(finishLabel('walk'), 'Session finished');
  assert.equal(finishLabel('ep'), 'Session finished');
});

test('toConfirmPayload builds overwrite candidate with exercises and notes', () => {
  const { candidate, slug, overwrite } = toConfirmPayload(planned(), { status: 'planned' });
  assert.equal(overwrite, true);
  assert.equal(slug, 'chest-and-curls');
  assert.equal(candidate.type, 'workout');
  assert.equal(candidate.notes, 'Go hard');
  assert.equal(candidate.fields.status, 'planned');
  assert.equal(candidate.fields.exercises[0].sets[0].cable_type, 'constant_force');
});

test('cloneLoggerDraft preserves coach_cues so they survive to the confirm payload', () => {
  const session = planned();
  session.exercises[0].coach_cues = {
    start: "Let's get that chest pumped, big guy.",
    rest: 'Shake it out, next set is coming.',
    final_set: '1-2 reps in the tank, this is the one that counts.'
  };
  const draft = cloneLoggerDraft(session);
  assert.deepEqual(draft.exercises[0].coach_cues, session.exercises[0].coach_cues);

  const { candidate } = toConfirmPayload(draft, { status: 'planned' });
  assert.deepEqual(candidate.fields.exercises[0].coach_cues, session.exercises[0].coach_cues);
});

test('cloneLoggerDraft omits coach_cues entirely when the exercise has none', () => {
  const draft = cloneLoggerDraft(planned());
  assert.equal('coach_cues' in draft.exercises[0], false);
});

test('createExercise rejects a blank name and seeds one set', () => {
  assert.equal(createExercise('   '), null);
  const exercise = createExercise('Face Pull');
  assert.equal(exercise.name, 'Face Pull');
  assert.equal(exercise.sets.length, 1);
  assert.equal(exercise.sets[0].reps, 10);
  assert.equal(exercise.sets[0].cable_type, 'constant_force');
});

test('normalizeLoggerCableType treats none and unknowns as constant force', () => {
  assert.equal(normalizeLoggerCableType('none'), 'constant_force');
  assert.equal(normalizeLoggerCableType(''), 'constant_force');
  assert.equal(normalizeLoggerCableType(null), 'constant_force');
  assert.equal(normalizeLoggerCableType('concentric'), 'concentric');
  const session = planned();
  session.exercises[0].sets[0].cable_type = 'none';
  assert.equal(cloneLoggerDraft(session).exercises[0].sets[0].cable_type, 'constant_force');
  assert.equal(appendSet(session.exercises[0]).sets[1].cable_type, 'constant_force');
});

test('moveExercise reorders and ignores out-of-range indexes', () => {
  const exercises = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];
  assert.deepEqual(moveExercise(exercises, 2, 0).map(item => item.name), ['C', 'A', 'B']);
  assert.equal(moveExercise(exercises, 0, 0), exercises);
  assert.equal(moveExercise(exercises, -1, 1), exercises);
});

test('parsePainFlag and optionalNumber keep empty values out of the record', () => {
  assert.equal(parsePainFlag('  '), null);
  assert.deepEqual(parsePainFlag('right shoulder', 'twinge'), {
    site: 'right shoulder',
    note: 'twinge'
  });
  assert.deepEqual(parsePainFlag('knee', ''), { site: 'knee' });
  assert.equal(optionalNumber(''), null);
  assert.equal(optionalNumber('128'), 128);
});

test('appendSet clones the last row defaults', () => {
  const next = appendSet(planned().exercises[0]);
  assert.equal(next.sets.length, 2);
  assert.equal(next.sets[1].weight_kg, 36);
  assert.equal(next.sets[1].reps, 8);
});

test('localStorage draft round-trips and resolveDraft prefers stored edits', () => {
  const store = new Map();
  const storage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
    removeItem: key => store.delete(key)
  };
  const draft = cloneLoggerDraft(planned());
  draft.exercises[0].sets[0].weight_kg = 40;
  saveDraft(storage, draft);
  const loaded = loadDraft(storage, draft.date, draft.path);
  assert.equal(loaded.exercises[0].sets[0].weight_kg, 40);

  const resolved = resolveDraft(planned(), storage);
  assert.equal(resolved.exercises[0].sets[0].weight_kg, 40);

  clearDraft(storage, draft.date, draft.path);
  assert.equal(loadDraft(storage, draft.date, draft.path), null);
});

test('draftFingerprint changes when a set changes', () => {
  const a = cloneLoggerDraft(planned());
  const b = cloneLoggerDraft(planned());
  b.exercises[0].sets[0].reps = 12;
  assert.notEqual(draftFingerprint(a), draftFingerprint(b));
});

test('formatElapsed pads mm:ss', () => {
  assert.equal(formatElapsed(65_000), '01:05');
  assert.equal(formatElapsed(3_661_000), '01:01:01');
});

test('resolveDraft discards a local draft when the confirmed plan fingerprint changed', () => {
  const store = new Map();
  const storage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
    removeItem: key => store.delete(key)
  };
  const original = planned();
  const draft = cloneLoggerDraft(original);
  draft._planFingerprint = planFingerprint(original);
  draft.exercises[0].sets[0].weight_kg = 99;
  saveDraft(storage, draft);

  const revised = planned();
  revised.exercises = [{
    name: 'Fly',
    sets: [{ reps: 12, weight_kg: 15, cable_type: 'constant_force' }]
  }];
  const resolved = resolveDraft(revised, storage);
  assert.equal(resolved.exercises[0].name, 'Fly');
  assert.equal(resolved.exercises[0].sets[0].weight_kg, 15);
});

test('ensureCompletedNotes fills a verdict when notes are blank', () => {
  const blank = cloneLoggerDraft(planned());
  blank.notes = '';
  blank.pain_flags = [{ site: 'right AC', note: 'pinch' }];
  const filled = ensureCompletedNotes(blank);
  assert.match(filled.notes, /Chest and Curls — pain right AC: pinch/);

  blank.notes = 'Already wrote this';
  assert.equal(ensureCompletedNotes(blank).notes, 'Already wrote this');
});
