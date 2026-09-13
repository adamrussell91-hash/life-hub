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
  inspectHubSignals,
  statedTeachingConstraints
} from './domain-retrieval.mjs';
import {
  getTasksOpenLoops,
  getNutritionDayRemaining,
  compareNutritionPeriods,
  compareDiaryPeriods,
  extractDiaryThemes,
  compareMindSessions,
  getSkincareResponseEvidence,
  getTeachingDiagnosis,
  getKnowledgeSynthesis,
  getHammondAttentionPack,
  analyseNutritionEvidence,
  analyseSkincareEvidence,
  analyseDiaryEvidence,
  analyseMindEvidence,
  penelopeSemanticRetrievalGate,
  skippedDiarySemanticSearch,
  skippedDiaryThemeExtraction
} from './domain-analysis.mjs';
import { getWeekReview } from './hammond-week.mjs';
import {
  executeHammondProductivity,
  isHammondProductivityTool
} from './hammond-productivity.mjs';
import { searchMedicalRecords, briefMedicalAppointment, analyseMedicalEvidence, statedHealthConstraints } from './medical-overview-read.mjs';
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
  // Domain Confirm writes must survive kernel tool trim — otherwise a photo
  // lunch / "log it" turn can retrieve nutrition evidence and still have no
  // log_entry, so nothing reaches Nutrition graphs after Confirm.
  'log_entry',
  'delete_meal',
  'record_visual_evidence',
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
  'substitute', 'swap', 'replace', 'replacement', 'instead', 'option',
  'bench', 'press', 'progression'
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
  'bloods', 'visit', 'clinic', 'gp', 'doctor', 'symptom', 'symptoms', 'medication',
  'medications', 'meds', 'body', 'unusual', 'history', 'pathology', 'lab', 'labs',
  'brief', 'result', 'results', 'compare', 'trend'
]);
const LESSON = new Set([
  'lesson', 'lessons', 'class', 'unit', 'teach', 'teaching', 'improve',
  'hinge', 'tomorrow', 'today', 'curriculum', 'year', 'pupil', 'student', 'repair',
  'prepare', 'preparation', 'intention', 'intentions', 'outcome', 'outcomes',
  'sequence', 'follow', 'following', 'missing', 'gap', 'gaps', 'next', 'previous',
  'planned', 'schedule', 'scheduled', 'resources', 'period', 'timetable'
]);
const KNOW = new Set([
  'know', 'notes', 'note', 'archive', 'research', 'already', 'corpus', 'knowledge',
  'synthesis', 'topic', 'about', 'theme', 'themes', 'connect', 'connected', 'link',
  'links', 'disagree', 'conflict', 'evidence', 'project', 'written', 'wrote', 'gap',
  'gaps', 'related', 'bridge', 'idea', 'ideas'
]);
const FOOD = new Set([
  'eat', 'ate', 'eaten', 'meal', 'meals', 'nutrition', 'calorie', 'calories',
  'macro', 'macros', 'adherence', 'logged', 'protein', 'diet', 'food',
  'eating', 'intake', 'targets', 'target', 'remaining', 'left', 'miss',
  'hitting', 'lately', 'breakfast', 'lunch', 'dinner', 'snack', 'dessert', 'week'
]);
const SKIN = new Set([
  'skin', 'routine', 'helping', 'product', 'flare', 'breakout', 'skincare',
  'treatment', 'cream', 'serum', 'recently', 'used', 'use', 'irritation',
  'response', 'adherence', 'reaction', 'face', 'moisturizer'
]);
const DIARY = new Set([
  'diary', 'feeling', 'often', 'pattern', 'patterns', 'recur', 'recurrence',
  'journal', 'mood', 'felt', 'like', 'themes', 'theme', 'before', 'entries',
  'entry', 'emotional', 'anxious', 'feelings'
]);
const MIND = new Set([
  'session', 'sessions', 'reflect', 'reflection', 'therapy', 'mind',
  'longitudinal', 'pattern', 'patterns', 'across', 'themes', 'theme',
  'changed', 'discuss', 'discussed', 'disagree', 'therapist', 'clinical'
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
    const required = ['get_body_state', 'get_weight_trend', 'search_medical_records', 'analyse_medical_evidence'];
    if (appointment) required.push('brief_medical_appointment');
    const stated = statedHealthConstraints(message);
    return validatePlan({
      workflow: 'health_timeline',
      goal: appointment
        ? 'Brief the appointment from medical records with provenance'
        : 'Build a health timeline from body, weight, and medical records without temporal leakage',
      domain: 'health',
      requiredSources: required,
      optionalSources: [],
      tools: [...required],
      risk: 'high',
      writeIntent: false,
      retrieve: true,
      completion: ['body_or_named_gap', 'medical_or_named_gap'],
      statedConstraints: {
        current_symptom: stated.current_symptom
      }
    });
  }

  if (slug === 'ann' && !greetingOnly && hits(words, LESSON)) {
    const stated = statedTeachingConstraints(message);
    const dayFocus = stated.wantsToday || stated.wantsTomorrow || stated.wantsNext;
    return validatePlan({
      workflow: 'lesson_diagnosis',
      goal: dayFocus
        ? 'Resolve what is scheduled and what comes next from Teaching Hub records'
        : stated.wantsGaps
          ? 'Diagnose stored lesson gaps before proposing a repair'
          : 'Diagnose the lesson from class, unit, and calendar context before proposing a repair',
      domain: 'teaching',
      requiredSources: ['search_teaching', 'get_teaching_context', 'get_teaching_diagnosis'],
      optionalSources: [],
      tools: ['search_teaching', 'get_teaching_context', 'get_teaching_diagnosis'],
      risk: 'low',
      writeIntent: false,
      retrieve: true,
      completion: ['context_or_named_gap'],
      statedConstraints: {
        minutes: stated.minutes,
        classHint: stated.classHint,
        yearHint: stated.yearHint
      }
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
      requiredSources: [
        'get_nutrition_snapshot',
        'get_nutrition_adherence',
        'get_nutrition_day_remaining',
        'analyse_nutrition_evidence'
      ],
      optionalSources: ['get_nutrition_targets', 'compare_nutrition_periods', 'search_nutrition_records'],
      tools: [
        'get_nutrition_snapshot', 'get_nutrition_adherence', 'get_nutrition_day_remaining',
        'analyse_nutrition_evidence', 'get_nutrition_targets', 'compare_nutrition_periods',
        'search_nutrition_records'
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
      requiredSources: [
        'get_skincare_adherence',
        'get_skincare_response_evidence',
        'search_skincare_records',
        'analyse_skincare_evidence'
      ],
      optionalSources: [],
      tools: [
        'get_skincare_adherence', 'get_skincare_response_evidence',
        'search_skincare_records', 'analyse_skincare_evidence'
      ],
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
      requiredSources: [
        'search_diary_records',
        'compare_diary_periods',
        'extract_diary_themes',
        'analyse_diary_evidence'
      ],
      optionalSources: ['get_diary_range'],
      tools: [
        'search_diary_records', 'compare_diary_periods', 'extract_diary_themes',
        'analyse_diary_evidence', 'get_diary_range'
      ],
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
      requiredSources: ['search_mind_records', 'compare_mind_sessions', 'analyse_mind_evidence'],
      optionalSources: ['search_diary_records'],
      tools: [
        'search_mind_records', 'compare_mind_sessions', 'analyse_mind_evidence',
        'search_diary_records'
      ],
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

function withStore(result, store) {
  if (!result || typeof result !== 'object') return result;
  return result.store ? result : { store, kind: result.kind ?? 'calculation', ...result };
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
  const query = options.query != null ? String(options.query).trim() : String(message ?? '').trim();
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
      return withStore(planWork('energy', {
        tasks,
        lessons,
        date: today,
        now,
        energy: stated.energy,
        capacity_minutes: stated.capacity_minutes
      }), 'tasks_hub');
    }
    if (stated.capacity_minutes) {
      return withStore(planWork('time_block', {
        tasks,
        lessons,
        date: today,
        now,
        capacity_minutes: stated.capacity_minutes
      }), 'tasks_hub');
    }
    return withStore(planWork('collisions', { tasks, lessons, date: today, now }), 'tasks_hub');
  }
  if (name === 'get_nutrition_snapshot') {
    return getNutritionSnapshot(meals, today, { nutritionChallenges: stores.nutritionChallenges });
  }
  if (name === 'get_nutrition_adherence') return getNutritionAdherence(meals, today);
  if (name === 'get_nutrition_targets') return getNutritionTargets(today);
  if (name === 'get_nutrition_day_remaining') {
    return getNutritionDayRemaining(meals, today, { nutritionChallenges: stores.nutritionChallenges });
  }
  if (name === 'compare_nutrition_periods') {
    return compareNutritionPeriods(meals, today);
  }
  if (name === 'analyse_nutrition_evidence') {
    return analyseNutritionEvidence(meals, today, {
      nutritionChallenges: stores.nutritionChallenges,
      message
    });
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
  if (name === 'analyse_medical_evidence') {
    return analyseMedicalEvidence(stores.medicalEvents ?? [], {
      today,
      message,
      compositionRecords: stores.composition ?? [],
      measurementRecords: stores.measurements ?? []
    });
  }
  if (name === 'search_teaching') {
    return searchTeaching({
      query: query || message || 'lesson',
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
      query: query || message,
      message,
      now
    });
  }
  if (name === 'get_teaching_diagnosis') {
    return getTeachingDiagnosis({
      classes: stores.classes ?? [],
      lessons,
      units: stores.units ?? [],
      query: query || message,
      message,
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
  if (name === 'analyse_skincare_evidence') {
    return analyseSkincareEvidence(stores.skincare ?? [], today, { message });
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
  if (name === 'analyse_diary_evidence') {
    return analyseDiaryEvidence(stores.mindEvents ?? [], today, { message, query: query || message });
  }
  if (name === 'get_diary_range') {
    const from = `${String(today).slice(0, 8)}01`;
    const range = getDiaryRange(stores.mindEvents ?? [], { from, to: today, limit: 12 });
    if (options.contextOnly && range && typeof range === 'object') {
      return {
        ...range,
        context_only: true,
        role: 'context_only',
        how_to_read:
          (range.how_to_read ? `${range.how_to_read} ` : '')
          + 'Context-only recent diary range — not semantic recurrence matches and not a referent.'
      };
    }
    return range;
  }
  if (name === 'search_mind_records') {
    return searchMindRecords(stores.mindEvents ?? [], { query: query || 'session', limit: limit ?? 10 });
  }
  if (name === 'compare_mind_sessions') return compareMindSessions(stores.mindEvents ?? [], today);
  if (name === 'analyse_mind_evidence') {
    return analyseMindEvidence(stores.mindEvents ?? [], today, { message, query: query || message });
  }
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
  if (isHammondProductivityTool(name)) {
    return executeHammondProductivity(name, options.input ?? {}, {
      tasks,
      projects: stores.projects ?? [],
      areas: stores.areas ?? [],
      goals: stores.goals ?? [],
      sessions: stores.workSessions ?? [],
      blocks: stores.workBlocks ?? [],
      planning_profile: stores.planningProfile ?? null,
      planning_direction: stores.planningDirection ?? null
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
    retrieveLog: [],
    sufficiencyDecision: null,
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
  if (state.slug === 'brisket') {
    names.push('compare_nutrition_periods', 'get_nutrition_targets');
    if (/\b(search|find|ate|meal|miss|contribut)/i.test(state.message || '')) {
      names.push('search_nutrition_records');
    }
  }
  if (state.slug === 'penelope') names.push('get_diary_range');
  if (state.slug === 'vera' && /\b(feel|diary|mood)\b/i.test(state.message || '')) {
    names.push('search_diary_records');
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

  // Penelope: resolve recurrence referent before semantic diary search/theme tools.
  let penelopeGate = null;
  if (state.plan?.workflow === 'diary_recurrence') {
    penelopeGate = penelopeSemanticRetrievalGate(state.message);
    state.penelopeRetrievalGate = penelopeGate;
  }

  for (const item of queued) {
    const name = item.tool;
    if (defer.includes(name)) {
      state.nextRetrievals.push({ tool: name });
      continue;
    }
    if (state.evidence[name] && item.limit == null) continue;
    if (item.limit != null) state.retrievalLimits = { ...(state.retrievalLimits ?? {}), [name]: item.limit };

    if (penelopeGate && !penelopeGate.run_semantic_search && name === 'search_diary_records') {
      state.evidence[name] = skippedDiarySemanticSearch(penelopeGate.skip_reason);
      continue;
    }
    if (penelopeGate && !penelopeGate.run_theme_extraction && name === 'extract_diary_themes') {
      state.evidence[name] = skippedDiaryThemeExtraction(penelopeGate.skip_reason);
      continue;
    }

    const toolOpts = { limit: state.retrievalLimits?.[name] };
    if (
      penelopeGate?.search_query
      && (name === 'search_diary_records' || name === 'extract_diary_themes')
    ) {
      toolOpts.query = penelopeGate.search_query;
    }
    if (penelopeGate && !penelopeGate.run_semantic_search && name === 'get_diary_range') {
      toolOpts.contextOnly = true;
    }

    state.evidence[name] = runTool(name, state.stores, state.today, state.now, state.message, toolOpts);
  }
  const memoryNote = recallLayeredMemory(state);
  if (state.slug === 'hammond' && state.plan?.workflow === 'cross_hub_supervision' && !(state.handoffs ?? []).length) {
    runHammondDelegation(state, runAgentKernel);
  }
  state.retrieveRound = (state.retrieveRound ?? 0) + 1;
  const toolEntries = queued
    .filter(item => !defer.includes(item.tool))
    .map(item => boundRetrieveTool(item, state.evidence[item.tool], state.retrieveRound));
  state.retrieveLog = [...(state.retrieveLog ?? []), {
    round: state.retrieveRound,
    tools: toolEntries,
    coverage: null,
    whyAnotherRound: null
  }];
  state.stage = 'retrieved';
  return recordTrace(state, 'retrieve', `round=${state.retrieveRound}|${Object.keys(state.evidence).join(',')}|${memoryNote}|handoffs=${(state.handoffs ?? []).length}`);
}

function boundSourceRefs(result) {
  if (!result || typeof result !== 'object') return [];
  const rows = [
    ...(Array.isArray(result.results) ? result.results : []),
    ...(Array.isArray(result.overdue) ? result.overdue : []),
    ...(Array.isArray(result.due_soon) ? result.due_soon : []),
    result.lesson,
    result.latest
  ].filter(Boolean);
  const refs = [];
  for (const row of rows.slice(0, 6)) {
    if (row.id || row.path) {
      refs.push({
        id: row.id ?? null,
        path: row.path ?? null,
        date: row.date ?? row.due_date ?? null
      });
    }
  }
  if (result.last_completed_id || result.last_completed_path) {
    refs.push({
      id: result.last_completed_id ?? null,
      path: result.last_completed_path ?? null,
      date: result.last_completed_date ?? null
    });
  }
  return refs.slice(0, 6);
}

function boundRetrieveTool(item, result, round) {
  const limit = limitationFor(item.tool, result);
  const skipped = Boolean(result?.skipped);
  return {
    round,
    name: item.tool,
    intent: item.limit != null ? { limit: item.limit } : null,
    kind: skipped
      ? 'skipped'
      : limit?.kind ?? (result == null ? 'missing' : result.ok === false || result.error ? 'failed' : 'ok'),
    status: skipped
      ? 'skipped'
      : result == null ? 'missing' : result.ok === false || result.error ? 'error' : 'ok',
    skipped,
    skip_reason: skipped ? (result.reason ?? null) : null,
    truncated: Boolean(result?.truncated),
    kept: result?.kept ?? null,
    omitted: result?.omitted ?? null,
    sourceRefs: skipped ? [] : boundSourceRefs(result)
  };
}

function limitationFor(tool, result) {
  if (result == null) return { tool, kind: 'missing', text: `${tool} returned nothing` };
  if (result.skipped) return null;
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
    const diagnosis = state.evidence.get_teaching_diagnosis;
    if (ctx && ctx.ok !== false && !ctx.lesson) {
      limitations.push({
        tool: 'get_teaching_context',
        kind: 'missing',
        text: 'No matching lesson in the loaded teaching window'
      });
      coverage.missing.push('lesson');
    }
    if (diagnosis?.diagnosis_gaps?.length && ctx?.lesson) {
      // Gaps are derived evidence, not a retrieve failure — do not force another round.
      coverage.missing = coverage.missing.filter(item => item !== 'lesson');
    }
  }

  if (state.plan?.workflow === 'knowledge_research') {
    const notes = state.evidence.search_knowledge;
    const synthesis = state.evidence.get_knowledge_synthesis;
    if (notes && notes.ok !== false && (notes.count ?? 0) === 0) {
      limitations.push({
        tool: 'search_knowledge',
        kind: 'missing',
        text: 'No archive notes matched the query'
      });
      coverage.missing.push('knowledge_notes');
    }
    if (synthesis?.coverage?.weak_match) {
      limitations.push({
        tool: 'get_knowledge_synthesis',
        kind: 'weak_match',
        text: 'Knowledge matches are lexically weak — do not treat them as strong conceptual links'
      });
    }
    if (synthesis?.conflicts?.length) {
      conflicts.push({
        tool: 'get_knowledge_synthesis',
        kind: 'conflict',
        text: `${synthesis.conflicts.length} note conflict(s) in the retrieved set`
      });
      limitations.push({
        tool: 'get_knowledge_synthesis',
        kind: 'conflict',
        text: `${synthesis.conflicts.length} note conflict(s) stay visible — do not flatten disagreement`
      });
    }
  }

  if (state.plan?.workflow === 'nutrition_adherence') {
    const snap = state.evidence.get_nutrition_snapshot;
    const analysis = state.evidence.analyse_nutrition_evidence;
    const mealsToday = snap?.meals_today;
    const mealCount = Array.isArray(mealsToday)
      ? mealsToday.length
      : (typeof mealsToday === 'number' ? mealsToday : (analysis?.meals_today_count ?? 0));
    if ((snap && snap.ok !== false && mealCount === 0) || analysis?.logging_status === 'no_log_today') {
      limitations.push({
        tool: 'get_nutrition_snapshot',
        kind: 'missing',
        text: 'No meals logged today — missing evidence, not zero intake'
      });
      coverage.missing.push('meals_today');
    }
    if ((analysis?.unlogged_week_days ?? []).length) {
      limitations.push({
        tool: 'analyse_nutrition_evidence',
        kind: 'incomplete_logging',
        text: `${analysis.unlogged_week_days.length} week day(s) have no meal log`
      });
    }
  }

  if (state.plan?.workflow === 'routine_response') {
    const adherence = state.evidence.get_skincare_adherence;
    const analysis = state.evidence.analyse_skincare_evidence;
    if ((adherence && adherence.ok !== false && (adherence.days_with_log ?? 0) === 0) || analysis?.missing_logs) {
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
    const analysis = state.evidence.analyse_diary_evidence;
    const hits = analysis?.supported_match_count ?? analysis?.hit_count ?? diary?.count ?? 0;
    if (analysis?.recurrence_strength === 'unresolved_referent' || analysis?.referent_status === 'unresolved') {
      limitations.push({
        tool: 'analyse_diary_evidence',
        kind: 'unresolved_referent',
        text: 'Deictic recurrence question has no resolvable current-turn referent — not a retrieval-depth problem'
      });
      // Missing referent cannot be fixed by widening feel/felt search.
      coverage.truncated = coverage.truncated.filter(tool => tool !== 'search_diary_records');
    } else if (diary && diary.ok !== false && hits === 0 && !(analysis?.fallback_count > 0)) {
      limitations.push({
        tool: 'search_diary_records',
        kind: 'missing',
        text: 'No diary hits for this query'
      });
      coverage.missing.push('diary_hits');
    }
    if (analysis?.recurrence_strength === 'insufficient_match') {
      limitations.push({
        tool: 'analyse_diary_evidence',
        kind: 'insufficient_match',
        text: 'No supported full diary matches — partial or fallback context only'
      });
    }
    if (analysis?.recurrence_strength === 'single_entry') {
      limitations.push({
        tool: 'analyse_diary_evidence',
        kind: 'weak_match',
        text: 'Only one genuine diary match — not enough for a recurrence pattern'
      });
    }
  }

  if (state.plan?.workflow === 'mind_reflection') {
    const compare = state.evidence.compare_mind_sessions;
    const analysis = state.evidence.analyse_mind_evidence;
    if (
      (compare && compare.ok !== false && (compare.recent_sessions?.length ?? 0) === 0)
      || analysis?.session_count === 0
    ) {
      limitations.push({
        tool: 'compare_mind_sessions',
        kind: 'missing',
        text: 'No mind sessions in the loaded window'
      });
      coverage.missing.push('mind_sessions');
    }
    if (analysis?.sparse) {
      limitations.push({
        tool: 'analyse_mind_evidence',
        kind: 'weak_match',
        text: 'Sparse session records — longitudinal claims stay weak'
      });
    }
    if (analysis?.conflict_signals?.length) {
      conflicts.push({
        tool: 'analyse_mind_evidence',
        kind: 'conflict',
        text: `${analysis.conflict_signals.length} session conflict_signal(s)`
      });
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
    if (omitted <= 0) continue;
    const widenTo = Math.min(20, Math.max(kept + omitted, kept + 4));
    // Already at the bounded max — further rounds cannot resolve truncation.
    if (widenTo <= kept) continue;
    next.push({ tool, limit: widenTo });
  }
  for (const tool of required) {
    if (!state.evidence[tool]) next.push({ tool });
  }
  state.nextRetrievals = next;
  if (!state.complete && !next.length) state.exhausted = true;
  const anotherRound = Boolean(next.length) && !state.complete && !state.exhausted;
  state.sufficiencyDecision = {
    sufficient: state.sufficient,
    complete: state.complete,
    exhausted: state.exhausted === true,
    anotherRound,
    reason: describeSufficiency(state, anotherRound),
    coverage: {
      missing: [...coverage.missing],
      truncated: [...coverage.truncated],
      failed: [...coverage.failed]
    }
  };
  const lastLog = (state.retrieveLog ?? []).at(-1);
  if (lastLog) {
    lastLog.coverage = state.sufficiencyDecision.coverage;
    lastLog.whyAnotherRound = anotherRound
      ? `further bounded retrieve: ${next.map(item => item.tool).join(',')}`
      : state.sufficiencyDecision.reason;
  }
  state.stage = 'assessed';
  return recordTrace(state, 'assess', state.complete ? 'complete' : `gaps=${limitations.map(item => item.kind).join(',') || 'none'}`);
}

function describeSufficiency(state, anotherRound) {
  const required = state.plan?.requiredSources ?? [];
  const present = required.filter(tool => {
    const result = state.evidence[tool];
    return result && result.ok !== false && !result.error;
  });
  const parts = [`required ${present.length}/${required.length} present`];
  const focus = state.evidence.get_tasks_focus;
  if (focus?.truncated) {
    parts.push(`get_tasks_focus truncated kept=${focus.kept ?? '?'} omitted=${focus.omitted ?? '?'}`);
    if (focus.overdue?.length) parts.push('overdue slice present');
    if (focus.due_soon?.length) parts.push('due-soon slice present');
    if (state.evidence.plan_work) parts.push('plan_work retrieved');
    if (state.evidence.get_tasks_open_loops) parts.push('open_loops retrieved');
    if (!anotherRound) {
      parts.push('omitted open items are outside the 12-cap; overdue and due-soon windows already retrieved so another round is not required');
    }
  }
  const diaryAnalysis = state.evidence?.analyse_diary_evidence;
  if (diaryAnalysis?.recurrence_strength === 'unresolved_referent' || diaryAnalysis?.referent_status === 'unresolved') {
    parts.push('unresolved deictic referent — further diary search cannot invent what "this" means');
  }
  if (anotherRound) {
    parts.push(`next=${(state.nextRetrievals ?? []).map(item => item.tool || item).join(',')}`);
  } else if (state.exhausted) {
    parts.push('no further bounded retrieval can resolve remaining gaps');
  } else if (state.sufficient) {
    parts.push('planned sources sufficient for the goal');
  }
  return parts.join('; ');
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

function trainingCauseLines(state) {
  if (state.plan?.workflow !== 'training_review') return [];
  const cause = state.evidence.analyse_training_evidence?.cause;
  if (!cause) return [];
  const unrelated = (cause.unrelated_pain ?? []).map(item => item.site).filter(Boolean).join(', ');
  const historical = (cause.historical_relevant_pain ?? []).map(item => item.site).filter(Boolean).join(', ');
  const lines = [];
  if (cause.status === 'unknown') {
    lines.push('- The reason the requested lift is unavailable is an unknown cause. Do not invent soreness, injury, a prior PR, or a failed session.');
    lines.push('- A recent completed session is stored fact. It is not evidence that pecs, chest, or shoulders are sore today unless Adam said so this turn.');
  } else if (cause.status === 'user_stated') {
    lines.push(`- Adam stated a current-turn reason (${cause.user_stated_reason}). Treat it as user_stated_current_turn, not a stored record.`);
  } else if (cause.status === 'active' || cause.kind === 'current_active_constraint') {
    lines.push(`- An explicit current_active_constraint may explain the requested lift (${cause.stored_reason || cause.current_active_constraint?.site || 'active constraint'}). Do not invent additional causes.`);
  }
  if (historical) {
    lines.push(`- Historical relevant pain (${historical}) is stored context from a past workout flag. It is not a current cause and does not mean that site is sore today.`);
  }
  if (unrelated) {
    lines.push(`- Unrelated stored pain (${unrelated}) is not an explanation for the requested lift.`);
  }
  lines.push('- Offer evidence-compatible substitutions. Ask why the lift is unavailable when that reason would change the recommendation.');
  return lines;
}

function teachingInterpretationLines(state) {
  if (state.plan?.workflow !== 'lesson_diagnosis') return [];
  const lines = [];
  const lessonTitle = state.claims.find(claim => claim.fact === 'lesson_title')?.value;
  const gaps = state.evidence.get_teaching_diagnosis?.diagnosis_gaps ?? [];
  const statedMinutes = state.evidence.get_teaching_context?.stated_constraints?.minutes
    ?? state.evidence.get_teaching_diagnosis?.stated_constraints?.minutes
    ?? state.plan?.statedConstraints?.minutes
    ?? null;
  const nextBasis = state.evidence.get_teaching_diagnosis?.next_in_unit_basis
    ?? state.evidence.get_teaching_context?.next_in_unit_basis
    ?? null;
  const nextScheduled = state.evidence.get_teaching_context?.next_scheduled
    ?? state.evidence.get_teaching_diagnosis?.next_scheduled
    ?? null;
  if (lessonTitle) {
    lines.push(`- Lesson context is ${lessonTitle}. Diagnose that lesson; do not invent another class.`);
  } else {
    lines.push('- No matching lesson was retrieved. Do not invent a class, unit, hinge, or timetable.');
  }
  if (gaps.length) {
    lines.push('- diagnosis_gaps are derived from stored Teaching fields. They are not permission to invent missing content.');
  }
  if (gaps.some(gap => /learning intention/i.test(gap))) {
    lines.push('- No stored learning intention was retrieved. Syllabus outcome_ids are curriculum codes, not learning intentions.');
  }
  if (statedMinutes) {
    lines.push(`- Adam stated a current-turn time budget (${statedMinutes} minutes). Treat it as user_stated_current_turn, not a stored timetable fact.`);
  }
  if (nextBasis === 'unit_lesson_ids') {
    lines.push('- next_in_unit comes from stored unit.lesson_ids order. That is curriculum record fact, not a free-form teaching recommendation.');
  } else if (nextScheduled?.title || nextScheduled?.id) {
    lines.push('- Prefer next_scheduled from the Teaching calendar when answering what comes next.');
  } else {
    lines.push('- Do not invent the next lesson, student needs, assessment deadlines, or prior outcomes.');
  }
  lines.push('- Stored facts: schedule rows, draft titles, blocks, outcome_ids, unit links. Derived: diagnosis_gaps / preparation. Inference: any rewrite beyond those fields. Never describe an outcome code as a learning intention.');
  return lines;
}

function knowledgeInterpretationLines(state) {
  if (state.plan?.workflow !== 'knowledge_research') return [];
  const lines = [];
  const noteCount = Number(state.claims.find(claim => claim.tool === 'search_knowledge' && claim.fact === 'result_count')?.value ?? 0);
  const synthesis = state.evidence.get_knowledge_synthesis;
  if (noteCount) {
    lines.push('- Archive notes were retrieved. Distinguish note facts from derived synthesis. Never invent pages.');
  } else {
    lines.push('- No archive notes matched. Do not invent a page or citation.');
  }
  if (synthesis?.graph_links?.length) {
    lines.push('- graph_links are stored Knowledge connections. Cite both ends.');
  }
  if (synthesis?.inferred_relations?.length) {
    lines.push('- inferred_relations are lexical/tag overlap only. Do not convert them into stored links.');
  }
  if (synthesis?.conflicts?.length) {
    lines.push('- Retrieved notes show conflict_signal disagreement. Keep both sides visible; do not claim a proven contradiction or flatten disagreement.');
  }
  if (synthesis?.themes?.length) {
    lines.push('- Recurring themes are derived across notes. They are not themselves stored page titles.');
  }
  if (synthesis?.coverage?.weak_match) {
    lines.push('- Matches are lexically weak. Do not treat weak overlap as a strong conceptual relationship.');
  }
  if (state.evidence.search_teaching?.count > 0) {
    lines.push('- Teaching bridge hits are Teaching Hub records, not Knowledge pages. Keep store provenance separate.');
  }
  return lines;
}

function saraInterpretationLines(state) {
  if (state.plan?.workflow !== 'health_timeline') return [];
  const lines = [];
  const analysis = state.evidence.analyse_medical_evidence;
  const weightConflict = state.limitations.some(item => item.kind === 'conflict' && item.tool === 'get_weight_trend');
  const medicalHits = Number(state.claims.find(claim => claim.tool === 'search_medical_records' && claim.fact === 'result_count')?.value ?? 0);
  const statedSymptom = analysis?.stated_constraints?.current_symptom
    ?? state.plan?.statedConstraints?.current_symptom
    ?? null;
  if (weightConflict) {
    lines.push('- Weight readings conflict. Do not treat them as one clean trend.');
  }
  if (medicalHits) {
    lines.push('- Medical hits are retrieved dated records. Do not invent extra visits or results.');
  } else {
    lines.push('- No matching medical visits were retrieved. Do not invent an appointment or lab result.');
  }
  if ((analysis?.recent_visit_count ?? 0) > 0) {
    lines.push('- Recent-window visits are recent historical evidence only. Recency does not prove a current symptom, current diagnosis, current medication use, or current abnormality.');
  }
  if ((analysis?.historical_visit_count ?? 0) > 0) {
    lines.push('- Older historical medical visits stay historical. Do not convert them into a present condition, current medication adherence, or current lab result.');
  }
  if ((analysis?.missing_date_count ?? 0) > 0) {
    lines.push('- Some medical records are missing dates. Keep the date missing — do not invent one.');
  }
  if (statedSymptom) {
    lines.push(`- Adam stated a current-turn symptom/context (${statedSymptom}). Treat it as user_stated_current_turn, not a stored Medical Overview fact.`);
  }
  if (analysis?.comparisons?.length) {
    lines.push('- Dated comparisons must preserve both dates. Do not collapse two readings into one undated claim.');
  }
  lines.push('- Current state requires user_stated_current_turn or explicit active stored evidence. Do not use unrelated historical findings as causal explanations. Do not diagnose or prescribe.');
  return lines;
}

function brisketInterpretationLines(state) {
  if (state.plan?.workflow !== 'nutrition_adherence') return [];
  const lines = [];
  const analysis = state.evidence.analyse_nutrition_evidence;
  const status = analysis?.logging_status ?? state.evidence.get_nutrition_snapshot?.logging_status;
  if (status === 'no_log_today' || state.coverage.missing.includes('meals_today')) {
    lines.push('- No meals are logged today. That is missing evidence, not zero intake. Do not claim adherence or remaining macros as if the day is complete.');
  } else if (status === 'partial_day') {
    lines.push('- Today\'s log looks partial. Do not treat partial logging as full-day adherence or as a confirmed target miss.');
  } else {
    lines.push('- Intake claims must come from logged meals only.');
  }
  const week = analysis?.week_adherence;
  if (week && typeof week === 'object') {
    const hits = week.protein_target_hits;
    const logged = week.days_logged;
    const window = week.days_in_window;
    const observed = week.observed_protein_hit_rate_pct ?? week.protein_hit_rate_pct;
    const coverage = week.logging_coverage_pct;
    if (logged === 0) {
      lines.push('- No days were logged in the window. Observed protein hit rate is unavailable — do not report 0% adherence as if zero intake was observed.');
    } else if (week.coverage_status === 'incomplete' || (coverage != null && coverage < 100)) {
      lines.push(
        `- Among logged days, ${hits}/${logged} hit the protein target`
        + (observed != null ? ` (observed hit rate ${observed}%)` : '')
        + `. Only ${logged}/${window} days were logged`
        + (coverage != null ? ` (coverage ${coverage}%)` : '')
        + ', so full-week adherence cannot be established.'
      );
    } else if (observed != null) {
      lines.push(`- Observed protein hit rate among logged days is ${observed}% with full logging coverage in the window.`);
    }
  }
  if ((analysis?.unlogged_week_days ?? []).length) {
    lines.push('- Some recent days have no meal log. Do not infer adherence from incomplete logging and do not invent those meals.');
  }
  if ((analysis?.yesterday_meal_count ?? 0) > 0) {
    lines.push('- Yesterday\'s meals stay on yesterday. Do not convert them into today\'s intake.');
  }
  if (analysis?.week_vs_previous?.comparison_limitation) {
    lines.push(`- Period comparison limitation: ${analysis.week_vs_previous.comparison_limitation}`);
  }
  if (analysis?.below_target_day) {
    lines.push(
      `- On the most recent logged day where recorded protein remained below target (${analysis.below_target_day}), `
      + 'these meals were logged. They are stored meal facts for that date, not proof the day is complete and not a causal explanation of a confirmed miss.'
    );
  } else if (analysis?.below_target_day_basis === 'no_observed_below_target_day') {
    lines.push('- No defensible observed-below-target day was identified. Do not attribute arbitrary meals as contributors to a target miss.');
  }
  if (analysis?.stated_constraints?.current_intake_note) {
    lines.push(`- Adam stated a current-turn intake note (${analysis.stated_constraints.current_intake_note}). Treat it as user_stated_current_turn, not a stored meal row.`);
  }
  lines.push('- Separate stored meal facts, target facts, derived adherence, and derived remaining macros. Do not invent meals or convert planned meals into consumed food.');
  return lines;
}

function hyaluronicaInterpretationLines(state) {
  if (state.plan?.workflow !== 'routine_response') return [];
  const lines = [];
  const analysis = state.evidence.analyse_skincare_evidence;
  if (analysis?.missing_logs || state.coverage.missing.includes('skincare_logs')) {
    lines.push('- No skincare logs in the window. Do not claim the routine is helping.');
  } else {
    lines.push('- Response claims need logged notes. Adherence is not the same as improvement.');
  }
  if ((analysis?.historical_irritation ?? []).length) {
    lines.push('- Historical irritation logs stay historical. Do not describe them as current irritation.');
  }
  if ((analysis?.temporal_associations ?? []).length) {
    lines.push('- Product-before-response timing is temporal association only. Do not claim causation.');
  }
  if (analysis?.stated_constraints?.current_irritation) {
    lines.push(`- Adam stated current-turn irritation (${analysis.stated_constraints.current_irritation}). Treat it as user_stated_current_turn.`);
  }
  lines.push('- Separate stored routine events, stored response events, derived adherence, and inference. Do not infer product effectiveness from adherence alone.');
  return lines;
}

function penelopeInterpretationLines(state) {
  if (state.plan?.workflow !== 'diary_recurrence') return [];
  const lines = [];
  const analysis = state.evidence.analyse_diary_evidence;
  const strength = analysis?.recurrence_strength;
  const supported = analysis?.supported_match_count ?? analysis?.hit_count ?? 0;
  if (strength === 'unresolved_referent' || analysis?.referent_status === 'unresolved') {
    lines.push('- Adam asked a deictic recurrence question, but this turn does not establish what "this" refers to.');
    lines.push('- Do not invent the referent from historical diary entries.');
    lines.push('- Do not report a recurrence pattern.');
    lines.push('- Ask a minimal clarification: what feeling or situation is meant?');
    if ((analysis?.fallback_count ?? 0) > 0) {
      lines.push('- Recent diary entries may appear as context only. They do not resolve the missing referent.');
    }
  } else if (!supported) {
    if ((analysis?.partial_count ?? 0) > 0) {
      lines.push('- No supported full diary matches. Partial token matches are context only and do not establish recurrence.');
    } else if ((analysis?.fallback_count ?? 0) > 0 || strength === 'insufficient_match') {
      lines.push('- No supported recurrence matched the requested feeling, theme, or situation.');
      lines.push('- Recent diary entries retrieved as fallback context are context only. They are not evidence that the requested feeling recurred.');
    } else {
      lines.push('- No diary hits. Do not invent a recurring feeling or pattern.');
    }
  } else if (strength === 'single_entry') {
    lines.push('- One genuine diary match is not a pattern. Keep recurrence weak or absent.');
  } else if (strength === 'weak_recurrence') {
    lines.push('- Recurrence evidence is weak. Do not overstate the pattern.');
  } else if (strength === 'multi_entry_recurrence') {
    lines.push('- Recurrence must stay grounded in genuine retrieved diary matches. Themes are derived frequency, not stored facts.');
  }
  if ((analysis?.partial_count ?? 0) > 0 && supported > 0) {
    lines.push('- Partial token matches remain context only and do not increase recurrence strength.');
  }
  if ((analysis?.fallback_count ?? 0) > 0 && supported > 0) {
    lines.push('- Fallback recent entries remain context only and do not increase recurrence strength.');
  }
  if ((analysis?.conflicting_moods ?? []).length) {
    lines.push('- Diary moods conflict across entries. Keep disagreement visible.');
  }
  if (analysis?.stated_constraints?.current_mood) {
    lines.push(
      `- Adam stated a current-turn mood (${analysis.stated_constraints.current_mood}). `
      + 'Treat it as user_stated_current_turn. Historical matches may be searched for that mood, '
      + 'but historical entries do not establish that the current state came from those past events.'
    );
  } else if (analysis?.referent_kind === 'explicit_query' && analysis?.referent_value) {
    lines.push(`- Recurrence search targets the explicitly named feeling/theme (${analysis.referent_value}).`);
  }
  lines.push('- Do not turn semantic similarity into a stored fact, label patterns as causal, or invent emotional states from unrelated text.');
  return lines;
}

function veraInterpretationLines(state) {
  if (state.plan?.workflow !== 'mind_reflection') return [];
  const lines = [];
  const analysis = state.evidence.analyse_mind_evidence;
  if (!analysis?.session_count) {
    lines.push('- No mind sessions were retrieved. Do not invent a longitudinal pattern.');
  } else if (analysis.sparse) {
    lines.push('- Session records are sparse. Keep longitudinal claims weak.');
  } else {
    lines.push('- Interpret only from retrieved sessions. Recurring themes are derived, not therapist conclusions.');
  }
  if (analysis?.changed_themes?.appeared_recently?.length || analysis?.changed_themes?.not_appeared_recently?.length) {
    lines.push('- Theme change claims must cite recent vs prior session windows.');
  }
  if (analysis?.conflict_signals?.length) {
    lines.push('- Session notes show conflict_signal disagreement. Keep both sides visible; do not flatten.');
  }
  if (analysis?.stated_constraints?.current_theme) {
    lines.push(`- Adam stated a current-turn theme (${analysis.stated_constraints.current_theme}). Do not convert historical session content into a present symptom.`);
  }
  lines.push('- Do not diagnose. Do not invent therapist conclusions. Do not convert therapist notes into current clinical state.');
  return lines;
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
  state.interpretationBlock = [
    'Kernel interpretation (authoritative for this turn):',
    '- Claims above are retrieved or calculated from Life Hub stores. Do not invent extra rows.',
    '- Limitations outrank a tidy narrative. If a required source failed or is empty, say so.',
    workflow === 'training_review'
      ? (pain
        ? '- Active pain evidence is present. Do not programme or recommend as if that constraint is absent. Unrelated pain is not a cause for a different lift.'
        : '- No pain claim was retrieved this turn. Do not invent a pain constraint.')
      : '',
    ...trainingCauseLines(state),
    ...teachingInterpretationLines(state),
    ...knowledgeInterpretationLines(state),
    ...saraInterpretationLines(state),
    ...brisketInterpretationLines(state),
    ...hyaluronicaInterpretationLines(state),
    ...penelopeInterpretationLines(state),
    ...veraInterpretationLines(state),
    workflow === 'daily_focus'
      ? (overdue
        ? `- Overdue work is present (${state.claims.find(claim => claim.fact === 'overdue_title')?.value}). Do not ignore it when naming the next move.`
        : '- No overdue title was retrieved. Do not invent one.')
      : '',
    workflow === 'daily_focus' && collisions
      ? '- Teaching and tasks collide on the planned day. Do not present the day as an empty workday from 08:00.'
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
      kind: claim.kind ?? null,
      provenance: claim.provenance ?? null
    })),
    sufficiencyDecision: kernel.sufficiencyDecision ?? null,
    retrieveLog: (kernel.retrieveLog ?? []).map(round => ({
      round: round.round,
      tools: (round.tools ?? []).map(item => ({
        name: item.name,
        kind: item.kind,
        status: item.status,
        truncated: item.truncated === true,
        kept: item.kept ?? null,
        omitted: item.omitted ?? null,
        sourceRefs: (item.sourceRefs ?? []).slice(0, 6)
      })),
      coverage: round.coverage ?? null,
      whyAnotherRound: round.whyAnotherRound ?? null
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
