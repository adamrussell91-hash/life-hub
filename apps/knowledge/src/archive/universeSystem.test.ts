import { describe, expect, it } from "vitest";
import type { PageManifestEntry } from "../domain/page";
import { TOPIC_VOCABULARY } from "../tidy/vocabulary";
import { buildSolarModel } from "./solarModel";
import {
  clearEdgePoint,
  edgePoint,
  notesLabel,
  orreryOrder,
  planetByline,
  planetTip,
  readOrreryOpen,
  readReplayFolded,
  subtreeEnd,
  systemCounts,
  systemExits,
  systemPlanetScale,
  writeOrreryOpen,
  writeReplayFolded,
} from "./universeSystem";

function entries(spec: Array<[string, number]>): PageManifestEntry[] {
  return spec.flatMap(([tag, n], t) =>
    Array.from({ length: n }, (_, i) => ({ id: `t${t}-${i}`, title: `${tag} ${i}`, area: "notes" as const, tags: [tag], excerpt: "" })),
  );
}

function memory() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
}

const [V0, V1, V2] = TOPIC_VOCABULARY;

describe("orrery order and counts", () => {
  const model = buildSolarModel(entries([[V0!, 30], [V1!, 12], [V2!, 5]]));

  it("lists planets innermost first", () => {
    const order = orreryOrder(model);
    expect(order).toHaveLength(model.planets.length);
    for (let i = 1; i < order.length; i++) expect(order[i]!.a).toBeGreaterThanOrEqual(order[i - 1]!.a);
  });

  it("counts a system's notes from its own subtree, and the counts add up to every tagged note", () => {
    let total = 0;
    for (const planet of model.planets) {
      const end = subtreeEnd(model.bodies, planet.idx);
      const pages = model.bodies.slice(planet.idx + 1, end).filter(body => body.kind === "page").length;
      expect(systemCounts(model.bodies, planet.idx).notes).toBe(pages);
      total += pages;
    }
    expect(total).toBe(47);
  });

  it("writes hover tips and bylines a person would", () => {
    const mnemosyne = model.planets.find(planet => planet.label === V0)!;
    expect(planetTip(mnemosyne, 30)).toBe(`Mnemosyne · ${V0} · 30 notes`);
    expect(notesLabel(1)).toBe("1 note");
    expect(planetByline(V0!)).toBe("Greek · Titaness of memory, mother of the Muses");
    expect(planetByline("Nothing")).toBe("");
  });

  it("draws the centre planet bigger in its system but never over its closest moon", () => {
    for (const planet of model.planets) {
      const scale = systemPlanetScale(planet);
      expect(scale).toBeGreaterThanOrEqual(1);
      expect(scale).toBeLessThanOrEqual(2.2);
      for (const child of planet.children) {
        const closest = child.a * (1 - child.e) * (1 - Math.min(child.incline, 0.85) * 0.42) - child.sysR;
        expect(planet.r * scale).toBeLessThanOrEqual(Math.max(planet.r, closest));
      }
    }
  });
});

describe("link arrows on the stage edge", () => {
  it("lands on the edge, held inside by the inset", () => {
    expect(edgePoint(400, 300, 1, 0, 800, 600, 50)).toMatchObject({ x: 750, y: 300 });
    expect(edgePoint(400, 300, 0, -1, 800, 600, 50)).toMatchObject({ x: 400, y: 50 });
    const corner = edgePoint(400, 300, 1, 1, 800, 600, 50);
    expect(corner.y).toBe(550);
    expect(corner.x).toBeCloseTo(650);
  });

  it("stops short of a panel in the way", () => {
    const toolbar = { left: 0, top: 0, right: 800, bottom: 120 };
    const at = clearEdgePoint(400, 400, 0, -1, 800, 600, 50, [toolbar]);
    expect(at.y).toBeGreaterThan(120);
    const free = clearEdgePoint(400, 400, 0, 1, 800, 600, 50, [toolbar]);
    expect(free.y).toBe(550);
  });

  it("never sits on the planet even when a panel is right beside it", () => {
    const at = clearEdgePoint(400, 300, 1, 0, 800, 600, 50, [{ left: 410, top: 0, right: 800, bottom: 600 }]);
    expect(at.x).toBeGreaterThanOrEqual(472);
  });

  it("groups links leaving the system by the system they land in, biggest first", () => {
    const model = buildSolarModel(entries([[V0!, 6], [V1!, 6], [V2!, 6]]));
    const planetOf = new Int32Array(model.bodies.length).fill(-1);
    for (const body of model.bodies) {
      if (body.kind === "planet") planetOf[body.idx] = body.idx;
      else if (body.parent >= 0 && planetOf[body.parent]! >= 0) planetOf[body.idx] = planetOf[body.parent]!;
    }
    const home = model.planets.find(planet => planet.label === V0)!.idx;
    const pagesOf = (tag: string) => model.bodies.filter(body => body.kind === "page" && model.bodies[planetOf[body.idx]!]?.label === tag).map(body => body.idx);
    const targets = [...pagesOf(V0!).slice(0, 2), ...pagesOf(V1!).slice(0, 1), ...pagesOf(V2!).slice(0, 2)];
    const exits = systemExits(targets, planetOf, model.bodies, home);
    expect(exits.map(exit => [exit.label, exit.targets.length])).toEqual([
      ["Athena", 2],
      ["Sophrosyne", 1],
    ]);
  });
});

describe("remembered choices", () => {
  it("remembers the drawer and the folded Big Bang bar, and survives storage that throws", () => {
    const store = memory();
    expect(readOrreryOpen(store)).toBe(false);
    writeOrreryOpen(true, store);
    expect(readOrreryOpen(store)).toBe(true);
    writeReplayFolded(true, store);
    expect(readReplayFolded(store)).toBe(true);
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readReplayFolded(broken)).toBe(false);
    expect(() => writeOrreryOpen(true, broken)).not.toThrow();
    expect(readOrreryOpen(null)).toBe(false);
  });
});
