/**
 * Domain retrieval tools — read-only wrappers over existing stores/models.
 * Write authority stays on log_entry / os_propose_action / Confirm.
 */
import { addCalendarDays, isCalendarDate } from '../../../apps/life/js/core/time.js';
import { buildNutritionModel } from '../../../apps/life/js/app/nutrition-model.js';
import { TARGETS_CONFIG } from './targets-config.mjs';
import { searchMindRecords } from './mind-session-read.mjs';
import { getBodyState } from './fitness-tools.mjs';
import { buildCapacitySnapshot } from './tasks-capacity.mjs';
import {
  detectDensePinches,
  detectMissedDeadlines,
  detectOverlappingExcursions
} from './tasks-stress.mjs';
import { searchTeachingRecords } from './teaching-search.mjs';
import { formatHubAgentContext } from './hub-agent-context.mjs';
import { getWeekReviewSchema } from './hammond-week.mjs';
import { rankKnowledgePages } from './knowledge-data.mjs';
import { NUTRITION_LOG_PATH, SKINCARE_LOG_PATH } from './treatment-state.mjs';

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;

function capLimit(limit, fallback = DEFAULT_LIMIT) {
  return Math.min(Math.max(Number(limit) || fallback, 1), MAX_LIMIT);
}

function tokens(query) {
  return String(query ?? '')
    .toLowerCase()
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length >= 2);
}

function truncatedMeta(total, kept) {
  if (total <= kept) return { truncated: false, kept, omitted: 0 };
  return { truncated: true, kept, omitted: total - kept };
}

function mealEventsFromRecords(records) {
  return (Array.isArray(records) ? records : [])
    .filter(record => record?.type === 'meal')
    .map(record => ({ record, body: record.notes ?? '' }));
}

export function getNutritionSnapshot(records, today, { targetsConfig = TARGETS_CONFIG, nutritionChallenges = null } = {}) {
  if (!isCalendarDate(today)) return { ok: false, error: 'invalid_date', store: 'life_hub_nutrition' };
  const model = buildNutritionModel({
    events: mealEventsFromRecords(records),
    targetsConfig,
    date: today,
    nutritionChallenges
  });
  return {
    ok: true,
    store: 'life_hub_nutrition',
    same_as: 'Nutrition page today / week summary',
    date: today,
    day_type: model.dayType,
    today: model.macroSplit,
    meals_today: model.mealsToday,
    advice: model.advice || null,
    challenges: (model.challenges ?? []).map(c => ({
      id: c.id,
      title: c.title,
      status: c.status,
      tally: c.tally
    })),
    protein_trend: model.proteinTrend
  };
}

export function getNutritionAdherence(records, today, { targetsConfig = TARGETS_CONFIG } = {}) {
  if (!isCalendarDate(today)) return { ok: false, error: 'invalid_date', store: 'life_hub_nutrition' };
  const model = buildNutritionModel({
    events: mealEventsFromRecords(records),
    targetsConfig,
    date: today
  });
  const summarise = days => {
    const withLogs = days.filter(d => d.calories > 0 || d.protein_g > 0);
    const proteinHits = days.filter(d => d.hitProtein).length;
    return {
      days_logged: withLogs.length,
      protein_target_hits: proteinHits,
      protein_hit_rate_pct: days.length
        ? Math.round((proteinHits / days.length) * 100)
        : 0,
      over_fat_days: days.filter(d => d.overFatCeiling).length,
      avg_protein_g: withLogs.length
        ? Math.round(withLogs.reduce((s, d) => s + d.protein_g, 0) / withLogs.length)
        : 0
    };
  };
  return {
    ok: true,
    store: 'life_hub_nutrition',
    same_as: 'Nutrition page week/month adherence',
    date: today,
    week: summarise(model.week),
    previous_week: summarise(model.previousWeek),
    month: summarise(model.month),
    how_to_read: 'Deterministic counts from meal files — not an estimate.'
  };
}

export function getNutritionTargets(today, { targetsConfig = TARGETS_CONFIG, dayType = 'rest' } = {}) {
  if (!isCalendarDate(today)) return { ok: false, error: 'invalid_date' };
  const model = buildNutritionModel({
    events: [],
    targetsConfig,
    date: today
  });
  return {
    ok: true,
    store: 'life_hub_nutrition',
    date: today,
    day_type: model.dayType || dayType,
    targets: model.targets
  };
}

export function searchNutritionRecords(records, { query, limit = DEFAULT_LIMIT } = {}) {
  const toks = tokens(query);
  if (!toks.length) return { ok: false, error: 'empty_query', store: 'life_hub_nutrition' };
  const cap = capLimit(limit);
  const all = (records ?? []).filter(r => r?.type === 'meal');
  const hits = all
    .map(record => {
      const hay = [
        record.date,
        record.meal,
        record.notes,
        record.calories,
        record.protein_g
      ].filter(Boolean).join(' ').toLowerCase();
      const matched = toks.filter(t => hay.includes(t));
      return { record, score: matched.length };
    })
    .filter(row => row.score === toks.length)
    .sort((a, b) => String(b.record.date ?? '').localeCompare(String(a.record.date ?? '')));
  const slice = hits.slice(0, cap);
  return {
    ok: true,
    store: 'life_hub_nutrition',
    query,
    count: slice.length,
    ...truncatedMeta(hits.length, slice.length),
    results: slice.map(({ record }) => ({
      date: record.date,
      meal: record.meal,
      calories: record.calories,
      protein_g: record.protein_g,
      fat_g: record.fat_g,
      notes: record.notes
    }))
  };
}

export function getWeightTrend({ compositionRecords = [], measurementRecords = [] } = {}) {
  const comps = Array.isArray(compositionRecords) ? compositionRecords : [];
  const measures = Array.isArray(measurementRecords) ? measurementRecords : [];
  if (!comps.length && !measures.length) {
    return {
      ok: true,
      found: false,
      store: 'life_hub_body',
      message: 'No composition or measurement records loaded this turn.'
    };
  }
  const weights = comps
    .filter(r => typeof r.weight_kg === 'number')
    .map(r => ({ date: r.date, weight_kg: r.weight_kg, body_fat_pct: r.body_fat_pct ?? null }));
  const latest = weights[0] ?? null;
  const previous = weights[1] ?? null;
  let delta_kg = null;
  if (latest && previous) delta_kg = Math.round((latest.weight_kg - previous.weight_kg) * 10) / 10;
  return {
    ok: true,
    found: true,
    store: 'life_hub_body',
    same_as: 'Body page weight/composition trend',
    latest,
    previous,
    delta_kg,
    readings: weights.slice(0, 8),
    ...truncatedMeta(weights.length, Math.min(weights.length, 8)),
    conflict: latest && previous && Math.abs(delta_kg) >= 5
      ? {
          kind: 'large_weight_delta',
          message: `Latest weight ${latest.weight_kg}kg vs prior ${previous.weight_kg}kg (Δ ${delta_kg}). Confirm both readings before treating as one trend.`
        }
      : null
  };
}

export function searchDiaryRecords(events, input = {}) {
  const result = searchMindRecords(events, {
    ...input,
    record_types: ['diary']
  });
  if (!result?.ok) return result;
  return {
    ...result,
    store: 'life_hub_diary',
    how_to_read: 'Diary metadata/search hits from Mind files — retrieve before asking Adam to paste prior entries.'
  };
}

export function getDiaryRange(events, { from, to, limit = DEFAULT_LIMIT } = {}) {
  if (!isCalendarDate(from) || !isCalendarDate(to) || from > to) {
    return { ok: false, error: 'invalid_range', store: 'life_hub_diary' };
  }
  const cap = capLimit(limit);
  const all = (events ?? [])
    .filter(e => e?.record?.type === 'diary' && e.record.date >= from && e.record.date <= to)
    .sort((a, b) => String(b.record.date).localeCompare(String(a.record.date)));
  const slice = all.slice(0, cap);
  return {
    ok: true,
    store: 'life_hub_diary',
    from,
    to,
    count: slice.length,
    ...truncatedMeta(all.length, slice.length),
    results: slice.map(e => ({
      date: e.record.date,
      mood: e.record.mood,
      mood_score: e.record.mood_score,
      energy: e.record.energy,
      notes: typeof e.record.notes === 'string' ? e.record.notes.slice(0, 240) : undefined,
      path: e.path
    }))
  };
}

export function searchSkincareRecords(records, { query, limit = DEFAULT_LIMIT } = {}) {
  const toks = tokens(query);
  if (!toks.length) return { ok: false, error: 'empty_query', store: 'life_hub_skincare' };
  const cap = capLimit(limit);
  const all = Array.isArray(records) ? records : [];
  const hits = all
    .map(record => {
      const hay = [record.date, record.notes, record.routine, record.body, record.path]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const matched = toks.filter(t => hay.includes(t));
      return { record, score: matched.length };
    })
    .filter(row => row.score === toks.length)
    .sort((a, b) => String(b.record.date ?? '').localeCompare(String(a.record.date ?? '')));
  const slice = hits.slice(0, cap);
  return {
    ok: true,
    store: 'life_hub_skincare',
    query,
    count: slice.length,
    ...truncatedMeta(hits.length, slice.length),
    results: slice.map(({ record }) => ({
      date: record.date,
      routine: record.routine ?? record.name,
      notes: record.notes,
      is_procedure: Boolean(record.is_procedure)
    }))
  };
}

export function getSkincareAdherence(records, today, { lookbackDays = 14 } = {}) {
  if (!isCalendarDate(today)) return { ok: false, error: 'invalid_date', store: 'life_hub_skincare' };
  const from = addCalendarDays(today, -(lookbackDays - 1));
  const inWindow = (Array.isArray(records) ? records : []).filter(
    r => r?.date && r.date >= from && r.date <= today
  );
  const byDate = new Map();
  for (const record of inWindow) {
    const list = byDate.get(record.date) ?? [];
    list.push(record);
    byDate.set(record.date, list);
  }
  const daysWithLog = byDate.size;
  const procedures = inWindow.filter(r => r.is_procedure);
  return {
    ok: true,
    store: 'life_hub_skincare',
    from,
    to: today,
    lookback_days: lookbackDays,
    days_with_log: daysWithLog,
    adherence_pct: Math.round((daysWithLog / lookbackDays) * 100),
    procedure_count: procedures.length,
    recent: inWindow.slice(0, 12).map(r => ({
      date: r.date,
      routine: r.routine ?? r.name,
      is_procedure: Boolean(r.is_procedure),
      notes: r.notes
    })),
    ...truncatedMeta(inWindow.length, Math.min(inWindow.length, 12))
  };
}

function isOpenTask(task) {
  if (!task || typeof task !== 'object') return false;
  if (task.status === 'done' || task.bucket === 'done' || task.completed_at) return false;
  return typeof task.title === 'string' && task.title.trim().length > 0;
}

export function getTasksFocus(tasks = [], projects = [], { now = new Date() } = {}) {
  const open = (Array.isArray(tasks) ? tasks : []).filter(isOpenTask);
  const capacity = buildCapacitySnapshot(open, now, 7);
  const stress = [
    ...detectMissedDeadlines(open, now),
    ...detectDensePinches(open, now),
    ...detectOverlappingExcursions(projects)
  ];
  const overdue = open
    .filter(t => t.due_date && String(t.due_date) < now.toISOString().slice(0, 10))
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
  const dueSoon = open
    .filter(t => t.due_date && String(t.due_date) >= now.toISOString().slice(0, 10))
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))
    .slice(0, 8);
  const stale = open
    .filter(t => t.updated_at || t.created_at)
    .slice()
    .sort((a, b) => String(a.updated_at || a.created_at).localeCompare(String(b.updated_at || b.created_at)))
    .slice(0, 5);
  return {
    ok: true,
    store: 'tasks_hub',
    open_count: open.length,
    capacity: {
      overall: capacity.overall,
      headlines: capacity.headlines,
      days: capacity.days.slice(0, 7)
    },
    stress_flags: stress.slice(0, 8),
    overdue: overdue.slice(0, 8).map(summariseTask),
    due_soon: dueSoon.map(summariseTask),
    stale_candidates: stale.map(summariseTask),
    ...truncatedMeta(open.length, Math.min(open.length, 12))
  };
}

function summariseTask(task) {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    domain: task.domain,
    priority: task.priority,
    due_date: task.due_date ?? null,
    parent_project_id: task.parent_project_id ?? null
  };
}

export function searchTasks(tasks = [], { query, limit = DEFAULT_LIMIT } = {}) {
  const toks = tokens(query);
  if (!toks.length) return { ok: false, error: 'empty_query', store: 'tasks_hub' };
  const cap = capLimit(limit);
  const hits = (tasks ?? [])
    .filter(isOpenTask)
    .map(task => {
      const hay = [task.title, task.domain, task.status, task.notes, task.id]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const matched = toks.filter(t => hay.includes(t));
      return { task, score: matched.length };
    })
    .filter(row => row.score === toks.length);
  const slice = hits.slice(0, cap);
  return {
    ok: true,
    store: 'tasks_hub',
    query,
    count: slice.length,
    ...truncatedMeta(hits.length, slice.length),
    results: slice.map(({ task }) => summariseTask(task))
  };
}

export function getTask(tasks = [], { task_id } = {}) {
  const id = String(task_id ?? '').trim();
  if (!id) return { ok: false, error: 'missing_task_id', store: 'tasks_hub' };
  const task = (tasks ?? []).find(t => t?.id === id);
  if (!task) return { ok: true, found: false, store: 'tasks_hub', task_id: id };
  return { ok: true, found: true, store: 'tasks_hub', task };
}

/** Split mixed Teaching hub loads (draft lessons + scheduled_lesson rows). */
export function partitionTeachingLessons(records = []) {
  const drafts = [];
  const scheduled = [];
  for (const item of records ?? []) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    if (item.type === 'scheduled_lesson') {
      scheduled.push(item);
      continue;
    }
    if (item.type === 'lesson') {
      drafts.push(item);
      continue;
    }
    // chat.mjs merges both prefixes without always preserving type.
    if (item.lesson_id && item.date && !Array.isArray(item.blocks)) {
      scheduled.push(item);
      continue;
    }
    drafts.push(item);
  }
  return { drafts, scheduled };
}

/**
 * Join scheduled_lesson rows to draft lesson content so Ann can reason over
 * real titles, blocks, outcomes, and unit sequence — not bare schedule ids.
 */
export function hydrateTeachingSchedule(lessons = [], { now = new Date(), windowDays = 14 } = {}) {
  const today = (now instanceof Date ? now : new Date(now)).toISOString().slice(0, 10);
  const until = addCalendarDays(today, windowDays);
  const { drafts, scheduled } = partitionTeachingLessons(lessons);
  const byId = new Map();
  for (const draft of drafts) {
    if (draft?.id) byId.set(draft.id, draft);
  }

  const hydrated = [];
  for (const row of scheduled) {
    if (!row?.date || row.date < today || row.date > until) continue;
    if (row.delivery_status === 'cancelled' || row.delivery_status === 'skipped') continue;
    const draft = byId.get(row.lesson_id) ?? null;
    hydrated.push({
      id: draft?.id ?? row.lesson_id ?? row.id,
      scheduled_id: row.id ?? null,
      lesson_id: row.lesson_id ?? draft?.id ?? null,
      date: row.date,
      start_time: row.start_time ?? null,
      schedule_order: row.schedule_order ?? null,
      delivery_status: row.delivery_status ?? null,
      class_id: row.class_id ?? draft?.class_id ?? null,
      unit_id: row.unit_id ?? draft?.unit_id ?? null,
      title: draft?.title ?? draft?.display_title ?? row.title ?? null,
      path: draft?.path ?? row.path ?? null,
      blocks: Array.isArray(draft?.blocks) ? draft.blocks : [],
      outcome_ids: draft?.outcome_ids ?? draft?.syllabus_outcomes ?? [],
      sequence: Number.isFinite(draft?.sequence) ? draft.sequence : null,
      source: 'scheduled',
      version: draft?.version ?? draft?.revision ?? null,
      updated_at: draft?.updated_at ?? row.updated_at ?? null
    });
  }

  for (const draft of drafts) {
    if (!draft?.date || draft.date < today || draft.date > until) continue;
    if (draft.delivery_status === 'cancelled' || draft.delivery_status === 'skipped') continue;
    if (hydrated.some(item => item.id === draft.id && item.date === draft.date)) continue;
    hydrated.push({
      id: draft.id,
      scheduled_id: null,
      lesson_id: draft.id,
      date: draft.date,
      start_time: draft.start_time ?? null,
      schedule_order: draft.schedule_order ?? null,
      delivery_status: draft.delivery_status ?? null,
      class_id: draft.class_id ?? null,
      unit_id: draft.unit_id ?? null,
      title: draft.title ?? draft.display_title ?? null,
      path: draft.path ?? null,
      blocks: Array.isArray(draft.blocks) ? draft.blocks : [],
      outcome_ids: draft.outcome_ids ?? draft.syllabus_outcomes ?? [],
      sequence: Number.isFinite(draft.sequence) ? draft.sequence : null,
      source: 'lesson',
      version: draft.version ?? draft.revision ?? null,
      updated_at: draft.updated_at ?? null
    });
  }

  return hydrated.sort((a, b) => {
    const byDate = String(a.date).localeCompare(String(b.date));
    if (byDate) return byDate;
    return Number(a.schedule_order ?? 0) - Number(b.schedule_order ?? 0);
  });
}

/** Current-turn teaching constraints. Not stored preferences. */
export function statedTeachingConstraints(message) {
  const text = String(message ?? '');
  const lower = text.toLowerCase();
  const minuteMatch = lower.match(/\b(?:only\s+(?:got\s+|have\s+)?(?:about\s+|around\s+)?)?(\d{1,3})\s*(?:minutes|mins|min)\b/);
  const hourMatch = lower.match(/\b(?:only\s+(?:got\s+|have\s+)?(?:about\s+|around\s+)?)?(\d(?:\.\d+)?)\s*hours?\b/);
  let minutes = null;
  if (minuteMatch) minutes = Number(minuteMatch[1]);
  else if (hourMatch) minutes = Math.round(Number(hourMatch[1]) * 60);
  if (!Number.isFinite(minutes) || minutes <= 0) minutes = null;

  const classCode = text.match(/\b([0-9]{1,2}[A-Z]{2,}[A-Z0-9]*)\b/);
  const yearClass = lower.match(/\byear\s*([0-9]{1,2})\b/);
  return {
    minutes,
    classHint: classCode ? classCode[1] : null,
    yearHint: yearClass ? `year ${yearClass[1]}` : null,
    wantsToday: /\b(today|this morning|this afternoon)\b/.test(lower),
    wantsTomorrow: /\btomorrow\b/.test(lower),
    wantsNext: /\b(what(?:'s| is) next|next (?:for|lesson|class)|follow(?:s|ing)?\b.*\blesson|after (?:this|the) (?:lesson|class))\b/.test(lower),
    wantsGaps: /\b(missing|gap|gaps|incomplete|prepare|preparation|intentions?|outcomes?)\b/.test(lower),
    wantsSequence: /\b(sequence|unit|scope|follow|following|connect(?:s|ed|ion)?)\b/.test(lower)
  };
}

function matchTeachingClass(activeClasses, query, stated = {}) {
  const q = String(query ?? '').trim().toLowerCase();
  const hint = String(stated.classHint ?? stated.yearHint ?? '').toLowerCase();
  const hay = hint || q;
  if (!hay) return null;
  return activeClasses.find(c =>
    [c.code, c.display_name, c.title, c.id].some(v => String(v ?? '').toLowerCase().includes(hay))
  ) ?? activeClasses.find(c =>
    hay.split(/\s+/).filter(t => t.length >= 2).some(token =>
      [c.code, c.display_name, c.title].some(v => String(v ?? '').toLowerCase().includes(token))
    )
  ) ?? null;
}

function matchTeachingLesson(upcoming, query, stated = {}, classId = null) {
  const pool = classId ? upcoming.filter(l => l.class_id === classId) : upcoming;
  if (!pool.length) return null;
  if (stated.wantsToday) {
    const todayHit = pool.find(l => l.date === (stated.today || null));
    if (todayHit) return todayHit;
  }
  const q = String(query ?? '').trim().toLowerCase();
  if (q) {
    const direct = pool.find(l =>
      [l.title, l.id, l.lesson_id, l.scheduled_id].some(v => String(v ?? '').toLowerCase().includes(q))
    );
    if (direct) return direct;
    const tokens = q.split(/\s+/).filter(t => t.length >= 3 && !['the', 'and', 'for', 'this', 'what', 'next', 'lesson', 'class', 'teach', 'teaching', 'today', 'tomorrow'].includes(t));
    const scored = pool
      .map(l => ({
        lesson: l,
        score: tokens.reduce((n, token) => n + (String(l.title ?? '').toLowerCase().includes(token) ? 1 : 0), 0)
      }))
      .filter(row => row.score > 0)
      .sort((a, b) => b.score - a.score);
    if (scored[0]) return scored[0].lesson;
  }
  return pool[0] ?? null;
}

function nextFromUnitSequence(lesson, units = [], drafts = []) {
  if (!lesson?.unit_id) return { next: null, basis: 'unavailable_source' };
  const unit = (units ?? []).find(u => u.id === lesson.unit_id) ?? null;
  const ids = Array.isArray(unit?.lesson_ids) ? unit.lesson_ids : [];
  const currentId = lesson.lesson_id ?? lesson.id;
  const idx = ids.indexOf(currentId);
  if (idx < 0) return { next: null, basis: 'unavailable_source', unit };
  if (idx >= ids.length - 1) return { next: null, basis: 'unit_end', unit };
  const nextId = ids[idx + 1];
  const draft = (drafts ?? []).find(d => d.id === nextId) ?? null;
  return {
    unit,
    basis: 'unit_lesson_ids',
    next: {
      id: nextId,
      title: draft?.title ?? draft?.display_title ?? null,
      sequence: Number.isFinite(draft?.sequence) ? draft.sequence : null,
      unit_id: lesson.unit_id,
      path: draft?.path ?? null
    }
  };
}

export function searchTeaching({ query, classes = [], lessons = [], units = [], limit = DEFAULT_LIMIT } = {}) {
  const q = String(query ?? '').trim();
  if (q.length < 2) return { ok: false, error: 'empty_query', store: 'teaching_hub' };
  const cap = capLimit(limit);
  const { drafts } = partitionTeachingLessons(lessons);
  const lessonPool = drafts.length ? drafts : lessons;
  let hits = [
    ...searchTeachingRecords(q, classes, 'class'),
    ...searchTeachingRecords(q, lessonPool, 'lesson'),
    ...searchTeachingRecords(q, units, 'unit')
  ];
  // Natural-language questions rarely equal a title; fall back to token hits.
  if (!hits.length) {
    const stop = new Set([
      'the', 'and', 'for', 'this', 'that', 'what', 'when', 'where', 'which', 'with',
      'from', 'have', 'next', 'about', 'please', 'help', 'teach', 'teaching', 'lesson',
      'lessons', 'class', 'today', 'tomorrow', 'should', 'would', 'could', 'into', 'over'
    ]);
    const toks = tokens(q).filter(t => t.length >= 3 && !stop.has(t));
    if (toks.length) {
      const scoreRecord = (item, type) => {
        const hay = ['title', 'display_title', 'display_name', 'code', 'id']
          .map(field => String(item?.[field] ?? '').toLowerCase())
          .join(' ');
        const score = toks.reduce((n, token) => n + (hay.includes(token) ? 1 : 0), 0);
        if (!score || !item?.id) return null;
        return {
          type,
          id: item.id,
          title: item.title ?? item.display_name ?? item.code ?? item.id,
          snippet: item.title ?? item.display_name ?? item.code ?? item.id,
          match: 'token',
          score
        };
      };
      hits = [
        ...classes.map(item => scoreRecord(item, 'class')),
        ...lessonPool.map(item => scoreRecord(item, 'lesson')),
        ...units.map(item => scoreRecord(item, 'unit'))
      ]
        .filter(Boolean)
        .sort((a, b) => b.score - a.score || String(a.title).localeCompare(String(b.title)));
    }
  }
  const slice = hits.slice(0, cap);
  return {
    ok: true,
    store: 'teaching_hub',
    query: q,
    count: slice.length,
    ...truncatedMeta(hits.length, slice.length),
    results: slice
  };
}

export function getTeachingContext({
  classes = [],
  lessons = [],
  units = [],
  query = '',
  now = new Date(),
  message = ''
} = {}) {
  const today = (now instanceof Date ? now : new Date(now)).toISOString().slice(0, 10);
  const until = addCalendarDays(today, 14);
  const stated = statedTeachingConstraints(message || query);
  stated.today = today;
  const activeClasses = (classes ?? []).filter(c => c && c.status !== 'trashed' && c.status !== 'archived');
  const { drafts } = partitionTeachingLessons(lessons);
  const upcoming = hydrateTeachingSchedule(lessons, { now, windowDays: 14 });
  const matchedClass = matchTeachingClass(activeClasses, query, stated);
  const matchedLesson = matchTeachingLesson(upcoming, query, stated, matchedClass?.id ?? null);
  let matchedUnit = matchedLesson?.unit_id
    ? (units ?? []).find(u => u.id === matchedLesson.unit_id) ?? null
    : null;
  if (!matchedUnit) {
    const q = String(query ?? '').trim().toLowerCase();
    matchedUnit = (units ?? []).find(u =>
      [u.title, u.id, u.code].some(v => String(v ?? '').toLowerCase().includes(q))
    ) ?? null;
  }

  const classUpcoming = matchedClass
    ? upcoming.filter(l => l.class_id === matchedClass.id)
    : upcoming;
  const todayLessons = classUpcoming.filter(l => l.date === today);
  const nextLesson = matchedLesson
    ?? classUpcoming.find(l => l.date > today)
    ?? classUpcoming[0]
    ?? null;
  const previous = matchedLesson
    ? [...upcoming]
      .filter(l =>
        l.class_id === matchedLesson.class_id
        && l.date
        && (l.date < matchedLesson.date || (l.date === matchedLesson.date && Number(l.schedule_order ?? 0) < Number(matchedLesson.schedule_order ?? 0)))
      )
      .sort((a, b) => b.date.localeCompare(a.date) || Number(b.schedule_order ?? 0) - Number(a.schedule_order ?? 0))[0] ?? null
    : null;
  const sequence = nextFromUnitSequence(matchedLesson, units, drafts);
  const nextScheduled = matchedLesson
    ? classUpcoming.find(l =>
      l.date > matchedLesson.date
      || (l.date === matchedLesson.date && Number(l.schedule_order ?? 0) > Number(matchedLesson.schedule_order ?? 0))
    ) ?? null
    : classUpcoming[0] ?? null;

  const lessonOut = matchedLesson
    ? {
        id: matchedLesson.id,
        scheduled_id: matchedLesson.scheduled_id,
        date: matchedLesson.date,
        start_time: matchedLesson.start_time,
        title: matchedLesson.title,
        class_id: matchedLesson.class_id,
        unit_id: matchedLesson.unit_id,
        path: matchedLesson.path,
        sequence: matchedLesson.sequence,
        outcome_ids: matchedLesson.outcome_ids ?? [],
        block_count: matchedLesson.blocks?.length ?? 0,
        source: matchedLesson.source
      }
    : null;

  return {
    ok: true,
    store: 'teaching_hub',
    today,
    window_to: until,
    stated_constraints: {
      minutes: stated.minutes,
      class_hint: stated.classHint,
      year_hint: stated.yearHint
    },
    class: matchedClass
      ? { id: matchedClass.id, code: matchedClass.code, display_name: matchedClass.display_name ?? matchedClass.title }
      : null,
    lesson: lessonOut,
    unit: matchedUnit
      ? {
          id: matchedUnit.id,
          title: matchedUnit.title,
          code: matchedUnit.code,
          lesson_ids: Array.isArray(matchedUnit.lesson_ids) ? matchedUnit.lesson_ids : [],
          outcome_ids: matchedUnit.outcome_ids ?? []
        }
      : null,
    today_lessons: todayLessons.map(l => ({
      id: l.id,
      date: l.date,
      title: l.title,
      class_id: l.class_id,
      start_time: l.start_time
    })),
    previous_lesson: previous
      ? { id: previous.id, date: previous.date, title: previous.title, class_id: previous.class_id }
      : null,
    next_scheduled: nextScheduled
      ? { id: nextScheduled.id, date: nextScheduled.date, title: nextScheduled.title, class_id: nextScheduled.class_id }
      : null,
    next_in_unit: sequence.next,
    next_in_unit_basis: sequence.basis,
    upcoming_count: upcoming.length,
    upcoming: upcoming.slice(0, 8).map(l => ({
      id: l.id,
      date: l.date,
      title: l.title,
      class_id: l.class_id,
      start_time: l.start_time
    })),
    focus_lesson: nextLesson
      ? { id: nextLesson.id, date: nextLesson.date, title: nextLesson.title, class_id: nextLesson.class_id }
      : null,
    ...truncatedMeta(upcoming.length, Math.min(upcoming.length, 8))
  };
}

export function searchKnowledge(pages = [], { query, limit = DEFAULT_LIMIT } = {}) {
  const q = String(query ?? '').trim();
  if (q.length < 2) return { ok: false, error: 'empty_query', store: 'knowledge_hub' };
  const cap = capLimit(limit);
  const ranked = rankKnowledgePages(pages, q);
  const slice = ranked.slice(0, cap);
  return {
    ok: true,
    store: 'knowledge_hub',
    query: q,
    count: slice.length,
    ...truncatedMeta(ranked.length, slice.length),
    results: slice.map(page => ({
      id: page.id,
      title: page.title,
      path: page.path ?? null,
      tags: page.tags ?? [],
      excerpt: page.excerpt ?? null,
      connected: page.connected ?? page.backlinks ?? [],
      score: page.score ?? null
    })),
    how_to_read: 'Retrieved Knowledge notes. Distinguish these from any new synthesis you add.'
  };
}

export function inspectHubSignals({
  tasks = [],
  classes = [],
  scheduledLessons = [],
  loadErrors = {},
  hammondDigest = '',
  now = new Date()
} = {}) {
  const hubBlock = formatHubAgentContext({ tasks, classes, scheduledLessons, now, loadErrors });
  const focus = loadErrors.tasks
    ? { ok: false, error: 'tasks_unavailable', store: 'tasks_hub' }
    : getTasksFocus(tasks, [], { now });
  const unavailable = Object.entries(loadErrors)
    .filter(([, err]) => err)
    .map(([hub, err]) => ({ hub, error: err }));
  return {
    ok: true,
    store: 'cross_hub',
    unavailable,
    tasks_focus: focus?.ok ? {
      open_count: focus.open_count,
      capacity_overall: focus.capacity?.overall,
      stress_flag_count: focus.stress_flags?.length ?? 0,
      overdue_count: focus.overdue?.length ?? 0
    } : focus,
    teaching_upcoming: loadErrors.scheduledLessons
      ? { ok: false, error: 'teaching_unavailable' }
      : getTeachingContext({ classes, lessons: scheduledLessons, now }),
    life_digest_present: Boolean(String(hammondDigest || '').trim()),
    hub_context_block: hubBlock || null,
    how_to_read: 'Cross-hub inspection. Name any hub in unavailable[]. Do not invent missing hubs as empty-by-design.'
  };
}

export function selectNutritionEntries(tree, { today, lookbackDays = 30, limit = 80 } = {}) {
  if (!Array.isArray(tree) || !isCalendarDate(today)) return [];
  const from = addCalendarDays(today, -(lookbackDays - 1));
  return tree
    .filter(entry => {
      if (!entry || entry.type !== 'blob' || typeof entry.path !== 'string') return false;
      const match = NUTRITION_LOG_PATH.exec(entry.path);
      return Boolean(match && match.groups.date >= from && match.groups.date <= today);
    })
    .sort((a, b) => String(b.path).localeCompare(String(a.path)))
    .slice(0, limit);
}

export function selectSkincareHistoryEntries(tree, { today, lookbackDays = 30, limit = 40 } = {}) {
  if (!Array.isArray(tree) || !isCalendarDate(today)) return [];
  const from = addCalendarDays(today, -(lookbackDays - 1));
  return tree
    .filter(entry => {
      if (!entry || entry.type !== 'blob' || typeof entry.path !== 'string') return false;
      const match = SKINCARE_LOG_PATH.exec(entry.path);
      return Boolean(match && match.groups.date >= from && match.groups.date <= today);
    })
    .sort((a, b) => String(b.path).localeCompare(String(a.path)))
    .slice(0, limit);
}

/** Anthropic tool schemas */
export function domainRetrievalSchemasFor(slug) {
  const sharedBody = [
    {
      name: 'get_body_state',
      description:
        'Read latest body composition, tape, and shoulder:waist ratio (Body page). Use for weight/composition questions.',
      input_schema: { type: 'object', properties: {} }
    },
    {
      name: 'get_weight_trend',
      description:
        'Read weight/composition trend across loaded body records. Use when Adam asks if weight change is unusual — cite dates and deltas; flag large conflicts.',
      input_schema: { type: 'object', properties: {} }
    }
  ];

  const bySlug = {
    brisket: [
      {
        name: 'get_nutrition_snapshot',
        description:
          'Read Nutrition dashboard today (macros vs targets, meals, challenges, protein trend). Use for "how is my eating going" — never invent adherence.',
        input_schema: { type: 'object', properties: {} }
      },
      {
        name: 'get_nutrition_adherence',
        description:
          'Deterministic week/month nutrition adherence (protein hits, fat-ceiling days, avg protein). Use for weekly adherence questions.',
        input_schema: { type: 'object', properties: {} }
      },
      {
        name: 'get_nutrition_targets',
        description: 'Read today\'s nutrition targets from config for the resolved day type.',
        input_schema: { type: 'object', properties: {} }
      },
      {
        name: 'search_nutrition_records',
        description: 'Search loaded meal logs by keyword. Words are ANDed. truncated=true means more hits exist.',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            limit: { type: 'number' }
          },
          required: ['query']
        }
      }
    ],
    sara: [
      ...sharedBody,
      // medical tools already attached separately
    ],
    penelope: [
      {
        name: 'search_diary_records',
        description:
          'Search diary history for themes/feelings. Use when Adam asks if he has felt like this often — do not ask him to paste prior entries.',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            limit: { type: 'number' }
          },
          required: ['query']
        }
      },
      {
        name: 'get_diary_range',
        description: 'List diary entries between from/to (YYYY-MM-DD). truncated=true means continue with a tighter window or higher limit.',
        input_schema: {
          type: 'object',
          properties: {
            from: { type: 'string' },
            to: { type: 'string' },
            limit: { type: 'number' }
          },
          required: ['from', 'to']
        }
      }
    ],
    vera: [
      // mind tools already attached; keep empty here
    ],
    hyaluronica: [
      {
        name: 'search_skincare_records',
        description: 'Search skincare/treatment log history by keyword.',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            limit: { type: 'number' }
          },
          required: ['query']
        }
      },
      {
        name: 'get_skincare_adherence',
        description:
          'Routine adherence over a lookback window plus recent treatment/routine logs. Use for "is this routine helping?".',
        input_schema: {
          type: 'object',
          properties: {
            lookback_days: { type: 'number' }
          }
        }
      }
    ],
    clare: [
      {
        name: 'get_tasks_focus',
        description:
          'Open tasks, overdue, due soon, capacity, and stress flags from Tasks Hub. Required before answering what Adam should focus on today.',
        input_schema: { type: 'object', properties: {} }
      },
      {
        name: 'search_tasks',
        description: 'Search open tasks by text.',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            limit: { type: 'number' }
          },
          required: ['query']
        }
      },
      {
        name: 'get_task',
        description: 'Fetch one task by id.',
        input_schema: {
          type: 'object',
          properties: { task_id: { type: 'string' } },
          required: ['task_id']
        }
      }
    ],
    ann: [
      {
        name: 'search_teaching',
        description: 'Search Teaching classes, lessons, and units by title/code.',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            limit: { type: 'number' }
          },
          required: ['query']
        }
      },
      {
        name: 'get_teaching_context',
        description:
          'Resolve class/unit/upcoming lesson context for a query (e.g. Year 10 / tomorrow). Call before proposing lesson changes.',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string' }
          }
        }
      }
    ],
    clementine: [
      {
        name: 'search_knowledge',
        description:
          'Search the Knowledge corpus (titles, tags, excerpts, connected). Call before answering what Adam already has on a topic. Distinguish retrieved notes from new synthesis.',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string' },
            limit: { type: 'number' }
          },
          required: ['query']
        }
      }
    ],
    hammond: [
      {
        name: 'inspect_hub_signals',
        description:
          'Cross-hub retrieval: Tasks focus, Teaching upcoming, Life digest presence, and explicit unavailable hubs. Required for "what is slipping across my life".',
        input_schema: { type: 'object', properties: {} }
      },
      getWeekReviewSchema()
    ]
  };

  return bySlug[slug] ?? [];
}

export { getBodyState };
