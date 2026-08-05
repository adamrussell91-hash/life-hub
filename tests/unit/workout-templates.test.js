import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TEMPLATES_PREFIX,
  buildTemplateRecord,
  formatTemplatesForPrompt,
  isTemplatePath,
  parseTemplateMarkdown,
  renderTemplateMarkdown,
  slugifyWorkoutTitle,
  summarizeTemplatesFromContents,
  templatePathForTitle
} from '../../netlify/functions/_shared/workout-templates.mjs';

test('slugifyWorkoutTitle lowercases and kebab-cases, stripping punctuation and collapsing whitespace', () => {
  assert.equal(slugifyWorkoutTitle('Chest and Curls'), 'chest-and-curls');
  assert.equal(slugifyWorkoutTitle('  Leg Day, Round 2!! '), 'leg-day-round-2');
  assert.equal(slugifyWorkoutTitle(''), 'workout');
  assert.equal(slugifyWorkoutTitle(undefined), 'workout');
});

test('templatePathForTitle joins the templates prefix with the slugified title', () => {
  assert.equal(templatePathForTitle('Chest and Curls'), `${TEMPLATES_PREFIX}chest-and-curls.md`);
});

test('isTemplatePath only matches canonical lowercase markdown slugs under the templates prefix', () => {
  assert.equal(isTemplatePath('data/fitness/templates/chest-and-curls.md'), true);
  assert.equal(isTemplatePath('data/fitness/2026/07/2026-07-30-chest-curls.md'), false);
  assert.equal(isTemplatePath('data/fitness/templates/chest-and-curls.json'), false);
  assert.equal(isTemplatePath('data/fitness/templates/../x.md'), false);
  assert.equal(isTemplatePath('data/fitness/templates/nested/extra.md'), false);
  assert.equal(isTemplatePath('data/fitness/templates/Chest-And-Curls.md'), false);
  assert.equal(isTemplatePath('data/fitness/templates/chest_and_curls.md'), false);
  assert.equal(isTemplatePath('data/fitness/templates/.md'), false);
  assert.equal(isTemplatePath(null), false);
});

test('buildTemplateRecord copies prescription fields from a completed session', () => {
  const session = {
    type: 'workout',
    title: 'Chest and Curls',
    session_kind: 'strength',
    day_type: 'workout_30',
    focus: ['chest', 'arms'],
    exercises: [{
      name: 'Bar Press',
      bench_angle_deg: 0,
      sets: [{ reps: 12, weight_kg: 42, cable_type: 'concentric' }]
    }]
  };
  const template = buildTemplateRecord(session, '2026-07-30');
  assert.equal(template.title, 'Chest and Curls');
  assert.equal(template.type, 'workout_template');
  assert.equal(template.source_session_date, '2026-07-30');
  assert.deepEqual(template.focus, ['chest', 'arms']);
  assert.equal(template.exercises[0].name, 'Bar Press');
  assert.equal(template.exercises[0].bench_angle_deg, 0);
  assert.equal(template.exercises[0].sets[0].cable_type, 'concentric');
  assert.equal(template.exercises[0].sets[0].weight_kg, 42);
});

test('buildTemplateRecord tolerates a session with no exercises or focus', () => {
  const template = buildTemplateRecord({ title: 'Rest Walk', session_kind: 'walk' }, '2026-07-30');
  assert.deepEqual(template.focus, []);
  assert.deepEqual(template.exercises, []);
});

test('render/parse template markdown round-trips', () => {
  const template = buildTemplateRecord({
    title: 'Chest and Curls',
    session_kind: 'strength',
    day_type: 'workout_30',
    focus: ['chest'],
    exercises: [{ name: 'Curl', sets: [{ reps: 10, weight_kg: 12, cable_type: 'constant_force' }] }]
  }, '2026-07-30');
  const markdown = renderTemplateMarkdown(template);
  assert.match(markdown, /^---\n/);
  const parsed = parseTemplateMarkdown(markdown);
  assert.equal(parsed.title, 'Chest and Curls');
  assert.equal(parsed.source_session_date, '2026-07-30');
  assert.equal(parsed.exercises.length, 1);
  assert.equal(parsed.exercises[0].sets[0].cable_type, 'constant_force');
});

test('parseTemplateMarkdown returns null for content without frontmatter', () => {
  assert.equal(parseTemplateMarkdown('no frontmatter here'), null);
  assert.equal(parseTemplateMarkdown(undefined), null);
});

test('formatTemplatesForPrompt lists titles, kind, and last actuals date for Chadwick', () => {
  const text = formatTemplatesForPrompt([
    { title: 'Chest and Curls', source_session_date: '2026-07-30', session_kind: 'strength' }
  ]);
  assert.match(text, /Chest and Curls/);
  assert.match(text, /2026-07-30/);
  assert.match(text, /strength/);
});

test('formatTemplatesForPrompt returns an empty string for an empty or invalid list', () => {
  assert.equal(formatTemplatesForPrompt([]), '');
  assert.equal(formatTemplatesForPrompt(undefined), '');
});

test('summarizeTemplatesFromContents parses decoded tree entries into template records', () => {
  const template = buildTemplateRecord({
    title: 'Chest and Curls', session_kind: 'strength', exercises: []
  }, '2026-07-30');
  const entries = [
    { path: `${TEMPLATES_PREFIX}chest-and-curls.md`, content: renderTemplateMarkdown(template) },
    { path: `${TEMPLATES_PREFIX}broken.md`, content: 'not frontmatter' }
  ];
  const summaries = summarizeTemplatesFromContents(entries);
  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].title, 'Chest and Curls');
});

test('summarizeTemplatesFromContents tolerates non-array input', () => {
  assert.deepEqual(summarizeTemplatesFromContents(undefined), []);
});
