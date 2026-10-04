import type { PodcastDials } from "../podcast/schema";
import type { BookModel, BookNote } from "./model";

/**
 * The Wireless: the shelf as an AM dial. Notebooks are bands, books are stations
 * on Australia's 9 kHz grid, and tuning in plays a book as a programme cut from
 * its notes. Everything here is pure so the view only draws.
 */

export const DIAL_MIN = 531;
export const DIAL_MAX = 1602;
const STEP = 9;
const UNFILED = "Unfiled";

export type Station = { key: string; label: string; khz: number; band: number; book: BookModel };
export type Band = { name: string; from: number; to: number; stations: Station[] };
export type Dial = { bands: Band[]; stations: Station[]; spacing: number };

function onGrid(khz: number) {
  return Math.min(DIAL_MAX, Math.max(DIAL_MIN, DIAL_MIN + Math.round((khz - DIAL_MIN) / STEP) * STEP));
}

/** Bands are notebooks, busiest first; stations sit evenly inside them with a wider gap between bands. */
export function buildDial(books: BookModel[]): Dial {
  const groups = new Map<string, BookModel[]>();
  for (const book of books) {
    const name = book.notebook?.trim() || UNFILED;
    groups.set(name, [...(groups.get(name) ?? []), book]);
  }
  const weight = (list: BookModel[]) => list.reduce((sum, book) => sum + book.noteCount, 0);
  const ordered = [...groups.entries()]
    .sort((a, b) => (a[0] === UNFILED ? 1 : b[0] === UNFILED ? -1 : weight(b[1]) - weight(a[1]) || a[0].localeCompare(b[0])))
    .map(([name, list]) => ({ name, list: [...list].sort((a, b) => a.label.localeCompare(b.label)) }));
  const GAP = 1.4;
  const units = ordered.reduce((sum, group) => sum + group.list.length, 0) + Math.max(0, ordered.length - 1) * GAP + 1;
  const spacing = (DIAL_MAX - DIAL_MIN - 2 * STEP) / Math.max(units, 1);
  let cursor = DIAL_MIN + STEP + spacing;
  const used = new Set<number>();
  const stations: Station[] = [];
  const bands: Band[] = ordered.map((group, band) => {
    const list: Station[] = group.list.map(book => {
      let khz = onGrid(cursor);
      while (used.has(khz) && khz < DIAL_MAX) khz += STEP;
      used.add(khz);
      cursor += spacing;
      return { key: book.key, label: book.label, khz, band, book };
    });
    cursor += spacing * GAP;
    stations.push(...list);
    return { name: group.name, from: list[0]!.khz, to: list[list.length - 1]!.khz, stations: list };
  });
  return { bands, stations, spacing: Math.max(STEP, spacing) };
}

/** 1 dead on the station, fading to static about half a station-width away. */
export function signalFor(khz: number, station: Station, spacing: number) {
  const d = Math.abs(khz - station.khz) / (spacing * 0.55);
  return Math.exp(-d * d);
}

export function nearestStation(dial: Dial, khz: number): Station | undefined {
  let best: Station | undefined;
  for (const station of dial.stations) {
    if (!best || Math.abs(station.khz - khz) < Math.abs(best.khz - khz)) best = station;
  }
  return best;
}

export function clampKhz(khz: number) {
  return Math.min(DIAL_MAX, Math.max(DIAL_MIN, khz));
}

// ── Running order ────────────────────────────────────────────────────

// Segment ids are stored in saved episodes' running orders, so they keep their old names:
// feature = idea notes, backstory = person and case notes, counterpoint = debate notes,
// extends = bridge notes.
export type Segment = "cold-open" | "feature" | "backstory" | "counterpoint" | "extends" | "crosstalk" | "phone-in";

export const SEGMENT_LABEL: Record<Segment, string> = {
  "cold-open": "Cold open",
  feature: "Explains",
  backstory: "Backstory",
  counterpoint: "Debate",
  extends: "So what",
  crosstalk: "Crosstalk",
  "phone-in": "Phone-in",
};

export type Mix = { supports: number; counter: number; extends: number; crosstalk: number; length: PodcastDials["length"] };

export const DEFAULT_MIX: Mix = { supports: 70, counter: 55, extends: 60, crosstalk: 60, length: "standard" };

export type OrderEntry = {
  pageId: string;
  segment: Segment;
  title: string;
  page?: number;
  /** The other book, for crosstalk. */
  via?: string;
  /** Open questions, for the phone-in. */
  questions?: string[];
  /** Words the hosts will roughly spend, for the estimated clock. */
  weight: number;
};

const NOTE_CAP: Record<PodcastDials["length"], number> = { short: 10, standard: 20, deep: 34 };

function segmentOf(note: BookNote, linked: Map<string, string>): Segment {
  if (linked.has(note.id)) return "crosstalk";
  if (note.kind === "debate") return "counterpoint";
  if (note.kind === "bridge") return "extends";
  if (note.kind === "person" || note.kind === "case") return "backstory";
  return "feature";
}

/** Keep `share` of the list, spread evenly so the programme still covers the whole book. */
function thin<T>(list: T[], share: number): T[] {
  if (share <= 0 || !list.length) return [];
  const keep = Math.max(1, Math.round(list.length * Math.min(1, share)));
  if (keep >= list.length) return list;
  return Array.from({ length: keep }, (_, i) => list[Math.floor(((i + 0.5) * list.length) / keep)]!);
}

function byPage(a: BookNote, b: BookNote) {
  return (a.page ?? Number.MAX_SAFE_INTEGER) - (b.page ?? Number.MAX_SAFE_INTEGER);
}

/**
 * Cut the book's notes into a programme: a cold open, then the kept notes in
 * book order (explainers, backstory, debates, so-whats and crosstalk where a note
 * links out to another book), then a phone-in of open questions.
 */
export function runningOrder(book: BookModel, mix: Mix): OrderEntry[] {
  const notes = [...book.placed, ...book.loose].sort(byPage);
  if (!notes.length) return [];
  const linked = new Map<string, string>();
  for (const link of book.links) if (!linked.has(link.fromId)) linked.set(link.fromId, link.toLabel);

  const groups: Record<Exclude<Segment, "cold-open" | "phone-in">, BookNote[]> = { feature: [], backstory: [], counterpoint: [], extends: [], crosstalk: [] };
  for (const note of notes) groups[segmentOf(note, linked) as keyof typeof groups].push(note);

  // The cold open is the most-connected idea note, or failing that any note.
  const pool = groups.feature.length ? groups.feature : notes;
  const opener = [...pool].sort((a, b) => b.connected.length - a.connected.length || byPage(a, b))[0]!;

  const kept = new Set<string>([
    ...thin(groups.feature.filter(n => n !== opener), mix.supports / 100),
    ...thin(groups.backstory.filter(n => n !== opener), mix.supports / 100),
    ...thin(groups.counterpoint.filter(n => n !== opener), mix.counter / 100),
    ...thin(groups.extends.filter(n => n !== opener), mix.extends / 100),
    ...thin(groups.crosstalk.filter(n => n !== opener), mix.crosstalk / 100),
  ].map(n => n.id));
  const body = thin(notes.filter(n => kept.has(n.id)), (NOTE_CAP[mix.length] - 1) / Math.max(1, kept.size));

  const words = (note: BookNote) => Math.max(40, Math.min(220, note.excerpt.split(/\s+/).length * 2));
  const entry = (note: BookNote, segment: Segment): OrderEntry => ({
    pageId: note.id,
    segment,
    title: note.title,
    ...(note.page ? { page: note.page } : {}),
    ...(segment === "crosstalk" ? { via: linked.get(note.id) } : {}),
    weight: words(note),
  });

  const order = [entry(opener, "cold-open"), ...body.map(note => entry(note, segmentOf(note, linked)))];
  const callers = notes.filter(n => n.gaps.length).slice(0, 4);
  for (const note of callers) {
    order.push({ ...entry(note, "phone-in"), questions: note.gaps.slice(0, 2), weight: 70 });
  }
  return order;
}

/** One line per note for the mode dial: `pageId | segment | page`. */
export function orderDial(order: OrderEntry[]) {
  return order.map(item => `${item.pageId} | ${item.segment} | ${item.page ? `p.${item.page}` : "-"}`).join("\n");
}

export function disagreementFor(counter: number): PodcastDials["disagreement"] {
  if (counter < 34) return "mild";
  if (counter < 67) return "medium";
  return "sharp";
}

export function mixCounts(book: BookModel) {
  const linked = new Set(book.links.map(link => link.fromId));
  const notes = [...book.placed, ...book.loose];
  return {
    supports: notes.filter(n => !linked.has(n.id) && n.kind !== "debate" && n.kind !== "bridge").length,
    counter: notes.filter(n => !linked.has(n.id) && n.kind === "debate").length,
    extends: notes.filter(n => !linked.has(n.id) && n.kind === "bridge").length,
    crosstalk: new Set(book.links.map(link => link.toBook)).size,
  };
}

/** Rough clock: 150 spoken words a minute. Labelled as an estimate wherever it shows. */
export function estimatedStarts(order: OrderEntry[]) {
  let words = 0;
  return order.map(item => {
    const start = Math.round((words / 150) * 60);
    words += item.weight;
    return start;
  });
}

export function clock(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Which running-order entry each spoken turn belongs to, from its citations.
 * Moves forward only, so a note cited again in the phone-in lands there.
 */
export function turnSegments(turns: Array<{ citations: Array<{ pageId: string }> }>, order: OrderEntry[]): number[] {
  let at = 0;
  return turns.map(turn => {
    const ids = turn.citations.map(c => c.pageId);
    const ahead = order.findIndex((item, index) => index >= at && ids.includes(item.pageId));
    if (ahead >= 0) at = ahead;
    return at;
  });
}

// ── Broadcasts kept on the server ────────────────────────────────────

type DialEpisode = { id: string; mode: string; status: string; created_at: string; modeDial: Record<string, string> };

/** The newest usable broadcast of this book, from the Podcast library (any device). */
export function latestBroadcast<T extends DialEpisode>(episodes: T[], key: string): T | undefined {
  return episodes
    .filter(ep => ep.mode === "broadcast" && ep.status !== "error" && (ep.modeDial.book ?? "").replace(/\s+/g, " ").trim().toLowerCase() === key)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}

const SEGMENTS = new Set<Segment>(["cold-open", "feature", "backstory", "counterpoint", "extends", "crosstalk", "phone-in"]);

/** Rebuilds a broadcast's running order from its `order` dial, reading titles and questions from the book as it is now. */
export function orderFromDial(text: string, book: BookModel): OrderEntry[] {
  const notes = new Map([...book.placed, ...book.loose].map(note => [note.id, note]));
  const linked = new Map(book.links.map(link => [link.fromId, link.toLabel]));
  return text.split("\n").flatMap(line => {
    const [pageId = "", rawSegment = "", rawPage = ""] = line.split("|").map(part => part.trim());
    const segment = rawSegment as Segment;
    if (!pageId || !SEGMENTS.has(segment)) return [];
    const note = notes.get(pageId);
    const page = Number(rawPage.replace(/^p\./, "")) || note?.page;
    return [{
      pageId,
      segment,
      title: note?.title ?? "A note no longer on this book",
      ...(page ? { page } : {}),
      ...(segment === "crosstalk" && linked.get(pageId) ? { via: linked.get(pageId) } : {}),
      ...(segment === "phone-in" && note?.gaps.length ? { questions: note.gaps.slice(0, 2) } : {}),
      weight: segment === "phone-in" ? 70 : Math.max(40, Math.min(220, (note?.excerpt.split(/\s+/).length ?? 20) * 2)),
    }];
  });
}

/** What Hold this thought puts in the Chat box: where you were, and the line you were hearing. */
export function holdThoughtDraft(input: { book: string; page?: number; at: number; segment: Segment; speaker?: string; line?: string }) {
  const where = [input.page ? `p. ${input.page}` : "", `${clock(input.at)} in`, SEGMENT_LABEL[input.segment].toLowerCase()].filter(Boolean).join(", ");
  const quote = input.line ? ` ${input.speaker ?? "The host"} said: “${input.line.length > 280 ? `${input.line.slice(0, 277)}…` : input.line}”` : "";
  return `From the Wireless broadcast of ${input.book} (${where}).${quote}\n\nMy thought: `;
}
