import { describe, expect, it } from "vitest";
import type { PageManifestEntry } from "../domain/page";
import { TOPIC_VOCABULARY } from "../tidy/vocabulary";
import type { SavedConstellation } from "../stars/schema";
import { buildSolarModel, type Body } from "./solarModel";
import { alignedTriple } from "./universeAlignment";
import { bridgeTargets, dialPhase, CHEVRON_MS, MAX_LOCKS } from "./universeBridges";
import { decayInertia, glideAt, lensMap, LENS_RADIUS, startGlide } from "./universeCamera";
import { ambientDelay, noteFrequency, readSoundPrefs, writeSoundPrefs } from "./universeChimes";
import { buildComets, cometMeanAnomaly, cometOffset, selectCometNotes, COMET_LIMIT } from "./universeComets";
import { buildSkyLayers, skyFigures, SKY_TILE } from "./universeSky";
import {
  DAY_MS,
  buildTimeline,
  capturedRocks,
  countUpTo,
  infallOffset,
  nextReplaySpeed,
  notesThisWeek,
  readVisit,
  replaySpeedLabel,
  shouldFlare,
  showerPageIds,
  writeVisit,
} from "./universeTime";

const V = TOPIC_VOCABULARY;

function page(id: string, tags: string[], created_at?: string, connected?: string[]): PageManifestEntry {
  return { id, title: `Title ${id}`, area: "notes", tags, excerpt: "", ...(created_at ? { created_at } : {}), ...(connected ? { connected } : {}) };
}

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe("parallax sky", () => {
  it("is deterministic and keeps every star inside its tile", () => {
    const a = buildSkyLayers();
    const b = buildSkyLayers();
    expect(a.map(layer => layer.stars.length)).toEqual([520, 260, 90]);
    expect(a[0]!.stars[3]).toEqual(b[0]!.stars[3]);
    for (const layer of a) {
      for (const star of layer.stars) {
        expect(star.x).toBeGreaterThanOrEqual(0);
        expect(star.x).toBeLessThan(SKY_TILE);
        expect(star.y).toBeGreaterThanOrEqual(0);
        expect(star.y).toBeLessThan(SKY_TILE);
      }
    }
  });

  it("spreads stars across the sky instead of lining them up", () => {
    const stars = buildSkyLayers()[0]!.stars;
    const cells = new Set(stars.map(p => `${Math.floor((p.x / SKY_TILE) * 16)}:${Math.floor((p.y / SKY_TILE) * 16)}`));
    expect(cells.size / 256).toBeGreaterThan(0.6);
  });

  it("draws saved constellations small, from their own template and sky placement", () => {
    const saved = {
      symbol: { templateId: "bridge", label: "Bridge", meaning: "" },
      notes: Array.from({ length: 6 }, (_, i) => ({ pageId: `p${i}`, title: "t", excerpt: "", role: "r" })),
      sky: { x: 0.5, y: 0.5, rotation: 0, scale: 1 },
    } as unknown as SavedConstellation;
    const [figure] = skyFigures([saved]);
    expect(figure!.points).toHaveLength(6);
    expect(figure!.segments.length).toBeGreaterThan(0);
    const xs = figure!.points.map(p => p.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(60);
    expect(xs.every(x => Math.abs(x - SKY_TILE / 2) < 40)).toBe(true);
  });
});

describe("comets", () => {
  const entries = [
    ...Array.from({ length: 30 }, (_, i) => page(`a${i}`, [V[0]!, V[1]!, V[2]!])),
    ...Array.from({ length: 4 }, (_, i) => page(`b${i}`, [V[3]!, V[4]!, V[5]!])),
    page("rare", [V[0]!, V[4]!, V[6]!]),
    ...Array.from({ length: 10 }, (_, i) => page(`c${i}`, [V[6]!])),
    ...Array.from({ length: 10 }, (_, i) => page(`d${i}`, [V[1]!, V[3]!])),
  ];
  const model = buildSolarModel(entries);

  it("only picks notes that span three planets, one per combination", () => {
    const picked = selectCometNotes(entries, model);
    expect(picked.length).toBe(3);
    expect(picked.every(item => item.planets.length === 3)).toBe(true);
    const keys = picked.map(item => [...item.planets].sort().join());
    expect(new Set(keys).size).toBe(keys.length);
    expect(picked[0]!.entry.id).toBe("rare");
  });

  it("caps the sky at twenty comets", () => {
    const many = V.slice(0, 12).flatMap((a, i) =>
      V.slice(i + 1, 12).flatMap(b => [page(`x-${a}-${b}`, [a, b, V[(i + 5) % 12]!])]),
    );
    const big = buildSolarModel(many);
    expect(buildComets(many, big).length).toBeLessThanOrEqual(COMET_LIMIT);
  });

  it("whips round the Hub: closest at perihelion, farthest at aphelion", () => {
    const comet = { a: 1000, e: 0.7, w: 0, m0: 0, period: 100 };
    const peri = cometOffset(comet, 0);
    const aph = cometOffset(comet, 50);
    expect(Math.hypot(peri.x, peri.y)).toBeCloseTo(300, 0);
    expect(Math.hypot(aph.x, aph.y)).toBeGreaterThan(1500);
    expect(cometMeanAnomaly(comet, 99.9)).toBeGreaterThan(6);
    expect(cometMeanAnomaly(comet, 100.1)).toBeLessThan(0.1);
  });
});

describe("light bridges", () => {
  it("locks one chevron per connection, at most seven, then opens the gate", () => {
    expect(dialPhase(0, 3).locked).toBe(0);
    expect(dialPhase(CHEVRON_MS * 2 + 1, 3)).toMatchObject({ locked: 2, kawoosh: -1, bridgeAlpha: 0 });
    const open = dialPhase(CHEVRON_MS * 3 + 150 + 400, 3);
    expect(open.locked).toBe(3);
    expect(open.kawoosh).toBeCloseTo(0.5);
    expect(dialPhase(CHEVRON_MS * 20, 12).locked).toBe(MAX_LOCKS);
    expect(dialPhase(0, 4, true)).toEqual({ locked: 4, kawoosh: 1, bridgeAlpha: 1 });
  });

  it("resolves connected notes to bodies once, skipping itself and unknown ids", () => {
    const bodies = new Map([
      ["a", 1],
      ["b", 2],
      ["c", 3],
    ]);
    expect(bridgeTargets(["b", "x", "b", "a", "c"], 1, bodies)).toEqual([2, 3]);
    expect(bridgeTargets(undefined, 1, bodies)).toEqual([]);
  });
});

describe("rare alignment", () => {
  const planet = (idx: number, phase: number): Body =>
    ({ idx, id: `p${idx}`, kind: "planet", label: "", parent: 0, count: 1, r: 5, sysR: 5, a: 500 + idx * 100, phase, period: 0, e: 0, argP: 0, incline: 0, color: "", ink: "", children: [] }) as Body;

  it("finds three planets on one line through the Hub, including opposite sides", () => {
    const planets = [planet(1, 0.3), planet(2, 0.3 + Math.PI), planet(3, 0.305), planet(4, 2)];
    expect(alignedTriple(planets, 0)?.sort()).toEqual([1, 2, 3]);
  });

  it("stays quiet when nothing lines up", () => {
    expect(alignedTriple([planet(1, 0), planet(2, 1), planet(3, 2)], 0)).toBeNull();
  });
});

describe("timeline and visits", () => {
  const today = Date.UTC(2026, 9, 4, 12);
  const todayDay = Math.floor(today / DAY_MS);
  const iso = (daysAgo: number) => new Date(today - daysAgo * DAY_MS).toISOString();
  const entries = [
    page("old", [V[0]!], iso(400)),
    page("mid", [V[0]!], iso(30)),
    page("new", [V[1]!], iso(2)),
    page("undated", [V[1]!]),
    page("loose", [], iso(1)),
  ];
  const model = buildSolarModel(entries);

  it("dates every note, putting undated ones at the first known day", () => {
    const t = buildTimeline(model, entries, todayDay);
    const bodyOf = (id: string) => model.bodies.find(b => b.pageId === id)!.idx;
    expect(t.minDay).toBe(todayDay - 400);
    expect(t.day[bodyOf("undated")]).toBe(t.minDay);
    expect(t.undated).toBe(1);
    expect(t.firstDay[model.sun.idx]).toBe(t.minDay);
    expect(t.dayLists[model.sun.idx]).toHaveLength(5);
    expect(countUpTo(t.dayLists[model.sun.idx]!, todayDay - 30)).toBe(3);
  });

  it("starts infall at the dust and ends exactly on the note", () => {
    const dust = { x: 3000, y: 0 };
    const target = { x: 0, y: 400 };
    expect(infallOffset(dust, target, 0)).toEqual({ x: 3000, y: 0 });
    const end = infallOffset(dust, target, 1);
    expect(end.x).toBeCloseTo(0);
    expect(end.y).toBeCloseTo(400);
    const mid = infallOffset(dust, target, 0.3);
    expect(Math.hypot(mid.x, mid.y)).toBeGreaterThan(2000);
  });

  it("remembers the last visit, rocks and flare day, and survives bad storage", () => {
    const storage = memoryStorage();
    expect(readVisit(storage)).toEqual({ lastVisit: null, rocks: [], flaredDay: null });
    writeVisit({ lastVisit: 5, rocks: ["x"], flaredDay: 9 }, storage);
    expect(readVisit(storage)).toEqual({ lastVisit: 5, rocks: ["x"], flaredDay: 9 });
    storage.setItem("kh-universe-visit", "{oops");
    expect(readVisit(storage).rocks).toEqual([]);
    expect(readVisit(null).lastVisit).toBeNull();
  });

  it("showers only notes added since the last visit, oldest first, capped", () => {
    expect(showerPageIds(entries, today - 3 * DAY_MS, today)).toEqual(["new", "loose"]);
    expect(showerPageIds(entries, null, today)).toEqual(["new", "loose"]);
    expect(showerPageIds(entries, today - 500 * DAY_MS, today, 2)).toEqual(["new", "loose"]);
  });

  it("counts this week's notes and flares once on a capture day", () => {
    expect(notesThisWeek(entries, today)).toBe(2);
    const withToday = [...entries, page("now", [V[0]!], new Date(today - 1000).toISOString())];
    expect(shouldFlare(withToday, today, null)).toBe(true);
    expect(shouldFlare(withToday, today, todayDay)).toBe(false);
    expect(shouldFlare(entries, today, null)).toBe(false);
  });

  it("notices a rock that has since been tagged onto a planet", () => {
    expect(capturedRocks(["loose", "old", "gone"], model)).toEqual(["old"]);
  });
});

describe("chimes", () => {
  it("plays a pentatonic scale and spaces ambient notes by level", () => {
    expect(noteFrequency(0)).toBeCloseTo(261.63);
    expect(noteFrequency(5)).toBeCloseTo(523.26);
    expect(ambientDelay(1, 0)).toBe(9000);
    expect(ambientDelay(3, 1)).toBe(3800);
    expect(ambientDelay(0, 0.5)).toBe(Infinity);
  });

  it("stores sound prefs with sound off by default", () => {
    const storage = memoryStorage();
    expect(readSoundPrefs(storage)).toEqual({ on: false, ambient: 2 });
    writeSoundPrefs({ on: true, ambient: 3 }, storage);
    expect(readSoundPrefs(storage)).toEqual({ on: true, ambient: 3 });
  });
});

describe("camera", () => {
  it("glides from one framing to another and lands exactly", () => {
    const glide = startGlide({ k: 1, cx: 0, cy: 0 }, { k: 4, cx: 100, cy: 50 }, 0, 800, 1000);
    expect(glideAt(glide, 0)).toMatchObject({ k: 1, cx: 0, cy: 0, done: false });
    const end = glideAt(glide, 1000);
    expect(end.done).toBe(true);
    expect(end.k).toBeCloseTo(4);
    expect(end.cx).toBeCloseTo(100);
  });

  it("lets a flick coast and settle", () => {
    const v = decayInertia({ vx: 1, vy: -1 }, 16);
    expect(v.vx).toBeCloseTo(0.93);
    expect(decayInertia(v, 1600).vx).toBeLessThan(0.01);
  });

  it("magnifies under the pointer and leaves the rim and beyond untouched", () => {
    const p = { x: 100, y: 100 };
    const [x, , size] = lensMap(130, 100, p);
    expect(x).toBeGreaterThan(130);
    expect(size).toBeGreaterThan(1);
    const rim = lensMap(100 + LENS_RADIUS - 0.01, 100, p);
    expect(rim[0]).toBeCloseTo(100 + LENS_RADIUS, 1);
    expect(rim[2]).toBeCloseTo(1, 2);
    expect(lensMap(400, 100, p)).toEqual([400, 100, 1]);
    expect(lensMap(130, 100, null)).toEqual([130, 100, 1]);
  });
});

describe("Big Bang replay speeds", () => {
  it("cycles ×1 → ×4 → ×12 → ×¼ and back, so the slowest is four times slower than ×1", () => {
    const seen = [1];
    for (let i = 0; i < 4; i++) seen.push(nextReplaySpeed(seen.at(-1)!));
    expect(seen).toEqual([1, 4, 12, 0.25, 1]);
    expect(seen.map(replaySpeedLabel)).toEqual(["×1", "×4", "×12", "×¼", "×1"]);
  });
});
