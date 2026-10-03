import { topicKeywords } from "../archive/keywordGraph";
import type { BookModel, BookNote, ChapterModel } from "./model";

/**
 * The Atlas: a book as a land you've settled. Provinces run west → east in
 * reading order (chapters, or themes when a book has no chapters). Each note
 * is a town in its province; chapters with no notes are fogged-in land; notes
 * without a page wait on an island offshore. Everything here is deterministic,
 * so a book's map only changes when its notes do.
 */

export const WORLD_HEIGHT = 900;
const PROVINCE_SPACING = 300;
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
  /** Elongation of the province's land (1 = round) and the angle it runs at. */
  stretch?: number;
  angle?: number;
};

/** Extra land shaping a province: peninsulas, islets, and (with a negative amp) bays. */
export type AtlasLand = { province: string; x: number; y: number; amp: number; sigma: number; stretch?: number; angle?: number };

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

export function buildAtlas(book: BookModel, now = Date.now()): AtlasModel {
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

  const count = Math.max(1, buckets.length);
  const width = Math.max(1100, count * PROVINCE_SPACING + 260);
  const height = WORLD_HEIGHT;
  const seed = hash(book.key) * Math.PI * 2;
  const provinces: AtlasProvince[] = buckets.map((bucket, i) => {
    const x = 130 + (i + 0.5) * ((width - 260) / count);
    const y = height * 0.5 + Math.sin(i * 1.15 + seed) * height * 0.2;
    const radius = bucket.notes.length ? Math.min(PROVINCE_SPACING * 0.62, 58 + 24 * Math.sqrt(bucket.notes.length)) : 96;
    return { id: bucket.id, label: bucket.label, detail: bucket.detail, start: bucket.start, end: bucket.end, x, y, radius, explored: bucket.notes.length > 0, colour: i };
  });

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
      peak: note.stance === "complicates",
      faded: lastTouch > 0 && now - lastTouch > sixMonths,
      isNew: !Number.isNaN(created) && now - created < week,
      themes: noteThemes(note),
    });
  };
  buckets.forEach((bucket, i) => {
    const p = provinces[i]!;
    bucket.notes.forEach((note, n) => {
      // Sunflower spiral in page order: earlier pages sit nearer the centre.
      const angle = n * 2.399963 + seed;
      const dist = p.radius * 0.82 * Math.sqrt((n + 0.5) / Math.max(1, bucket.notes.length));
      settle(note, p.id, p.x + Math.cos(angle) * dist * 1.15, p.y + Math.sin(angle) * dist * 0.85);
    });
  });
  // Loose notes: an island south-east, offshore.
  if (book.loose.length) {
    const cx = width - 170;
    const cy = height - 150;
    book.loose.forEach((note, n) => {
      const angle = n * 2.399963;
      const dist = 26 * Math.sqrt(n + 0.5);
      settle(note, "loose", cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist * 0.7);
    });
  }
  relax(towns, provinces);

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

  // Sea routes: one per other book, leaving from the town with the most links to it.
  const perBook = new Map<string, { label: string; count: number; from: Map<string, number> }>();
  for (const link of book.links) {
    if (!byId.has(link.fromId)) continue;
    const entry = perBook.get(link.toBook) ?? { label: link.toLabel, count: 0, from: new Map() };
    entry.count += 1;
    entry.from.set(link.fromId, (entry.from.get(link.fromId) ?? 0) + 1);
    perBook.set(link.toBook, entry);
  }
  const routes: AtlasRoute[] = [...perBook].map(([toBook, entry]) => {
    const fromId = [...entry.from].sort((a, b) => b[1] - a[1])[0]![0];
    const town = byId.get(fromId)!;
    const side = town.y < height * 0.42 ? "north" : town.y > height * 0.62 ? "south" : town.x < width / 2 ? "west" : "east";
    return { fromId, toBook, toLabel: entry.label, count: entry.count, side, x: town.x, y: town.y };
  });

  // Fog: open questions drift offshore, away from the middle of the land, beside the town that asked.
  const fogs: AtlasFog[] = [];
  const midX = towns.reduce((sum, t) => sum + t.x, 0) / Math.max(1, towns.length);
  for (const town of towns) {
    if (!town.note.gaps.length || fogs.length >= 6) continue;
    const province = provinces.find(p => p.id === town.province);
    // Province names sit above the land, so questions drift south of it.
    const reach = (province?.radius ?? 60) + 110;
    fogs.push({ x: town.x + (town.x - midX) * 0.08, y: Math.min(height - 70, (province?.y ?? town.y) + reach), text: town.note.gaps[0]!, noteId: town.note.id });
  }

  const xs = [...provinces.flatMap(p => [p.x - p.radius, p.x + p.radius]), ...towns.map(t => t.x), ...fogs.map(f => f.x)];
  const ys = [...provinces.flatMap(p => [p.y - p.radius - 60, p.y + p.radius]), ...towns.map(t => t.y), ...fogs.map(f => f.y)];
  const bx = Math.max(0, Math.min(...xs, width) - 40);
  const by = Math.max(0, Math.min(...ys, height) - 40);
  const bounds = { x: bx, y: by, w: Math.min(width, Math.max(...xs, 0) + 40) - bx, h: Math.min(height, Math.max(...ys, 0) + 40) - by };
  return { width, height, bounds, source, provinces, towns, roads, routes, fogs };
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
