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
  searchDiaryRecords
} from './domain-retrieval.mjs';
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
  return {
    ok: true,
    store: 'life_hub_nutrition',
    kind: 'calculation',
    date: today,
    week,
    previous_week: previous,
    month: adherence.month,
    week_vs_previous: {
      protein_hit_rate_delta_pp: (week.protein_hit_rate_pct ?? 0) - (previous.protein_hit_rate_pct ?? 0),
      avg_protein_delta_g: (week.avg_protein_g ?? 0) - (previous.avg_protein_g ?? 0)
    },
    days_with_meals_this_week: weekDays.map(d => d.date),
    how_to_read: 'Week vs previous-week deltas are calculated from meal files.'
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
    .map(e => e.record ?? e)
    .sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
  const recent = sessions.slice(0, 5);
  const prior = sessions.slice(5, 10);
  const summarise = s => ({
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
        response_tags: r.response_tags ?? r.effects ?? []
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
      'Helping/not-helping judgments must cite early vs late log notes and procedures. Missing response notes = missing evidence, not proof of failure.'
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
  now = new Date()
} = {}) {
  const today = now.toISOString().slice(0, 10);
  const q = String(query ?? '').trim().toLowerCase();
  const upcoming = (lessons ?? [])
    .filter(l => l?.date && l.date >= today && l.delivery_status !== 'cancelled')
    .sort((a, b) => a.date.localeCompare(b.date));
  const matchLesson =
    upcoming.find(l => [l.title, l.display_title, l.id].some(v => String(v ?? '').toLowerCase().includes(q))) ??
    upcoming[0] ??
    null;
  const matchClass = matchLesson?.class_id
    ? (classes ?? []).find(c => c.id === matchLesson.class_id)
    : (classes ?? []).find(c =>
        [c.code, c.display_name, c.title].some(v => String(v ?? '').toLowerCase().includes(q))
      );
  const matchUnit = matchLesson?.unit_id
    ? (units ?? []).find(u => u.id === matchLesson.unit_id)
    : (units ?? []).find(u => [u.title, u.code, u.id].some(v => String(v ?? '').toLowerCase().includes(q)));

  const gaps = [];
  if (!matchLesson) gaps.push('No upcoming lesson matched — cannot diagnose delivery sequence.');
  if (matchLesson && !matchLesson.learning_intentions?.length && !matchLesson.objectives?.length) {
    gaps.push('Lesson lacks learning intentions/objectives in the stored record.');
  }
  if (matchLesson && !matchLesson.blocks?.length && !matchLesson.activities?.length) {
    gaps.push('Lesson has no stored blocks/activities to inspect before recommending changes.');
  }

  return {
    ok: true,
    store: 'teaching_hub',
    kind: 'calculation',
    today,
    query: query || null,
    class: matchClass
      ? { id: matchClass.id, code: matchClass.code, display_name: matchClass.display_name ?? matchClass.title }
      : null,
    unit: matchUnit ? { id: matchUnit.id, title: matchUnit.title, code: matchUnit.code } : null,
    lesson: matchLesson
      ? {
          id: matchLesson.id,
          date: matchLesson.date,
          title: matchLesson.title ?? matchLesson.display_title,
          learning_intentions: matchLesson.learning_intentions ?? matchLesson.objectives ?? [],
          block_count: matchLesson.blocks?.length ?? matchLesson.activities?.length ?? 0,
          version: matchLesson.version ?? matchLesson.revision ?? null
        }
      : null,
    diagnosis_gaps: gaps,
    how_to_read:
      'Diagnose from these stored fields before proposing lesson changes. Propose only via Teaching confirm / os_propose_action.'
  };
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
  return {
    ok: true,
    store: 'knowledge_hub',
    kind: 'calculation',
    query: q,
    hits: ranked.map(p => ({
      id: p.id,
      title: p.title,
      tags: p.tags ?? [],
      connected: p.connected ?? p.backlinks ?? [],
      claims: p.claims ?? [],
      excerpt: p.excerpt ?? p.summary ?? null
    })),
    coverage,
    how_to_read: 'Synthesis must cite hit ids. Coverage gaps are missing evidence, not permission to invent sources.'
  };
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
