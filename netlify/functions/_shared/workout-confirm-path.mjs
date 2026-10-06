import { buildCanonicalPath, buildPlannedWorkoutSlug, PLANNED_WORKOUT_SLUG } from './chat-schema.mjs';
import { decodeBlob } from './decode-blob.mjs';

const STATUS_RE = /^status:\s*["']?(planned|completed|skipped)["']?/m;
const TITLE_RE = /^title:\s*["']?(.+?)["']?\s*$/m;
export const WORKOUT_AMEND_PATH = /^data\/fitness\/(\d{4})\/(\d{2})\/(\d{4}-\d{2}-\d{2})-workout-[a-z0-9-]+\.md$/;
export const FINISHED_SESSION_PLAN_ERROR = "That session is already finished — I won't replace it with a plan";
export const ADDED_AFTER_FINISH_HEADING = 'Added after finish';

export class WorkoutWriteBlockedError extends Error {
  constructor(message = FINISHED_SESSION_PLAN_ERROR) {
    super(message);
    this.name = 'WorkoutWriteBlockedError';
    this.code = 'session_already_finished';
    this.retryable = false;
  }
}

export function workoutStatusFromMarkdown(text) {
  return STATUS_RE.exec(text ?? '')?.[1] ?? null;
}

export function plannedWriteWouldDowngrade(existingStatus, incomingStatus) {
  return incomingStatus === 'planned'
    && (existingStatus === 'completed' || existingStatus === 'skipped');
}

export function parseWorkoutAmendPath(path, { date } = {}) {
  if (typeof path !== 'string' || !path) return null;
  if (path.includes('..') || path.includes('\\') || path.startsWith('/')) return null;
  const match = WORKOUT_AMEND_PATH.exec(path);
  if (!match) return null;
  const [, year, month, fileDate] = match;
  if (!fileDate.startsWith(`${year}-${month}-`)) return null;
  if (date && fileDate !== date) return null;
  return path;
}

export function sameDayWorkoutEntries(tree, date) {
  if (!Array.isArray(tree) || typeof date !== 'string' || !date) return [];
  const [year, month] = date.split('-');
  const prefix = `data/fitness/${year}/${month}/${date}-workout-`;
  return tree.filter(entry => (
    entry?.type === 'blob'
    && typeof entry.path === 'string'
    && entry.path.startsWith(prefix)
    && entry.path.endsWith('.md')
  ));
}

export function workoutSlugFromPath(path) {
  const file = String(path ?? '').split('/').at(-1)?.replace(/\.md$/, '') ?? '';
  // YYYY-MM-DD-workout-… → drop the calendar date (3 hyphen segments).
  return file.split('-').slice(3).join('-');
}

/**
 * Prefer a same-day planned file that matches this session (title/slug).
 * Do not collapse unrelated plans onto one path — multiple workouts per day are allowed.
 */
export function pickMatchingPlannedWorkout(entries, { slug, title } = {}) {
  const planned = (entries ?? []).filter(entry => entry?.status === 'planned' && entry.path);
  if (planned.length === 0) return null;

  const recordSlug = typeof slug === 'string' ? slug : '';
  const titleSlug = title ? buildPlannedWorkoutSlug(title) : '';
  const titleKey = title ? String(title).trim().toLowerCase() : '';

  const match = planned.find(entry => {
    const pathSlug = workoutSlugFromPath(entry.path);
    if (recordSlug && (pathSlug === recordSlug || entry.path.endsWith(`-${recordSlug}.md`))) return true;
    if (titleSlug && (pathSlug === titleSlug || entry.path.endsWith(`-${titleSlug}.md`))) return true;
    if (titleKey && typeof entry.title === 'string' && entry.title.trim().toLowerCase() === titleKey) {
      return true;
    }
    return false;
  });
  if (match) return match;

  // Legacy single-file days: only reuse workout-planned when this write is also
  // the generic/untitled plan, not a distinctly titled second session.
  const legacy = planned.find(entry => entry.path.endsWith(`-${PLANNED_WORKOUT_SLUG}.md`));
  if (legacy && (!recordSlug || recordSlug === PLANNED_WORKOUT_SLUG) && (!titleSlug || titleSlug === PLANNED_WORKOUT_SLUG)) {
    return legacy;
  }
  return null;
}

/** @deprecated Prefer pickMatchingPlannedWorkout — kept for tests that assert legacy ordering. */
export function pickSameDayPlannedWorkout(entries) {
  const planned = (entries ?? []).filter(entry => entry?.status === 'planned' && entry.path);
  if (planned.length === 0) return null;
  const stable = planned.find(entry => entry.path.endsWith(`-${PLANNED_WORKOUT_SLUG}.md`));
  if (stable) return stable;
  return [...planned].sort((a, b) => String(a.path).localeCompare(String(b.path))).at(-1);
}

export async function annotateWorkoutEntries(client, entries) {
  const annotated = [];
  for (const entry of entries) {
    let status = null;
    let title = null;
    let text = null;
    try {
      text = decodeBlob(await client.readBlob(entry.sha));
      if (text) {
        status = workoutStatusFromMarkdown(text);
        const rawTitle = TITLE_RE.exec(text)?.[1];
        title = rawTitle ? rawTitle.replace(/^["']|["']$/g, '').trim() : null;
      }
    } catch {
      status = null;
      title = null;
      text = null;
    }
    annotated.push({ ...entry, status, title, text });
  }
  return annotated;
}

function exerciseNames(record) {
  return (Array.isArray(record?.exercises) ? record.exercises : [])
    .map(exercise => String(exercise?.name ?? '').trim().toLowerCase())
    .filter(Boolean);
}

export function planLooksLikeCompletedSession(planInput, completedWorkouts = []) {
  const fields = planInput?.fields ?? planInput ?? {};
  const planTitle = String(fields.title ?? '').trim().toLowerCase();
  const planNames = exerciseNames(fields);
  for (const entry of completedWorkouts) {
    const title = String(entry.title ?? entry.record?.title ?? '').trim().toLowerCase();
    if (planTitle && title && (planTitle === title || title.includes(planTitle) || planTitle.includes(title))) {
      return true;
    }
    const recordNames = exerciseNames(entry.record ?? entry);
    if (planNames.length < 2 || recordNames.length < 2) continue;
    const planSet = new Set(planNames);
    const overlap = recordNames.filter(name => planSet.has(name)).length;
    const floor = Math.min(planNames.length, recordNames.length);
    if (overlap >= 2 || (floor > 0 && overlap / floor >= 0.5)) return true;
  }
  return false;
}

export async function loadCompletedWorkoutsForDate(client, date, { tree, parseDocument } = {}) {
  const currentTree = tree ?? (await client.resolveTree()).tree;
  const sameDay = await annotateWorkoutEntries(client, sameDayWorkoutEntries(currentTree, date));
  const completed = sameDay.filter(entry => entry.status === 'completed');
  if (typeof parseDocument !== 'function') return completed;
  const detailed = [];
  for (const entry of completed) {
    const text = entry.text;
    if (!text) {
      detailed.push(entry);
      continue;
    }
    try {
      const parsed = parseDocument(text, entry.path);
      detailed.push({
        ...entry,
        title: parsed.record?.title ?? entry.title,
        record: parsed.record,
        notes: parsed.body ?? '',
        exercises: parsed.record?.exercises ?? []
      });
    } catch {
      detailed.push(entry);
    }
  }
  return detailed;
}

function titlesOf(entries) {
  return entries.map(entry => entry.title || workoutSlugFromPath(entry.path));
}

export function pickCompletedWorkoutForNotes(entries, { title } = {}) {
  const completed = (entries ?? []).filter(entry => entry.status === 'completed' && entry.path);
  if (completed.length === 0) {
    return { error: 'no_completed', message: 'No completed workout for that date.' };
  }
  const needle = String(title ?? '').trim().toLowerCase();
  if (needle) {
    const slugNeedle = needle.replace(/\s+/g, '-');
    const match = completed.filter(entry => {
      const entryTitle = String(entry.title ?? '').trim().toLowerCase();
      const pathSlug = workoutSlugFromPath(entry.path);
      return entryTitle === needle
        || entryTitle.includes(needle)
        || needle.includes(entryTitle)
        || pathSlug.includes(slugNeedle);
    });
    if (match.length === 1) return { entry: match[0] };
    if (match.length === 0) {
      return {
        error: 'not_found',
        message: `No completed workout titled "${title}".`,
        titles: titlesOf(completed)
      };
    }
    return {
      error: 'ambiguous',
      message: `Several completed sessions match "${title}". Name which one: ${titlesOf(match).join(', ')}.`,
      titles: titlesOf(match)
    };
  }
  if (completed.length === 1) return { entry: completed[0] };
  return {
    error: 'ambiguous',
    message: `Several completed sessions that day. Name which one: ${titlesOf(completed).join(', ')}.`,
    titles: titlesOf(completed)
  };
}

export function appendWorkoutNotes(existingNotes, addition) {
  const extra = String(addition ?? '').trim();
  if (!extra) return { error: 'empty_notes', message: 'notes must be a non-empty string.' };
  const current = String(existingNotes ?? '').trim();
  const heading = `## ${ADDED_AFTER_FINISH_HEADING}`;
  if (!current) return { notes: `${heading}\n\n${extra}` };
  if (current.includes(heading)) return { notes: `${current}\n\n${extra}` };
  return { notes: `${current}\n\n${heading}\n\n${extra}` };
}

export async function buildWorkoutNotesAmend(client, {
  date,
  notes,
  workoutTitle,
  tree,
  parseDocument
} = {}) {
  const extra = String(notes ?? '').trim();
  if (!extra) {
    return { ok: false, error: 'empty_notes', message: 'notes must be a non-empty string.' };
  }
  if (typeof date !== 'string' || !date) {
    return { ok: false, error: 'invalid_date', message: 'date must be YYYY-MM-DD.' };
  }
  let completed;
  try {
    completed = await loadCompletedWorkoutsForDate(client, date, { tree, parseDocument });
  } catch {
    return { ok: false, error: 'github_unavailable', message: 'Could not read today\'s workouts.' };
  }
  const picked = pickCompletedWorkoutForNotes(completed, { title: workoutTitle });
  if (picked.error) {
    return { ok: false, error: picked.error, message: picked.message, titles: picked.titles ?? [] };
  }
  const entry = picked.entry;
  if (!entry.record) {
    return { ok: false, error: 'unreadable', message: 'Could not parse that completed workout.' };
  }
  const merged = appendWorkoutNotes(entry.notes, extra);
  if (merged.error) {
    return { ok: false, error: merged.error, message: merged.message };
  }
  const record = {
    ...entry.record,
    status: 'completed',
    exercises: Array.isArray(entry.record.exercises) ? entry.record.exercises : []
  };
  return {
    ok: true,
    record,
    notes: merged.notes,
    path: entry.path,
    existingSha: entry.sha,
    overwrite: true,
    amend_path: entry.path
  };
}

function refuseIfDowngrade(entry, incomingStatus, path) {
  if (plannedWriteWouldDowngrade(entry?.status, incomingStatus)) {
    return {
      blocked: true,
      path,
      existingSha: entry?.sha,
      existingStatus: entry.status,
      error: FINISHED_SESSION_PLAN_ERROR
    };
  }
  return null;
}

export async function resolveWorkoutConfirmTarget(client, {
  record,
  slug,
  overwrite = false,
  amendPath = null
} = {}) {
  const fallbackPath = buildCanonicalPath({
    type: record.type,
    date: record.date,
    slug
  });
  try {
    const current = await client.resolveTree();
    if (record.type !== 'workout') {
      const existingSha = overwrite
        ? current.tree.find(entry => entry.path === fallbackPath && entry.type === 'blob')?.sha
        : undefined;
      return { path: fallbackPath, existingSha };
    }

    const sameDay = await annotateWorkoutEntries(client, sameDayWorkoutEntries(current.tree, record.date));
    const validAmend = parseWorkoutAmendPath(amendPath, { date: record.date });
    if (validAmend) {
      const existing = sameDay.find(entry => entry.path === validAmend);
      if (!existing) {
        return { blocked: true, path: validAmend, error: 'That workout file is not on this date.' };
      }
      if (existing.status !== 'completed') {
        return { blocked: true, path: validAmend, error: 'add_workout_notes can only amend a completed session.' };
      }
      if (record.status !== 'completed') {
        return refuseIfDowngrade(existing, record.status, validAmend)
          ?? { blocked: true, path: validAmend, error: FINISHED_SESSION_PLAN_ERROR };
      }
      return {
        path: existing.path,
        existingSha: existing.sha,
        existingStatus: existing.status,
        notesAmend: true
      };
    }

    const matched = pickMatchingPlannedWorkout(sameDay, { slug, title: record.title });

    if (matched && record.status === 'planned') {
      return { path: matched.path, existingSha: matched.sha, existingStatus: matched.status };
    }
    if (matched && (record.status === 'completed' || record.status === 'skipped')) {
      // Reuse today's matching plan file. A different completed session (walk, EP,
      // second lift) must not overwrite another plan.
      return { path: matched.path, existingSha: matched.sha, existingStatus: matched.status };
    }

    // Completing with no title/slug match: still allow legacy generic planned file
    // when it is the only planned session (old one-file-per-day days).
    if ((record.status === 'completed' || record.status === 'skipped') && !matched) {
      const plannedOnly = sameDay.filter(entry => entry.status === 'planned');
      if (plannedOnly.length === 1) {
        const only = plannedOnly[0];
        const plannedSlug = workoutSlugFromPath(only.path);
        const recordSlug = typeof slug === 'string' ? slug : '';
        const generic = plannedSlug === PLANNED_WORKOUT_SLUG
          || ['planned', 'planned-session', 'strength-session'].includes(plannedSlug);
        if (generic || !recordSlug || plannedSlug === recordSlug || only.path.includes(recordSlug)) {
          return { path: only.path, existingSha: only.sha, existingStatus: only.status };
        }
      }
    }

    if (overwrite) {
      const existing = sameDay.find(entry => entry.path === fallbackPath)
        ?? current.tree.find(entry => entry.path === fallbackPath && entry.type === 'blob');
      const blocked = refuseIfDowngrade(existing, record.status, fallbackPath);
      if (blocked) return blocked;
      const existingSha = existing?.sha
        ?? current.tree.find(entry => entry.path === fallbackPath && entry.type === 'blob')?.sha;
      const notesAmend = record.status === 'completed' && existing?.status === 'completed';
      return {
        path: fallbackPath,
        existingSha,
        existingStatus: existing?.status,
        ...(notesAmend ? { notesAmend: true } : {})
      };
    }

    const existingAtFallback = sameDay.find(entry => entry.path === fallbackPath);
    const blocked = refuseIfDowngrade(existingAtFallback, record.status, fallbackPath);
    if (blocked) return blocked;
    return { path: fallbackPath, existingStatus: existingAtFallback?.status };
  } catch (error) {
    if (overwrite) throw error;
    return { path: fallbackPath };
  }
}
