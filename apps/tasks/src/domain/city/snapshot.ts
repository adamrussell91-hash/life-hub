/**
 * citySnapshot: Life Hub records in, one picture of Metropolis out. Pure; no I/O.
 *
 * Reads the same selectors as Tasks Lines (`projectRoute`, `nodeState`, `pace`,
 * `serviceStatus`) so the two lenses can never disagree about a stop.
 */
import { collectLifeWalls } from '@/domain/life-wall';
import {
  nodeState,
  pace,
  projectRoute,
  serviceStatus,
  type NodeStateId,
  type RouteStation
} from '@/domain/graph-model';
import { goalPageHash, projectPageHash, taskPageHash } from '@/domain/cards';
import { addDaysKey } from '@/domain/school-time';
import { hubClockParts, toDateKey, toHubDateKey } from '@/domain/queries';
import { parseRecurrenceRule } from '@/domain/recurrence';
import { isProjectArchived, type Project } from '@/schemas/project';
import type { Goal } from '@/schemas/goal';
import type { Task } from '@/schemas/task';
import { WEATHER_STATES } from '../../../design-kit/js/calendar/readiness-model.js';
import type {
  CityCatchUp,
  CityChange,
  CityInput,
  CityLine,
  CityMomentum,
  CityRoute,
  CityService,
  CitySky,
  CitySnapshot,
  CityStop,
  CitySuspension,
  CityTram,
  CityVehicle
} from './types';

export const MOMENTUM_DAYS = 7;
export const NEW_ROUTE_DAYS = 14;
export const MAX_TRAMS = 5;
export const SUSPENSION_LOOKAHEAD_DAYS = 28;
export const APPOINTMENT_LOOKAHEAD_DAYS = 7;
export const UNSORTED_DISTRICT = 'unsorted';

const DAY_MS = 86_400_000;
const DELETED_BUCKETS = new Set(['trash', 'trashed']);
const LINE_STATUSES = new Set<Goal['status']>(['active', 'parked', 'achieved']);

/** Deleted means gone. Mirrors netlify/functions/_shared/record-liveness.mjs for Tasks records. */
export function isLiveTask(task: Task): boolean {
  if (task.status === 'dead') return false;
  if (DELETED_BUCKETS.has(task.bucket)) return false;
  return !(task as { trashed_at?: string }).trashed_at;
}

export function isLiveProject(project: Project): boolean {
  if (project.status === 'archived_dead') return false;
  return !(project as { trashed_at?: string }).trashed_at;
}

function isLiveGoal(goal: Goal): boolean {
  return !(goal as { trashed_at?: string }).trashed_at;
}

/**
 * On the network: live, not a Someday idea (dreams stay off the map), and not inside a
 * deleted project. A task under a removed project is gone with it.
 */
export function networkTasksOf(tasks: Task[], projects: Project[]): Task[] {
  const deadProjects = new Set(projects.filter((project) => !isLiveProject(project)).map((project) => project.id));
  return tasks.filter(
    (task) =>
      isLiveTask(task) &&
      task.bucket !== 'someday' &&
      !task.someday_kind &&
      !(task.parent_project_id && deadProjects.has(task.parent_project_id))
  );
}

function isDone(task: Task): boolean {
  return task.status === 'done';
}

function within(iso: string | null | undefined, from: number, to: number): boolean {
  if (!iso) return false;
  const at = Date.parse(iso);
  return Number.isFinite(at) && at > from && at <= to;
}

function majority(values: string[], fallback: string): string {
  if (!values.length) return fallback;
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
}

/** One bus for one or two events in the window, two for three to five, three for six or more. */
export function vehiclesForMomentum(events: number): number {
  if (events <= 0) return 0;
  if (events <= 2) return 1;
  if (events <= 5) return 2;
  return 3;
}

export function citySky(state: number | null): CitySky {
  const known = state != null && Number.isInteger(state) && state >= 1 && state <= 30;
  if (!known) return { state: null, known: false, name: 'No data', family: 'unknown' };
  const entry = (WEATHER_STATES as Record<number, { name: string; family: string }>)[state];
  return { state, known: true, name: entry.name, family: entry.family };
}

function milestoneState(station: RouteStation): NodeStateId {
  return station.milestone?.status === 'done' ? 'done' : 'open';
}

function stopFromStation(
  station: RouteStation,
  routeId: string,
  lineId: string | null,
  liveTasks: Task[],
  projectIdToRouteId: Map<string, string>,
  now: Date
): CityStop {
  if (station.kind === 'milestone' || !station.task) {
    const due = station.milestone?.due_date ?? null;
    const state = milestoneState(station);
    return {
      id: station.id,
      kind: 'milestone',
      routeId,
      lineId,
      title: station.title,
      state,
      lit: state !== 'done',
      blocked: false,
      // Same calendar rule as nodeState's overdue, so Lines and the city agree.
      late: Boolean(due && state !== 'done' && due.slice(0, 10) < toDateKey(now)),
      dueDate: due,
      interchangeRouteIds: [],
      href: projectPageHash(routeId)
    };
  }
  return stopFromTask(station.task, routeId, lineId, liveTasks, now, station.interchangeProjectIds, projectIdToRouteId);
}

function stopFromTask(
  task: Task,
  routeId: string | null,
  lineId: string | null,
  liveTasks: Task[],
  now: Date,
  interchangeProjectIds: string[] = [],
  projectIdToRouteId: Map<string, string> = new Map()
): CityStop {
  const node = nodeState(task, liveTasks, now);
  const done = node.state === 'done';
  return {
    id: task.id,
    kind: 'task',
    routeId,
    lineId,
    title: task.title,
    state: node.state,
    lit: !done,
    blocked: !done && (node.state === 'blocked' || Boolean(task.blocked_since)),
    late: node.overdue,
    dueDate: task.due_date,
    interchangeRouteIds: interchangeProjectIds.filter((id) => projectIdToRouteId.has(id)),
    href: taskPageHash(task.id)
  };
}

export function citySnapshot(input: CityInput, now: Date = new Date()): CitySnapshot {
  const nowMs = now.getTime();
  const clockParts = hubClockParts(now);
  const todayKey = clockParts.dateKey;
  const momentumFrom = nowMs - MOMENTUM_DAYS * DAY_MS;

  const liveTasks = input.tasks.filter(isLiveTask);
  const networkTasks = networkTasksOf(input.tasks, input.projects);
  const projects = input.projects.filter(isLiveProject);
  const goals = input.goals.filter((goal) => isLiveGoal(goal) && LINE_STATUSES.has(goal.status));
  const goalIds = new Set(goals.map((goal) => goal.id));
  const projectIdToRouteId = new Map(projects.map((project) => [project.id, project.id]));

  // ---- Clock and sky
  const term = input.schoolTerms.find((t) => todayKey >= t.starts_on && todayKey <= t.ends_on) ?? null;
  const clock = {
    dateKey: todayKey,
    hour: clockParts.hour,
    isNight: clockParts.hour < 6 || clockParts.hour >= 19,
    inTerm: Boolean(term),
    term: term?.term ?? null
  };
  const sky = citySky(input.sky.state);

  // ---- Routes (projects) and their stops
  const routes: CityRoute[] = [];
  const stops: CityStop[] = [];
  const vehicles: CityVehicle[] = [];
  const services: CityService[] = [];

  const sortedProjects = [...projects].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  for (const project of sortedProjects) {
    const own = networkTasks.filter((task) => task.parent_project_id === project.id);
    const district = majority(own.map((task) => task.domain), UNSORTED_DISTRICT);
    const lineId = project.parent_goal_id && goalIds.has(project.parent_goal_id) ? project.parent_goal_id : null;
    const ownIds = new Set(own.map((task) => task.id));

    const completions = own.filter((task) => isDone(task) && within(task.completed_at, momentumFrom, nowMs)).length;
    const sessions = input.workSessions.filter(
      (session) =>
        (session.project_id === project.id || (session.task_id != null && ownIds.has(session.task_id))) &&
        within(session.started_at, momentumFrom, nowMs)
    ).length;

    const retired = isProjectArchived(project.status);
    const everDone = own.some(isDone);
    const isNew = nowMs - Date.parse(project.created_at) <= NEW_ROUTE_DAYS * DAY_MS;
    const lifecycle = retired ? 'retired' : isNew && !everDone ? 'under_construction' : 'open';
    const momentum: CityMomentum = {
      sessions,
      completions,
      vehicles: retired ? 0 : vehiclesForMomentum(sessions + completions)
    };

    const route = projectRoute(project, networkTasks);
    const measured = retired ? null : pace(project, networkTasks, now);
    routes.push({
      id: project.id,
      title: project.title,
      createdAt: project.created_at,
      lineId,
      district,
      lifecycle,
      stopIds: retired ? [] : route.mainline.map((station) => station.id),
      momentum,
      service: serviceStatus(project, networkTasks, now),
      ghostAt: measured ? measured.ghostAt : null,
      href: projectPageHash(project.id)
    });

    if (retired) continue;
    for (const station of route.stations) {
      stops.push(stopFromStation(station, project.id, lineId, networkTasks, projectIdToRouteId, now));
    }
    for (let i = 0; i < momentum.vehicles; i += 1) {
      vehicles.push({ id: `${project.id}:bus:${i}`, routeId: project.id, kind: 'bus' });
    }
    if (lifecycle === 'under_construction') {
      services.push({
        id: `crane:${project.id}`,
        kind: 'crane',
        recordId: project.id,
        owner: 'Tasks',
        reason: 'A new route is being laid.',
        href: projectPageHash(project.id)
      });
    }
  }

  // ---- Lines (goals), with tasks hosted on the goal directly as stops on the line
  const lines: CityLine[] = [];
  const sortedGoals = [...goals].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  for (const goal of sortedGoals) {
    const routeIds = routes.filter((route) => route.lineId === goal.id).map((route) => route.id);
    const direct = networkTasks.filter((task) => task.parent_goal_id === goal.id && !task.parent_project_id);
    const district = majority(
      [...routes.filter((route) => route.lineId === goal.id).map((route) => route.district), ...direct.map((t) => t.domain)],
      UNSORTED_DISTRICT
    );
    lines.push({
      id: goal.id,
      title: goal.title,
      createdAt: goal.created_at,
      district,
      routeIds,
      landmark: goal.status === 'achieved',
      href: goalPageHash(goal.id)
    });
    if (goal.status === 'achieved') continue;
    for (const task of direct) stops.push(stopFromTask(task, null, goal.id, networkTasks, now));
  }

  // ---- Trams: open recurring routines with no project, capped
  const routines = networkTasks
    .filter((task) => !isDone(task) && !task.parent_project_id && parseRecurrenceRule(task.recurrence_rule))
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') || a.id.localeCompare(b.id));
  const trams: CityTram[] = routines.slice(0, MAX_TRAMS).map((task) => ({
    id: task.id,
    title: task.title,
    district: task.domain,
    dueToday: (task.due_date ?? '').slice(0, 10) === todayKey,
    href: taskPageHash(task.id)
  }));

  // ---- Services that real records call for
  const appointmentUntil = nowMs + APPOINTMENT_LOOKAHEAD_DAYS * DAY_MS;
  for (const appointment of input.appointments) {
    const at = Date.parse(appointment.starts_at);
    if (!Number.isFinite(at) || at < nowMs || at > appointmentUntil) continue;
    services.push({
      id: `ambulance:${appointment.id}`,
      kind: 'ambulance',
      recordId: appointment.id,
      owner: 'Body',
      reason: `Medical appointment on ${toHubDateKey(new Date(at))}.`,
      href: appointment.href
    });
  }

  if (input.mealWindow?.open && !input.mealWindow.logged) {
    services.push({
      id: `food_truck:${input.mealWindow.id}`,
      kind: 'food_truck',
      recordId: input.mealWindow.id,
      owner: 'Body',
      reason: 'A meal logging window is open and not yet logged.',
      href: input.mealWindow.href
    });
  }

  for (const task of networkTasks) {
    if (isDone(task) || task.waiting_status !== 'follow_up_due') continue;
    services.push({
      id: `mail_van:${task.id}`,
      kind: 'mail_van',
      recordId: task.id,
      owner: 'Tasks',
      reason: task.waiting_on ? `Follow up due with ${task.waiting_on}.` : 'A follow-up is due.',
      href: taskPageHash(task.id)
    });
  }

  if (term) {
    const weekEnd = addDaysKey(todayKey, 7);
    const teachingDue = networkTasks.filter(
      (task) =>
        !isDone(task) &&
        task.domain === 'teaching' &&
        task.due_date != null &&
        task.due_date.slice(0, 10) >= todayKey &&
        task.due_date.slice(0, 10) <= weekEnd
    );
    const buses = teachingDue.length === 0 ? 0 : teachingDue.length <= 3 ? 1 : teachingDue.length <= 7 ? 2 : 3;
    for (let i = 0; i < buses; i += 1) {
      services.push({
        id: `school_bus:${i}`,
        kind: 'school_bus',
        recordId: `term:${term.term ?? term.starts_on}`,
        owner: 'Teaching',
        reason: `${teachingDue.length} teaching ${teachingDue.length === 1 ? 'task' : 'tasks'} due in the next seven days.`,
        href: '#/board'
      });
    }
  }

  // ---- Life walls as service suspensions (calendar exceptions, never detours)
  const horizon = addDaysKey(todayKey, SUSPENSION_LOOKAHEAD_DAYS);
  const walls = collectLifeWalls({ tasks: liveTasks, projects, goals });
  const suspensions: CitySuspension[] = walls
    .filter((wall) => wall.ends_on >= todayKey && wall.starts_on <= horizon)
    .map((wall) => {
      const inside = (due: string | null) => Boolean(due && due.slice(0, 10) >= wall.starts_on && due.slice(0, 10) <= wall.ends_on);
      const affected = new Set<string>();
      for (const stop of stops) {
        if (stop.routeId && stop.lit && inside(stop.dueDate) && stop.routeId !== wall.sourceId) affected.add(stop.routeId);
      }
      return {
        id: wall.id,
        startsOn: wall.starts_on,
        endsOn: wall.ends_on,
        label: wall.label,
        active: todayKey >= wall.starts_on && todayKey <= wall.ends_on,
        affectedRouteIds: [...affected].sort()
      };
    })
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.id.localeCompare(b.id));

  // ---- One decision halo, the rest counted at the depot
  const decisions = [...input.pendingDecisions].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const unrouted = networkTasks.filter(
    (task) =>
      !isDone(task) &&
      !task.parent_project_id &&
      !task.parent_goal_id &&
      !task.parent_task_id &&
      !parseRecurrenceRule(task.recurrence_rule)
  ).length;

  // ---- Districts
  const districtIds = [...new Set([...routes.map((r) => r.district), ...lines.map((l) => l.district)])].sort();
  const districts = districtIds.map((id) => ({
    id,
    routeIds: routes.filter((route) => route.district === id).map((route) => route.id)
  }));

  return {
    generatedAt: now.toISOString(),
    clock,
    sky,
    districts,
    lines,
    routes,
    stops,
    trams,
    tramsHidden: Math.max(0, routines.length - MAX_TRAMS),
    vehicles,
    services,
    suspensions,
    halo: decisions[0] ?? null,
    depot: { decisions: Math.max(0, decisions.length - 1), unrouted }
  };
}

/**
 * "Since you were last here", version 1: only timestamps that already exist
 * (created and completed). Blocks, unblocks and walls wait for the event log.
 * A first visit (no `since`) is quiet: there is nothing to compare against.
 */
export function cityCatchUp(input: CityInput, since: string | null, now: Date = new Date()): CityCatchUp {
  const sinceMs = since ? Date.parse(since) : Number.NaN;
  if (!Number.isFinite(sinceMs)) return { since: null, quiet: true, changes: [], byDistrict: {} };
  const nowMs = now.getTime();
  const snapshot = citySnapshot(input, now);
  const routeDistrict = new Map(snapshot.routes.map((route) => [route.id, route.district]));
  const lineDistrict = new Map(snapshot.lines.map((line) => [line.id, line.district]));
  const changes: CityChange[] = [];

  for (const task of networkTasksOf(input.tasks, input.projects)) {
    const district = (task.parent_project_id && routeDistrict.get(task.parent_project_id)) || task.domain;
    if (within(task.created_at, sinceMs, nowMs)) changes.push({ kind: 'stop_added', id: task.id, at: task.created_at, district });
    if (isDone(task) && within(task.completed_at, sinceMs, nowMs)) {
      changes.push({ kind: 'stop_done', id: task.id, at: task.completed_at as string, district });
    }
  }
  for (const project of input.projects.filter(isLiveProject)) {
    if (within(project.created_at, sinceMs, nowMs)) {
      changes.push({ kind: 'route_opened', id: project.id, at: project.created_at, district: routeDistrict.get(project.id) ?? UNSORTED_DISTRICT });
    }
  }
  for (const goal of input.goals.filter(isLiveGoal)) {
    if (within(goal.created_at, sinceMs, nowMs) && lineDistrict.has(goal.id)) {
      changes.push({ kind: 'line_opened', id: goal.id, at: goal.created_at, district: lineDistrict.get(goal.id) as string });
    }
  }

  changes.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const byDistrict: Record<string, number> = {};
  for (const change of changes) byDistrict[change.district] = (byDistrict[change.district] ?? 0) + 1;
  return { since, quiet: changes.length === 0, changes, byDistrict };
}
