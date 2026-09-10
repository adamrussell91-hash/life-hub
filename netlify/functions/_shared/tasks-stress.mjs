import { addDays, formatDisplayDate, parseDue, startOfDay, tasksForDay, toDateKey } from './clare-dates.mjs';

const FORTNIGHT_MS = 14 * 24 * 60 * 60 * 1000;

export const DEFAULT_STRESS_ROUTE = [
  'General Hammond',
  'Penelope Rose Quillian',
  'Dr Vera Lenz'
];

export function agentSlug(agent) {
  return String(agent)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function excursionAnchor(project) {
  if (!project || project.type !== 'excursion') return null;
  return (
    parseDue(project.current_end_date) ??
    parseDue(project.baseline_end_date) ??
    parseDue(project.key_dates?.permission_note_due ?? null) ??
    null
  );
}

export function detectOverlappingExcursions(projects) {
  const dated = (projects ?? [])
    .map(project => ({ project, date: excursionAnchor(project) }))
    .filter(item => item.date);
  const out = [];
  for (let i = 0; i < dated.length; i += 1) {
    for (let j = i + 1; j < dated.length; j += 1) {
      const a = dated[i];
      const b = dated[j];
      if (Math.abs(a.date.getTime() - b.date.getTime()) > FORTNIGHT_MS) continue;
      const titles = [a.project.title, b.project.title].sort();
      out.push({
        pattern_kind: 'overlapping_excursions',
        pattern_description: `${titles[0]} and ${titles[1]} land within the same fortnight (${formatDisplayDate(a.date)} / ${formatDisplayDate(b.date)}).`,
        source_project_or_task_id: a.project.id,
        fingerprint: `overlap:${[a.project.id, b.project.id].sort().join('+')}`
      });
    }
  }
  return out;
}

export function detectDensePinches(tasks, from = new Date()) {
  const start = startOfDay(from);
  const out = [];
  for (let i = 0; i < 7; i += 1) {
    const day = addDays(start, i);
    const dayTasks = tasksForDay(tasks, day);
    if (dayTasks.length < 4) continue;
    const titles = dayTasks.slice(0, 3).map(task => task.title).join('; ');
    out.push({
      pattern_kind: 'dense_pinch',
      pattern_description: `${formatDisplayDate(day)} has ${dayTasks.length} open due items packing the day (${titles}${dayTasks.length > 3 ? '…' : ''}).`,
      source_project_or_task_id: dayTasks[0]?.id ?? null,
      fingerprint: `pinch:${toDateKey(day)}:${dayTasks.length}`
    });
  }
  return out;
}

export function detectMissedDeadlines(tasks, from = new Date()) {
  const start = startOfDay(from).getTime();
  const overdue = (tasks ?? []).filter(task => {
    if (task.status === 'done' || task.status === 'dead') return false;
    const due = parseDue(task.due_date);
    return due ? startOfDay(due).getTime() < start : false;
  });
  if (overdue.length < 3) return [];
  const ids = overdue.map(task => task.id).sort().slice(0, 5);
  return [{
    pattern_kind: 'missed_deadlines',
    pattern_description: `${overdue.length} open tasks are already past due (including “${overdue[0].title}”).`,
    source_project_or_task_id: overdue[0].id,
    fingerprint: `missed:${ids.join(',')}`
  }];
}

export function detectStressPatterns(projects, tasks, from = new Date()) {
  return [
    ...detectOverlappingExcursions(projects),
    ...detectDensePinches(tasks, from),
    ...detectMissedDeadlines(tasks, from)
  ];
}
