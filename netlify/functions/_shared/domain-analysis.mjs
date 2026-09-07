/**
 * Deterministic domain analysis helpers for evidence packs.
 * Wraps existing Tasks / nutrition / knowledge / mind services — no duplicate stores.
 */
import { addCalendarDays, isCalendarDate } from '../../../apps/life/js/core/time.js';
import { buildNutritionModel } from '../../../apps/life/js/app/nutrition-model.js';
import { TARGETS_CONFIG } from './targets-config.mjs';
import { findStallCandidates } from './tasks-stall.mjs';
import {
  detectDensePinches,
  detectMissedDeadlines,
  detectOverlappingExcursions
} from './tasks-stress.mjs';
import { buildCapacitySnapshot } from './tasks-capacity.mjs';
import {
  getNutritionSnapshot,
  getNutritionAdherence,
  getNutritionTargets,
  getDiaryRange,
  searchDiaryRecords,
  getSkincareAdherence,
  hydrateTeachingSchedule,
  partitionTeachingLessons,
  statedTeachingConstraints,
  getTeachingContext
} from './domain-retrieval.mjs';
import { searchMindRecords } from './mind-session-read.mjs';
import { topicQuery, researchFromDocs, coverageFromResearch } from './knowledge-research.mjs';
import { rankKnowledgePages } from './knowledge-data.mjs';

function mealEvents(records) {
  return (Array.isArray(records) ? records : [])
    .filter(r => r?.type === 'meal')
    .map(r => ({ record: r, body: r.notes ?? '' }));
}

export function getNutritionDayRemaining(
  records,
  today,
  { targetsConfig = TARGETS_CONFIG, nutritionChallenges = null } = {}
) {
  if (!isCalendarDate(today)) return { ok: false, error: 'invalid_date', store: 'life_hub_nutrition' };
  const snap = getNutritionSnapshot(records, today, { targetsConfig, nutritionChallenges });
  if (!snap?.ok) return snap;
  const targetResult = getNutritionTargets(today, { targetsConfig });
  const targets = targetResult?.targets ?? {};
  const consumed = snap.today ?? {};
  const remaining = {};
  for (const key of Object.keys(targets)) {
    const t = Number(targets[key]);
    const used = Number(consumed[key] ?? 0);
    if (Number.isFinite(t)) remaining[key] = Math.round((t - used) * 10) / 10;
  }
  return {
    ok: true,
    store: 'life_hub_nutrition',
    kind: 'calculation',
    date: today,
    day_type: snap.day_type,
    consumed,
    targets,
    remaining,
    meals_logged: Array.isArray(snap.meals_today) ? snap.meals_today.length : 0,
    how_to_read: 'Deterministic remaining = targets − logged today. Not a forecast.'
  };
}

export function compareNutritionPeriods(records, today, { targetsConfig = TARGETS_CONFIG } = {}) {
  if (!isCalendarDate(today)) return { ok: false, error: 'invalid_date', store: 'life_hub_nutrition' };
  const adherence = getNutritionAdherence(records, today, { targetsConfig });
  const model = buildNutritionModel({
    events: mealEvents(records),
    targetsConfig,
    date: today
  });
  const weekDays = (model.week ?? []).filter(d => (d.calories ?? 0) > 0 || (d.protein_g ?? 0) > 0);
  const week = adherence.week ?? {};
  const previous = adherence.previous_week ?? {};
  const weekRate = week.observed_protein_hit_rate_pct ?? week.protein_hit_rate_pct;
  const prevRate = previous.observed_protein_hit_rate_pct ?? previous.protein_hit_rate_pct;
  const weekCov = week.logging_coverage_pct ?? 0;
  const prevCov = previous.logging_coverage_pct ?? 0;
  const rateDelta = weekRate != null && prevRate != null ? weekRate - prevRate : null;
  const coverageDelta = weekCov - prevCov;
  const coverageMateriallyDifferent = Math.abs(coverageDelta) >= 25;
  const incomplete =
    week.coverage_status === 'incomplete'
    || week.coverage_status === 'none'
    || previous.coverage_status === 'incomplete'
    || previous.coverage_status === 'none';
  const avgProteinDelta =
    week.avg_protein_g != null && previous.avg_protein_g != null
      ? week.avg_protein_g - previous.avg_protein_g
      : null;
  return {
    ok: true,
    store: 'life_hub_nutrition',
    kind: 'calculation',
    date: today,
    week,
    previous_week: previous,
    month: adherence.month,
    week_vs_previous: {
      // Observed logged-day hit-rate delta only; null when either side lacks logged days.
      observed_protein_hit_rate_delta_pp: rateDelta,
      protein_hit_rate_delta_pp: rateDelta,
      logging_coverage_delta_pp: coverageDelta,
      avg_protein_delta_g: avgProteinDelta,
      comparison_limitation: incomplete || coverageMateriallyDifferent
        ? 'Coverage incomplete or materially different — do not treat hit-rate delta as full-week adherence change.'
        : null
    },
    days_with_meals_this_week: weekDays.map(d => d.date),
    how_to_read:
      'Compare observed hit rates among logged days plus logging coverage. '
      + 'Do not treat unlogged days as failed adherence. '
      + 'When coverage differs materially, surface that limitation.'
  };
}

function diaryRows(events) {
  return (Array.isArray(events) ? events : [])
    .filter(e => (e?.record?.type ?? e?.type) === 'diary')
    .map(e => (e.record ? e : { record: e, body: e.body ?? e.notes ?? '' }));
}

export function compareDiaryPeriods(events, today) {
  if (!isCalendarDate(today)) return { ok: false, error: 'invalid_date', store: 'life_hub_diary' };
  const from14 = addCalendarDays(today, -13);
  const from28 = addCalendarDays(today, -27);
  const prevTo = addCalendarDays(today, -14);
  const recent = getDiaryRange(events, { from: from14, to: today, limit: 20 });
  const previous = getDiaryRange(events, { from: from28, to: prevTo, limit: 20 });
  const moodAvg = block => {
    const scores = (block?.results ?? [])
      .map(r => Number(r.mood_score))
      .filter(Number.isFinite);
    if (!scores.length) return null;
    return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
  };
  return {
    ok: true,
    store: 'life_hub_diary',
    kind: 'calculation',
    recent_14d: { count: recent.count, avg_mood_score: moodAvg(recent), truncated: recent.truncated },
    previous_14d: { count: previous.count, avg_mood_score: moodAvg(previous), truncated: previous.truncated },
    how_to_read: 'Period counts and mood averages from diary records only.'
  };
}

export function extractDiaryThemes(events, { query = '', limit = 12 } = {}) {
  const searched = query ? searchDiaryRecords(events, { query, limit }) : null;
  const entries = diaryRows(events).slice(0, 40);
  const bag = new Map();
  for (const e of entries) {
    const text = [
      e.record?.notes,
      e.record?.highlights,
      e.record?.challenges,
      e.body,
      ...(e.record?.tags ?? [])
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    for (const word of text.split(/[^a-z0-9_]+/).filter(w => w.length >= 5)) {
      bag.set(word, (bag.get(word) ?? 0) + 1);
    }
  }
  const themes = [...bag.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([term, count]) => ({ term, count }));
  return {
    ok: true,
    store: 'life_hub_diary',
    kind: 'calculation',
    query: query || null,
    search: searched,
    recurring_terms: themes,
    sample_size: entries.length,
    how_to_read: 'Theme terms are frequency counts over diary text — not clinical diagnoses.'
  };
}

export function compareMindSessions(events, today) {
  const sessions = (Array.isArray(events) ? events : [])
    .filter(e => {
      const t = e?.record?.type ?? e?.type;
      return t === 'mind_session' || t === 'session';
    })
    .map(e => {
      const record = e?.record ?? e;
      return {
        ...record,
        id: record?.id ?? null,
        path: record?.path ?? e?.path ?? null
      };
    })
    .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
  const recent = sessions.slice(0, 5);
  const prior = sessions.slice(5, 10);
  const summarise = s => ({
    id: s.id ?? null,
    path: s.path ?? null,
    date: s.date,
    title: s.title,
    working_model: s.working_model ?? s.model ?? null,
    themes: s.themes ?? s.tags ?? [],
    notes_excerpt: typeof s.notes === 'string' ? s.notes.slice(0, 180) : undefined
  });
  return {
    ok: true,
    store: 'life_hub_mind',
    kind: 'calculation',
    date: today,
    recent_sessions: recent.map(summarise),
    prior_sessions: prior.map(summarise),
    truncated: sessions.length > 10,
    kept: Math.min(sessions.length, 10),
    omitted: Math.max(0, sessions.length - 10),
    how_to_read: 'Longitudinal claims must cite these session records; do not invent patterns beyond them.'
  };
}

export function getSkincareResponseEvidence(records, today, { lookbackDays = 28 } = {}) {
  if (!isCalendarDate(today)) return { ok: false, error: 'invalid_date', store: 'life_hub_skincare' };
  const from = addCalendarDays(today, -(lookbackDays - 1));
  const mid = addCalendarDays(today, -Math.floor(lookbackDays / 2));
  const all = (Array.isArray(records) ? records : []).filter(r => r?.date && r.date >= from && r.date <= today);
  const early = all.filter(r => r.date < mid);
  const late = all.filter(r => r.date >= mid);
  const noteSignal = rows =>
    rows
      .map(r => ({
        date: r.date,
        routine: r.routine ?? r.name,
        notes: r.notes,
        is_procedure: Boolean(r.is_procedure),
        response_tags: r.response_tags ?? r.effects ?? [],
        id: r.id ?? null,
        path: r.path ?? null
      }))
      .slice(0, 8);
  return {
    ok: true,
    store: 'life_hub_skincare',
    kind: 'calculation',
    from,
    midpoint: mid,
    to: today,
    early_window: { count: early.length, samples: noteSignal(early) },
    late_window: { count: late.length, samples: noteSignal(late) },
    procedure_count: all.filter(r => r.is_procedure).length,
    how_to_read:
      'Helping/not-helping judgments must cite early vs late log notes and procedures. Missing response notes = missing evidence, not proof of failure. '
      + 'Temporal association is not causation.'
  };
}

const IRRITATION_RE = /\b(irritat\w*|flare\w*|flaring|redness|sting\w*|burn\w*|react\w*|breakout|rash)\b/i;
const RESPONSE_POS_RE = /\b(helped|better|calmer|improved|cleared|tolerated)\b/i;
const RESPONSE_NEG_RE = /\b(worse|worsened|irritated|irritation|flare|stung|burned|reacted|broke out)\b/i;

export function statedSkincareConstraints(message = '') {
  const text = String(message || '');
  const current = IRRITATION_RE.test(text) && /\b(today|now|currently|this morning|tonight)\b/i.test(text);
  return {
    current_irritation: current ? (text.match(IRRITATION_RE)?.[0] ?? 'irritation') : null
  };
}

export function analyseSkincareEvidence(records, today, { message = '', lookbackDays = 28 } = {}) {
  if (!isCalendarDate(today)) return { ok: false, error: 'invalid_date', store: 'life_hub_skincare' };
  const stated = statedSkincareConstraints(message);
  const adherence = getSkincareAdherence(records, today, { lookbackDays: Math.min(lookbackDays, 14) });
  const from = addCalendarDays(today, -(lookbackDays - 1));
  const all = (Array.isArray(records) ? records : [])
    .filter(r => r?.date && r.date >= from && r.date <= today)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const routine_events = all.map(r => ({
    kind: 'stored_routine_event',
    date: r.date,
    routine: r.routine ?? r.name ?? null,
    product: r.product ?? r.routine ?? r.name ?? null,
    notes: r.notes ?? null,
    response_tags: r.response_tags ?? r.effects ?? [],
    id: r.id ?? null,
    path: r.path ?? null,
    recency: r.date === today ? 'today' : r.date >= addCalendarDays(today, -6) ? 'recent_window' : 'historical'
  }));
  const response_events = all
    .filter(r => {
      const hay = [r.notes, ...(r.response_tags ?? []), ...(r.effects ?? [])].filter(Boolean).join(' ');
      return IRRITATION_RE.test(hay) || RESPONSE_POS_RE.test(hay) || RESPONSE_NEG_RE.test(hay)
        || (Array.isArray(r.response_tags) && r.response_tags.length);
    })
    .map(r => ({
      kind: 'stored_response_event',
      date: r.date,
      notes: r.notes ?? null,
      response_tags: r.response_tags ?? r.effects ?? [],
      product: r.product ?? r.routine ?? r.name ?? null,
      id: r.id ?? null,
      path: r.path ?? null,
      recency: r.date === today ? 'today' : 'historical'
    }));
  const historical_irritation = response_events.filter(e =>
    e.recency === 'historical' && (IRRITATION_RE.test(String(e.notes || '')) || RESPONSE_NEG_RE.test(String(e.notes || '')))
  );
  const associations = [];
  for (const flare of historical_irritation.slice(0, 5)) {
    const prior = routine_events.find(r => r.date < flare.date && r.date >= addCalendarDays(flare.date, -3));
    if (prior) {
      associations.push({
        kind: 'temporal_association',
        flare_date: flare.date,
        prior_routine_date: prior.date,
        product: prior.product,
        claim: 'temporal_only',
        how_to_read: 'Product appeared before a response log. This is association, not causation.'
      });
    }
  }
  return {
    ok: true,
    store: 'life_hub_skincare',
    kind: 'calculation',
    date: today,
    from,
    stated_constraints: stated,
    routine_event_count: routine_events.length,
    response_event_count: response_events.length,
    days_with_log: adherence.days_with_log ?? 0,
    adherence_pct: adherence.adherence_pct ?? 0,
    routine_events: routine_events.slice(0, 12),
    response_events: response_events.slice(0, 12),
    historical_irritation: historical_irritation.slice(0, 8),
    temporal_associations: associations,
    missing_logs: (adherence.days_with_log ?? 0) === 0,
    how_to_read:
      'Separate stored routine events, stored response events, derived adherence, and temporal associations. '
      + 'Do not claim causation from association. Do not describe past irritation as current irritation. '
      + 'Do not infer product effectiveness from adherence alone. Current irritation requires user_stated_current_turn.'
  };
}

export function statedNutritionConstraints(message = '') {
  const text = String(message || '');
  const ate = /\b(just ate|i ate|i've eaten|had breakfast|had lunch|had dinner)\b/i.test(text);
  const hungry = /\b(hungry|starving|skipped|forgot to log)\b/i.test(text);
  return {
    current_intake_note: ate ? 'ate_this_turn' : hungry ? 'intake_gap_this_turn' : null
  };
}

export function analyseNutritionEvidence(records, today, {
  targetsConfig = TARGETS_CONFIG,
  nutritionChallenges = null,
  message = ''
} = {}) {
  if (!isCalendarDate(today)) return { ok: false, error: 'invalid_date', store: 'life_hub_nutrition' };
  const stated = statedNutritionConstraints(message);
  const snap = getNutritionSnapshot(records, today, { targetsConfig, nutritionChallenges });
  const adherence = getNutritionAdherence(records, today, { targetsConfig });
  const remaining = getNutritionDayRemaining(records, today, { targetsConfig, nutritionChallenges });
  const compare = compareNutritionPeriods(records, today, { targetsConfig });
  const targets = getNutritionTargets(today, { targetsConfig });
  const mealsToday = Array.isArray(snap.meals_today) ? snap.meals_today : [];
  const yesterday = addCalendarDays(today, -1);
  const yesterdayMeals = (Array.isArray(records) ? records : []).filter(
    r => r?.type === 'meal' && r.date === yesterday
  );
  const model = buildNutritionModel({
    events: mealEvents(records),
    targetsConfig,
    date: today
  });
  // No genuine historical day-completeness signal exists in the nutrition model.
  // Do not invent confirmed_miss / confirmed_hit without completeness.
  const dayRows = (model.week ?? []).map(day => {
    const logged = (day.calories ?? 0) > 0 || (day.protein_g ?? 0) > 0;
    let status = 'partial_or_unknown_completeness';
    if (!logged) status = 'no_log';
    else if (day.date === today && snap.logging_status === 'partial_day') status = 'insufficient_logging';
    else if ((day.proteinTarget ?? 0) <= 0) status = 'partial_or_unknown_completeness';
    else if (day.hitProtein) status = 'observed_hit';
    else status = 'observed_below_target';
    return {
      date: day.date,
      status,
      protein_g: day.protein_g ?? 0,
      protein_target_g: day.proteinTarget ?? 0,
      logged
    };
  });
  const observedBelowTargetDays = dayRows
    .filter(day => day.status === 'observed_below_target')
    .map(day => day.date)
    .sort((a, b) => b.localeCompare(a));
  const belowTargetDay = observedBelowTargetDays[0] ?? null;
  const belowTargetMeals = belowTargetDay
    ? (Array.isArray(records) ? records : [])
      .filter(r => r?.type === 'meal' && r.date === belowTargetDay)
      .slice()
      .sort((a, b) => Number(b.protein_g ?? 0) - Number(a.protein_g ?? 0))
      .slice(0, 5)
      .map(r => ({
        date: r.date,
        meal: r.meal,
        protein_g: r.protein_g ?? 0,
        calories: r.calories ?? 0,
        id: r.id ?? null,
        path: r.path ?? null,
        kind: 'stored_meal_fact'
      }))
    : [];
  const todayRow = dayRows.find(day => day.date === today);
  const targetBelowToday = todayRow?.status === 'observed_below_target';
  return {
    ok: true,
    store: 'life_hub_nutrition',
    kind: 'calculation',
    date: today,
    stated_constraints: stated,
    logging_status: snap.logging_status,
    meals_today_count: mealsToday.length,
    meals_today: mealsToday.map(m => ({ ...m, kind: 'stored_meal_fact' })),
    yesterday_meal_count: yesterdayMeals.length,
    targets: targets.targets ?? null,
    day_type: snap.day_type,
    consumed: snap.today ?? null,
    remaining: remaining.remaining ?? null,
    week_adherence: adherence.week ?? null,
    previous_week_adherence: adherence.previous_week ?? null,
    week_vs_previous: compare.week_vs_previous ?? null,
    unlogged_week_days: adherence.unlogged_week_days ?? [],
    day_target_status: dayRows,
    observed_below_target_days: observedBelowTargetDays,
    below_target_day: belowTargetDay,
    below_target_day_basis: belowTargetDay
      ? 'most_recent_observed_below_target'
      : 'no_observed_below_target_day',
    target_below_today: targetBelowToday,
    top_meals_on_below_target_day: belowTargetMeals,
    incomplete_logging: (adherence.unlogged_week_days ?? []).length > 0 || snap.logging_status !== 'logged_today',
    how_to_read:
      'Separate stored meal facts, nutrition target facts, derived adherence, and derived remaining macros. '
      + 'No meal log is missing evidence — never treat it as zero intake. '
      + 'observed_protein_hit_rate_pct is hits among logged days only; logging_coverage_pct is separate. '
      + 'observed_below_target means logged protein for that date is below target — not a proven complete-day miss. '
      + 'Unlogged and partial days are not automatic misses. '
      + 'Meals listed for a below-target day are records logged that day, not causal blame. '
      + 'Do not invent meals, convert planned meals into consumed food, or move yesterday\'s intake onto today. '
      + 'Current-turn intake notes are user_stated_current_turn only.'
  };
}

const DIARY_MOOD_PATTERN =
  'anxious|anxiety|flat|low|sad|angry|anger|overwhelmed|tired|hopeful|calm|stressed|stress';

const GENERIC_FEEL_WORDS = new Set([
  'feel', 'felt', 'feeling', 'feelings', 'this', 'like', 'way', 'again', 'before', 'often', 'happened', 'familiar'
]);

function normalizeDiaryMood(raw) {
  const word = String(raw ?? '').toLowerCase();
  if (word === 'anxiety') return 'anxious';
  if (word === 'anger') return 'angry';
  if (word === 'stressed' || word === 'stress') return 'stress';
  return word;
}

function diaryMoodSearchVariants(value) {
  switch (String(value ?? '').toLowerCase()) {
    case 'anxious':
      return ['anxious', 'anxiety'];
    case 'angry':
      return ['angry', 'anger'];
    case 'stress':
      return ['stress', 'stressed'];
    case 'work stress':
      return ['work stress'];
    default:
      return [String(value ?? '').trim()].filter(Boolean);
  }
}

function isDeicticDiaryRecurrenceQuestion(text) {
  return /\b(like this|this way|felt like this|feeling like this|feel like this|has this happened|this happened|this feels|feels familiar)\b/i.test(
    text
  );
}

/**
 * Resolve what a Penelope recurrence question is actually comparing.
 * Generic feel/felt/this language is relational, not a referent.
 */
export function resolveDiaryRecurrenceReferent(message = '', { boundReferent = null } = {}) {
  const text = String(message ?? '');
  const todayish = /\b(today|tonight|right now|this morning|this afternoon|this evening)\b/i.test(text);
  const deictic = isDeicticDiaryRecurrenceQuestion(text);

  // 1. Explicit current-turn mood/state.
  const currentMood = text.match(
    new RegExp(`\\b(?:i(?:'m|\\s+am)|i\\s+feel(?:ing)?|feeling)\\s+(${DIARY_MOOD_PATTERN})\\b`, 'i')
  );
  if (currentMood && todayish) {
    const value = normalizeDiaryMood(currentMood[1]);
    return { kind: 'explicit_current_turn', value, query: value, status: 'resolved' };
  }

  // Bounded theme: "This work stress feels familiar..."
  if (/\bwork\s+stress\b/i.test(text) && (deictic || /\bfeels familiar\b/i.test(text) || todayish)) {
    return {
      kind: 'explicit_current_turn',
      value: 'work stress',
      query: 'work stress',
      status: 'resolved'
    };
  }

  // 2. Explicit named recurrence target: "Have I felt anxious before?"
  const explicit = text.match(
    new RegExp(`\\b(?:felt|feeling|feel)\\s+(?!like\\b)(${DIARY_MOOD_PATTERN})\\b`, 'i')
  );
  if (explicit) {
    const value = normalizeDiaryMood(explicit[1]);
    return { kind: 'explicit_query', value, query: value, status: 'resolved' };
  }

  // 3. Genuinely bound conversational referent only when caller supplies one.
  if (boundReferent && String(boundReferent).trim()) {
    const value = normalizeDiaryMood(String(boundReferent).trim());
    if (value && !GENERIC_FEEL_WORDS.has(value)) {
      return { kind: 'bound_current_context', value, query: value, status: 'resolved' };
    }
  }

  // 4. Deictic / bare feel recurrence without a concept → unresolved.
  if (deictic) {
    return { kind: 'unresolved', value: null, query: null, status: 'unresolved' };
  }

  // Non-deictic theme queries keep ordinary focused-query search.
  return {
    kind: 'explicit_query',
    value: null,
    query: null,
    status: 'resolved_via_query',
    use_message_query: true
  };
}

function searchDiaryForReferent(events, referentValue, limit = 12) {
  const variants = diaryMoodSearchVariants(referentValue);
  const fullByKey = new Map();
  const partialByKey = new Map();
  for (const variant of variants) {
    const searched = searchDiaryRecords(events, { query: variant, limit });
    for (const hit of searched?.results ?? []) {
      fullByKey.set(hit.id ?? hit.path ?? `${hit.date}:${hit.notes}`, hit);
    }
    for (const hit of searched?.partial_results ?? []) {
      const key = hit.id ?? hit.path ?? `${hit.date}:${hit.notes}`;
      if (!fullByKey.has(key)) partialByKey.set(key, hit);
    }
  }
  return {
    ok: true,
    query: referentValue,
    focused_query: variants.join(' | '),
    results: [...fullByKey.values()],
    partial_results: [...partialByKey.values()],
    count: fullByKey.size,
    partial_count: partialByKey.size,
    truncated: false,
    kept: fullByKey.size,
    omitted: 0
  };
}

export function statedDiaryConstraints(message = '') {
  const referent = resolveDiaryRecurrenceReferent(message);
  return {
    current_mood: referent.kind === 'explicit_current_turn' ? referent.value : null
  };
}

export function analyseDiaryEvidence(events, today, { message = '', query = '', boundReferent = null } = {}) {
  if (!isCalendarDate(today)) return { ok: false, error: 'invalid_date', store: 'life_hub_diary' };
  const stated = statedDiaryConstraints(message);
  const referent = resolveDiaryRecurrenceReferent(message, { boundReferent });
  const compare = compareDiaryPeriods(events, today);
  const entries = diaryRows(events)
    .map(e => ({
      ...(e.record ?? e),
      path: e.path ?? e.record?.path ?? null,
      body: e.body
    }))
    .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
  const moods = entries.map(e => e.mood).filter(Boolean);
  const uniqueMoods = [...new Set(moods.map(m => String(m).toLowerCase()))];

  if (referent.kind === 'unresolved') {
    // Missing referent is not a retrieval-depth problem — do not search generic feel/felt.
    const fallback_context_entries = entries.slice(0, 8).map(e => ({
      date: e.date,
      mood: e.mood,
      path: e.path,
      id: e.id,
      notes: e.notes,
      score: 0,
      weak_fallback: true,
      kind: 'context_only'
    }));
    return {
      ok: true,
      store: 'life_hub_diary',
      kind: 'calculation',
      date: today,
      stated_constraints: stated,
      referent_status: 'unresolved',
      referent_kind: 'unresolved',
      referent_value: null,
      search_query: null,
      entry_count: entries.length,
      matched_entries: [],
      partial_context_entries: [],
      fallback_context_entries,
      supported_match_count: 0,
      partial_count: 0,
      fallback_count: fallback_context_entries.length,
      hit_count: 0,
      recurrence_strength: 'unresolved_referent',
      recurring_terms: [],
      recent_14d: compare.recent_14d,
      previous_14d: compare.previous_14d,
      conflicting_moods: uniqueMoods.length >= 2 ? uniqueMoods.slice(0, 6) : [],
      sample_entries: fallback_context_entries.slice(0, 5).map(e => ({
        date: e.date,
        mood: e.mood ?? null,
        notes: typeof e.notes === 'string' ? e.notes.slice(0, 160) : undefined,
        path: e.path ?? null,
        id: e.id ?? null,
        kind: 'fallback_context_entry',
        context_only: true,
        recency: e.date === today ? 'today' : 'historical'
      })),
      truncated: false,
      kept: null,
      omitted: null,
      how_to_read:
        'Deictic recurrence questions need a resolvable referent before historical matches can establish recurrence. '
        + 'Generic feel/felt/this language is not a referent. '
        + 'Fallback recent entries are context_only and never establish recurrence or invent the missing referent. '
        + 'Do not convert old mood states into current mood. Current mood requires user_stated_current_turn.'
    };
  }

  const q = referent.use_message_query
    ? (query || message || 'feeling')
    : (referent.query || query || message);
  const searched = referent.value && !referent.use_message_query
    ? searchDiaryForReferent(events, referent.value, 12)
    : searchDiaryRecords(events, { query: q, limit: 12 });
  const themes = extractDiaryThemes(events, { query: q, limit: 12 });
  const matched_entries = (searched?.results ?? []).map(e => ({
    date: e.date,
    mood: e.mood,
    path: e.path,
    id: e.id,
    notes: e.notes,
    score: e.score ?? 1,
    match_kind: e.match_kind ?? 'full',
    kind: 'matched_entry'
  }));
  const partial_context_entries = (searched?.partial_results ?? []).map(e => ({
    date: e.date,
    mood: e.mood,
    path: e.path,
    id: e.id,
    notes: e.notes,
    score: e.score ?? 0,
    matched_token_count: e.matched_token_count,
    query_token_count: e.query_token_count,
    match_kind: 'partial',
    kind: 'partial_match_context'
  }));
  let fallback_context_entries = [];
  // Pattern questions with a lexical miss may still surface recent entries as context only.
  if (
    !matched_entries.length
    && !partial_context_entries.length
    && entries.length
    && /\b(before|often|recur|theme|pattern|felt|feeling)\b/i.test(q)
  ) {
    fallback_context_entries = entries.slice(0, 8).map(e => ({
      date: e.date,
      mood: e.mood,
      path: e.path,
      id: e.id,
      notes: e.notes,
      score: 0,
      weak_fallback: true,
      kind: 'context_only'
    }));
  }
  const supported_match_count = matched_entries.length;
  const partial_count = partial_context_entries.length;
  const fallback_count = fallback_context_entries.length;
  let recurrence_strength = 'none';
  if (supported_match_count === 1) recurrence_strength = 'single_entry';
  else if (supported_match_count === 2) recurrence_strength = 'weak_recurrence';
  else if (supported_match_count >= 3) recurrence_strength = 'multi_entry_recurrence';
  else if (partial_count > 0 || fallback_count > 0) recurrence_strength = 'insufficient_match';
  const conflicting = uniqueMoods.length >= 2;
  const sampleSource = matched_entries.length
    ? matched_entries
    : partial_context_entries.length
      ? partial_context_entries
      : fallback_context_entries;
  return {
    ok: true,
    store: 'life_hub_diary',
    kind: 'calculation',
    date: today,
    stated_constraints: stated,
    referent_status: 'resolved',
    referent_kind: referent.kind,
    referent_value: referent.value,
    search_query: q,
    entry_count: entries.length,
    matched_entries,
    partial_context_entries,
    fallback_context_entries,
    supported_match_count,
    partial_count,
    fallback_count,
    hit_count: supported_match_count,
    recurrence_strength,
    recurring_terms: themes.recurring_terms ?? [],
    recent_14d: compare.recent_14d,
    previous_14d: compare.previous_14d,
    conflicting_moods: conflicting ? uniqueMoods.slice(0, 6) : [],
    sample_entries: sampleSource.slice(0, 5).map(e => ({
      date: e.date,
      mood: e.mood ?? null,
      notes: typeof e.notes === 'string' ? e.notes.slice(0, 160) : undefined,
      path: e.path ?? null,
      id: e.id ?? null,
      kind: e.kind === 'context_only'
        ? 'fallback_context_entry'
        : e.kind === 'partial_match_context'
          ? 'partial_match_context'
          : 'stored_diary_entry',
      context_only: e.kind === 'context_only' || e.kind === 'partial_match_context',
      match_kind: e.match_kind ?? (e.kind === 'matched_entry' ? 'full' : undefined),
      recency: e.date === today ? 'today' : 'historical'
    })),
    truncated: Boolean(searched?.truncated),
    kept: searched?.kept ?? null,
    omitted: searched?.omitted ?? null,
    how_to_read:
      'Separate stored diary entries from derived recurring themes and frequencies. '
      + 'Recurrence strength counts full supported search matches for a resolved referent only. '
      + 'Generic feel/felt/this words are not themselves a recurrence target. '
      + 'Partial token matches and fallback recent entries are context_only and never establish recurrence. '
      + 'Semantic similarity is not a stored fact. Do not label patterns as causal. '
      + 'Do not convert old mood states into current mood. Current mood requires user_stated_current_turn.'
  };
}

export function statedMindConstraints(message = '') {
  const text = String(message || '');
  const todayish = /\b(today|tonight|right now|this session)\b/i.test(text);
  const theme = text.match(/\b(anxiety|grief|anger|shame|avoidance|sleep|work stress)\b/i);
  return {
    current_theme: todayish && theme ? theme[1].toLowerCase() : null
  };
}

export function analyseMindEvidence(events, today, { message = '', query = '' } = {}) {
  if (!isCalendarDate(today)) return { ok: false, error: 'invalid_date', store: 'life_hub_mind' };
  const stated = statedMindConstraints(message);
  const compare = compareMindSessions(events, today);
  const q = query || message || 'session';
  const searched = searchMindRecords(events, { query: q, limit: 10 });
  const sessions = [
    ...(compare.recent_sessions ?? []).map(s => ({ ...s, window: 'recent' })),
    ...(compare.prior_sessions ?? []).map(s => ({ ...s, window: 'prior' }))
  ];
  const termBag = new Map();
  for (const s of sessions) {
    for (const theme of s.themes ?? []) {
      const key = String(theme).toLowerCase();
      if (key.length < 3) continue;
      const row = termBag.get(key) ?? { term: key, count: 0, windows: new Set() };
      row.count += 1;
      row.windows.add(s.window);
      termBag.set(key, row);
    }
    const text = String(s.notes_excerpt ?? s.title ?? '').toLowerCase();
    for (const word of text.split(/[^a-z0-9_]+/).filter(w => w.length >= 5)) {
      const row = termBag.get(word) ?? { term: word, count: 0, windows: new Set() };
      row.count += 1;
      row.windows.add(s.window);
      termBag.set(word, row);
    }
  }
  const recurring = [...termBag.values()]
    .filter(t => t.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .map(t => ({ term: t.term, count: t.count, windows: [...t.windows] }));
  const recentTerms = new Set(
    [...termBag.values()].filter(t => t.windows.has('recent')).map(t => t.term)
  );
  const priorTerms = new Set(
    [...termBag.values()].filter(t => t.windows.has('prior')).map(t => t.term)
  );
  const changed_themes = {
    appeared_recently: [...recentTerms].filter(t => !priorTerms.has(t)).slice(0, 6),
    not_appeared_recently: [...priorTerms].filter(t => !recentTerms.has(t)).slice(0, 6)
  };
  const conflict_signals = [];
  const recentNotes = (compare.recent_sessions ?? []).map(s => String(s.notes_excerpt ?? '').toLowerCase());
  if (recentNotes.some(n => /\bimproved\b|\bbetter\b/.test(n)) && recentNotes.some(n => /\bworse\b|\bstuck\b/.test(n))) {
    conflict_signals.push({
      kind: 'conflict_signal',
      text: 'Recent session notes include both improvement and stuck/worse language'
    });
  }
  return {
    ok: true,
    store: 'life_hub_mind',
    kind: 'calculation',
    date: today,
    query: q,
    stated_constraints: stated,
    session_count: sessions.length,
    search_count: searched?.count ?? 0,
    search_partial_count: searched?.partial_count ?? 0,
    focused_tokens: searched?.focused_tokens ?? [],
    recent_sessions: compare.recent_sessions ?? [],
    prior_sessions: compare.prior_sessions ?? [],
    recurring_themes: recurring,
    changed_themes,
    conflict_signals,
    sparse: sessions.length < 2,
    truncated: Boolean(compare.truncated) || Boolean(searched?.truncated),
    kept: compare.kept ?? searched?.kept ?? null,
    omitted: ((compare.omitted ?? 0) + (searched?.omitted ?? 0)) || null,
    how_to_read:
      'Separate stored session statements from derived recurring themes and period comparisons. '
      + 'Mind search results are full AND matches of focused tokens; partial_results are context only. '
      + 'Do not diagnose. Do not convert therapist notes into current clinical state. '
      + 'Do not invent therapist conclusions. Current-turn themes are user_stated_current_turn only.'
  };
}

function isOpenTask(task) {
  if (!task || typeof task !== 'object') return false;
  if (task.status === 'done' || task.bucket === 'done' || task.completed_at) return false;
  return typeof task.title === 'string' && task.title.trim().length > 0;
}

export function getTasksOpenLoops(
  tasks = [],
  projects = [],
  { now = new Date(), stressFlags = [], inbox = [] } = {}
) {
  const open = (Array.isArray(tasks) ? tasks : []).filter(isOpenTask);
  const stalls = findStallCandidates(projects, open, now);
  const stress = [
    ...detectMissedDeadlines(open, now),
    ...detectDensePinches(open, now),
    ...detectOverlappingExcursions(projects)
  ];
  const capacity = buildCapacitySnapshot(open, now, 7);
  return {
    ok: true,
    store: 'tasks_hub',
    kind: 'calculation',
    open_count: open.length,
    capacity_overall: capacity.overall,
    capacity_headlines: capacity.headlines,
    stall_candidates: stalls.slice(0, 8).map(s => ({
      project_id: s.project?.id ?? s.id,
      title: s.project?.title ?? s.title,
      idle_days: s.idle_days,
      open_task_count: s.open_task_count
    })),
    stress_patterns: stress.slice(0, 8),
    stress_flags: (stressFlags ?? []).slice(0, 8),
    inbox_items: (inbox ?? []).slice(0, 8),
    how_to_read: 'Open loops combine open tasks, stall candidates, stress patterns, and inbox flags from Tasks services.'
  };
}

export function getTeachingDiagnosis({
  classes = [],
  lessons = [],
  units = [],
  query = '',
  now = new Date(),
  message = ''
} = {}) {
  const today = (now instanceof Date ? now : new Date(now)).toISOString().slice(0, 10);
  const stated = statedTeachingConstraints(message || query);
  const ctx = getTeachingContext({ classes, lessons, units, query, now, message: message || query });
  const upcoming = hydrateTeachingSchedule(lessons, { now, windowDays: 21 });
  const { drafts } = partitionTeachingLessons(lessons);
  const matchLesson = upcoming.find(l => l.id === ctx.lesson?.id && l.date === ctx.lesson?.date)
    ?? upcoming.find(l => l.id === ctx.lesson?.id)
    ?? null;
  const matchClass = ctx.class
    ? (classes ?? []).find(c => c.id === ctx.class.id) ?? ctx.class
    : null;
  const matchUnit = ctx.unit
    ? (units ?? []).find(u => u.id === ctx.unit.id) ?? ctx.unit
    : null;

  const gaps = [];
  const learningIntentions = extractStoredLearningIntentions(matchLesson);
  if (!matchLesson) {
    gaps.push('No upcoming lesson matched — cannot diagnose delivery sequence.');
  } else {
    const outcomes = matchLesson.outcome_ids ?? [];
    if (!outcomes.length) {
      gaps.push('Lesson has no stored outcome_ids / syllabus_outcomes.');
    }
    if (!learningIntentions.length) {
      gaps.push('No stored learning intention was retrieved (syllabus outcome_ids are not learning intentions).');
    }
    if (!(matchLesson.blocks?.length)) {
      gaps.push('Lesson has no stored blocks to inspect before recommending changes.');
    }
    if (!matchLesson.unit_id) {
      gaps.push('Lesson is not linked to a unit_id in the stored record.');
    }
    if (!matchLesson.title) {
      gaps.push('Scheduled lesson has no resolvable draft title.');
    }
    if (stated.minutes && matchLesson.blocks?.length) {
      gaps.push(`Current-turn time budget is ${stated.minutes} minutes — check whether stored blocks fit that constraint.`);
    }
  }

  const prep = [];
  if (matchLesson && !(matchLesson.blocks?.length)) prep.push('Draft or attach lesson blocks before class.');
  if (matchLesson && !(matchLesson.outcome_ids?.length)) prep.push('Attach syllabus outcomes / outcome_ids.');
  if (matchLesson && !learningIntentions.length) {
    prep.push('No learning-intention text is stored on this lesson (do not treat outcome codes as intentions).');
  }
  if (matchLesson && !matchLesson.start_time) prep.push('No start_time on the scheduled lesson row.');

  return {
    ok: true,
    store: 'teaching_hub',
    kind: 'calculation',
    today,
    query: query || null,
    stated_constraints: {
      minutes: stated.minutes,
      class_hint: stated.classHint,
      year_hint: stated.yearHint
    },
    class: matchClass
      ? { id: matchClass.id, code: matchClass.code, display_name: matchClass.display_name ?? matchClass.title }
      : null,
    unit: matchUnit
      ? {
          id: matchUnit.id,
          title: matchUnit.title,
          code: matchUnit.code,
          lesson_ids: Array.isArray(matchUnit.lesson_ids) ? matchUnit.lesson_ids : []
        }
      : null,
    lesson: matchLesson
      ? {
          id: matchLesson.id,
          scheduled_id: matchLesson.scheduled_id,
          date: matchLesson.date,
          title: matchLesson.title,
          path: matchLesson.path,
          outcome_ids: matchLesson.outcome_ids ?? [],
          // Only genuine learning-intention text — never alias of outcome_ids.
          learning_intentions: learningIntentions,
          block_count: matchLesson.blocks?.length ?? 0,
          sequence: matchLesson.sequence,
          unit_id: matchLesson.unit_id,
          class_id: matchLesson.class_id,
          version: matchLesson.version ?? null
        }
      : null,
    previous_lesson: ctx.previous_lesson,
    next_scheduled: ctx.next_scheduled,
    next_in_unit: ctx.next_in_unit,
    next_in_unit_basis: ctx.next_in_unit_basis,
    diagnosis_gaps: gaps,
    preparation: prep,
    draft_count: drafts.length,
    how_to_read:
      'Diagnose from stored Teaching fields (schedule, draft blocks, outcome_ids, unit.lesson_ids). '
      + 'Syllabus outcome_ids are curriculum codes, not learning intentions. '
      + 'learning_intentions are only present when genuine intention text is stored (for example a learning_intention block). '
      + 'Unit sequence next is a stored curriculum order when next_in_unit_basis=unit_lesson_ids. '
      + 'A pedagogical rewrite beyond those fields is inference. Current-turn time budgets are user_stated_current_turn. '
      + 'Propose writes only via Teaching confirm / os_propose_action.'
  };
}

/** Genuine learning-intention text only — never syllabus outcome codes. */
function extractStoredLearningIntentions(lesson) {
  if (!lesson || typeof lesson !== 'object') return [];
  const direct = [];
  for (const field of ['learning_intentions', 'learning_intention', 'intentions']) {
    const value = lesson[field];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && item.trim()) direct.push(item.trim());
        else if (item && typeof item === 'object' && typeof item.text === 'string' && item.text.trim()) {
          direct.push(item.text.trim());
        }
      }
    } else if (typeof value === 'string' && value.trim()) {
      direct.push(value.trim());
    }
  }
  const fromBlocks = [];
  for (const block of lesson.blocks ?? []) {
    const style = String(block?.style ?? block?.block_type ?? block?.type ?? '').toLowerCase();
    if (!style.includes('learning_intention') && style !== 'intention') continue;
    const content = block?.content && typeof block.content === 'object' ? block.content : {};
    const text = content.text ?? content.html ?? content.title ?? block.text ?? null;
    if (typeof text === 'string' && text.trim()) fromBlocks.push(text.trim());
  }
  const merged = [...direct, ...fromBlocks];
  // Drop values that are only syllabus outcome codes (e.g. EN5-1A).
  return merged.filter(text => !/^[A-Z]{1,6}\d/i.test(text) || text.includes(' '));
}

export function getKnowledgeSynthesis(pages = [], { query = '', limit = 10 } = {}) {
  const q = topicQuery(query) || String(query ?? '').trim();
  if (q.length < 2) return { ok: false, error: 'empty_query', store: 'knowledge_hub' };
  const ranked = rankKnowledgePages(pages, q).slice(0, limit);
  const docs = ranked.map(p => ({
    id: p.id,
    title: p.title,
    text: [p.title, p.excerpt, p.summary, ...(p.claims ?? [])].filter(Boolean).join('\n'),
    tags: p.tags ?? [],
    connected: p.connected ?? p.backlinks ?? []
  }));
  const research = researchFromDocs({ query: q, docs, k: limit });
  const coverage = coverageFromResearch(research);

  const hitIds = new Set(ranked.map(p => p.id));
  const graphLinks = [];
  const inferredRelations = [];
  for (const page of ranked) {
    const connected = normalizeConnectedList(page.connected ?? page.backlinks ?? []);
    for (const target of connected) {
      if (hitIds.has(target) && target !== page.id) {
        graphLinks.push({ from: page.id, to: target, kind: 'graph_link' });
      }
    }
    for (const other of ranked) {
      if (other.id === page.id) continue;
      const sharedTags = intersectTags(page.tags, other.tags);
      if (sharedTags.length && !connected.includes(other.id)) {
        inferredRelations.push({
          from: page.id,
          to: other.id,
          kind: 'inferred_overlap',
          shared_tags: sharedTags
        });
      }
    }
  }

  const conflicts = detectNoteConflicts(ranked);
  const themes = deriveRecurringThemes(ranked);
  const weak = ranked.length > 0 && Math.max(...ranked.map(p => Number(p.score) || 0)) < 25;
  const gaps = [...(research.gaps ?? [])];
  if (weak) gaps.push('Matches look lexically weak — do not treat them as strong conceptual agreement.');
  if (conflicts.length) gaps.push('Retrieved notes disagree — keep both sides visible.');
  if (!ranked.length) gaps.push(`No archive notes matched “${q}”.`);

  return {
    ok: true,
    store: 'knowledge_hub',
    kind: 'calculation',
    query: q,
    hits: ranked.map(p => ({
      id: p.id,
      title: p.title,
      path: p.path ?? null,
      tags: p.tags ?? [],
      connected: normalizeConnectedList(p.connected ?? p.backlinks ?? []),
      claims: p.claims ?? [],
      excerpt: p.excerpt ?? p.summary ?? null,
      score: p.score ?? null
    })),
    graph_links: dedupeLinks(graphLinks),
    inferred_relations: dedupeLinks(inferredRelations).slice(0, 12),
    conflicts,
    themes,
    coverage: {
      ...coverage,
      weak_match: weak,
      graph_link_count: dedupeLinks(graphLinks).length,
      inferred_relation_count: dedupeLinks(inferredRelations).length,
      conflict_count: conflicts.length
    },
    gaps,
    how_to_read:
      'Cite hit ids for note facts. graph_links are stored connections. '
      + 'inferred_relations are lexical/tag overlap only — not stored links. '
      + 'themes and cross-note conclusions are derived. conflicts stay visible. Never invent pages.'
  };
}

function normalizeConnectedList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object') return item.id || item.pageId || item.target || null;
      return null;
    })
    .filter(Boolean);
}

function intersectTags(a = [], b = []) {
  const left = new Set((a ?? []).map(tag => String(tag).toLowerCase()));
  return (b ?? []).map(tag => String(tag)).filter(tag => left.has(tag.toLowerCase()));
}

function dedupeLinks(links) {
  const seen = new Set();
  const out = [];
  for (const link of links ?? []) {
    const key = [link.kind, link.from, link.to, ...(link.shared_tags ?? [])].join(':');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(link);
  }
  return out;
}

function detectNoteConflicts(pages = []) {
  const conflicts = [];
  const polarity = [
    ['supports', 'rejects'],
    ['agree', 'disagree'],
    ['works', 'fails'],
    ['effective', 'ineffective'],
    ['true', 'false'],
    ['yes', 'no']
  ];

  function tokensOf(text) {
    return new Set(
      String(text ?? '')
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter(Boolean)
    );
  }

  function hasWord(tokens, word) {
    return tokens.has(String(word).toLowerCase());
  }

  function sharedSubjectSignal(a, b) {
    const tagsA = new Set((a.tags ?? []).map(tag => String(tag).toLowerCase()));
    const tagOverlap = (b.tags ?? []).some(tag => tagsA.has(String(tag).toLowerCase()));
    if (tagOverlap) return true;
    const wordsA = tokensOf([a.title, a.excerpt, ...(a.claims ?? [])].join(' '));
    const wordsB = tokensOf([b.title, b.excerpt, ...(b.claims ?? [])].join(' '));
    let shared = 0;
    for (const word of wordsA) {
      if (word.length < 4) continue;
      if (wordsB.has(word)) shared += 1;
      if (shared >= 2) return true;
    }
    return false;
  }

  for (let i = 0; i < pages.length; i++) {
    for (let j = i + 1; j < pages.length; j++) {
      const a = pages[i];
      const b = pages[j];
      if (!sharedSubjectSignal(a, b)) continue;
      const tokensA = tokensOf([a.title, a.excerpt, a.summary, ...(a.claims ?? [])].join(' '));
      const tokensB = tokensOf([b.title, b.excerpt, b.summary, ...(b.claims ?? [])].join(' '));
      for (const [pos, neg] of polarity) {
        const aPos = hasWord(tokensA, pos) && !hasWord(tokensA, neg);
        const aNeg = hasWord(tokensA, neg) && !hasWord(tokensA, pos);
        const bPos = hasWord(tokensB, pos) && !hasWord(tokensB, neg);
        const bNeg = hasWord(tokensB, neg) && !hasWord(tokensB, pos);
        if ((aPos && bNeg) || (aNeg && bPos)) {
          conflicts.push({
            a: a.id,
            b: b.id,
            signal: `${pos}/${neg}`,
            kind: 'conflict_signal'
          });
        }
      }
      const claimsA = (a.claims ?? []).map(c => String(c).toLowerCase().trim());
      const claimsB = (b.claims ?? []).map(c => String(c).toLowerCase().trim());
      for (const ca of claimsA) {
        for (const cb of claimsB) {
          if (!ca || !cb || ca === cb) continue;
          const aNegated = ca.startsWith('not ') ? ca.slice(4) : null;
          const bNegated = cb.startsWith('not ') ? cb.slice(4) : null;
          if ((aNegated && aNegated === cb) || (bNegated && bNegated === ca)) {
            conflicts.push({ a: a.id, b: b.id, signal: 'negated_claim', kind: 'conflict_signal' });
          }
        }
      }
    }
  }
  return conflicts.slice(0, 8);
}

function deriveRecurringThemes(pages = []) {
  const counts = new Map();
  for (const page of pages) {
    for (const tag of page.tags ?? []) {
      const key = String(tag).toLowerCase();
      if (!key) continue;
      const row = counts.get(key) ?? { tag, count: 0, page_ids: [] };
      row.count += 1;
      row.page_ids.push(page.id);
      counts.set(key, row);
    }
  }
  return [...counts.values()]
    .filter(row => row.count >= 2)
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, 8)
    .map(row => ({
      theme: row.tag,
      count: row.count,
      page_ids: row.page_ids,
      kind: 'derived_theme'
    }));
}

export function getHammondAttentionPack({
  tasks = [],
  projects = [],
  classes = [],
  lessons = [],
  mindEvents = [],
  workouts = [],
  meals = [],
  loadErrors = {},
  stressFlags = [],
  inbox = [],
  today,
  now = new Date()
} = {}) {
  const openLoops = getTasksOpenLoops(tasks, projects, { now, stressFlags, inbox });
  const teachingUpcoming = (lessons ?? [])
    .filter(l => l?.date && l.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);
  const recentMind = (mindEvents ?? []).slice(0, 5).map(e => ({
    date: e.record?.date ?? e.date,
    type: e.record?.type ?? e.type
  }));
  const unavailable = Object.entries(loadErrors || {})
    .filter(([, err]) => err)
    .map(([hub, error]) => ({ hub, error }));

  return {
    ok: true,
    store: 'cross_hub',
    kind: 'calculation',
    open_loops: openLoops,
    teaching_upcoming: teachingUpcoming.map(l => ({
      id: l.id,
      date: l.date,
      title: l.title ?? l.display_title,
      class_id: l.class_id
    })),
    class_count: (classes ?? []).length,
    recent_mind_meta: recentMind,
    fitness_sessions_loaded: (workouts ?? []).length,
    nutrition_meals_loaded: (meals ?? []).length,
    unavailable_hubs: unavailable,
    attention_candidates: [
      ...(openLoops.stall_candidates ?? []).slice(0, 3).map(s => ({
        kind: 'stall',
        label: s.title,
        idle_days: s.idle_days
      })),
      ...teachingUpcoming.slice(0, 2).map(l => ({
        kind: 'teaching_upcoming',
        label: l.title ?? l.display_title,
        date: l.date
      }))
    ],
    decision_record_stub: {
      kind: 'inference_boundary',
      note: 'Hammond may draft a decision record (options + assumptions) but must not treat it as user truth until Confirm.'
    },
    how_to_read:
      'Cross-hub attention pack. Name unavailable hubs. Delegate to specialists with observable handoffs; do not invent their domain rows.'
  };
}
