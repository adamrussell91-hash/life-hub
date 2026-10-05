import type { PageManifestEntry } from "../domain/page";
import {
  colorForHub,
  type ArchiveGraphModel,
  type GraphLinkDatum,
  type GraphNodeDatum,
} from "./keywordGraph";
import {
  filterShowAllEntries,
  hubLabelsFor,
  type ShowAllGrouping,
} from "./showAllScope";
import { buildShowAllNoteEdges } from "./showAllEdges";
import { layoutNeural } from "./showAllNeural";

export type ShowAllShape = {
  /** Multiplies link lengths and spacing. 1 is the default. */
  spread: number;
  /** How tightly the map gathers into one mass (Pull). */
  lean: number;
};

export const SHOW_ALL_DEFAULT_SHAPE: ShowAllShape = { spread: 1, lean: 0.6 };

export function showAllNoteRadius(degree: number) {
  return 3.2 + Math.sqrt(Math.max(degree, 0)) * 1.7;
}

function hubRadius(count: number) {
  return Math.max(16, Math.min(30, 14 + Math.sqrt(Math.max(count, 1)) * 1.2));
}

export type ShowAllHubTie = { a: string; b: string; weight: number };

/** How many notes each pair of topics shares. */
export function showAllHubTies(labelsByEntry: string[][], hubLabels: Set<string>): ShowAllHubTie[] {
  const shared = new Map<string, ShowAllHubTie>();
  for (const labels of labelsByEntry) {
    const hubs = [...new Set(labels)].filter(label => hubLabels.has(label)).sort();
    for (let i = 0; i < hubs.length; i++) {
      for (let j = i + 1; j < hubs.length; j++) {
        const key = `${hubs[i]}\u0000${hubs[j]}`;
        const tie = shared.get(key) ?? { a: hubs[i]!, b: hubs[j]!, weight: 0 };
        tie.weight += 1;
        shared.set(key, tie);
      }
    }
  }
  return [...shared.values()].sort((x, y) => y.weight - x.weight || x.a.localeCompare(y.a) || x.b.localeCompare(y.b));
}


/**
 * Lays the whole Show All map out with no physics. Topics become zones: hubs are packed into one
 * nexus, then each zone is grown outward from its best-linked note, every note taking the free
 * seat nearest the notes it links to. Linked notes end up side by side, notes linked into another
 * zone sit on the edge facing it, and the same input always gives the same picture.
 */
export function layoutShowAll(
  nodes: GraphNodeDatum[],
  _ties: ShowAllHubTie[],
  shape: ShowAllShape = SHOW_ALL_DEFAULT_SHAPE,
  links: GraphLinkDatum[] = [],
) {
  // Neural layout: positions grow from the link backbone, not from topic discs.
  layoutNeural(nodes, links, { spread: shape.spread, fan: 0.6 + shape.lean * 0.67 });
}

function buildHubs(counts: Map<string, number>): GraphNodeDatum[] {
  const ordered = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return ordered.map(([label, count]) => {
    const palette = colorForHub(label);
    return {
      id: `major:${label}`,
      kind: "major" as const,
      label,
      count,
      color: palette.fill,
      soft: palette.soft,
      ink: palette.ink,
      r: hubRadius(count),
    };
  });
}

export function buildShowAllGraph(
  entries: PageManifestEntry[],
  grouping: ShowAllGrouping = "tags",
): ArchiveGraphModel {
  const eligible = filterShowAllEntries(entries, grouping);
  const counts = new Map<string, number>();
  const labelsByEntry = eligible.map(entry => hubLabelsFor(entry, grouping));
  for (const labels of labelsByEntry) {
    for (const label of new Set(labels)) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }

  const hubNodes = buildHubs(counts);
  const hubTies = showAllHubTies(labelsByEntry, new Set(counts.keys()));
  const hubByLabel = new Map(hubNodes.map(node => [node.label, node]));
  const nodes: GraphNodeDatum[] = [...hubNodes];
  const links: GraphLinkDatum[] = [];

  const labelsById = new Map(eligible.map((entry, index) => [entry.id, labelsByEntry[index] ?? []]));
  const byHub = new Map<string, { hub?: GraphNodeDatum; entries: PageManifestEntry[] }>();
  eligible.forEach((entry, index) => {
    const labels = labelsByEntry[index] ?? [];
    const hub = hubByLabel.get(labels[0] ?? "");
    const hubKey = hub?.id ?? "none";
    const group = byHub.get(hubKey) ?? { hub, entries: [] };
    group.entries.push(entry);
    byHub.set(hubKey, group);
  });

  const built = buildShowAllNoteEdges(eligible, labelsByEntry);
  const degreeById = new Map(eligible.map((entry, index) => [`leaf:${entry.id}`, built.degree[index] ?? 0]));

  for (const group of byHub.values()) {
    group.entries.forEach(entry => {
      const hubLabels = [...new Set(labelsById.get(entry.id) ?? [])].filter(label => hubByLabel.has(label));
      const degree = degreeById.get(`leaf:${entry.id}`) ?? 0;
      const palette = group.hub
        ? { fill: group.hub.color, soft: group.hub.soft, ink: group.hub.ink }
        : colorForHub(hubLabels[0] ?? entry.title);
      nodes.push({
        id: `leaf:${entry.id}`,
        kind: "leaf",
        label: entry.title,
        count: 1,
        pageId: entry.id,
        parentKeyword: group.hub?.label,
        hubLabels,
        degree,
        color: palette.fill,
        soft: palette.soft,
        ink: palette.ink,
        r: showAllNoteRadius(degree),
        ...(entry.created_at ? { createdAt: entry.created_at } : {}),
      });
    });
  }

  const overlaps = built.links;
  const leafById = new Map(nodes.filter(node => node.kind === "leaf").map(node => [node.id, node]));
  for (const link of overlaps) {
    const source = typeof link.source === "string" ? leafById.get(link.source) : link.source;
    if (source) link.color = source.soft;
  }
  links.push(...overlaps);
  layoutShowAll(nodes, hubTies, SHOW_ALL_DEFAULT_SHAPE, links);

  return {
    nodes,
    links,
    majorCount: hubNodes.length,
    minorCount: 0,
    leaves: new Map(),
    hubTies,
  };
}
