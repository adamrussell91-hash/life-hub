// src/shelf/atlasTerrain.test.ts
import { describe, expect, it } from "vitest";
import type { AtlasModel, AtlasTown } from "./atlasLayout";
import { terrainField } from "./atlasTerrain";
import { SEA_LEVEL, islandShape, landFor } from "./islandShape";

const shape = islandShape("peak");
function model(over: Partial<AtlasModel> = {}): AtlasModel {
  return {
    width: 2000, height: 2000, bounds: { x: 0, y: 0, w: 2000, h: 2000 }, source: "themes",
    provinces: [{ id: "peak", label: "Peak", x: 1000, y: 1000, radius: 60, explored: true, colour: 0 }],
    towns: [], roads: [], routes: [], fogs: [], land: landFor(shape, 1000, 1000, 100, "peak"),
    ...over,
  };
}
const town = (id: string, x: number, y: number): AtlasTown =>
  ({ note: { id } as AtlasTown["note"], province: "peak", x, y, size: 6, peak: true, faded: false, isNew: false, themes: [] });
const bearings = Array.from({ length: 24 }, (_, i) => (i / 24) * Math.PI * 2);
function coastAlong(field: ReturnType<typeof terrainField>, cx: number, cy: number, angle: number, zoom = 1) {
  for (let r = 1; r < 400 * zoom; r += 1) if (field(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r).e < SEA_LEVEL) return r;
  return Infinity;
}

describe("terrainField", () => {
  it("draws the coast from the island's shape alone: notes raise hills but never move the shore", () => {
    const bare = terrainField(model());
    const settled = terrainField(model({ towns: [town("a", 1000, 1000), town("b", 1040, 990), town("c", 960, 1030), town("d", 1060, 1050)] }));
    for (const a of bearings) expect(coastAlong(settled, 1000, 1000, a)).toBe(coastAlong(bare, 1000, 1000, a));
    expect(settled(1000, 1000).e).toBeGreaterThan(bare(1000, 1000).e);
  });

  it("draws the same coast at any zoom when the frame maps back to the same place", () => {
    const k = 3.5;
    const near = terrainField(model());
    const zoomed = terrainField(model({
      width: 2000 * k, height: 2000 * k,
      provinces: [{ id: "peak", label: "Peak", x: 1000 * k, y: 1000 * k, radius: 60 * k, explored: true, colour: 0 }],
      land: landFor(shape, 1000 * k, 1000 * k, 100 * k, "peak"),
      frame: { unit: k, ox: 0, oy: 0 },
    }));
    for (const a of bearings) expect(Math.abs(coastAlong(zoomed, 1000 * k, 1000 * k, a, k) / k - coastAlong(near, 1000, 1000, a))).toBeLessThanOrEqual(1.5);
  });

  it("lets land shape the coast without claiming colour when it doesn't vote", () => {
    const field = terrainField(model({
      provinces: [
        { id: "west", label: "West", x: 960, y: 1000, radius: 60, explored: true, colour: 0 },
        { id: "east", label: "East", x: 1040, y: 1000, radius: 60, explored: true, colour: 1 },
      ],
      land: landFor(shape, 1000, 1000, 100, "peak", false),
    }));
    expect(field(950, 1000).region).toBe(0);
    expect(field(1050, 1000).region).toBe(1);
  });
});
