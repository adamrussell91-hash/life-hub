import type { Task } from '@/schemas/task';

/** Production Blobs can omit arrays the schema treats as required. */
export function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function normalizeTask<T extends Task>(task: T): T {
  return {
    ...task,
    depends_on: stringList(task.depends_on),
    tags: stringList(task.tags),
    attachments: stringList(task.attachments)
  };
}
