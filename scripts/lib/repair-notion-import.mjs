import { sydneyLocalStamp } from '../../js/core/time.js';

const BODY_TYPES = new Set(['weight', 'composition', 'measurements']);

export function spacedDuplicateCandidates(basename) {
  const match = /^(.+) (\d+)\.md$/.exec(basename);
  if (!match) return null;
  const [, stem, n] = match;
  return [`${stem}.md`, `${stem}-${n}.md`];
}

export function defaultTimeForRecord(record) {
  if (BODY_TYPES.has(record?.type)) return '12:00';
  if (record?.type === 'workout') return '07:00';
  return '12:00';
}

export function shouldDemoteEmptyStrength(record) {
  if (!record || record.type !== 'workout') return false;
  if (record.status !== 'completed') return false;
  const kind = record.session_kind;
  const strengthLike = kind === 'strength' || kind == null;
  if (!strengthLike) return false;
  const exercises = record.exercises;
  if (!Array.isArray(exercises) || exercises.length === 0) return true;
  return exercises.every(ex => !Array.isArray(ex?.sets) || ex.sets.length === 0);
}

/**
 * Returns { record, changed }. Does not mutate the input object.
 */
export function repairRecordFrontmatter(input) {
  if (!input || typeof input !== 'object') return { record: input, changed: false };
  const record = { ...input };
  let changed = false;

  if (record.schema_version === 1) {
    if (record.time == null || record.time === '') {
      record.time = defaultTimeForRecord(record);
      changed = true;
    }
    if (typeof record.date === 'string' && typeof record.time === 'string') {
      const stamp = sydneyLocalStamp(record.date, record.time);
      if (record.created_at !== stamp) {
        record.created_at = stamp;
        changed = true;
      }
      if (record.updated_at !== stamp) {
        record.updated_at = stamp;
        changed = true;
      }
    }
  }

  if (shouldDemoteEmptyStrength(record)) {
    record.status = 'planned';
    changed = true;
  }

  return { record, changed };
}

export function renderFrontmatter(record) {
  return Object.entries(record)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join('\n') + '\n';
}

export function rebuildEventFile(record, body) {
  const trimmed = typeof body === 'string' && body.trim() ? `${body.trim()}\n` : '';
  return `---\n${renderFrontmatter(record)}---\n${trimmed}`;
}
