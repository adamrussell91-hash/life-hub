import type { AtlasContext, AtlasLand, AtlasModel, AtlasProvince, AtlasTown, MeetingKind } from "./atlasLayout";
import { COAST, islandRadius, islandShape, landFor, neckLand, shoreAt } from "./islandShape";
export { islandRadius } from "./islandShape";
import type { BookModel } from "./model";
import { BOOK_PALETTE } from "./palette";
import type { Landmark } from "./seaLife";

/**
 * The Archipelago: the whole shelf as islands. Each book is an island sized by
 * how much you've written in it; its notes are the hills. Notebooks are seas,
 * islands of one notebook packed together. Sea routes run between books whose
 * notes link. Deterministic, so the map only changes when the shelf does.
 */

export type Island = {
  key: string;
  label: string;
  book: BookModel;
  x: number;
  y: number;
  r: number;
  sea: number;
  reading: boolean;
  /** A note added in the last week. */
  fresh: boolean;
};

export type Sea = { name: string; x: number; y: number; r: number; islands: string[] };

/** Links between two books' notes, in either direction. `from` holds the first link found. */
export type Passage = { from: string; to: string; count: number; fromNote: string; toNote: string };

export type CrossingKind = MeetingKind | "far";
/** How two linked books meet. `a` and `b` are their facing shores (`a` on `from`). */
export type Crossing = { from: string; to: string; count: number; kind: CrossingKind; a: { x: number; y: number }; b: { x: number; y: number } };

export type ArchipelagoModel = {
  width: number;
  height: number;
  bounds: { x: number; y: number; w: number; h: number };
  islands: Island[];
  seas: Sea[];
  passages: Passage[];
  crossings: Crossing[];
  /** The same islands as Atlas provinces and towns, so the Atlas terrain renderer can paint them. */
  terrain: AtlasModel;
};

const MARGIN = 240;
const ISLAND_GAP = 120;
const SEA_GAP = 220;
const GOLDEN = 2.399963229728653;
const HILLS = 5;
const UNFILED = "Unfiled";
const WEEK = 7 * 24 * 60 * 60 * 1000;
/** Three or more links and two neighbouring books share one landmass. */
export const JOIN_AT = 3;
const JOIN_GAP = 14;
const BRIDGE_GAP = 100;
/** A strait wider than this gets no bridge: the link stays a faint route. */
const MAX_STRAIT = 220;

function hash(text: string) {
  let h = 2166136261;
  for (const ch of text) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/**
 * Packs circles around the origin, largest first, each at the first free spot
 * on a sunflower spiral. Returns centres by id; deterministic for a given input.
 */
export function packCircles(
  items: Array<{ id: string; r: number }>,
  gap: number,
  shape: "wide" | "tall" = "wide",
): Map<string, { x: number; y: number }> {
  const [sx, sy] = shape === "wide" ? [1.35, 1] : [1, 1.12];
  const placed: Array<{ x: number; y: number; r: number }> = [];
  const out = new Map<string, { x: number; y: number }>();
  const sorted = [...items].sort((a, b) => b.r - a.r || a.id.localeCompare(b.id));
  for (const item of sorted) {
    if (!placed.length) {
      placed.push({ x: 0, y: 0, r: item.r });
      out.set(item.id, { x: 0, y: 0 });
      continue;
    }
    const step = Math.max(6, item.r * 0.18);
    const turn = hash(item.id) * Math.PI * 2;
    for (let k = 1; k < 20000; k += 1) {
      const dist = step * Math.sqrt(k) * 2.2;
      const a = k * GOLDEN + turn;
      // Stretched to suit the screen: wide on a desktop, tall on a phone.
      const x = Math.cos(a) * dist * sx;
      const y = Math.sin(a) * dist * sy;
      if (placed.every(p => Math.hypot(p.x - x, p.y - y) >= p.r + item.r + gap)) {
        placed.push({ x, y, r: item.r });
        out.set(item.id, { x, y });
        break;
      }
    }
  }
  return out;
}

function passagesFor(books: BookModel[]): Passage[] {
  const byPair = new Map<string, Passage>();
  // Linked notes usually list each other, so count each note pair once.
  const seen = new Set<string>();
  for (const book of books) {
    for (const link of book.links) {
      if (link.toBook === book.key) continue;
      const notePair = [link.fromId, link.toId].sort().join("\u0000");
      if (seen.has(notePair)) continue;
      seen.add(notePair);
      const pair = [book.key, link.toBook].sort().join("\u0000");
      const found = byPair.get(pair);
      if (found) found.count += 1;
      else byPair.set(pair, { from: book.key, to: link.toBook, count: 1, fromNote: link.fromId, toNote: link.toId });
    }
  }
  return [...byPair.values()];
}

export function crossingKind(count: number): MeetingKind {
  return count >= JOIN_AT ? "joined" : count === 2 ? "stone" : "rope";
}

/**
 * Option C: packs one sea with linked books shore to shore. Each linked book is set down
 * against a partner already placed (joined books closest, bridged ones a strait apart);
 * everything else takes the first free spot on the sunflower spiral, as packCircles does.
 * Deterministic for a given shelf.
 */
function packSea(list: BookModel[], passages: Passage[], shape: "wide" | "tall"): Map<string, { x: number; y: number }> {
  const keys = new Set(list.map(b => b.key));
  const links = passages.filter(p => keys.has(p.from) && keys.has(p.to)).sort((a, b) => b.count - a.count || a.from.localeCompare(b.from));
  const items = list.map(b => ({ id: b.key, r: islandRadius(b.noteCount) }));
  if (!links.length) return packCircles(items, ISLAND_GAP, shape);
  const pairKey = (a: string, b: string) => [a, b].sort().join("\u0000");
  const gapFor = new Map(links.map(p => [pairKey(p.from, p.to), crossingKind(p.count) === "joined" ? JOIN_GAP : BRIDGE_GAP]));
  const gap = (a: string, b: string) => gapFor.get(pairKey(a, b)) ?? ISLAND_GAP;
  const partners = new Map<string, string[]>();
  for (const p of links) {
    partners.set(p.from, [...(partners.get(p.from) ?? []), p.to]);
    partners.set(p.to, [...(partners.get(p.to) ?? []), p.from]);
  }
  const [sx, sy] = shape === "wide" ? [1.35, 1] : [1, 1.12];
  const placed: Array<{ id: string; x: number; y: number; r: number }> = [];
  const out = new Map<string, { x: number; y: number }>();
  const fits = (id: string, x: number, y: number, r: number) => placed.every(p => Math.hypot(p.x - x, p.y - y) >= p.r + r + gap(p.id, id) - 0.5);
  const put = (id: string, x: number, y: number, r: number) => {
    placed.push({ id, x, y, r });
    out.set(id, { x, y });
  };
  const spiral = (item: { id: string; r: number }) => {
    if (!placed.length) return put(item.id, 0, 0, item.r);
    const step = Math.max(6, item.r * 0.18);
    const turn = hash(item.id) * Math.PI * 2;
    for (let k = 1; k < 20000; k += 1) {
      const dist = step * Math.sqrt(k) * 2.2;
      const a = k * GOLDEN + turn;
      const x = Math.cos(a) * dist * sx;
      const y = Math.sin(a) * dist * sy;
      if (fits(item.id, x, y, item.r)) return put(item.id, x, y, item.r);
    }
  };
  const byId = new Map(items.map(i => [i.id, i]));
  const sorted = [...items].sort((a, b) => b.r - a.r || a.id.localeCompare(b.id));
  for (const root of sorted) {
    if (out.has(root.id) || !partners.has(root.id)) continue;
    spiral(root);
    // Walk the linked group outward from the root, setting each book against the partner that brought it.
    const queue = [root.id];
    while (queue.length) {
      const next = queue.shift()!;
      const here = placed.find(p => p.id === next)!;
      for (const id of partners.get(here.id) ?? []) {
        if (out.has(id)) continue;
        const item = byId.get(id)!;
        const reach = here.r + item.r + gap(here.id, id);
        const turn = hash(`${here.id}>${id}`) * Math.PI * 2;
        let done = false;
        for (let t = 0; t < 72 && !done; t += 1) {
          // Alternate either side of a preferred bearing, widening by 5° each try.
          const a = turn + Math.ceil(t / 2) * (t % 2 ? 1 : -1) * (Math.PI / 36);
          const x = here.x + Math.cos(a) * reach;
          const y = here.y + Math.sin(a) * reach;
          if (fits(id, x, y, item.r)) {
            put(id, x, y, item.r);
            done = true;
          }
        }
        if (!done) spiral(item);
        queue.push(id);
      }
    }
  }
  for (const item of sorted) if (!out.has(item.id)) spiral(item);
  return out;
}

/** Where island `i`'s coast faces a bearing, in world space. */
function shoreToward(i: Island, angle: number) {
  const s = shoreAt(islandShape(i.key), angle);
  return { x: i.x + s.x * i.r * COAST, y: i.y + s.y * i.r * COAST };
}

function crossingsFor(islands: Island[], passages: Passage[]): Crossing[] {
  const byKey = new Map(islands.map(i => [i.key, i]));
  return passages.flatMap(p => {
    const a = byKey.get(p.from);
    const b = byKey.get(p.to);
    if (!a || !b) return [];
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const pa = shoreToward(a, angle);
    const pb = shoreToward(b, angle + Math.PI);
    const strait = Math.hypot(pb.x - pa.x, pb.y - pa.y);
    const kind: CrossingKind = a.sea === b.sea && strait <= MAX_STRAIT ? crossingKind(p.count) : "far";
    return [{ from: p.from, to: p.to, count: p.count, kind, a: pa, b: pb }];
  });
}

/** The terrain colour index for a book: five kit pastels, then the book palette. */
function paletteColour(book: BookModel) {
  return 5 + Math.max(0, BOOK_PALETTE.findIndex(s => s.fill === book.swatch.fill));
}

/** What a book's own map needs from the Archipelago: where its island sits and how its linked neighbours meet it. */
export function atlasContext(model: ArchipelagoModel, key: string): AtlasContext | undefined {
  const island = model.islands.find(i => i.key === key);
  if (!island) return undefined;
  const byKey = new Map(model.islands.map(i => [i.key, i]));
  const neighbours = model.crossings.flatMap(c => {
    if (c.kind === "far" || (c.from !== key && c.to !== key)) return [];
    const other = byKey.get(c.from === key ? c.to : c.from)!;
    return [{
      key: other.key, label: other.label, kind: c.kind, count: c.count, x: other.x, y: other.y, r: other.r,
      colour: paletteColour(other.book), a: c.from === key ? c.a : c.b, b: c.from === key ? c.b : c.a,
    }];
  });
  return { island: { x: island.x, y: island.y, r: island.r }, neighbours };
}

export function buildArchipelago(books: BookModel[], now = Date.now(), shape: "wide" | "tall" = "wide"): ArchipelagoModel {
  const groups = new Map<string, BookModel[]>();
  for (const book of books) {
    const name = book.notebook?.trim() || UNFILED;
    groups.set(name, [...(groups.get(name) ?? []), book]);
  }
  const names = [...groups.keys()].sort((a, b) => (a === UNFILED ? 1 : b === UNFILED ? -1 : a.localeCompare(b)));

  const passages = passagesFor(books);
  // Pack each sea's islands locally, pull linked books together, then pack the seas.
  const local = names.map(name => {
    const list = groups.get(name)!;
    const centres = packSea(list, passages, shape);
    const extent = Math.max(...list.map(b => {
      const c = centres.get(b.key)!;
      return Math.hypot(c.x, c.y) + islandRadius(b.noteCount);
    }));
    return { name, list, centres, extent };
  });
  const seaCentres = packCircles(local.map(s => ({ id: s.name, r: s.extent })), SEA_GAP, shape);

  const islands: Island[] = [];
  const seas: Sea[] = [];
  local.forEach((sea, index) => {
    const centre = seaCentres.get(sea.name)!;
    seas.push({ name: sea.name, x: centre.x, y: centre.y, r: sea.extent, islands: sea.list.map(b => b.key) });
    for (const book of sea.list) {
      const c = sea.centres.get(book.key)!;
      const notes = [...book.placed, ...book.loose];
      islands.push({
        key: book.key,
        label: book.label,
        book,
        x: centre.x + c.x,
        y: centre.y + c.y,
        r: islandRadius(book.noteCount),
        sea: index,
        reading: Boolean(book.reading),
        fresh: notes.some(n => n.createdAt && now - Date.parse(n.createdAt) < WEEK),
      });
    }
  });

  // Shift into positive world space with a margin for labels and routes.
  const minX = Math.min(...islands.map(i => i.x - i.r), ...seas.map(s => s.x - s.r)) - MARGIN;
  const minY = Math.min(...islands.map(i => i.y - i.r), ...seas.map(s => s.y - s.r)) - MARGIN;
  for (const item of [...islands, ...seas]) {
    item.x = Math.round(item.x - minX);
    item.y = Math.round(item.y - minY);
  }
  const width = Math.round(Math.max(...islands.map(i => i.x + i.r), ...seas.map(s => s.x + s.r)) + MARGIN);
  const height = Math.round(Math.max(...islands.map(i => i.y + i.r), ...seas.map(s => s.y + s.r)) + MARGIN);
  const left = Math.min(...islands.map(i => i.x - i.r));
  const top = Math.min(...islands.map(i => i.y - i.r));
  const bounds = {
    x: left - 60,
    y: top - 80,
    w: Math.max(...islands.map(i => i.x + i.r)) - left + 120,
    h: Math.max(...islands.map(i => i.y + i.r)) - top + 140,
  };

  const crossings = crossingsFor(islands, passages);
  return { width, height, bounds, islands, seas, passages, crossings, terrain: terrainModel(islands, crossings, width, height, bounds) };
}

/** Islands as Atlas provinces (land and colour) and notes as towns (hills; peaks where a note complicates the book). */
function terrainModel(islands: Island[], crossings: Crossing[], width: number, height: number, bounds: ArchipelagoModel["bounds"]): AtlasModel {
  const provinces: AtlasProvince[] = islands.map(island => ({
    id: island.key,
    label: island.label,
    x: island.x,
    y: island.y,
    radius: island.r * 0.6,
    explored: island.book.noteCount > 0,
    colour: paletteColour(island.book),
  }));
  const towns: AtlasTown[] = islands.flatMap(island => {
    // A few hills per island, debate peaks first: every note as a hill turns a big book into a dark knot of contours.
    const all = [...island.book.placed, ...island.book.loose];
    const notes = [...all.filter(n => n.kind === "debate"), ...all.filter(n => n.kind !== "debate")]
      .filter((_, j, list) => j < HILLS || list.length <= HILLS)
      .slice(0, HILLS);
    const turn = hash(island.key) * Math.PI * 2;
    return notes.map((note, j) => {
      const dist = island.r * 0.45 * Math.sqrt((j + 0.5) / notes.length);
      const a = j * GOLDEN + turn;
      return {
        note,
        province: island.key,
        x: island.x + Math.cos(a) * dist,
        y: island.y + Math.sin(a) * dist * 0.85,
        size: 3 + Math.min(4, note.connected.length),
        peak: note.kind === "debate",
        faded: false,
        isNew: false,
        themes: [],
      };
    });
  });
  const byKey = new Map(islands.map(i => [i.key, i]));
  const necks = crossings.filter(c => c.kind === "joined").flatMap(c =>
    neckLand(c.a, c.b, 0.5 * Math.min(byKey.get(c.from)!.r, byKey.get(c.to)!.r) * COAST, c.from, c.to));
  const land: AtlasLand[] = [...islands.flatMap(i => landFor(islandShape(i.key), i.x, i.y, i.r * COAST, i.key)), ...necks];
  return { width, height, bounds, source: "themes", provinces, towns, roads: [], routes: [], fogs: [], land };
}

/** Deterministic dice for one island: the same book always rolls the same shape. */
function rolls(key: string) {
  let n = 0;
  return () => hash(`${key}#${(n += 1)}`);
}

/** Where a sea route meets an island's shore, facing the other island. */
export function shorePoint(from: Island, to: Island) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: from.x + (dx / d) * from.r * 0.9, y: from.y + (dy / d) * from.r * 0.9 };
}

/**
 * Your notes, drawn as landmarks: a lighthouse on every book you wrote in this
 * week, a campfire on the one you're reading, smoke over the book your notes
 * argue with most (two or more that complicate it), mist over books with no
 * notes, a golden X on your most-connected note, and the great tree on the
 * book you've written most in.
 */
export function chartLandmarks(model: Pick<ArchipelagoModel, "islands">): Landmark[] {
  const marks: Landmark[] = [];
  let contested: { island: Island; count: number } | undefined;
  for (const island of model.islands) {
    const roll = rolls(`${island.key}:marks`);
    const notes = [...island.book.placed, ...island.book.loose];
    if (!notes.length) marks.push({ kind: "mist", x: island.x, y: island.y, r: island.r * 0.6 });
    if (island.fresh) {
      const a = roll() * Math.PI * 2;
      marks.push({ kind: "lighthouse", x: island.x + Math.cos(a) * island.r * 0.5, y: island.y + Math.sin(a) * island.r * 0.5 });
    }
    if (island.reading) marks.push({ kind: "camp", x: island.x - island.r * 0.18, y: island.y + island.r * 0.12 });
    const count = notes.filter(n => n.kind === "debate").length;
    if (count >= 2 && count > (contested?.count ?? 0)) contested = { island, count };
  }
  // The great tree grows on the book you've written most in.
  const deepest = [...model.islands].sort((a, b) => b.book.noteCount - a.book.noteCount || a.key.localeCompare(b.key))[0];
  if (deepest && deepest.book.noteCount >= 5) marks.push({ kind: "tree", x: deepest.x - deepest.r * 0.22, y: deepest.y - deepest.r * 0.3 });
  if (contested) marks.push({ kind: "volcano", x: contested.island.x + contested.island.r * 0.12, y: contested.island.y - contested.island.r * 0.12 });
  const treasure = mostConnected(model.islands.flatMap(island => [...island.book.placed, ...island.book.loose].map(note => ({ note, island }))));
  if (treasure) {
    const a = rolls(`${treasure.note.id}:x`)() * Math.PI * 2;
    marks.push({ kind: "treasure", x: treasure.island.x + Math.cos(a) * treasure.island.r * 0.32, y: treasure.island.y + Math.sin(a) * treasure.island.r * 0.32, noteId: treasure.note.id, links: treasure.note.connected.length });
  }
  return marks;
}

/** The note with the most links (three or more), for the treasure X. Ties go to the earlier id. */
export function mostConnected<T extends { note: { id: string; connected: string[] } }>(items: T[]): T | undefined {
  let best: T | undefined;
  for (const item of items) {
    const n = item.note.connected.length;
    if (n < 3) continue;
    if (!best || n > best.note.connected.length || (n === best.note.connected.length && item.note.id < best.note.id)) best = item;
  }
  return best;
}
