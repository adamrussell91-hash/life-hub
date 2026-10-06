import test from 'node:test';
import assert from 'node:assert/strict';
import { load as loadYaml } from 'js-yaml';
import { parseEventDocument } from '../../apps/life/js/core/records.js';
import {
  ADDED_AFTER_FINISH_HEADING,
  appendWorkoutNotes,
  buildWorkoutNotesAmend,
  FINISHED_SESSION_PLAN_ERROR,
  pickCompletedWorkoutForNotes,
  pickMatchingPlannedWorkout,
  pickSameDayPlannedWorkout,
  planLooksLikeCompletedSession,
  resolveWorkoutConfirmTarget,
  sameDayWorkoutEntries,
  workoutSlugFromPath
} from '../../netlify/functions/_shared/workout-confirm-path.mjs';

test('sameDayWorkoutEntries only keeps dated workout session files', () => {
  const tree = [
    { type: 'blob', path: 'data/fitness/2026/09/2026-09-05-workout-biceps.md', sha: 'a' },
    { type: 'blob', path: 'data/fitness/2026/09/2026-09-05-meal-lunch.md', sha: 'b' },
    { type: 'blob', path: 'data/fitness/templates/chest.md', sha: 'c' }
  ];
  assert.deepEqual(
    sameDayWorkoutEntries(tree, '2026-09-05').map(e => e.path),
    ['data/fitness/2026/09/2026-09-05-workout-biceps.md']
  );
});

test('workoutSlugFromPath drops the calendar date prefix', () => {
  assert.equal(
    workoutSlugFromPath('data/fitness/2026/09/2026-09-05-workout-dog-walk.md'),
    'workout-dog-walk'
  );
});

test('pickSameDayPlannedWorkout prefers the stable planned path', () => {
  const planned = pickSameDayPlannedWorkout([
    { path: 'data/fitness/2026/09/2026-09-05-workout-biceps.md', status: 'planned', sha: '1' },
    { path: 'data/fitness/2026/09/2026-09-05-workout-planned.md', status: 'planned', sha: '2' }
  ]);
  assert.equal(planned.path, 'data/fitness/2026/09/2026-09-05-workout-planned.md');
});

test('pickMatchingPlannedWorkout matches by title without collapsing a second plan', () => {
  const entries = [
    { path: 'data/fitness/2026/09/2026-09-05-workout-the-full-send.md', status: 'planned', sha: '1', title: 'The Full Send' },
    { path: 'data/fitness/2026/09/2026-09-05-workout-dog-walk.md', status: 'planned', sha: '2', title: 'Dog Walk' }
  ];
  assert.equal(
    pickMatchingPlannedWorkout(entries, { title: 'Dog Walk' }).path,
    'data/fitness/2026/09/2026-09-05-workout-dog-walk.md'
  );
  assert.equal(
    pickMatchingPlannedWorkout(entries, { slug: 'workout-the-full-send' }).path,
    'data/fitness/2026/09/2026-09-05-workout-the-full-send.md'
  );
  assert.equal(
    pickMatchingPlannedWorkout(entries, { title: 'Evening EP', slug: 'workout-evening-ep' }),
    null
  );
});

function clientWith(files) {
  const list = Array.isArray(files) ? files : [files];
  return {
    async resolveTree() {
      return {
        tree: list.map(({ path, sha = 'abc' }) => ({ type: 'blob', path, sha }))
      };
    },
    async readBlob(sha) {
      const file = list.find(entry => (entry.sha ?? 'abc') === sha) ?? list[0];
      return { content: Buffer.from(file.body).toString('base64'), encoding: 'base64' };
    }
  };
}

test('completed confirm reuses same-day planned file when slug matches', async () => {
  const path = 'data/fitness/2026/09/2026-09-05-workout-biceps.md';
  const target = await resolveWorkoutConfirmTarget(clientWith({
    path,
    body: '---\nstatus: planned\ntitle: Biceps\n---\n'
  }), {
    record: { type: 'workout', date: '2026-09-05', status: 'completed', title: 'Biceps' },
    slug: 'biceps',
    overwrite: true
  });
  assert.equal(target.path, path);
  assert.equal(target.existingSha, 'abc');
});

test('completed confirm does not clobber a different same-day planned session', async () => {
  const plannedPath = 'data/fitness/2026/09/2026-09-05-workout-biceps.md';
  const target = await resolveWorkoutConfirmTarget(clientWith({
    path: plannedPath,
    body: '---\nstatus: planned\ntitle: Biceps\n---\n'
  }), {
    record: { type: 'workout', date: '2026-09-05', status: 'completed', title: 'Morning Walk' },
    slug: 'morning-walk',
    overwrite: true
  });
  assert.notEqual(target.path, plannedPath);
  assert.match(target.path, /morning-walk/);
});

test('planned confirm creates a second file instead of overwriting a different titled plan', async () => {
  const existing = 'data/fitness/2026/09/2026-09-05-workout-the-full-send.md';
  const target = await resolveWorkoutConfirmTarget(clientWith({
    path: existing,
    sha: 'abc',
    body: '---\nstatus: planned\ntitle: The Full Send\n---\n'
  }), {
    record: {
      type: 'workout',
      date: '2026-09-05',
      status: 'planned',
      title: 'Dog Walk Around the Block'
    },
    slug: 'workout-dog-walk-around-the-block',
    overwrite: false
  });
  assert.equal(target.path, 'data/fitness/2026/09/2026-09-05-workout-dog-walk-around-the-block.md');
  assert.equal(target.existingSha, undefined);
});

test('planned confirm amends the matching titled plan', async () => {
  const existing = 'data/fitness/2026/09/2026-09-05-workout-the-full-send.md';
  const target = await resolveWorkoutConfirmTarget(clientWith({
    path: existing,
    sha: 'abc',
    body: '---\nstatus: planned\ntitle: The Full Send\n---\n'
  }), {
    record: {
      type: 'workout',
      date: '2026-09-05',
      status: 'planned',
      title: 'The Full Send'
    },
    slug: 'workout-the-full-send',
    overwrite: false
  });
  assert.equal(target.path, existing);
  assert.equal(target.existingSha, 'abc');
});

test('planned confirm refuses to overwrite a completed file at the same path', async () => {
  const path = 'data/fitness/2026/10/2026-10-06-workout-the-full-send.md';
  const target = await resolveWorkoutConfirmTarget(clientWith({
    path,
    sha: 'abc',
    body: '---\nstatus: completed\ntitle: The Full Send\n---\n'
  }), {
    record: { type: 'workout', date: '2026-10-06', status: 'planned', title: 'The Full Send' },
    slug: 'workout-the-full-send',
    overwrite: true
  });
  assert.equal(target.blocked, true);
  assert.equal(target.error, FINISHED_SESSION_PLAN_ERROR);
  assert.equal(target.path, path);
});

test('skipped files are also protected from planned overwrite', async () => {
  const path = 'data/fitness/2026/10/2026-10-06-workout-easy-walk.md';
  const target = await resolveWorkoutConfirmTarget(clientWith({
    path,
    sha: 'abc',
    body: '---\nstatus: skipped\ntitle: Easy Walk\n---\n'
  }), {
    record: { type: 'workout', date: '2026-10-06', status: 'planned', title: 'Easy Walk' },
    slug: 'workout-easy-walk',
    overwrite: true
  });
  assert.equal(target.blocked, true);
});

test('appendWorkoutNotes adds an Added after finish heading', () => {
  const first = appendWorkoutNotes('Chest — AC clear', 'avg HR 142, 410 kcal');
  assert.match(first.notes, new RegExp(ADDED_AFTER_FINISH_HEADING));
  assert.match(first.notes, /Chest — AC clear/);
  assert.match(first.notes, /avg HR 142/);
  const second = appendWorkoutNotes(first.notes, 'felt strong');
  assert.equal((second.notes.match(new RegExp(ADDED_AFTER_FINISH_HEADING, 'g')) || []).length, 1);
  assert.match(second.notes, /felt strong/);
});

test('pickCompletedWorkoutForNotes asks which session when two exist and no title is given', () => {
  const picked = pickCompletedWorkoutForNotes([
    { path: 'data/fitness/2026/10/2026-10-06-workout-a.md', status: 'completed', title: 'The Full Send' },
    { path: 'data/fitness/2026/10/2026-10-06-workout-b.md', status: 'completed', title: 'Dog Walk' }
  ]);
  assert.equal(picked.error, 'ambiguous');
  assert.deepEqual(picked.titles, ['The Full Send', 'Dog Walk']);
});

test('planLooksLikeCompletedSession matches the session that came from the chat plan', () => {
  assert.equal(planLooksLikeCompletedSession({
    fields: {
      title: 'The Full Send',
      exercises: [
        { name: 'Bar Press' },
        { name: 'Bar Row' },
        { name: 'Bar Squat' }
      ]
    }
  }, [{
    title: 'The Full Send',
    record: {
      title: 'The Full Send',
      exercises: [{ name: 'Bar Press' }, { name: 'Bar Row' }]
    }
  }]), true);
  assert.equal(planLooksLikeCompletedSession({
    fields: {
      title: 'Evening Walk',
      exercises: [{ name: 'Easy Walk' }, { name: 'Calf Raise' }]
    }
  }, [{
    title: 'The Full Send',
    record: { title: 'The Full Send', exercises: [{ name: 'Bar Press' }, { name: 'Bar Row' }] }
  }]), false);
});

function completedWorkoutMarkdown({
  date = '2026-10-06',
  title = 'The Full Send',
  notes = 'Matched loads.'
} = {}) {
  return [
    '---',
    'schema_version: 1',
    'id: "workout-2026-10-06-full-send"',
    'type: workout',
    `date: ${date}`,
    'time: "16:28"',
    'created_at: 2026-10-06T16:28:00+11:00',
    'updated_at: 2026-10-06T16:28:00+11:00',
    'source: chat',
    `title: ${JSON.stringify(title)}`,
    'session_kind: strength',
    'day_type: workout_30',
    'status: completed',
    'duration_min: 30',
    'exercises:',
    '  - name: Bar Press',
    '    sets:',
    '      - { reps: 10, weight_kg: 40, cable_type: constant_force }',
    '  - name: Cable Curl',
    '    sets:',
    '      - { reps: 8, weight_kg: 37, cable_type: constant_force }',
    '---',
    notes
  ].join('\n');
}

test('buildWorkoutNotesAmend proposes the existing completed file with notes appended', async () => {
  const path = 'data/fitness/2026/10/2026-10-06-workout-the-full-send.md';
  const exercises = [
    { name: 'Bar Press', sets: [{ reps: 10, weight_kg: 40, cable_type: 'constant_force' }] },
    { name: 'Cable Curl', sets: [{ reps: 8, weight_kg: 37, cable_type: 'constant_force' }] }
  ];
  const result = await buildWorkoutNotesAmend(clientWith({
    path,
    sha: 'abc',
    body: completedWorkoutMarkdown()
  }), {
    date: '2026-10-06',
    notes: 'avg HR 142, 410 kcal',
    parseDocument: (content, filePath) => parseEventDocument(content, filePath, loadYaml)
  });
  assert.equal(result.ok, true);
  assert.equal(result.path, path);
  assert.equal(result.overwrite, true);
  assert.equal(result.amend_path, path);
  assert.equal(result.record.status, 'completed');
  assert.deepEqual(result.record.exercises, exercises);
  assert.match(result.notes, /Matched loads/);
  assert.match(result.notes, /Added after finish/);
  assert.match(result.notes, /avg HR 142, 410 kcal/);
});

test('buildWorkoutNotesAmend with two completed workouts and no title asks which one', async () => {
  const result = await buildWorkoutNotesAmend(clientWith([
    {
      path: 'data/fitness/2026/10/2026-10-06-workout-the-full-send.md',
      sha: 'aaa',
      body: completedWorkoutMarkdown({ title: 'The Full Send' })
    },
    {
      path: 'data/fitness/2026/10/2026-10-06-workout-dog-walk.md',
      sha: 'bbb',
      body: completedWorkoutMarkdown({ title: 'Dog Walk' })
    }
  ]), {
    date: '2026-10-06',
    notes: 'avg HR 142',
    parseDocument: (content, filePath) => parseEventDocument(content, filePath, loadYaml)
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'ambiguous');
  assert.ok(result.titles.includes('The Full Send'));
  assert.ok(result.titles.includes('Dog Walk'));
});
