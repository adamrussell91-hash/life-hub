/**
 * Life City validator: data-level rules checked against the snapshot and its input.
 * Picture-level judgements (does scenery read as a signal?) are not here; they live on the
 * design review checklist (review F7). Notice levels follow MobilityData's GTFS validator.
 */
import { collectLifeWalls } from '@/domain/life-wall';
import { nodeState, projectRoute } from '@/domain/graph-model';
import { toDateKey } from '@/domain/queries';
import { citySky, isLiveProject, isLiveTask, networkTasksOf, vehiclesForMomentum } from './snapshot';
import type { CityInput, CitySnapshot } from './types';

export type CityNoticeCode =
  | 'deleted_record_visible'
  | 'stop_order_changed'
  | 'lens_disagreement'
  | 'weather_not_from_forecast'
  | 'unknown_shown_as_value'
  | 'finance_in_city'
  | 'single_halo'
  | 'late_from_due_only'
  | 'dream_on_network'
  | 'suspension_not_detour'
  | 'service_without_record'
  | 'signal_without_destination'
  | 'vehicle_without_momentum';

export type CityNotice = {
  code: CityNoticeCode;
  level: 'error' | 'warning';
  id: string;
  message: string;
};

const FINANCE_KEY = /fare|price|balance|cost|payment|amount|budget|money/i;
const SUSPENSION_KEYS = ['active', 'affectedRouteIds', 'endsOn', 'id', 'label', 'startsOn'];


function financeKeys(value: unknown, path: string, out: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => financeKeys(item, `${path}[${index}]`, out));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (FINANCE_KEY.test(key)) out.push(`${path}.${key}`);
    financeKeys(child, `${path}.${key}`, out);
  }
}

export function validateCity(input: CityInput, snapshot: CitySnapshot, now: Date = new Date()): CityNotice[] {
  const notices: CityNotice[] = [];
  const error = (code: CityNoticeCode, id: string, message: string) => notices.push({ code, level: 'error', id, message });
  const warn = (code: CityNoticeCode, id: string, message: string) => notices.push({ code, level: 'warning', id, message });

  const tasksById = new Map(input.tasks.map((task) => [task.id, task]));
  const network = networkTasksOf(input.tasks, input.projects);
  const networkById = new Map(network.map((task) => [task.id, task]));
  const projectsById = new Map(input.projects.map((project) => [project.id, project]));
  const goalsById = new Map(input.goals.map((goal) => [goal.id, goal]));
  // Late uses the same local calendar day as nodeState's overdue.
  const lateKey = toDateKey(now);

  // deleted_record_visible
  const deletedTask = (id: string) => {
    const task = tasksById.get(id);
    if (!task) return false;
    const project = task.parent_project_id ? projectsById.get(task.parent_project_id) : null;
    return !isLiveTask(task) || Boolean(project && !isLiveProject(project));
  };
  for (const stop of snapshot.stops) {
    if (stop.kind === 'task' && (deletedTask(stop.id) || !tasksById.has(stop.id))) {
      error('deleted_record_visible', stop.id, 'A stop shows a task that is deleted or missing.');
    }
  }
  for (const tram of snapshot.trams) {
    if (deletedTask(tram.id) || !tasksById.has(tram.id)) error('deleted_record_visible', tram.id, 'A tram shows a deleted task.');
  }
  for (const route of snapshot.routes) {
    const project = projectsById.get(route.id);
    if (!project || !isLiveProject(project)) {
      error('deleted_record_visible', route.id, 'A route shows a deleted project.');
    }
  }
  for (const line of snapshot.lines) {
    const goal = goalsById.get(line.id);
    if (!goal || (goal as { trashed_at?: string }).trashed_at) error('deleted_record_visible', line.id, 'A line shows a deleted goal.');
  }

  // stop_order_changed: the city's mainline order is Tasks Lines' order
  for (const route of snapshot.routes) {
    if (route.lifecycle === 'retired') continue;
    const project = projectsById.get(route.id);
    if (!project) continue;
    const expected = projectRoute(project, network).mainline.map((station) => station.id);
    if (expected.join('|') !== route.stopIds.join('|')) {
      error('stop_order_changed', route.id, 'Stop order differs from Tasks Lines.');
    }
  }

  // lens_disagreement: each task stop shows the state Tasks Lines shows
  for (const stop of snapshot.stops) {
    if (stop.kind !== 'task') continue;
    const task = networkById.get(stop.id);
    if (!task) continue;
    const expected = nodeState(task, network, now).state;
    if (expected !== stop.state) error('lens_disagreement', stop.id, `City says ${stop.state}, Lines says ${expected}.`);
    if (stop.lit !== (expected !== 'done')) error('lens_disagreement', stop.id, 'Lit does not match open or finished.');
  }

  // weather_not_from_forecast and unknown_shown_as_value
  const expectedSky = citySky(input.sky.state);
  if (snapshot.sky.state !== expectedSky.state) {
    error('weather_not_from_forecast', 'sky', 'The sky is not the forecast state.');
  }
  if (!expectedSky.known && (snapshot.sky.known || snapshot.sky.state != null || snapshot.sky.name !== 'No data')) {
    error('unknown_shown_as_value', 'sky', 'Missing forecast evidence is drawn as a known sky.');
  }

  // finance_in_city
  const finance: string[] = [];
  financeKeys(snapshot, 'snapshot', finance);
  for (const path of finance) error('finance_in_city', path, 'A finance field appears in the snapshot.');

  // single_halo: the oldest pending decision, and only that one
  const decisions = [...input.pendingDecisions].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  if ((snapshot.halo?.id ?? null) !== (decisions[0]?.id ?? null)) {
    error('single_halo', snapshot.halo?.id ?? 'halo', 'The halo is not the single oldest pending decision.');
  }
  if (snapshot.depot.decisions !== Math.max(0, decisions.length - 1)) {
    error('single_halo', 'depot', 'Decisions beyond the halo are not all counted at the depot.');
  }

  // late_from_due_only
  for (const stop of snapshot.stops) {
    const due = stop.dueDate?.slice(0, 10) ?? null;
    const passed = Boolean(due && due < lateKey);
    if (stop.late && (!passed || !stop.lit)) {
      error('late_from_due_only', stop.id, 'A stop is late without a passed due date.');
    }
    if (stop.kind === 'task') {
      const task = networkById.get(stop.id);
      if (task && stop.late !== nodeState(task, network, now).overdue) {
        error('late_from_due_only', stop.id, 'Late does not match the passed due date.');
      }
    }
  }

  // dream_on_network
  for (const id of [...snapshot.stops.map((s) => s.id), ...snapshot.trams.map((t) => t.id)]) {
    const task = tasksById.get(id);
    if (task && (task.bucket === 'someday' || task.someday_kind)) {
      error('dream_on_network', id, 'A Someday idea appears on the network.');
    }
  }

  // suspension_not_detour: walls are calendar exceptions with no geometry
  const wallIds = new Set(
    collectLifeWalls({
      tasks: input.tasks.filter(isLiveTask),
      projects: input.projects.filter(isLiveProject),
      goals: input.goals
    }).map((wall) => wall.id)
  );
  for (const suspension of snapshot.suspensions) {
    const keys = Object.keys(suspension).sort().join('|');
    if (keys !== SUSPENSION_KEYS.join('|')) {
      error('suspension_not_detour', suspension.id, 'A suspension carries fields beyond dates and affected routes.');
    }
    if (!wallIds.has(suspension.id)) error('suspension_not_detour', suspension.id, 'A suspension has no live life wall.');
  }

  // service_without_record
  const appointmentIds = new Set(input.appointments.map((a) => a.id));
  for (const service of snapshot.services) {
    const ok =
      (service.kind === 'ambulance' && appointmentIds.has(service.recordId)) ||
      (service.kind === 'food_truck' &&
        input.mealWindow?.id === service.recordId &&
        input.mealWindow.open &&
        !input.mealWindow.logged) ||
      (service.kind === 'mail_van' && networkById.get(service.recordId)?.waiting_status === 'follow_up_due') ||
      (service.kind === 'crane' && snapshot.routes.some((r) => r.id === service.recordId && r.lifecycle === 'under_construction')) ||
      (service.kind === 'school_bus' && snapshot.clock.inTerm);
    if (!ok) error('service_without_record', service.id, 'A service vehicle has no record calling for it.');
  }

  // signal_without_destination
  for (const service of snapshot.services) {
    if (!service.owner || !service.reason || !service.href) {
      warn('signal_without_destination', service.id, 'A service has no owner, reason or destination.');
    }
  }
  if (snapshot.halo && (!snapshot.halo.owner || !snapshot.halo.reason || !snapshot.halo.href)) {
    warn('signal_without_destination', snapshot.halo.id, 'The halo has no owner, reason or destination.');
  }
  for (const stop of snapshot.stops) {
    if (!stop.href) warn('signal_without_destination', stop.id, 'A stop has no door.');
  }

  // vehicle_without_momentum: motion is momentum only
  const routesById = new Map(snapshot.routes.map((route) => [route.id, route]));
  const perRoute = new Map<string, number>();
  for (const vehicle of snapshot.vehicles) {
    const route = routesById.get(vehicle.routeId);
    if (!route || route.lifecycle === 'retired') {
      error('vehicle_without_momentum', vehicle.id, 'A bus runs on a missing or retired route.');
      continue;
    }
    perRoute.set(route.id, (perRoute.get(route.id) ?? 0) + 1);
  }
  for (const route of snapshot.routes) {
    const expected = route.lifecycle === 'retired' ? 0 : vehiclesForMomentum(route.momentum.sessions + route.momentum.completions);
    if ((perRoute.get(route.id) ?? 0) !== expected) {
      error('vehicle_without_momentum', route.id, 'Bus count does not match momentum.');
    }
  }

  return notices;
}
