// src/shelf/crossingsSvg.test.ts
import { describe, expect, it } from "vitest";
import { borderRoadSvg, bridgeSvg } from "./crossingsSvg";

describe("crossing drawings", () => {
  it("draws a rope bridge as two ropes with planks, and a stone bridge as a deck on arches", () => {
    const rope = bridgeSvg("rope", { x: 0, y: 0 }, { x: 100, y: 0 }, 4);
    expect(rope.match(/map-bridge__rope/g)).toHaveLength(2);
    expect((rope.match(/map-bridge__plank/g) ?? []).length).toBeGreaterThan(5);
    const stone = bridgeSvg("stone", { x: 0, y: 0 }, { x: 100, y: 0 }, 4, " is-on");
    expect(stone).toContain("map-bridge--stone is-on");
    expect(stone.match(/map-bridge__deck/g)).toHaveLength(1);
    expect((stone.match(/map-bridge__arch/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("draws a border road with a town at each end", () => {
    const road = borderRoadSvg({ x: 0, y: 0 }, { x: 80, y: 20 }, 4);
    expect(road.match(/map-road__town/g)).toHaveLength(2);
    expect(road).toContain("map-road__line");
  });
});
