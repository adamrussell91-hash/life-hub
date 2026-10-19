import type {
  CurriculumLinesV1Content,
  CurriculumLinesV2Content,
  LineStop,
  NetworkLine,
  NetworkLineMode
} from '@/schemas/block';
import { lineColour } from './colour';
import type { NetInput, NetLevel, NetLine, NetRow, NetTarget } from './layout';

/** A lesson as the map sees it: unit order, the lines it serves, and a link when the viewer may open it. */
export type NetLesson = { id: string; title: string; href?: string; line_stops?: readonly LineStop[] };

export const MODE_ORDER: readonly NetworkLineMode[] = ['train', 'metro', 'light_rail'];
export const MODE_LABEL: Record<NetworkLineMode, string> = { train: 'Train', metro: 'Metro', light_rail: 'Light rail' };
export const MODE_HINT: Record<NetworkLineMode, string> = {
  train: 'Syllabus groupings',
  metro: 'Textual concepts',
  light_rail: 'Skills'
};
export const LEVEL_ORDER: readonly NetLevel[] = ['introduced', 'reinforced', 'mastered'];
export const LEVEL_RANK: Record<NetLevel, number> = { introduced: 0, reinforced: 1, mastered: 2 };

/** Subject order within each mode; trains first, then metro, then light rail. */
export function orderLines(lines: readonly NetworkLine[]): NetworkLine[] {
  return MODE_ORDER.flatMap((mode) => lines.filter((l) => l.mode === mode));
}

export function shortName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.map((w) => w[0]).join('').slice(0, 4).toUpperCase();
  return (words[0] ?? '').slice(0, 4).toUpperCase();
}

export function toNetLines(lines: readonly NetworkLine[]): NetLine[] {
  return orderLines(lines).map((line) => ({
    id: line.id,
    mode: line.mode,
    name: line.name.trim() || 'Untitled line',
    short: (line.short?.trim() || shortName(line.name) || '?').slice(0, 4),
    colour: lineColour(line.colour)
  }));
}

/** Train and metro stops keep their depth; light-rail stops have none. */
export function stopsFor(stops: readonly LineStop[] | undefined, lines: ReadonlyMap<string, NetworkLine>): Map<string, NetLevel | null> {
  const out = new Map<string, NetLevel | null>();
  for (const stop of stops ?? []) {
    const line = lines.get(stop.line_id);
    if (!line) continue;
    out.set(line.id, line.mode === 'light_rail' ? null : stop.level ?? 'reinforced');
  }
  return out;
}

function lessonTarget(label: string, lessonId: string | undefined, blockId: string | undefined, lessons: ReadonlyMap<string, NetLesson>): NetTarget {
  const lesson = lessonId ? lessons.get(lessonId) : undefined;
  const text = label.trim() || (lesson ? lesson.title || 'Lesson' : lessonId ? (blockId ? 'Activity' : 'Lesson') : '');
  if (!lesson?.href) return { text };
  return { text, href: blockId ? `${lesson.href}#block=${encodeURIComponent(blockId)}` : lesson.href };
}

/**
 * The unit map's input. `lessons` is the unit's lessons in order, already
 * limited to what the viewer may see; `bands` names each lesson's week.
 */
export function buildUnitNetwork(
  content: CurriculumLinesV2Content,
  subjectLines: readonly NetworkLine[],
  lessons: readonly NetLesson[],
  bands?: ReadonlyMap<string, string>
): NetInput {
  const lines = new Map(subjectLines.map((l) => [l.id, l]));
  const byId = new Map(lessons.map((l) => [l.id, l]));
  const rowIndex = new Map(lessons.map((l, i) => [l.id, i]));
  // A stop whose lesson left the unit falls to the end rather than vanishing.
  const afterRow = (id: string | undefined) => (id === undefined ? -1 : rowIndex.get(id) ?? lessons.length - 1);
  const rows: NetRow[] = lessons.map((lesson) => ({
    id: lesson.id,
    target: { text: lesson.title || 'Untitled lesson', ...(lesson.href ? { href: lesson.href } : {}) },
    stops: stopsFor(lesson.line_stops, lines),
    ...(bands?.get(lesson.id) ? { band: bands.get(lesson.id) } : {})
  }));
  const t = content.terminus;
  return {
    lines: toNetLines(subjectLines),
    rows,
    railStops: content.rail_stops
      .filter((stop) => lines.has(stop.line_id))
      .map((stop) => ({
        id: stop.id,
        lineId: stop.line_id,
        afterRow: afterRow(stop.after_lesson_id),
        kind: lines.get(stop.line_id)!.mode === 'light_rail' ? stop.kind : 'stop',
        target: lessonTarget(stop.label, stop.lesson_id, stop.block_id, byId)
      })),
    gates: content.gates.map((gate) => ({
      id: gate.id,
      afterRow: afterRow(gate.after_lesson_id),
      target: lessonTarget(gate.label || 'Checkpoint', gate.lesson_id, undefined, byId),
      lineIds: gate.line_ids.filter((id) => lines.has(id))
    })),
    nudges: content.nudges,
    terminus: {
      ...lessonTarget(t.label || 'Assessment task', t.lesson_id, undefined, byId),
      ...(t.detail?.trim() ? { detail: t.detail.trim() } : {}),
      when: t.when?.trim() || 'Task'
    },
    rowKind: 'lesson'
  };
}

/* ── Version 1 → version 2 ─────────────────────────────────────────── */

export type V1Conversion = {
  content: CurriculumLinesV2Content;
  /** The subject's lines after conversion (existing ones plus any new). */
  lines: NetworkLine[];
  /** Lines added to the subject. */
  added: NetworkLine[];
  /** Lessons whose line stops change, with their full new list. */
  lessonStops: Map<string, LineStop[]>;
};

function slug(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, '').slice(0, 40) || 'x';
}

/**
 * Converts a version 1 block. Each strand becomes a subject line (matched by
 * name, else a new train line); each station with a lesson becomes a stop on
 * that lesson; a station without one becomes a text stop after the last lesson
 * of its week; checkpoints become gates. Pure: the caller decides whether to
 * write the result (the "Upgrade this map" bar) or only draw it.
 */
export function convertV1(
  v1: CurriculumLinesV1Content,
  subjectLines: readonly NetworkLine[],
  lessons: readonly NetLesson[],
  blockId = 'map'
): V1Conversion {
  const lines = [...subjectLines];
  const added: NetworkLine[] = [];
  const byName = new Map(subjectLines.map((l) => [l.name.trim().toLowerCase(), l]));
  const strandLine = new Map<string, NetworkLine>();
  for (const strand of v1.strands) {
    const name = strand.name.trim() || 'Untitled strand';
    let line = byName.get(name.toLowerCase());
    if (!line) {
      let id = `line_${slug(blockId)}_${slug(strand.id)}`.slice(0, 64);
      while (lines.some((l) => l.id === id)) id = `${id.slice(0, 60)}_${lines.length}`;
      line = { id, mode: 'train', name, short: shortName(name), colour: strand.colour };
      lines.push(line);
      added.push(line);
      byName.set(name.toLowerCase(), line);
    }
    strandLine.set(strand.id, line);
  }

  const order = new Map(lessons.map((l, i) => [l.id, i]));
  const lessonsInWeek = new Map<number, string[]>();
  const note = (week: number, lessonId: string | undefined) => {
    if (!lessonId || !order.has(lessonId)) return;
    lessonsInWeek.set(week, [...(lessonsInWeek.get(week) ?? []), lessonId]);
  };
  for (const st of v1.stations) note(st.week, st.lesson_id);
  for (const cp of v1.checkpoints) note(cp.week, cp.lesson_id);
  const lastLessonBy = (week: number): string | undefined => {
    for (let w = week; w >= 1; w--) {
      const ids = lessonsInWeek.get(w);
      if (ids?.length) return [...ids].sort((x, y) => order.get(x)! - order.get(y)!).at(-1);
    }
    return undefined;
  };

  const lessonStops = new Map<string, LineStop[]>();
  const stopsOf = (lessonId: string) => {
    if (!lessonStops.has(lessonId)) {
      lessonStops.set(lessonId, [...(lessons.find((l) => l.id === lessonId)?.line_stops ?? [])]);
    }
    return lessonStops.get(lessonId)!;
  };
  const rail_stops: CurriculumLinesV2Content['rail_stops'] = [];
  const sorted = [...v1.stations].sort((x, y) => x.week - y.week);
  for (const st of sorted) {
    const line = strandLine.get(st.strand_id);
    if (!line || st.week > v1.weeks) continue;
    if (st.lesson_id && order.has(st.lesson_id)) {
      const list = stopsOf(st.lesson_id);
      const at = list.findIndex((s) => s.line_id === line.id);
      const level = line.mode === 'light_rail' ? undefined : st.level;
      if (at < 0) list.push(level ? { line_id: line.id, level } : { line_id: line.id });
      else if (level && LEVEL_RANK[level] > LEVEL_RANK[list[at]!.level ?? 'introduced']) list[at] = { line_id: line.id, level };
      continue;
    }
    const after = lastLessonBy(st.week);
    rail_stops.push({
      id: `stop_${slug(st.id)}`.slice(0, 64),
      line_id: line.id,
      ...(after ? { after_lesson_id: after } : {}),
      kind: 'stop',
      label: st.label
    });
  }
  // Only lessons whose list actually changed.
  for (const [id, list] of lessonStops) {
    const before = lessons.find((l) => l.id === id)?.line_stops ?? [];
    if (JSON.stringify(before) === JSON.stringify(list)) lessonStops.delete(id);
  }

  const gates: CurriculumLinesV2Content['gates'] = v1.checkpoints.slice(0, 12).map((cp) => {
    const after = cp.lesson_id && order.has(cp.lesson_id) ? cp.lesson_id : lastLessonBy(cp.week);
    return {
      id: `gate_${slug(cp.id)}`.slice(0, 64),
      ...(after ? { after_lesson_id: after } : {}),
      label: cp.label,
      ...(cp.lesson_id ? { lesson_id: cp.lesson_id } : {}),
      line_ids: cp.strand_ids.map((id) => strandLine.get(id)?.id).filter((id): id is string => Boolean(id))
    };
  });

  return {
    content: {
      version: 2,
      ...(v1.title ? { title: v1.title } : {}),
      rail_stops: rail_stops.slice(0, 60),
      gates,
      nudges: {},
      terminus: v1.terminus
    },
    lines: lines.slice(0, 24),
    added,
    lessonStops
  };
}

/** Lessons with the converted stops applied, for drawing a version 1 block before it is upgraded. */
export function withStops(lessons: readonly NetLesson[], stops: ReadonlyMap<string, LineStop[]>): NetLesson[] {
  return lessons.map((l) => (stops.has(l.id) ? { ...l, line_stops: stops.get(l.id) } : l));
}
