import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from "d3-force";
import { describe, expect, it } from "vitest";
import {
  CONSTELLATION_SPOKE_DISTANCE,
  constellationCollisionRadius,
  constellationLinkDistance,
  constellationLinkStrength,
  constellationNodeCharge,
  constellationTargetStrength,
} from "./forceGraphBehavior";
import {
  CONSTELLATION_EXPAND,
  applyConstellationHubClick,
  buildArchiveGraph,
} from "./keywordGraph";
import { TOPIC_VOCABULARY } from "../tidy/vocabulary";

const V = TOPIC_VOCABULARY;

function page(id: string, title: string, tags: string[], createdDay: number) {
  return {
    id,
    title,
    area: "notes" as const,
    tags,
    excerpt: "",
    created_at: `2026-01-${String(createdDay).padStart(2, "0")}T00:00:00.000Z`,
  };
}

function settleConstellation(nodes: ReturnType<typeof buildArchiveGraph>["nodes"], links: ReturnType<typeof buildArchiveGraph>["links"]) {
  const sim = forceSimulation(nodes)
    .force(
      "link",
      forceLink(links)
        .id(node => (node as { id: string }).id)
        .distance(constellationLinkDistance)
        .strength(constellationLinkStrength),
    )
    .force("charge", forceManyBody().strength(constellationNodeCharge).distanceMax(1200))
    .force("x", forceX(node => (node as { x?: number }).x ?? 760).strength(constellationTargetStrength))
    .force("y", forceY(node => (node as { y?: number }).y ?? 560).strength(constellationTargetStrength))
    .force("collide", forceCollide().radius(constellationCollisionRadius).strength(0.95))
    .alphaDecay(0.02)
    .velocityDecay(0.4)
    .stop();
  sim.tick(400);
}

describe("constellation leaf spread", () => {
  it("keeps expanded notes apart around a hub instead of collapsing to one point", () => {
    const pages = Array.from({ length: 200 }, (_, index) => {
      const a = V[index % 12]!;
      const b = V[(index + 1) % 12]!;
      return page(`p${index}`, `Note ${index}`, [a, b, "Note"], (index % 28) + 1);
    });
    const graph = buildArchiveGraph(pages);
    const focus = V[2]!;
    const opened = applyConstellationHubClick(graph, graph.nodes, focus);
    const nodes = opened.nodes.map(node => ({ ...node }));
    const links = opened.links.map(link => ({ ...link }));
    const hub = nodes.find(node => node.kind === "major" && node.label === focus)!;
    const leaves = nodes.filter(node => node.kind === "leaf" && node.parentKeyword === focus);
    expect(leaves).toHaveLength(CONSTELLATION_EXPAND);

    settleConstellation(nodes, links);

    let minPair = Infinity;
    const angles: number[] = [];
    for (let i = 0; i < leaves.length; i++) {
      const leaf = leaves[i]!;
      angles.push(Math.atan2((leaf.y ?? 0) - (hub.y ?? 0), (leaf.x ?? 0) - (hub.x ?? 0)));
      for (let j = i + 1; j < leaves.length; j++) {
        const other = leaves[j]!;
        const dist = Math.hypot((leaf.x ?? 0) - (other.x ?? 0), (leaf.y ?? 0) - (other.y ?? 0));
        if (dist < minPair) minPair = dist;
      }
    }
    angles.sort((a, b) => a - b);
    let maxGap = 0;
    for (let i = 0; i < angles.length; i++) {
      const next = i === angles.length - 1 ? angles[0]! + Math.PI * 2 : angles[i + 1]!;
      maxGap = Math.max(maxGap, next - angles[i]!);
    }

    // Collision diameter for leaves is 28; stacked notes were ~0.05 before the fix.
    expect(minPair).toBeGreaterThan(20);
    // Neighbour hubs used to shove every note into a ~90° wedge (max gap ~270°).
    expect((maxGap * 180) / Math.PI).toBeLessThan(200);
    const radii = leaves.map(leaf => Math.hypot((leaf.x ?? 0) - (hub.x ?? 0), (leaf.y ?? 0) - (hub.y ?? 0)));
    const meanRadius = radii.reduce((sum, value) => sum + value, 0) / radii.length;
    expect(meanRadius).toBeGreaterThan(CONSTELLATION_SPOKE_DISTANCE * 0.55);
    expect(meanRadius).toBeLessThan(CONSTELLATION_SPOKE_DISTANCE * 1.6);
  });

  it("places the opening ring on the spoke distance so the force does not yank notes inward", () => {
    expect(constellationLinkDistance({ source: "a", target: "b", kind: "spoke", weight: 1, color: "#000" })).toBe(
      CONSTELLATION_SPOKE_DISTANCE,
    );
    expect(constellationNodeCharge({ id: "leaf", kind: "leaf", label: "n", count: 1, color: "#000", soft: "", ink: "", r: 6 })).toBe(
      -100,
    );
    expect(
      constellationCollisionRadius({ id: "leaf", kind: "leaf", label: "n", count: 1, color: "#000", soft: "", ink: "", r: 6 }),
    ).toBe(14);
  });
});
