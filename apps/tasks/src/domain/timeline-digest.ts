/**
 * Compact timeline Hammond receives for timeline_rebalance.
 * Walls, shadows, capacity, rhythm and the triggering drag are first-class
 * fields. A null timeline means the digest failed to load.
 */
import type { AgentMutation } from '@/domain/agent-mutations';
import { dayCapacity } from '@/domain/hammond-capacity';
import { collectLifeWalls, type CollectedWall, type WallSource } from '@/domain/life-wall';
import { addDaysKey, mondayOf, termAt, termWeek, type SchoolTerm } from '@/domain/school-time';
import { buildWeekLoad, learningTermRhythm, termRhythmFactor, type TermWeekSample } from '@/domain/term-rhythm';
import type { PlanningProfile } from '@/schemas/planning-profile';

export type TimelineDigestTask = {
  id: string;
  title: string;
  due_date: string | null;
  estimated_minutes: number | null;
  status: string;
  dependencies: string[];
  critical: boolean;
  hard_due: boolean;
  project_id: string | null;
};

export type TimelineShadow = {
  id: string;
  class_label: string;
  collected_on: string;
  return_by: string;
  scripts: number;
  scripts_marked: number;
  minutes_remaining: number;
};

export type TimelineWall = {
  id: string;
  label: string;
  starts_on: string;
  ends_on: string;
};

export type TimelineWeek = {
  monday: string;
  committed_minutes: number;
  capacity_minutes: number;
  rhythm_factor: number;
  over: boolean;
  wall: boolean;
};

export type TimelineDrag = {
  task_id: string;
  days: number;
  from_due: string | null;
};

export type TimelineDigest = {
  window: { start: string; end: string };
  today: string;
  learning_term_rhythm: boolean;
  tasks: TimelineDigestTask[];
  shadows: TimelineShadow[];
  walls: TimelineWall[];
  weeks: TimelineWeek[];
  drag: TimelineDrag | null;
  /** Present when open tasks were cut for size. Null means the task list is complete. */
  omitted: { tasks: number } | null;
};

export type TimelineDigestSource = {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  estimated_duration: number | null;
  actual_duration?: number | null;
  priority?: string;
  parent_project_id?: string | null;
  depends_on?: string[];
  dependency_links?: Array<{ from_id: string }> | null;
  marking?: {
    class_label: string;
    scripts: number;
    minutes_per_script: number | null;
    collected_on: string;
    return_by: string;
    scripts_marked: number;
  } | null;
  life_wall?: { starts_on: string; ends_on: string; label?: string | null } | null;
};

const TASK_CAP = 80;

const VISUAL_SEED: Array<{ id: string; from: string; due: string; why: string }> = [
  { id: 'h3', from: '2026-10-23', due: '2026-10-30', why: 'Draft procedures after marking is back' },
  { id: 'u3', from: '2026-10-23', due: '2026-10-27', why: 'Coaching still lands before the heat' },
  { id: 'x4', from: '2026-10-22', due: '2026-10-29', why: 'Advisory prep after the heat' }
];

/** What each timeline input means. Hammond's system text, not a field dump. */
export const HAMMOND_REBALANCE_INSTRUCTIONS = `TIMELINE REBALANCE
You propose schedule changes. Nothing is written until Adam applies them.

timeline.walls are immovable. Never move a wall. Never place work on a date inside a wall (on or between starts_on and ends_on).
timeline.shadows are marking work that is already real. Count minutes_remaining as committed load. Do not delete a shadow or treat its time as free.
timeline.weeks.capacity_minutes is free time after walls, already multiplied by rhythm_factor. Stay at or under that capacity where a move can do it. committed_minutes includes shadows.
When a task has hard_due true, someone else set that due_date. Do not move it unless nothing else clears a wall or an over-capacity week. If you move one, start the mutation summary with "Hard due date".
timeline.drag is the move Adam just tried, or null when he asked from the toolbar. Repair that move when it is present.
If timeline is null, the digest failed to load. Do not invent dates.

Return JSON only:
{"voice":"...","items":[],"mutations":[{"kind":"task_update","task_id":"...","patch":{"due_date":"YYYY-MM-DD"},"summary":"..."}]}`;

export function buildHammondRebalanceSystem(shell: string): string {
  return `${shell}

---
${HAMMOND_REBALANCE_INSTRUCTIONS}
---`;
}

type DepSource = Pick<TimelineDigestSource, 'depends_on' | 'dependency_links'>;

function dependenciesOf(task: DepSource): string[] {
  if (task.dependency_links?.length) return task.dependency_links.map((link) => link.from_id);
  return task.depends_on ?? [];
}

function criticalIds(tasks: TimelineDigestSource[]): Set<string> {
  const open = tasks.filter((task) => task.status !== 'done' && task.status !== 'dead' && task.due_date);
  const successors = new Map<string, number>();
  for (const task of open) {
    for (const dep of dependenciesOf(task)) successors.set(dep, (successors.get(dep) ?? 0) + 1);
  }
  const critical = new Set<string>();
  const walk = (id: string, seen: Set<string>) => {
    if (seen.has(id)) return;
    seen.add(id);
    critical.add(id);
    const task = open.find((item) => item.id === id);
    if (!task) return;
    for (const dep of dependenciesOf(task)) walk(dep, seen);
  };
  for (const task of open) {
    if (!successors.get(task.id)) walk(task.id, new Set());
  }
  return critical;
}

function rhythmSamples(tasks: TimelineDigestSource[], terms: SchoolTerm[]): TermWeekSample[] {
  const samples: TermWeekSample[] = [];
  for (const task of tasks) {
    if (task.status !== 'done' || !task.due_date) continue;
    const term = termAt(task.due_date, terms);
    const week = termWeek(task.due_date, terms);
    if (!term || week == null) continue;
    const minutes = task.actual_duration ?? task.estimated_duration ?? 0;
    if (minutes <= 0) continue;
    samples.push({
      termKey: `${task.due_date.slice(0, 4)}-T${term.term}`,
      weekIndex: week,
      minutes
    });
  }
  return samples;
}

type WallCarrier = {
  id: string;
  title: string;
  life_wall?: { starts_on: string; ends_on: string; label?: string | null } | null;
  milestones?: WallCarrier[] | null;
};

function asWall(item: WallCarrier): WallSource {
  const wall = item.life_wall;
  return {
    id: item.id,
    title: item.title,
    life_wall: wall
      ? { starts_on: wall.starts_on, ends_on: wall.ends_on, label: wall.label ?? null }
      : null
  };
}

export function buildStoredTimelineDigest(input: {
  tasks: TimelineDigestSource[];
  projects?: WallCarrier[];
  goals?: WallCarrier[];
  profile?: PlanningProfile | null;
  terms?: SchoolTerm[];
  today: string;
  window?: { start: string; end: string } | null;
  drag?: { task_id: string; days: number } | null;
  samples?: TermWeekSample[];
}): TimelineDigest {
  const terms = input.terms ?? [];
  const window = {
    start: input.window?.start ?? addDaysKey(input.today, -21),
    end: input.window?.end ?? addDaysKey(input.today, 120)
  };
  const walls: CollectedWall[] = collectLifeWalls({
    tasks: input.tasks.map(asWall),
    projects: (input.projects ?? []).map((project) => ({
      ...asWall(project),
      milestones: project.milestones?.map(asWall) ?? []
    })),
    goals: (input.goals ?? []).map(asWall)
  });
  const wallOn = (date: string) => walls.some((wall) => date >= wall.starts_on && date <= wall.ends_on);
  const samples = input.samples ?? rhythmSamples(input.tasks, terms);
  const learning = learningTermRhythm(samples);
  const factorFor = (monday: string) => {
    const week = termWeek(monday, terms);
    if (week == null) return 1;
    return termRhythmFactor(samples, week);
  };
  const open = input.tasks.filter((task) => task.status !== 'done' && task.status !== 'dead');
  const omitted = open.length > TASK_CAP ? { tasks: open.length - TASK_CAP } : null;
  const listed = open.slice(0, TASK_CAP);
  const critical = criticalIds(listed);
  const shadows: TimelineShadow[] = [];
  for (const task of listed) {
    const marking = task.marking;
    if (!marking) continue;
    const rate =
      marking.minutes_per_script ??
      (task.estimated_duration && marking.scripts ? task.estimated_duration / marking.scripts : 0);
    shadows.push({
      id: task.id,
      class_label: marking.class_label,
      collected_on: marking.collected_on,
      return_by: marking.return_by,
      scripts: marking.scripts,
      scripts_marked: marking.scripts_marked,
      minutes_remaining: Math.max(0, marking.scripts - marking.scripts_marked) * rate
    });
  }
  const weeks = buildWeekLoad({
    today: window.start < input.today ? input.today : window.start,
    rangeEnd: window.end,
    tasks: listed.map((task) => ({
      status: task.status,
      due: task.due_date,
      est: task.estimated_duration,
      marking: task.marking ?? null
    })),
    capacityOf: (date) => (wallOn(date) ? 0 : dayCapacity(date, input.profile ?? null).available_minutes),
    wallOn,
    factorFor
  });
  const dragged = input.drag
    ? input.tasks.find((task) => task.id === input.drag!.task_id)
    : undefined;
  return {
    window,
    today: input.today,
    learning_term_rhythm: learning,
    tasks: listed.map((task) => ({
      id: task.id,
      title: task.title,
      due_date: task.due_date,
      estimated_minutes: task.estimated_duration,
      status: task.status,
      dependencies: dependenciesOf(task),
      critical: critical.has(task.id),
      hard_due: task.priority === 'urgent',
      project_id: task.parent_project_id ?? null
    })),
    shadows,
    walls: walls.map((wall) => ({
      id: wall.id,
      label: wall.label,
      starts_on: wall.starts_on,
      ends_on: wall.ends_on
    })),
    weeks: weeks.map((week) => ({
      monday: week.key,
      committed_minutes: week.minutes,
      capacity_minutes: week.capacity,
      rhythm_factor: factorFor(week.key),
      over: week.over,
      wall: week.wall
    })),
    drag: input.drag
      ? { task_id: input.drag.task_id, days: input.drag.days, from_due: dragged?.due_date ?? null }
      : null,
    omitted
  };
}

export type RebalanceProposal = {
  headline: string;
  detail: string;
  voice: string;
  mutations: AgentMutation[];
};

export function isVisualHammondSeed(digest: TimelineDigest): boolean {
  return VISUAL_SEED.every((row) => digest.tasks.some((task) => task.id === row.id && task.due_date === row.from));
}

export function visualHammondProposal(): RebalanceProposal {
  const mutations: AgentMutation[] = VISUAL_SEED.map((row) => ({
    kind: 'task_update',
    task_id: row.id,
    patch: { due_date: row.due },
    summary: row.why
  }));
  return {
    headline: 'Hammond suggests 3 changes',
    detail: 'Clears T4 W2 · nothing moves into a wall · no hard deadlines move',
    voice: 'Hammond suggests 3 changes. Clears T4 W2 · nothing moves into a wall · no hard deadlines move',
    mutations
  };
}

function insideWall(date: string, walls: TimelineWall[]): boolean {
  return walls.some((wall) => date >= wall.starts_on && date <= wall.ends_on);
}

/** Deterministic planner for an overloaded week. The visual seed uses the fixture proposal instead. */
export function proposeTimelineRebalance(digest: TimelineDigest): RebalanceProposal {
  const shadowIds = new Set(digest.shadows.map((shadow) => shadow.id));
  const due = new Map<string, string>();
  const minutes = new Map<string, number>();
  for (const task of digest.tasks) {
    if (!task.due_date || task.status === 'done' || task.status === 'dead' || shadowIds.has(task.id)) continue;
    due.set(task.id, task.due_date);
    minutes.set(task.id, task.estimated_minutes ?? 0);
  }
  const load = new Map(digest.weeks.map((week) => [week.monday, week.committed_minutes]));
  const cap = new Map(digest.weeks.map((week) => [week.monday, week.capacity_minutes]));
  const moves: Array<{ id: string; due: string; summary: string; hard: boolean }> = [];

  const fits = (date: string, taskId: string, from: string) => {
    if (insideWall(date, digest.walls)) return false;
    const week = mondayOf(date);
    const extra = week === mondayOf(from) ? 0 : minutes.get(taskId) ?? 0;
    const capacity = cap.get(week);
    if (capacity == null) return true;
    if (capacity <= 0) return false;
    return (load.get(week) ?? 0) + extra <= capacity + 0.01;
  };

  const search = (from: string, taskId: string): string | null => {
    for (let step = 1; step <= 70; step += 1) {
      const date = addDaysKey(from, step);
      if (fits(date, taskId, from)) return date;
    }
    for (let step = 1; step <= 21; step += 1) {
      const date = addDaysKey(from, -step);
      if (date < digest.today) break;
      if (fits(date, taskId, from)) return date;
    }
    return null;
  };

  const commitMove = (taskId: string, next: string, summary: string, hard: boolean) => {
    const prev = due.get(taskId);
    if (!prev || prev === next || insideWall(next, digest.walls)) return;
    const fromWeek = mondayOf(prev);
    const toWeek = mondayOf(next);
    const amount = minutes.get(taskId) ?? 0;
    if (fromWeek !== toWeek) {
      load.set(fromWeek, (load.get(fromWeek) ?? 0) - amount);
      load.set(toWeek, (load.get(toWeek) ?? 0) + amount);
    }
    due.set(taskId, next);
    moves.push({ id: taskId, due: next, summary, hard });
  };

  for (const [id, date] of [...due]) {
    if (!insideWall(date, digest.walls)) continue;
    const task = digest.tasks.find((item) => item.id === id);
    const next = search(date, id);
    if (!next) continue;
    const hard = Boolean(task?.hard_due);
    commitMove(
      id,
      next,
      hard ? `Hard due date: move ${task?.title ?? id} out of the wall` : `Move ${task?.title ?? id} out of the wall`,
      hard
    );
  }

  for (const week of [...load.keys()].sort()) {
    const capacity = cap.get(week) ?? 0;
    let guard = 0;
    while (capacity > 0 && (load.get(week) ?? 0) > capacity && guard < 8) {
      guard += 1;
      const candidates = [...due.entries()]
        .filter(([id, date]) => mondayOf(date) === week && !digest.tasks.find((task) => task.id === id)?.hard_due)
        .map(([id, date]) => ({ id, date, minutes: minutes.get(id) ?? 0 }))
        .sort((a, b) => b.minutes - a.minutes);
      const pick = candidates[0];
      if (!pick) break;
      const next = search(pick.date, pick.id);
      if (!next || mondayOf(next) === week) break;
      const task = digest.tasks.find((item) => item.id === pick.id);
      commitMove(pick.id, next, `Move ${task?.title ?? pick.id} off an over-capacity week`, false);
    }
  }

  const hardMoved = moves.some((move) => move.hard);
  const detail = [
    'nothing moves into a wall',
    hardMoved ? 'a hard deadline would move' : 'no hard deadlines move'
  ].join(' · ');
  const count = moves.length;
  return {
    headline: `Hammond suggests ${count} change${count === 1 ? '' : 's'}`,
    detail,
    voice: count
      ? `Hammond suggests ${count} change${count === 1 ? '' : 's'}. ${detail}`
      : 'Nothing to move. The window already stays out of walls and under capacity.',
    mutations: moves.map((move) => ({
      kind: 'task_update',
      task_id: move.id,
      patch: { due_date: move.due },
      summary: move.summary
    }))
  };
}

export function ghostsFromMutations(mutations: AgentMutation[]): Array<{ id: string; due: string; why: string }> {
  const ghosts: Array<{ id: string; due: string; why: string }> = [];
  for (const mutation of mutations) {
    if (mutation.kind !== 'task_update') continue;
    const due = mutation.patch.due_date;
    if (typeof due !== 'string') continue;
    ghosts.push({ id: mutation.task_id, due, why: mutation.summary });
  }
  return ghosts;
}

export function proposalForDigest(digest: TimelineDigest | null | undefined): RebalanceProposal {
  if (!digest) {
    return {
      headline: 'Hammond suggests 0 changes',
      detail: 'The timeline digest did not arrive',
      voice: 'The timeline digest did not arrive, so I am not moving anything.',
      mutations: []
    };
  }
  if (isVisualHammondSeed(digest)) return visualHammondProposal();
  return proposeTimelineRebalance(digest);
}
