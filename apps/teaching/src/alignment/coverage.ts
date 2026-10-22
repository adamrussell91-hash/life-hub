import type { LineAlignment, NetworkLine } from '@/schemas/block';
import type { SkillsContinuum } from '@/skills/schema';
import { conceptKeyOf, bulletNumberOf, wordStems } from './model';
import type { Alignment, AlignmentPoint } from './schema';

/**
 * What a unit map's lines cover in the syllabus. A lesson lists the dot
 * points it teaches; each line stands for a group of dot points, a textual
 * concept or a skills strand. A line covers an item when a lesson it stops
 * at teaches a dot point that carries it. Pure: no DOM, unit tested directly.
 */

export type CoverageLesson = { id: string; title: string; line_stops?: ReadonlyArray<{ line_id: string }>; dot_points?: readonly string[] };
export type CoverageItem = { id: string; label: string; title: string; covered: boolean; lessons: string[] };
export type LineCoverage = {
  line: NetworkLine;
  /** What the line stands for, in words; empty when it isn't linked yet. */
  heading: string;
  items: CoverageItem[];
  outcomes: number[];
};
export type UnitCoverage = {
  area: { id: string; name: string };
  rows: LineCoverage[];
  /** Across the whole unit, whatever line teaches it. */
  gaps: { points: string[]; outcomes: number[] };
};

export const dotPointRef = (area: string, point: string): string => `${area}:${point}`;

const GROUP_NAME = { U: 'Understanding dot points', R: 'Responding dot points' } as const;

/** The focus area a unit covers: the map's own choice, else the one whose name best matches the unit's title. */
export function focusAreaFor(doc: Alignment, unitTitle: string | undefined, chosen?: string): { id: string; name: string } | null {
  if (chosen) {
    const area = doc.focus_areas.find((f) => f.id === chosen);
    if (area) return { id: area.id, name: area.name };
  }
  if (!unitTitle) return null;
  const title = wordStems(unitTitle);
  let best: { id: string; name: string; score: number } | null = null;
  for (const area of doc.focus_areas) {
    const score = [...wordStems(area.name)].filter((s) => title.has(s)).length;
    if (score > 0 && (!best || score > best.score)) best = { id: area.id, name: area.name, score };
  }
  return best ? { id: best.id, name: best.name } : null;
}

export function lineHeading(link: LineAlignment | undefined, doc: Alignment, skills: SkillsContinuum | null): string {
  if (!link) return '';
  if (link.kind === 'points') return GROUP_NAME[link.group];
  if (link.kind === 'concept') return doc.concepts.find((c) => c.key === link.key)?.name ?? link.key;
  return skills?.strands.find((s) => s.strand === link.strand)?.name ?? link.strand[0]!.toUpperCase() + link.strand.slice(1);
}

export function unitCoverage(
  doc: Alignment,
  skills: SkillsContinuum | null,
  area: { id: string; name: string },
  lines: readonly NetworkLine[],
  lessons: readonly CoverageLesson[]
): UnitCoverage {
  const points = doc.focus_areas.find((f) => f.id === area.id)?.points ?? [];
  const pointById = new Map(points.map((p) => [p.id, p]));
  /** The dot points of this area a lesson teaches. */
  const taught = (lesson: CoverageLesson): AlignmentPoint[] =>
    (lesson.dot_points ?? [])
      .filter((ref) => ref.startsWith(`${area.id}:`))
      .map((ref) => pointById.get(ref.slice(area.id.length + 1)))
      .filter((p): p is AlignmentPoint => Boolean(p));

  const rows: LineCoverage[] = lines.map((line) => {
    const link = line.alignment;
    const heading = lineHeading(link, doc, skills);
    const stops = lessons.filter((l) => l.line_stops?.some((s) => s.line_id === line.id));
    const items: CoverageItem[] = [];
    const outcomes = new Set<number>();
    // An item is covered by the lessons on this line whose dot points carry it.
    const coverBy = (carries: (p: AlignmentPoint) => boolean, reach: (p: AlignmentPoint) => number[]) => {
      const by: string[] = [];
      for (const lesson of stops) {
        const hit = taught(lesson).filter(carries);
        if (!hit.length) continue;
        by.push(lesson.title);
        for (const p of hit) for (const n of reach(p)) outcomes.add(n);
      }
      return by;
    };
    const outcomesOf = (p: AlignmentPoint) => p.outcomes.map((o) => o.n);
    if (link?.kind === 'points') {
      for (const p of points.filter((x) => x.kind === link.group)) {
        const by = coverBy((x) => x.id === p.id, outcomesOf);
        items.push({ id: p.id, label: p.id, title: p.short, covered: by.length > 0, lessons: by });
      }
    } else if (link?.kind === 'concept') {
      const concept = doc.concepts.find((c) => c.key === link.key);
      const refs = [...new Set(points.flatMap((p) => p.concepts.map((c) => c.ref)).filter((ref) => conceptKeyOf(ref) === link.key))]
        .sort((a, b) => bulletNumberOf(a) - bulletNumberOf(b));
      for (const ref of refs) {
        const by = coverBy((x) => x.concepts.some((c) => c.ref === ref), outcomesOf);
        const n = bulletNumberOf(ref);
        items.push({ id: ref, label: String(n), title: concept?.bullets.find((b) => b.n === n)?.text ?? ref, covered: by.length > 0, lessons: by });
      }
    } else if (link?.kind === 'strand') {
      const strand = skills?.strands.find((s) => s.strand === link.strand);
      for (const sub of strand?.sub_strands.filter((s) => s.focus_areas.includes(area.id)) ?? []) {
        // A sub-strand and a dot point meet where they share an outcome in this focus area.
        const by = coverBy((x) => x.outcomes.some((o) => sub.outcomes.includes(o.n)), (x) => x.outcomes.map((o) => o.n).filter((n) => sub.outcomes.includes(n)));
        items.push({ id: `${link.strand}.${sub.id}`, label: sub.name, title: sub.in_hsc, covered: by.length > 0, lessons: by });
      }
    }
    return { line, heading, items, outcomes: [...outcomes].sort((a, b) => a - b) };
  });

  const taughtIds = new Set(lessons.flatMap((l) => taught(l).map((p) => p.id)));
  const reached = new Set(lessons.flatMap((l) => taught(l).flatMap((p) => p.outcomes.map((o) => o.n))));
  return {
    area,
    rows,
    gaps: {
      points: points.filter((p) => !taughtIds.has(p.id)).map((p) => p.id),
      outcomes: doc.outcomes.map((o) => o.n).filter((n) => !reached.has(n))
    }
  };
}
