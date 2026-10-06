/** Planetary system view, orrery drawer and Big Bang fold: the pure parts, kept out of the renderer. */
import type { Body, SolarModel } from "./solarModel";
import { planetLook, planetName } from "./universePlanets";

type Store = Pick<Storage, "getItem" | "setItem"> | null;

const ORRERY_KEY = "knowledge.universe.orrery-open";
const REPLAY_FOLD_KEY = "knowledge.universe.replay-folded";

function readFlag(storage: Store, key: string) {
  try {
    return storage?.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(storage: Store, key: string, on: boolean) {
  try {
    storage?.setItem(key, on ? "1" : "0");
  } catch {
    /* private mode: the choice lasts for this visit */
  }
}

export const readOrreryOpen = (storage: Store) => readFlag(storage, ORRERY_KEY);
export const writeOrreryOpen = (on: boolean, storage: Store) => writeFlag(storage, ORRERY_KEY, on);
export const readReplayFolded = (storage: Store) => readFlag(storage, REPLAY_FOLD_KEY);
export const writeReplayFolded = (on: boolean, storage: Store) => writeFlag(storage, REPLAY_FOLD_KEY, on);

/** Planets in orbit order, innermost first. The drawer spaces them evenly whatever their real distances. */
export function orreryOrder(model: SolarModel) {
  return [...model.planets].sort((a, b) => a.a - b.a || a.label.localeCompare(b.label));
}

/** Drawer icon radius (CSS px): grows with note count, the giant a little more. */
export function orreryIconRadius(body: Body, maxCount: number) {
  const r = 5 + Math.sqrt(Math.max(body.count, 0) / Math.max(maxCount, 1)) * 9;
  return Math.round((body.giant ? r * 1.25 : r) * 10) / 10;
}

/** Index range [start, end) of a body's subtree in the flattened, depth-first body list. */
export function subtreeEnd(bodies: Body[], root: number) {
  let end = root + 1;
  while (end < bodies.length && isInside(bodies, end, root)) end++;
  return end;
}

function isInside(bodies: Body[], i: number, root: number) {
  let p = bodies[i]!.parent;
  while (p >= 0) {
    if (p === root) return true;
    p = bodies[p]!.parent;
  }
  return false;
}

/** How many moons and notes a planet system holds. */
export function systemCounts(bodies: Body[], planet: number) {
  let moons = 0;
  let notes = 0;
  const end = subtreeEnd(bodies, planet);
  for (let i = planet + 1; i < end; i++) {
    const kind = bodies[i]!.kind;
    if (kind === "moon") moons++;
    else if (kind === "page") notes++;
  }
  return { moons, notes };
}

/** Zoom that fits a system of the given radius (world units) in the stage, with a margin for the chrome. */
export function systemFitK(radius: number, width: number, height: number) {
  return (Math.min(width, height) * 0.44) / Math.max(radius, 1);
}

/**
 * How much bigger the centre planet is drawn in its own system: up to 2.2×, but never so big
 * that it covers the closest thing orbiting it.
 */
export function systemPlanetScale(planet: Body) {
  let closest = Infinity;
  for (const child of planet.children) {
    const squash = 1 - Math.min(child.incline || 0, 0.85) * 0.42;
    closest = Math.min(closest, child.a * (1 - (child.e || 0)) * squash - child.sysR);
  }
  if (!Number.isFinite(closest)) return 2.2;
  return Math.max(1, Math.min(2.2, (closest * 0.8) / Math.max(planet.r, 1e-6)));
}

/** Where a ray from (cx, cy) in direction (dx, dy) leaves the stage, held `inset` px inside its edge. */
export function edgePoint(cx: number, cy: number, dx: number, dy: number, width: number, height: number, inset: number) {
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const x0 = inset;
  const y0 = inset;
  const x1 = width - inset;
  const y1 = height - inset;
  let t = Infinity;
  if (ux > 1e-9) t = Math.min(t, (x1 - cx) / ux);
  if (ux < -1e-9) t = Math.min(t, (x0 - cx) / ux);
  if (uy > 1e-9) t = Math.min(t, (y1 - cy) / uy);
  if (uy < -1e-9) t = Math.min(t, (y0 - cy) / uy);
  if (!Number.isFinite(t) || t < 0) t = 0;
  return {
    x: Math.min(x1, Math.max(x0, cx + ux * t)),
    y: Math.min(y1, Math.max(y0, cy + uy * t)),
    angle: Math.atan2(uy, ux),
  };
}

export type Rect = { left: number; top: number; right: number; bottom: number };

/**
 * Edge point for an exit arrow that stays clear of panels over the stage (toolbar, drawer, note card,
 * replay bar): the ray stops at the first panel it would run into, half a pill short of it.
 */
export function clearEdgePoint(
  cx: number,
  cy: number,
  dx: number,
  dy: number,
  width: number,
  height: number,
  inset: number,
  panels: Rect[],
  gapX = 90,
  gapY = 34,
) {
  const edge = edgePoint(cx, cy, dx, dy, width, height, inset);
  const len = Math.hypot(edge.x - cx, edge.y - cy);
  if (len < 1) return edge;
  const ux = (edge.x - cx) / len;
  const uy = (edge.y - cy) / len;
  let stop = len;
  for (const r of panels) {
    // Slab test: where the ray enters the panel, grown by half an arrow pill each way.
    const x0 = r.left - gapX;
    const x1 = r.right + gapX;
    const y0 = r.top - gapY;
    const y1 = r.bottom + gapY;
    let tIn = 0;
    let tOut = len;
    for (const [o, u, lo, hi] of [
      [cx, ux, x0, x1],
      [cy, uy, y0, y1],
    ] as const) {
      if (Math.abs(u) < 1e-9) {
        if (o < lo || o > hi) {
          tIn = Infinity;
          break;
        }
        continue;
      }
      const a = (lo - o) / u;
      const b = (hi - o) / u;
      tIn = Math.max(tIn, Math.min(a, b));
      tOut = Math.min(tOut, Math.max(a, b));
    }
    if (tIn <= tOut && tIn > 0) stop = Math.min(stop, tIn);
  }
  // Never on top of the planet itself, even when a panel sits right beside it.
  stop = Math.max(stop, Math.min(len, 72));
  return { x: cx + ux * stop, y: cy + uy * stop, angle: edge.angle };
}

export type SystemExit = {
  /** Planet index the linked notes live in, or -1 for untagged belt notes. */
  planet: number;
  label: string;
  targets: number[];
};

/** A selected note's links that leave the current system, grouped by the system they lead to. */
export function systemExits(targets: number[], planetOf: ArrayLike<number>, bodies: Body[], scopePlanet: number): SystemExit[] {
  const groups = new Map<number, number[]>();
  for (const t of targets) {
    const p = planetOf[t] ?? -1;
    if (p === scopePlanet) continue;
    const list = groups.get(p) ?? [];
    list.push(t);
    groups.set(p, list);
  }
  return [...groups.entries()]
    .map(([planet, list]) => ({
      planet,
      label: planet >= 0 ? planetName(bodies[planet]!.label) : "Untagged notes",
      targets: list,
    }))
    .sort((a, b) => b.targets.length - a.targets.length || a.label.localeCompare(b.label));
}

export function notesLabel(count: number) {
  return `${count.toLocaleString("en-AU")} note${count === 1 ? "" : "s"}`;
}

/** Hover line for a planet: "Thoth · Literacy Language and Communication · 163 notes" (the notes in its system). */
export function planetTip(body: Body, systemNotes: number) {
  const name = planetName(body.label);
  const notes = notesLabel(systemNotes);
  return name === body.label ? `${body.label} · planet · ${notes}` : `${name} · ${body.label} · ${notes}`;
}

/** Second line under a god's name: "Egyptian · god of writing, language and the moon". */
export function planetByline(topic: string) {
  const look = planetLook(topic);
  return look ? `${look.pantheon} · ${look.domain}` : "";
}

export function escapeText(text: string) {
  return text.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}
