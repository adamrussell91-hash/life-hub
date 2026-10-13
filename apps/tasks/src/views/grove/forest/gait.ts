/**
 * How the forest's animals move. Pure: no three.js, so it is unit-testable.
 *
 * Sizes are drawn against each other: `HEIGHT` is each animal's standing height in map units
 * (trees are 6 to 9), roughly real life with the small ones lifted a little so they still read.
 * Speeds come from the models' own walk cycles: `STRIDE` is how far a model's feet carry it per
 * second of its walk clip, at the model's native size (measured from the planted feet of each clip,
 * 13 Oct 2026). Ground speed is stride × drawn scale × clip speed, so feet never slide.
 */
import type { Point } from './trails';

/** Standing height in map units, head or antlers included. */
export const HEIGHT: Record<string, number> = {
  'animal-forest-moose': 3.3,
  'animal-forest-stag': 2.8,
  'animal-deer-stag': 2.8,
  'animal-deer-doe': 2.1,
  'animal-forest-deer': 2.0,
  'animal-forest-bear': 1.85,
  'animal-forest-wolf': 1.45,
  'animal-forest-boar': 1.0,
  'animal-fox': 0.9,
  'animal-forest-fox': 0.9,
  'animal-rabbit-hare': 0.8,
  'animal-raccoon': 0.72,
  'animal-duck-mallard': 0.7,
  'animal-forest-rabbit': 0.65,
  'animal-river-otter': 0.62,
  'animal-skunk': 0.62,
  'animal-squirrel': 0.5,
  'animal-owl': 0.85,
  'animal-chipmunk': 0.36,
  'animal-bird-robin': 0.38,
};

/** Native ground speed of each model's walk (or hop) clip at clip speed 1, model units a second. */
export const STRIDE: Record<string, number> = {
  'animal-deer-doe': 0.884,
  'animal-deer-stag': 0.888,
  'animal-fox': 0.327,
  'animal-forest-bear': 0.713,
  'animal-forest-boar': 0.625,
  'animal-forest-deer': 0.563,
  'animal-forest-fox': 0.206,
  'animal-forest-moose': 0.883,
  'animal-forest-stag': 0.689,
  'animal-forest-wolf': 0.393,
  'animal-forest-rabbit': 0.112,
  'animal-rabbit-hare': 0.078,
  'animal-raccoon': 0.138,
  'animal-river-otter': 0.109,
  'animal-skunk': 0.121,
  'animal-chipmunk': 0.046,
  'animal-squirrel': 0.015,
  'animal-duck-mallard': 0.061,
  'animal-bird-robin': 0.226,
};

/** Swimmers paddle; their swim clips have no planted feet to match, so they glide at a calm pace. */
export const SWIM_SPEED: Record<string, number> = { 'animal-duck-mallard': 0.45, 'animal-river-otter': 0.7 };

/** Scale that draws a model (native height `native`) at its forest height. */
export function drawnScale(model: string, native: number, baby = false): number {
  const height = HEIGHT[model] ?? 1;
  return (height / Math.max(0.01, native)) * (baby ? 0.55 : 1);
}

export type Gait = {
  /** Ground speed at clip speed 1, map units a second. */
  legs: number;
  /** Usual travel speed, map units a second. */
  cruise: number;
  /** Fastest turn, radians a second. Large animals turn slowly. */
  turn: number;
  /** Speeding up, map units a second². */
  accel: number;
  /** How far ahead it looks for the way on, map units (small for small bodies). */
  reach: number;
};

export function gaitFor(model: string, scale: number, mode: 'land' | 'water'): Gait {
  const height = HEIGHT[model] ?? 1;
  if (mode === 'water') {
    const cruise = SWIM_SPEED[model] ?? 0.45;
    return { legs: cruise, cruise, turn: 0.9, accel: cruise / 2, reach: 0.3 };
  }
  const legs = Math.max(0.05, (STRIDE[model] ?? 0.4) * scale);
  // Little animals trot along a touch quicker than an amble; their legs speed up to match.
  const cruise = legs * (height < 0.8 ? 1.35 : 1);
  const turn = height > 2.4 ? 0.8 : height > 1.4 ? 1.1 : height > 0.8 ? 1.7 : 2.6;
  return { legs, cruise, turn, accel: cruise / 1.4, reach: Math.min(0.3, Math.max(0.05, height * 0.12)) };
}

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** A closed route sampled by distance. */
export function routeOf(points: readonly Point[]) {
  const pts = points.slice();
  const first = pts[0]!, last = pts[pts.length - 1]!;
  if (Math.hypot(first.x - last.x, first.z - last.z) > 1e-6) pts.push({ ...first });
  const cumulative = new Float64Array(pts.length);
  for (let i = 1; i < pts.length; i += 1) cumulative[i] = cumulative[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.z - pts[i - 1]!.z);
  const total = cumulative[pts.length - 1]!;
  if (!(total > 0)) throw Error('A route needs length');
  const wrap = (d: number) => ((d % total) + total) % total;
  function at(d: number): Point {
    const w = wrap(d);
    let lo = 1, hi = pts.length - 1;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (cumulative[mid]! < w) lo = mid + 1; else hi = mid; }
    const a = pts[lo - 1]!, b = pts[lo]!, len = cumulative[lo]! - cumulative[lo - 1]!;
    const f = len > 0 ? (w - cumulative[lo - 1]!) / len : 0;
    return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
  }
  /** Heading (yaw about +y, 0 = facing +z) of the route at d. */
  function heading(d: number, span = 0.4): number {
    const a = at(d - span), b = at(d + span);
    return Math.atan2(b.x - a.x, b.z - a.z);
  }
  return { total, at, heading };
}
export type Route = ReturnType<typeof routeOf>;

export type Rest = 'idle' | 'feed' | 'sleep';

/**
 * Walks a closed route like an animal: eases off from a stop, slows into bends and to a stop,
 * turns no faster than its body allows (stopping to turn round when the way doubles back), and
 * rests a while between legs. `pace()` says how fast its legs should cycle (1 = the clip as made).
 */
export function createWalker(route: Route, ground: Gait, options: {
  random: () => number; rests: Rest[]; start?: number; minLeg?: number; maxLeg?: number;
  /** Birds: a leg at least this long is flown at `flight` instead of hopped. */
  flyOver?: number; flight?: Gait;
}) {
  const { random } = options;
  const minLeg = options.minLeg ?? 6, maxLeg = options.maxLeg ?? 26;
  let d = options.start ?? 0, v = 0, yaw = route.heading(d), stop = d, moving = false, from = d, flying = false;
  let gait = ground;
  let restLeft = 1 + random() * 4, rest: Rest = 'idle';
  const restFor = (): [Rest, number] => {
    const kind = options.rests[Math.floor(random() * options.rests.length)] ?? 'idle';
    return [kind, kind === 'sleep' ? 14 + random() * 16 : 3 + random() * 8];
  };

  /**
   * Fastest speed that still lets it take every bend ahead: each short stretch has a corner speed
   * (the turn rate over the bend), and the animal must be able to brake to it in the room left.
   * A bend sharper than about 35° is taken from a standstill, turning on the spot.
   */
  function bendLimit(): number {
    const brake = gait.accel * 2.5, window = 0.8;
    let limit = Infinity;
    for (let s = 0; s <= 7; s += 0.5) {
      // The nearest stretch is measured from where the body faces now, so once it has turned on
      // the spot at a corner it can walk on.
      const before = s === 0 ? yaw : route.heading(d + s, window / 2), after = route.heading(d + s + window, window / 2);
      const bend = Math.abs(wrapAngle(after - before));
      const corner = bend > 0.6 ? 0 : bend < 1e-3 ? Infinity : (gait.turn * window) / bend;
      limit = Math.min(limit, Math.sqrt(corner * corner + 2 * brake * s));
    }
    return limit;
  }
  /** The way on, just ahead of where it stands. */
  const wayOn = () => route.heading(d + gait.reach, gait.reach);

  function advance(dt: number): void {
    if (!(dt > 0)) return;
    if (!moving) {
      v = 0;
      // Turn on the spot to face the way on before setting off.
      const want = wayOn();
      const diff = wrapAngle(want - yaw);
      yaw += Math.sign(diff) * Math.min(Math.abs(diff), gait.turn * 0.6 * dt);
      restLeft -= dt;
      if (restLeft <= 0 && Math.abs(wrapAngle(want - yaw)) < 0.15) {
        moving = true;
        from = d;
        stop = d + Math.min(route.total, minLeg + random() * (maxLeg - minLeg));
        flying = !!options.flight && options.flyOver != null && stop - d >= options.flyOver;
        gait = flying ? options.flight! : ground;
      }
      return;
    }
    const remaining = stop - d;
    const want = wayOn();
    const diff = wrapAngle(want - yaw);
    // Never walk sideways: the further the body is from the way on, the slower it goes, and past
    // about 35° it stands and turns.
    const facing = Math.max(0, Math.cos(Math.min(Math.PI / 2, Math.abs(diff) * 2.6)));
    const target = Math.min(gait.cruise, bendLimit(), Math.sqrt(2 * gait.accel * Math.max(0, remaining)), gait.cruise * facing);
    v = target > v ? Math.min(target, v + gait.accel * dt) : Math.max(target, v - gait.accel * 2.5 * dt);
    d += Math.min(v * dt, Math.max(0, remaining));
    // Standing still it turns at a walk's pace; moving, at its full turn rate.
    yaw += Math.sign(diff) * Math.min(Math.abs(diff), gait.turn * (v > 0.05 * gait.cruise ? 1 : 0.6) * dt);
    if (stop - d <= 0.01) {
      moving = false;
      flying = false;
      gait = ground;
      v = 0;
      [rest, restLeft] = restFor();
    }
  }

  return {
    route,
    advance,
    /** Distance along the route (unwrapped). */
    distance: () => d,
    speed: () => v,
    yaw: () => yaw,
    moving: () => moving,
    rest: () => rest,
    flying: () => flying,
    /** 0 at the start of the current leg, 1 at its stop. */
    progress: () => (moving && stop > from ? (d - from) / (stop - from) : 0),
    position: () => route.at(d),
    /** Leg cycle rate: ground speed over leg speed, so the feet keep their footing. */
    pace: () => v / gait.legs,
  };
}
export type Walker = ReturnType<typeof createWalker>;
