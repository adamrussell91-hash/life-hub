import type { CityCatchUp, CityService, CitySnapshot, CityStop } from '@/domain/city/types';
import { formatDisplayDate } from '../../../design-kit/js/format-display-date.js';

function countPhrase(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function quietSinceLabel(catchUp: CityCatchUp): string {
  if (!catchUp.since) return 'Quiet since your first visit';
  return `Quiet since ${formatDisplayDate(catchUp.since)}`;
}

export function vehicleText(snapshot: CitySnapshot, routeId: string, parked: boolean): string {
  const route = snapshot.routes.find((item) => item.id === routeId);
  if (!route) return 'A bus';
  const stops = snapshot.stops.filter((stop) => stop.routeId === routeId);
  const done = stops.filter((stop) => !stop.lit).length;
  const motion = `${route.title} · ${done} of ${stops.length} stops done · moving this week (${route.momentum.sessions} sessions, ${route.momentum.completions} done)`;
  if (!parked) return motion;
  const wall = snapshot.suspensions.find((item) => item.active && item.affectedRouteIds.includes(routeId));
  const because = wall ? `${wall.label}, ${formatDisplayDate(wall.startsOn)} to ${formatDisplayDate(wall.endsOn)}` : 'a life wall';
  return `${route.title} · not running · ${because}`;
}

export function stopText(stop: CityStop): string {
  const open = stop.lit ? 'Still open' : 'Finished';
  const blocked = stop.blocked ? ' · blocked' : '';
  const late = stop.late ? ' · past its due date' : '';
  const due = stop.dueDate ? ` · due ${formatDisplayDate(stop.dueDate)}` : ' · No due date';
  return `${stop.title} · ${open}${blocked}${late}${due}`;
}

export function serviceText(service: CityService): string {
  return service.reason;
}

export function haloText(snapshot: CitySnapshot): string | null {
  if (!snapshot.halo) return null;
  return `${snapshot.halo.owner} is waiting · ${snapshot.halo.reason}`;
}

export function depotText(snapshot: CitySnapshot): string {
  const decisions = countPhrase(snapshot.depot.decisions, 'more decision waiting', 'more decisions waiting');
  const unrouted = countPhrase(snapshot.depot.unrouted, 'task with no route', 'tasks with no route');
  return `Depot · ${decisions} · ${unrouted}`;
}

export function skyText(snapshot: CitySnapshot): string {
  if (!snapshot.sky.known) return 'No data';
  return snapshot.sky.name;
}

export type LegendRow = { term: string; means: string };

export function legendRows(): LegendRow[] {
  return [
    { term: 'Bus', means: 'Work on a route this week. More buses means more sessions and finished stops.' },
    { term: 'Tram', means: 'A routine running its loop.' },
    { term: 'Lit stop', means: 'Still open.' },
    { term: 'Dark stop', means: 'Finished.' },
    { term: 'Barrier', means: 'Blocked.' },
    { term: 'Ring', means: 'Past its due date.' },
    { term: 'Halo', means: 'One decision waiting on you.' },
    { term: 'Raised line', means: 'A goal. Stations sit on its routes.' },
    { term: 'Fence', means: 'A new route is being laid.' },
    { term: 'Ambulance', means: 'A medical appointment coming up.' },
    { term: 'Mail van', means: 'A follow-up is due.' },
    { term: 'Food truck', means: 'A meal window is open and not logged.' },
    { term: 'School bus', means: 'Teaching tasks due in the next seven days.' },
    { term: 'Striped gate', means: 'Not running. A life wall has suspended that route. Its buses wait at the depot.' },
    { term: 'Sky', means: 'Capacity. No data means there is no check-in.' },
    { term: 'Landmark', means: 'A goal that has been achieved.' }
  ];
}
