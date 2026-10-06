import { topicKeywords } from "../archive/keywordGraph";
import type { BookModel, BookNote, ChapterModel } from "./model";
import { COAST, SEA_LEVEL, islandRadius, islandShape, landFor, neckLand, reachAt } from "./islandShape";
import { terrainField } from "./atlasTerrain";

/**
 * The Atlas: a book as a land you've settled. Provinces run west → east in
 * reading order (chapters, or themes when a book has no chapters). Each note
 * is a town in its province; chapters with no notes are fogged-in land; notes
 * without a page wait on an island offshore. Everything here is deterministic,
 * so a book's map only changes when its notes do.
 */

export const WORLD_HEIGHT = 1100;
const MAP_WIDTH = 1500;
/** The book's coast radius on its own map. */
const VIEW_R = 340;
/** Regions start in the north-west and run clockwise in reading order. */
const START = -0.75 * Math.PI;
const MAX_PROVINCES = 8;
const MIN_TOWN_GAP = 30;

export type AtlasProvince = {
  id: string;
  label: string;
  detail?: string;
  start?: number;
  end?: number;
  x: number;
  y: number;
  radius: number;
  explored: boolean;
  colour: number;
  /** A linked neighbouring book shown at the edge of this book's map. */
  neighbour?: boolean;
  /** Elongation of the province's land (1 = round) and the angle it runs at. */
  stretch?: number;
  angle?: number;
};

/** Extra land shaping a province: peninsulas, islets, and (with a negative amp) bays. `vote: false` shapes the coast without claiming colour. */
export type AtlasLand = { province: string; x: number; y: number; amp: number; sigma: number; stretch?: number; angle?: number; vote?: boolean };

export type AtlasTown = {
  note: BookNote;
  province: string;
  x: number;
  y: number;
  size: number;
  peak: boolean;
  faded: boolean;
  isNew: boolean;
  themes: string[];
};

export type AtlasRoad = { from: string; to: string };
export type AtlasRoute = { fromId: string; toBook: string; toLabel: string; count: number; side: "north" | "south" | "east" | "west"; x: number; y: number };
export type AtlasFog = { x: number; y: number; text: string; noteId: string };

type Pt = { x: number; y: number };
/** Maps world space to noise space (noise = world / unit + offset), so one island's coast wobbles the same at any zoom. */
export type TerrainFrame = { unit: number; ox: number; oy: number };
/** How a linked neighbour in the same sea meets a book: a rope bridge (1 link), a stone bridge (2) or shared land (3+). */
export type MeetingKind = "rope" | "stone" | "joined";
/** A neighbour as the Archipelago places it: centre, packing radius, terrain colour, and the facing shores (`a` on this book, `b` on theirs). */
export type AtlasNeighbour = { key: string; label: string; kind: MeetingKind; count: number; x: number; y: number; r: number; colour: number; a: Pt; b: Pt };
/** A linked neighbour met at this book's coast, in this map's space: a bridge from shore to shore, or a road from a town over the border. */
export type AtlasCrossing = { key: string; label: string; kind: MeetingKind; count: number; from: Pt; to: Pt; fromId?: string; toId?: string };
/** What a book's own map borrows from the Archipelago, in Archipelago space. */
export type AtlasContext = { island: { x: number; y: number; r: number }; neighbours: AtlasNeighbour[] };

export type AtlasModel = {
  width: number;
  height: number;
  /** The settled land plus its fog, so the view can fit what matters. */
  bounds: { x: number; y: number; w: number; h: number };
  source: "chapters" | "themes" | "single";
  provinces: AtlasProvince[];
  towns: AtlasTown[];
  roads: AtlasRoad[];
  routes: AtlasRoute[];
  fogs: AtlasFog[];
  land?: AtlasLand[];
  frame?: TerrainFrame;
  /** The book's own island in this map's space: centre and coast radius. */
  island?: { x: number; y: number; r: number };
  crossings?: AtlasCrossing[];
};

function hash(text: string) {
  let h = 2166136261;
  for (const ch of text) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/** A book note's themes: the ones placed on it, else its closed-vocabulary tags. */
export function noteThemes(note: BookNote) {
  return note.themes.length ? note.themes : topicKeywords(note.tags);
}

/** Merge adjacent chapters until there are at most `max`, balancing their page spans. */
export function groupChapters(chapters: ChapterModel[], pages: number, max = MAX_PROVINCES) {
  if (chapters.length <= max) return chapters.map(ch => [ch]);
  const target = pages / max;
  const groups: ChapterModel[][] = [];
  let current: ChapterModel[] = [];
  let span = 0;
  for (const ch of chapters) {
    const size = ch.end - ch.start + 1;
    const remainingGroups = max - groups.length;
    const remainingChapters = chapters.length - chapters.indexOf(ch);
    if (current.length && (span + size / 2 > target || remainingChapters < remainingGroups) && groups.length < max - 1) {
      groups.push(current);
      current = [];
      span = 0;
    }
    current.push(ch);
    span += size;
  }
  if (current.length) groups.push(current);
  return groups;
}

function shortTitle(text: string, max = 30) {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

type Bucket = { id: string; label: string; detail?: string; start?: number; end?: number; notes: BookNote[] };

function chapterBuckets(book: BookModel): Bucket[] {
  return groupChapters(book.chapters, book.pages).map(group => {
    const first = group[0]!;
    const last = group[group.length - 1]!;
    const indices = new Set(group.map(ch => ch.index));
    const notes = book.placed.filter(note => {
      const index = note.chapterIndex ?? 0;
      return indices.has(index);
    });
    const label = group.length === 1
      ? shortTitle(first.title)
      : `Chapters ${first.label || first.index + 1}–${last.label || last.index + 1}`;
    const detail = group.length === 1 ? (first.label ? `Chapter ${first.label}` : undefined) : `${shortTitle(first.title, 24)} → ${shortTitle(last.title, 24)}`;
    return { id: `ch-${first.index}`, label, detail, start: first.start, end: last.end, notes };
  });
}

/** Without chapters: each note settles under its least common theme, so regions differ. */
function themeBuckets(book: BookModel): Bucket[] {
  const counts = new Map<string, number>();
  for (const note of book.placed) for (const theme of noteThemes(note)) counts.set(theme, (counts.get(theme) ?? 0) + 1);
  const byTheme = new Map<string, BookNote[]>();
  for (const note of book.placed) {
    const themes = noteThemes(note);
    const pick = themes.length ? [...themes].sort((a, b) => (counts.get(a)! - counts.get(b)!) || a.localeCompare(b))[0]! : "Unsorted";
    byTheme.set(pick, [...(byTheme.get(pick) ?? []), note]);
  }
  const ranked = [...byTheme].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const kept = ranked.slice(0, MAX_PROVINCES - 1);
  const rest = ranked.slice(MAX_PROVINCES - 1).flatMap(([, notes]) => notes);
  const buckets: Bucket[] = kept.map(([theme, notes]) => ({ id: `th-${theme}`, label: theme, notes }));
  if (rest.length) buckets.push({ id: "th-other", label: "Other themes", notes: rest });
  // Reading order still runs west → east: order provinces by their earliest page.
  return buckets.sort((a, b) => Math.min(...a.notes.map(n => n.page!)) - Math.min(...b.notes.map(n => n.page!)));
}

export function buildAtlas(book: BookModel, now = Date.now(), context?: AtlasContext): AtlasModel {
  let source: AtlasModel["source"] = "single";
  let buckets: Bucket[];
  if (book.chapters.length >= 2) {
    source = "chapters";
    buckets = chapterBuckets(book);
  } else if (book.placed.length) {
    buckets = themeBuckets(book);
    source = buckets.length > 1 ? "themes" : "single";
    if (source === "single") buckets = [{ id: "all", label: book.label, notes: book.placed }];
  } else {
    buckets = [];
  }

  const width = MAP_WIDTH;
  const height = WORLD_HEIGHT;
  const cx = width / 2;
  const cy = height / 2;
  const seed = hash(book.key) * Math.PI * 2;
  const here = context?.island ?? { x: 0, y: 0, r: islandRadius(book.noteCount) };
  // The book's island is the same shape as on the Archipelago, scaled so its coast sits at VIEW_R.
  const k = VIEW_R / (here.r * COAST);
  const view = (p: Pt) => ({ x: cx + (p.x - here.x) * k, y: cy + (p.y - here.y) * k });
  const frame: TerrainFrame = { unit: k, ox: here.x - cx / k, oy: here.y - cy / k };
  const shape = islandShape(book.key);
  const reach = (angle: number) => reachAt(shape, angle) * VIEW_R;
  const land: AtlasLand[] = landFor(shape, cx, cy, VIEW_R, book.key, false);

  // Chapters (or themes) become wedges round the island, sized by their notes; empty ones keep a sliver.
  const weights = buckets.map(b => Math.max(1, b.notes.length));
  const total = weights.reduce((sum, n) => sum + n, 0) || 1;
  let turn = START;
  const spans = weights.map(weight => {
    const from = turn;
    const span = (weight / total) * Math.PI * 2;
    turn += span;
    return { from, span };
  });
  const provinces: AtlasProvince[] = buckets.map((bucket, i) => {
    const { from, span } = spans[i]!;
    const mid = from + span / 2;
    const d = buckets.length > 1 ? reach(mid) * 0.55 : 0;
    return { id: bucket.id, label: bucket.label, detail: bucket.detail, start: bucket.start, end: bucket.end, x: cx + Math.cos(mid) * d, y: cy + Math.sin(mid) * d, radius: VIEW_R * 0.32, explored: bucket.notes.length > 0, colour: i };
  });
  const regionAt = (angle: number) => {
    const t = (((angle - START) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const i = spans.findIndex(s => t >= s.from - START && t < s.from - START + s.span);
    return provinces[i < 0 ? provinces.length - 1 : i]?.id;
  };
  const towns: AtlasTown[] = [];
  const sixMonths = 182 * 86_400_000;
  const week = 7 * 86_400_000;
  const settle = (note: BookNote, province: string, x: number, y: number) => {
    const created = note.createdAt ? Date.parse(note.createdAt) : NaN;
    const opened = note.lastOpened ? Date.parse(note.lastOpened) : NaN;
    const lastTouch = Math.max(Number.isNaN(created) ? 0 : created, Number.isNaN(opened) ? 0 : opened);
    towns.push({
      note,
      province,
      x,
      y,
      size: 4 + Math.min(5, note.excerpt.length / 90) + note.connected.length * 0.6,
      peak: note.kind === "debate",
      faded: lastTouch > 0 && now - lastTouch > sixMonths,
      isNew: !Number.isNaN(created) && now - created < week,
      themes: noteThemes(note),
    });
  };
  buckets.forEach((bucket, i) => {
    const { from, span } = spans[i]!;
    bucket.notes.forEach((note, n) => {
      const t = (n + 0.5) / bucket.notes.length;
      // Spread through the region's wedge, earlier pages nearer the middle of the island.
      const a = buckets.length > 1 ? from + span * (0.1 + 0.8 * ((n * 0.618034 + 0.31) % 1)) : n * 2.399963 + seed;
      const d = reach(a) * (buckets.length > 1 ? 0.22 + 0.58 * Math.sqrt(t) : 0.78 * Math.sqrt(t));
      settle(note, provinces[i]!.id, cx + Math.cos(a) * d, cy + Math.sin(a) * d);
    });
  });
  if (book.loose.length) {
    // Loose notes wait on the largest islet offshore, grown to hold them (or one raised south-east).
    const islet = [...shape.islets].sort((a, b) => b.sigma - a.sigma)[0] ?? { x: 0.95, y: 0.95, sigma: 0.08 };
    const bearing = Math.atan2(islet.y, islet.x);
    const spread = 26 * Math.sqrt(book.loose.length);
    const sigma = Math.max(islet.sigma * VIEW_R, spread * 0.9 + 22);
    // Clear of the main coast by the islet's own reach plus the coast's noise wobble on both shores (2 × 35 Archipelago units).
    const out = Math.max(Math.hypot(islet.x, islet.y) * VIEW_R, reach(bearing) + sigma * 1.2 + 70 * k);
    const hx = cx + Math.cos(bearing) * out;
    const hy = cy + Math.sin(bearing) * out;
    land.push({ province: "loose", x: hx, y: hy, amp: 0.85, sigma, vote: true });
    book.loose.forEach((note, n) => {
      const angle = n * 2.399963;
      const dist = 26 * Math.sqrt(n + 0.5);
      settle(note, "loose", hx + Math.cos(angle) * dist, hy + Math.sin(angle) * dist * 0.7);
    });
  }
  relax(towns, provinces);
  for (const town of towns) {
    if (town.province === "loose") continue;
    const a = Math.atan2(town.y - cy, town.x - cx);
    const max = reach(a) * 0.86;
    if (Math.hypot(town.x - cx, town.y - cy) > max) {
      town.x = cx + Math.cos(a) * max;
      town.y = cy + Math.sin(a) * max;
    }
  }
  // The coast wobbles with the map's noise, so check the real land: towns that landed in the sea walk
  // back towards the middle, and loose notes move to wherever their islet actually surfaced.
  const ground = terrainField({ width, height, bounds: { x: 0, y: 0, w: width, h: height }, source, provinces: [], towns: [], roads: [], routes: [], fogs: [], land, frame });
  const dry = (x: number, y: number) => ground(x, y).e > SEA_LEVEL + 0.04;
  const loose = towns.filter(t => t.province === "loose");
  const islet = land.find(l => l.province === "loose");
  if (islet && loose.length) {
    let best = { x: islet.x, y: islet.y, e: -Infinity };
    // Search near the islet, but only offshore of the main coast, so the main island's higher ground can't win.
    // The noise can carry the islet up to one wobble (35 Archipelago units) from where it was set down.
    const span = (islet.sigma + 35 * k) / 10;
    for (let i = -10; i <= 10; i += 1) for (let j = -10; j <= 10; j += 1) {
      const x = islet.x + i * span;
      const y = islet.y + j * span;
      if (Math.hypot(x - cx, y - cy) < reach(Math.atan2(y - cy, x - cx)) + islet.sigma * 0.6) continue;
      const e = ground(x, y).e;
      if (e > best.e) best = { x, y, e };
    }
    for (const town of loose) {
      town.x += best.x - islet.x;
      town.y += best.y - islet.y;
    }
  }
  const looseMiddle = loose.reduce((m, t) => ({ x: m.x + t.x / loose.length, y: m.y + t.y / loose.length }), { x: 0, y: 0 });
  for (const town of towns) {
    const target = town.province === "loose" ? looseMiddle : { x: cx, y: cy };
    for (let step = 0; step < 40 && !dry(town.x, town.y); step += 1) {
      town.x += (target.x - town.x) * 0.08;
      town.y += (target.y - town.y) * 0.08;
    }
  }

  const byId = new Map(towns.map(t => [t.note.id, t]));
  const roads: AtlasRoad[] = [];
  const seenRoad = new Set<string>();
  for (const town of towns) {
    for (const id of town.note.connected) {
      if (!byId.has(id)) continue;
      const key = [town.note.id, id].sort().join("|");
      if (seenRoad.has(key)) continue;
      seenRoad.add(key);
      roads.push({ from: town.note.id, to: id });
    }
  }

  // Linked neighbours at the edge: their own shapes (faded), and a neck of shared land for joined ones.
  const neighbours = context?.neighbours ?? [];
  for (const n of neighbours) {
    const centre = view(n);
    const coast = n.r * COAST * k;
    land.push(...landFor(islandShape(n.key), centre.x, centre.y, coast, n.key));
    provinces.push({ id: n.key, label: n.label, x: centre.x, y: centre.y, radius: coast * 0.5, explored: true, colour: n.colour, neighbour: true });
    if (n.kind === "joined") {
      const shore = view(n.a);
      land.push(...neckLand(shore, view(n.b), 0.5 * Math.min(VIEW_R, coast), regionAt(Math.atan2(shore.y - cy, shore.x - cx)) ?? book.key, n.key));
    }
  }

  // Sea routes: one per other book, leaving from the town with the most links to it.
  const perBook = new Map<string, { label: string; count: number; from: Map<string, number> }>();
  for (const link of book.links) {
    if (!byId.has(link.fromId)) continue;
    const entry = perBook.get(link.toBook) ?? { label: link.toLabel, count: 0, from: new Map() };
    entry.count += 1;
    entry.from.set(link.fromId, (entry.from.get(link.fromId) ?? 0) + 1);
    perBook.set(link.toBook, entry);
  }
  const nextDoor = new Set(neighbours.map(n => n.key));
  const busiest = (toBook: string) => {
    const entry = perBook.get(toBook);
    return entry ? [...entry.from].sort((a, b) => b[1] - a[1])[0]![0] : undefined;
  };
  const routes: AtlasRoute[] = [...perBook].filter(([toBook]) => !nextDoor.has(toBook)).map(([toBook, entry]) => {
    const fromId = busiest(toBook)!;
    const town = byId.get(fromId)!;
    const side = town.y < height * 0.42 ? "north" : town.y > height * 0.62 ? "south" : town.x < width / 2 ? "west" : "east";
    return { fromId, toBook, toLabel: entry.label, count: entry.count, side, x: town.x, y: town.y };
  });
  const crossings: AtlasCrossing[] = neighbours.map(n => {
    const fromId = busiest(n.key);
    const town = fromId ? byId.get(fromId) : undefined;
    const toId = book.links.find(l => l.toBook === n.key && l.fromId === fromId)?.toId;
    const here = view(n.a);
    const there = view(n.b);
    if (n.kind !== "joined") return { key: n.key, label: n.label, kind: n.kind, count: n.count, from: here, to: there, fromId, toId };
    // The road runs from the town with most links to that book, over the border, into its land.
    const centre = view(n);
    const to = { x: there.x + (centre.x - there.x) * 0.45, y: there.y + (centre.y - there.y) * 0.45 };
    return { key: n.key, label: n.label, kind: n.kind, count: n.count, from: town ? { x: town.x, y: town.y } : here, to, fromId, toId };
  });

  const fogs: AtlasFog[] = [];
  for (const town of towns) {
    if (!town.note.gaps.length || fogs.length >= 6) continue;
    // Open questions drift offshore, just beyond the coast nearest the town that asked.
    const a = Math.atan2(town.y - cy, town.x - cx);
    const d = Math.max(reach(a), Math.hypot(town.x - cx, town.y - cy)) + 110;
    fogs.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d, text: town.note.gaps[0]!, noteId: town.note.id });
  }

  const xs = [cx - VIEW_R * 1.15, cx + VIEW_R * 1.15, ...towns.map(t => t.x), ...fogs.map(f => f.x)];
  const ys = [cy - VIEW_R * 1.15 - 40, cy + VIEW_R * 1.15, ...towns.map(t => t.y), ...fogs.map(f => f.y)];
  const bx = Math.max(0, Math.min(...xs) - 40);
  const by = Math.max(0, Math.min(...ys) - 40);
  const bounds = { x: bx, y: by, w: Math.min(width, Math.max(...xs) + 40) - bx, h: Math.min(height, Math.max(...ys) + 40) - by };
  return {
    width, height, bounds, source, provinces, towns, roads, routes, fogs, land, crossings,
    frame,
    island: { x: cx, y: cy, r: VIEW_R },
  };
}

/** Push towns apart until none are closer than MIN_TOWN_GAP, keeping each near its province. */
function relax(towns: AtlasTown[], provinces: AtlasProvince[]) {
  const centres = new Map(provinces.map(p => [p.id, p]));
  for (let iteration = 0; iteration < 40; iteration += 1) {
    let moved = false;
    for (let i = 0; i < towns.length; i += 1) {
      for (let j = i + 1; j < towns.length; j += 1) {
        const a = towns[i]!;
        const b = towns[j]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        if (dist >= MIN_TOWN_GAP) continue;
        const push = (MIN_TOWN_GAP - dist) / 2;
        const ux = dx / dist || 1;
        const uy = dy / dist;
        a.x -= ux * push;
        a.y -= uy * push;
        b.x += ux * push;
        b.y += uy * push;
        moved = true;
      }
    }
    for (const town of towns) {
      const p = centres.get(town.province);
      if (!p) continue;
      town.x += (p.x - town.x) * 0.02;
      town.y += (p.y - town.y) * 0.02;
    }
    if (!moved) break;
  }
}
