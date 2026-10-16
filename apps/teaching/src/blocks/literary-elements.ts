import type { AnnotationColour, AnnotationFamilyKey } from '@/schemas/block';

export type LiteraryFamily = {
  key: AnnotationFamilyKey;
  name: string;
  colour: string;
};

export type LiterarySubgroup = {
  id: string;
  family: AnnotationFamilyKey;
  name: string;
  definition: string;
};

export type LiteraryTechnique = {
  id: string;
  symbol: string;
  name: string;
  subgroup: string;
  definition: string;
  effect: string;
  example: string;
  related: string[];
  /** Word origin from the widget's ORIGIN map / inferLang(). */
  lang?: string;
  etymology?: string;
  lineage?: Array<{ word: string; lang: string; meaning: string }>;
};

export type LiteraryConnectionAxis = 'gradient' | 'subtype' | 'mirror' | 'cross' | 'effect';

export type LiteraryConnection = {
  from: string;
  to: string;
  axis: LiteraryConnectionAxis;
};

export type LiteraryElementsTable = {
  version: string;
  source: string;
  synced_at?: string;
  families: LiteraryFamily[];
  subgroups: LiterarySubgroup[];
  axes?: Array<{ key: LiteraryConnectionAxis; label: string }>;
  connections?: LiteraryConnection[];
  techniques: LiteraryTechnique[];
};

/** Map widgets FAMILY_COLORS hex → fixed annotation palette tokens. */
export const FAMILY_PALETTE: Record<AnnotationFamilyKey, AnnotationColour> = {
  Descriptive: 'coral',
  Repetitive: 'shore',
  Comparative: 'mist',
  Structural: 'sand',
  Intertextual: 'marine'
};

let tablePromise: Promise<LiteraryElementsTable> | null = null;
let cached: LiteraryElementsTable | null = null;

export function loadLiteraryElements(): Promise<LiteraryElementsTable> {
  if (cached) return Promise.resolve(cached);
  if (!tablePromise) {
    tablePromise = import('../data/literary-elements.json').then((mod) => {
      const table =
        (mod as { default: LiteraryElementsTable }).default ??
        (mod as unknown as LiteraryElementsTable);
      cached = table;
      return table;
    });
  }
  return tablePromise;
}

/** Test / sync helper: inject a table without touching the JSON chunk. */
export function setLiteraryElementsForTests(table: LiteraryElementsTable | null): void {
  cached = table;
  tablePromise = table ? Promise.resolve(table) : null;
}

export function lookupTechnique(
  table: LiteraryElementsTable,
  id: string
): LiteraryTechnique | undefined {
  return table.techniques.find((tech) => tech.id === id);
}

export function subgroupsOf(
  table: LiteraryElementsTable,
  family: AnnotationFamilyKey
): LiterarySubgroup[] {
  return table.subgroups.filter((sg) => sg.family === family);
}

export function familyOfTechnique(
  table: LiteraryElementsTable,
  technique: LiteraryTechnique
): LiteraryFamily | undefined {
  const sg = table.subgroups.find((row) => row.id === technique.subgroup);
  if (!sg) return undefined;
  return table.families.find((fam) => fam.key === sg.family);
}

export function searchTechniques(
  table: LiteraryElementsTable,
  query: string
): LiteraryTechnique[] {
  const q = query.trim().toLowerCase();
  if (!q) return table.techniques;
  return table.techniques.filter(
    (tech) =>
      tech.name.toLowerCase().includes(q) ||
      tech.symbol.toLowerCase().includes(q) ||
      tech.id.includes(q)
  );
}

export function groupTechniquesByFamily(
  table: LiteraryElementsTable,
  techniques: LiteraryTechnique[]
): Array<{ family: LiteraryFamily; subgroups: Array<{ subgroup: LiterarySubgroup; techniques: LiteraryTechnique[] }> }> {
  const bySub = new Map<string, LiteraryTechnique[]>();
  for (const tech of techniques) {
    const list = bySub.get(tech.subgroup) ?? [];
    list.push(tech);
    bySub.set(tech.subgroup, list);
  }

  return table.families.map((family) => {
    const subgroups = subgroupsOf(table, family.key)
      .map((subgroup) => ({
        subgroup,
        techniques: bySub.get(subgroup.id) ?? []
      }))
      .filter((row) => row.techniques.length > 0);
    return { family, subgroups };
  }).filter((row) => row.subgroups.length > 0);
}

export type TechniqueLink = {
  technique: LiteraryTechnique;
  /** Mapped axis label, or null for a plain "related" entry. */
  axisLabel: string | null;
  axis: LiteraryConnectionAxis | null;
};

/**
 * Everything a technique card can jump to: the widget's mapped connections
 * first (with their axis), then the remaining "related" entries.
 */
export function linksOfTechnique(
  table: LiteraryElementsTable,
  technique: LiteraryTechnique
): TechniqueLink[] {
  const seen = new Set<string>([technique.id]);
  const links: TechniqueLink[] = [];
  const axisLabel = (axis: LiteraryConnectionAxis) =>
    table.axes?.find((row) => row.key === axis)?.label ?? null;
  for (const conn of table.connections ?? []) {
    const otherId =
      conn.from === technique.id ? conn.to : conn.to === technique.id ? conn.from : null;
    if (!otherId || seen.has(otherId)) continue;
    const other = lookupTechnique(table, otherId);
    if (!other) continue;
    seen.add(otherId);
    links.push({ technique: other, axis: conn.axis, axisLabel: axisLabel(conn.axis) });
  }
  for (const id of technique.related) {
    if (seen.has(id)) continue;
    const other = lookupTechnique(table, id);
    if (!other) continue;
    seen.add(id);
    links.push({ technique: other, axis: null, axisLabel: null });
  }
  return links;
}

/** Same-subgroup neighbours, used as quiz distractors. */
export function siblingsOfTechnique(
  table: LiteraryElementsTable,
  technique: LiteraryTechnique
): LiteraryTechnique[] {
  return table.techniques.filter(
    (tech) => tech.subgroup === technique.subgroup && tech.id !== technique.id
  );
}
