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
  now = new Date(),
  force = false
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

  const shouldPack = force || activation.forceToolChoice || intent.id !== 'none';
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
    push(sections, toolsExecuted, 'get_teaching_context', 'Teaching context', getTeachingContext({ classes, lessons, units, query: q, message, now }), 'record');
    push(sections, toolsExecuted, 'get_teaching_diagnosis', 'Teaching diagnosis', getTeachingDiagnosis({ classes, lessons, units, query: q, message, now }), 'calculation');
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

function formatClaimValue(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function pushClaim(claims, tool, fact, value, kind = 'record', provenance = null) {
  if (value == null) return;
  claims.push({
    tool,
    fact,
    value,
    kind,
    text: `${fact}=${formatClaimValue(value)}`,
    provenance: provenance ?? undefined
  });
}

export function claimProvenance(result, tool, extra = {}) {
  const record = extra.record && typeof extra.record === 'object' ? extra.record : null;
  const hasRecord = Boolean(extra.recordId || extra.recordPath || record?.id || record?.path);
  const sourceType = extra.sourceType
    ?? (extra.reason === 'user_stated_current_turn'
      ? 'record'
      : extra.reason === 'inference' || extra.kind === 'inference'
        ? 'calculation'
        : extra.calculation || extra.reason === 'derived_from_aggregate' || result?.kind === 'calculation' || !hasRecord
          ? 'calculation'
          : 'record');
  const store = extra.store ?? result?.store ?? null;
  const provenance = {
    sourceType,
    store,
    tool,
    recordId: extra.recordId ?? record?.id ?? null,
    recordPath: extra.recordPath ?? record?.path ?? result?.path ?? null,
    retrievedAt: extra.retrievedAt ?? new Date().toISOString(),
    authority: extra.authority ?? (store ? 'authoritative' : extra.reason === 'user_stated_current_turn' ? 'user_stated' : 'unknown'),
    modifiedAt: extra.modifiedAt ?? record?.updated_at ?? record?.version ?? result?.version ?? null
  };
  const date = extra.date ?? record?.date ?? record?.due_date ?? result?.date ?? result?.last_completed_date ?? null;
  if (date) provenance.date = date;
  if (extra.window) provenance.window = extra.window;
  if (sourceType === 'calculation' || extra.calculation) {
    provenance.calculation = extra.calculation ?? result?.kind ?? 'calculation';
    provenance.inputs = extra.inputs ?? (store ? [store] : []);
    provenance.output = extra.output ?? extra.fact ?? null;
  }
  if (!provenance.recordId && !provenance.recordPath) {
    provenance.reason = extra.reason
      ?? (extra.kind === 'inference' ? 'inference'
        : extra.reason === 'user_stated_current_turn' ? 'user_stated_current_turn'
        : sourceType === 'calculation' ? 'derived_from_aggregate'
        : 'unavailable_source');
  }
  if (!provenance.recordId && !provenance.recordPath && !provenance.store && !provenance.reason) {
    provenance.authority = 'unavailable';
    provenance.reason = 'unavailable_source';
  }
  return provenance;
}

/**
 * Deterministic claim list from retrieved tool evidence.
 * Pack/function compose only — not a conversational answer.
 * Presence of a record is not completeness: limitations stay visible.
 */
export function composeEvidenceClaims(evidence = {}) {
  const claims = [];
  const limitations = [];

  for (const [tool, result] of Object.entries(evidence)) {
    if (result == null) {
      limitations.push({ tool, kind: 'missing', text: `${tool} returned nothing` });
      continue;
    }
    if (result.ok === false || result.error) {
      limitations.push({
        tool,
        kind: 'failed',
        text: String(result.error || `${tool} failed`)
      });
      continue;
    }
    if (result.truncated) {
      limitations.push({
        tool,
        kind: 'truncated',
        text: `${tool} truncated kept=${result.kept ?? '?'} omitted=${result.omitted ?? '?'}`
      });
    }
    if (result.conflict) {
      limitations.push({
        tool,
        kind: 'conflict',
        text: result.conflict.kind || 'conflict'
      });
    }
    if (Array.isArray(result.unavailable)) {
      for (const item of result.unavailable) {
        limitations.push({
          tool,
          kind: 'unavailable',
          text: `${item.hub}:${item.error || 'unavailable'}`
        });
        pushClaim(claims, tool, 'unavailable_hub', item.hub, 'record', claimProvenance(result, tool, {
          reason: 'unavailable_source',
          store: item.hub
        }));
      }
    }

    const calc = (fact, calculation, extra = {}) => claimProvenance(result, tool, {
      reason: extra.reason ?? 'derived_from_aggregate',
      calculation,
      store: extra.store ?? result.store,
      inputs: extra.inputs,
      window: extra.window,
      date: extra.date,
      output: extra.output ?? fact
    });
    const recordOf = (record, extra = {}) => claimProvenance(result, tool, {
      record,
      sourceType: 'record',
      store: extra.store ?? result.store,
      date: extra.date ?? record?.date ?? record?.due_date,
      modifiedAt: record?.updated_at
    });

    const lastSession = result.last_completed_id || result.last_completed_path
      ? { id: result.last_completed_id, path: result.last_completed_path, date: result.last_completed_date }
      : null;
    pushClaim(
      claims,
      tool,
      'last_completed_date',
      result.last_completed_date,
      lastSession ? 'record' : 'calculation',
      lastSession
        ? recordOf(lastSession, { date: result.last_completed_date })
        : calc('last_completed_date', 'last_completed_date', { date: result.last_completed_date })
    );
    pushClaim(claims, tool, 'compare_current_from', result.current?.from, 'calculation', calc('compare_current_from', 'workout_window', {
      window: result.current ?? null
    }));
    pushClaim(claims, tool, 'compare_previous_from', result.previous?.from, 'calculation', calc('compare_previous_from', 'workout_window', {
      window: result.previous ?? null
    }));
    pushClaim(claims, tool, 'open_count', result.open_count, 'calculation', calc('open_count', 'open_count', {
      store: result.store ?? 'tasks_hub'
    }));
    if (result.overdue?.[0]?.title) {
      pushClaim(claims, tool, 'overdue_title', result.overdue[0].title, 'record', recordOf(result.overdue[0], {
        store: result.store ?? 'tasks_hub'
      }));
    }
    if (result.due_soon?.[0]?.title) {
      pushClaim(claims, tool, 'due_soon_title', result.due_soon[0].title, 'record', recordOf(result.due_soon[0], {
        store: result.store ?? 'tasks_hub'
      }));
    }
    if (result.lesson) {
      const lessonProv = recordOf(result.lesson, { store: result.store ?? 'teaching_hub' });
      pushClaim(claims, tool, 'lesson_id', result.lesson.id, 'record', lessonProv);
      pushClaim(claims, tool, 'lesson_title', result.lesson.title, 'record', lessonProv);
      pushClaim(claims, tool, 'lesson_date', result.lesson.date, 'record', lessonProv);
      if (result.lesson.path) {
        pushClaim(claims, tool, 'lesson_path', result.lesson.path, 'record', lessonProv);
      }
      if (result.lesson.sequence != null) {
        pushClaim(claims, tool, 'lesson_sequence', result.lesson.sequence, 'record', lessonProv);
      }
      if (Array.isArray(result.lesson.outcome_ids)) {
        pushClaim(claims, tool, 'outcome_ids', result.lesson.outcome_ids, 'record', lessonProv);
      }
      if (Array.isArray(result.lesson.learning_intentions) && result.lesson.learning_intentions.length) {
        pushClaim(claims, tool, 'learning_intentions', result.lesson.learning_intentions, 'record', lessonProv);
      }
      if (result.lesson.block_count != null) {
        pushClaim(claims, tool, 'block_count', result.lesson.block_count, 'record', lessonProv);
      }
    }
    if (result.class?.code) {
      pushClaim(claims, tool, 'class_code', result.class.code, 'record', recordOf(result.class, {
        store: result.store ?? 'teaching_hub'
      }));
    }
    if (result.unit?.title || result.unit?.id) {
      pushClaim(claims, tool, 'unit_title', result.unit.title ?? result.unit.id, 'record', recordOf(result.unit, {
        store: result.store ?? 'teaching_hub'
      }));
    }
    if (result.next_scheduled?.id) {
      pushClaim(claims, tool, 'next_scheduled_title', result.next_scheduled.title ?? result.next_scheduled.id, 'record', recordOf(result.next_scheduled, {
        store: result.store ?? 'teaching_hub',
        date: result.next_scheduled.date
      }));
    }
    if (result.previous_lesson?.id) {
      pushClaim(claims, tool, 'previous_lesson_title', result.previous_lesson.title ?? result.previous_lesson.id, 'record', recordOf(result.previous_lesson, {
        store: result.store ?? 'teaching_hub',
        date: result.previous_lesson.date
      }));
    }
    if (result.next_in_unit?.id) {
      const basis = result.next_in_unit_basis === 'unit_lesson_ids' ? 'record' : 'inference';
      pushClaim(
        claims,
        tool,
        'next_in_unit_title',
        result.next_in_unit.title ?? result.next_in_unit.id,
        basis === 'record' ? 'record' : 'inference',
        basis === 'record'
          ? recordOf(result.next_in_unit, { store: result.store ?? 'teaching_hub' })
          : claimProvenance(result, tool, {
              sourceType: 'calculation',
              reason: 'inference',
              calculation: 'next_in_unit_inference',
              store: result.store ?? 'teaching_hub',
              kind: 'inference'
            })
      );
    }
    if (result.stated_constraints?.minutes != null) {
      pushClaim(claims, tool, 'stated_time_minutes', result.stated_constraints.minutes, 'inference', claimProvenance(result, tool, {
        sourceType: 'calculation',
        reason: 'user_stated_current_turn',
        calculation: 'stated_teaching_constraint',
        authority: 'user_stated',
        kind: 'inference'
      }));
    }
    pushClaim(claims, tool, 'diagnosis_gaps', result.diagnosis_gaps, 'calculation', calc('diagnosis_gaps', 'teaching_diagnosis', {
      store: 'teaching_hub',
      inputs: ['teaching_hub']
    }));
    if (Array.isArray(result.preparation) && result.preparation.length) {
      pushClaim(claims, tool, 'preparation', result.preparation, 'calculation', calc('preparation', 'teaching_preparation', {
        store: 'teaching_hub',
        inputs: ['teaching_hub']
      }));
    }
    const first = result.results?.[0] ?? null;
    pushClaim(claims, tool, 'result_count', result.count, 'calculation', calc('result_count', 'result_count'));
    if (first) {
      const firstProv = recordOf(first);
      pushClaim(claims, tool, 'first_result_id', first.id, 'record', firstProv);
      pushClaim(claims, tool, 'first_result_title', first.title, 'record', firstProv);
      pushClaim(claims, tool, 'first_result_excerpt', first.excerpt ?? first.notes_excerpt, 'record', firstProv);
      pushClaim(claims, tool, 'first_result_tags', first.tags, 'record', firstProv);
      pushClaim(claims, tool, 'first_result_connected', first.connected, 'record', firstProv);
      pushClaim(claims, tool, 'first_result_provider', first.provider, 'record', firstProv);
      pushClaim(claims, tool, 'first_result_notes', first.notes_excerpt ?? first.notes, 'record', firstProv);
    }
    if (Array.isArray(result.hits) && result.hits[0]) {
      for (const hit of result.hits.slice(0, 5)) {
        const hitProv = recordOf(hit, { store: result.store ?? 'knowledge_hub' });
        pushClaim(claims, tool, 'note_id', hit.id, 'record', hitProv);
        pushClaim(claims, tool, 'note_title', hit.title, 'record', hitProv);
        if (hit.path) pushClaim(claims, tool, 'note_path', hit.path, 'record', hitProv);
      }
    }
    if (Array.isArray(result.graph_links)) {
      pushClaim(claims, tool, 'graph_link_count', result.graph_links.length, 'calculation', calc('graph_link_count', 'graph_links', {
        store: result.store ?? 'knowledge_hub',
        inputs: ['knowledge_hub']
      }));
      if (result.graph_links[0]) {
        pushClaim(claims, tool, 'graph_link', `${result.graph_links[0].from}->${result.graph_links[0].to}`, 'record', claimProvenance(result, tool, {
          sourceType: 'record',
          store: result.store ?? 'knowledge_hub',
          recordId: result.graph_links[0].from,
          reason: undefined
        }));
      }
    }
    if (Array.isArray(result.inferred_relations) && result.inferred_relations.length) {
      pushClaim(claims, tool, 'inferred_relation_count', result.inferred_relations.length, 'inference', claimProvenance(result, tool, {
        sourceType: 'calculation',
        reason: 'inference',
        calculation: 'inferred_note_overlap',
        store: result.store ?? 'knowledge_hub',
        kind: 'inference'
      }));
    }
    if (Array.isArray(result.themes) && result.themes[0]) {
      pushClaim(claims, tool, 'theme', result.themes[0].theme, 'calculation', calc('theme', 'derived_theme', {
        store: result.store ?? 'knowledge_hub',
        inputs: result.themes[0].page_ids ?? ['knowledge_hub']
      }));
    }
    if (Array.isArray(result.conflicts) && result.conflicts.length) {
      pushClaim(claims, tool, 'note_conflict_count', result.conflicts.length, 'calculation', calc('note_conflict_count', 'note_conflicts', {
        store: result.store ?? 'knowledge_hub',
        inputs: ['knowledge_hub']
      }));
    }
    if (result.coverage?.weak_match) {
      pushClaim(claims, tool, 'weak_match', true, 'calculation', calc('weak_match', 'weak_match', {
        store: result.store ?? 'knowledge_hub'
      }));
    }
    pushClaim(claims, tool, 'delta_kg', result.delta_kg, 'calculation', calc('delta_kg', 'weight_delta'));
    if (result.found != null) {
      pushClaim(claims, tool, 'found', result.found, result.found ? 'record' : 'calculation', result.found
        ? recordOf(result.latest ?? result, { store: result.store ?? 'life_hub_body' })
        : calc('found', 'body_state_found', { reason: 'unavailable_source' }));
    }
    pushClaim(claims, tool, 'enough_evidence', result.enough_evidence, 'calculation', calc('enough_evidence', 'enough_evidence'));
    pushClaim(claims, tool, 'missing_recent_sessions', result.missing_recent_sessions, 'calculation', calc('missing_recent_sessions', 'recent_session_window'));
    if (result.substitution?.replacement) {
      pushClaim(claims, tool, 'substitution', result.substitution.replacement, 'calculation', calc('substitution', 'substitution_map'));
    }
    if (result.cause?.status) {
      const isActive = result.cause.status === 'active' || result.cause.kind === 'current_active_constraint';
      const causeKind = isActive ? 'record' : 'inference';
      const causeReason = result.cause.status === 'user_stated'
        ? 'user_stated_current_turn'
        : isActive
          ? undefined
          : 'inference';
      const activeRecord = result.cause.current_active_constraint;
      pushClaim(claims, tool, 'unavailable_cause', result.cause.status, causeKind, claimProvenance(result, tool, {
        sourceType: isActive ? 'record' : 'calculation',
        reason: causeReason,
        record: isActive ? activeRecord : null,
        date: isActive ? (activeRecord?.latest_date ?? activeRecord?.date) : undefined,
        calculation: 'unavailable_cause',
        kind: causeKind
      }));
      for (const site of result.cause.historical_relevant_pain ?? []) {
        const hasRecord = Boolean(site.id || site.path);
        pushClaim(claims, tool, 'historical_relevant_pain', site.site, hasRecord ? 'record' : 'calculation', claimProvenance(result, tool, {
          sourceType: hasRecord ? 'record' : 'calculation',
          record: hasRecord ? site : null,
          date: site.latest_date,
          reason: hasRecord ? undefined : 'derived_from_aggregate',
          calculation: hasRecord ? undefined : 'historical_relevant_pain'
        }));
      }
    }
    if (result.progression?.ok === false) {
      pushClaim(claims, tool, 'progression_blocked', result.progression.reason, 'calculation', calc('progression_blocked', 'progression_gate'));
    }
    pushClaim(claims, tool, 'days_with_log', result.days_with_log, 'calculation', calc('days_with_log', 'days_with_log'));
    if (result.life_digest_present != null) {
      pushClaim(claims, tool, 'life_digest_present', result.life_digest_present, 'calculation', calc('life_digest_present', 'life_digest_present'));
    }
    if (result.long_term?.adherence_pct != null) {
      pushClaim(claims, tool, 'adherence_pct', result.long_term.adherence_pct, 'calculation', calc('adherence_pct', 'adherence_pct', {
        window: result.long_term
      }));
    }
    if (result.this_week_volume_kg != null) {
      pushClaim(claims, tool, 'week_volume_kg', result.this_week_volume_kg, 'calculation', calc('week_volume_kg', 'week_volume'));
    } else if (result.week?.volume_kg != null) {
      pushClaim(claims, tool, 'week_volume_kg', result.week.volume_kg, 'calculation', calc('week_volume_kg', 'week_volume'));
    }
    if (Array.isArray(result.flags) && result.flags.length) {
      pushClaim(claims, tool, 'pain_flag_count', result.flags.length, 'calculation', calc('pain_flag_count', 'pain_flag_count'));
    }
    if (Array.isArray(result.recent) && result.recent.length) {
      pushClaim(claims, tool, 'pain_recent_count', result.recent.length, 'calculation', calc('pain_recent_count', 'pain_recent_count'));
    }
    if (Array.isArray(result.sites) && result.sites.length) {
      const site = result.sites[0];
      const session = site.sessions?.[0];
      pushClaim(claims, tool, 'pain_site', site.site, 'record', claimProvenance(result, tool, {
        record: session?.id || session?.path ? session : null,
        date: site.latest_date,
        reason: session?.id || session?.path ? undefined : 'derived_from_aggregate',
        calculation: session?.id || session?.path ? undefined : 'pain_site_rollup'
      }));
      pushClaim(claims, tool, 'pain_site_count', result.site_count ?? result.sites.length, 'calculation', calc('pain_site_count', 'pain_site_count'));
    }
    if (Array.isArray(result.collisions)) {
      pushClaim(claims, tool, 'collision_count', result.collisions.length, 'calculation', calc('collision_count', 'plan_work_collisions', {
        store: result.store ?? 'tasks_hub',
        inputs: ['tasks_hub', 'teaching_hub']
      }));
    }
    pushClaim(claims, tool, 'lesson_count', result.lesson_count, 'calculation', calc('lesson_count', 'lesson_count', {
      store: result.store ?? 'teaching_hub'
    }));
    if (result.stall_candidates?.[0]?.title) {
      pushClaim(claims, tool, 'stall_title', result.stall_candidates[0].title, 'record', recordOf({
        id: result.stall_candidates[0].project_id,
        title: result.stall_candidates[0].title
      }, { store: result.store ?? 'tasks_hub' }));
    }
    if (result.ok === true && !claims.some(claim => claim.tool === tool)) {
      pushClaim(claims, tool, 'ok', true, 'calculation', calc('ok', 'tool_ok'));
    }
  }

  return {
    claims,
    limitations,
    complete: limitations.length === 0 && claims.length > 0
  };
}

export function claimValue(composed, fact) {
  return composed.claims.find(claim => claim.fact === fact)?.value;
}
