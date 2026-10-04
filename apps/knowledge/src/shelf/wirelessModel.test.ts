import { describe, expect, it } from "vitest";
import type { PageManifestEntry } from "../domain/page";
import { buildShelf } from "./model";
import {
  mixCounts,
  DEFAULT_MIX,
  DIAL_MAX,
  DIAL_MIN,
  buildDial,
  disagreementFor,
  holdThoughtDraft,
  latestBroadcast,
  orderFromDial,
  nearestStation,
  orderDial,
  runningOrder,
  signalFor,
  turnSegments,
} from "./wirelessModel";

function entry(id: string, book: string, extra: Partial<PageManifestEntry> = {}): PageManifestEntry {
  return { id, title: `Note ${id}`, area: "notes", tags: [], excerpt: "A few words here.", origins: [{ kind: "book", label: book }], ...extra };
}

const entries = [
  entry("a", "Make It Stick", { connected: ["b", "c"] }),
  entry("b", "Make It Stick"),
  entry("c", "Make It Stick"),
  entry("d", "Make It Stick", { connected: ["x"] }),
  entry("e", "Make It Stick"),
  entry("x", "Peak"),
  entry("y", "Discourses"),
];
const data = {
  books: [
    { label: "Make It Stick", pages: 300, notebook: "Cognition" },
    { label: "Peak", notebook: "Cognition" },
    { label: "Discourses", notebook: "Philosophy" },
    { label: "Range" },
  ],
  placements: [
    { pageId: "a", page: 10, kind: "idea" as const },
    { pageId: "b", page: 40, kind: "debate" as const, gaps: ["Does it hold for novices?"] },
    { pageId: "c", page: 90, kind: "bridge" as const },
    { pageId: "d", page: 120, kind: "idea" as const },
  ],
};
const books = buildShelf(entries, data);
const stick = books.find(book => book.key === "make it stick")!;

describe("buildDial", () => {
  const dial = buildDial(books);

  it("makes notebooks the bands, busiest first, with unfiled books last", () => {
    expect(dial.bands.map(band => band.name)).toEqual(["Cognition", "Philosophy", "Unfiled"]);
  });

  it("puts every station on the 9 kHz grid inside the AM dial, in band order, without collisions", () => {
    const khz = dial.stations.map(s => s.khz);
    expect(khz.every(k => (k - DIAL_MIN) % 9 === 0 && k >= DIAL_MIN && k <= DIAL_MAX)).toBe(true);
    expect([...khz].sort((a, b) => a - b)).toEqual(khz);
    expect(new Set(khz).size).toBe(khz.length);
  });

  it("is loudest on the station and fades with distance", () => {
    const station = dial.stations[0]!;
    expect(signalFor(station.khz, station, dial.spacing)).toBe(1);
    expect(signalFor(station.khz + dial.spacing, station, dial.spacing)).toBeLessThan(0.1);
    expect(nearestStation(dial, station.khz + 3)?.key).toBe(station.key);
  });
});

describe("runningOrder", () => {
  it("opens on the most-connected idea note, follows the book's pages, and closes with the phone-in", () => {
    const order = runningOrder(stick, { ...DEFAULT_MIX, supports: 100, counter: 100, extends: 100, crosstalk: 100 });
    expect(order[0]).toMatchObject({ pageId: "a", segment: "cold-open" });
    expect(order.map(item => item.segment)).toEqual(["cold-open", "counterpoint", "extends", "crosstalk", "feature", "phone-in"]);
    expect(order.find(item => item.segment === "crosstalk")).toMatchObject({ pageId: "d", via: "Peak" });
    expect(order.at(-1)).toMatchObject({ pageId: "b", questions: ["Does it hold for novices?"] });
  });

  it("drops a segment when its fader is down and maps Counter onto the disagreement dial", () => {
    const order = runningOrder(stick, { ...DEFAULT_MIX, counter: 0 });
    expect(order.some(item => item.segment === "counterpoint")).toBe(false);
    expect([disagreementFor(0), disagreementFor(50), disagreementFor(90)]).toEqual(["mild", "medium", "sharp"]);
  });

  it("writes one dial line per entry and tracks turns forward through the order", () => {
    const order = runningOrder(stick, { ...DEFAULT_MIX, supports: 100, counter: 100, extends: 100, crosstalk: 100 });
    expect(orderDial(order).split("\n")[0]).toBe("a | cold-open | p.10");
    const turns = [{ citations: [{ pageId: "a" }] }, { citations: [] }, { citations: [{ pageId: "b" }] }, { citations: [{ pageId: "b" }] }];
    expect(turnSegments(turns, order)).toEqual([0, 0, 1, 1]);
  });
});

describe("broadcasts kept on the server", () => {
  it("picks the newest working broadcast of the book", () => {
    const eps = [
      { id: "old", mode: "broadcast", status: "ready", created_at: "2026-10-01", modeDial: { book: "Make It Stick" } },
      { id: "new", mode: "broadcast", status: "ready", created_at: "2026-10-02", modeDial: { book: "make it  stick" } },
      { id: "bad", mode: "broadcast", status: "error", created_at: "2026-10-03", modeDial: { book: "Make It Stick" } },
      { id: "other", mode: "recap", status: "ready", created_at: "2026-10-04", modeDial: {} as Record<string, string> },
    ];
    expect(latestBroadcast(eps, "make it stick")?.id).toBe("new");
  });

  it("rebuilds the running order from the dial text, skipping junk lines", () => {
    const order = runningOrder(stick, { ...DEFAULT_MIX, supports: 100, counter: 100, extends: 100, crosstalk: 100 });
    const rebuilt = orderFromDial(`${orderDial(order)}\nnonsense\nx | not-a-segment | p.1`, stick);
    expect(rebuilt.map(o => [o.pageId, o.segment, o.page])).toEqual(order.map(o => [o.pageId, o.segment, o.page]));
    expect(rebuilt.find(o => o.segment === "crosstalk")?.via).toBe("Peak");
    expect(rebuilt.at(-1)?.questions).toEqual(["Does it hold for novices?"]);
  });

  it("writes a Hold this thought draft with the page, the time and the line", () => {
    expect(holdThoughtDraft({ book: "Make It Stick", page: 38, at: 232, segment: "counterpoint", speaker: "Ann O’Tation", line: "Read it again." }))
      .toBe("From the Wireless broadcast of Make It Stick (p. 38, 03:52 in, debate). Ann O’Tation said: “Read it again.”\n\nMy thought: ");
  });
});

describe("kinds on the air", () => {
  const kinded = buildShelf(
    [entry("p", "Range"), entry("q", "Range"), entry("r", "Range"), entry("s", "Range"), entry("t", "Range"), entry("u", "Range")],
    {
      books: [{ label: "Range", pages: 300 }],
      placements: [
        { pageId: "p", page: 10, kind: "idea" as const },
        { pageId: "q", page: 20, kind: "person" as const },
        { pageId: "r", page: 30, kind: "case" as const },
        { pageId: "s", page: 40, kind: "debate" as const },
        { pageId: "t", page: 50, kind: "bridge" as const },
        { pageId: "u", page: 60 },
      ],
    },
  ).find(book => book.label === "Range")!;

  it("puts person and case notes in Backstory, debates in Counterpoint and bridges in So what", () => {
    const order = runningOrder(kinded, { ...DEFAULT_MIX, supports: 100, counter: 100, extends: 100, crosstalk: 100 });
    const segmentOf = (id: string) => order.find(item => item.pageId === id)?.segment;
    expect(order[0]).toMatchObject({ pageId: "p", segment: "cold-open" });
    expect([segmentOf("q"), segmentOf("r"), segmentOf("s"), segmentOf("t"), segmentOf("u")]).toEqual(["backstory", "backstory", "counterpoint", "extends", "feature"]);
  });

  it("counts every unsorted, idea, person and case note on the Explains fader", () => {
    expect(mixCounts(kinded)).toMatchObject({ supports: 4, counter: 1, extends: 1 });
  });

  it("keeps old broadcasts' segment ids readable", () => {
    const rebuilt = orderFromDial("p | feature | p.10\nq | backstory | p.20\ns | counterpoint | p.40", kinded);
    expect(rebuilt.map(item => item.segment)).toEqual(["feature", "backstory", "counterpoint"]);
  });
});
