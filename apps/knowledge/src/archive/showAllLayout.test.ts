import { describe, expect, it } from "vitest";
import type { GraphNodeDatum } from "./keywordGraph";
import { applyShowAllMorph, easeInOutCubic, planShowAllMorph, tweenView } from "./showAllLayout";

function node(partial: Partial<GraphNodeDatum> & Pick<GraphNodeDatum, "id">): GraphNodeDatum {
  return {
    kind: "leaf",
    label: partial.id,
    count: 1,
    color: "#7eb0d5",
    soft: "rgba(126, 176, 213, 0.7)",
    ink: "#315875",
    r: 5,
    x: 0,
    y: 0,
    ...partial,
  };
}

describe("Show All morph", () => {
  it("glides kept notes from where they are to where they are going", () => {
    const before = [node({ id: "a", x: 0, y: 0 })];
    const after = [node({ id: "a", x: 100, y: 200 })];
    const morph = planShowAllMorph(before, after);
    expect(after[0]!.x).toBe(0);
    expect(after[0]!.opacity).toBe(1);
    applyShowAllMorph(morph, 0.5);
    expect(after[0]!.x).toBeCloseTo(50, 5);
    expect(after[0]!.fx).toBe(after[0]!.x);
    applyShowAllMorph(morph, 1);
    expect(after[0]!.x).toBe(100);
    expect(after[0]!.y).toBe(200);
  });

  it("fades new notes in at their final spot and old notes out where they stand", () => {
    const before = [node({ id: "old", x: 5, y: 6 })];
    const after = [node({ id: "new", x: 300, y: 400 })];
    const morph = planShowAllMorph(before, after);
    const ghost = morph.nodes.find(item => item.id === "old")!;
    expect(ghost.departing).toBe(true);
    expect(after[0]!.x).toBe(300);
    expect(after[0]!.opacity).toBe(0);
    applyShowAllMorph(morph, 0.5);
    expect(ghost.x).toBe(5);
    expect(ghost.opacity).toBeGreaterThan(0);
    expect(ghost.opacity).toBeLessThan(1);
    const done = applyShowAllMorph(morph, 1);
    expect(done.map(item => item.id)).toEqual(["new"]);
    expect(done[0]!.opacity).toBe(1);
  });

  it("does not mutate the notes that were on screen", () => {
    const before = [node({ id: "a", x: 1, y: 2 })];
    const morph = planShowAllMorph(before, [node({ id: "a", x: 50, y: 50 })]);
    applyShowAllMorph(morph, 1);
    expect(before[0]!.x).toBe(1);
  });

  it("eases the camera smoothly, zooming in log space", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    const from = { x: 0, y: 0, k: 0.25 };
    const to = { x: 100, y: 100, k: 1 };
    expect(tweenView(from, to, 0)).toEqual(from);
    expect(tweenView(from, to, 1).k).toBeCloseTo(1, 10);
    expect(tweenView(from, to, 0.5).k).toBeCloseTo(0.5, 5);
  });
});
