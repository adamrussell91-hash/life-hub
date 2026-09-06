/**
 * Evidence-pack competence tests.
 * Proves server-side autonomous retrieval for ordinary wording across all ten
 * agents — without mocking the model's tool choice.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assembleEvidencePack,
  assembleClareEvidence,
  assembleAnnEvidence,
  assembleClementineEvidence
} from '../../netlify/functions/_shared/evidence-packs.mjs';
import { activationForTurn } from '../../netlify/functions/_shared/capabilities/activation-policy.mjs';
import { buildSystemPrompt } from '../../netlify/functions/_shared/persona.mjs';

const TODAY = '2026-08-20';

const BASE_STORES = {
  workouts: [
    {
      type: 'workout',
      status: 'completed',
      date: '2026-08-18',
      title: 'Upper',
      exercises: [{ name: 'Bench Press', sets: [{ weight_kg: 60, reps: 8 }, { weight_kg: 60, reps: 7 }] }],
      pain_flags: [{ site: 'left shoulder', note: 'twinge' }]
    },
    {
      type: 'workout',
      status: 'completed',
      date: '2026-08-11',
      title: 'Upper',
      exercises: [{ name: 'Bench Press', sets: [{ weight_kg: 55, reps: 8 }] }]
    }
  ],
  meals: [
    { type: 'meal', date: TODAY, meal: 'lunch', calories: 620, protein_g: 48, fat_g: 18, notes: 'chicken bowl' },
    { type: 'meal', date: '2026-08-19', meal: 'dinner', calories: 710, protein_g: 52, fat_g: 22, notes: 'salmon' }
  ],
  composition: [
    { date: '2026-08-15', weight_kg: 86.2, body_fat_pct: 19.5 },
    { date: '2026-08-01', weight_kg: 87.1, body_fat_pct: 20.1 }
  ],
  measurements: [{ date: '2026-08-01', waist_cm: 84, shoulders_cm: 118 }],
  mindEvents: [
    { record: { type: 'diary', date: '2026-08-18', mood_score: 4, notes: 'anxious before marking', tags: ['anxiety'] }, body: 'anxious before marking' },
    { record: { type: 'diary', date: '2026-08-10', mood_score: 5, notes: 'same anxious loop', tags: ['anxiety'] }, body: 'same anxious loop' },
    { record: { type: 'mind_session', date: '2026-08-17', title: 'AM', working_model: 'agency', notes: 'agency thread', themes: ['agency'] } },
    { record: { type: 'mind_session', date: '2026-08-12', title: 'PM', working_model: 'agency', notes: 'agency again', themes: ['agency'] } }
  ],
  skincare: [
    { date: '2026-08-18', routine: 'AM', notes: 'less redness', is_procedure: false },
    { date: '2026-08-05', routine: 'AM', notes: 'irritated', is_procedure: false },
    { date: '2026-07-20', routine: 'procedure', notes: 'laser', is_procedure: true }
  ],
  medicalEvents: [
    { record: { type: 'medical', date: '2026-07-08', title: 'Kate Semple', notes: 'therapy review' } }
  ],
  tasks: [
    { id: 't1', title: 'Mark Year 10 essays', status: 'open', due_date: '2026-08-19', priority: 'high', updated_at: '2026-08-01' },
    { id: 't2', title: 'Email parents', status: 'open', due_date: '2026-08-21', priority: 'medium', updated_at: '2026-08-18' }
  ],
  projects: [{ id: 'p1', title: 'Unit redesign', status: 'active', updated_at: '2026-05-01' }],
  classes: [{ id: 'c1', code: '10ENG', display_name: 'Year 10 English' }],
  lessons: [
    {
      id: 'l1',
      date: '2026-08-21',
      title: 'Persuasive openings',
      class_id: 'c1',
      learning_intentions: ['Identify rhetorical moves'],
      blocks: [{ type: 'hook' }]
    }
  ],
  units: [{ id: 'u1', title: 'Rhetoric', code: 'R1' }],
  pages: [
    {
      id: 'page_hub_clt',
      title: 'Cognitive load theory',
      excerpt: 'Intrinsic vs extraneous load',
      tags: ['CLT'],
      claims: ['Reduce extraneous load'],
      connected: ['page_hub_sw']
    }
  ]
};

const CASES = [
  {
    slug: 'chadwick',
    broad: 'How has my training been going lately?',
    expectTools: ['get_fitness_snapshot', 'compare_workout_windows']
  },
  {
    slug: 'brisket',
    broad: "How's my nutrition looking this week?",
    expectTools: ['get_nutrition_snapshot', 'get_nutrition_adherence']
  },
  {
    slug: 'sara',
    broad: 'Is my weight change unusual lately?',
    expectTools: ['get_body_state', 'get_weight_trend']
  },
  {
    slug: 'penelope',
    broad: 'Have I been feeling like this often?',
    expectTools: ['search_diary_records']
  },
  {
    slug: 'vera',
    broad: 'What patterns do you notice across our recent sessions?',
    expectTools: ['search_mind_records', 'compare_mind_sessions']
  },
  {
    slug: 'hyaluronica',
    broad: 'Is my routine actually helping?',
    expectTools: ['get_skincare_adherence', 'get_skincare_response_evidence']
  },
  {
    slug: 'clare',
    broad: 'What should I focus on today?',
    expectTools: ['get_tasks_focus']
  },
  {
    slug: 'ann',
    broad: "Help me improve tomorrow's Year 10 lesson",
    expectTools: ['search_teaching', 'get_teaching_context']
  },
  {
    slug: 'clementine',
    broad: 'What do I already know about cognitive load?',
    expectTools: ['search_knowledge']
  },
  {
    slug: 'hammond',
    broad: 'What is slipping across my life?',
    expectTools: ['inspect_hub_signals', 'get_week_review']
  }
];

for (const scenario of CASES) {
  test(`${scenario.slug}: autonomous broad retrieval packs evidence without tool-name prompts`, () => {
    const activation = activationForTurn({ slug: scenario.slug, message: scenario.broad });
    assert.notEqual(activation.intentClass, 'none', 'intent must fire on ordinary wording');
    const pack = assembleEvidencePack({
      slug: scenario.slug,
      message: scenario.broad,
      today: TODAY,
      stores: BASE_STORES
    });
    assert.equal(pack.active, true);
    assert.equal(pack.answerable, true);
    for (const tool of scenario.expectTools) {
      assert.ok(pack.toolsExecuted.includes(tool), `missing ${tool} in ${pack.toolsExecuted.join(',')}`);
    }
    assert.match(pack.promptBlock, /Server-assembled evidence pack/);
    const prompt = buildSystemPrompt({
      slug: scenario.slug,
      evidencePackBlock: pack.promptBlock,
      activationCatalogue: activation.catalogueBlock,
      activationDirective: activation.activationBlock
    });
    assert.match(prompt, /Retrieved evidence pack/);
  });

  test(`${scenario.slug}: empty store still packs honestly (no invented rich history)`, () => {
    const pack = assembleEvidencePack({
      slug: scenario.slug,
      message: scenario.broad,
      today: TODAY,
      stores: {}
    });
    assert.equal(pack.active, true);
    assert.ok(pack.sections.length > 0);
    assert.ok(
      pack.sections.every(s => s.kind === 'missing' || s.kind === 'calculation' || s.kind === 'record' || s.kind === 'truncated' || s.kind === 'conflict')
    );
  });

  test(`${scenario.slug}: irrelevant small-talk does not force domain pack`, () => {
    const activation = activationForTurn({ slug: scenario.slug, message: 'hey just saying hi' });
    assert.equal(activation.intentClass, 'none');
    const pack = assembleEvidencePack({
      slug: scenario.slug,
      message: 'hey just saying hi',
      today: TODAY,
      stores: BASE_STORES
    });
    assert.equal(pack.active, false);
    assert.equal(pack.toolsExecuted.length, 0);
  });
}

test('weight conflict is flagged when deltas are extreme', () => {
  const pack = assembleEvidencePack({
    slug: 'sara',
    message: 'Is my weight change unusual lately?',
    today: TODAY,
    stores: {
      composition: [
        { date: '2026-08-15', weight_kg: 95 },
        { date: '2026-08-14', weight_kg: 86 }
      ],
      measurements: []
    }
  });
  const trend = pack.sections.find(s => s.id === 'get_weight_trend');
  assert.ok(trend);
  assert.ok(
    trend.kind === 'conflict' || trend.data?.conflict,
    'large weight jump must surface as conflict'
  );
});

test('Clare / Ann / Clementine surface adapters share Life-chat pack competence', () => {
  const clare = assembleClareEvidence(
    { tasks: BASE_STORES.tasks, projects: BASE_STORES.projects },
    { message: 'What should I focus on today?', today: TODAY }
  );
  const ann = assembleAnnEvidence(
    {
      classes: BASE_STORES.classes,
      lessons: BASE_STORES.lessons,
      units: BASE_STORES.units
    },
    { message: "Help me improve tomorrow's Year 10 lesson", today: TODAY }
  );
  const clementine = assembleClementineEvidence(
    {
      pages: BASE_STORES.pages,
      classes: BASE_STORES.classes,
      lessons: BASE_STORES.lessons,
      units: BASE_STORES.units
    },
    { message: 'What do I already know about cognitive load?', today: TODAY }
  );
  assert.equal(clare.active, true);
  assert.equal(ann.active, true);
  assert.equal(clementine.active, true);
  assert.ok(clare.toolsExecuted.includes('get_tasks_focus'));
  assert.ok(ann.toolsExecuted.includes('search_teaching'));
  assert.ok(clementine.toolsExecuted.includes('search_knowledge'));
});
