import { describe, expect, it } from "vitest";
import { annualSkyRotation } from "./canvas";

describe("annual Stars sky rotation", () => {
  it("moves approximately one quarter turn through one quarter of the year", () => {
    const start = annualSkyRotation(new Date("2026-01-01T00:00:00Z"));
    const april = annualSkyRotation(new Date("2026-04-02T06:00:00Z"));
    expect(start).toBe(0);
    expect(april).toBeCloseTo(Math.PI / 2, 1);
  });
});
