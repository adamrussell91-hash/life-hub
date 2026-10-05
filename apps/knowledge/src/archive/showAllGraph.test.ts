import { describe, expect, it } from "vitest";
import { TOPIC_VOCABULARY } from "../tidy/vocabulary";
import { nodeDegrees, noteToNoteLinks } from "./graphMetrics";
import { SHOW_ALL_DEGREE_CAP, SHOW_ALL_DEGREE_FLOOR } from "./showAllEdges";
import {
  SHOW_ALL_DEFAULT_SHAPE,
  buildShowAllGraph,
  layoutShowAll,
  showAllDiscRadius,
  showAllHubTies,
  showAllNoteRadius,
} from "./showAllGraph";

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
    expect(Math.max(0, ...degrees)).toBeLessThanOrEqual(SHOW_ALL_DEGREE_CAP);
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

  it("never lets a note connect to more than 5 other notes", () => {
    const pages = Array.from({ length: 80 }, (_, index) => page(`n${index}`, `Note ${index}`, [V[0]]));
    const model = buildShowAllGraph(pages);
    const clique = (80 * 79) / 2;
    const noteLinks = noteToNoteLinks(model.links);
    expect(noteLinks.length).toBeLessThan(clique / 4);
    expect(noteLinks.length).toBeLessThanOrEqual(80 * SHOW_ALL_DEGREE_CAP / 2);
    const degrees = [...noteDegrees(model).values()];
    expect(Math.max(0, ...degrees)).toBeLessThanOrEqual(SHOW_ALL_DEGREE_CAP);
  });

  it("gives every note at least 2 links when it has partners, and none more than 5", () => {
    const pages = Array.from({ length: 60 }, (_, index) =>
      page(`m${index}`, `Mesh ${index % 7} topic ${index}`, [V[index % 3]], { excerpt: `shared theme ${index % 5}` }),
    );
    const model = buildShowAllGraph(pages);
    const degrees = noteDegrees(model);
    for (const leaf of model.nodes.filter(node => node.kind === "leaf")) {
      const degree = degrees.get(leaf.id) ?? 0;
      expect(degree).toBeGreaterThanOrEqual(SHOW_ALL_DEGREE_FLOOR);
      expect(degree).toBeLessThanOrEqual(SHOW_ALL_DEGREE_CAP);
    }
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

  it("seeds each topic as its own island around that hub", () => {
    const pages = [
      ...Array.from({ length: 20 }, (_, index) => page(`a${index}`, `A ${index}`, [V[0]])),
      ...Array.from({ length: 20 }, (_, index) => page(`b${index}`, `B ${index}`, [V[1]])),
    ];
    const model = buildShowAllGraph(pages);
    const homes = new Set(
      model.nodes.filter(node => node.kind === "leaf").map(node => `${node.homeX},${node.homeY}`),
    );
    expect(homes.size).toBe(2);
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

describe("Show All layout", () => {
  const dist = (a: { x?: number; y?: number }, b: { x?: number; y?: number }) =>
    Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0));

  function nexusPages() {
    const pages = [];
    // V[0] is the big topic. V[1] and V[2] share many notes; V[3] shares none with V[1].
    for (let i = 0; i < 90; i++) pages.push(page(`big${i}`, `Big ${i}`, [V[0]]));
    for (let i = 0; i < 30; i++) pages.push(page(`p${i}`, `Pair ${i}`, i < 18 ? [V[1], V[2]] : [V[1]]));
    for (let i = 0; i < 30; i++) pages.push(page(`q${i}`, `Q ${i}`, [V[2]]));
    for (let i = 0; i < 30; i++) pages.push(page(`r${i}`, `R ${i}`, i < 6 ? [V[3], V[0]] : [V[3]]));
    for (let i = 0; i < 25; i++) pages.push(page(`s${i}`, `S ${i}`, [V[4]]));
    return pages;
  }

  it("lays out with no physics: positions are final, fixed and identical on every build", () => {
    const first = buildShowAllGraph(nexusPages());
    const second = buildShowAllGraph(nexusPages());
    for (const [index, node] of first.nodes.entries()) {
      expect(node.x).toBeTypeOf("number");
      expect(node.fx).toBe(node.x);
      expect(node.fy).toBe(node.y);
      expect(second.nodes[index]!.x).toBe(node.x);
      expect(second.nodes[index]!.y).toBe(node.y);
    }
  });

  it("puts the biggest topic at the core of the nexus", () => {
    const model = buildShowAllGraph(nexusPages());
    const hubs = model.nodes.filter(node => node.kind === "major");
    const cx = hubs.reduce((sum, hub) => sum + (hub.x ?? 0), 0) / hubs.length;
    const cy = hubs.reduce((sum, hub) => sum + (hub.y ?? 0), 0) / hubs.length;
    const fromCentre = hubs.map(hub => ({ label: hub.label, d: Math.hypot((hub.x ?? 0) - cx, (hub.y ?? 0) - cy) }));
    fromCentre.sort((a, b) => a.d - b.d);
    expect(fromCentre[0]!.label).toBe(V[0]);
  });

  it("pulls topics that share notes next to each other", () => {
    const model = buildShowAllGraph(nexusPages());
    const hub = (label: string) => model.nodes.find(node => node.kind === "major" && node.label === label)!;
    expect(dist(hub(V[1]), hub(V[2]))).toBeLessThan(dist(hub(V[1]), hub(V[3])));
    expect(model.hubTies?.[0]).toEqual({ a: [V[1], V[2]].sort()[0], b: [V[1], V[2]].sort()[1], weight: 18 });
  });

  it("keeps topic discs apart and every note inside its own disc", () => {
    const model = buildShowAllGraph(nexusPages());
    const hubs = model.nodes.filter(node => node.kind === "major");
    const radius = new Map(hubs.map(hub => [hub.label, showAllDiscRadius(hub.count, hub.r)]));
    for (let i = 0; i < hubs.length; i++) {
      for (let j = i + 1; j < hubs.length; j++) {
        expect(dist(hubs[i]!, hubs[j]!)).toBeGreaterThan(radius.get(hubs[i]!.label)! + radius.get(hubs[j]!.label)!);
      }
    }
    for (const leaf of model.nodes.filter(node => node.kind === "leaf")) {
      const hub = hubs.find(item => item.label === leaf.parentKeyword)!;
      expect(dist(leaf, hub)).toBeLessThanOrEqual(radius.get(hub.label)! + 1);
    }
  });

  it("seats linked notes next to each other inside a zone", () => {
    const model = buildShowAllGraph(nexusPages());
    const byId = new Map(model.nodes.map(node => [node.id, node]));
    const linked: number[] = [];
    for (const link of model.links) {
      const a = byId.get(String(link.source))!;
      const b = byId.get(String(link.target))!;
      if (a.parentKeyword === V[0] && b.parentKeyword === V[0]) linked.push(dist(a, b));
    }
    const zone = model.nodes.filter(node => node.kind === "leaf" && node.parentKeyword === V[0]);
    let all = 0;
    let pairs = 0;
    for (let i = 0; i < zone.length; i++) {
      for (let j = i + 1; j < zone.length; j++) {
        all += dist(zone[i]!, zone[j]!);
        pairs += 1;
      }
    }
    const meanLinked = linked.reduce((sum, d) => sum + d, 0) / linked.length;
    expect(linked.length).toBeGreaterThan(0);
    expect(meanLinked).toBeLessThan((all / pairs) * 0.75);
  });

  it("never stacks two notes on the same spot", () => {
    const model = buildShowAllGraph(nexusPages());
    const leaves = model.nodes.filter(node => node.kind === "leaf");
    for (let i = 0; i < leaves.length; i++) {
      for (let j = i + 1; j < leaves.length; j++) {
        expect(dist(leaves[i]!, leaves[j]!)).toBeGreaterThan(4);
      }
    }
  });

  it("seats multi-topic notes on the rim facing their other topic", () => {
    const model = buildShowAllGraph(nexusPages());
    const home = model.nodes.find(node => node.kind === "major" && node.label === V[1])!;
    const other = model.nodes.find(node => node.kind === "major" && node.label === V[2])!;
    const leaves = model.nodes.filter(node => node.kind === "leaf" && node.parentKeyword === V[1]);
    const bridging = leaves.filter(node => (node.hubLabels ?? []).includes(V[2]));
    const solo = leaves.filter(node => !(node.hubLabels ?? []).includes(V[2]));
    const mean = (list: typeof leaves) => list.reduce((sum, node) => sum + dist(node, other), 0) / list.length;
    expect(bridging.length).toBeGreaterThan(0);
    expect(mean(bridging)).toBeLessThan(mean(solo));
  });

  it("spreads notes further apart when Spread goes up", () => {
    const model = buildShowAllGraph(nexusPages());
    const leaves = () => model.nodes.filter(node => node.kind === "leaf" && node.parentKeyword === V[0]);
    const hub = model.nodes.find(node => node.kind === "major" && node.label === V[0])!;
    const reach = () => Math.max(...leaves().map(node => dist(node, hub)));
    const before = reach();
    layoutShowAll(model.nodes, model.hubTies ?? [], { ...SHOW_ALL_DEFAULT_SHAPE, spread: 1.5 });
    expect(reach()).toBeGreaterThan(before * 1.3);
  });

  it("counts shared notes per hub pair once per note", () => {
    const ties = showAllHubTies([[V[0], V[1], V[0]], [V[1], V[0]], [V[2]]], new Set([V[0], V[1], V[2]]));
    expect(ties).toHaveLength(1);
    expect(ties[0]!.weight).toBe(2);
  });
});
