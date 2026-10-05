import { describe, expect, it } from "vitest";
import { relaxKey, relaxNeural } from "./showAllRelax";

const nodes = [
  { id: "a", x: 0, y: 0 },
  { id: "b", x: 10, y: 0 },
  { id: "c", x: 0, y: 10 },
];
const links = [
  { source: "a", target: "b", backbone: true },
  { source: "b", target: "c", backbone: false },
];

describe("neural relax", () => {
  it("returns finite x,y pairs in node order", () => {
    const out = relaxNeural(nodes, links);
    expect(out).toHaveLength(6);
    expect([...out].every(Number.isFinite)).toBe(true);
  });

  it("keys the cache on seed, links and shape", () => {
    const key = relaxKey(nodes, links, { spread: 1, gather: 1 });
    expect(relaxKey(nodes, links, { spread: 1, gather: 1 })).toBe(key);
    expect(relaxKey(nodes, links, { spread: 1.2, gather: 1 })).not.toBe(key);
    expect(relaxKey(nodes, links.slice(0, 1), { spread: 1, gather: 1 })).not.toBe(key);
    expect(relaxKey([{ ...nodes[0]!, x: 5 }, ...nodes.slice(1)], links, { spread: 1, gather: 1 })).not.toBe(key);
  });
});
