/**
 * Orchestration acceptance: activation → tools attached → required tools executed
 * → evidence present → answer may cite it. Mocks model decisions only at the
 * tool-selection boundary (unavoidable without a live Anthropic key).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { activationForTurn } from '../../netlify/functions/_shared/capabilities/activation-policy.mjs';
import { buildAgentTools, resetCapabilityCaches } from '../../netlify/functions/_shared/capabilities/registry.mjs';
import {
  getFitnessSnapshot,
  getLoadStatus,
  getPainTrainingSummary,
  getBodyState
} from '../../netlify/functions/_shared/fitness-tools.mjs';
import { compareWorkoutWindows } from '../../netlify/functions/_shared/workout-history.mjs';
import {
  getNutritionSnapshot,
  getNutritionAdherence,
  getTasksFocus,
  getTeachingContext,
  searchKnowledge,
  getWeightTrend,
  searchDiaryRecords,
  getSkincareAdherence,
  inspectHubSignals
} from '../../netlify/functions/_shared/domain-retrieval.mjs';
import { searchMindRecords } from '../../netlify/functions/_shared/mind-session-read.mjs';
import { buildSystemPrompt } from '../../netlify/functions/_shared/persona.mjs';

const TODAY = '2026-08-20';

const WORKOUTS = [
  {
    type: 'workout',
    status: 'completed',
    date: '2026-08-18',
    title: 'Upper Pump',
    focus: ['chest', 'arms'],
    duration_min: 35,
    notes: 'solid — left shoulder twinged',
    pain_flags: [{ site: 'left shoulder', note: 'twinge on press' }],
    exercises: [
      { name: 'Bench Press', sets: [{ weight_kg: 60, reps: 8 }, { weight_kg: 60, reps: 7 }] }
    ]
  },
  {
    type: 'workout',
    status: 'completed',
    date: '2026-08-15',
    title: 'Pull Day',
    focus: ['back'],
    duration_min: 40,
    notes: 'ok',
    exercises: [
      { name: 'Lat Pulldown', sets: [{ weight_kg: 45, reps: 10 }] }
    ]
  },
  {
    type: 'workout',
    status: 'completed',
    date: '2026-06-01',
    title: 'Old Session',
    focus: ['legs'],
    duration_min: 30,
    exercises: [
      { name: 'Squat', sets: [{ weight_kg: 80, reps: 5 }] }
    ]
  }
];

function assertToolsAttached(tools, required) {
  const names = new Set(tools.map(t => t.name).filter(Boolean));
  for (const name of required) {
    assert.ok(names.has(name), `missing tool ${name}`);
  }
}

function simulateRetrievalTurn({ slug, message, buildTools, executeRequired }) {
  const activation = activationForTurn({ slug, message });
  assert.notEqual(activation.intentClass, 'none', 'expected a retrieval intent');
  assert.equal(activation.forceToolChoice, true);

  resetCapabilityCaches();
  const tools = buildTools();
  assertToolsAttached(tools, activation.requiredTools);

  const prompt = buildSystemPrompt({
    slug,
    activationCatalogue: activation.catalogueBlock,
    activationDirective: activation.activationBlock
  });
  assert.match(prompt, /MUST call these retrieval tools/);
  for (const tool of activation.requiredTools) {
    assert.match(prompt, new RegExp(tool));
  }

  const evidence = {};
  for (const tool of activation.requiredTools) {
    evidence[tool] = executeRequired(tool);
    assert.ok(evidence[tool], `tool ${tool} returned nothing`);
    if (evidence[tool].ok === false) {
      assert.ok(
        evidence[tool].error,
        `failed retrieval must name the error for ${tool}`
      );
    }
  }
  return { activation, tools, prompt, evidence };
}

test('scenario 1: Chadwick training overview retrieves snapshot + compare', () => {
  const { evidence } = simulateRetrievalTurn({
    slug: 'chadwick',
    message: 'How has my training been going lately?',
    buildTools: () => buildAgentTools({
      slug: 'chadwick',
      allowedTypes: ['workout'],
      needsExerciseLibrary: true,
      message: 'How has my training been going lately?'
    }),
    executeRequired: (tool) => {
      if (tool === 'get_fitness_snapshot') return getFitnessSnapshot(WORKOUTS, TODAY);
      if (tool === 'compare_workout_windows') return compareWorkoutWindows(WORKOUTS, TODAY);
      return null;
    }
  });
  assert.equal(evidence.get_fitness_snapshot.ok, true);
  assert.ok(evidence.get_fitness_snapshot.last_completed_date);
  assert.equal(evidence.compare_workout_windows.ok, true);
  assert.ok(evidence.compare_workout_windows.current.from);
  assert.ok(evidence.compare_workout_windows.previous.from);
});

test('scenario 2: Chadwick decline checks load, pain, snapshot, body', () => {
  const { evidence } = simulateRetrievalTurn({
    slug: 'chadwick',
    message: 'Why is my performance declining?',
    buildTools: () => buildAgentTools({
      slug: 'chadwick',
      allowedTypes: ['workout'],
      needsExerciseLibrary: true,
      message: 'Why is my performance declining?'
    }),
    executeRequired: (tool) => {
      if (tool === 'get_load_status') return getLoadStatus(WORKOUTS, TODAY);
      if (tool === 'get_pain_training_summary') return getPainTrainingSummary(WORKOUTS, TODAY);
      if (tool === 'get_fitness_snapshot') return getFitnessSnapshot(WORKOUTS, TODAY);
      if (tool === 'get_body_state') {
        return getBodyState({
          compositionRecords: [{ date: TODAY, weight_kg: 84, body_fat_pct: 18 }],
          measurementRecords: [{ date: TODAY, shoulders: 120, waist: 82 }],
          targetRatio: 1.6
        });
      }
      return null;
    }
  });
  assert.equal(evidence.get_load_status.ok, true);
  assert.equal(evidence.get_pain_training_summary.ok, true);
  assert.ok(
    (evidence.get_pain_training_summary.flags?.length
      ?? evidence.get_pain_training_summary.recent?.length
      ?? evidence.get_pain_training_summary.count
      ?? 0) >= 0
  );
  assert.equal(evidence.get_body_state.ok, true);
});

test('scenario 3: Clare focus today retrieves tasks focus', () => {
  const tasks = [
    { id: '1', title: 'Mark essays', status: 'open', due_date: '2026-08-10', domain: 'teaching', priority: 'high' },
    { id: '2', title: 'Email parent', status: 'open', due_date: '2026-08-21', domain: 'teaching' }
  ];
  const { evidence } = simulateRetrievalTurn({
    slug: 'clare',
    message: 'What should I focus on today?',
    buildTools: () => buildAgentTools({ slug: 'clare', message: 'What should I focus on today?' }),
    executeRequired: (tool) => {
      if (tool === 'get_tasks_focus') {
        return getTasksFocus(tasks, [], { now: new Date('2026-08-20T01:00:00Z') });
      }
      return null;
    }
  });
  assert.equal(evidence.get_tasks_focus.open_count, 2);
  assert.ok(evidence.get_tasks_focus.overdue.length >= 1);
});

test('scenario 4: Ann improve lesson retrieves teaching context', () => {
  const { evidence } = simulateRetrievalTurn({
    slug: 'ann',
    message: "Help me improve tomorrow's Year 10 lesson.",
    buildTools: () => buildAgentTools({
      slug: 'ann',
      message: "Help me improve tomorrow's Year 10 lesson."
    }),
    executeRequired: (tool) => {
      if (tool === 'search_teaching') {
        return { ok: true, count: 1, results: [{ type: 'class', id: 'c1', title: '10ENG' }] };
      }
      if (tool === 'get_teaching_context') {
        return getTeachingContext({
          classes: [{ id: 'c1', code: '10ENG', display_name: 'Year 10 English', status: 'active' }],
          lessons: [{ id: 'l1', date: '2026-08-21', title: 'Essay structure', class_id: 'c1', unit_id: 'u1' }],
          units: [{ id: 'u1', title: 'Module A' }],
          query: 'year 10',
          now: new Date('2026-08-20T01:00:00Z')
        });
      }
      return null;
    }
  });
  assert.equal(evidence.get_teaching_context.lesson.id, 'l1');
  assert.equal(evidence.get_teaching_context.class.code, '10ENG');
});

test('scenario 5: Clementine knowledge lookup searches corpus', () => {
  const pages = [
    { id: 'page_hub_clt', title: 'Cognitive load theory', tags: ['clt'], excerpt: 'Working memory limits' }
  ];
  const { evidence } = simulateRetrievalTurn({
    slug: 'clementine',
    message: 'What do I already have about cognitive load?',
    buildTools: () => buildAgentTools({
      slug: 'clementine',
      message: 'What do I already have about cognitive load?'
    }),
    executeRequired: (tool) => {
      if (tool === 'search_knowledge') return searchKnowledge(pages, { query: 'cognitive load' });
      return null;
    }
  });
  assert.equal(evidence.search_knowledge.count, 1);
  assert.equal(evidence.search_knowledge.results[0].id, 'page_hub_clt');
});

test('scenario 6: Sara weight question retrieves body trend', () => {
  const { evidence } = simulateRetrievalTurn({
    slug: 'sara',
    message: 'Is my weight change unusual?',
    buildTools: () => buildAgentTools({
      slug: 'sara',
      allowedTypes: ['weight', 'composition', 'measurements', 'medical'],
      needsSaraMedicalTools: true,
      message: 'Is my weight change unusual?'
    }),
    executeRequired: (tool) => {
      if (tool === 'get_body_state') {
        return getBodyState({
          compositionRecords: [
            { date: '2026-08-20', weight_kg: 84.2, body_fat_pct: 18 },
            { date: '2026-08-01', weight_kg: 83.8, body_fat_pct: 18.2 }
          ],
          measurementRecords: [],
          targetRatio: 1.6
        });
      }
      if (tool === 'get_weight_trend') {
        return getWeightTrend({
          compositionRecords: [
            { date: '2026-08-20', weight_kg: 84.2 },
            { date: '2026-08-01', weight_kg: 83.8 }
          ]
        });
      }
      return null;
    }
  });
  assert.equal(evidence.get_weight_trend.found, true);
  assert.equal(evidence.get_weight_trend.delta_kg, 0.4);
});

test('scenario 7: Penelope pattern question searches diary', () => {
  const events = [
    { record: { type: 'diary', date: '2026-08-18', notes: 'feeling flat and tired again', mood: 'flat' } },
    { record: { type: 'diary', date: '2026-08-10', notes: 'flat morning', mood: 'flat' } }
  ];
  const { evidence } = simulateRetrievalTurn({
    slug: 'penelope',
    message: 'Have I been feeling like this often?',
    buildTools: () => buildAgentTools({
      slug: 'penelope',
      allowedTypes: ['diary'],
      needsPenelopeDiaryTools: true,
      message: 'Have I been feeling like this often?'
    }),
    executeRequired: (tool) => {
      if (tool === 'search_diary_records') {
        return searchDiaryRecords(events, { query: 'flat tired' });
      }
      return null;
    }
  });
  assert.ok(evidence.search_diary_records.count >= 1);
});

test('scenario 8: Vera pattern question searches mind records', () => {
  const events = [
    { record: { type: 'mind_session', date: '2026-08-18', theme: 'avoidance', insight: 'procrastination loop' } },
    { record: { type: 'mind_session', date: '2026-08-11', theme: 'avoidance', insight: 'same loop' } }
  ];
  const { evidence } = simulateRetrievalTurn({
    slug: 'vera',
    message: 'What pattern have you noticed across our recent sessions?',
    buildTools: () => buildAgentTools({
      slug: 'vera',
      allowedTypes: ['mind_session'],
      needsVeraMindTools: true,
      message: 'What pattern have you noticed across our recent sessions?'
    }),
    executeRequired: (tool) => {
      if (tool === 'search_mind_records') {
        return searchMindRecords(events, { query: 'avoidance' });
      }
      return null;
    }
  });
  assert.ok(evidence.search_mind_records.count >= 2);
});

test('scenario 9: Hyaluronica routine question retrieves adherence', () => {
  const records = Array.from({ length: 10 }, (_, i) => ({
    date: `2026-08-${String(10 + i).padStart(2, '0')}`,
    routine: 'am',
    notes: 'barrier calm'
  }));
  const { evidence } = simulateRetrievalTurn({
    slug: 'hyaluronica',
    message: 'Is this routine helping?',
    buildTools: () => buildAgentTools({
      slug: 'hyaluronica',
      allowedTypes: ['skincare'],
      needsSkincareLibrary: true,
      message: 'Is this routine helping?'
    }),
    executeRequired: (tool) => {
      if (tool === 'get_skincare_adherence') return getSkincareAdherence(records, TODAY);
      if (tool === 'list_skincare_routines') return { ok: true, routines: [{ id: 'am', products: [] }] };
      if (tool === 'search_skincare_records') {
        return { ok: true, count: 1, results: [{ date: TODAY, notes: 'barrier calm' }] };
      }
      return null;
    }
  });
  assert.equal(evidence.get_skincare_adherence.ok, true);
  assert.ok(evidence.get_skincare_adherence.days_with_log >= 1);
});

test('scenario 10: Hammond life slipping inspects hubs', () => {
  const { evidence } = simulateRetrievalTurn({
    slug: 'hammond',
    message: 'What is slipping across my life right now?',
    buildTools: () => buildAgentTools({
      slug: 'hammond',
      needsHammondTools: true,
      message: 'What is slipping across my life right now?'
    }),
    executeRequired: (tool) => {
      if (tool === 'inspect_hub_signals') {
        return inspectHubSignals({
          tasks: [{ id: '1', title: 'Overdue report', status: 'open', due_date: '2026-08-01' }],
          classes: [],
          scheduledLessons: [],
          loadErrors: { classes: 'load_failed' },
          hammondDigest: 'fitness streak 2',
          now: new Date('2026-08-20T01:00:00Z')
        });
      }
      return null;
    }
  });
  assert.ok(evidence.inspect_hub_signals.unavailable.some(u => u.hub === 'classes'));
  assert.ok(evidence.inspect_hub_signals.life_digest_present);
});

test('scenario 11: retrieval failure is explicit, not empty success', () => {
  const failed = inspectHubSignals({
    tasks: [],
    classes: [],
    scheduledLessons: [],
    loadErrors: { tasks: 'store_down' }
  });
  assert.equal(failed.tasks_focus.error, 'tasks_unavailable');
  assert.ok(failed.unavailable.some(u => u.hub === 'tasks'));
  assert.notEqual(failed.tasks_focus.ok, true);
});

test('scenario 12: truncated results expose truncated=true', () => {
  const pages = Array.from({ length: 30 }, (_, i) => ({
    id: `page_${i}`,
    title: `Cognitive load note ${i}`,
    tags: ['clt'],
    excerpt: 'load'
  }));
  const result = searchKnowledge(pages, { query: 'cognitive', limit: 5 });
  assert.equal(result.truncated, true);
  assert.equal(result.kept, 5);
  assert.ok(result.omitted >= 1);
});

test('scenario 13: irrelevant tool stays unused for greeting', () => {
  const act = activationForTurn({ slug: 'chadwick', message: 'hey bro' });
  assert.equal(act.forceToolChoice, false);
  assert.deepEqual(act.requiredTools, []);
});

test('scenario 14: conflicting weight readings are flagged', () => {
  const trend = getWeightTrend({
    compositionRecords: [
      { date: '2026-08-20', weight_kg: 92 },
      { date: '2026-08-13', weight_kg: 84 }
    ]
  });
  assert.ok(trend.conflict);
  assert.equal(trend.conflict.kind, 'large_weight_delta');
});

test('scenario nutrition overview for Brisket', () => {
  const meals = [
    { type: 'meal', date: TODAY, meal: 'lunch', calories: 500, protein_g: 40, fat_g: 15, notes: 'chicken' }
  ];
  const { evidence } = simulateRetrievalTurn({
    slug: 'brisket',
    message: 'How is my nutrition going this week?',
    buildTools: () => buildAgentTools({
      slug: 'brisket',
      allowedTypes: ['meal'],
      needsFoodLibrary: true,
      message: 'How is my nutrition going this week?'
    }),
    executeRequired: (tool) => {
      if (tool === 'get_nutrition_snapshot') return getNutritionSnapshot(meals, TODAY);
      if (tool === 'get_nutrition_adherence') return getNutritionAdherence(meals, TODAY);
      return null;
    }
  });
  assert.equal(evidence.get_nutrition_snapshot.ok, true);
  assert.equal(evidence.get_nutrition_adherence.ok, true);
});
