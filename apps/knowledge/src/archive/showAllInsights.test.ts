import { describe, expect, it } from "vitest";
import type { GraphLinkDatum, GraphNodeDatum } from "./keywordGraph";
import {
  grownBy,
  growthSpan,
  isRecent,
  keyBridges,
  missingLinks,
  shortestNotePath,
  topicRepresentative,
  walkRoute,
} from "./showAllInsights";

function leaf(id: string, topic: string, extra: Partial<GraphNodeDatum> = {}): GraphNodeDatum {
  return { id, kind: "leaf", label: `Note ${id}`, count: 1, color: "#5b8ec8", soft: "", ink: "", r: 3, parentKeyword: topic, x: 0, y: 0, ...extra };
}
function hub(label: string, count: number): GraphNodeDatum {
  return { id: `major:${label}`, kind: "major", label, count, color: "#5b8ec8", soft: "", ink: "", r: 16, x: 0, y: 0 };
}
function link(a: string, b: string, weight = 1, kind: GraphLinkDatum["kind"] = "backbone"): GraphLinkDatum {
  return { source: a, target: b, kind, weight, color: "" };
}

// A — B — C — D chain in topic T1, D links into E (T2), F (T3) dangles off E.
const nodes = [
  hub("T1", 4),
  hub("T2", 1),
  hub("T3", 1),
  hub("T4", 1),
  leaf("A", "T1"),
  leaf("B", "T1"),
  leaf("C", "T1"),
  leaf("D", "T1"),
  leaf("E", "T2"),
  leaf("F", "T3"),
  leaf("G", "T4"),
];
const links = [link("A", "B"), link("B", "C"), link("C", "D"), link("D", "E"), link("E", "F"), link("A", "D", 0.1, "overlap")];

describe("how X connects to Y", () => {
  it("finds the chain of linked notes, preferring strong links", () => {
    expect(shortestNotePath(links, "A", "F")).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(shortestNotePath([...links, link("A", "D", 5, "overlap")], "A", "D")).toEqual(["A", "D"]);
  });

  it("returns nothing when two notes never meet", () => {
    expect(shortestNotePath(links, "A", "G")).toEqual([]);
    expect(shortestNotePath(links, "A", "A")).toEqual(["A"]);
  });

  it("picks a topic's best-linked note to stand for it", () => {
    expect(topicRepresentative(nodes, "T1", links)?.id).toBe("D");
  });
});

describe("key bridges and missing links", () => {
  it("ranks notes that reach into other topics", () => {
    const bridges = keyBridges(nodes, links);
    expect(bridges[0]?.id).toBe("E");
    expect(bridges[0]?.topics).toEqual(["T1", "T3"]);
  });

  it("finds topics tagged together whose notes never link", () => {
    const found = missingLinks(nodes, links, [
      { a: "T1", b: "T2", weight: 3 },
      { a: "T1", b: "T4", weight: 2 },
    ]);
    expect(found[0]).toEqual({ a: "T1", b: "T4", shared: 2 });
    expect(found.some(item => item.a === "T1" && item.b === "T2")).toBe(false);
  });
});

describe("time", () => {
  const dated = [
    leaf("a", "T", { createdAt: "2024-01-01T00:00:00Z" }),
    leaf("b", "T", { createdAt: "2024-06-01T00:00:00Z" }),
    leaf("c", "T"),
  ];

  it("spans first to last dated note, and undated notes are there from the start", () => {
    const span = growthSpan(dated)!;
    expect(new Date(span.first).toISOString().slice(0, 10)).toBe("2024-01-01");
    expect(new Date(span.last).toISOString().slice(0, 10)).toBe("2024-06-01");
    expect(dated.filter(node => grownBy(node, span.first)).map(node => node.id)).toEqual(["a", "c"]);
  });

  it("knows what is recent", () => {
    const now = Date.parse("2024-06-10T00:00:00Z");
    expect(isRecent(dated[1]!, "month", now)).toBe(true);
    expect(isRecent(dated[0]!, "month", now)).toBe(false);
    expect(isRecent(dated[2]!, "year", now)).toBe(false);
  });
});

describe("guided walk", () => {
  it("steps along strong links without repeating, jumping on at dead ends", () => {
    const route = walkRoute(nodes, links, 7);
    expect(new Set(route).size).toBe(route.length);
    expect(route).toHaveLength(7);
    expect(route.slice(0, 2)).toEqual(["D", "C"]);
  });
});
