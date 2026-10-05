// src/shelf/islandShape.test.ts
import { describe, expect, it } from "vitest";
import { SEA_LEVEL, islandShape, landFor, neckLand, reachAt, shapeHeight, shoreAt } from "./islandShape";

const keys = ["make it stick", "peak", "discourses", "range", "neuroscience: exploring the brain", "a", "b", "c", "d", "e", "f", "g"];

describe("islandShape", () => {
  it("is the same for the same book and different between books", () => {
    expect(islandShape("peak")).toEqual(islandShape("peak"));
    expect(islandShape("peak")).not.toEqual(islandShape("range"));
  });

  it("is roughly round: no sausages", () => {
    for (const key of keys) {
      const shape = islandShape(key);
      const reach = Array.from({ length: 72 }, (_, i) => reachAt(shape, (i / 72) * Math.PI * 2));
      expect(Math.min(...reach)).toBeGreaterThan(0.6);
      expect(Math.max(...reach)).toBeLessThan(1.3);
      expect(Math.max(...reach) / Math.min(...reach)).toBeLessThan(1.9);
    }
  });

  it("puts the shore where the land meets the sea", () => {
    const shape = islandShape("peak");
    const p = shoreAt(shape, 1);
    expect(shapeHeight(shape.base, p.x * 0.97, p.y * 0.97)).toBeGreaterThan(SEA_LEVEL);
    expect(shapeHeight(shape.base, p.x * 1.03, p.y * 1.03)).toBeLessThan(SEA_LEVEL);
  });

  it("keeps islets offshore", () => {
    for (const key of keys) for (const s of islandShape(key).islets) expect(Math.hypot(s.x, s.y)).toBeGreaterThan(1.15);
  });
});

describe("landFor", () => {
  it("places the shape in world space, scaled, voting for its book unless told not to", () => {
    const shape = islandShape("peak");
    const land = landFor(shape, 100, 200, 50, "peak");
    const first = shape.base[0]!;
    expect(land[0]).toMatchObject({ province: "peak", x: 100 + first.x * 50, y: 200 + first.y * 50, sigma: first.sigma * 50, vote: true });
    expect(land).toHaveLength(shape.base.length + shape.islets.length);
    expect(landFor(shape, 0, 0, 1, "peak", false).every(l => l.vote === false)).toBe(true);
  });
});

describe("neckLand", () => {
  it("fills the strait between two shores with land, half for each book, water either side", () => {
    const neck = neckLand({ x: 0, y: 0 }, { x: 40, y: 0 }, 50, "a", "b");
    expect(neck.map(n => n.province)).toEqual(["a", "b"]);
    expect(shapeHeight(neck, 20, 0)).toBeGreaterThan(SEA_LEVEL);
    expect(shapeHeight(neck, 20, 45)).toBeLessThan(SEA_LEVEL);
  });
});
