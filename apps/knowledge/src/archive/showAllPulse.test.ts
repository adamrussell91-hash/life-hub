import { describe, expect, it } from "vitest";
import type { GraphLinkDatum, GraphNodeDatum } from "./keywordGraph";
import { headAt, quadPoint, routeHops, signalLength, sparkEchoes, sparkSeeds, spreadSpark, subQuad, thoughtWords } from "./showAllPulse";

function leaf(id: string, label: string, extra: Partial<GraphNodeDatum> = {}): GraphNodeDatum {
  return { id, kind: "leaf", label, count: 1, color: "#5b8ec8", soft: "", ink: "", r: 3, x: 0, y: 0, ...extra };
}
function link(a: string, b: string, weight = 1): GraphLinkDatum {
  return { source: a, target: b, kind: "backbone", weight, color: "" };
}

describe("curves", () => {
  const q = { p0: { x: 0, y: 0 }, c: { x: 50, y: 100 }, p2: { x: 100, y: 0 } };
  it("a sub-curve starts and ends on the original curve and keeps its shape", () => {
    const piece = subQuad(q, 0.25, 0.75);
    expect(piece.p0).toEqual(quadPoint(q, 0.25));
    expect(piece.p2).toEqual(quadPoint(q, 0.75));
    const mid = quadPoint(piece, 0.5);
    const original = quadPoint(q, 0.5);
    expect(mid.x).toBeCloseTo(original.x);
    expect(mid.y).toBeCloseTo(original.y);
  });
});

describe("signals", () => {
  it("runs a route hop after hop, resting between", () => {
    const hops = routeHops(["a", "b", "c"], 100, 20);
    expect(hops.map(hop => [hop.from, hop.to, hop.start])).toEqual([
      ["a", "b", 0],
      ["b", "c", 120],
    ]);
    expect(signalLength(hops)).toBe(220);
    expect(headAt(hops, 50)?.hop.to).toBe("b");
    expect(headAt(hops, 110)).toBeNull();
    expect(headAt(hops, 170)?.hop.to).toBe("c");
  });
});

describe("spark", () => {
  const year = 365 * 86_400_000;
  const now = Date.parse("2026-10-05");
  const nodes = [
    leaf("a", "Feedback that moves learning"),
    leaf("b", "Wiliam on formative assessment", { createdAt: new Date(now - 3 * year).toISOString() }),
    leaf("c", "Retrieval practice", { createdAt: new Date(now - 30 * 86_400_000).toISOString() }),
    leaf("d", "Sourdough starter"),
  ];
  const links = [link("a", "b", 3), link("b", "c", 2), link("c", "d", 0.1)];

  it("ignores stop words and short words", () => {
    expect(thoughtWords("How does the feedback work?")).toEqual(["feedback", "work"]);
  });

  it("lands on the notes that mention the thought", () => {
    expect(sparkSeeds(nodes, "feedback", () => "")).toEqual(["a"]);
    expect(sparkSeeds(nodes, "bread", node => (node.id === "d" ? "bread" : ""))).toEqual(["d"]);
    expect(sparkSeeds(nodes, "the", () => "")).toEqual([]);
  });

  it("spreads along links, fading each hop, and stops when too faint", () => {
    const spark = spreadSpark(links, ["a"], { decay: 0.6, floor: 0.2 });
    expect(spark.level.get("a")).toBe(1);
    expect(spark.level.get("b")).toBeCloseTo(0.6);
    expect(spark.level.get("c")!).toBeLessThan(spark.level.get("b")!);
    expect(spark.level.has("d")).toBe(false);
    expect(spark.litAt.get("c")!).toBeGreaterThan(spark.litAt.get("b")!);
    expect(spark.hops.map(hop => hop.to)).toEqual(["b", "c"]);
  });

  it("names what came back, flagging notes written over a year ago", () => {
    const spark = spreadSpark(links, ["a"]);
    const echoes = sparkEchoes(nodes, spark, ["a"], now);
    expect(echoes[0]).toMatchObject({ id: "b", forgotten: true });
    expect(echoes.find(echo => echo.id === "c")?.forgotten).toBe(false);
    expect(echoes.some(echo => echo.id === "a")).toBe(false);
  });
});

describe("echoes", () => {
  it("leaves out notes whose titles already say the thought", () => {
    const nodes = [leaf("a", "Feedback one"), leaf("b", "More feedback"), leaf("c", "Retrieval")];
    const links = [link("a", "b", 2), link("a", "c", 1)];
    const spark = spreadSpark(links, ["a"]);
    expect(sparkEchoes(nodes, spark, ["a"], Date.now(), 8, ["feedback"]).map(echo => echo.id)).toEqual(["c"]);
  });
});
