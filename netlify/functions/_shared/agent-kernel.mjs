/**
 * Agent kernel — typed turn state beside the existing chat path.
 * Phases 1, 3, and 4: specialists plus Hammond supervisor.
 * ponytail: classifier is token lexicons, not one regex per paraphrase.
 * Upgrade: small model planTurn when a cheap classifier is available.
 */
import { randomUUID } from 'node:crypto';
import {
  getFitnessSnapshot,
  getTrainingVolume,
  getLoadStatus,
  getPainTrainingSummary,
  getBodyState,
  analyseTrainingEvidence
} from './fitness-tools.mjs';
import { compareWorkoutWindows } from './workout-history.mjs';
import {
  getTasksFocus,
  getNutritionSnapshot,
  getNutritionAdherence,
  getNutritionTargets,
  searchNutritionRecords,
  getWeightTrend,
  searchDiaryRecords,
  getDiaryRange,
  getSkincareAdherence,
  searchSkincareRecords,
  searchTeaching,
  getTeachingContext,
  searchKnowledge,
  inspectHubSignals
} from './domain-retrieval.mjs';
import {
  getTasksOpenLoops,
  getNutritionDayRemaining,
  compareDiaryPeriods,
  extractDiaryThemes,
  compareMindSessions,
  getSkincareResponseEvidence,
  getTeachingDiagnosis,
  getKnowledgeSynthesis,
  getHammondAttentionPack
} from './domain-analysis.mjs';
import { getWeekReview } from './hammond-week.mjs';
import { searchMedicalRecords, briefMedicalAppointment } from './medical-overview-read.mjs';
import { searchMindRecords } from './mind-session-read.mjs';
import { planWork, statedPlannerInputs } from './clare-work.mjs';
import { composeEvidenceClaims } from './evidence-packs.mjs';
import {
  memoryInterpretationLines,
  memoryPromptBlock,
  parseMemoryStore,
  searchMemories
} from './agent-memory.mjs';
import {
  hammondShouldSupervise,
  handoffInterpretationLines,
  handoffPromptBlock,
  runHammondDelegation
} from './agent-handoff.mjs';

export const KERNEL_PILOT_SLUGS = Object.freeze([
  'chadwick', 'clare', 'sara', 'ann', 'clementine', 'brisket',
  'hyaluronica', 'penelope', 'vera', 'hammond'
]);
export const WRITE_GATEWAY_TOOLS = Object.freeze([
  'os_propose_action',
  'create_task',
  'update_task',
  'clare_mutate',
  'propose_central_node_patch',
  'remember_write_memory'
]);

const STAGES = ['plan', 'retrieve', 'assess', 'resolve', 'compose'];

const TRAIN = new Set([
  'train', 'training', 'workout', 'workouts', 'gym', 'lift', 'lifting',
  'session', 'sessions', 'fitness', 'strength', 'progress', 'programme',
  'program', 'volume', 'weight', 'weights', 'exercise', 'exercises',
  'stronger', 'recap', 'overview', 'gains', 'deload', 'programming',
  'substitute', 'swap', 'replace', 'progression'
]);
const DECLINE = new Set([
  'decline', 'weaker', 'weak', 'stall', 'stalled', 'plateau', 'regress',
  'worse', 'overtrain', 'overtrained', 'pain', 'hurt', 'hurting',
  'shoulder', 'knee', 'load', 'flat', 'drop', 'dropping', 'performance'
]);
const FOCUS = new Set([
  'today', 'focus', 'priority', 'prioritise', 'prioritize', 'priorities',
  'plate', 'overdue', 'next', 'plan', 'planning', 'schedule', 'morning',
  'sweep', 'task', 'tasks', 'triage', 'start', 'deadline', 'due',
  'blocked', 'stale', 'workload', 'capacity', 'day', 'board'
]);
const CAPTURE = new Set(['create', 'add', 'dump', 'inbox', 'capture']);
const GREET = new Set(['hi', 'hey', 'hello', 'yo', 'thanks', 'cheers', 'bro', 'mate', 'just', 'saying']);
const HEALTH = new Set([
  'health', 'medical', 'appointment', 'timeline', 'weight', 'flare',
  'bloods', 'visit', 'clinic', 'gp', 'doctor', 'symptom', 'medication',
  'body', 'unusual'
]);
const LESSON = new Set([
  'lesson', 'lessons', 'class', 'unit', 'teach', 'teaching', 'improve',
  'hinge', 'tomorrow', 'curriculum', 'year', 'pupil', 'student', 'repair'
]);
const KNOW = new Set([
  'know', 'notes', 'archive', 'research', 'already', 'corpus', 'knowledge',
  'synthesis', 'topic', 'about'
]);
const FOOD = new Set([
  'eat', 'ate', 'eaten', 'meal', 'meals', 'nutrition', 'calorie', 'calories',
  'macro', 'macros', 'adherence', 'logged', 'protein', 'diet', 'food',
  'eating', 'intake'
]);
const SKIN = new Set([
  'skin', 'routine', 'helping', 'product', 'flare', 'breakout', 'skincare',
  'treatment', 'cream', 'serum'
]);
const DIARY = new Set([
  'diary', 'feeling', 'often', 'pattern', 'patterns', 'recur', 'recurrence',
  'journal', 'mood', 'felt', 'like'
]);
const MIND = new Set([
  'session', 'sessions', 'reflect', 'reflection', 'therapy', 'mind',
  'longitudinal', 'pattern', 'patterns', 'across'
]);

export function agentKernelEnabled({ env = {}, flag, slug } = {}) {
  if (!KERNEL_PILOT_SLUGS.includes(slug)) return false;
  if (flag === true) return true;
  const raw = env.LIFE_HUB_AGENT_KERNEL;
  return raw === '1' || raw === 'true';
}

function tokenize(message) {
  return String(message ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .split(/\s+/)
    .flatMap(word => {
      const out = [word];
      if (word.endsWith("'s")) out.push(word.slice(0, -2));
      if (word.endsWith('ing') && word.length > 5) {
        const stem = word.slice(0, -3);
        out.push(stem, `${stem}e`);
      }
      if (word.endsWith('ed') && word.length > 4) out.push(word.slice(0, -2));
      if (word.endsWith('s') && word.length > 3) out.push(word.slice(0, -1));
      return out;
    })
    .filter(Boolean);
}

function hits(words, lexicon) {
  return words.some(word => lexicon.has(word));
}

function validatePlan(plan) {
  if (!plan || typeof plan !== 'object') return { ok: false, error: 'missing_plan' };
  if (!plan.workflow || !plan.goal) return { ok: false, error: 'incomplete_plan' };
  if (plan.workflow !== 'none') {
    if (!Array.isArray(plan.requiredSources) || !plan.requiredSources.length) {
      return { ok: false, error: 'incomplete_plan' };
    }
    if (!Array.isArray(plan.completion) || !plan.completion.length) {
      return { ok: false, error: 'incomplete_plan' };
    }
  }
  return { ok: true, plan };
}

export function planTurn({ slug, message } = {}) {
  const words = tokenize(message);
  const greetingOnly = words.length > 0 && words.every(word => GREET.has(word));

  if (slug === 'chadwick' && !greetingOnly && (hits(words, TRAIN) || hits(words, DECLINE))) {
    const decline = hits(words, DECLINE);
    const required = ['get_fitness_snapshot', 'compare_workout_windows'];
    if (decline) required.push('get_load_status', 'get_pain_training_summary', 'get_body_state');
    return validatePlan({
      workflow: 'training_review',
      goal: decline ? 'Explain training status with load/pain coverage' : 'Review training across recent windows',
      domain: 'fitness',
      requiredSources: required,
      optionalSources: decline ? ['get_training_volume', 'analyse_training_evidence'] : ['get_training_volume', 'get_body_state', 'analyse_training_evidence'],
      tools: [...required, 'get_training_volume', 'get_body_state', 'analyse_training_evidence'],
      risk: decline ? 'high' : 'low',
      writeIntent: false,
      retrieve: true,
      completion: decline
        ? ['snapshot_or_named_gap', 'window_or_named_gap', 'pain_or_named_gap']
        : ['snapshot_or_named_gap', 'window_or_named_gap']
    });
  }

  if (slug === 'clare' && !greetingOnly && hits(words, FOCUS) && !hits(words, CAPTURE)) {
    return validatePlan({
      workflow: 'daily_focus',
      goal: 'Name a realistic next move from task, project, and calendar state',
      domain: 'tasks',
      requiredSources: ['get_tasks_focus'],
      optionalSources: ['get_tasks_open_loops', 'plan_work'],
      tools: ['get_tasks_focus', 'inspect_board', 'plan_work', 'check_calendars'],
      risk: 'low',
      writeIntent: false,
      retrieve: true,
      completion: ['focus_or_named_gap']
    });
  }

  if (slug === 'sara' && !greetingOnly && hits(words, HEALTH)) {
    const appointment = words.some(word => ['appointment', 'visit', 'clinic', 'gp', 'doctor'].includes(word));
    const required = ['get_body_state', 'get_weight_trend', 'search_medical_records'];
    if (appointment) required.push('brief_medical_appointment');
    return validatePlan({
      workflow: 'health_timeline',
      goal: appointment
        ? 'Brief the appointment from medical records with provenance'
        : 'Build a health timeline from body, weight, and medical records',
      domain: 'health',
      requiredSources: required,
      optionalSources: [],
      tools: [...required],
      risk: 'high',
      writeIntent: false,
      retrieve: true,
      completion: ['body_or_named_gap', 'medical_or_named_gap']
    });
  }

  if (slug === 'ann' && !greetingOnly && hits(words, LESSON)) {
    return validatePlan({
      workflow: 'lesson_diagnosis',
      goal: 'Diagnose the lesson from class, unit, and calendar context before proposing a repair',
      domain: 'teaching',
      requiredSources: ['search_teaching', 'get_teaching_context', 'get_teaching_diagnosis'],
      optionalSources: [],
      tools: ['search_teaching', 'get_teaching_context', 'get_teaching_diagnosis'],
      risk: 'low',
      writeIntent: false,
      retrieve: true,
      completion: ['context_or_named_gap']
    });
  }

  if (slug === 'clementine' && !greetingOnly && hits(words, KNOW)) {
    return validatePlan({
      workflow: 'knowledge_research',
      goal: 'Retrieve archive notes and synthesise only from those sources',
      domain: 'knowledge',
      requiredSources: ['search_knowledge', 'get_knowledge_synthesis'],
      optionalSources: ['search_teaching'],
      tools: ['search_knowledge', 'get_knowledge_synthesis', 'search_teaching'],
      risk: 'low',
      writeIntent: false,
      retrieve: true,
      completion: ['notes_or_named_gap']
    });
  }

  if (slug === 'brisket' && !greetingOnly && hits(words, FOOD)) {
    return validatePlan({
      workflow: 'nutrition_adherence',
      goal: 'Separate logged intake, missing days, and adherence from guesses',
      domain: 'nutrition',
      requiredSources: ['get_nutrition_snapshot', 'get_nutrition_adherence', 'get_nutrition_day_remaining'],
      optionalSources: ['get_nutrition_targets', 'search_nutrition_records'],
      tools: [
        'get_nutrition_snapshot', 'get_nutrition_adherence', 'get_nutrition_day_remaining',
        'get_nutrition_targets', 'search_nutrition_records'
      ],
      risk: 'low',
      writeIntent: false,
      retrieve: true,
      completion: ['snapshot_or_named_gap']
    });
  }

  if (slug === 'hyaluronica' && !greetingOnly && hits(words, SKIN)) {
    return validatePlan({
      workflow: 'routine_response',
      goal: 'Compare routine adherence with observed response evidence',
      domain: 'skincare',
      requiredSources: ['get_skincare_adherence', 'get_skincare_response_evidence', 'search_skincare_records'],
      optionalSources: [],
      tools: ['get_skincare_adherence', 'get_skincare_response_evidence', 'search_skincare_records'],
      risk: 'low',
      writeIntent: false,
      retrieve: true,
      completion: ['adherence_or_named_gap']
    });
  }

  if (slug === 'penelope' && !greetingOnly && hits(words, DIARY)) {
    return validatePlan({
      workflow: 'diary_recurrence',
      goal: 'Search diary history for recurrence without inventing a pattern',
      domain: 'diary',
      requiredSources: ['search_diary_records', 'compare_diary_periods', 'extract_diary_themes'],
      optionalSources: ['get_diary_range'],
      tools: ['search_diary_records', 'compare_diary_periods', 'extract_diary_themes', 'get_diary_range'],
      risk: 'low',
      writeIntent: false,
      retrieve: true,
      completion: ['diary_or_named_gap']
    });
  }

  if (slug === 'vera' && !greetingOnly && hits(words, MIND)) {
    return validatePlan({
      workflow: 'mind_reflection',
      goal: 'Compare mind sessions and keep interpretations inside retrieved evidence',
      domain: 'mind',
      requiredSources: ['search_mind_records', 'compare_mind_sessions'],
      optionalSources: ['search_diary_records'],
      tools: ['search_mind_records', 'compare_mind_sessions', 'search_diary_records'],
      risk: 'high',
      writeIntent: false,
      retrieve: true,
      completion: ['sessions_or_named_gap']
    });
  }

  if (slug === 'hammond' && hammondShouldSupervise(message)) {
    const week = words.some(word => ['week', 'weekly', 'sunday', 'review'].includes(word));
    const required = ['inspect_hub_signals', 'get_hammond_attention_pack'];
    if (week) required.push('get_week_review');
    return validatePlan({
      workflow: 'cross_hub_supervision',
      goal: 'Delegate to specialists, verify returns, and name unavailable hubs before synthesis',
      domain: 'cross_hub',
      requiredSources: required,
      optionalSources: week ? [] : ['get_week_review'],
      tools: [...required, 'get_week_review', 'propose_central_node_patch', 'append_governance_log'],
      risk: 'high',
      writeIntent: false,
      retrieve: true,
      completion: ['attention_or_named_gap', 'handoffs_verified_or_open']
    });
  }

  return validatePlan({
    workflow: 'none',
    goal: 'no_retrieval',
    domain: slug ?? null,
    requiredSources: [],
    optionalSources: [],
    tools: [],
    risk: 'low',
    writeIntent: false,
    retrieve: false,
    completion: []
  });
}

function emptyStores() {
  return {
    workouts: [],
    composition: [],
    measurements: [],
    tasks: [],
    projects: [],
    lessons: [],
    meals: [],
    medicalEvents: [],
    mindEvents: [],
    skincare: [],
    pages: [],
    classes: [],
    units: [],
    loadErrors: {},
    hammondDigest: '',
    hammondEvents: [],
    centralNodeMarkdown: '',
    stressFlags: [],
    inbox: []
  };
}

function runTool(name, stores, today, now, message, options = {}) {
  const workouts = stores.workouts ?? [];
  const tasks = stores.tasks ?? [];
  const projects = stores.projects ?? [];
  const lessons = stores.lessons ?? [];
  const meals = stores.meals ?? [];
  const loadErrors = stores.loadErrors ?? {};
  const query = String(message ?? '').trim();
  const limit = options.limit;

  if (name === 'get_fitness_snapshot') return getFitnessSnapshot(workouts, today);
  if (name === 'compare_workout_windows') return compareWorkoutWindows(workouts, today);
  if (name === 'get_training_volume') return getTrainingVolume(workouts, today);
  if (name === 'get_load_status') return getLoadStatus(workouts, today);
  if (name === 'get_pain_training_summary') return getPainTrainingSummary(workouts, today);
  if (name === 'analyse_training_evidence') {
    return analyseTrainingEvidence(workouts, today, { query: message });
  }
  if (name === 'get_body_state') {
    return getBodyState({
      compositionRecords: stores.composition ?? [],
      measurementRecords: stores.measurements ?? []
    });
  }
  if (name === 'get_tasks_focus') {
    if (loadErrors.tasks) return { ok: false, error: loadErrors.tasks };
    return getTasksFocus(tasks, projects, { now });
  }
  if (name === 'get_tasks_open_loops') {
    if (loadErrors.tasks) return { ok: false, error: loadErrors.tasks };
    return getTasksOpenLoops(tasks, projects, { now });
  }
  if (name === 'plan_work') {
    const stated = statedPlannerInputs(message);
    if (stated.energy?.level) {
      return planWork('energy', {
        tasks,
        lessons,
        date: today,
        now,
        energy: stated.energy,
        capacity_minutes: stated.capacity_minutes
      });
    }
    if (stated.capacity_minutes) {
      return planWork('time_block', {
        tasks,
        lessons,
        date: today,
        now,
        capacity_minutes: stated.capacity_minutes
      });
    }
    return planWork('collisions', { tasks, lessons, date: today, now });
  }
  if (name === 'get_nutrition_snapshot') {
    return getNutritionSnapshot(meals, today, { nutritionChallenges: stores.nutritionChallenges });
  }
  if (name === 'get_nutrition_adherence') return getNutritionAdherence(meals, today);
  if (name === 'get_nutrition_targets') return getNutritionTargets(today);
  if (name === 'get_nutrition_day_remaining') {
    return getNutritionDayRemaining(meals, today, { nutritionChallenges: stores.nutritionChallenges });
  }
  if (name === 'search_nutrition_records') {
    return searchNutritionRecords(meals, { query: query || 'meal', limit: limit ?? 8 });
  }
  if (name === 'get_weight_trend') {
    return getWeightTrend({
      compositionRecords: stores.composition ?? [],
      measurementRecords: stores.measurements ?? []
    });
  }
  if (name === 'search_medical_records') {
    return searchMedicalRecords(stores.medicalEvents ?? [], { query: query || 'medical', limit: limit ?? 8 });
  }
  if (name === 'brief_medical_appointment') {
    return briefMedicalAppointment(stores.medicalEvents ?? [], { date: today });
  }
  if (name === 'search_teaching') {
    return searchTeaching({
      query: query || 'lesson',
      classes: stores.classes ?? [],
      lessons,
      units: stores.units ?? [],
      limit: limit ?? 10
    });
  }
  if (name === 'get_teaching_context') {
    return getTeachingContext({
      classes: stores.classes ?? [],
      lessons,
      units: stores.units ?? [],
      query,
      now
    });
  }
  if (name === 'get_teaching_diagnosis') {
    return getTeachingDiagnosis({
      classes: stores.classes ?? [],
      lessons,
      units: stores.units ?? [],
      query,
      now
    });
  }
  if (name === 'search_knowledge') {
    return searchKnowledge(stores.pages ?? [], { query: query || 'notes', limit: limit ?? 10 });
  }
  if (name === 'get_knowledge_synthesis') {
    return getKnowledgeSynthesis(stores.pages ?? [], { query: query || 'notes', limit: 10 });
  }
  if (name === 'get_skincare_adherence') return getSkincareAdherence(stores.skincare ?? [], today);
  if (name === 'get_skincare_response_evidence') {
    return getSkincareResponseEvidence(stores.skincare ?? [], today);
  }
  if (name === 'search_skincare_records') {
    return searchSkincareRecords(stores.skincare ?? [], { query: query || 'routine', limit: limit ?? 10 });
  }
  if (name === 'search_diary_records') {
    return searchDiaryRecords(stores.mindEvents ?? [], { query: query || 'feeling', limit: limit ?? 10 });
  }
  if (name === 'compare_diary_periods') return compareDiaryPeriods(stores.mindEvents ?? [], today);
  if (name === 'extract_diary_themes') {
    return extractDiaryThemes(stores.mindEvents ?? [], { query: query || 'feeling', limit: 12 });
  }
  if (name === 'get_diary_range') {
    const from = `${String(today).slice(0, 8)}01`;
    return getDiaryRange(stores.mindEvents ?? [], { from, to: today, limit: 12 });
  }
  if (name === 'search_mind_records') {
    return searchMindRecords(stores.mindEvents ?? [], { query: query || 'session', limit: limit ?? 10 });
  }
  if (name === 'compare_mind_sessions') return compareMindSessions(stores.mindEvents ?? [], today);
  if (name === 'inspect_hub_signals') {
    return inspectHubSignals({
      tasks,
      classes: stores.classes ?? [],
      scheduledLessons: lessons,
      loadErrors,
      hammondDigest: stores.hammondDigest ?? '',
      now
    });
  }
  if (name === 'get_hammond_attention_pack') {
    return getHammondAttentionPack({
      tasks,
      projects,
      classes: stores.classes ?? [],
      lessons,
      mindEvents: stores.mindEvents ?? [],
      workouts,
      meals,
      loadErrors,
      stressFlags: stores.stressFlags ?? [],
      inbox: stores.inbox ?? [],
      today,
      now
    });
  }
  if (name === 'get_week_review') {
    const events = (stores.hammondEvents ?? []).length
      ? stores.hammondEvents
      : [
          ...workouts.map(record => ({ record: { ...record, type: record.type || 'workout' } })),
          ...meals.map(record => ({ record: { ...record, type: record.type || 'meal' } })),
          ...(stores.mindEvents ?? [])
        ];
    return getWeekReview({
      events,
      tasks,
      lessons,
      classes: stores.classes ?? [],
      centralNodeMarkdown: stores.centralNodeMarkdown ?? '',
      today,
      loadErrors
    });
  }
  return { ok: false, error: 'unknown_tool' };
}

function recordTrace(state, stage, summary) {
  const key = `${state.id}:${stage}:${state.trace.length}`;
  if (state.idempotencyKeys.includes(key)) return state;
  state.idempotencyKeys.push(key);
  state.trace.push({ stage, at: new Date().toISOString(), summary, key });
  return state;
}

export function createTurnState({ slug, message, today, now = new Date(), stores, sourceMeta } = {}) {
  return {
    id: randomUUID(),
    slug,
    message,
    today,
    now,
    stores: stores ?? emptyStores(),
    sourceMeta: sourceMeta ?? {},
    stage: 'idle',
    plan: null,
    evidence: {},
    coverage: { missing: [], truncated: [], failed: [] },
    conflicts: [],
    memory: [],
    memoryMeta: { kept: 0, omitted: 0 },
    memoryLoadError: stores?.memoryLoadError ?? null,
    handoffs: [],
    retrieveRound: 0,
    nextRetrievals: [],
    deferredTools: [],
    retrievalLimits: {},
    exhausted: false,
    unresolvedConflicts: [],
    actions: [],
    answer: null,
    claims: [],
    limitations: [],
    sufficient: false,
    complete: false,
    continuationTools: [],
    promptBlock: '',
    interpretationBlock: '',
    trace: [],
    idempotencyKeys: [],
    halted: null
  };
}

function doPlan(state) {
  const validated = planTurn({ slug: state.slug, message: state.message });
  if (!validated.ok) {
    state.limitations.push({ tool: 'planTurn', kind: 'failed', text: validated.error });
    state.plan = { workflow: 'none', goal: 'invalid', retrieve: false, requiredSources: [], optionalSources: [], tools: [], completion: [] };
  } else {
    state.plan = validated.plan;
  }
  state.stage = 'planned';
  return recordTrace(state, 'plan', state.plan.workflow);
}

function recallLayeredMemory(state) {
  if (state.memoryLoadError) return 'memory_failed';
  const loaded = parseMemoryStore(state.stores?.memories ?? []);
  if (!loaded.ok) {
    state.memoryLoadError = loaded.error;
    state.memory = [];
    state.memoryMeta = { kept: 0, omitted: 0 };
    return 'memory_failed';
  }
  const recalled = searchMemories(loaded, state.message, {
    agent: state.slug,
    now: state.now instanceof Date ? state.now : new Date(state.now),
    domain: state.plan?.domain,
    limit: 8
  });
  state.memory = recalled.items;
  state.memoryMeta = { kept: recalled.kept, omitted: recalled.omitted };
  return `memory=${recalled.kept}`;
}

const WIDEN_TOOLS = new Set([
  'search_knowledge', 'search_teaching', 'search_medical_records',
  'search_diary_records', 'search_mind_records', 'search_nutrition_records',
  'search_skincare_records'
]);

function plannedRetrieveNames(state) {
  const names = [...(state.plan.requiredSources ?? [])];
  const stated = state.slug === 'clare' ? statedPlannerInputs(state.message) : null;
  if (state.slug === 'clare' && ((state.stores.lessons ?? []).length || stated?.energy || stated?.capacity_minutes)) {
    names.push('plan_work');
  }
  if (state.slug === 'clare') names.push('get_tasks_open_loops');
  if (state.slug === 'chadwick' && !names.includes('get_training_volume')) names.push('get_training_volume');
  if (state.slug === 'chadwick' && !names.includes('analyse_training_evidence')) names.push('analyse_training_evidence');
  if (state.slug === 'clementine' && ((state.stores.classes ?? []).length || (state.stores.lessons ?? []).length)) {
    names.push('search_teaching');
  }
  return names;
}

function doRetrieve(state) {
  if (!state.plan?.retrieve) {
    state.stage = 'retrieved';
    return recordTrace(state, 'retrieve', 'skipped');
  }
  const queued = state.nextRetrievals?.length
    ? state.nextRetrievals.map(item => (typeof item === 'string' ? { tool: item } : item))
    : plannedRetrieveNames(state).map(tool => ({ tool }));
  state.nextRetrievals = [];
  const defer = (state.retrieveRound ?? 0) === 0 ? (state.deferredTools ?? []) : [];
  for (const item of queued) {
    const name = item.tool;
    if (defer.includes(name)) {
      state.nextRetrievals.push({ tool: name });
      continue;
    }
    if (state.evidence[name] && item.limit == null) continue;
    if (item.limit != null) state.retrievalLimits = { ...(state.retrievalLimits ?? {}), [name]: item.limit };
    state.evidence[name] = runTool(name, state.stores, state.today, state.now, state.message, {
      limit: state.retrievalLimits?.[name]
    });
  }
  const memoryNote = recallLayeredMemory(state);
  if (state.slug === 'hammond' && state.plan?.workflow === 'cross_hub_supervision' && !(state.handoffs ?? []).length) {
    runHammondDelegation(state, runAgentKernel);
  }
  state.retrieveRound = (state.retrieveRound ?? 0) + 1;
  state.stage = 'retrieved';
  return recordTrace(state, 'retrieve', `round=${state.retrieveRound}|${Object.keys(state.evidence).join(',')}|${memoryNote}|handoffs=${(state.handoffs ?? []).length}`);
}

function limitationFor(tool, result) {
  if (result == null) return { tool, kind: 'missing', text: `${tool} returned nothing` };
  if (result.ok === false || result.error) {
    return { tool, kind: 'failed', text: String(result.error || `${tool} failed`) };
  }
  if (result.truncated) {
    return { tool, kind: 'truncated', text: `${tool} truncated kept=${result.kept ?? '?'} omitted=${result.omitted ?? '?'}` };
  }
  if (result.conflict) return { tool, kind: 'conflict', text: result.conflict.kind || 'conflict' };
  return null;
}

export function assessEvidence(state) {
  const coverage = { missing: [], truncated: [], failed: [] };
  const conflicts = [];
  const limitations = [];

  for (const [tool, result] of Object.entries(state.evidence)) {
    const limit = limitationFor(tool, result);
    if (limit) {
      limitations.push(limit);
      if (limit.kind === 'missing') coverage.missing.push(tool);
      if (limit.kind === 'failed') coverage.failed.push(tool);
      if (limit.kind === 'truncated') coverage.truncated.push(tool);
      if (limit.kind === 'conflict') conflicts.push(limit);
    }
  }

  const snap = state.evidence.get_fitness_snapshot;
  if (state.plan?.workflow === 'training_review') {
    if (!snap || snap.ok === false) {
      limitations.push({ tool: 'get_fitness_snapshot', kind: 'missing', text: 'Fitness snapshot unavailable' });
      coverage.missing.push('get_fitness_snapshot');
    } else if (!snap.last_completed_date) {
      limitations.push({
        tool: 'get_fitness_snapshot',
        kind: 'missing',
        text: 'No completed sessions in the loaded window'
      });
      coverage.missing.push('completed_sessions');
    }
    const compare = state.evidence.compare_workout_windows;
    if (compare && compare.ok !== false && (compare.previous?.count === 0 || compare.current?.count === 0)) {
      limitations.push({
        tool: 'compare_workout_windows',
        kind: 'missing',
        text: 'A comparison window has no sessions'
      });
      coverage.missing.push('compare_window');
    }
    if ((state.plan.requiredSources ?? []).includes('get_pain_training_summary')) {
      const pain = state.evidence.get_pain_training_summary;
      if (!pain || pain.ok === false) {
        limitations.push({ tool: 'get_pain_training_summary', kind: 'missing', text: 'Pain summary unavailable' });
        coverage.missing.push('pain');
      }
    }
  }

  if (state.plan?.workflow === 'daily_focus') {
    const focus = state.evidence.get_tasks_focus;
    if (!focus || focus.ok === false || focus.error) {
      limitations.push({
        tool: 'get_tasks_focus',
        kind: 'failed',
        text: focus?.error || 'Tasks store unavailable'
      });
      coverage.failed.push('tasks');
    }
  }

  if (state.plan?.workflow === 'health_timeline') {
    const trend = state.evidence.get_weight_trend;
    if (trend && trend.ok !== false && trend.found === false) {
      limitations.push({
        tool: 'get_weight_trend',
        kind: 'missing',
        text: 'No weight records in the loaded window'
      });
      coverage.missing.push('weight_records');
    }
    const medical = state.evidence.search_medical_records;
    if (medical && medical.ok !== false && (medical.count ?? 0) === 0) {
      limitations.push({
        tool: 'search_medical_records',
        kind: 'missing',
        text: 'No matching medical visits'
      });
      coverage.missing.push('medical_visits');
    }
  }

  if (state.plan?.workflow === 'lesson_diagnosis') {
    const ctx = state.evidence.get_teaching_context;
    if (ctx && ctx.ok !== false && !ctx.lesson) {
      limitations.push({
        tool: 'get_teaching_context',
        kind: 'missing',
        text: 'No matching lesson in the loaded teaching window'
      });
      coverage.missing.push('lesson');
    }
  }

  if (state.plan?.workflow === 'knowledge_research') {
    const notes = state.evidence.search_knowledge;
    if (notes && notes.ok !== false && (notes.count ?? 0) === 0) {
      limitations.push({
        tool: 'search_knowledge',
        kind: 'missing',
        text: 'No archive notes matched the query'
      });
      coverage.missing.push('knowledge_notes');
    }
  }

  if (state.plan?.workflow === 'nutrition_adherence') {
    const snap = state.evidence.get_nutrition_snapshot;
    const mealsToday = snap?.meals_today;
    const mealCount = Array.isArray(mealsToday)
      ? mealsToday.length
      : (typeof mealsToday === 'number' ? mealsToday : 0);
    if (snap && snap.ok !== false && mealCount === 0) {
      limitations.push({
        tool: 'get_nutrition_snapshot',
        kind: 'missing',
        text: 'No meals logged today'
      });
      coverage.missing.push('meals_today');
    }
  }

  if (state.plan?.workflow === 'routine_response') {
    const adherence = state.evidence.get_skincare_adherence;
    if (adherence && adherence.ok !== false && (adherence.days_with_log ?? 0) === 0) {
      limitations.push({
        tool: 'get_skincare_adherence',
        kind: 'missing',
        text: 'No skincare logs in the lookback window'
      });
      coverage.missing.push('skincare_logs');
    }
  }

  if (state.plan?.workflow === 'diary_recurrence') {
    const diary = state.evidence.search_diary_records;
    if (diary && diary.ok !== false && (diary.count ?? 0) === 0) {
      limitations.push({
        tool: 'search_diary_records',
        kind: 'missing',
        text: 'No diary hits for this query'
      });
      coverage.missing.push('diary_hits');
    }
  }

  if (state.plan?.workflow === 'mind_reflection') {
    const compare = state.evidence.compare_mind_sessions;
    if (compare && compare.ok !== false && (compare.recent_sessions?.length ?? 0) === 0) {
      limitations.push({
        tool: 'compare_mind_sessions',
        kind: 'missing',
        text: 'No mind sessions in the loaded window'
      });
      coverage.missing.push('mind_sessions');
    }
  }

  if (state.plan?.workflow === 'cross_hub_supervision') {
    const signals = state.evidence.inspect_hub_signals;
    const unavailable = [
      ...(signals?.unavailable ?? []),
      ...(state.evidence.get_hammond_attention_pack?.unavailable_hubs ?? [])
    ];
    for (const item of unavailable) {
      limitations.push({
        tool: 'inspect_hub_signals',
        kind: 'unavailable',
        text: `${item.hub}:${item.error || 'unavailable'}`
      });
      coverage.failed.push(item.hub);
    }
    for (const handoff of state.handoffs ?? []) {
      if (handoff.status === 'open') {
        limitations.push({
          tool: `handoff_${handoff.to}`,
          kind: 'open_handoff',
          text: `Handoff to ${handoff.to} is open (${handoff.reason || 'no return'})`
        });
        coverage.missing.push(`handoff_${handoff.to}`);
      }
    }
    if (!(state.handoffs ?? []).length) {
      limitations.push({
        tool: 'handoff',
        kind: 'missing',
        text: 'No specialist handoffs were requested'
      });
      coverage.missing.push('handoffs');
    }
  }

  if (state.memoryLoadError) {
    limitations.push({
      tool: 'layered_memory',
      kind: 'failed',
      text: 'Layered memory store unavailable'
    });
    coverage.failed.push('layered_memory');
  } else if ((state.memoryMeta?.omitted ?? 0) > 0) {
    limitations.push({
      tool: 'layered_memory',
      kind: 'truncated',
      text: `Memory recall truncated kept=${state.memoryMeta.kept} omitted=${state.memoryMeta.omitted}`
    });
    coverage.truncated.push('layered_memory');
  }

  const required = state.plan?.requiredSources ?? [];
  const requiredPresent = required.every(tool => {
    const result = state.evidence[tool];
    return result && result.ok !== false && !result.error;
  });
  const namedGaps = limitations.length > 0;
  state.coverage = coverage;
  state.conflicts = conflicts;
  state.limitations = limitations;
  state.sufficient = requiredPresent && (state.plan?.workflow === 'training_review' ? Boolean(snap?.last_completed_date) : requiredPresent);
  state.complete = state.sufficient && coverage.truncated.length === 0 && conflicts.length === 0 && coverage.missing.length === 0;
  state.continuationTools = [...new Set([...coverage.truncated, ...coverage.missing, ...coverage.failed])];
  state.honest = state.sufficient || namedGaps;
  const next = [];
  for (const tool of coverage.truncated) {
    if (!WIDEN_TOOLS.has(tool)) continue;
    const result = state.evidence[tool];
    const kept = Number(result?.kept ?? result?.results?.length ?? 0);
    const omitted = Number(result?.omitted ?? 0);
    if (omitted > 0) next.push({ tool, limit: Math.min(20, Math.max(kept + omitted, kept + 4)) });
  }
  for (const tool of required) {
    if (!state.evidence[tool]) next.push({ tool });
  }
  state.nextRetrievals = next;
  if (!state.complete && !next.length) state.exhausted = true;
  state.stage = 'assessed';
  return recordTrace(state, 'assess', state.complete ? 'complete' : `gaps=${limitations.map(item => item.kind).join(',') || 'none'}`);
}

export function resolveConflict(state) {
  const resolved = [];
  for (const item of state.conflicts ?? []) {
    const result = state.evidence[item.tool];
    if (item.tool === 'get_weight_trend' && result?.latest?.date && result?.previous?.date) {
      if (result.conflict && typeof result.conflict === 'object') {
        result.conflict = {
          ...result.conflict,
          resolved: true,
          method: 'recency',
          winner_date: result.latest.date,
          winner_kg: result.latest.weight_kg
        };
      }
      resolved.push({ ...item, resolved: true, method: 'recency' });
      continue;
    }
    if (result?.conflict && typeof result.conflict === 'object') {
      result.conflict = { ...result.conflict, resolved: false, method: 'unresolved' };
    }
    resolved.push({ ...item, resolved: false, method: 'unresolved' });
  }
  state.conflicts = resolved;
  state.unresolvedConflicts = resolved.filter(item => !item.resolved);
  state.stage = 'resolved';
  return recordTrace(state, 'resolve', `${state.unresolvedConflicts.length} unresolved / ${resolved.length} total`);
}

function doCompose(state) {
  const composed = composeEvidenceClaims(state.evidence);
  state.claims = composed.claims;
  for (const limit of composed.limitations) {
    if (!state.limitations.some(item => item.tool === limit.tool && item.kind === limit.kind)) {
      state.limitations.push(limit);
    }
  }
  state.complete = state.complete && composed.complete === true && state.limitations.length === 0;
  const claimLines = state.claims.map(claim => {
    const prov = claim.provenance;
    const cite = prov
      ? ` store=${prov.store || 'unknown'} id=${prov.recordId || 'none'} authority=${prov.authority}`
      : '';
    return `- ${claim.text} (via ${claim.tool}, ${claim.kind}${cite})`;
  });
  const limitLines = state.limitations.map(item => `- [${item.kind}] ${item.text}`);
  state.promptBlock = [
    `Agent kernel turn ${state.id}`,
    `Workflow: ${state.plan?.workflow} — ${state.plan?.goal}`,
    `Stage: ${state.stage} · sufficient=${state.sufficient} · complete=${state.complete}`,
    `Stores: ${Object.keys(state.evidence).join(', ') || 'none'}`,
    'Claims:',
    ...(claimLines.length ? claimLines : ['- none']),
    'Limitations:',
    ...(limitLines.length ? limitLines : ['- none']),
    memoryPromptBlock(state.memory, state.memoryMeta),
    handoffPromptBlock(state.handoffs),
    state.complete
      ? 'Coverage is complete for the planned sources.'
      : 'Coverage is incomplete. Name every material limitation. Do not give a clean-sounding conclusion from missing, failed, truncated, or conflicted evidence.'
  ].join('\n');
  const pain = state.claims.some(claim => claim.fact === 'pain_site' || claim.fact === 'pain_flag_count' || claim.fact === 'pain_site_count');
  const overdue = state.claims.some(claim => claim.fact === 'overdue_title');
  const collisions = Number(state.claims.find(claim => claim.fact === 'collision_count')?.value ?? 0) > 0;
  const workflow = state.plan?.workflow;
  const weightConflict = state.limitations.some(item => item.kind === 'conflict' && item.tool === 'get_weight_trend');
  const medicalHits = Number(state.claims.find(claim => claim.tool === 'search_medical_records' && claim.fact === 'result_count')?.value ?? 0);
  const lessonTitle = state.claims.find(claim => claim.fact === 'lesson_title')?.value;
  const noteCount = Number(state.claims.find(claim => claim.tool === 'search_knowledge' && claim.fact === 'result_count')?.value ?? 0);
  const mealsToday = state.coverage.missing.includes('meals_today');
  const skinLogs = state.coverage.missing.includes('skincare_logs');
  const diaryHits = state.coverage.missing.includes('diary_hits');
  const mindSessions = state.coverage.missing.includes('mind_sessions');
  state.interpretationBlock = [
    'Kernel interpretation (authoritative for this turn):',
    '- Claims above are retrieved or calculated from Life Hub stores. Do not invent extra rows.',
    '- Limitations outrank a tidy narrative. If a required source failed or is empty, say so.',
    workflow === 'training_review'
      ? (pain
        ? '- Active pain evidence is present. Do not programme or recommend as if that constraint is absent.'
        : '- No pain claim was retrieved this turn. Do not invent a pain constraint.')
      : '',
    workflow === 'daily_focus'
      ? (overdue
        ? `- Overdue work is present (${state.claims.find(claim => claim.fact === 'overdue_title')?.value}). Do not ignore it when naming the next move.`
        : '- No overdue title was retrieved. Do not invent one.')
      : '',
    workflow === 'daily_focus' && collisions
      ? '- Teaching and tasks collide on the planned day. Do not present the day as an empty workday from 08:00.'
      : '',
    workflow === 'health_timeline'
      ? (weightConflict
        ? '- Weight readings conflict. Do not treat them as one clean trend.'
        : medicalHits
          ? '- Medical hits are retrieved records. Do not invent extra visits or results.'
          : '- No matching medical visits were retrieved. Do not invent an appointment or lab result.')
      : '',
    workflow === 'lesson_diagnosis'
      ? (lessonTitle
        ? `- Lesson context is ${lessonTitle}. Diagnose that lesson; do not invent another class.`
        : '- No matching lesson was retrieved. Do not invent a class, unit, or hinge.')
      : '',
    workflow === 'knowledge_research'
      ? (noteCount
        ? '- Archive notes were retrieved. Distinguish them from new synthesis. Never invent pages.'
        : '- No archive notes matched. Do not invent a page or citation.')
      : '',
    workflow === 'nutrition_adherence'
      ? (mealsToday
        ? '- No meals are logged today. Do not claim adherence or remaining macros as if the day is complete.'
        : '- Intake claims must come from logged meals. Missing days stay missing.')
      : '',
    workflow === 'routine_response'
      ? (skinLogs
        ? '- No skincare logs in the window. Do not claim the routine is helping.'
        : '- Response claims need logged notes. Adherence is not the same as improvement.')
      : '',
    workflow === 'diary_recurrence'
      ? (diaryHits
        ? '- No diary hits. Do not invent a recurring feeling or pattern.'
        : '- Recurrence must be grounded in retrieved diary hits. One entry is not a pattern.')
      : '',
    workflow === 'mind_reflection'
      ? (mindSessions
        ? '- No mind sessions were retrieved. Do not invent a longitudinal pattern.'
        : '- Interpret only from retrieved sessions. Do not diagnose beyond those records.')
      : '',
    workflow === 'cross_hub_supervision'
      ? '- Cross-hub synthesis is only as good as verified specialist returns.'
      : '',
    ...(workflow === 'cross_hub_supervision' ? handoffInterpretationLines(state.handoffs) : []),
    ...memoryInterpretationLines(state.memory)
  ].filter(Boolean).join('\n');
  state.answer = {
    claims: state.claims,
    limitations: state.limitations,
    sufficient: state.sufficient,
    complete: state.complete
  };
  state.stage = 'composed';
  return recordTrace(state, 'compose', `${state.claims.length} claims / ${state.limitations.length} limitations`);
}

export function proposeAction(state, action) {
  const key = action?.idempotencyKey || `${state.id}:action:${action?.intent || 'unknown'}`;
  if (state.idempotencyKeys.includes(key)) {
    return { state, duplicate: true, action: state.actions.find(item => item.idempotencyKey === key) ?? null };
  }
  const entry = {
    ...action,
    id: action?.id || `act_${state.id.slice(0, 8)}_${state.actions.length}`,
    turnId: state.id,
    idempotencyKey: key,
    status: 'pending',
    snapshot: action?.snapshot ?? null
  };
  state.idempotencyKeys.push(key);
  state.actions.push(entry);
  state.stage = 'proposed';
  recordTrace(state, 'action', entry.intent || 'propose');
  return { state, duplicate: false, action: entry };
}

export const MAX_RETRIEVE_ROUNDS = 3;

export function runAgentKernel(input = {}) {
  const state = input.state ?? createTurnState(input);
  if (input.stores) state.stores = input.stores;
  else if (!state.stores) state.stores = emptyStores();
  if (input.deferTools && !(state.deferredTools ?? []).length) state.deferredTools = [...input.deferTools];
  const persist = input.persist;

  const halt = stage => {
    state.halted = stage;
    persist?.save?.(state);
    return state;
  };

  if (!stageCompleted(state, 'plan')) {
    if (input.failAt === 'plan') return halt('plan');
    doPlan(state);
    persist?.save?.(state);
  }

  if (state.plan?.retrieve !== false) {
    while ((state.retrieveRound ?? 0) < MAX_RETRIEVE_ROUNDS) {
      const before = state.retrieveRound ?? 0;
      if (!stageCompleted(state, 'retrieve') || (before > 0 && (state.nextRetrievals ?? []).length)) {
        if (input.failAt === 'retrieve' && before === 0 && Object.keys(state.evidence).length === 0) {
          return halt('retrieve');
        }
        doRetrieve(state);
        persist?.save?.(state);
      }
      if (input.failAt === 'assess' && state.stage === 'retrieved') return halt('assess');
      assessEvidence(state);
      persist?.save?.(state);
      if ((state.conflicts ?? []).length) resolveConflict(state);
      else {
        state.stage = 'resolved';
        recordTrace(state, 'resolve', '0 conflicts');
      }
      persist?.save?.(state);
      if (state.complete || state.exhausted || !(state.nextRetrievals ?? []).length) break;
      state.stage = 'retrieved';
    }
  } else if (!stageCompleted(state, 'retrieve')) {
    doRetrieve(state);
    assessEvidence(state);
    resolveConflict(state);
  }

  if (input.failAt === 'compose') return halt('compose');
  if (input.failAt === 'action') {
    persist?.save?.(state);
    return halt('action');
  }
  doCompose(state);
  persist?.save?.(state);
  return state;
}

function stageCompleted(state, stage) {
  const order = {
    idle: -1,
    planned: 0,
    retrieved: 1,
    assessed: 2,
    resolved: 3,
    composed: 4,
    proposed: 4
  };
  return (order[state.stage] ?? -1) >= STAGES.indexOf(stage);
}

export function resumeAgentKernel(state, input = {}) {
  return runAgentKernel({ ...input, state, failAt: input.failAt ?? null });
}

export function selectKernelTools(tools, planned = []) {
  const allow = new Set([...planned, ...WRITE_GATEWAY_TOOLS]);
  return (tools ?? []).filter(tool => tool?.name && allow.has(tool.name));
}

export function applyKernelToTurn({
  slug,
  message,
  today,
  now = new Date(),
  stores,
  sourceMeta,
  tools = [],
  env = {},
  flag
} = {}) {
  if (!agentKernelEnabled({ env, flag, slug })) {
    return { enabled: false, tools, forceToolChoice: null, promptBlock: '', interpretationBlock: '', kernel: null };
  }
  const kernel = runAgentKernel({ slug, message, today, now, stores, sourceMeta });
  if (kernel.plan?.workflow === 'none') {
    return { enabled: true, tools, forceToolChoice: false, promptBlock: '', interpretationBlock: '', kernel };
  }
  return {
    enabled: true,
    tools: selectKernelTools(tools, kernel.plan.tools),
    forceToolChoice: !kernel.sufficient && kernel.continuationTools.length > 0,
    promptBlock: kernel.promptBlock,
    interpretationBlock: kernel.interpretationBlock,
    kernel
  };
}

export function kernelTraceEvent(kernel) {
  if (!kernel) return null;
  return {
    type: 'kernel_trace',
    turnId: kernel.id,
    workflow: kernel.plan?.workflow ?? null,
    sufficient: kernel.sufficient,
    complete: kernel.complete,
    tools: Object.keys(kernel.evidence ?? {}),
    limitationKinds: [...new Set((kernel.limitations ?? []).map(item => item.kind))],
    stages: (kernel.trace ?? []).map(item => item.stage),
    memoryKept: kernel.memoryMeta?.kept ?? 0,
    memoryOmitted: kernel.memoryMeta?.omitted ?? 0,
    handoffs: (kernel.handoffs ?? []).map(item => ({ to: item.to, status: item.status, reason: item.reason })),
    retrieveRounds: kernel.retrieveRound ?? 0,
    requiredSources: kernel.plan?.requiredSources ?? [],
    claims: (kernel.claims ?? []).map(claim => ({
      fact: claim.fact,
      tool: claim.tool,
      provenance: claim.provenance ?? null
    })),
    conflicts: kernel.conflicts ?? [],
    unresolvedConflicts: kernel.unresolvedConflicts ?? [],
    limitations: (kernel.limitations ?? []).map(item => ({ kind: item.kind, tool: item.tool })),
    exhausted: kernel.exhausted === true,
    actions: (kernel.actions ?? []).map(item => ({
      intent: item.intent,
      status: item.status,
      idempotencyKey: item.idempotencyKey
    })),
    continuation: kernel.continuation
      ? { status: kernel.continuation.status, reason: kernel.continuation.reason ?? null }
      : null,
    writeOutcome: kernel.writeOutcome
      ? { ok: kernel.writeOutcome.ok === true }
      : null
  };
}
