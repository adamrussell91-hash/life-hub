import type { SkillsContinuum } from '@/skills/schema';
import { focusAreaFor } from './coverage';
import { conceptKeyOf } from './model';
import type { Alignment, AlignmentPoint } from './schema';

/**
 * The year's syllabus coverage (Scope & Sequence → Coverage): every concept,
 * skills strand and outcome down the side, each focus area across the top.
 * A cell holds the lessons whose dot points core-link it, so nothing extra is
 * tagged. Pure: no DOM, unit tested directly.
 *
 * A focus area is "planned" once a lesson tags one of its dot points. In a
 * planned area an expected item with no lesson is a gap; in an area still to
 * come it is only expected.
 */

export type YearLesson = { id: string; title: string; href?: string; dot_points?: readonly string[] };
export type YearUnit = { id: string; title: string; focusArea?: string; lessons: readonly YearLesson[] };

export type CellState = 'taught' | 'extra' | 'gap' | 'later' | 'none';
export type CoverageCell = { state: CellState; lessons: YearLesson[] };
export type CoverageRow = {
  id: string;
  name: string;
  detail?: string;
  cells: CoverageCell[];
  /** Areas that expect it, and how many of those teach it or leave a gap. */
  year: { expected: number; taught: number; gaps: number };
};
export type CoverageArea = {
  id: string;
  name: string;
  units: Array<{ id: string; title: string }>;
  lessonCount: number;
  tagged: number;
  planned: boolean;
  points: Array<{ id: string; short: string; lessons: YearLesson[] }>;
};
export type YearCoverage = {
  areas: CoverageArea[];
  concepts: CoverageRow[];
  skills: CoverageRow[];
  outcomes: CoverageRow[];
  /** Expected items with no lesson in the areas being taught. */
  gaps: Array<{ area: string; label: string }>;
};

const coreConcepts = (p: AlignmentPoint) => p.concepts.filter((c) => c.link === 'shared').map((c) => conceptKeyOf(c.ref));
const coreOutcomes = (p: AlignmentPoint) => p.outcomes.filter((o) => o.link === 'shared').map((o) => o.n);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function buildYearCoverage(doc: Alignment, skills: SkillsContinuum | null, units: readonly YearUnit[]): YearCoverage {
  // Each lesson once, with the points it teaches in each area.
  const lessonById = new Map<string, YearLesson>();
  for (const unit of units) for (const lesson of unit.lessons) if (!lessonById.has(lesson.id)) lessonById.set(lesson.id, lesson);

  const areas: CoverageArea[] = [];
  const taughtBy: Array<Map<string, YearLesson[]>> = [];
  for (const area of doc.focus_areas) {
    const own = units.filter((u) => focusAreaFor(doc, u.title, u.focusArea)?.id === area.id);
    const prefix = `${area.id}:`;
    const byPoint = new Map<string, YearLesson[]>();
    for (const lesson of lessonById.values()) {
      for (const ref of lesson.dot_points ?? []) {
        if (!ref.startsWith(prefix)) continue;
        const id = ref.slice(prefix.length);
        if (!area.points.some((p) => p.id === id)) continue;
        const list = byPoint.get(id) ?? [];
        if (!list.includes(lesson)) list.push(lesson);
        byPoint.set(id, list);
      }
    }
    const inUnits = new Set(own.flatMap((u) => u.lessons.map((l) => l.id)));
    const tagged = new Set([...byPoint.values()].flat().map((l) => l.id));
    areas.push({
      id: area.id,
      name: area.name,
      units: own.map((u) => ({ id: u.id, title: u.title })),
      lessonCount: inUnits.size,
      tagged: tagged.size,
      planned: tagged.size > 0,
      points: area.points.map((p) => ({ id: p.id, short: p.short, lessons: byPoint.get(p.id) ?? [] }))
    });
    taughtBy.push(byPoint);
  }

  /** The lessons in area `i` whose taught points satisfy `hits`. */
  const lessonsWhere = (i: number, hits: (p: AlignmentPoint) => boolean): YearLesson[] => {
    const out: YearLesson[] = [];
    for (const point of doc.focus_areas[i]!.points) {
      if (!hits(point)) continue;
      for (const lesson of taughtBy[i]!.get(point.id) ?? []) if (!out.includes(lesson)) out.push(lesson);
    }
    return out;
  };

  const gaps: YearCoverage['gaps'] = [];
  const row = (id: string, name: string, detail: string | undefined, expects: (i: number) => boolean, hits: (i: number, p: AlignmentPoint) => boolean): CoverageRow => {
    const year = { expected: 0, taught: 0, gaps: 0 };
    const cells = areas.map((area, i): CoverageCell => {
      const expected = expects(i);
      const lessons = lessonsWhere(i, (p) => hits(i, p));
      if (expected) year.expected += 1;
      if (lessons.length) {
        if (expected) year.taught += 1;
        return { state: expected ? 'taught' : 'extra', lessons };
      }
      if (!expected) return { state: 'none', lessons };
      if (area.planned) {
        year.gaps += 1;
        gaps.push({ area: area.name, label: name });
        return { state: 'gap', lessons };
      }
      return { state: 'later', lessons };
    });
    return { id, name, ...(detail ? { detail } : {}), cells, year };
  };

  const concepts = doc.concepts.map((c) =>
    row(`concept:${c.key}`, c.name, undefined, (i) => doc.focus_areas[i]!.points.some((p) => coreConcepts(p).includes(c.key)), (_i, p) => coreConcepts(p).includes(c.key))
  );

  // A strand belongs to a point when one of its sub-strands names that point as core.
  const strandPoints = (strand: string, areaId: string) => new Set(
    skills?.strands.find((s) => s.strand === strand)?.sub_strands
      .flatMap((sub) => sub.points.filter((x) => x.link === 'shared' && x.area === areaId).map((x) => x.point)) ?? []
  );
  const skillRows = (skills?.strands ?? []).map((s) => {
    const byArea = doc.focus_areas.map((a) => strandPoints(s.strand, a.id));
    return row(`strand:${s.strand}`, s.name || cap(s.strand), undefined, (i) => byArea[i]!.size > 0, (i, p) => byArea[i]!.has(p.id));
  });

  const outcomes = doc.outcomes.map((o) =>
    row(`outcome:${o.n}`, o.code, o.text, (i) => doc.focus_areas[i]!.points.some((p) => coreOutcomes(p).includes(o.n)), (_i, p) => coreOutcomes(p).includes(o.n))
  );

  for (const area of areas) {
    if (!area.planned) continue;
    for (const p of area.points) if (!p.lessons.length) gaps.push({ area: area.name, label: `Dot point ${p.id}` });
  }

  return { areas, concepts, skills: skillRows, outcomes, gaps };
}
