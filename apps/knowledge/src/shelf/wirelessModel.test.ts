import { describe, expect, it } from "vitest";
import type { PageManifestEntry } from "../domain/page";
import { buildShelf } from "./model";
import {
  DEFAULT_MIX,
  DIAL_MAX,
  DIAL_MIN,
  buildDial,
  disagreementFor,
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
    { pageId: "a", page: 10, stance: "supports" as const },
    { pageId: "b", page: 40, stance: "complicates" as const, gaps: ["Does it hold for novices?"] },
    { pageId: "c", page: 90, stance: "extends" as const },
    { pageId: "d", page: 120, stance: "supports" as const },
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
  it("opens on the most-connected supporting note, follows the book's pages, and closes with the phone-in", () => {
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
