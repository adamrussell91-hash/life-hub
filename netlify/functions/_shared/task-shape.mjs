export function coerceStringArray(value) {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
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
