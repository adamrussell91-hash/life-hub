// netlify/functions/_shared/goal-read.mjs
/**
 * Hammond's read of one goal. Pure: no I/O. Deterministic, like ghost-proposer.js.
 * Spec: docs/superpowers/specs/2026-09-26-goals-redesign-design.md ("Hammond's goal read").
 */
import { getSydneyDateKey } from '../../../apps/life/js/core/time.js';
import { addDays, daysBetween } from '../../../packages/design-kit/js/lead-lines.js';

export const SPHERE_DOMAIN = Object.freeze({ life: 'life', work: 'teaching', professional: 'other' });
const MAX_GHOSTS = 3;
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const GHOST_ID = /^goal-(.+?)-(?:start|split-.+|rest-.+|move-.+)$/;

export function goalIdFromGhostId(id) {
  const match = typeof id === 'string' ? GHOST_ID.exec(id) : null;
  return match ? match[1] : null;
}

export function mondayOfKey(key) {
  const dow = (new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(key, -dow);
}

/** Hub prefs store terms nested by year; accept flat rows too. */
export function termsFromHubPrefs(prefs) {
  const rows = Array.isArray(prefs?.school_terms) ? prefs.school_terms : [];
  return rows
    .flatMap(row => (Array.isArray(row?.terms) ? row.terms : [row]))
    .filter(t => t && DATE_KEY.test(t.starts_on ?? '') && DATE_KEY.test(t.ends_on ?? '') && t.starts_on <= t.ends_on)
    .map(t => ({ term: Number.isInteger(t.term) ? t.term : null, starts_on: t.starts_on, ends_on: t.ends_on }))
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on));
}

function sydneyKey(iso) {
  return getSydneyDateKey(new Date(iso));
}

function shortDate(key) {
  return `${Number(key.slice(8, 10))}/${Number(key.slice(5, 7))}`;
}

function isOpen(task) {
  return task.status !== 'done' && task.status !== 'dead';
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function hostedOf(goal, projects = [], tasks = []) {
  const hostedProjects = projects.filter(p => p && p.parent_goal_id === goal.id && p.status !== 'archived');
  const projectIds = new Set(hostedProjects.map(p => p.id));
  const hostedTasks = tasks.filter(t =>
    t && t.bucket !== 'someday' &&
    (t.parent_goal_id === goal.id || (typeof t.parent_project_id === 'string' && projectIds.has(t.parent_project_id))));
  return { hostedProjects, hostedTasks };
}

export function basisUpdatedAt(goal, projects = [], tasks = []) {
  const { hostedProjects, hostedTasks } = hostedOf(goal, projects, tasks);
  return [goal.updated_at, ...hostedProjects.map(p => p.updated_at), ...hostedTasks.map(t => t.updated_at)]
    .filter(stamp => typeof stamp === 'string' && stamp)
    .sort()
    .at(-1) ?? '';
}

/** Future weeks of the current (or next) term whose open due-task count is ≥ max(5, 1.5 × median). */
export function crunchWeeks(tasks, terms, today) {
  const term = terms.find(t => today >= t.starts_on && today <= t.ends_on) ?? terms.find(t => t.starts_on > today);
  if (!term) return [];
  const load = new Map();
  for (let monday = mondayOfKey(term.starts_on); monday <= term.ends_on; monday = addDays(monday, 7)) load.set(monday, 0);
  for (const task of tasks) {
    if (!task || task.bucket === 'someday' || !isOpen(task) || !DATE_KEY.test(task.due_date ?? '')) continue;
    const monday = mondayOfKey(task.due_date);
    if (load.has(monday)) load.set(monday, load.get(monday) + 1);
  }
  const threshold = Math.max(5, 1.5 * median([...load.values()]));
  const nowMonday = mondayOfKey(today);
  return [...load.entries()].filter(([monday, count]) => monday > nowMonday && count >= threshold).map(([monday]) => monday);
}

function nextCalmWeekday(today, crunch) {
  for (let offset = 1; offset <= 21; offset += 1) {
    const day = addDays(today, offset);
    const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6 || crunch.includes(mondayOfKey(day))) continue;
    return day;
  }
  return addDays(today, 1);
}

function proposals({ goal, hostedTasks, tasks, today, crunch, domain }) {
  const prefix = `goal-${goal.id}-`;
  const out = [];
  const open = hostedTasks.filter(t => isOpen(t) && t.kind !== 'step');
  const byDue = [...open].sort((a, b) => (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31'));

  if (!open.length) {
    out.push({
      id: `${prefix}start`, agent: 'hammond', kind: 'create_task',
      title: goal.next_start || `First step on “${goal.title}”`, due: addDays(today, 2),
      goalId: goal.id, domain, reason: 'Nothing is open under this goal'
    });
  }

  const candidate = byDue.find(t => !t.due_date || t.due_date >= today);
  if (candidate && !tasks.some(t => t && t.parent_task_id === candidate.id)) {
    const big = typeof candidate.estimated_duration === 'number' && candidate.estimated_duration >= 45;
    const soon = typeof candidate.due_date === 'string' && daysBetween(today, candidate.due_date) <= 7;
    if (big || soon) {
      out.push({
        id: `${prefix}split-${candidate.id}`, agent: 'hammond', kind: 'split_task',
        taskId: candidate.id, title: candidate.title,
        steps: [
          `Get what you need for “${candidate.title}” (10 min)`,
          'Do a rough first pass (20 min)',
          `Finish and tick off “${candidate.title}” (10 min)`
        ],
        goalId: goal.id, domain: candidate.domain || domain,
        reason: big ? 'It is one big block, and big blocks are hard to start' : 'It is due within a week'
      });
    }
  }

  if (goal.lead_measure) {
    const weeks = crunch.filter(week => !(goal.rest_weeks ?? []).includes(week));
    if (weeks.length) {
      out.push({
        id: `${prefix}rest-${weeks.join('_')}`, agent: 'hammond', kind: 'goal_rest_weeks',
        goalId: goal.id, title: goal.title, weeks,
        rest_weeks: [...new Set([...(goal.rest_weeks ?? []), ...weeks])].sort(),
        reason: 'Those weeks are already heavy. A planned rest is not a miss'
      });
    }
  }

  const overdue = byDue.find(t => DATE_KEY.test(t.due_date ?? '') && t.due_date < today);
  if (overdue) {
    out.push({
      id: `${prefix}move-${overdue.id}`, agent: 'hammond', kind: 'move_task',
      taskId: overdue.id, title: overdue.title, from: overdue.due_date, to: nextCalmWeekday(today, crunch),
      reason: 'Overdue. Moved to the next weekday outside a crunch week'
    });
  }
  return out;
}

function verdictFor({ days, temperature, count, perWeek, crunch }) {
  const when = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  const parts = [
    temperature === 'warm'
      ? `Moving: last touched ${when}.`
      : temperature === 'cooling'
        ? `Cooling: nothing for ${days} days.`
        : `Gone quiet: nothing for ${days} days.`
  ];
  if (perWeek) parts.push(count >= perWeek ? `${count} of ${perWeek} this week, done.` : `${count} of ${perWeek} this week.`);
  if (perWeek && crunch.length) parts.push(`The weeks of ${crunch.map(shortDate).join(' and ')} look heavy, so plan around them.`);
  return parts.join(' ');
}

export function buildGoalRead({ goal, projects = [], tasks = [], terms = [], today, dismissed = [] }) {
  const { hostedProjects, hostedTasks } = hostedOf(goal, projects, tasks);
  const stamps = [goal.updated_at, ...hostedTasks.flatMap(t => [t.completed_at, t.updated_at])]
    .filter(stamp => typeof stamp === 'string' && stamp)
    .sort();
  const last = stamps.at(-1) ?? goal.created_at ?? `${today}T00:00:00Z`;
  const days = Math.max(0, daysBetween(sydneyKey(last), today));
  const temperature = days <= 3 ? 'warm' : days <= 8 ? 'cooling' : 'cold';
  const monday = mondayOfKey(today);
  const sunday = addDays(monday, 6);
  const count = hostedTasks.filter(t => {
    if (typeof t.completed_at !== 'string') return false;
    const key = sydneyKey(t.completed_at);
    return key >= monday && key <= sunday;
  }).length + (goal.week_log?.[monday]?.manual ?? 0);
  const perWeek = goal.lead_measure?.per_week ?? null;
  const crunch = crunchWeeks(tasks, terms, today);
  const skip = new Set(dismissed);
  const ghosts = proposals({ goal, hostedTasks, tasks, today, crunch, domain: SPHERE_DOMAIN[goal.sphere] ?? 'life' })
    .filter(ghost => !skip.has(ghost.id))
    .slice(0, MAX_GHOSTS);
  return {
    goal_id: goal.id,
    computed_on: today,
    basis_updated_at: basisUpdatedAt(goal, projects, tasks),
    temperature,
    days_since_movement: days,
    week: { count, per_week: perWeek },
    crunch_weeks: crunch,
    verdict: verdictFor({ days, temperature, count, perWeek, crunch }),
    looked_at: [
      'Progress',
      ...(perWeek ? ['Lead measure'] : []),
      'Due dates',
      ...(terms.length ? ['Term rhythm'] : []),
      'Stall check',
      ...(hostedProjects.length ? ['Linked projects'] : [])
    ],
    ghosts
  };
}
