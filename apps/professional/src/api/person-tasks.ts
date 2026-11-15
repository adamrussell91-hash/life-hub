/**
 * A person's Tasks-hub tasks, as the Mentoring page lists them. Tasks hold no
 * people field: a task belongs to a person through a universal link, so the
 * list starts from the person's links and reads each task for its status and
 * due date.
 */

import { apiGet, apiPatch } from '@/api/client';
import { createTask, createUniversalLink, type UniversalLinkEntry } from '@/api/universal-links';

const TASK_PREFIX = 'tasks:task:';

export interface PersonTask {
  id: string;
  title: string;
  done: boolean;
  /** `YYYY-MM-DD`, when the task has one. */
  due: string | null;
  href: string;
}

interface TaskRecord {
  id: string;
  title?: string;
  status?: string;
  due_date?: string | null;
}

/** Open means what the people ledger means by it; every other status is finished with. */
const OPEN = new Set(['open', 'in_progress']);

export function taskHref(id: string): string {
  return `/tasks/#/task/${encodeURIComponent(id)}`;
}

function toPersonTask(record: TaskRecord, fallbackTitle = ''): PersonTask {
  return {
    id: record.id,
    title: record.title?.trim() || fallbackTitle || 'Task',
    done: !OPEN.has(record.status ?? 'open'),
    due: record.due_date ? record.due_date.slice(0, 10) : null,
    href: taskHref(record.id)
  };
}

/** Task ids among a person's links, in the order the links came. */
export function linkedTaskIds(entries: UniversalLinkEntry[]): Array<{ id: string; label: string }> {
  const seen = new Set<string>();
  const out: Array<{ id: string; label: string }> = [];
  for (const entry of entries) {
    const ref = entry.endpoint?.ref ?? '';
    if (!ref.startsWith(TASK_PREFIX)) continue;
    const id = ref.slice(TASK_PREFIX.length);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label: entry.endpoint?.display_label ?? '' });
  }
  return out;
}

/**
 * The tasks behind a person's links: open ones by due date (undated last),
 * then done ones. A task that no longer exists is left out.
 */
export async function loadPersonTasks(
  entries: UniversalLinkEntry[],
  options: { signal?: AbortSignal } = {}
): Promise<PersonTask[]> {
  const ids = linkedTaskIds(entries);
  const read = await Promise.all(
    ids.map(({ id, label }) =>
      apiGet<TaskRecord>(`/api/tasks?${new URLSearchParams({ id }).toString()}`, { signal: options.signal }).then(
        (record) => toPersonTask({ ...record, id: record.id ?? id }, label),
        () => null
      )
    )
  );
  return read
    .filter((task): task is PersonTask => task !== null)
    .sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return (a.due ?? '9999').localeCompare(b.due ?? '9999') || a.title.localeCompare(b.title);
    });
}

/** Makes a task in the Tasks hub and links it to the person. */
export async function addPersonTask(personRef: string, input: { title: string; due: string | null }): Promise<PersonTask> {
  const created = await createTask({ title: input.title, ...(input.due ? { due_date: input.due } : {}) });
  await createUniversalLink({
    source_ref: `${TASK_PREFIX}${created.id}`,
    target_ref: personRef,
    relationship_type: 'collaborator'
  });
  return { id: created.id, title: created.title || input.title, done: false, due: input.due, href: taskHref(created.id) };
}

export async function setPersonTaskDone(id: string): Promise<void> {
  await apiPatch(`/api/tasks?${new URLSearchParams({ id }).toString()}`, { status: 'done' });
}
