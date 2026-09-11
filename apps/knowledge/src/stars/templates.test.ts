import { describe, expect, it } from "vitest";
import { buildStarsLayout, templateForQuery } from "./templates";

describe("Stars symbol templates", () => {
  it("keeps every supported note count inside normalized bounds", () => {
    for (const id of ["eye", "bridge", "cycle", "spiral", "tree", "compass"] as const) {
      for (let count = 5; count <= 10; count += 1) {
        const layout = buildStarsLayout(id, count);
        expect(layout.points).toHaveLength(count);
        expect(layout.segments.length).toBeGreaterThanOrEqual(count - 1);
        expect(layout.points.every(point => point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1)).toBe(true);
        expect(layout.segments.every(segment => segment.source < count && segment.target < count)).toBe(true);
      }
    }
  });

  it("chooses an eye for reading and a compass for leadership", () => {
    expect(templateForQuery("models of reading")).toBe("eye");
    expect(templateForQuery("leadership under uncertainty")).toBe("compass");
  });
});
