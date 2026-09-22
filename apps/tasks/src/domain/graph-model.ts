import { isBlocked } from '@/domain/board';
import { buildDayCapacity } from '@/domain/capacity';
import { lastProjectActivityAt, stallThresholdDate } from '@/domain/stall';
import { addDays, parseDue, startOfDay, toDateKey } from '@/domain/queries';
import { projectMilestones } from '@/domain/project-milestones';
import type { Task } from '@/schemas/task';
import type { Milestone, Project } from '@/schemas/project';

/** estimated_duration is stored in minutes. One working day when missing. */
export const WORKING_DAY_MINUTES = 480;
export const EFFORT_FLOOR_MINUTES = 15;
export const DUE_SOON_DAYS = 7;
export const MAJOR_DELAY_BEHIND = 2;
export const ORBIT_R0 = 40;
export const ORBIT_RMAX = 180;
export const ORBIT_LATER_GAP = 24;
export const ORBIT_OVERDUE_MIN = 16;
export const ORBIT_OVERDUE_MAX = 22;
/** Tune so an outer orbit (~RMAX) takes ~80s and an inner overdue core ~6s. */
export const ORBIT_BASE_OMEGA = (2 * Math.PI) / 80;

const DONE = new Set(['done', 'dead']);
const WAITING = new Set(['waiting', 'follow_up_due']);

export type NodeStateId =
  | 'done'
  | 'current'
  | 'open'
  | 'blocked'
  | 'waiting'
  | 'stalled'
  | 'overdue';

export type NodeState = {
  state: NodeStateId;
  noDate: boolean;
  dueSoon: boolean;
  overdue: boolean;
  onCriticalPath: boolean;
};

export type RouteStation = {
  id: string;
  kind: 'task' | 'milestone';
  title: string;
  task?: Task;
  milestone?: Milestone;
  parentStationId: string | null;
  interchangeProjectIds: string[];
};

export type ProjectRoute = {
  projectId: string;
  stations: RouteStation[];
  mainline: RouteStation[];
};

export type Pace = {
  expectedDone: number;
  actualDone: number;
  behind: number;
  ghostIndex: number;
  totalStations: number;
  daysRemaining: number | null;
};

export type ServiceStatusId =
  | 'arrived'
  | 'suspended'
  | 'major_delays'
  | 'minor_delays'
  | 'good_service';

export type ServiceStatus = {
  status: ServiceStatusId;
  label: string;
  reason: string;
};

export type ProjectedDate = {
  taskId: string;
  start: string;
  finish: string;
  late: boolean;
};

export type DoFirstRank = {
  taskId: string;
  score: number;
  unlockCount: number;
  deadlinePressure: number;
  effort: number;
  daysToDeadline: number | null;
  explanation: string;
};

export type OrbitBodyMetrics = {
  radius: number;
  angularSpeed: number;
  heat: number;
  size: 1 | 2 | 3;
  effectiveDays: number;
  angle: number;
};

export type Collision = {
  dateKey: string;
  tasks: Task[];
  suggestedMoveId: string | null;
  minutes: number;
};

export type TaskOverrides = Record<
  string,
  Partial<Pick<Task, 'due_date' | 'estimated_duration' | 'depends_on' | 'status'>>
>;

const PRIORITY_RANK: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3
};

function isDone(task: Pick<Task, 'status'>): boolean {
  return DONE.has(String(task.status));
}

function isWaiting(task: Pick<Task, 'waiting_status' | 'waiting_on'>): boolean {
  return WAITING.has(String(task.waiting_status ?? '')) || Boolean(task.waiting_on);
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
}

function dateKey(date: Date): string {
  return toDateKey(date);
}

function addWorkingDays(from: Date, days: number): Date {
  const next = startOfDay(from);
  let left = Math.max(0, days);
  while (left > 0) {
    next.setDate(next.getDate() + 1);
    const dow = next.getDay();
    if (dow !== 0 && dow !== 6) left -= 1;
  }
  return next;
}

function addWorkingMinutes(from: Date, minutes: number): Date {
  if (minutes <= 0) return startOfDay(from);
  const days = Math.floor(minutes / WORKING_DAY_MINUTES);
  const rem = minutes % WORKING_DAY_MINUTES;
  const afterDays = addWorkingDays(from, days);
  if (rem === 0) return afterDays;
  if (days === 0 && rem < WORKING_DAY_MINUTES) return startOfDay(from);
  return addWorkingDays(from, days + (rem > 0 ? 1 : 0));
}

function effortMinutes(task: Pick<Task, 'estimated_duration'>): number {
  return Math.max(EFFORT_FLOOR_MINUTES, task.estimated_duration ?? WORKING_DAY_MINUTES);
}

function applyOverrides(task: Task, overrides?: TaskOverrides): Task {
  const patch = overrides?.[task.id];
  return patch ? { ...task, ...patch } : task;
}

function dependentsOf(taskId: string, tasks: Task[]): Task[] {
  return tasks.filter((task) => (task.depends_on ?? []).includes(taskId));
}

function hashIdAngle(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 33 + id.charCodeAt(i)) >>> 0;
  return ((hash % 3600) / 3600) * Math.PI * 2;
}

export function graphDataHash(
  tasks: Task[],
  projects: Project[] = [],
  now: Date = new Date()
): string {
  const taskPart = tasks
    .map(
      (t) =>
        `${t.id}:${t.updated_at}:${t.status}:${t.due_date}:${t.step_order}:${t.parent_project_id}:${t.parent_task_id}:${(t.depends_on ?? []).join(',')}:${t.waiting_status}:${t.estimated_duration}`
    )
    .sort()
    .join('|');
  const projectPart = projects
    .map(
      (p) =>
        `${p.id}:${p.updated_at}:${p.status}:${p.current_end_date}:${projectMilestones(p)
          .map((m) => `${m.id}:${m.status}:${m.due_date}:${(m.depends_on ?? []).join(',')}`)
          .join(';')}`
    )
    .sort()
    .join('|');
  return `${dateKey(now)}#${taskPart}#${projectPart}`;
}

const memo = new Map<string, unknown>();

export function memoByHash<T>(key: string, compute: () => T): T {
  const hit = memo.get(key);
  if (hit !== undefined) return hit as T;
  const value = compute();
  memo.set(key, value);
  if (memo.size > 32) {
    const first = memo.keys().next().value;
    if (first !== undefined) memo.delete(first);
  }
  return value;
}

export function clearGraphModelMemo(): void {
  memo.clear();
}

function projectTasks(projectId: string, tasks: Task[]): Task[] {
  return tasks.filter((t) => t.parent_project_id === projectId && t.bucket !== 'someday');
}

function sortProjectTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.step_order !== b.step_order) return a.step_order - b.step_order;
    const ad = parseDue(a.due_date)?.getTime() ?? Number.POSITIVE_INFINITY;
    const bd = parseDue(b.due_date)?.getTime() ?? Number.POSITIVE_INFINITY;
    if (ad !== bd) return ad - bd;
    return a.created_at.localeCompare(b.created_at);
  });
}

export function projectRoute(project: Project, tasks: Task[]): ProjectRoute {
  const children = sortProjectTasks(projectTasks(project.id, tasks));
  const byId = new Map(children.map((t) => [t.id, t]));
  const stations: RouteStation[] = [];

  for (const task of children) {
    const interchangeProjectIds = (task.depends_on ?? [])
      .map((id) => tasks.find((other) => other.id === id))
      .filter((dep): dep is Task => Boolean(dep) && dep.parent_project_id !== project.id)
      .map((dep) => dep.parent_project_id)
      .filter((id): id is string => Boolean(id));
    stations.push({
      id: task.id,
      kind: 'task',
      title: task.title,
      task,
      parentStationId: task.parent_task_id && byId.has(task.parent_task_id) ? task.parent_task_id : null,
      interchangeProjectIds: [...new Set(interchangeProjectIds)]
    });
  }

  const milestones = projectMilestones(project);
  for (const milestone of milestones) {
    const deps = milestone.depends_on ?? [];
    let parentStationId: string | null = null;
    if (deps.length) {
      const lastDep = [...children].reverse().find((t) => deps.includes(t.id));
      parentStationId = lastDep?.id ?? null;
    }
    const insertAt = parentStationId
      ? stations.findIndex((s) => s.id === parentStationId) + 1
      : (() => {
          const due = parseDue(milestone.due_date);
          if (!due) return stations.length;
          const idx = stations.findIndex((s) => {
            const stamp = parseDue(s.task?.due_date ?? s.milestone?.due_date ?? null);
            return stamp != null && stamp.getTime() > due.getTime();
          });
          return idx === -1 ? stations.length : idx;
        })();
    stations.splice(Math.max(0, insertAt), 0, {
      id: milestone.id,
      kind: 'milestone',
      title: milestone.title,
      milestone,
      parentStationId,
      interchangeProjectIds: []
    });
  }

  return {
    projectId: project.id,
    stations,
    mainline: stations.filter((s) => !s.parentStationId)
  };
}

function firstUnfinishedId(project: Project, tasks: Task[]): string | null {
  const route = projectRoute(project, tasks);
  const open = route.mainline.find((s) => {
    if (s.kind === 'milestone') return s.milestone?.status !== 'done';
    return s.task ? !isDone(s.task) : false;
  });
  return open?.id ?? null;
}

export function nodeState(task: Task, allTasks: Task[], now: Date = new Date()): NodeState {
  const byId = new Map(allTasks.map((item) => [item.id, item]));
  const due = parseDue(task.due_date);
  const today = startOfDay(now);
  const overdue = Boolean(due && startOfDay(due).getTime() < today.getTime() && !isDone(task));
  const dueSoon = Boolean(
    due && !isDone(task) && !overdue && daysBetween(today, due) <= DUE_SOON_DAYS
  );
  const noDate = !task.due_date;
  const projectId = task.parent_project_id;
  const siblings = projectId ? projectTasks(projectId, allTasks) : allTasks;
  const ordered = sortProjectTasks(siblings.filter((item) => !item.parent_task_id));
  const currentId = ordered.find((item) => !isDone(item))?.id ?? null;
  const current = currentId === task.id;
  let stalled = false;
  if (current && projectId) {
    const projectLike = {
      id: projectId,
      updated_at: task.updated_at,
      created_at: task.created_at
    } as Project;
    const last = lastProjectActivityAt(projectLike, siblings);
    stalled = last.getTime() <= stallThresholdDate(now).getTime();
  }

  const path = projectId ? criticalPath(projectId, allTasks) : [];
  const onCriticalPath = path.includes(task.id);

  let state: NodeStateId = 'open';
  if (isDone(task)) state = 'done';
  else if (isBlocked(task, byId)) state = 'blocked';
  else if (isWaiting(task)) state = 'waiting';
  else if (stalled) state = 'stalled';
  else if (overdue) state = 'overdue';
  else if (current) state = 'current';
  else state = 'open';

  return { state, noDate, dueSoon, overdue, onCriticalPath };
}

function terminusDate(project: Project, tasks: Task[]): Date | null {
  const end = parseDue(project.current_end_date);
  if (end) return end;
  const child = projectTasks(project.id, tasks);
  const dues = child.map((t) => parseDue(t.due_date)).filter((d): d is Date => Boolean(d));
  const miles = projectMilestones(project)
    .map((m) => parseDue(m.due_date))
    .filter((d): d is Date => Boolean(d));
  const all = [...dues, ...miles];
  if (!all.length) return null;
  return all.reduce((latest, date) => (date.getTime() > latest.getTime() ? date : latest));
}

function spanStart(project: Project, tasks: Task[]): Date {
  const created = parseDue(project.created_at) ?? startOfDay(new Date(project.created_at));
  const child = projectTasks(project.id, tasks);
  const earliest = child
    .map((t) => parseDue(t.created_at))
    .filter((d): d is Date => Boolean(d))
    .reduce((min, date) => (date.getTime() < min.getTime() ? date : min), created);
  return startOfDay(earliest);
}

export function pace(project: Project, tasks: Task[], now: Date = new Date()): Pace | null {
  const terminus = terminusDate(project, tasks);
  if (!terminus) return null;
  const route = projectRoute(project, tasks);
  const totalStations = route.stations.length;
  if (!totalStations) return null;
  const start = spanStart(project, tasks);
  const span = Math.max(1, daysBetween(start, terminus));
  const elapsed = Math.max(0, daysBetween(start, now));
  const expectedDone = Math.min(1, elapsed / span);
  const ghostIndex = Math.round(expectedDone * totalStations);
  const actualDone = route.stations.filter((s) => {
    if (s.kind === 'milestone') return s.milestone?.status === 'done';
    return s.task ? isDone(s.task) : false;
  }).length;
  return {
    expectedDone,
    actualDone,
    behind: ghostIndex - actualDone,
    ghostIndex,
    totalStations,
    daysRemaining: daysBetween(now, terminus)
  };
}

const SERVICE_LABEL: Record<ServiceStatusId, string> = {
  arrived: 'Arrived',
  suspended: 'Suspended',
  major_delays: 'Major delays',
  minor_delays: 'Minor delays',
  good_service: 'Good service'
};

export function serviceStatus(
  project: Project,
  tasks: Task[],
  now: Date = new Date()
): ServiceStatus {
  const route = projectRoute(project, tasks);
  const unfinished = route.stations.filter((s) => {
    if (s.kind === 'milestone') return s.milestone?.status !== 'done';
    return s.task ? !isDone(s.task) : false;
  });
  if (route.stations.length && unfinished.length === 0) {
    return { status: 'arrived', label: SERVICE_LABEL.arrived, reason: 'Every station is done.' };
  }

  const siblings = projectTasks(project.id, tasks);
  const last = lastProjectActivityAt(project, siblings);
  if (last.getTime() <= stallThresholdDate(now).getTime()) {
    return {
      status: 'suspended',
      label: SERVICE_LABEL.suspended,
      reason: 'Nothing in this project has moved inside the stall window.'
    };
  }

  const measured = pace(project, tasks, now);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const blockedAhead = unfinished.some((s) => s.task && isBlocked(s.task, byId));
  const terminus = terminusDate(project, tasks);
  const terminusSoon = Boolean(terminus && daysBetween(now, terminus) < DUE_SOON_DAYS);
  const behind = measured?.behind ?? 0;

  if (behind >= MAJOR_DELAY_BEHIND || (terminusSoon && blockedAhead)) {
    return {
      status: 'major_delays',
      label: SERVICE_LABEL.major_delays,
      reason:
        behind >= MAJOR_DELAY_BEHIND
          ? `${behind} stations behind pace.`
          : 'Terminus is under 7 days away with a blocked station still ahead.'
    };
  }
  if (behind === 1 || blockedAhead) {
    return {
      status: 'minor_delays',
      label: SERVICE_LABEL.minor_delays,
      reason: behind === 1 ? 'One station behind pace.' : 'A station ahead is blocked.'
    };
  }
  return { status: 'good_service', label: SERVICE_LABEL.good_service, reason: 'On pace.' };
}

export function projectedDates(
  tasks: Task[],
  _projects: Project[],
  now: Date = new Date(),
  overrides?: TaskOverrides
): Map<string, ProjectedDate> {
  const working = tasks.map((t) => applyOverrides(t, overrides));
  const byId = new Map(working.map((t) => [t.id, t]));
  const today = startOfDay(now);
  const visiting = new Set<string>();
  const done = new Map<string, ProjectedDate>();

  const walk = (id: string): ProjectedDate => {
    const cached = done.get(id);
    if (cached) return cached;
    const task = byId.get(id);
    if (!task) {
      const empty = { taskId: id, start: dateKey(today), finish: dateKey(today), late: false };
      done.set(id, empty);
      return empty;
    }
    if (visiting.has(id)) {
      const cycle = { taskId: id, start: dateKey(today), finish: dateKey(today), late: false };
      done.set(id, cycle);
      return cycle;
    }
    visiting.add(id);
    let start = today;
    for (const depId of task.depends_on ?? []) {
      const dep = walk(depId);
      const finish = parseDue(dep.finish);
      if (finish && finish.getTime() > start.getTime()) start = finish;
    }
    const minutes = task.estimated_duration ?? WORKING_DAY_MINUTES;
    let finish = addWorkingMinutes(start, minutes);
    const due = parseDue(task.due_date);
    if (due && due.getTime() > finish.getTime()) finish = startOfDay(due);
    const late = Boolean(due && finish.getTime() > startOfDay(due).getTime());
    const result = { taskId: id, start: dateKey(start), finish: dateKey(finish), late };
    done.set(id, result);
    visiting.delete(id);
    return result;
  };

  for (const task of working) walk(task.id);
  return done;
}

export function unlockCount(taskId: string, tasks: Task[]): number {
  const seen = new Set<string>();
  const stack = [taskId];
  seen.add(taskId);
  let count = 0;
  while (stack.length) {
    const id = stack.pop()!;
    for (const next of dependentsOf(id, tasks)) {
      if (seen.has(next.id)) continue;
      seen.add(next.id);
      if (!isDone(next)) count += 1;
      stack.push(next.id);
    }
  }
  return count;
}

export function criticalPath(projectId: string, tasks: Task[]): string[] {
  const children = projectTasks(projectId, tasks);
  if (!children.length) return [];
  const byId = new Map(children.map((t) => [t.id, t]));
  const memoPath = new Map<string, { length: number; path: string[] }>();
  const visiting = new Set<string>();

  const walk = (id: string): { length: number; path: string[] } => {
    const cached = memoPath.get(id);
    if (cached) return cached;
    const task = byId.get(id);
    if (!task || visiting.has(id)) return { length: 0, path: [] };
    visiting.add(id);
    const weight = effortMinutes(task);
    const deps = (task.depends_on ?? []).filter((dep) => byId.has(dep));
    let best = { length: weight, path: [id] };
    for (const dep of deps) {
      const up = walk(dep);
      const length = up.length + weight;
      if (length > best.length) best = { length, path: [...up.path, id] };
    }
    visiting.delete(id);
    memoPath.set(id, best);
    return best;
  };

  let winner: string[] = [];
  let bestLen = -1;
  for (const task of children) {
    const result = walk(task.id);
    if (result.length > bestLen) {
      bestLen = result.length;
      winner = result.path;
    }
  }
  return winner;
}

function earliestDownstreamDeadline(taskId: string, tasks: Task[], now: Date): number | null {
  const task = tasks.find((t) => t.id === taskId);
  let best: number | null = null;
  const consider = (item: Task) => {
    const due = parseDue(item.due_date);
    if (!due) return;
    const days = daysBetween(now, due);
    if (best == null || days < best) best = days;
  };
  if (task) consider(task);
  const seen = new Set<string>([taskId]);
  const stack = [taskId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const next of dependentsOf(id, tasks)) {
      if (seen.has(next.id)) continue;
      seen.add(next.id);
      consider(next);
      stack.push(next.id);
    }
  }
  return best;
}

export function deadlinePressure(daysToDeadline: number | null): number {
  if (daysToDeadline == null) return 1;
  if (daysToDeadline <= 0) return 8;
  return 1 + 14 / Math.max(daysToDeadline, 0.5);
}

export function doFirst(tasks: Task[], now: Date = new Date()): DoFirstRank[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const ready = tasks.filter(
    (task) => !isDone(task) && !isBlocked(task, byId) && !isWaiting(task) && task.status !== 'deferred'
  );
  return ready
    .map((task) => {
      const unlock = unlockCount(task.id, tasks);
      const days = earliestDownstreamDeadline(task.id, tasks, now);
      const pressure = deadlinePressure(days);
      const effort = effortMinutes(task);
      const score = (unlock * pressure) / effort;
      const frees = unlock === 1 ? 'Frees 1 task' : `Frees ${unlock} tasks`;
      const finals =
        days == null ? 'No downstream deadline' : days < 0 ? 'Deadline passed' : `Finals in ${days} days`;
      const mins = `${task.estimated_duration ?? EFFORT_FLOOR_MINUTES} minutes`;
      return {
        taskId: task.id,
        score,
        unlockCount: unlock,
        deadlinePressure: pressure,
        effort,
        daysToDeadline: days,
        explanation: `${frees} · ${finals} · ${mins}`
      };
    })
    .sort((a, b) => b.score - a.score || a.effort - b.effort);
}

export function orbitBody(
  task: Task,
  now: Date = new Date(),
  lookAheadDays = 0
): OrbitBodyMetrics | null {
  const due = parseDue(task.due_date);
  if (!due) return null;
  const effectiveDays = daysBetween(now, due) - lookAheadDays;
  let radius: number;
  if (effectiveDays <= 0) {
    const overdueDays = Math.min(14, Math.abs(effectiveDays));
    radius = ORBIT_OVERDUE_MAX - (overdueDays / 14) * (ORBIT_OVERDUE_MAX - ORBIT_OVERDUE_MIN);
  } else if (effectiveDays <= 30) {
    radius = ORBIT_R0 + ((effectiveDays - 1) / 29) * (ORBIT_RMAX - ORBIT_R0);
  } else {
    radius = ORBIT_RMAX + ORBIT_LATER_GAP;
  }
  const angularSpeed = ORBIT_BASE_OMEGA * (ORBIT_RMAX / Math.max(radius, ORBIT_OVERDUE_MIN)) ** 1.35;
  const heat = Math.max(0, Math.min(1, 1 - effectiveDays / 14));
  const minutes = task.estimated_duration;
  const size: 1 | 2 | 3 = minutes == null ? 1 : minutes < 45 ? 1 : minutes < 120 ? 2 : 3;
  return {
    radius,
    angularSpeed,
    heat,
    size,
    effectiveDays,
    angle: hashIdAngle(task.id)
  };
}

export function separateOrbitAngles(
  bodies: Array<{ radius: number; angle: number; size: number }>
): void {
  for (let pass = 0; pass < 8; pass += 1) {
    for (let i = 0; i < bodies.length; i += 1) {
      for (let j = i + 1; j < bodies.length; j += 1) {
        const a = bodies[i]!;
        const b = bodies[j]!;
        if (Math.abs(a.radius - b.radius) > a.size + b.size + 18) continue;
        let delta = a.angle - b.angle;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        const minSep = 0.42;
        if (Math.abs(delta) >= minSep) continue;
        const push = (minSep - Math.abs(delta)) / 2;
        const dir = delta >= 0 ? 1 : -1;
        a.angle += dir * push;
        b.angle -= dir * push;
      }
    }
  }
}

function slackDays(task: Task, now: Date, tasks: Task[]): number {
  const due = parseDue(task.due_date);
  if (!due) return 99;
  const pressure = earliestDownstreamDeadline(task.id, tasks, now);
  if (pressure != null && pressure <= 7) return pressure;
  return daysBetween(now, due);
}

export function collisions(tasks: Task[], now: Date = new Date(), window = 7): Collision[] {
  const open = tasks.filter((t) => !isDone(t) && t.due_date);
  const out: Collision[] = [];
  for (let i = 0; i < window; i += 1) {
    const day = addDays(startOfDay(now), i);
    const cap = buildDayCapacity(open, day);
    const dayTasks = open.filter((t) => {
      const due = parseDue(t.due_date);
      return due ? toDateKey(due) === cap.date_key : false;
    });
    const hasEstimates = dayTasks.some((t) => t.estimated_duration != null);
    const overloaded = hasEstimates
      ? cap.estimated_minutes >= 240 || cap.level === 'slammed' || cap.level === 'busy'
      : dayTasks.length >= 3;
    if (!overloaded || dayTasks.length < 2) continue;
    const suggested = [...dayTasks].sort((a, b) => {
      const pa = PRIORITY_RANK[a.priority] ?? 2;
      const pb = PRIORITY_RANK[b.priority] ?? 2;
      if (pa !== pb) return pb - pa;
      const sa = slackDays(a, now, tasks);
      const sb = slackDays(b, now, tasks);
      return sb - sa;
    })[0];
    out.push({
      dateKey: cap.date_key,
      tasks: dayTasks,
      suggestedMoveId: suggested?.id ?? null,
      minutes: cap.estimated_minutes
    });
  }
  return out;
}

/** True when adding predecessor → successor (successor.depends_on += predecessor) would cycle. */
export function wouldCreateCycle(predecessorId: string, successorId: string, tasks: Task[]): boolean {
  if (predecessorId === successorId) return true;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const stack = [predecessorId];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === successorId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const task = byId.get(id);
    for (const dep of task?.depends_on ?? []) stack.push(dep);
  }
  return false;
}

export function serviceStatusOrder(status: ServiceStatusId): number {
  switch (status) {
    case 'major_delays':
      return 0;
    case 'suspended':
      return 1;
    case 'minor_delays':
      return 2;
    case 'good_service':
      return 3;
    case 'arrived':
      return 4;
  }
}

export function formatFriendlyDay(date: Date): string {
  return new Intl.DateTimeFormat('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }).format(
    date
  );
}
