import type { AtlasModel, AtlasProvince, AtlasTown } from "./atlasLayout";
import type { BookModel } from "./model";
import { BOOK_PALETTE } from "./palette";

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

export type ArchipelagoModel = {
  width: number;
  height: number;
  bounds: { x: number; y: number; w: number; h: number };
  islands: Island[];
  seas: Sea[];
  passages: Passage[];
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

function hash(text: string) {
  let h = 2166136261;
  for (const ch of text) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

export function islandRadius(noteCount: number) {
  return Math.round(58 + Math.sqrt(Math.max(0, noteCount)) * 17);
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

export function buildArchipelago(books: BookModel[], now = Date.now(), shape: "wide" | "tall" = "wide"): ArchipelagoModel {
  const groups = new Map<string, BookModel[]>();
  for (const book of books) {
    const name = book.notebook?.trim() || UNFILED;
    groups.set(name, [...(groups.get(name) ?? []), book]);
  }
  const names = [...groups.keys()].sort((a, b) => (a === UNFILED ? 1 : b === UNFILED ? -1 : a.localeCompare(b)));

  // Pack each sea's islands locally, then pack the seas.
  const local = names.map(name => {
    const list = groups.get(name)!;
    const centres = packCircles(list.map(b => ({ id: b.key, r: islandRadius(b.noteCount) })), ISLAND_GAP, shape);
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

  return { width, height, bounds, islands, seas, passages: passagesFor(books), terrain: terrainModel(islands, width, height, bounds) };
}

/** Islands as Atlas provinces (land and colour) and notes as towns (hills; peaks where a note complicates the book). */
function terrainModel(islands: Island[], width: number, height: number, bounds: ArchipelagoModel["bounds"]): AtlasModel {
  const provinces: AtlasProvince[] = islands.map(island => {
    const swatch = BOOK_PALETTE.findIndex(s => s.fill === island.book.swatch.fill);
    return {
      id: island.key,
      label: island.label,
      x: island.x,
      y: island.y,
      radius: island.r * 0.6,
      explored: island.book.noteCount > 0,
      // renderTerrain's PASTELS: five kit pastels, then the book palette softened.
      colour: 5 + Math.max(0, swatch),
    };
  });
  const towns: AtlasTown[] = islands.flatMap(island => {
    // A few hills per island, peaks first: every note as a hill turns a big book into a dark knot of contours.
    const all = [...island.book.placed, ...island.book.loose];
    const notes = [...all.filter(n => n.stance === "complicates"), ...all.filter(n => n.stance !== "complicates")]
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
        peak: note.stance === "complicates",
        faded: false,
        isNew: false,
        themes: [],
      };
    });
  });
  return { width, height, bounds, source: "themes", provinces, towns, roads: [], routes: [], fogs: [] };
}

/** Where a sea route meets an island's shore, facing the other island. */
export function shorePoint(from: Island, to: Island) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: from.x + (dx / d) * from.r * 0.9, y: from.y + (dy / d) * from.r * 0.9 };
}
