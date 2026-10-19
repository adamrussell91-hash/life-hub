import { apiGet, apiPatch } from '@/api/client';
import { withAppBase } from '@/app/base-path';
import type { UnitNetworkEditorContext } from '@/blocks/curriculum-lines/editor';
import { NEW_BLOCK_LABEL, type NewBlockType } from '@/blocks/create-block';
import { blocksToSearchText } from '@/blocks/search-text';
import { isCurriculumLinesV2, type Block, type LineStop, type NetworkLine } from '@/schemas/block';
import type { Lesson, Subject, Unit } from '@/schemas';
import type { NetUnit } from '@/network/year';
import type { CurriculumResponse } from '@/teacher/nav';

/** Saves the subject's lines and keeps the loaded curriculum in step. */
export async function saveSubjectLines(curriculum: CurriculumResponse, subjectId: string, lines: NetworkLine[]): Promise<void> {
  await apiPatch<Subject>(`/api/subjects/${subjectId}`, { network_lines: lines });
  const subject = curriculum.subjects.find((s) => s.id === subjectId);
  if (subject) subject.network_lines = lines;
}

export async function saveLessonStops(curriculum: CurriculumResponse, lessonId: string, stops: LineStop[]): Promise<void> {
  await apiPatch<Lesson>(`/api/lessons/${lessonId}`, { line_stops: stops });
  const lesson = curriculum.lessons.find((l) => l.id === lessonId);
  if (lesson) lesson.line_stops = stops;
}

function blockLabel(block: Block): string {
  const kind = NEW_BLOCK_LABEL[block.block_type as NewBlockType] ?? block.block_type.replace(/_/g, ' ');
  const words = blocksToSearchText([block]).slice(0, 48).trim();
  return words ? `${kind}: ${words}${words.length >= 48 ? '…' : ''}` : kind;
}

/** Top-level blocks of a lesson, for a stop that points at one activity. */
export async function lessonBlockChoices(lessonId: string): Promise<Array<{ id: string; label: string }>> {
  const lesson = await apiGet<Lesson>(`/api/lessons/${lessonId}`);
  return (lesson.blocks ?? []).map((block) => ({ id: block.id, label: blockLabel(block) }));
}

function isoWeek(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

/**
 * Week bands from the class with the most scheduled lessons in this unit.
 * Weeks are numbered from the unit's first scheduled week.
 */
export function unitWeekBands(curriculum: CurriculumResponse, unit: Unit): Map<string, string> | undefined {
  const rows = curriculum.scheduled_lessons.filter((row) => row.unit_id === unit.id && unit.lesson_ids.includes(row.lesson_id));
  if (!rows.length) return undefined;
  const byClass = new Map<string, typeof rows>();
  for (const row of rows) byClass.set(row.class_id, [...(byClass.get(row.class_id) ?? []), row]);
  const best = [...byClass.values()].sort((a, b) => b.length - a.length)[0]!;
  const first = new Map<string, string>();
  for (const row of [...best].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!first.has(row.lesson_id)) first.set(row.lesson_id, row.date);
  }
  const weeks = [...new Set([...first.values()].map(isoWeek))].sort();
  const bands = new Map<string, string>();
  for (const [lessonId, date] of first) bands.set(lessonId, `Wk ${weeks.indexOf(isoWeek(date)) + 1}`);
  // A band only helps when the lessons in unit order fall in date order.
  const ordered = unit.lesson_ids.filter((id) => bands.has(id));
  const sorted = [...ordered].sort((a, b) => first.get(a)!.localeCompare(first.get(b)!));
  return ordered.join() === sorted.join() && ordered.length === unit.lesson_ids.length ? bands : undefined;
}

function unitLessons(curriculum: CurriculumResponse, unit: Unit) {
  const byId = new Map(curriculum.lessons.map((l) => [l.id, l]));
  return unit.lesson_ids
    .map((id) => byId.get(id))
    .filter((l): l is NonNullable<typeof l> => Boolean(l) && l!.status !== 'trashed');
}

/** Everything a unit map (and its editor) needs on a teacher page. */
export function unitNetworkContext(curriculum: CurriculumResponse, unit: Unit): UnitNetworkEditorContext {
  const subject = curriculum.subjects.find((s) => s.id === unit.subject_id);
  const bands = unitWeekBands(curriculum, unit);
  return {
    lines: subject?.network_lines ?? [],
    lessons: unitLessons(curriculum, unit).map((l) => ({
      id: l.id,
      title: l.title,
      href: withAppBase(`/lessons/${l.id}`),
      ...(l.line_stops ? { line_stops: l.line_stops } : {})
    })),
    ...(bands ? { bands } : {}),
    ...(subject ? { saveLines: (lines: NetworkLine[]) => saveSubjectLines(curriculum, subject.id, lines) } : {}),
    saveLessonStops: (lessonId, stops) => saveLessonStops(curriculum, lessonId, stops),
    lessonBlocks: lessonBlockChoices
  };
}

/** Light-rail lines with a stop in a unit's map blocks. */
export function unitRailLineIds(unit: Pick<Unit, 'blocks'>): string[] {
  const ids = new Set<string>();
  for (const block of unit.blocks ?? []) {
    if (block.block_type !== 'curriculum_lines' || !isCurriculumLinesV2(block.content)) continue;
    for (const stop of block.content.rail_stops) ids.add(stop.line_id);
  }
  return [...ids];
}

/** The subject's units in scope and sequence order, for the year network. */
export function yearNetworkUnits(curriculum: CurriculumResponse, subjectId: string): Array<NetUnit & { lesson_ids: string[] }> {
  const subject = curriculum.subjects.find((s) => s.id === subjectId);
  const scope = subject?.scope_id ? curriculum.scope_sequences.find((s) => s.id === subject.scope_id) : undefined;
  const live = curriculum.units.filter((u) => u.subject_id === subjectId && u.status !== 'trashed' && u.status !== 'archived');
  const order = new Map<string, number>();
  [...(scope?.timeline_items ?? [])]
    .filter((item) => item.kind === 'unit')
    .sort((a, b) => a.start_week - b.start_week || a.order - b.order)
    .forEach((item, i) => { if (item.kind === 'unit' && !order.has(item.unit_id)) order.set(item.unit_id, i); });
  const units = live
    .filter((u) => order.size === 0 || order.has(u.id))
    .sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999) || a.title.localeCompare(b.title));
  return units.map((unit) => ({
    id: unit.id,
    title: unit.title,
    href: withAppBase(`/units/${unit.id}`),
    lesson_ids: unit.lesson_ids,
    lessons: unitLessons(curriculum, unit).map((l) => ({
      id: l.id,
      title: l.title,
      ...(l.line_stops ? { line_stops: l.line_stops } : {}),
      ...(l.outcome_ids ? { outcome_ids: l.outcome_ids } : {})
    })),
    railLineIds: unitRailLineIds(unit)
  }));
}
