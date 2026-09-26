// apps/tasks/src/domain/goal-runway.ts
import type { Goal, GoalSphere } from '@/schemas/goal';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import { addDaysKey, mondayOf, termAt, type SchoolTerm } from '@/domain/school-time';
import { hostedTasks, oneMove, SPHERES, SPHERE_LABEL } from '@/domain/goal-hosting';

export type CellState = 'done' | 'part' | 'rest' | 'missed' | 'empty' | 'future';
export type RunwayWeek = { monday: string; index: number; label: string; isNow: boolean; isCrunch: boolean };
export type RunwayCell = { monday: string; state: CellState; count: number; isNow: boolean; milestone: boolean; proposed: boolean };
export type RunwayRow = {
  goal: Goal;
  cells: RunwayCell[];
  move: { title: string; taskId: string | null } | null;
  thisWeek: { count: number; perWeek: number | null };
};
export type RunwayLane = {
  sphere: GoalSphere;
  label: string;
  rows: RunwayRow[];
  /** Active goals with term: null — shown in an Ongoing group; do not count toward the lane cap. */
  ongoing: RunwayRow[];
  parked: Goal[];
  /** Active goals in this term only (Ongoing excluded). */
  slotsUsed: number;
};
export type Runway = {
  term: SchoolTerm;
  weeks: RunwayWeek[];
  lanes: RunwayLane[];
  weekSummary: { done: number; total: number };
  /** 1-based week of `today` inside the term, or null outside it. */
  nowWeek: number | null;
};

const SYDNEY_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit'
});

export function sydneyDateKey(iso: string): string {
  return SYDNEY_DAY.format(new Date(iso));
}

export function sydneyToday(now: Date = new Date()): string {
  return SYDNEY_DAY.format(now);
}

export function flattenTerms(prefs: { school_terms: Array<{ terms: SchoolTerm[] }> }): SchoolTerm[] {
  return prefs.school_terms.flatMap((year) => year.terms).sort((a, b) => a.starts_on.localeCompare(b.starts_on));
}

/** The term containing `today`, else the next one to start, else the last one. */
export function currentTerm(terms: SchoolTerm[], today: string): SchoolTerm | null {
  return termAt(today, terms) ?? terms.find((t) => t.starts_on > today) ?? terms.at(-1) ?? null;
}

export function termWeeks(term: SchoolTerm, today: string): RunwayWeek[] {
  const nowMonday = mondayOf(today);
  const weeks: RunwayWeek[] = [];
  let monday = mondayOf(term.starts_on);
  let index = 1;
  while (monday <= term.ends_on) {
    weeks.push({ monday, index, label: `W${index}`, isNow: monday === nowMonday, isCrunch: false });
    monday = addDaysKey(monday, 7);
    index += 1;
  }
  return weeks;
}

export function weekCount(goal: Goal, hosted: Task[], monday: string): number {
  const sunday = addDaysKey(monday, 6);
  const auto = hosted.filter((t) => {
    if (!t.completed_at) return false;
    const key = sydneyDateKey(t.completed_at);
    return key >= monday && key <= sunday;
  }).length;
  return auto + (goal.week_log[monday]?.manual ?? 0);
}

export function cellState(goal: Goal, count: number, monday: string, nowMonday: string): CellState {
  if (goal.rest_weeks.includes(monday)) return 'rest';
  if (monday > nowMonday) return 'future';
  const perWeek = goal.lead_measure?.per_week ?? 1;
  if (count >= perWeek) return 'done';
  if (count > 0) return 'part';
  return monday < nowMonday ? 'missed' : 'empty';
}

/** Year of a school term row — from starts_on. */
export function termYear(term: SchoolTerm): number {
  return Number(term.starts_on.slice(0, 4));
}

/** True when the goal is tied to this school term (not Ongoing). */
export function goalBelongsToTerm(goal: Goal, term: SchoolTerm): boolean {
  if (!goal.term) return false;
  return goal.term.term === term.term && goal.term.year === termYear(term);
}

function buildRow(
  goal: Goal,
  weeks: RunwayWeek[],
  projects: Project[],
  tasks: Task[],
  nowMonday: string,
  proposedRest: Record<string, string[]>
): RunwayRow {
  const hosted = hostedTasks(goal, tasks, projects);
  const proposed = new Set(proposedRest[goal.id] ?? []);
  const cells = weeks.map((week): RunwayCell => {
    const count = weekCount(goal, hosted, week.monday);
    const sunday = addDaysKey(week.monday, 6);
    return {
      monday: week.monday,
      state: cellState(goal, count, week.monday, nowMonday),
      count,
      isNow: week.isNow,
      milestone: goal.milestones.some((m) => m.due_date !== null && m.due_date >= week.monday && m.due_date <= sunday),
      proposed: proposed.has(week.monday)
    };
  });
  const thisCount = weekCount(goal, hosted, nowMonday);
  const perWeek = goal.lead_measure?.per_week ?? null;
  return { goal, cells, move: oneMove(goal, hosted), thisWeek: { count: thisCount, perWeek } };
}

export function buildRunway(input: {
  goals: Goal[];
  projects: Project[];
  tasks: Task[];
  term: SchoolTerm;
  today: string;
  crunchWeeks?: string[];
  /** goal id → Monday keys a pending `goal_rest_weeks` ghost would rest. */
  proposedRest?: Record<string, string[]>;
}): Runway {
  const { goals, projects, tasks, term, today, crunchWeeks = [], proposedRest = {} } = input;
  const nowMonday = mondayOf(today);
  const crunch = new Set(crunchWeeks);
  const weeks = termWeeks(term, today).map((w) => ({ ...w, isCrunch: crunch.has(w.monday) }));
  let done = 0;
  let total = 0;

  const lanes = SPHERES.map((sphere): RunwayLane => {
    const inLane = goals.filter((g) => g.sphere === sphere);
    const termActive = inLane.filter((g) => g.status === 'active' && goalBelongsToTerm(g, term));
    const ongoingActive = inLane.filter((g) => g.status === 'active' && g.term === null);
    const rows = termActive.map((goal) => buildRow(goal, weeks, projects, tasks, nowMonday, proposedRest));
    const ongoing = ongoingActive.map((goal) => buildRow(goal, weeks, projects, tasks, nowMonday, proposedRest));
    for (const row of [...rows, ...ongoing]) {
      const perWeek = row.thisWeek.perWeek;
      if (perWeek !== null && !row.goal.rest_weeks.includes(nowMonday)) {
        total += 1;
        if (row.thisWeek.count >= perWeek) done += 1;
      }
    }
    return {
      sphere,
      label: SPHERE_LABEL[sphere],
      rows,
      ongoing,
      parked: inLane.filter((g) => g.status === 'parked' || g.status === 'achieved' || g.status === 'dropped'),
      slotsUsed: termActive.length
    };
  });

  const now = weeks.find((w) => w.isNow);
  return { term, weeks, lanes, weekSummary: { done, total }, nowWeek: now ? now.index : null };
}
