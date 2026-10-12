import type { PathPoint, WildlifeSpecies } from './wildlife';
import { seededRandom } from './random';
import { roundRouteCorners } from './roaming-path';

export type RoamingActivity = 'locomotion' | 'water' | 'flight' | 'idle' | 'feed' | 'sleep';

/** Species fallback when a model id is unknown. Tuned for ground-cover realism. */
const SPECIES_SPEED: Record<WildlifeSpecies, number> = {
  hare: 1.25, deer: 2.0, fox: 1.4, squirrel: 0.85, robin: 2.8, mallard: 0.8, owl: 3.2,
};

/** Model stride rates: larger walkers cover ground faster than foxes; birds stay flight-fast. */
const MODEL_SPEED: Record<string, number> = {
  'animal-forest-moose': 2.45,
  'animal-forest-wolf': 2.2,
  'animal-deer-stag': 2.1,
  'animal-forest-stag': 2.1,
  'animal-deer-doe': 2.0,
  'animal-forest-deer': 2.0,
  'animal-forest-bear': 1.65,
  'animal-forest-boar': 1.55,
  'animal-fox': 1.4,
  'animal-forest-fox': 1.4,
  'animal-rabbit-hare': 1.25,
  'animal-forest-rabbit': 1.25,
  'animal-raccoon': 1.1,
  'animal-skunk': 1.0,
  'animal-squirrel': 0.85,
  'animal-chipmunk': 0.85,
  'animal-bird-robin': 2.8,
  'animal-owl': 3.2,
  'animal-duck-mallard': 0.8,
  'animal-river-otter': 1.05,
};

export function roamingTravelSpeed(species: WildlifeSpecies, mode: 'land' | 'water' | 'flight', model?: string): number {
  // Unknown water models keep the mallard baseline; only otter is faster.
  if (mode === 'water') return model === 'animal-river-otter' ? 1.05 : 0.8;
  if (model && MODEL_SPEED[model] !== undefined) return MODEL_SPEED[model]!;
  return SPECIES_SPEED[species];
}

/** Geometry and destination itinerary are prepared once. Per-frame poses use a
 * binary arc lookup, including babies, never a chord between destinations. */
export function createRoamingMotion(points: readonly PathPoint[], options: {
  seed: string;
  species: WildlifeSpecies;
  mode: 'land' | 'water' | 'flight';
  roles: readonly string[];
  startDistance?: number;
  startFraction?: number;
  model?: string;
  /** Skip corner rounding when the caller already polished a validated route. */
  polished?: boolean;
}) {
  const route = options.polished ? points.map(p => ({ x: p.x, z: p.z })) : roundRouteCorners(points);
  const cumulative = new Float64Array(route.length);
  for (let i = 1; i < route.length; i++) {
    cumulative[i] = cumulative[i - 1]! + Math.hypot(route[i]!.x - route[i - 1]!.x, route[i]!.z - route[i - 1]!.z);
  }
  const total = cumulative.at(-1) ?? 0;
  if (route.length < 2 || !Number.isFinite(total) || total <= 0) {
    throw Error('Roaming requires a positive connected route');
  }

  function wrap(d: number): number {
    return ((d % total) + total) % total;
  }

  function locate(d: number): number {
    let lo = 1, hi = cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (cumulative[mid]! < d) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function pointAt(d: number): PathPoint {
    const i = locate(d);
    const a = route[i - 1]!, b = route[i]!;
    const length = cumulative[i]! - cumulative[i - 1]!;
    const f = length > 0 ? (d - cumulative[i - 1]!) / length : 0;
    return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
  }

  const random = seededRandom(options.seed);
  const start = wrap(options.startDistance ?? total * (options.startFraction ?? 0));
  const speed = roamingTravelSpeed(options.species, options.mode, options.model);
  const rests: RoamingActivity[] = [
    'idle',
    ...options.roles.includes('feed') ? ['feed' as const] : [],
    ...options.roles.includes('sleep') ? ['sleep' as const] : [],
  ];
  // Every stop is an actual route point; successive stops follow the circuit.
  const itinerary: {
    length: number;
    rest: number;
    activity: RoamingActivity;
    destination: number;
  }[] = [];
  let planned = 0;
  const tourLength = total * Math.max(1, Math.min(32, Math.ceil(2560 / total)));
  // Repeat short circuits to vary destinations/rests; long circuits get one
  // complete tour. Cover every circuit with short legs. The final leg is
  // also bounded, so dense routes keep feeding/resting throughout the tour.
  while (planned < tourLength) {
    const target = wrap(start + planned + Math.min(total * (0.1 + random() * 0.35), 8 + random() * 22));
    const index = locate(target);
    const end = cumulative[index]!;
    const remaining = tourLength - planned;
    const length = Math.min(remaining, wrap(end - wrap(start + planned)) || total);
    itinerary.push({
      length,
      rest: 2 + random() * 7,
      activity: rests[Math.floor(random() * rests.length)]!,
      destination: length === remaining ? locate(start) : index,
    });
    planned = length === remaining ? tourLength : planned + length;
  }

  let distance = start, leg = 0, travelled = 0, restRemaining = 0, resting = false;

  function advance(delta: number): void {
    if (!Number.isFinite(delta) || delta <= 0) return;
    let remaining = delta;
    while (remaining > 0) {
      const step = itinerary[leg % itinerary.length]!;
      if (resting) {
        const elapsed = Math.min(remaining, restRemaining);
        restRemaining -= elapsed;
        remaining -= elapsed;
        if (restRemaining <= 1e-9) {
          resting = false;
          travelled = 0;
          leg++;
        }
      } else {
        const elapsed = Math.min(remaining, (step.length - travelled) / speed);
        travelled += elapsed * speed;
        distance += elapsed * speed;
        remaining -= elapsed;
        if (travelled >= step.length - 1e-9) {
          resting = true;
          restRemaining = step.rest;
        }
      }
    }
  }

  function snapshot(trailing = 0) {
    const d = wrap(distance - trailing);
    const here = pointAt(d);
    const span = Math.min(1.8, total * 0.08);
    const look = resting ? -1 : 1;
    const toward = pointAt(wrap(d + look * span));
    const dx = look * (toward.x - here.x);
    const dz = look * (toward.z - here.z);
    const step = itinerary[leg % itinerary.length]!;
    let activity: RoamingActivity = 'locomotion';
    if (resting) activity = step.activity;
    else if (options.mode === 'flight') activity = 'flight';
    else if (options.mode === 'water') activity = 'water';
    return {
      x: here.x,
      z: here.z,
      yaw: Math.atan2(dx, dz),
      routeDistance: d,
      activity,
      destination: step.destination,
      lift: activity === 'flight' ? Math.sin(Math.PI * Math.min(1, travelled / step.length)) * 6 : 0,
    };
  }

  return { total, advance, snapshot, speed };
}
