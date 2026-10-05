import { describe, expect, it } from "vitest";
import { TOPIC_VOCABULARY } from "../tidy/vocabulary";
import { nodeDegrees, noteToNoteLinks } from "./graphMetrics";

import { buildShowAllGraph, showAllHubTies, showAllNoteRadius } from "./showAllGraph";
import { NEURAL_DEGREE_CAP, branchLoads, placeTopicAnchors } from "./showAllNeural";
import { relaxNeural } from "./showAllRelax";

function page(
  id: string,
  title: string,
  tags: string[],
  extra: Partial<{
    area: "notes" | "university";
    excerpt: string;
    origins: { kind: "degree" | "unit" | "notebook"; label: string }[];
  }> = {},
) {
  return {
    id,
    title,
    area: extra.area ?? "notes",
    tags,
    excerpt: extra.excerpt ?? `${title} excerpt`,
    origins: extra.origins,
  };
}

const V = TOPIC_VOCABULARY;

function noteDegrees(model: ReturnType<typeof buildShowAllGraph>) {
  const leaves = model.nodes.filter(node => node.kind === "leaf");
  return nodeDegrees(leaves, noteToNoteLinks(model.links));
}

describe("buildShowAllGraph", () => {
  it("organises the tags view into topic zones of notes linked to notes, with no spokes", () => {
    const model = buildShowAllGraph([
      page("p1", "Alpha regulation", [V[0], V[2]]),
      page("p2", "Beta regulation", [V[0], V[2]]),
      page("p3", "Gamma trauma", [V[7]]),
    ]);

    const leaves = model.nodes.filter(node => node.kind === "leaf");
    const hubs = model.nodes.filter(node => node.kind === "major");
    expect(leaves.map(node => node.pageId).sort()).toEqual(["p1", "p2", "p3"]);
    expect(hubs.map(node => node.label).sort()).toEqual([V[0], V[2], V[7]].sort());
    expect(model.links.some(link => link.kind === "spoke")).toBe(false);
    expect(leaves.find(node => node.pageId === "p1")?.hubLabels).toEqual([V[0], V[2]]);
    expect(leaves.find(node => node.pageId === "p1")?.parentKeyword).toBe(V[0]);
    expect(leaves.find(node => node.pageId === "p1")?.color).toBe(hubs.find(hub => hub.label === V[0])?.color);

    const degrees = [...noteDegrees(model).values()];
    expect(Math.max(0, ...degrees)).toBeLessThanOrEqual(NEURAL_DEGREE_CAP);
  });

  it("does not invent note-to-note bridges just to force one component", () => {
    const model = buildShowAllGraph([
      page("p1", "Alpha", [V[0]], { excerpt: "alpha cluster" }),
      page("p2", "Beta", [V[0]], { excerpt: "alpha cluster" }),
      page("p3", "Gamma", [V[1]], { excerpt: "unrelated trauma case" }),
    ]);
    const noteLinks = noteToNoteLinks(model.links);
    const cross = noteLinks.filter(link => {
      const ends = [String(link.source), String(link.target)].sort().join("|");
      return ends === "leaf:p1|leaf:p3" || ends === "leaf:p2|leaf:p3";
    });
    expect(cross).toEqual([]);
    expect(model.nodes.filter(node => node.kind === "major")).toHaveLength(2);
  });

  it("never lets a note gather more than the cap, even inside one huge topic", () => {
    const pages = Array.from({ length: 80 }, (_, index) => page(`n${index}`, `Note ${index}`, [V[0]]));
    const model = buildShowAllGraph(pages);
    const clique = (80 * 79) / 2;
    const noteLinks = noteToNoteLinks(model.links);
    expect(noteLinks.length).toBeLessThan(clique / 10);
    const degrees = [...noteDegrees(model).values()];
    expect(Math.max(0, ...degrees)).toBeLessThanOrEqual(NEURAL_DEGREE_CAP);
  });

  it("sizes notes by degree so hubs read larger than leaves", () => {
    expect(showAllNoteRadius(16)).toBeGreaterThan(showAllNoteRadius(1));
    const pages = [
      page("hub", "Shared regulation motivation note", [V[0], V[1], V[2]], {
        excerpt: "regulation motivation pedagogy hub",
      }),
      ...Array.from({ length: 12 }, (_, index) =>
        page(`r${index}`, `Regulation ${index}`, [V[0]], { excerpt: "regulation hub" }),
      ),
      ...Array.from({ length: 12 }, (_, index) =>
        page(`m${index}`, `Motivation ${index}`, [V[1]], { excerpt: "motivation hub" }),
      ),
    ];
    const model = buildShowAllGraph(pages);
    const radii = model.nodes.map(node => node.r);
    expect(Math.max(...radii)).toBeGreaterThan(Math.min(...radii));
  });

  it("colours tags-view notes from their topic hub", () => {
    const model = buildShowAllGraph([
      page("p1", "Zimmerman's Component Skills of Self-Regulated Learning", [V[1], V[0]]),
      page("p2", "Self regulation workshop", [V[1]]),
      page("p3", "Another regulation note", [V[1]]),
    ]);
    const leaf = model.nodes.find(node => node.pageId === "p1")!;
    const hub = model.nodes.find(node => node.kind === "major" && node.label === V[1]);
    expect(hub).toBeTruthy();
    expect(leaf.community).toBeUndefined();
    expect(leaf.color).toBe(hub?.color);
  });

  it("keeps a two-tag overlap among the scored neighbours", () => {
    const pages = Array.from({ length: 40 }, (_, index) => page(`n${index}`, `Note ${index}`, [V[0]]));
    pages.push(page("a", "Alpha rare pair", [V[0], V[5]], { excerpt: "rare pair overlap" }));
    pages.push(page("b", "Beta rare pair", [V[0], V[5]], { excerpt: "rare pair overlap" }));
    const overlaps = noteToNoteLinks(buildShowAllGraph(pages).links);
    const pair = overlaps.find(
      link =>
        (String(link.source) === "leaf:a" && String(link.target) === "leaf:b") ||
        (String(link.source) === "leaf:b" && String(link.target) === "leaf:a"),
    );
    expect(pair).toBeTruthy();
  });

  it("keeps unrelated topics apart: a topic's notes sit around its own name", () => {
    const pages = [
      ...Array.from({ length: 20 }, (_, index) => page(`a${index}`, `alpha river ${index % 4}`, [V[0]])),
      ...Array.from({ length: 20 }, (_, index) => page(`b${index}`, `beta stone ${index % 4}`, [V[1]])),
    ];
    const model = buildShowAllGraph(pages);
    const hub = (label: string) => model.nodes.find(node => node.kind === "major" && node.label === label)!;
    const d = (a: { x?: number; y?: number }, b: { x?: number; y?: number }) =>
      Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0));
    let own = 0;
    let other = 0;
    const leaves = model.nodes.filter(node => node.kind === "leaf");
    for (const leaf of leaves) {
      own += d(leaf, hub(leaf.parentKeyword!));
      other += d(leaf, hub(leaf.parentKeyword === V[0] ? V[1] : V[0]));
    }
    expect(own / leaves.length).toBeLessThan((other / leaves.length) * 0.6);
    expect(model.nodes.filter(node => node.kind === "major")).toHaveLength(2);
  });

  it("builds notebook and degree views from those hubs only", () => {
    const pages = [
      page("n1", "Notebook one", [V[0]], { origins: [{ kind: "notebook", label: "Brown 2022" }] }),
      page("n2", "Notebook two", [V[1]], { origins: [{ kind: "notebook", label: "Brown 2022" }] }),
      page("u1", "Unit note", [V[2]], {
        area: "university",
        origins: [{ kind: "unit", label: "EDST5805" }],
      }),
    ];
    const notebooks = buildShowAllGraph(pages, "notebooks");
    expect(notebooks.nodes.filter(node => node.kind === "major").map(node => node.label)).toEqual(["Brown 2022"]);
    expect(notebooks.nodes.filter(node => node.kind === "leaf").map(node => node.pageId).sort()).toEqual(["n1", "n2"]);
    expect(notebooks.links.some(link => link.kind === "spoke")).toBe(false);

    const degrees = buildShowAllGraph(pages, "degrees");
    expect(degrees.nodes.filter(node => node.kind === "major").map(node => node.label)).toEqual([
      "Master of Education (Gifted Education)",
    ]);
    expect(degrees.nodes.filter(node => node.kind === "leaf").map(node => node.pageId)).toEqual(["u1"]);
  });
});

describe("Show All neural map", () => {
  const dist = (a: { x?: number; y?: number }, b: { x?: number; y?: number }) =>
    Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0));

  function neuralPages() {
    const pages = [];
    // Five topics with their own vocabulary in three sub-themes; a share of notes carry a related second topic.
    for (let i = 0; i < 300; i++) {
      const topic = i % 5;
      const sub = Math.floor(i / 5) % 3;
      const words = Array.from({ length: 4 }, (_, w) => `t${topic}s${sub}w${(i + w) % 6}`).join(" ");
      const tags = i % 4 === 0 ? [V[topic], V[(topic + 1) % 5]] : [V[topic]];
      pages.push(page(`n${i}`, `${words} note ${i}`, tags, { excerpt: words }));
    }
    return pages;
  }

  function degreesOf(model: ReturnType<typeof buildShowAllGraph>) {
    const degree = new Map<string, number>();
    for (const link of model.links) {
      for (const end of [String(link.source), String(link.target)]) degree.set(end, (degree.get(end) ?? 0) + 1);
    }
    return model.nodes.filter(node => node.kind === "leaf").map(node => degree.get(node.id) ?? 0);
  }

  it("grows a branching backbone, not a mesh: tips, chains and a few knots, nothing huge", () => {
    const model = buildShowAllGraph(neuralPages());
    const degrees = degreesOf(model);
    expect(Math.max(...degrees)).toBeLessThanOrEqual(NEURAL_DEGREE_CAP);
    expect(degrees.filter(d => d >= 6).length).toBeGreaterThan(0);
    expect(degrees.filter(d => d === 1).length).toBeGreaterThan(0);
    expect(degrees.filter(d => d >= 1 && d <= 4).length / degrees.length).toBeGreaterThan(0.7);
    expect(model.links.some(link => link.kind === "spoke")).toBe(false);
  });

  it("makes the backbone a forest: no loops inside it, cross-links on top", () => {
    const model = buildShowAllGraph(neuralPages());
    const leaves = model.nodes.filter(node => node.kind === "leaf");
    const backbone = model.links.filter(link => link.kind === "backbone");
    const cross = model.links.filter(link => link.kind === "overlap");
    expect(backbone.length).toBeLessThan(leaves.length);
    expect(cross.length).toBeGreaterThan(0);
  });

  it("is deterministic: same notes, same seed layout and links", () => {
    const first = buildShowAllGraph(neuralPages());
    const second = buildShowAllGraph(neuralPages());
    expect(second.links.map(link => `${link.source}>${link.target}`)).toEqual(
      first.links.map(link => `${link.source}>${link.target}`),
    );
    for (const [index, node] of first.nodes.entries()) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(second.nodes[index]!.x).toBe(node.x);
      expect(second.nodes[index]!.y).toBe(node.y);
    }
  });

  function relaxed(spread = 1) {
    const model = buildShowAllGraph(neuralPages());
    const leaves = model.nodes.filter(node => node.kind === "leaf");
    const positions = relaxNeural(
      leaves.map(node => ({ id: node.id, x: node.x!, y: node.y! })),
      model.links.map(link => ({ source: String(link.source), target: String(link.target), backbone: link.kind === "backbone" })),
      { spread, gather: 1 },
    );
    leaves.forEach((node, i) => {
      node.x = positions[i * 2];
      node.y = positions[i * 2 + 1];
    });
    return { model, leaves };
  }

  it("relaxes into one round mass where linked notes sit close", () => {
    const { model, leaves } = relaxed();
    const byId = new Map(leaves.map(node => [node.id, node]));
    const linked = model.links
      .filter(link => link.kind === "backbone")
      .map(link => dist(byId.get(String(link.source))!, byId.get(String(link.target))!));
    let all = 0;
    let pairs = 0;
    for (let i = 0; i < leaves.length; i += 3) {
      for (let j = i + 1; j < leaves.length; j += 7) {
        all += dist(leaves[i]!, leaves[j]!);
        pairs += 1;
      }
    }
    expect(linked.reduce((sum, d) => sum + d, 0) / linked.length).toBeLessThan((all / pairs) * 0.25);
    const xs = leaves.map(node => node.x!);
    const ys = leaves.map(node => node.y!);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    expect(Math.max(w, h) / Math.min(w, h)).toBeLessThan(1.8);
  });

  it("relaxes the same way every time", () => {
    const a = relaxed().leaves.map(node => `${node.x!.toFixed(6)},${node.y!.toFixed(6)}`);
    const b = relaxed().leaves.map(node => `${node.x!.toFixed(6)},${node.y!.toFixed(6)}`);
    expect(b).toEqual(a);
  });

  it("loosens the fibres when Spread goes up", () => {
    const meanLink = ({ model, leaves }: ReturnType<typeof relaxed>) => {
      const byId = new Map(leaves.map(node => [node.id, node]));
      const lengths = model.links
        .filter(link => link.kind === "backbone")
        .map(link => dist(byId.get(String(link.source))!, byId.get(String(link.target))!));
      return lengths.reduce((sum, d) => sum + d, 0) / lengths.length;
    };
    expect(meanLink(relaxed(1.6))).toBeGreaterThan(meanLink(relaxed(1)) * 1.2);
  });

  it("anchors each topic name on the cluster that holds most of its notes", () => {
    const { model } = relaxed();
    placeTopicAnchors(model.nodes, model.links);
    for (const hub of model.nodes.filter(node => node.kind === "major")) {
      const own = model.nodes.filter(node => node.kind === "leaf" && node.parentKeyword === hub.label);
      const nearest = Math.min(...own.map(node => dist(node, hub)));
      expect(Number.isFinite(hub.x)).toBe(true);
      expect(nearest).toBeLessThan(200);
    }
  });

  it("makes trunks carry more than twigs, so fibres can taper", () => {
    const model = buildShowAllGraph(neuralPages());
    const loads = [...branchLoads(model.nodes, model.links).values()];
    expect(loads.length).toBeGreaterThan(0);
    expect(Math.min(...loads)).toBe(1);
    expect(Math.max(...loads)).toBeGreaterThan(20);
  });

  it("counts shared notes per topic pair once per note", () => {
    const ties = showAllHubTies([[V[0], V[1], V[0]], [V[1], V[0]], [V[2]]], new Set([V[0], V[1], V[2]]));
    expect(ties).toHaveLength(1);
    expect(ties[0]!.weight).toBe(2);
  });
});
