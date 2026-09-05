import { buildCanonicalPath } from './chat-schema.mjs';
import { decodeBlob } from './decode-blob.mjs';

const STATUS_RE = /^status:\s*["']?(planned|completed|skipped)["']?/m;

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

export function pickSameDayPlannedWorkout(entries) {
  const planned = (entries ?? []).filter(entry => entry?.status === 'planned' && entry.path);
  if (planned.length === 0) return null;
  const stable = planned.find(entry => entry.path.endsWith('-workout-planned.md'));
  if (stable) return stable;
  return [...planned].sort((a, b) => String(a.path).localeCompare(String(b.path))).at(-1);
}

async function annotateWorkoutEntries(client, entries) {
  const annotated = [];
  for (const entry of entries) {
    let status = null;
    try {
      const text = decodeBlob(await client.readBlob(entry.sha));
      if (text) status = STATUS_RE.exec(text)?.[1] ?? null;
    } catch {
      status = null;
    }
    annotated.push({ ...entry, status });
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
    const planned = pickSameDayPlannedWorkout(sameDay);
    if (planned && (record.status === 'planned' || record.status === 'completed' || record.status === 'skipped')) {
      return { path: planned.path, existingSha: planned.sha };
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
