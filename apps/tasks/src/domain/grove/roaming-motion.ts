import type { PathPoint, WildlifeSpecies } from './wildlife';
import { seededRandom } from './random';
export type RoamingActivity = 'locomotion' | 'water' | 'flight' | 'idle' | 'feed' | 'sleep';
const SPEED: Record<WildlifeSpecies, number> = { hare: 1.1, deer: 1.4, fox: 1.7, squirrel: .9, robin: 2.8, mallard: .8, owl: 3.2 };
/** Geometry and destination itinerary are prepared once. Per-frame poses use a
 * binary arc lookup, including babies, never a chord between destinations. */
export function createRoamingMotion(points: readonly PathPoint[], options: {
    seed: string;
    species: WildlifeSpecies;
    mode: 'land' | 'water' | 'flight';
    roles: readonly string[];
    startDistance?: number;
    startFraction?: number;
}) {
    const cumulative = new Float64Array(points.length);
    for (let i = 1; i < points.length; i++)
        cumulative[i] = cumulative[i - 1]! + Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.z - points[i - 1]!.z);
    const total = cumulative.at(-1) ?? 0;
    if (points.length < 2 || !Number.isFinite(total) || total <= 0)
        throw Error('Roaming requires a positive connected route');
    const wrap = (d: number) => ((d % total) + total) % total;
    const locate = (d: number) => { let lo = 1, hi = cumulative.length - 1; while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (cumulative[mid]! < d)
            lo = mid + 1;
        else
            hi = mid;
    } return lo; };
    const random = seededRandom(options.seed), start = wrap(options.startDistance ?? total * (options.startFraction ?? 0)), speed = options.mode === 'water' ? .8 : SPEED[options.species];
    const rests: RoamingActivity[] = ['idle', ...options.roles.includes('feed') ? ['feed' as const] : [], ...options.roles.includes('sleep') ? ['sleep' as const] : []];
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
        const target = wrap(start + planned + Math.min(total * (.1 + random() * .35), 8 + random() * 22));
        const index = locate(target), end = cumulative[index]!;
        const remaining = tourLength - planned;
        const length = Math.min(remaining, wrap(end - wrap(start + planned)) || total);
        itinerary.push({length, rest: 2 + random() * 7, activity: rests[Math.floor(random() * rests.length)]!, destination: length === remaining ? locate(start) : index});
        planned = length === remaining ? tourLength : planned + length;
    }
    let distance = start, leg = 0, travelled = 0, restRemaining = 0, resting = false;
    function advance(delta: number) {
        if (!Number.isFinite(delta) || delta <= 0)
            return;
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
            }
            else {
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
        const d = wrap(distance - trailing), i = locate(d), a = points[i - 1]!, b = points[i]!, length = cumulative[i]! - cumulative[i - 1]!, f = length > 0 ? (d - cumulative[i - 1]!) / length : 0, step = itinerary[leg % itinerary.length]!, activity: RoamingActivity = resting ? step.activity : options.mode === 'flight' ? 'flight' : options.mode === 'water' ? 'water' : 'locomotion';
        return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, yaw: Math.atan2(b.x - a.x, b.z - a.z), routeDistance: d, activity, destination: step.destination, lift: activity === 'flight' ? Math.sin(Math.PI * Math.min(1, travelled / step.length)) * 6 : 0 };
    }
    return { total, advance, snapshot };
}
