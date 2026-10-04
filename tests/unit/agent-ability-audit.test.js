/**
 * Roster ability contract: kernel/pack skills must be attached as live tools
 * and named in prompt Interpretation. Counts are not competence — this is
 * Delivery at the buildAgentTools / executeSpecialistRead seam.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'js-yaml';
import { readFileSync } from 'node:fs';
import {
  buildAgentTools,
  capabilityIdsForAgent,
  OS_FLOOR_CAPABILITY_IDS,
  resetCapabilityCaches
} from '../../netlify/functions/_shared/capabilities/registry.mjs';
import { selectCapabilityIdsForTurn } from '../../netlify/functions/_shared/capabilities/intent-router.mjs';
import { buildSystemPrompt } from '../../netlify/functions/_shared/persona.mjs';
import { executeSpecialistRead } from '../../netlify/functions/_shared/domain-analysis.mjs';
import { WRITE_GATEWAY_TOOLS } from '../../netlify/functions/_shared/agent-kernel.mjs';
import { activationForTurn } from '../../netlify/functions/_shared/capabilities/activation-policy.mjs';

const ROSTER = load(readFileSync(new URL('../../config/agents.yml', import.meta.url), 'utf8'))
  .agents.map(agent => agent.slug);

const MUST_HAVE = {
  brisket: [
    'get_nutrition_snapshot',
    'get_nutrition_adherence',
    'get_nutrition_day_remaining',
    'compare_nutrition_periods',
    'analyse_nutrition_evidence',
    'list_nutrition_challenges',
    'upsert_nutrition_challenge',
    'mark_nutrition_challenge_day',
    'delete_meal',
    'create_task',
    'remember_write_memory'
  ],
  chadwick: [
    'get_fitness_snapshot',
    'analyse_training_evidence',
    'save_fitness_research',
    'save_fitness_coaching_profile',
    'save_workout_template',
    'create_task',
    'remember_write_memory'
  ],
  hyaluronica: [
    'get_skincare_adherence',
    'get_skincare_response_evidence',
    'analyse_skincare_evidence',
    'list_skincare_routines',
    'create_task',
    'remember_write_memory'
  ],
  penelope: [
    'search_diary_records',
    'get_diary_range',
    'compare_diary_periods',
    'extract_diary_themes',
    'analyse_diary_evidence',
    'remember_write_memory'
  ],
  sara: [
    'search_medical_records',
    'brief_medical_appointment',
    'analyse_medical_evidence',
    'get_body_state',
    'get_weight_trend',
    'create_task',
    'remember_write_memory'
  ],
  vera: [
    'get_mind_session',
    'search_mind_records',
    'compare_mind_sessions',
    'analyse_mind_evidence',
    'search_diary_records',
    'remember_write_memory'
  ],
  hammond: [
    'inspect_hub_signals',
    'get_hammond_attention_pack',
    'get_week_review',
    'propose_central_node_patch',
    'append_governance_log',
    'remember_write_memory'
  ],
  ann: [
    'search_teaching',
    'get_teaching_context',
    'get_teaching_diagnosis',
    'propose_central_node_patch',
    'remember_write_memory'
  ],
  clementine: [
    'search_knowledge',
    'get_knowledge_synthesis',
    'search_teaching',
    'propose_knowledge_page',
    'remember_write_memory'
  ],
  clare: [
    'get_tasks_focus',
    'get_tasks_open_loops',
    'search_tasks',
    'create_task',
    'update_task',
    'clare_mutate',
    'remember_write_memory'
  ]
};

const TOOL_OPTS = {
  brisket: { allowedTypes: ['meal'], needsFoodLibrary: true },
  chadwick: { allowedTypes: ['workout'], needsExerciseLibrary: true },
  hyaluronica: { allowedTypes: ['skincare'], needsSkincareLibrary: true },
  penelope: { allowedTypes: ['diary'], needsPenelopeDiaryTools: true },
  sara: {
    allowedTypes: ['weight', 'composition', 'measurements', 'bloods', 'medical', 'medication'],
    needsSaraMedicalTools: true
  },
  vera: { allowedTypes: ['mind_session'], needsVeraMindTools: true },
  hammond: { needsHammondTools: true },
  ann: {},
  clementine: {},
  clare: {}
};

function namesFor(slug) {
  resetCapabilityCaches();
  return buildAgentTools({ slug, ...TOOL_OPTS[slug] }).map(tool => tool.name);
}

test('every roster agent is covered by the ability contract', () => {
  assert.deepEqual([...ROSTER].sort(), Object.keys(MUST_HAVE).sort());
});

test('no agent ships duplicate tool names', () => {
  for (const slug of ROSTER) {
    const names = namesFor(slug);
    assert.equal(names.length, new Set(names).size, slug);
  }
});

test('every personality receives the skills the kernel already knows how to run', () => {
  for (const [slug, required] of Object.entries(MUST_HAVE)) {
    const names = namesFor(slug);
    for (const tool of required) {
      assert.ok(names.includes(tool), `${slug} missing ${tool}`);
    }
  }
});

test('remember.write-memory is OS floor and survives a non-memory message', () => {
  resetCapabilityCaches();
  assert.ok(OS_FLOOR_CAPABILITY_IDS.includes('remember.write-memory'));
  for (const slug of ROSTER) {
    assert.ok(capabilityIdsForAgent(slug).includes('remember.write-memory'), slug);
    const ids = selectCapabilityIdsForTurn({
      slug,
      message: 'How is today looking?'
    });
    assert.ok(ids.includes('remember.write-memory'), `${slug} intent trim dropped memory write`);
  }
});

test('prompt Interpretation names the specialist analysis tools', () => {
  const cases = [
    ['brisket', /analyse_nutrition_evidence/],
    ['sara', /analyse_medical_evidence/],
    ['penelope', /analyse_diary_evidence/],
    ['vera', /compare_mind_sessions/],
    ['hyaluronica', /analyse_skincare_evidence/],
    ['clare', /get_tasks_open_loops/],
    ['ann', /get_teaching_diagnosis/],
    ['clementine', /get_knowledge_synthesis/],
    ['hammond', /get_hammond_attention_pack/],
    ['chadwick', /analyse_training_evidence/]
  ];
  for (const [slug, pattern] of cases) {
    const prompt = buildSystemPrompt({ slug });
    assert.match(prompt, pattern, slug);
    assert.match(prompt, /remember_write_memory/);
  }
});

test('executeSpecialistRead runs the attached analysis tools', () => {
  const today = '2026-08-20';
  assert.equal(executeSpecialistRead('get_nutrition_day_remaining', {
    today,
    nutritionRecords: [{ type: 'meal', date: today, calories: 400, protein_g: 30, notes: 'eggs' }]
  }).ok, true);
  assert.equal(executeSpecialistRead('analyse_medical_evidence', {
    today,
    medicalEvents: []
  }).ok, true);
  assert.equal(executeSpecialistRead('compare_diary_periods', {
    today,
    mindEvents: [{ record: { type: 'diary', date: today, notes: 'flat' } }]
  }).ok, true);
  assert.equal(executeSpecialistRead('compare_mind_sessions', {
    today,
    mindEvents: [{ record: { type: 'mind_session', date: today, title: 'check-in' } }]
  }).ok, true);
  assert.equal(executeSpecialistRead('get_skincare_response_evidence', {
    today,
    skincareHistoryRecords: [{ date: today, routine: 'am', notes: 'ok' }]
  }).ok, true);
  assert.equal(executeSpecialistRead('get_tasks_open_loops', {
    today,
    hubTasks: [{ id: 'task_1', title: 'Mark', status: 'open' }]
  }).ok, true);
  assert.equal(executeSpecialistRead('get_teaching_diagnosis', {
    today,
    now: new Date('2026-08-20T01:00:00.000Z'),
    hubLessons: [],
    hubClasses: [],
    hubUnits: []
  }).ok, true);
  assert.equal(executeSpecialistRead('get_knowledge_synthesis', {
    today,
    input: { query: 'cognitive load' },
    knowledgePages: [{ id: 'page_hub_1', title: 'Cognitive load', excerpt: 'CLT', tags: [] }]
  }).ok, true);
  assert.equal(executeSpecialistRead('get_hammond_attention_pack', {
    today,
    hubTasks: [{ id: 'task_1', title: 'Mark', status: 'open' }]
  }).ok, true);
  assert.equal(executeSpecialistRead('not_a_real_tool', { today }), null);
});

test('activation requires specialist analysis, not only snapshots', () => {
  const cases = [
    ['brisket', 'How is my nutrition going this week?', 'analyse_nutrition_evidence'],
    ['chadwick', 'How has my training been going lately?', 'analyse_training_evidence'],
    ['clare', 'What should I focus on today?', 'get_tasks_open_loops'],
    ['ann', "Help me improve tomorrow's Year 10 lesson.", 'get_teaching_diagnosis'],
    ['clementine', 'What do I already have about cognitive load?', 'get_knowledge_synthesis'],
    ['penelope', 'Have I been feeling like this often?', 'analyse_diary_evidence'],
    ['vera', 'What pattern have you noticed across our recent sessions?', 'analyse_mind_evidence'],
    ['hyaluronica', 'Is this routine helping?', 'analyse_skincare_evidence'],
    ['hammond', 'What is slipping across my life right now?', 'get_hammond_attention_pack']
  ];
  for (const [slug, message, tool] of cases) {
    const required = activationForTurn({ slug, message }).requiredTools;
    assert.ok(required.includes(tool), `${slug} ${message} missing ${tool}: ${required.join(',')}`);
  }
});

test('kernel write gateway keeps protocol-mandated domain writes', () => {
  for (const name of [
    'upsert_nutrition_challenge',
    'mark_nutrition_challenge_day',
    'save_food_library_entry',
    'save_exercise_library_entry',
    'save_fitness_research',
    'save_skincare_library_entry',
    'propose_calendar_ghost',
    'remember_write_memory'
  ]) {
    assert.ok(WRITE_GATEWAY_TOOLS.includes(name), name);
  }
});
