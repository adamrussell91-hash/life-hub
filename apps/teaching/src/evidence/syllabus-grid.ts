import type { Alignment, AlignmentPoint } from '@/alignment/schema';
import type { OutcomeLabel } from '@/markbook/types';
import { RUNG_IDS, type RungId, type SkillsContinuum } from '@/skills/schema';
import { GRID, RUNG_CUTS } from './constants';
import { catalogueId, pointTag } from './syllabus';
import { studentBand } from './patterns';
import { tagLabel, type TagContext } from './tags';
import type { Evidence, StudentBand } from './types';

/**
 * The syllabus Grid: one row per dot point, one column per student. A row opens
 * into its outcomes, concept bullets, skills and techniques. Evidence reaches
 * a dot point through `dp:` tags (quiz items via their lesson, assessment
 * criteria via the outcomes the point shares), so rows only read tagged marks.
 */

/** Where a student sits on a skill: under Capable, or on a rung of the ladder. */
export type Rung = 'below' | RungId;
export const RUNG_LETTER: Record<RungId, string> = { capable: 'C', skilled: 'S', accomplished: 'A', excellent: 'E' };
export const RUNG_NAME: Record<RungId, string> = { capable: 'Capable', skilled: 'Skilled', accomplished: 'Accomplished', excellent: 'Excellent' };

export function rungOf(mean: number): Rung {
  if (mean >= RUNG_CUTS.excellent) return 'excellent';
  if (mean >= RUNG_CUTS.accomplished) return 'accomplished';
  if (mean >= RUNG_CUTS.skilled) return 'skilled';
  if (mean >= RUNG_CUTS.capable) return 'capable';
  return 'below';
}

const rungIndex = (r: Rung): number => (r === 'below' ? -1 : RUNG_IDS.indexOf(r));

/** The highest rung that at least half the rated students have reached; `below` when none. Null with nobody rated. */
export function classRung(rungs: Array<Rung | null>): Rung | null {
  const rated = rungs.filter((r): r is Rung => r !== null);
  if (!rated.length) return null;
  for (const id of [...RUNG_IDS].reverse()) {
    if (rated.filter((r) => rungIndex(r) >= RUNG_IDS.indexOf(id)).length * 2 >= rated.length) return id;
  }
  return 'below';
}

export type GridCell = { band: StudentBand | null; rung: Rung | null; mean: number | null; items: number };
export type Counts = Record<StudentBand, number> & { none: number };
export type GridLine = {
  tag: string;
  label: string;
  sub?: string;
  /** A skill: cells carry a rung, not a band. */
  ladder: boolean;
  cells: Record<string, GridCell>;
  mean: number | null;
  spread: Counts;
  classRung: Rung | null;
};
export type ConceptLine = { ref: string; name: string; text: string; link: 'shared' | 'related' };
export type PointRow = {
  tag: string;
  area: string;
  areaName: string;
  point: AlignmentPoint;
  label: string;
  /** Position in the syllabus, for syllabus order. */
  order: number;
  line: GridLine;
  weak: string[];
  outcomes: GridLine[];
  concepts: ConceptLine[];
  skills: GridLine[];
  techniques: GridLine[];
};

const avg = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;

function lineFor(evidence: Evidence[], tag: string, label: string, students: readonly string[], ladder: boolean, sub?: string): GridLine {
  const mine = evidence.filter((e) => e.share !== null && e.tags.includes(tag));
  const cells: Record<string, GridCell> = {};
  const spread: Counts = { weak: 0, developing: 0, secure: 0, none: 0 };
  const rungs: Array<Rung | null> = [];
  for (const student of students) {
    const items = mine.filter((e) => e.student === student);
    if (items.length < GRID.minItems) {
      cells[student] = { band: null, rung: null, mean: null, items: items.length };
      spread.none += 1;
      rungs.push(null);
      continue;
    }
    const mean = avg(items.map((e) => e.share as number));
    const band = studentBand(mean);
    cells[student] = { band: ladder ? null : band, rung: ladder ? rungOf(mean) : null, mean, items: items.length };
    spread[band] += 1;
    rungs.push(ladder ? rungOf(mean) : null);
  }
  const marked = mine.filter((e) => cells[e.student] !== undefined && cells[e.student]!.items >= GRID.minItems);
  return { tag, label, sub, ladder, cells, mean: marked.length ? avg(marked.map((e) => e.share as number)) : null, spread, classRung: ladder ? classRung(rungs) : null };
}

/** Lines for every tag of `kind` among `evidence`, weakest first. */
function linesOf(evidence: Evidence[], kind: string, students: readonly string[], ctx: TagContext, ladder: boolean): GridLine[] {
  const tags = [...new Set(evidence.flatMap((e) => e.tags.filter((t) => t.startsWith(`${kind}:`))))];
  return tags
    .map((tag) => lineFor(evidence, tag, tagLabel(tag, ctx), students, ladder))
    .sort((a, b) => (a.mean ?? 2) - (b.mean ?? 2) || a.label.localeCompare(b.label));
}

function outcomeLines(point: AlignmentPoint, alignment: Alignment, labels: readonly OutcomeLabel[], evidence: Evidence[], students: readonly string[], ctx: TagContext): GridLine[] {
  const linked = [...point.outcomes].sort((a, b) => (a.link === b.link ? a.n - b.n : a.link === 'shared' ? -1 : 1));
  const lines: GridLine[] = [];
  for (const { n } of linked) {
    const code = alignment.outcomes.find((o) => o.n === n)?.code;
    if (!code) continue;
    const id = catalogueId(code, labels);
    const tag = `out:${id}`;
    lines.push(lineFor(evidence, tag, tagLabel(tag, ctx), students, false, labels.find((l) => l.id === id)?.title));
  }
  return lines;
}

function conceptLines(point: AlignmentPoint, alignment: Alignment): ConceptLine[] {
  const out: ConceptLine[] = [];
  for (const { ref, link } of point.concepts) {
    const key = ref.replace(/\d+$/, '');
    const n = Number(ref.slice(key.length));
    const concept = alignment.concepts.find((c) => c.key === key);
    const bullet = concept?.bullets.find((b) => b.n === n);
    if (concept && bullet) out.push({ ref, name: concept.name, text: bullet.text, link });
  }
  return out;
}

/** Skill sub-strands the continuum says build this dot point. */
function skillTagsFor(skills: SkillsContinuum | null, area: string, id: string): string[] {
  const tags: string[] = [];
  for (const strand of skills?.strands ?? [])
    for (const sub of strand.sub_strands) if (sub.points.some((p) => p.area === area && p.point === id)) tags.push(`skill:${strand.strand}.${sub.id}`);
  return tags;
}

export function syllabusGrid(evidence: Evidence[], alignment: Alignment | null, labels: readonly OutcomeLabel[], ctx: TagContext, students: readonly string[]): PointRow[] {
  if (!alignment) return [];
  const listed = new Set(students);
  const mine = evidence.filter((e) => listed.has(e.student));
  const rows: PointRow[] = [];
  let order = 0;
  for (const area of alignment.focus_areas) {
    for (const point of area.points) {
      const tag = pointTag(area.id, point.id);
      const inside = mine.filter((e) => e.tags.includes(tag));
      const line = lineFor(inside, tag, tagLabel(tag, { ...ctx, alignment }), students, false, area.name);
      const skillTags = skillTagsFor(ctx.skills, area.id, point.id);
      // A skill row shows only where marks reach it; an unmarked one would be a row of grey.
      const skills = skillTags
        .filter((t) => inside.some((e) => e.tags.includes(t)))
        .map((t) => lineFor(inside, t, tagLabel(t, ctx), students, true))
        .sort((a, b) => (a.mean ?? 2) - (b.mean ?? 2));
      rows.push({
        tag,
        area: area.id,
        areaName: area.name,
        point,
        label: tagLabel(tag, { ...ctx, alignment }),
        order: order++,
        line,
        weak: students.filter((s) => line.cells[s]?.band === 'weak'),
        outcomes: outcomeLines(point, alignment, labels, inside, students, ctx),
        concepts: conceptLines(point, alignment),
        skills,
        techniques: linesOf(inside, 'tech', students, ctx, false)
      });
    }
  }
  return rows;
}

export type PointSort = 'weakest' | 'syllabus';

/** Weakest class mean first, or syllabus order; dot points with no marks last either way. */
export function sortPoints(rows: PointRow[], sort: PointSort): PointRow[] {
  return [...rows].sort((a, b) => {
    const missing = (a.line.mean === null ? 1 : 0) - (b.line.mean === null ? 1 : 0);
    if (missing) return missing;
    return sort === 'syllabus' ? a.order - b.order : (a.line.mean ?? 0) - (b.line.mean ?? 0) || a.order - b.order;
  });
}
