import type { BookNote } from "./model";

/**
 * The old chart's sea, alive. Its ships and monsters are cut from Olaus Magnus's
 * Carta Marina (1539; see public/engravings/CREDITS.md): carracks working
 * between the islands, the great serpent, Ziphius and Physeter surfacing now
 * and then, the maelstrom turning, and once in a long while the horned beast
 * rising. Weather too: gulls, squalls, shooting stars, a ghost ship by night.
 *
 * Some of it is your notes in disguise: lighthouses burn on books you wrote in
 * this week, smoke rises from the book your notes argue with most, mist hangs
 * over books you haven't started, and a bottle washes up each day carrying a
 * note you haven't touched in months. A golden X marks your most-connected
 * note, ships on routes your notes have linked carry names you can follow,
 * notes added since your last visit bloom up as new ink, and the chart keeps
 * the season (southern or northern, by your time zone). The Key names those;
 * the rest is play.
 *
 * Everything is in world units, so it pans and zooms with the land.
 */

export type Land = { x: number; y: number; r: number };
type Pt = { x: number; y: number };

export type Landmark =
  | { kind: "lighthouse"; x: number; y: number }
  | { kind: "camp"; x: number; y: number }
  | { kind: "volcano"; x: number; y: number }
  | { kind: "mist"; x: number; y: number; r: number }
  | { kind: "treasure"; x: number; y: number; noteId: string; links: number };

/** A route your notes have made between two books, for a ship to sail and be named after. */
export type Charter = { key: string; name: string; count: number };

export type Season = "spring" | "summer" | "autumn" | "winter";

export type Bottle = { noteId: string; bookKey: string; bookLabel: string; title: string; excerpt: string; since: string };

export type Sky = "dawn" | "day" | "dusk" | "night";

export type SeaLifeOptions = {
  /** The map's root: its data-sky follows the clock. */
  root: HTMLElement;
  bounds: { x: number; y: number; w: number; h: number };
  /** Everything a creature must stay off (with its clearance added). */
  lands: Land[];
  /** Islands ships may sail between; without two, ships cross open water. */
  harbours: Land[];
  /** Linked books first: ships prefer the routes your notes have made. */
  passages?: Array<{ from: Land; to: Land; charter: Charter }>;
  landmarks?: Landmark[];
  bottle?: Bottle;
  onBottle?: (bottle: Bottle) => void;
  onTreasure?: (mark: Extract<Landmark, { kind: "treasure" }>) => void;
  /** A named ship was tapped: the view can show its voyage and follow the ship. */
  onCharter?: (charter: Charter, ship: HTMLElement) => void;
  /** Where new ink blooms: a layer that stays visible from the whole-world view. */
  inkLayer?: HTMLElement;
  /** Every note's place on the map, so notes added since the last visit can bloom. */
  notesAt?: Array<{ id: string; x: number; y: number }>;
  /** Creature size in world units per CSS pixel of the drawings. */
  size: number;
  seed: string;
};

export type SeaLife = {
  stop: () => void;
  /** A tap on the map: true when sea life answered it (the view should do nothing else). */
  tap: (hit: Element | null, at: Pt) => boolean;
};

// ── Drawings ────────────────────────────────────────────────────────
// Engravings, after old charts: ink line on parchment, hatched for shade.
// i-fill = parchment with an ink edge, i-line = ink only, i-hatch = fine shading,
// i-solid = filled ink. Ships and monsters are real engravings (ENGRAVINGS, below).


/** Figures cut from the Carta Marina: an ink mask and a parchment mask, each sized w × h. */
const ENGRAVINGS = {
  "ship-carrack": [238, 259],
  "ship-cog": [224, 244],
  "ship-small": [154, 161],
  serpent: [509, 498],
  ziphius: [496, 248],
  physeter: [254, 280],
  horned: [315, 304],
  maelstrom: [194, 184],
} as const;

type Engraving = keyof typeof ENGRAVINGS;
const SHIPS: Engraving[] = ["ship-carrack", "ship-cog", "ship-small"];

function engraving(name: Engraving) {
  const base = (import.meta.env?.BASE_URL ?? "/").replace(/\/?$/, "/");
  const [w, h] = ENGRAVINGS[name];
  return `<i class="sl-engraving" style="--ar:${w} / ${h};--ink:url('${base}engravings/${name}.png');--fill:url('${base}engravings/${name}-fill.png')"></i>`;
}





const COMPASS = `<svg viewBox="0 0 100 100" aria-hidden="true">
  <circle class="i-fill" cx="50" cy="50" r="36"/>
  <circle class="i-line" cx="50" cy="50" r="31"/>
  <path class="i-hatch" d="M50 14v4M50 82v4M14 50h4M82 50h4M24.5 24.5l2.8 2.8M72.7 72.7l2.8 2.8M75.5 24.5l-2.8 2.8M27.3 72.7l-2.8 2.8"/>
  <g class="sl-needle">
    <path class="i-solid" d="M50 50l-6-6 6-36 6 36zM50 50l6 6-6 36-6-36z"/>
    <path class="i-fill" d="M50 50l6-6 36 6-36 6zM50 50l-6 6-36-6 36-6z"/>
    <path class="i-fill" d="M50 8l6 36-6 6z"/>
    <path class="i-hatch" d="M50 50l20-20M50 50l-20 20M50 50l20 20M50 50l-20-20"/>
  </g>
  <text class="sl-n" x="50" y="6" text-anchor="middle">N</text>
</svg>`;

const LIGHTHOUSE = `<svg viewBox="0 0 24 50" aria-hidden="true">
  <path class="i-fill" d="M1 49c2-6 8-8 11-8s9 2 11 8z"/>
  <path class="i-fill" d="M8 43l2-28h4l2 28z"/>
  <path class="i-hatch" d="M9 36h6M9.2 33h5.6M9.6 26h4.8M9.7 23h4.6M3 47l3-3M18 47l3-3"/>
  <path class="i-fill sl-lantern" d="M9 15h6v-4H9z"/>
  <path class="i-solid" d="M8 11l4-4 4 4z"/>
</svg>`;

const CAMP = `<svg viewBox="0 0 30 24" aria-hidden="true">
  <path class="i-fill" d="M2 22L11 6l9 16z"/>
  <path class="i-hatch" d="M11 6v16M13 10l4 10M14 14l2 6"/>
  <g class="sl-flame"><path d="M23 21c-3-2-3-6 0-10 1 3 4 4 3 7 0 2-1 3-3 3z"/></g>
  <path class="i-line" d="M19 22l8-2M19 20l8 2"/>
</svg>`;

const VOLCANO = `<svg viewBox="0 0 40 26" aria-hidden="true">
  <path class="i-fill" d="M2 25l13-18h10l13 18z"/>
  <path class="i-hatch" d="M24 9l4 14M26 11l6 12M28 14l6 9M16 9l-4 14"/>
  <path class="sl-lava" d="M16 7h8l-2 5-2-2-2 4z"/>
</svg>`;

const BOTTLE = `<svg viewBox="0 0 34 16" aria-hidden="true">
  <path class="i-fill sl-glass" d="M3 5h18c3 0 5 1 6 2h4v2h-4c-1 1-3 2-6 2H3c-2 0-2-6 0-6z"/>
  <path class="i-hatch" d="M6 7h11M6 9h11"/>
  <path class="i-solid" d="M30 6.5h3v3h-3z"/>
</svg>`;




const TREASURE = `<svg viewBox="0 0 40 40" aria-hidden="true">
  <path class="sl-trail" d="M2 38c6-4 4-10 10-12s8 2 12-4"/>
  <path class="sl-x" d="M22 8l12 12M34 8L22 20"/>
</svg>`;

const FISH = `<svg viewBox="0 0 16 8" aria-hidden="true"><path class="i-fill" d="M1 4c3-4 8-4 11 0l3-3v6l-3-3c-3 4-8 4-11 0z"/></svg>`;

const GULL = `<svg viewBox="0 0 16 6" aria-hidden="true"><path d="M0 5Q4 0 8 5Q12 0 16 5"/></svg>`;

// ── Dice and water ─────────────────────────────────────────────────

function hash(text: string) {
  let h = 2166136261;
  for (const ch of text) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Seeded dice, so the same shelf charts the same voyages. */
function dice(seed: string) {
  let a = hash(seed) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function openWater(opts: Pick<SeaLifeOptions, "bounds" | "lands">, clearance: number, roll: () => number, near?: Pt): Pt | undefined {
  const { x, y, w, h } = opts.bounds;
  for (let tries = 0; tries < 240; tries += 1) {
    const p = near
      ? { x: near.x + (roll() - 0.5) * w * 0.5, y: near.y + (roll() - 0.5) * h * 0.5 }
      : { x: x + 40 + roll() * (w - 80), y: y + 40 + roll() * (h - 80) };
    if (p.x < x || p.y < y || p.x > x + w || p.y > y + h) continue;
    if (opts.lands.every(l => Math.hypot(l.x - p.x, l.y - p.y) > l.r + clearance)) return p;
  }
  return undefined;
}

const quad = (a: Pt, c: Pt, b: Pt, t: number) => ({
  x: (1 - t) ** 2 * a.x + 2 * (1 - t) * t * c.x + t * t * b.x,
  y: (1 - t) ** 2 * a.y + 2 * (1 - t) * t * c.y + t * t * b.y,
});

export type Voyage = { from: Pt; via: Pt; to: Pt; seconds: number; charter?: Charter };

/** Courses that stay at sea: harbour to harbour where it can, else across open water. */
export function voyages(
  opts: Pick<SeaLifeOptions, "bounds" | "lands" | "harbours" | "passages">,
  roll: () => number,
  want = Math.max(2, Math.min(5, Math.round(opts.harbours.length / 5))),
): Voyage[] {
  const clear = (a: Pt, c: Pt, b: Pt, skip: Land[]) => {
    for (let t = 0.08; t < 0.93; t += 0.06) {
      const p = quad(a, c, b, t);
      if (opts.lands.some(l => !skip.includes(l) && Math.hypot(l.x - p.x, l.y - p.y) < l.r + 16)) return false;
    }
    return true;
  };
  const course = (a: Pt, b: Pt, skip: Land[] = []): Voyage | undefined => {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d < 120) return undefined;
    for (const bend of [0.18, -0.18, 0.34, -0.34]) {
      const via = { x: (a.x + b.x) / 2 - ((b.y - a.y) / d) * d * bend, y: (a.y + b.y) / 2 + ((b.x - a.x) / d) * d * bend };
      if (clear(a, via, b, skip)) return { from: a, via, to: b, seconds: Math.max(20, Math.min(70, d / 18)) };
    }
    return undefined;
  };
  const offshore = (from: Land, to: Land) => {
    const d = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    return { x: from.x + ((to.x - from.x) / d) * (from.r + 26), y: from.y + ((to.y - from.y) / d) * (from.r + 26) };
  };

  const out: Voyage[] = [];
  const used = new Set<Land>();
  const pairs: Array<[Land, Land, Charter?]> = (opts.passages ?? []).map(p => [p.from, p.to, p.charter]);
  for (const a of opts.harbours) {
    const near = opts.harbours.filter(b => b !== a).sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y));
    for (const b of near.slice(0, 3)) pairs.push([a, b]);
  }
  // Shuffle the neighbour pairs (not the linked ones) so ships spread across the map.
  const linked = opts.passages?.length ?? 0;
  for (let i = pairs.length - 1; i > linked; i -= 1) {
    const j = linked + Math.floor(roll() * (i - linked + 1));
    [pairs[i], pairs[j]] = [pairs[j]!, pairs[i]!];
  }
  // Every charter gets a ship (up to five); the rest of the fleet works neighbouring islands.
  const fleet = Math.max(want, Math.min(5, linked));
  for (const [a, b, charter] of pairs) {
    if (out.length >= fleet) break;
    if (!charter && (used.has(a) || used.has(b))) continue;
    const v = course(offshore(a, b), offshore(b, a), [a, b]);
    if (!v) continue;
    used.add(a);
    used.add(b);
    out.push(charter ? { ...v, charter } : v);
  }
  for (let tries = 0; out.length < want && tries < 30; tries += 1) {
    const a = openWater(opts, 40, roll);
    const b = openWater(opts, 40, roll);
    const v = a && b && Math.hypot(b.x - a.x, b.y - a.y) > 260 ? course(a, b) : undefined;
    if (v) out.push(v);
  }
  return out;
}

// ── The hours ──────────────────────────────────────────────────────

const SKIES: Sky[] = ["dawn", "day", "dusk", "night"];

/** The sky at a local time: dawn 5–7, day to 5:30pm, dusk to 7:30pm, then night. */
export function skyAt(date: Date): Sky {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h >= 5 && h < 7) return "dawn";
  if (h >= 7 && h < 17.5) return "day";
  if (h >= 17.5 && h < 19.5) return "dusk";
  return "night";
}

// ── The seasons ────────────────────────────────────────────────────

const SEASONS: Season[] = ["spring", "summer", "autumn", "winter"];
const SOUTH = /^(Australia|Antarctica)\/|^Pacific\/(Auckland|Chatham|Fiji|Tongatapu|Apia|Noumea|Efate)|^America\/(Argentina|Santiago|Montevideo|Asuncion|Sao_Paulo|La_Paz|Lima)|^Africa\/(Johannesburg|Maputo|Harare|Windhoek|Gaborone|Maseru|Mbabane|Lusaka|Blantyre)|^Indian\/(Mauritius|Reunion)/;

/** True in the southern hemisphere, judged by the time zone (no location needed). */
export function southernZone(timeZone: string) {
  return SOUTH.test(timeZone);
}

/** Meteorological seasons: spring is Sep–Nov in the south, Mar–May in the north. */
export function seasonAt(date: Date, southern: boolean): Season {
  const quarter = Math.floor(((date.getMonth() + 1) % 12) / 3); // 0 Dec–Feb, 1 Mar–May, 2 Jun–Aug, 3 Sep–Nov
  const north: Season[] = ["winter", "spring", "summer", "autumn"];
  const south: Season[] = ["summer", "autumn", "winter", "spring"];
  return (southern ? south : north)[quarter]!;
}

// ── New ink ────────────────────────────────────────────────────────

const SEEN_KEY = "shelf.map.seen";

/**
 * Notes added since this browser last saw the map, grouped by where they sit.
 * The first visit only remembers (otherwise the whole shelf would bloom at once).
 */
export function freshInk(notes: Array<{ id: string; x: number; y: number }>, seen: Set<string> | undefined) {
  if (!seen) return [];
  const spots = new Map<string, { x: number; y: number; count: number }>();
  for (const note of notes) {
    if (seen.has(note.id)) continue;
    const key = `${Math.round(note.x)},${Math.round(note.y)}`;
    const spot = spots.get(key) ?? { x: note.x, y: note.y, count: 0 };
    spot.count += 1;
    spots.set(key, spot);
  }
  return [...spots.values()];
}

function readSeen(): Set<string> | undefined {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : undefined;
  } catch {
    return undefined;
  }
}

function writeSeen(ids: string[], before: Set<string> | undefined) {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify([...new Set([...(before ?? []), ...ids])]));
  } catch {
    // Private windows and blocked storage: nothing blooms, nothing breaks.
  }
}

// ── The bottle ─────────────────────────────────────────────────────

const LONG_AGO = 120 * 24 * 60 * 60 * 1000;

/**
 * Today's message in a bottle: one of the notes you haven't written or opened
 * in four months, a different one each day. None when nothing is that old.
 */
export function pickBottle(books: Array<{ key: string; label: string; notes: BookNote[] }>, now = Date.now()): Bottle | undefined {
  const old: Array<{ note: BookNote; key: string; label: string; touched: number }> = [];
  for (const book of books) {
    for (const note of book.notes) {
      const touched = Math.max(Date.parse(note.createdAt ?? "") || 0, Date.parse(note.lastOpened ?? "") || 0);
      if (touched > 0 && now - touched > LONG_AGO) old.push({ note, key: book.key, label: book.label, touched });
    }
  }
  if (!old.length) return undefined;
  old.sort((a, b) => a.note.id.localeCompare(b.note.id));
  const day = new Date(now).toISOString().slice(0, 10);
  const pick = old[Math.floor(dice(`bottle:${day}`)() * old.length)]!;
  return {
    noteId: pick.note.id,
    bookKey: pick.key,
    bookLabel: pick.label,
    title: pick.note.title,
    excerpt: pick.note.excerpt,
    since: new Date(pick.touched).toLocaleDateString("en-AU", { month: "long", year: "numeric" }),
  };
}

// ── Mounting ───────────────────────────────────────────────────────

/** Fills the world layer with sea life and starts the weather. */
export function mountSeaLife(layer: HTMLElement, opts: SeaLifeOptions): SeaLife {
  const roll = dice(opts.seed);
  const chance = Math.random;
  const s = opts.size;
  const root = opts.root;
  const air = root.querySelector<HTMLElement>(".atlas__air");
  const stars = root.querySelector<HTMLElement>(".atlas__stars");
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const at = (p: Pt) => `left:${p.x.toFixed(1)}px;top:${p.y.toFixed(1)}px`;
  const parts: string[] = [];

  // Each piece claims its water, so none sits on another.
  const taken: Land[] = [];
  const claim = (p: Pt | undefined, r: number) => {
    if (p) taken.push({ x: p.x, y: p.y, r });
    return p;
  };
  const sea = () => ({ bounds: opts.bounds, lands: [...opts.lands, ...taken] });
  const free = (clearance: number, near?: Pt, roller = roll) => openWater(sea(), clearance, roller, near);

  // Landmarks first: they belong to islands, so they never move.
  for (const mark of opts.landmarks ?? []) {
    if (mark.kind === "lighthouse") parts.push(`<div class="sl-mark sl-lighthouse" style="${at(mark)};--s:${s}"><i class="sl-beam"></i><i class="sl-lamp"></i>${LIGHTHOUSE}</div>`);
    if (mark.kind === "camp") parts.push(`<div class="sl-mark sl-camp" style="${at(mark)};--s:${s}"><i class="sl-glow"></i><i class="sl-smoke"></i><i class="sl-smoke"></i>${CAMP}</div>`);
    if (mark.kind === "volcano") parts.push(`<div class="sl-mark sl-volcano" style="${at(mark)};--s:${s}"><i class="sl-glow"></i><i class="sl-smoke"></i><i class="sl-smoke"></i><i class="sl-smoke"></i>${VOLCANO}</div>`);
    if (mark.kind === "treasure") parts.push(`<button type="button" class="sl-treasure" data-sl="treasure" style="${at(mark)};--s:${s}" aria-label="${esc(`Treasure: your most-connected note, linked ${mark.links} times`)}"><i class="sl-glint"></i>${TREASURE}</button>`);
    if (mark.kind === "mist") parts.push(`<div class="sl-mist" style="${at(mark)};--m:${(mark.r * 2.4).toFixed(0)}px;--delay:${(-roll() * 30).toFixed(1)}s"><i></i><i></i></div>`);
  }

  // Compass rose: the first open corner of the chart. Tap it to turn the hours.
  const { x, y, w, h } = opts.bounds;
  const corners = [{ x: x + 70 * s, y: y + 70 * s }, { x: x + w - 70 * s, y: y + 70 * s }, { x: x + 70 * s, y: y + h - 70 * s }, { x: x + w - 70 * s, y: y + h - 70 * s }];
  const rose = corners.find(c => opts.lands.every(l => Math.hypot(l.x - c.x, l.y - c.y) > l.r + 60 * s));
  if (claim(rose, 80 * s)) {
    parts.push(`<div class="sl-compass" data-sl="compass" title="Turn the hours" style="${at(rose!)};--s:${s}">${COMPASS}</div>`);
    parts.push(`<button type="button" class="sl-season-name" data-sl="season" title="Turn the seasons" style="left:${rose!.x.toFixed(1)}px;top:${(rose!.y + 64 * s).toFixed(1)}px;--s:${s}"></button>`);
  }

  const charters = new Map<string, Charter>();
  for (const v of voyages(opts, roll)) {
    if (v.charter) charters.set(v.charter.key, v.charter);
    parts.push(shipHtml(v, s, roll));
  }
  // By night a ghost ship keeps her own course across open water.
  const ghost = voyages({ ...opts, harbours: [], passages: [] }, dice(`${opts.seed}:ghost`), 1)[0];
  if (ghost) parts.push(shipHtml({ ...ghost, seconds: ghost.seconds * 1.8 }, s, roll, " sl-ship--ghost"));

  const serpent = claim(free(110 * s), 110 * s);
  if (serpent) {
    parts.push(`<div class="sl-beast sl-beast--serpent" data-sl="serpent" style="${at(serpent)};--s:${s};--dur:41s;--delay:${(-roll() * 20).toFixed(1)}s"><div class="sl-beast__water">${engraving("serpent")}</div><i class="sl-ripple"></i></div>`);
    const words = claim(free(80 * s, serpent), 90 * s);
    if (words) parts.push(`<span class="sl-legend" style="${at(words)};--s:${s}">Here be dragons</span>`);
  }
  const whale = claim(free(80 * s), 80 * s);
  if (whale) parts.push(`<div class="sl-beast sl-beast--whale" data-sl="whale" style="${at(whale)};--s:${s};--dur:29s;--delay:${(-roll() * 27).toFixed(1)}s"><div class="sl-beast__water">${engraving("ziphius")}</div><i class="sl-ripple"></i></div>`);
  const physeter = claim(free(90 * s), 70 * s);
  if (physeter) parts.push(`<div class="sl-beast sl-beast--physeter" data-sl="physeter" style="${at(physeter)};--s:${s};--dur:37s;--delay:${(-roll() * 37).toFixed(1)}s"><div class="sl-beast__water">${engraving("physeter")}</div><i class="sl-ripple"></i></div>`);

  // The maelstrom turns forever in the deepest water.
  const pool = claim(free(120 * s), 80 * s);
  if (pool) parts.push(`<div class="sl-whirl" style="${at(pool)};--s:${s}">${engraving("maelstrom")}</div>`);

  // Winter's ice: a scatter of floes, only seen in that season.
  const ice = dice(`${opts.seed}:ice`);
  for (let k = 0; k < 7; k += 1) {
    const p = free(30 * s, undefined, ice);
    if (!p) break;
    const n = 5 + Math.floor(ice() * 3);
    const shape = Array.from({ length: n }, (_, j) => {
      const a = (j / n) * Math.PI * 2;
      const r = 50 * (0.6 + ice() * 0.4);
      return `${(50 + Math.cos(a) * r).toFixed(0)}% ${(50 + Math.sin(a) * r).toFixed(0)}%`;
    }).join(",");
    parts.push(`<i class="sl-floe" style="${at(p)};--s:${s};--z:${(0.6 + ice() * 0.9).toFixed(2)};--delay:${(-ice() * 20).toFixed(1)}s;clip-path:polygon(${shape})"></i>`);
  }

  // Today's bottle drifts somewhere it can be found.
  const bottleAt = opts.bottle && claim(free(60 * s, undefined, dice(`${opts.seed}:${opts.bottle.noteId}`)), 50 * s);
  if (opts.bottle && bottleAt) {
    parts.push(`<button type="button" class="sl-bottle" data-sl="bottle" style="${at(bottleAt)};--s:${s}" aria-label="${esc(`A message in a bottle: ${opts.bottle.title}`)}"><i class="sl-glint"></i>${BOTTLE}</button>`);
  }

  layer.innerHTML = parts.join("");

  // Stars reflected in the sea (only seen at night), a field fixed to the window.
  if (stars) {
    const twinkle = dice(`${opts.seed}:stars`);
    stars.innerHTML = Array.from({ length: 70 }, () =>
      `<i style="left:${(twinkle() * 100).toFixed(2)}%;top:${(twinkle() * 100).toFixed(2)}%;--z:${(1 + twinkle() * 2).toFixed(1)}px;--delay:${(-twinkle() * 6).toFixed(1)}s"></i>`).join("");
  }

  // Petals, leaves or snow, by season (one set of motes, styled by the season).
  if (air) {
    const motes = dice(`${opts.seed}:motes`);
    air.innerHTML = `<div class="sl-motes">${Array.from({ length: 22 }, () =>
      `<i style="left:${(motes() * 100).toFixed(1)}%;--d:${(9 + motes() * 9).toFixed(1)}s;--delay:${(-motes() * 18).toFixed(1)}s;--sway:${(20 + motes() * 60).toFixed(0)}px;--spin:${(motes() * 720 - 360).toFixed(0)}deg;--k:${(0.6 + motes() * 0.8).toFixed(2)}"></i>`).join("")}</div>`;
  }

  // ── The hours and the season ────────────────────────────────────
  let chosen: Sky | undefined;
  let season: Season | undefined;
  const southern = southernZone(Intl.DateTimeFormat().resolvedOptions().timeZone ?? "");
  const seasonName = layer.querySelector<HTMLElement>(".sl-season-name");
  const setSky = () => {
    root.dataset.sky = chosen ?? skyAt(new Date());
    root.dataset.season = season ?? seasonAt(new Date(), southern);
    if (seasonName) seasonName.textContent = root.dataset.season;
  };
  setSky();
  const clock = window.setInterval(setSky, 5 * 60 * 1000);

  // ── Wonders: something happens every half-minute or so ──────────
  const timers = new Set<number>();
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
  };
  const spawn = (host: HTMLElement | null, html: string, ms: number) => {
    if (!host) return;
    host.insertAdjacentHTML("beforeend", html);
    const el = host.lastElementChild;
    later(() => el?.remove(), ms);
  };

  const wonders = {
    gulls() {
      const top = 8 + chance() * 50;
      spawn(air, `<div class="sl-gulls${chance() < 0.5 ? " is-west" : ""}" style="top:${top.toFixed(1)}%">${[0, 1, 2, 3, 4].map(i => `<i style="--i:${i}">${GULL}</i>`).join("")}</div>`, 19000);
    },
    squall() {
      const p = free(60 * s, undefined, chance);
      if (!p) return;
      spawn(layer, `<div class="sl-squall" style="${at(p)};--s:${s}"><i class="sl-rain"></i><i class="sl-cloud"></i><i class="sl-bolt"></i></div>`, 30000);
    },
    kraken() {
      // The horned beast of the north rises from a maelstrom, looks about, and is gone.
      const p = free(130 * s, undefined, chance);
      if (!p) return;
      spawn(layer, `<div class="sl-kraken-rise" style="${at(p)};--s:${s}"><div class="sl-kraken-pool">${engraving("maelstrom")}</div><div class="sl-kraken-window"><div>${engraving("horned")}</div></div></div>`, 12500);
    },
  };
  const roster: Array<[keyof typeof wonders, number]> = [["gulls", 4], ["squall", 1.4], ["kraken", 0.8]];
  const wonder = () => {
    if (!document.hidden) {
      let pickAt = chance() * roster.reduce((sum, [, weight]) => sum + weight, 0);
      for (const [name, weight] of roster) {
        pickAt -= weight;
        if (pickAt <= 0) {
          wonders[name]();
          break;
        }
      }
    }
    later(wonder, 20000 + chance() * 25000);
  };
  const shootingStar = () => {
    if (!document.hidden && root.dataset.sky === "night" && air) {
      spawn(air, `<i class="sl-shooting" style="left:${(10 + chance() * 70).toFixed(1)}%;top:${(5 + chance() * 35).toFixed(1)}%;--a:${(18 + chance() * 25).toFixed(0)}deg"></i>`, 1600);
    }
    later(shootingStar, 7000 + chance() * 14000);
  };
  if (!still) {
    later(wonder, 20000);
    later(shootingStar, 3000);
  }

  // New ink: notes added since this browser last looked bloom up where they landed.
  if (opts.notesAt?.length) {
    const seen = readSeen();
    const blooms = freshInk(opts.notesAt, seen);
    writeSeen(opts.notesAt.map(n => n.id), seen);
    blooms.slice(0, 8).forEach((b, i) => later(() => spawn(opts.inkLayer ?? layer,
      `<div class="sl-bloom" style="${at(b)};--s:${s}"><i class="sl-ink"></i><i class="sl-ink"></i><i class="sl-hill"></i><span>+${b.count} new</span></div>`, 5200), still ? 0 : 1400 + i * 650));
  }

  // Each time a beast goes under, it comes up somewhere else.
  const onIteration = (event: AnimationEvent) => {
    if (event.animationName !== "sl-surface") return;
    const beast = (event.target as HTMLElement).closest<HTMLElement>(".sl-beast");
    const next = beast && openWater(sea(), 100 * s, chance);
    if (!beast || !next) return;
    beast.style.left = `${next.x.toFixed(1)}px`;
    beast.style.top = `${next.y.toFixed(1)}px`;
  };
  layer.addEventListener("animationiteration", onIteration);

  // ── Touch ───────────────────────────────────────────────────────
  const once = (el: Element, cls: string, ms: number) => {
    el.classList.remove(cls);
    void (el as HTMLElement).offsetWidth;
    el.classList.add(cls);
    later(() => el.classList.remove(cls), ms);
  };
  const splash = (p: Pt, fish: boolean) => {
    spawn(layer, `<div class="sl-splash" style="${at(p)};--s:${s}"><i></i><i></i>${fish ? `<div class="sl-leap">${FISH}</div>` : ""}</div>`, 1800);
  };
  const tap = (hit: Element | null, p: Pt) => {
    const thing = hit?.closest<HTMLElement>("[data-sl]");
    switch (thing?.dataset.sl) {
      case "compass":
        chosen = SKIES[(SKIES.indexOf(root.dataset.sky as Sky) + 1) % SKIES.length];
        setSky();
        once(thing, "is-turning", 900);
        return true;
      case "season":
        season = SEASONS[(SEASONS.indexOf(root.dataset.season as Season) + 1) % SEASONS.length];
        setSky();
        return true;
      case "bottle":
        if (opts.bottle) opts.onBottle?.(opts.bottle);
        return true;
      case "treasure": {
        const mark = opts.landmarks?.find((m): m is Extract<Landmark, { kind: "treasure" }> => m.kind === "treasure");
        if (mark) opts.onTreasure?.(mark);
        return true;
      }
      case "serpent":
        once(thing, "is-startled", 1200);
        splash(p, false);
        return true;
      case "whale":
      case "physeter":
        once(thing, "is-startled", 1200);
        splash(p, false);
        return true;
      case "ship": {
        const charter = charters.get(thing.dataset.charter ?? "");
        if (charter && opts.onCharter) {
          opts.onCharter(charter, thing);
          return true;
        }
        once(thing, "is-firing", 1400);
        spawn(layer, `<div class="sl-puff" style="${at(p)};--s:${s}"><i></i><i></i><i></i></div>`, 1600);
        return true;
      }
    }
    // Open water answers with a ring, and now and then a fish.
    if (!still && !hit?.closest("button, a, [data-island], [data-town], [data-route], [data-passage], .atlas__card, .atlas__legend, .atlas__controls")) splash(p, chance() < 0.35);
    return false;
  };

  return {
    tap,
    stop() {
      window.clearInterval(clock);
      for (const id of timers) window.clearTimeout(id);
      timers.clear();
      layer.removeEventListener("animationiteration", onIteration);
    },
  };
}

function shipHtml(v: Voyage, s: number, roll: () => number, extra = "") {
  const figure = SHIPS[Math.floor(roll() * SHIPS.length)]!;
  const d = `M${v.from.x.toFixed(1)} ${v.from.y.toFixed(1)}Q${v.via.x.toFixed(1)} ${v.via.y.toFixed(1)} ${v.to.x.toFixed(1)} ${v.to.y.toFixed(1)}`;
  const dir = v.to.x >= v.from.x ? 1 : -1;
  const named = v.charter ? ` sl-ship--charter" data-charter="${esc(v.charter.key)}" title="${esc(v.charter.name)}` : "";
  return `<div class="sl-ship${extra}${named}" data-sl="ship" style="offset-path:path('${d}');--dur:${v.seconds.toFixed(1)}s;--delay:${(-roll() * v.seconds * 2).toFixed(1)}s;--dir:${dir};--s:${s}"><span><i class="sl-lantern-glow"></i>${v.charter ? `<i class="sl-pennant"></i>` : ""}${engraving(figure)}</span></div>`;
}

function esc(value: string) {
  return value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}
