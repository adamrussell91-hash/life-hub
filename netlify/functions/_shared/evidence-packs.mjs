/**
 * Server-side evidence packs — autonomous retrieval before the model runs.
 *
 * A capability counts when the runtime recognises relevance and retrieves
 * evidence without Adam pasting data or naming tools. Tool schemas alone are
 * not competence; this pack is.
 */
import {
  getFitnessSnapshot,
  getTrainingVolume,
  getWorkingWeights,
  getLongTermFitness,
  getSessionComparisons,
  getLoadStatus,
  getPainTrainingSummary,
  getBodyState
} from './fitness-tools.mjs';
import { compareWorkoutWindows, searchWorkoutRecords } from './workout-history.mjs';
import {
  getNutritionSnapshot,
  getNutritionAdherence,
  getNutritionTargets,
  searchNutritionRecords,
  getWeightTrend,
  searchDiaryRecords,
  getDiaryRange,
  getSkincareAdherence,
  searchSkincareRecords,
  getTasksFocus,
  searchTasks,
  searchTeaching,
  getTeachingContext,
  searchKnowledge,
  inspectHubSignals
} from './domain-retrieval.mjs';
import {
  getNutritionDayRemaining,
  compareNutritionPeriods,
  compareDiaryPeriods,
  extractDiaryThemes,
  compareMindSessions,
  getSkincareResponseEvidence,
  getTasksOpenLoops,
  getTeachingDiagnosis,
  getKnowledgeSynthesis,
  getHammondAttentionPack
} from './domain-analysis.mjs';
import { searchMedicalRecords } from './medical-overview-read.mjs';
import { searchMindRecords } from './mind-session-read.mjs';
import { activationForTurn, classifyIntent } from './capabilities/activation-policy.mjs';
import { getWeekReview } from './hammond-week.mjs';

const PACK_CHAR_BUDGET = 14000;

function section(id, kind, title, data, extra = {}) {
  return { id, kind, title, data, ...extra };
}

function kindFor(result, preferred = 'record') {
  if (result == null) return 'missing';
  if (result.ok === false || result.error) return 'missing';
  if (result.found === false) return 'missing';
  if (result.conflict) return 'conflict';
  if (result.truncated) return 'truncated';
  return preferred;
}

function push(sections, tools, toolName, title, result, preferred = 'record') {
  tools.push(toolName);
  const kind = kindFor(result, preferred);
  sections.push(
    section(toolName, kind, title, result, {
      tool: toolName,
      continuation: kind === 'truncated' || kind === 'missing'
    })
  );
}

function queryFromMessage(message, fallback = '') {
  const text = String(message ?? '').trim();
  if (!text) return fallback;
  const cleaned = text
    .replace(/^(hey|hi|hello|please|can you|could you|what about|tell me|how about)\s+/i, '')
    .replace(/[?!.]+$/g, '')
    .trim();
  const words = cleaned.split(/\s+/).filter(w => w.length >= 3).slice(0, 8);
  return words.join(' ') || fallback || cleaned.slice(0, 80);
}

/**
 * @param {{
 *   slug: string,
 *   message: string,
 *   today: string,
 *   stores?: Record<string, any>,
 *   sourceMeta?: object,
 *   now?: Date
 * }} input
 */
export function assembleEvidencePack({
  slug,
  message,
  today,
  stores = {},
  sourceMeta = {},
  now = new Date()
} = {}) {
  const intent = classifyIntent(slug, message);
  const activation = activationForTurn({ slug, message, sourceMeta });
  const sections = [];
  const toolsExecuted = [];
  const storesTouched = [];

  const workouts = stores.workouts ?? stores.workoutRecords ?? [];
  const meals = stores.meals ?? stores.nutritionRecords ?? [];
  const composition = stores.composition ?? stores.compositionRecords ?? [];
  const measurements = stores.measurements ?? stores.measurementRecords ?? [];
  const mindEvents = stores.mindEvents ?? [];
  const skincare = stores.skincare ?? stores.skincareRecords ?? [];
  const medicalEvents = stores.medicalEvents ?? [];
  const tasks = stores.tasks ?? stores.hubTasks ?? [];
  const projects = stores.projects ?? stores.hubProjects ?? [];
  const classes = stores.classes ?? stores.hubClasses ?? [];
  const lessons = stores.lessons ?? stores.hubLessons ?? [];
  const units = stores.units ?? stores.hubUnits ?? [];
  const pages = stores.pages ?? stores.knowledgePages ?? [];
  const loadErrors = stores.loadErrors ?? stores.hubLoadErrors ?? {};
  const hammondDigest = stores.hammondDigest ?? '';
  const hammondEvents = stores.hammondEvents ?? stores.events ?? [];
  const centralNodeMarkdown = stores.centralNodeMarkdown ?? '';
  const nutritionChallenges = stores.nutritionChallenges ?? null;
  const templates = stores.templates ?? stores.workoutTemplates ?? [];
  const stressFlags = stores.stressFlags ?? [];
  const inbox = stores.inbox ?? [];

  const shouldPack = activation.forceToolChoice || intent.id !== 'none';
  if (!shouldPack) {
    return {
      slug,
      intentClass: intent.id,
      active: false,
      sections: [],
      toolsExecuted: [],
      storesTouched: [],
      continuationTools: [],
      promptBlock: '',
      answerable: false
    };
  }

  if (slug === 'chadwick') {
    storesTouched.push('life_hub_fitness', 'life_hub_body');
    push(sections, toolsExecuted, 'get_fitness_snapshot', 'Fitness snapshot', getFitnessSnapshot(workouts, today), 'calculation');
    push(sections, toolsExecuted, 'compare_workout_windows', 'Workout window compare', compareWorkoutWindows(workouts, today), 'calculation');
    push(sections, toolsExecuted, 'get_training_volume', 'Training volume', getTrainingVolume(workouts, today), 'calculation');
    push(sections, toolsExecuted, 'get_working_weights', 'Working weights', getWorkingWeights(workouts, today), 'calculation');
    push(sections, toolsExecuted, 'get_long_term_fitness', 'Long-term fitness', getLongTermFitness(workouts, today), 'calculation');
    push(sections, toolsExecuted, 'get_session_comparisons', 'Session comparisons', getSessionComparisons(workouts, today), 'calculation');
    push(
      sections,
      toolsExecuted,
      'get_body_state',
      'Body state',
      getBodyState({ compositionRecords: composition, measurementRecords: measurements }),
      'record'
    );
    if (intent.id === 'training_decline' || /pain|load|shoulder|knee|overtrain/i.test(message)) {
      push(sections, toolsExecuted, 'get_load_status', 'Load status', getLoadStatus(workouts, today), 'calculation');
      push(sections, toolsExecuted, 'get_pain_training_summary', 'Pain × training', getPainTrainingSummary(workouts, today), 'record');
    }
    if (/template|programme|program|plan/i.test(message) || templates.length) {
      push(
        sections,
        toolsExecuted,
        'search_workout_records',
        'Matching sessions',
        searchWorkoutRecords(workouts, { query: queryFromMessage(message, 'workout'), limit: 6 }),
        'record'
      );
    }
  }

  if (slug === 'brisket') {
    storesTouched.push('life_hub_nutrition');
    push(sections, toolsExecuted, 'get_nutrition_snapshot', 'Nutrition snapshot', getNutritionSnapshot(meals, today, { nutritionChallenges }), 'calculation');
    push(sections, toolsExecuted, 'get_nutrition_adherence', 'Nutrition adherence', getNutritionAdherence(meals, today), 'calculation');
    push(sections, toolsExecuted, 'get_nutrition_targets', 'Nutrition targets', getNutritionTargets(today), 'record');
    push(sections, toolsExecuted, 'get_nutrition_day_remaining', 'Remaining day macros', getNutritionDayRemaining(meals, today, { nutritionChallenges }), 'calculation');
    push(sections, toolsExecuted, 'compare_nutrition_periods', 'Period compare', compareNutritionPeriods(meals, today), 'calculation');
    if (composition.length || measurements.length) {
      storesTouched.push('life_hub_body');
      push(
        sections,
        toolsExecuted,
        'get_weight_trend',
        'Body weight context',
        getWeightTrend({ compositionRecords: composition, measurementRecords: measurements }),
        'record'
      );
    }
    if (/search|find|when did|ate|meal/i.test(message)) {
      push(
        sections,
        toolsExecuted,
        'search_nutrition_records',
        'Nutrition search',
        searchNutritionRecords(meals, { query: queryFromMessage(message, 'protein'), limit: 8 }),
        'record'
      );
    }
  }

  if (slug === 'sara') {
    storesTouched.push('life_hub_body', 'life_hub_medical');
    push(
      sections,
      toolsExecuted,
      'get_body_state',
      'Body state',
      getBodyState({ compositionRecords: composition, measurementRecords: measurements }),
      'record'
    );
    push(
      sections,
      toolsExecuted,
      'get_weight_trend',
      'Weight trend',
      getWeightTrend({ compositionRecords: composition, measurementRecords: measurements }),
      'calculation'
    );
    push(
      sections,
      toolsExecuted,
      'search_medical_records',
      'Medical records',
      searchMedicalRecords(medicalEvents, { query: queryFromMessage(message, 'medical'), limit: 8 }),
      'record'
    );
    if (meals.length) {
      storesTouched.push('life_hub_nutrition');
      push(sections, toolsExecuted, 'get_nutrition_adherence', 'Nutrition context', getNutritionAdherence(meals, today), 'calculation');
    }
    if (workouts.length) {
      storesTouched.push('life_hub_fitness');
      push(sections, toolsExecuted, 'get_pain_training_summary', 'Fitness/pain context', getPainTrainingSummary(workouts, today), 'record');
    }
  }

  if (slug === 'penelope') {
    storesTouched.push('life_hub_diary');
    const q = queryFromMessage(message, 'feeling');
    push(sections, toolsExecuted, 'search_diary_records', 'Diary search', searchDiaryRecords(mindEvents, { query: q, limit: 10 }), 'record');
    push(sections, toolsExecuted, 'compare_diary_periods', 'Diary period compare', compareDiaryPeriods(mindEvents, today), 'calculation');
    push(sections, toolsExecuted, 'extract_diary_themes', 'Diary themes', extractDiaryThemes(mindEvents, { query: q, limit: 12 }), 'calculation');
    const from = `${String(today).slice(0, 8)}01`;
    push(sections, toolsExecuted, 'get_diary_range', 'Diary range (month-to-date)', getDiaryRange(mindEvents, { from, to: today, limit: 12 }), 'record');
  }

  if (slug === 'vera') {
    storesTouched.push('life_hub_mind');
    const q = queryFromMessage(message, 'session');
    push(sections, toolsExecuted, 'search_mind_records', 'Mind session search', searchMindRecords(mindEvents, { query: q, limit: 10 }), 'record');
    push(sections, toolsExecuted, 'compare_mind_sessions', 'Multi-session compare', compareMindSessions(mindEvents, today), 'calculation');
    push(sections, toolsExecuted, 'search_diary_records', 'Bounded diary evidence', searchDiaryRecords(mindEvents, { query: q, limit: 6 }), 'record');
  }

  if (slug === 'hyaluronica') {
    storesTouched.push('life_hub_skincare');
    push(sections, toolsExecuted, 'get_skincare_adherence', 'Skincare adherence', getSkincareAdherence(skincare, today), 'calculation');
    push(sections, toolsExecuted, 'get_skincare_response_evidence', 'Response evidence', getSkincareResponseEvidence(skincare, today), 'calculation');
    push(
      sections,
      toolsExecuted,
      'search_skincare_records',
      'Skincare history search',
      searchSkincareRecords(skincare, { query: queryFromMessage(message, 'routine'), limit: 10 }),
      'record'
    );
  }

  if (slug === 'clare') {
    storesTouched.push('tasks_hub');
    push(sections, toolsExecuted, 'get_tasks_focus', 'Tasks focus', getTasksFocus(tasks, projects, { now }), 'calculation');
    push(
      sections,
      toolsExecuted,
      'get_tasks_open_loops',
      'Open loops / stalls / stress',
      getTasksOpenLoops(tasks, projects, { now, stressFlags, inbox }),
      'calculation'
    );
    if (/search|find|where is|project/i.test(message)) {
      push(
        sections,
        toolsExecuted,
        'search_tasks',
        'Tasks search',
        searchTasks(tasks, { query: queryFromMessage(message, 'task'), limit: 10 }),
        'record'
      );
    }
  }

  if (slug === 'ann') {
    storesTouched.push('teaching_hub');
    const q = queryFromMessage(message, 'lesson');
    push(sections, toolsExecuted, 'search_teaching', 'Teaching search', searchTeaching({ query: q, classes, lessons, units, limit: 10 }), 'record');
    push(sections, toolsExecuted, 'get_teaching_context', 'Teaching context', getTeachingContext({ classes, lessons, units, query: q, now }), 'record');
    push(sections, toolsExecuted, 'get_teaching_diagnosis', 'Teaching diagnosis', getTeachingDiagnosis({ classes, lessons, units, query: q, now }), 'calculation');
  }

  if (slug === 'clementine') {
    storesTouched.push('knowledge_hub');
    const q = queryFromMessage(message, 'notes');
    push(sections, toolsExecuted, 'search_knowledge', 'Knowledge search', searchKnowledge(pages, { query: q, limit: 10 }), 'record');
    push(sections, toolsExecuted, 'get_knowledge_synthesis', 'Cross-note synthesis', getKnowledgeSynthesis(pages, { query: q, limit: 10 }), 'calculation');
    if (classes.length || lessons.length) {
      storesTouched.push('teaching_hub');
      push(sections, toolsExecuted, 'search_teaching', 'Teaching↔Knowledge bridge', searchTeaching({ query: q, classes, lessons, units, limit: 6 }), 'record');
    }
  }

  if (slug === 'hammond') {
    storesTouched.push('cross_hub');
    push(
      sections,
      toolsExecuted,
      'inspect_hub_signals',
      'Hub signals',
      inspectHubSignals({
        tasks,
        classes,
        scheduledLessons: lessons,
        loadErrors,
        hammondDigest,
        now
      }),
      'record'
    );
    push(
      sections,
      toolsExecuted,
      'get_hammond_attention_pack',
      'Attention / open loops / patterns',
      getHammondAttentionPack({
        tasks,
        projects,
        classes,
        lessons,
        mindEvents,
        workouts,
        meals,
        loadErrors,
        stressFlags,
        inbox,
        today,
        now
      }),
      'calculation'
    );
    push(
      sections,
      toolsExecuted,
      'get_week_review',
      'Week recap + forward plan',
      getWeekReview({
        events: hammondEvents.length ? hammondEvents : [
          ...workouts.map(record => ({ record: { ...record, type: record.type || 'workout' } })),
          ...meals.map(record => ({ record: { ...record, type: record.type || 'meal' } })),
          ...mindEvents
        ],
        tasks,
        lessons,
        classes,
        centralNodeMarkdown,
        today,
        loadErrors
      }),
      'calculation'
    );
  }

  const continuationTools = sections.filter(s => s.continuation).map(s => s.tool).filter(Boolean);
  const promptBlock = formatEvidencePackForPrompt({
    slug,
    intentClass: intent.id,
    sections,
    toolsExecuted,
    continuationTools,
    storesTouched
  });

  return {
    slug,
    intentClass: intent.id,
    active: true,
    sections,
    toolsExecuted,
    storesTouched: [...new Set(storesTouched)],
    continuationTools: [...new Set(continuationTools)],
    promptBlock,
    answerable: sections.some(s =>
      s.kind === 'record' || s.kind === 'calculation' || s.kind === 'conflict' || s.kind === 'truncated'
    )
  };
}

export function formatEvidencePackForPrompt({
  slug,
  intentClass,
  sections,
  toolsExecuted,
  continuationTools,
  storesTouched
}) {
  if (!sections?.length) return '';
  const lines = [
    `Server-assembled evidence pack for ${slug} (intent: ${intentClass}).`,
    'Kinds: record = stored fact; calculation = deterministic derived number; missing = source empty/unavailable; truncated = more exists beyond this slice; conflict = records disagree; inference_boundary = do not promote model guesses over records.',
    `Stores touched: ${storesTouched.join(', ') || 'none'}.`,
    `Retrieval tools already executed server-side: ${toolsExecuted.join(', ') || 'none'}.`,
    'Use this pack as primary evidence. Call continuation tools only when a section is truncated/missing and you need another slice. Label claims as record / calculation / inference. Never invent rows that are not here.'
  ];
  if (continuationTools.length) {
    lines.push(`Continuation candidates: ${continuationTools.join(', ')}.`);
  }
  let used = lines.join('\n').length;
  for (const sec of sections) {
    const header = `\n### ${sec.title} [${sec.kind}]${sec.tool ? ` (via ${sec.tool})` : ''}`;
    let body;
    try {
      body = JSON.stringify(sec.data);
    } catch {
      body = String(sec.data);
    }
    if (body.length > 2500) body = `${body.slice(0, 2500)}…`;
    const chunk = `${header}\n${body}`;
    if (used + chunk.length > PACK_CHAR_BUDGET) {
      lines.push('\n[evidence pack truncated for prompt budget — call continuation tools for omitted sections]');
      break;
    }
    lines.push(chunk);
    used += chunk.length;
  }
  return lines.join('\n');
}

/** Surface adapters — same read competence outside Life chat. */
export function assembleClareEvidence(stores, { message = 'What should I focus on today?', today, now = new Date() } = {}) {
  return assembleEvidencePack({
    slug: 'clare',
    message,
    today: today ?? now.toISOString().slice(0, 10),
    stores,
    now
  });
}

export function assembleAnnEvidence(stores, { message = "Help me with tomorrow's lesson", today, now = new Date() } = {}) {
  return assembleEvidencePack({
    slug: 'ann',
    message,
    today: today ?? now.toISOString().slice(0, 10),
    stores,
    now
  });
}

export function assembleClementineEvidence(stores, { message = 'What do I already have about this?', today, now = new Date() } = {}) {
  return assembleEvidencePack({
    slug: 'clementine',
    message,
    today: today ?? now.toISOString().slice(0, 10),
    stores,
    now
  });
}
