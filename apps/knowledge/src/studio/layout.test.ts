import { describe, expect, it } from "vitest";
import { constellationLayout } from "./layout";
import { parseStudioData } from "./schema";

const data = parseStudioData({
  schema_version: 1,
  notes: Object.fromEntries(["a", "b", "c"].map(k => [k, { title: k, words: 100, in_knowledge: true }])),
  books: [
    { id: "one", title: "One", short: "One", area: "gifted", added: "2025-10-20", kind: "chapters", notes: ["a", "b", "c"] },
    { id: "two", title: "Two", short: "Two", area: "gifted", added: "2025-10-20", kind: "chapters", notes: ["a", "b", "c"], cites_books: ["one"] },
    { id: "studio", title: "Studio", short: "Studio", area: "teachers", added: "2026-01-05", kind: "interview", audience: ["Primary Teachers"], subjects: ["Pedagogy"], interview: { questions: [], cast: [] } },
    { id: "borrow", title: "Borrow", short: "Borrow", area: "teachers", added: "2026-06-04", kind: "blank", audience: ["Primary Teachers"], subjects: ["Pedagogy"] },
  ],
});

describe("constellation layout", () => {
  it("joins shared research, citations and look-alike ideas", () => {
    const { edges } = constellationLayout(data);
    expect(edges.map(e => e.kind).sort()).toEqual(["cite", "share", "twin"]);
    expect(edges.find(e => e.kind === "share")!.weight).toBe(3);
  });

  it("keeps every node inside the stage and is deterministic", () => {
    const a = constellationLayout(data);
    const b = constellationLayout(data);
    expect(a.nodes.map(n => [n.x, n.y])).toEqual(b.nodes.map(n => [n.x, n.y]));
    for (const n of a.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(80);
      expect(n.x).toBeLessThanOrEqual(a.width - 80);
      expect(n.y).toBeGreaterThanOrEqual(40);
      expect(n.y).toBeLessThanOrEqual(a.height - 56);
    }
  });
});
