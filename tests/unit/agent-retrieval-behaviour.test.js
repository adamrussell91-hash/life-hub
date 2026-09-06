import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activationForTurn,
  classifyIntent,
  catalogueForAgent,
  listIntentRules
} from '../../netlify/functions/_shared/capabilities/activation-policy.mjs';
import {
  getNutritionSnapshot,
  getNutritionAdherence,
  searchNutritionRecords,
  getWeightTrend,
  searchDiaryRecords,
  getDiaryRange,
  getSkincareAdherence,
  getTasksFocus,
  searchTasks,
  searchTeaching,
  getTeachingContext,
  searchKnowledge,
  inspectHubSignals,
  domainRetrievalSchemasFor
} from '../../netlify/functions/_shared/domain-retrieval.mjs';
import { buildAgentTools, resetCapabilityCaches } from '../../netlify/functions/_shared/capabilities/registry.mjs';
import { buildSystemPrompt } from '../../netlify/functions/_shared/persona.mjs';

test('activation: Chadwick training overview requires fitness retrieval tools', () => {
  const act = activationForTurn({
    slug: 'chadwick',
    message: 'How has my training been going lately?'
  });
  assert.equal(act.intentClass, 'training_overview');
  assert.ok(act.requiredTools.includes('get_fitness_snapshot'));
  assert.ok(act.requiredTools.includes('compare_workout_windows'));
  assert.equal(act.forceToolChoice, true);
  assert.match(act.activationBlock, /MUST call these retrieval tools/i);
  assert.match(act.catalogueBlock, /get_fitness_snapshot/);
});

test('activation: Chadwick decline path requires load/pain/body', () => {
  const act = activationForTurn({
    slug: 'chadwick',
    message: 'Why is my performance declining?'
  });
  assert.equal(act.intentClass, 'training_decline');
  for (const tool of ['get_load_status', 'get_pain_training_summary', 'get_body_state']) {
    assert.ok(act.requiredTools.includes(tool), tool);
  }
});

test('activation: Clare focus today requires tasks focus', () => {
  const act = activationForTurn({
    slug: 'clare',
    message: 'What should I focus on today?'
  });
  assert.equal(act.intentClass, 'focus_today');
  assert.deepEqual(act.requiredTools, ['get_tasks_focus']);
});

test('activation: irrelevant small talk does not force tools', () => {
  const act = activationForTurn({
    slug: 'chadwick',
    message: 'hey bro just saying hi'
  });
  assert.equal(act.intentClass, 'none');
  assert.equal(act.forceToolChoice, false);
});

test('activation: unavailable source meta is visible', () => {
  const act = activationForTurn({
    slug: 'clare',
    message: 'What should I focus on today?',
    sourceMeta: { tasks: { error: 'load_failed' } }
  });
  assert.match(act.catalogueBlock, /UNAVAILABLE \(load_failed\)/);
});

test('catalogue exists for every roster specialist', () => {
  for (const slug of [
    'chadwick', 'brisket', 'sara', 'penelope', 'vera',
    'hyaluronica', 'clare', 'ann', 'clementine', 'hammond'
  ]) {
    assert.match(catalogueForAgent(slug), /Available data sources/);
  }
  assert.ok(listIntentRules().length >= 10);
});

test('domain tools: nutrition snapshot and adherence are deterministic', () => {
  const today = '2026-08-01';
  const records = [
    {
      type: 'meal',
      date: today,
      meal: 'lunch',
      calories: 600,
      protein_g: 40,
      fat_g: 20,
      notes: 'chicken — on track'
    },
    {
      type: 'meal',
      date: '2026-07-30',
      meal: 'dinner',
      calories: 700,
      protein_g: 50,
      fat_g: 25,
      notes: 'steak'
    }
  ];
  const snap = getNutritionSnapshot(records, today);
  assert.equal(snap.ok, true);
  assert.equal(snap.today.calories, 600);
  const adherence = getNutritionAdherence(records, today);
  assert.equal(adherence.ok, true);
  assert.ok(adherence.week.days_logged >= 1);
  const search = searchNutritionRecords(records, { query: 'chicken' });
  assert.equal(search.count, 1);
});

test('domain tools: weight trend flags large conflicts', () => {
  const trend = getWeightTrend({
    compositionRecords: [
      { date: '2026-08-01', weight_kg: 90 },
      { date: '2026-07-01', weight_kg: 82 }
    ]
  });
  assert.equal(trend.ok, true);
  assert.equal(trend.delta_kg, 8);
  assert.equal(trend.conflict.kind, 'large_weight_delta');
});

test('domain tools: diary search and range', () => {
  const events = [
    {
      path: 'data/mind/2026/08/2026-08-01-diary.md',
      record: { type: 'diary', date: '2026-08-01', mood: 'flat', notes: 'tired again' }
    },
    {
      path: 'data/mind/2026/07/2026-07-20-diary.md',
      record: { type: 'diary', date: '2026-07-20', mood: 'ok', notes: 'normal day' }
    }
  ];
  const search = searchDiaryRecords(events, { query: 'tired' });
  assert.equal(search.ok, true);
  assert.ok(search.count >= 1);
  const range = getDiaryRange(events, { from: '2026-07-01', to: '2026-08-31' });
  assert.equal(range.count, 2);
});

test('domain tools: tasks focus and teaching context', () => {
  const tasks = [
    { id: 't1', title: 'Mark Year 10 essays', status: 'open', due_date: '2026-07-01', domain: 'teaching' },
    { id: 't2', title: 'Buy milk', status: 'open', due_date: '2026-08-10', domain: 'life' }
  ];
  const focus = getTasksFocus(tasks, [], { now: new Date('2026-08-05T00:00:00Z') });
  assert.equal(focus.ok, true);
  assert.equal(focus.open_count, 2);
  assert.ok(focus.overdue.length >= 1);
  const found = searchTasks(tasks, { query: 'year 10' });
  assert.equal(found.count, 1);

  const teaching = getTeachingContext({
    classes: [{ id: 'c1', code: '10ENG', display_name: 'Year 10 English', status: 'active' }],
    lessons: [{ id: 'l1', date: '2026-08-06', title: 'Essay structure', class_id: 'c1' }],
    units: [{ id: 'u1', title: 'Module A' }],
    query: 'year 10',
    now: new Date('2026-08-05T00:00:00Z')
  });
  assert.equal(teaching.class.code, '10ENG');
  assert.equal(teaching.lesson.id, 'l1');
  const hits = searchTeaching({
    query: 'essay',
    lessons: [{ id: 'l1', title: 'Essay structure' }]
  });
  assert.ok(hits.count >= 1);
});

test('domain tools: knowledge search distinguishes corpus hits', () => {
  const pages = [
    { id: 'page_hub_1', title: 'Cognitive load theory', tags: ['clt'], excerpt: 'Working memory limits' },
    { id: 'page_hub_2', title: 'Rosenshine', tags: ['instruction'], excerpt: 'Principles' }
  ];
  const result = searchKnowledge(pages, { query: 'cognitive load' });
  assert.equal(result.count, 1);
  assert.match(result.how_to_read, /Distinguish/);
});

test('domain tools: hub inspect surfaces unavailable hubs', () => {
  const result = inspectHubSignals({
    tasks: [],
    classes: [],
    scheduledLessons: [],
    loadErrors: { tasks: 'load_failed' },
    hammondDigest: ''
  });
  assert.equal(result.ok, true);
  assert.ok(result.unavailable.some(item => item.hub === 'tasks'));
  assert.equal(result.tasks_focus.error, 'tasks_unavailable');
});

test('domain tools: skincare adherence reports truncation honestly', () => {
  const records = Array.from({ length: 20 }, (_, i) => ({
    date: `2026-08-${String(20 - (i % 14)).padStart(2, '0')}`,
    routine: i % 2 ? 'am' : 'pm',
    notes: 'ok'
  }));
  const result = getSkincareAdherence(records, '2026-08-20', { lookbackDays: 14 });
  assert.equal(result.ok, true);
  assert.equal(typeof result.adherence_pct, 'number');
});

test('buildAgentTools attaches domain retrieval for parity agents', () => {
  resetCapabilityCaches();
  const clare = buildAgentTools({ slug: 'clare' }).map(t => t.name);
  assert.ok(clare.includes('get_tasks_focus'));
  assert.ok(clare.includes('search_tasks'));
  assert.ok(clare.includes('create_task'));
  assert.ok(clare.includes('update_task'));

  const ann = buildAgentTools({ slug: 'ann' }).map(t => t.name);
  assert.ok(ann.includes('search_teaching'));
  assert.ok(ann.includes('get_teaching_context'));

  const clementine = buildAgentTools({ slug: 'clementine' }).map(t => t.name);
  assert.ok(clementine.includes('search_knowledge'));

  const brisket = buildAgentTools({
    slug: 'brisket',
    allowedTypes: ['meal'],
    needsFoodLibrary: true
  }).map(t => t.name);
  assert.ok(brisket.includes('get_nutrition_snapshot'));
  assert.ok(brisket.includes('get_nutrition_adherence'));

  const sara = buildAgentTools({
    slug: 'sara',
    allowedTypes: ['weight', 'composition', 'measurements', 'medical'],
    needsSaraMedicalTools: true
  }).map(t => t.name);
  assert.ok(sara.includes('get_body_state'));
  assert.ok(sara.includes('get_weight_trend'));

  const penelope = buildAgentTools({
    slug: 'penelope',
    allowedTypes: ['diary'],
    needsPenelopeDiaryTools: true
  }).map(t => t.name);
  assert.ok(penelope.includes('search_diary_records'));
  assert.ok(penelope.includes('get_diary_range'));

  const hyaluronica = buildAgentTools({
    slug: 'hyaluronica',
    allowedTypes: ['skincare'],
    needsSkincareLibrary: true
  }).map(t => t.name);
  assert.ok(hyaluronica.includes('get_skincare_adherence'));

  const hammond = buildAgentTools({
    slug: 'hammond',
    needsHammondTools: true
  }).map(t => t.name);
  assert.ok(hammond.includes('inspect_hub_signals'));
  assert.ok(hammond.includes('get_week_review'));

  assert.ok(domainRetrievalSchemasFor('clare').length >= 2);
});

test('system prompt delivers activation catalogue and directive for Chadwick', () => {
  const act = activationForTurn({
    slug: 'chadwick',
    message: 'How has my training been going lately?',
    sourceMeta: { fitness_sessions: { count: 12 } }
  });
  const prompt = buildSystemPrompt({
    slug: 'chadwick',
    activationCatalogue: act.catalogueBlock,
    activationDirective: act.activationBlock
  });
  assert.match(prompt, /Available data sources/);
  assert.match(prompt, /get_fitness_snapshot/);
  assert.match(prompt, /MUST call these retrieval tools/);
  assert.match(prompt, /fitness_sessions/);
});

test('classifyIntent weekly_planning requires get_week_review', () => {
  assert.deepEqual(
    classifyIntent('hammond', "Hammond, let's recap the week").requiredTools,
    ['get_week_review']
  );
  assert.equal(classifyIntent('hammond', 'weekly review').id, 'weekly_planning');
  assert.equal(classifyIntent('hammond', 'What is slipping across my life?').id, 'life_slipping');
});

test('classifyIntent history_search maps per agent', () => {
  assert.deepEqual(
    classifyIntent('clementine', 'Have I mentioned cognitive load before?').requiredTools,
    ['search_knowledge']
  );
  assert.deepEqual(
    classifyIntent('penelope', 'Have I mentioned this feeling before?').requiredTools,
    ['search_diary_records']
  );
});
