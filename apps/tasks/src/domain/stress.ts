import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import type { StressPatternKind } from '@/schemas/stress';
import { addDays, parseDue, startOfDay, tasksForDay, toDateKey } from '@/domain/queries';
import { formatDisplayDate } from '../../design-kit/js/format-display-date.js';

export type StressPattern = {
  pattern_kind: StressPatternKind;
  pattern_description: string;
  source_project_or_task_id: string | null;
  fingerprint: string;
};

const FORTNIGHT_MS = 14 * 24 * 60 * 60 * 1000;

function excursionAnchor(project: Project): Date | null {
  if (project.type !== 'excursion') return null;
  return (
    parseDue(project.current_end_date) ??
    parseDue(project.baseline_end_date) ??
    parseDue(project.key_dates?.permission_note_due ?? null) ??
    null
  );
}

/** Overlapping excursions in the same fortnight — textured, not “busy”. */
export function detectOverlappingExcursions(projects: Project[]): StressPattern[] {
  const dated = projects
    .map((p) => ({ project: p, date: excursionAnchor(p) }))
    .filter((x): x is { project: Project; date: Date } => Boolean(x.date));

  const out: StressPattern[] = [];
  for (let i = 0; i < dated.length; i += 1) {
    for (let j = i + 1; j < dated.length; j += 1) {
      const a = dated[i]!;
      const b = dated[j]!;
      const gap = Math.abs(a.date.getTime() - b.date.getTime());
      if (gap > FORTNIGHT_MS) continue;
      const titles = [a.project.title, b.project.title].sort();
      const fingerprint = `overlap:${[a.project.id, b.project.id].sort().join('+')}`;
      out.push({
        pattern_kind: 'overlapping_excursions',
        pattern_description: `${titles[0]} and ${titles[1]} land within the same fortnight (${formatDisplayDate(a.date)} / ${formatDisplayDate(b.date)}).`,
        source_project_or_task_id: a.project.id,
        fingerprint
      });
    }
  }
  return out;
}

/** Dense due-date pinch in the next week. */
export function detectDensePinches(tasks: Task[], from: Date = new Date()): StressPattern[] {
  const start = startOfDay(from);
  const out: StressPattern[] = [];
  for (let i = 0; i < 7; i += 1) {
    const day = addDays(start, i);
    const dayTasks = tasksForDay(tasks, day);
    if (dayTasks.length < 4) continue;
    const key = toDateKey(day);
    const titles = dayTasks
      .slice(0, 3)
      .map((t) => t.title)
      .join('; ');
    out.push({
      pattern_kind: 'dense_pinch',
      pattern_description: `${formatDisplayDate(day)} has ${dayTasks.length} open due items packing the day (${titles}${dayTasks.length > 3 ? '…' : ''}).`,
      source_project_or_task_id: dayTasks[0]?.id ?? null,
      fingerprint: `pinch:${key}:${dayTasks.length}`
    });
  }
  return out;
}

/** Cluster of open tasks already past due. */
export function detectMissedDeadlines(tasks: Task[], from: Date = new Date()): StressPattern[] {
  const start = startOfDay(from).getTime();
  const overdue = tasks.filter((t) => {
    if (t.status === 'done' || t.status === 'dead') return false;
    const due = parseDue(t.due_date);
    if (!due) return false;
    return startOfDay(due).getTime() < start;
  });
  if (overdue.length < 3) return [];
  const ids = overdue
    .map((t) => t.id)
    .sort()
    .slice(0, 5);
  return [
    {
      pattern_kind: 'missed_deadlines',
      pattern_description: `${overdue.length} open tasks are already past due (including “${overdue[0]!.title}”).`,
      source_project_or_task_id: overdue[0]!.id,
      fingerprint: `missed:${ids.join(',')}`
    }
  ];
}

export function detectStressPatterns(
  projects: Project[],
  tasks: Task[],
  from: Date = new Date()
): StressPattern[] {
  return [
    ...detectOverlappingExcursions(projects),
    ...detectDensePinches(tasks, from),
    ...detectMissedDeadlines(tasks, from)
  ];
}

export function agentSlug(agent: string): string {
  return agent
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}
