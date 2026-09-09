import { buildCanonicalPath, buildPlannedWorkoutSlug, PLANNED_WORKOUT_SLUG } from './chat-schema.mjs';
import { decodeBlob } from './decode-blob.mjs';

const STATUS_RE = /^status:\s*["']?(planned|completed|skipped)["']?/m;
const TITLE_RE = /^title:\s*["']?(.+?)["']?\s*$/m;

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

async function annotateWorkoutEntries(client, entries) {
  const annotated = [];
  for (const entry of entries) {
    let status = null;
    let title = null;
    try {
      const text = decodeBlob(await client.readBlob(entry.sha));
      if (text) {
        status = STATUS_RE.exec(text)?.[1] ?? null;
        const rawTitle = TITLE_RE.exec(text)?.[1];
        title = rawTitle ? rawTitle.replace(/^["']|["']$/g, '').trim() : null;
      }
    } catch {
      status = null;
      title = null;
    }
    annotated.push({ ...entry, status, title });
  }
  return annotated;
}

export async function resolveWorkoutConfirmTarget(client, { record, slug, overwrite = false } = {}) {
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
    const matched = pickMatchingPlannedWorkout(sameDay, { slug, title: record.title });

    if (matched && record.status === 'planned') {
      return { path: matched.path, existingSha: matched.sha };
    }
    if (matched && (record.status === 'completed' || record.status === 'skipped')) {
      // Reuse today's matching plan file. A different completed session (walk, EP,
      // second lift) must not overwrite another plan.
      return { path: matched.path, existingSha: matched.sha };
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
          return { path: only.path, existingSha: only.sha };
        }
      }
    }

    if (overwrite) {
      const existingSha = current.tree.find(entry => entry.path === fallbackPath && entry.type === 'blob')?.sha;
      return { path: fallbackPath, existingSha };
    }
    return { path: fallbackPath };
  } catch (error) {
    if (overwrite) throw error;
    return { path: fallbackPath };
  }
}
