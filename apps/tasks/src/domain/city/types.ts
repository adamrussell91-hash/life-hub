/**
 * Life City (Metropolis) snapshot contract.
 *
 * A pure picture of Life Hub state that a renderer draws and nothing else. The snapshot
 * never stores a second copy of what is done, blocked or due: every field is derived from
 * the same records the Tasks lenses read. See docs/future-build-ideas/life-city-build-plan.md.
 *
 * Vocabulary borrows GTFS nouns only: a goal is a line, a project is a route, a task or
 * milestone is a stop, a life wall is a calendar exception that suspends service.
 */
import type { NodeStateId, ServiceStatus } from '@/domain/graph-model';
import type { Goal } from '@/schemas/goal';
import type { Project } from '@/schemas/project';
import type { Task } from '@/schemas/task';
import type { WorkSession } from '@/schemas/work-session';

/** A dated medical appointment record (ambulance). Comes from the owning hub. */
export type CityAppointment = {
  id: string;
  /** ISO date-time of the appointment. */
  starts_at: string;
  href: string;
};

/** The current meal logging window (food truck), when Body has one open. */
export type CityMealWindow = {
  id: string;
  open: boolean;
  logged: boolean;
  href: string;
};

/** A pending agent confirmation. The oldest one is the city's single decision halo. */
export type CityDecision = {
  id: string;
  owner: string;
  reason: string;
  href: string;
  created_at: string;
};

/**
 * The capacity forecast's state for now, as the forecast already computed it.
 * `state` is one of Adam's icons 1 to 30, or null when there is no evidence (no check-in).
 * The city never picks its own weather.
 */
export type CitySkyInput = {
  state: number | null;
};

export type CitySchoolTerm = {
  term: number | null;
  starts_on: string;
  ends_on: string;
};

export type CityInput = {
  tasks: Task[];
  projects: Project[];
  goals: Goal[];
  workSessions: WorkSession[];
  sky: CitySkyInput;
  schoolTerms: CitySchoolTerm[];
  appointments: CityAppointment[];
  mealWindow: CityMealWindow | null;
  pendingDecisions: CityDecision[];
};

export type CityClock = {
  /** Hub-local calendar date (Australia/Sydney). */
  dateKey: string;
  hour: number;
  isNight: boolean;
  inTerm: boolean;
  term: number | null;
};

export type CitySky = {
  /** Icon number 1 to 30, or null for the forecast's unknown state. */
  state: number | null;
  known: boolean;
  name: string;
  family: string;
};

export type CityDistrict = {
  id: string;
  routeIds: string[];
};

/** A goal. Metro line. */
export type CityLine = {
  id: string;
  title: string;
  createdAt: string;
  district: string;
  routeIds: string[];
  /** Achieved goals stand as landmarks. */
  landmark: boolean;
  href: string;
};

/** Vacant, under construction, open, retired (review: planning lifecycle by line style). */
export type CityRouteLifecycle = 'under_construction' | 'open' | 'retired';

/** Momentum over the last seven days. Vehicles are drawn from this, never from task count. */
export type CityMomentum = {
  sessions: number;
  completions: number;
  vehicles: number;
};

/** A project. Bus route. */
export type CityRoute = {
  id: string;
  title: string;
  /** Creation time: the layout places routes in this order, so older routes never move. */
  createdAt: string;
  lineId: string | null;
  district: string;
  lifecycle: CityRouteLifecycle;
  /** Mainline stop ids in the same order as Tasks Lines (`projectRoute`). */
  stopIds: string[];
  momentum: CityMomentum;
  /** Tasks Lines' service status, carried for the inspect panel. */
  service: ServiceStatus;
  /** Pace ghost position along the mainline, when the project has a pace. */
  ghostAt: number | null;
  href: string;
};

/** A task or milestone. Stop. */
export type CityStop = {
  id: string;
  kind: 'task' | 'milestone';
  routeId: string | null;
  lineId: string | null;
  title: string;
  /** Same state Tasks Lines shows (`nodeState`); milestones use done or open. */
  state: NodeStateId;
  /** Light channel: lit while still open. */
  lit: boolean;
  /** Shape channel: barrier, sourced from `blocked_since` or an unfinished dependency. */
  blocked: boolean;
  /** Shape channel: pressure ring, from a passed due date only. */
  late: boolean;
  dueDate: string | null;
  /** Routes whose stops this stop depends on (an interchange when non-empty). */
  interchangeRouteIds: string[];
  href: string;
};

/** A recurring routine. Tram loop. Capped so routines never fill the map. */
export type CityTram = {
  id: string;
  title: string;
  district: string;
  dueToday: boolean;
  href: string;
};

export type CityVehicle = {
  id: string;
  routeId: string;
  kind: 'bus';
};

export type CityServiceKind = 'ambulance' | 'school_bus' | 'food_truck' | 'mail_van' | 'crane';

/** A service vehicle. Appears only when a real record calls for it. */
export type CityService = {
  id: string;
  kind: CityServiceKind;
  recordId: string;
  owner: string;
  reason: string;
  href: string;
};

/** A life wall as a calendar exception: affected routes do not run on these dates. */
export type CitySuspension = {
  id: string;
  startsOn: string;
  endsOn: string;
  label: string;
  active: boolean;
  affectedRouteIds: string[];
};

export type CityDepot = {
  /** Pending decisions beyond the one shown as the halo. */
  decisions: number;
  /** Open tasks with no project or goal. One count, never a pin each. */
  unrouted: number;
};

export type CitySnapshot = {
  generatedAt: string;
  clock: CityClock;
  sky: CitySky;
  districts: CityDistrict[];
  lines: CityLine[];
  routes: CityRoute[];
  stops: CityStop[];
  trams: CityTram[];
  tramsHidden: number;
  vehicles: CityVehicle[];
  services: CityService[];
  suspensions: CitySuspension[];
  halo: CityDecision | null;
  depot: CityDepot;
};

/** One "since you were last here" change, built from timestamps that exist today. */
export type CityChange = {
  kind: 'stop_added' | 'stop_done' | 'route_opened' | 'line_opened';
  id: string;
  at: string;
  district: string;
};

export type CityCatchUp = {
  since: string | null;
  quiet: boolean;
  changes: CityChange[];
  byDistrict: Record<string, number>;
};
