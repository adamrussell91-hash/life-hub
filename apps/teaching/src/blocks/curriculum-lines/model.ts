import type { CurriculumLinesBlock } from '@/schemas/block';

/**
 * Pure model for the Curriculum lines block: resolves stations to lesson links
 * or text, derives interchanges and lays out both orientations. Nothing here
 * touches the DOM, so it is unit tested directly.
 */

export type LinesContent = CurriculumLinesBlock['content'];
export type LinesLevel = LinesContent['stations'][number]['level'];
export type LinesColour = LinesContent['strands'][number]['colour'];

/** A lesson the block may link to, already resolved for the viewer. */
export type LinesLesson = { id: string; title: string; href: string };

export type LinesTarget = { text: string; href?: string };

export type StationView = {
  id: string;
  week: number;
  level: LinesLevel;
  target: LinesTarget;
};

export type StrandView = {
  id: string;
  name: string;
  colour: string;
  stations: StationView[];
  firstWeek: number | null;
  masteredWeek: number | null;
};

export type InterchangeView = {
  week: number;
  /** Strand indexes the capsule spans, inclusive. */
  from: number;
  to: number;
  target: LinesTarget;
  kind: 'lesson' | 'checkpoint';
};

export type LinesModel = {
  weeks: number;
  strands: StrandView[];
  interchanges: InterchangeView[];
  terminus: LinesTarget & { detail?: string; when: string };
};

/* ── Colour: the transit map's line colours ────────────────────────── */

/**
 * Tasks Lines draws each line in its domain colour and every second line in a
 * deeper shade (30 % toward depth). These are the same colours, as tokens.
 */
const BASE_COLOUR: Record<string, [token: string, fallback: string]> = {
  wave: ['--wave', '#376fb7'],
  green: ['--success', '#2f7a4f'],
  amber: ['--high-sea-ink', '#a85a0c'],
  lilac: ['--pastel-lilac-ink', '#5d4e70'],
  navy: ['--navy-2', '#244f7c']
};

export const COLOUR_ORDER: readonly LinesColour[] = [
  'wave', 'green', 'amber', 'lilac', 'navy', 'wave_deep', 'green_deep', 'amber_deep', 'lilac_deep', 'navy_deep'
];

export const COLOUR_LABEL: Record<LinesColour, string> = {
  wave: 'Wave blue', wave_deep: 'Deep blue',
  green: 'Green', green_deep: 'Deep green',
  amber: 'Amber', amber_deep: 'Deep amber',
  lilac: 'Lilac', lilac_deep: 'Deep lilac',
  navy: 'Navy', navy_deep: 'Deep navy'
};

export function strandColour(colour: LinesColour): string {
  const deep = colour.endsWith('_deep');
  const [token, fallback] = BASE_COLOUR[colour.replace('_deep', '')] ?? BASE_COLOUR.wave!;
  const base = `var(${token}, ${fallback})`;
  return deep ? `color-mix(in srgb, ${base} 70%, var(--depth, #0a1536))` : base;
}

export function nextColour(used: readonly LinesColour[]): LinesColour {
  return COLOUR_ORDER.find((c) => !used.includes(c)) ?? COLOUR_ORDER[used.length % COLOUR_ORDER.length]!;
}

/* ── Resolve and derive ────────────────────────────────────────────── */

export const LEVEL_WORD: Record<LinesLevel, string> = {
  introduced: 'introduced',
  reinforced: 'reinforced',
  mastered: 'mastered'
};

export function resolveTarget(
  label: string,
  lessonId: string | undefined,
  lessons: ReadonlyMap<string, LinesLesson> | null
): LinesTarget {
  const lesson = lessonId ? lessons?.get(lessonId) : undefined;
  if (lesson) return { text: label.trim() || lesson.title || 'Lesson', href: lesson.href };
  return { text: label.trim() || (lessonId ? 'Lesson' : '') };
}

/**
 * `lessons` is the list the viewer may open (teacher: the unit's lessons;
 * student: the published ones). A lesson missing from it shows as its saved
 * label without a link. Undefined means no lesson context at all.
 */
export function buildLinesModel(content: LinesContent, lessons?: readonly LinesLesson[]): LinesModel {
  const byId = lessons ? new Map(lessons.map((l) => [l.id, l])) : null;
  const weeks = Math.max(1, content.weeks);
  const strandIndex = new Map(content.strands.map((s, i) => [s.id, i]));

  const strands: StrandView[] = content.strands.map((strand) => {
    const seen = new Set<number>();
    const stations = content.stations
      .filter((st) => st.strand_id === strand.id && st.week >= 1 && st.week <= weeks)
      .filter((st) => (seen.has(st.week) ? false : (seen.add(st.week), true)))
      .sort((a, b) => a.week - b.week)
      .map((st) => ({ id: st.id, week: st.week, level: st.level, target: resolveTarget(st.label, st.lesson_id, byId) }));
    return {
      id: strand.id,
      name: strand.name.trim() || 'Untitled strand',
      colour: strandColour(strand.colour),
      stations,
      firstWeek: stations[0]?.week ?? null,
      masteredWeek: stations.find((st) => st.level === 'mastered')?.week ?? null
    };
  });

  const interchanges: InterchangeView[] = [];
  const groups = new Map<string, Array<{ index: number; label: string; lessonId: string; week: number }>>();
  for (const st of content.stations) {
    const index = strandIndex.get(st.strand_id);
    if (!st.lesson_id || index === undefined || st.week > weeks) continue;
    const key = `${st.week}|${st.lesson_id}`;
    const list = groups.get(key) ?? [];
    if (!list.some((row) => row.index === index)) list.push({ index, label: st.label, lessonId: st.lesson_id, week: st.week });
    groups.set(key, list);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const indexes = list.map((row) => row.index);
    // The chip names the shared lesson; without access to it, just what it is.
    const lesson = resolveTarget('', list[0]!.lessonId, byId);
    interchanges.push({
      week: list[0]!.week,
      from: Math.min(...indexes),
      to: Math.max(...indexes),
      target: lesson.href ? lesson : { text: 'Taught together' },
      kind: 'lesson'
    });
  }
  for (const cp of content.checkpoints) {
    if (cp.week > weeks) continue;
    const indexes = cp.strand_ids.map((id) => strandIndex.get(id)).filter((i): i is number => i !== undefined);
    if (!indexes.length) continue;
    if (cp.lesson_id && groups.get(`${cp.week}|${cp.lesson_id}`)?.length) continue;
    interchanges.push({
      week: cp.week,
      from: Math.min(...indexes),
      to: Math.max(...indexes),
      target: resolveTarget(cp.label, cp.lesson_id, byId),
      kind: 'checkpoint'
    });
  }
  interchanges.sort((a, b) => a.week - b.week || a.from - b.from);

  const t = content.terminus;
  return {
    weeks,
    strands,
    interchanges,
    terminus: {
      ...resolveTarget(t.label || 'Assessment task', t.lesson_id, byId),
      detail: t.detail?.trim() || undefined,
      when: t.when?.trim() || 'Task'
    }
  };
}

/* ── Geometry ──────────────────────────────────────────────────────── */

/** Station and track sizes come from the Tasks Lines reference (TRANSIT_G). */
export const LINES_G = {
  trackW: 7,
  r: 8,
  rMastered: 11,
  haloGap: 5,
  stroke: { open: 3.5, mastered: 4.5, filled: 2.5 },
  capsule: 15,
  chipH: 26,
  chipGap: 6,
  /* vertical (desktop) */
  gutter: 150,
  padR: 16,
  minCol: 118,
  maxCol: 180,
  headH: 92,
  rowMin: 96,
  termH: 54,
  /* horizontal (phone) */
  hStep: 128,
  hPadL: 56,
  hTrackTop: 54,
  hRowStep: 104,
  hTermW: 56
} as const;

export type Orientation = 'vertical' | 'horizontal';

/** Vertical when every strand gets a readable column; otherwise swipe sideways. */
export function chooseOrientation(width: number, strandCount: number): Orientation {
  const need = LINES_G.gutter + LINES_G.padR + Math.max(1, strandCount) * LINES_G.minCol;
  return width >= Math.max(600, need) ? 'vertical' : 'horizontal';
}

export function chipsByWeek(model: LinesModel): Map<number, InterchangeView[]> {
  const map = new Map<number, InterchangeView[]>();
  for (const ic of model.interchanges) map.set(ic.week, [...(map.get(ic.week) ?? []), ic]);
  return map;
}

export type VerticalLayout = {
  width: number;
  height: number;
  colX: number[];
  colStep: number;
  rowY: number[]; // index 0 unused; rowY[w] for week w
  termY: number;
};

export function verticalLayout(model: LinesModel, width: number): VerticalLayout {
  const n = Math.max(1, model.strands.length);
  const colStep = Math.min(LINES_G.maxCol, (width - LINES_G.gutter - LINES_G.padR) / n);
  const plotW = colStep * n;
  const x0 = LINES_G.gutter + (width - LINES_G.gutter - LINES_G.padR - plotW) / 2;
  const colX = Array.from({ length: n }, (_, i) => x0 + colStep * (i + 0.5));
  const chips = chipsByWeek(model);
  const rowY: number[] = [0];
  let y = LINES_G.headH + 28;
  for (let w = 1; w <= model.weeks; w++) {
    rowY[w] = y;
    const k = chips.get(w)?.length ?? 0;
    y += Math.max(LINES_G.rowMin, 30 + k * (LINES_G.chipH + LINES_G.chipGap) + 12);
  }
  const termY = y + 4;
  return { width, height: termY + LINES_G.termH / 2 + 16, colX, colStep, rowY, termY };
}

export type HorizontalLayout = {
  width: number;
  height: number;
  colX: number[]; // index 0 unused; colX[w] for week w
  termX: number;
  rowY: number[];
  chipBand: number;
};

export function horizontalLayout(model: LinesModel): HorizontalLayout {
  const chips = chipsByWeek(model);
  const maxChips = Math.max(0, ...[...chips.values()].map((list) => list.length));
  const chipBand = maxChips * (LINES_G.chipH + LINES_G.chipGap);
  const colX: number[] = [0];
  for (let w = 1; w <= model.weeks; w++) colX[w] = LINES_G.hPadL + (w - 1) * LINES_G.hStep;
  const termX = LINES_G.hPadL + model.weeks * LINES_G.hStep - LINES_G.hStep * 0.25;
  const top = 28 + chipBand + LINES_G.hTrackTop;
  const rowY = model.strands.map((_, i) => top + i * LINES_G.hRowStep);
  const last = rowY[rowY.length - 1] ?? top;
  return { width: termX + LINES_G.hTermW / 2 + 20, height: last + 56, colX, termX, rowY, chipBand };
}
