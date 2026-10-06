import type { PageManifestEntry } from "../domain/page";
import { hashUnit, type SolarModel } from "./solarModel";
import { easeInOut, TAU } from "./universeDraw";

/** Time in the Universe: the Big Bang replay, the meteor shower, and what changed since the last visit. */

export const DAY_MS = 86_400_000;
export const INFALL_MS = 9000;
export const REPLAY_MS = 210_000;
/** Big Bang speeds the button cycles through; ¼ stretches the whole replay to 14 minutes. */
export const REPLAY_SPEEDS = [1, 4, 12, 0.25] as const;

export function nextReplaySpeed(speed: number) {
  const at = REPLAY_SPEEDS.indexOf(speed as (typeof REPLAY_SPEEDS)[number]);
  return REPLAY_SPEEDS[(at + 1) % REPLAY_SPEEDS.length]!;
}

export function replaySpeedLabel(speed: number) {
  return speed === 0.25 ? "×¼" : `×${speed}`;
}
export const SHOWER_STAGGER_MS = 1600;
export const SHOWER_FLIGHT_MS = 5200;
export const SHOWER_CAP = 12;
export const CAPTURE_MS = 11_000;

export function dayOf(iso: string | undefined) {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / DAY_MS) : null;
}

export type Timeline = {
  /** Creation day per body (notes only; Infinity for structure). */
  day: Float64Array;
  /** Earliest descendant note day per body. */
  firstDay: Float64Array;
  /** Sorted descendant note days per body, for growth while replaying. */
  dayLists: number[][];
  minDay: number;
  maxDay: number;
  undated: number;
};

/** Undated notes count as present from the first known day, so they never all land at once at the end. */
export function buildTimeline(model: SolarModel, entries: PageManifestEntry[], todayDay: number): Timeline {
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const n = model.bodies.length;
  const raw = new Float64Array(n).fill(Infinity);
  let minDay = Infinity;
  let undated = 0;
  for (const body of model.bodies) {
    if (!body.pageId) continue;
    const d = dayOf(byId.get(body.pageId)?.created_at);
    if (d == null) undated++;
    else {
      raw[body.idx] = d;
      if (d < minDay) minDay = d;
    }
  }
  if (!Number.isFinite(minDay)) minDay = todayDay;
  const day = new Float64Array(n).fill(Infinity);
  for (const body of model.bodies) {
    if (!body.pageId) continue;
    day[body.idx] = Number.isFinite(raw[body.idx]!) ? raw[body.idx]! : minDay;
  }
  const dayLists: number[][] = model.bodies.map(() => []);
  for (let i = n - 1; i >= 0; i--) {
    if (Number.isFinite(day[i]!)) dayLists[i]!.push(day[i]!);
    const parent = model.bodies[i]!.parent;
    if (parent >= 0) for (const d of dayLists[i]!) dayLists[parent]!.push(d);
  }
  for (const list of dayLists) list.sort((a, b) => a - b);
  const firstDay = new Float64Array(n);
  dayLists.forEach((list, i) => (firstDay[i] = list.length ? list[0]! : Infinity));
  return { day, firstDay, dayLists, minDay, maxDay: Math.max(todayDay, minDay), undated };
}

export function countUpTo(sorted: number[], day: number) {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! <= day) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export type DustField = { angle: Float64Array; drift: Float64Array; radius: Float64Array };

/** Per-body dust placement, hashed once so the replay never hashes strings per frame. */
export function buildDustField(count: number): DustField {
  const angle = new Float64Array(count);
  const drift = new Float64Array(count);
  const radius = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    angle[i] = hashUnit(`dust:${i}`) * TAU;
    drift[i] = 0.004 * (0.5 + hashUnit(`dust-v:${i}`));
    radius[i] = 0.5 + 0.62 * Math.sqrt(hashUnit(`dust-r:${i}`));
  }
  return { angle, drift, radius };
}

/** Where an unborn note waits as dust: scattered far out, drifting slowly round the Hub. */
export function dustOffset(field: DustField, index: number, reach: number, clock: number) {
  const a = field.angle[index]! + clock * field.drift[index]!;
  const R = reach * field.radius[index]!;
  return { x: Math.cos(a) * R, y: Math.sin(a) * R * 0.9 };
}

/** Infall from dust to the note's place: a slow drift, then gravity takes over, curving as it falls. */
export function infallOffset(dust: { x: number; y: number }, target: { x: number; y: number }, u: number) {
  const r0 = Math.hypot(dust.x, dust.y);
  const a0 = Math.atan2(dust.y, dust.x);
  const r1 = Math.hypot(target.x, target.y);
  const a1 = Math.atan2(target.y, target.x);
  let da = a1 - a0;
  while (da > Math.PI) da -= TAU;
  while (da < -Math.PI) da += TAU;
  const r = r0 + (r1 - r0) * Math.pow(u, 1.8);
  const a = a0 + da * easeInOut(u);
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}

// ---------- visit memory ----------

export const UNIVERSE_VISIT_KEY = "kh-universe-visit";

export type VisitMemory = { lastVisit: number | null; rocks: string[]; flaredDay: number | null };

export function readVisit(storage: Pick<Storage, "getItem"> | null | undefined): VisitMemory {
  try {
    const parsed = JSON.parse(storage?.getItem(UNIVERSE_VISIT_KEY) ?? "null");
    if (!parsed || typeof parsed !== "object") return { lastVisit: null, rocks: [], flaredDay: null };
    return {
      lastVisit: typeof parsed.lastVisit === "number" ? parsed.lastVisit : null,
      rocks: Array.isArray(parsed.rocks) ? parsed.rocks.filter((id: unknown) => typeof id === "string") : [],
      flaredDay: typeof parsed.flaredDay === "number" ? parsed.flaredDay : null,
    };
  } catch {
    return { lastVisit: null, rocks: [], flaredDay: null };
  }
}

export function writeVisit(memory: VisitMemory, storage: Pick<Storage, "setItem"> | null | undefined) {
  try {
    storage?.setItem(UNIVERSE_VISIT_KEY, JSON.stringify(memory));
  } catch {
    /* private mode / quota */
  }
}

/** Notes added since the last visit (first visit: the last fortnight), oldest first, capped so it stays a light shower. */
export function showerPageIds(entries: PageManifestEntry[], lastVisit: number | null, nowMs: number, cap = SHOWER_CAP) {
  const since = lastVisit ?? nowMs - 14 * DAY_MS;
  return entries
    .map(entry => ({ id: entry.id, at: entry.created_at ? Date.parse(entry.created_at) : NaN }))
    .filter(item => Number.isFinite(item.at) && item.at > since && item.at <= nowMs)
    .sort((a, b) => a.at - b.at)
    .slice(-cap)
    .map(item => item.id);
}

export function notesThisWeek(entries: PageManifestEntry[], nowMs: number) {
  let count = 0;
  for (const entry of entries) {
    const at = entry.created_at ? Date.parse(entry.created_at) : NaN;
    if (Number.isFinite(at) && at > nowMs - 7 * DAY_MS && at <= nowMs) count++;
  }
  return count;
}

/** The sun flares once on the first visit of a day that has a newly captured note. */
export function shouldFlare(entries: PageManifestEntry[], nowMs: number, flaredDay: number | null) {
  const today = Math.floor(nowMs / DAY_MS);
  if (flaredDay === today) return false;
  return entries.some(entry => dayOf(entry.created_at) === today);
}

/** Notes that were belt rocks last visit and have since been tagged onto a planet. */
export function capturedRocks(previousRocks: string[], model: SolarModel) {
  if (!previousRocks.length) return [];
  const rocksNow = new Set(model.rocks.map(rock => rock.pageId));
  const placed = new Set(model.bodies.filter(body => body.kind === "page").map(body => body.pageId));
  return previousRocks.filter(id => !rocksNow.has(id) && placed.has(id));
}
