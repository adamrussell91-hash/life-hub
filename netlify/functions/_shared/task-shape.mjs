const SOMEDAY_KINDS = new Set(['bucket_list', 'dreams_jar', 'career']);
const ORIGIN_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function coerceStringArray(value) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
}

export function coerceSomedayKind(value) {
  return SOMEDAY_KINDS.has(value) ? value : null;
}

export function coerceOriginDate(value) {
  return typeof value === 'string' && ORIGIN_DATE.test(value) ? value : null;
}

export function normalizeTaskRecord(task) {
  if (!task || typeof task !== 'object' || Array.isArray(task)) return task;
  return {
    ...task,
    depends_on: coerceStringArray(task.depends_on),
    tags: coerceStringArray(task.tags),
    attachments: coerceStringArray(task.attachments)
  };
}
