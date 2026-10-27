import { apiGet, apiPatch } from '@/api/client';
import { withAppBase } from '@/app/base-path';
import { subjectUsesAlignment } from '@/alignment/model';
import type { UnitNetworkEditorContext } from '@/blocks/curriculum-lines/editor';
import { NEW_BLOCK_LABEL, type NewBlockType } from '@/blocks/create-block';
import { blocksToSearchText } from '@/blocks/search-text';
import { isCurriculumLinesV2, type Block, type CurriculumLinesV2Content, type LineStop, type NetworkLine } from '@/schemas/block';
import type { Lesson, LessonRouteRole, Subject, Unit } from '@/schemas';
import type { FlowPeer } from '@/network/lesson-flow';
import { patchScheduledLesson, postScheduledLesson } from '@/teacher/schedule-api';
import type { NetUnit } from '@/network/year';
import { orderStations, placeByDate } from '@/network/model';
import { hangSides } from '@/network/flow';
import { linesBefore } from '@/alignment/auto-lines';
import type { CurriculumResponse } from '@/teacher/nav';
import { httpMarkbookApi } from '@/markbook/api';
import { markbookEvidence } from '@/evidence/markbook-evidence';
import type { ClassEvidence } from '@/network/coverage-map/mount';
import type { Alignment } from '@/alignment/schema';
import { focusAreaFor } from '@/alignment/coverage';
import type { SkillsContinuum } from '@/skills/schema';
import { conceptLineIds, skillLineIds, unitConceptKeys, unitLines, unitSkillStrands } from '@/network/unit-concepts';

/** The classes that teach a unit: scheduled lessons from it, or the unit marked active. */
export function unitClasses(curriculum: CurriculumResponse, unit: Unit): Array<{ id: string; name: string }> {
  const ids = new Set(curriculum.scheduled_lessons.filter((row) => row.unit_id === unit.id).map((row) => row.class_id));
  return curriculum.classes
    .filter((c) => c.status !== 'trashed' && (ids.has(c.id) || c.active_unit_ids.includes(unit.id)))
    .map((c) => ({ id: c.id, name: c.display_name || c.code }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** A class's quiz and markbook evidence, scores and ticked lessons, for one student's view of the coverage map. */
export async function loadClassEvidence(classId: string): Promise<ClassEvidence> {
  const view = await httpMarkbookApi.load(classId);
  const scores = new Map<string, Map<string, { score: number; max: number }>>();
  for (const quiz of view.quizzes) {
    if (quiz.hidden) continue;
    const by = new Map<string, { score: number; max: number }>();
    for (const [student, s] of Object.entries(quiz.scores)) by.set(student, { score: s.score, max: s.max });
    scores.set(quiz.lesson_id, by);
  }
  return {
    students: view.students.filter((s) => !s.removed).map((s) => ({ id: s.id, name: s.name })),
    evidence: markbookEvidence(view).evidence,
    scores,
    took: { ...(view.markbook.took ?? {}) }
  };
}

/** Saves the subject's lines and keeps the loaded curriculum in step. */
export async function saveSubjectLines(curriculum: CurriculumResponse, subjectId: string, lines: NetworkLine[]): Promise<void> {
  await apiPatch<Subject>(`/api/subjects/${subjectId}`, { network_lines: lines });
  const subject = curriculum.subjects.find((s) => s.id === subjectId);
  if (subject) subject.network_lines = lines;
}

export async function saveLessonStops(curriculum: CurriculumResponse, lessonId: string, stops: LineStop[], off: string[]): Promise<void> {
  await apiPatch<Lesson>(`/api/lessons/${lessonId}`, { line_stops: stops, line_off: off });
  const lesson = curriculum.lessons.find((l) => l.id === lessonId);
  if (lesson) {
    lesson.line_stops = stops;
    lesson.line_off = off;
  }
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
 * Each lesson's first date (and start time) for the class with the most
 * scheduled lessons in this unit, and its week band, numbered from the unit's
 * first scheduled week. A skipped lesson has no date: it keeps its place.
 * Lessons taught before the unit starts are "Pre" and don't count as weeks.
 */
export function unitSchedule(curriculum: CurriculumResponse, unit: Unit): { dates: Map<string, string>; bands: Map<string, string> } | undefined {
  const rows = curriculum.scheduled_lessons.filter(
    (row) => row.unit_id === unit.id && unit.lesson_ids.includes(row.lesson_id) && row.delivery_status !== 'skipped'
  );
  if (!rows.length) return undefined;
  const byClass = new Map<string, typeof rows>();
  for (const row of rows) byClass.set(row.class_id, [...(byClass.get(row.class_id) ?? []), row]);
  const best = [...byClass.values()].sort((a, b) => b.length - a.length)[0]!;
  const when = (row: (typeof rows)[number]) => `${row.date}T${row.start_time ?? '00:00'}`;
  const dates = new Map<string, string>();
  for (const row of [...best].sort((a, b) => when(a).localeCompare(when(b)))) {
    if (!dates.has(row.lesson_id)) dates.set(row.lesson_id, when(row));
  }
  const pre = new Set(curriculum.lessons.filter((l) => l.pre_unit && unit.lesson_ids.includes(l.id)).map((l) => l.id));
  const weeks = [...new Set([...dates].filter(([id]) => !pre.has(id)).map(([, d]) => isoWeek(d.slice(0, 10))))].sort();
  const bands = new Map<string, string>();
  for (const [lessonId, d] of dates) bands.set(lessonId, pre.has(lessonId) ? 'Pre' : `Wk ${weeks.indexOf(isoWeek(d.slice(0, 10))) + 1}`);
  for (const id of pre) if (!bands.has(id)) bands.set(id, 'Pre');
  return { dates, bands };
}

function unitLessons(curriculum: CurriculumResponse, unit: Unit) {
  const byId = new Map(curriculum.lessons.map((l) => [l.id, l]));
  return unit.lesson_ids
    .map((id) => byId.get(id))
    .filter((l): l is NonNullable<typeof l> => Boolean(l) && l!.status !== 'trashed');
}

/**
 * The lines any lesson before this one stops on, in the unit map's order
 * (calendar dates first, then the map's own order; lessons left off the map
 * don't count). An auto stop on a line not yet seen is Introduced.
 */
export function linesBeforeOnMap(curriculum: CurriculumResponse, unit: Unit, lessonId: string): Set<string> {
  const content = unitMapContent(unit);
  const hidden = new Set(content?.hidden_lessons ?? []);
  const ordered = placeByDate(orderStations(unitLessons(curriculum, unit), content?.station_order), unitSchedule(curriculum, unit)?.dates);
  return linesBefore(ordered.filter((l) => l.id === lessonId || !hidden.has(l.id)), lessonId);
}

/** The subject's lines a lesson in this unit shows: the unit map's concepts among the metro lines, its skills among the light rail. */
export function unitLessonLines(unit: Unit, lines: readonly NetworkLine[]): NetworkLine[] {
  return unitLines(lines, unitMapContent(unit)?.concept_lines, unitMapContent(unit)?.skill_lines);
}

/**
 * Unit maps with no concepts picked get the focus area's own (see
 * unitConceptKeys), so the map, its lessons and the class site show those
 * few. Null when nothing changes.
 */
export function settleConceptLines<B extends Block>(blocks: readonly B[], lines: readonly NetworkLine[], doc: Alignment, unitTitle: string): B[] | null {
  let changed = false;
  const next = blocks.map((block) => {
    if (block.block_type !== 'curriculum_lines' || !isCurriculumLinesV2(block.content) || block.content.concept_lines?.length) return block;
    const area = focusAreaFor(doc, unitTitle, block.content.focus_area);
    const ids = area ? conceptLineIds(lines, unitConceptKeys(doc, area.id), doc.concepts) : [];
    if (!ids.length) return block;
    changed = true;
    return { ...block, content: { ...block.content, concept_lines: ids } };
  });
  return changed ? next : null;
}

/**
 * Unit maps with no skills picked get the focus area's own strands (see
 * unitSkillStrands). Null when nothing changes.
 */
export function settleSkillLines<B extends Block>(blocks: readonly B[], lines: readonly NetworkLine[], doc: Alignment, skills: SkillsContinuum, unitTitle: string): B[] | null {
  let changed = false;
  const next = blocks.map((block) => {
    if (block.block_type !== 'curriculum_lines' || !isCurriculumLinesV2(block.content) || block.content.skill_lines?.length) return block;
    const area = focusAreaFor(doc, unitTitle, block.content.focus_area);
    const ids = area ? skillLineIds(lines, unitSkillStrands(doc, skills, area.id)) : [];
    if (!ids.length) return block;
    changed = true;
    return { ...block, content: { ...block.content, skill_lines: ids } };
  });
  return changed ? next : null;
}

function unitMapContent(unit: Unit): CurriculumLinesV2Content | undefined {
  for (const block of unit.blocks ?? []) {
    if (block.block_type === 'curriculum_lines' && isCurriculumLinesV2(block.content)) return block.content;
  }
  return undefined;
}

/**
 * The unit's lessons for a lesson's Before and after, in the unit map's order
 * (dates first, then the map's own order). Lessons left off the map are left
 * out; this lesson stays, after the lesson its support or extension stop follows.
 */
export function unitFlowPeers(curriculum: CurriculumResponse, unit: Unit, lessonId: string): FlowPeer[] {
  const content = unitMapContent(unit);
  const hidden = new Set(content?.hidden_lessons ?? []);
  const ordered = placeByDate(orderStations(unitLessons(curriculum, unit), content?.station_order), unitSchedule(curriculum, unit)?.dates);
  const shown = ordered.filter((l) => !hidden.has(l.id));
  const self = ordered.find((l) => l.id === lessonId);
  if (self && hidden.has(lessonId)) {
    const follows = content?.rail_stops.find((stop) => stop.lesson_id === lessonId)?.after_lesson_id;
    const at = follows ? shown.findIndex((l) => l.id === follows) : -1;
    shown.splice(at < 0 ? shown.length : at + 1, 0, self);
  }
  const role = (l: Pick<Lesson, 'id' | 'route_role'>) => lessonRouteRole(unit, l);
  const railAfter = (id: string) => content?.rail_stops.find((s) => s.lesson_id === id && s.kind !== 'stop')?.after_lesson_id;
  const byId = new Map(shown.map((l) => [l.id, l]));
  // As on the map: each side lesson straight after the core lesson it branches off.
  const isSide = (id: string) => { const r = role(byId.get(id)!); return Boolean(r && r !== 'core'); };
  const { order } = hangSides(shown.map((l) => l.id), isSide, (id) => byId.get(id)!.branch_from ?? railAfter(id));
  return order.map((id) => {
    const l = byId.get(id)!;
    const r = role(l);
    return {
      id: l.id,
      title: l.title,
      ...(l.after_lesson_ids ? { after: l.after_lesson_ids } : {}),
      ...(r ? { role: r } : {}),
      ...(l.branch_from ? { branchFrom: l.branch_from } : {})
    };
  });
}

/** A lesson's place on the route: its own role, else the support or extension stop on the unit map that names it. */
export function lessonRouteRole(unit: Unit, lesson: Pick<Lesson, 'id' | 'route_role'>): LessonRouteRole | undefined {
  if (lesson.route_role) return lesson.route_role;
  const stop = unitMapContent(unit)?.rail_stops.find((s) => s.lesson_id === lesson.id && s.kind !== 'stop');
  return stop && stop.kind !== 'stop' ? stop.kind : undefined;
}

/** The classes that teach a unit, with this lesson's first date in each. */
export function lessonClassDates(curriculum: CurriculumResponse, unit: Unit, lessonId: string): Array<{ id: string; name: string; date?: string }> {
  return unitClasses(curriculum, unit).map((c) => {
    const dates = curriculum.scheduled_lessons
      .filter((row) => row.class_id === c.id && row.lesson_id === lessonId && row.delivery_status !== 'skipped')
      .map((row) => row.date)
      .sort();
    return dates[0] ? { ...c, date: dates[0] } : c;
  });
}

/** Dates a lesson for a class: moves its first scheduled row there, or schedules it. */
export async function setLessonDate(curriculum: CurriculumResponse, unit: Unit, lessonId: string, classId: string, date: string): Promise<void> {
  const row = curriculum.scheduled_lessons
    .filter((r) => r.class_id === classId && r.lesson_id === lessonId && r.delivery_status !== 'skipped')
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const saved = row
    ? await patchScheduledLesson(row.id, { date })
    : await postScheduledLesson({ class_id: classId, lesson_id: lessonId, unit_id: unit.id, date, move_existing: true });
  curriculum.scheduled_lessons = [...curriculum.scheduled_lessons.filter((r) => r.id !== saved.id), saved];
}

/** Everything a unit map (and its editor) needs on a teacher page. */
export function unitNetworkContext(curriculum: CurriculumResponse, unit: Unit): UnitNetworkEditorContext {
  const subject = curriculum.subjects.find((s) => s.id === unit.subject_id);
  const schedule = unitSchedule(curriculum, unit);
  return {
    lines: subject?.network_lines ?? [],
    lessons: unitLessons(curriculum, unit).map((l) => ({
      id: l.id,
      title: l.title,
      href: withAppBase(`/lessons/${l.id}`),
      ...(l.line_stops ? { line_stops: l.line_stops } : {}),
      ...(l.line_off ? { line_off: l.line_off } : {}),
      ...(l.after_lesson_ids ? { after: l.after_lesson_ids } : {}),
      ...(l.dot_points ? { dot_points: l.dot_points } : {}),
      ...(l.route_role ? { role: l.route_role } : {}),
      ...(l.skip_rule ? { skip: l.skip_rule } : {}),
      ...(l.branch_from ? { branchFrom: l.branch_from } : {}),
      ...(l.pedagogical_mode === 'quiz' ? { quiz: true } : {})
    })),
    unitTitle: unit.title,
    classes: unitClasses(curriculum, unit),
    loadClass: loadClassEvidence,
    saveTook: async (classId, studentId, lessonIds) => { await httpMarkbookApi.setTook(classId, studentId, lessonIds); },
    usesAlignment: subject ? subjectUsesAlignment(subject.title) : false,
    ...(schedule ? { bands: schedule.bands, dates: schedule.dates } : {}),
    ...(subject ? { saveLines: (lines: NetworkLine[]) => saveSubjectLines(curriculum, subject.id, lines) } : {}),
    saveLessonStops: (lessonId, stops, off) => saveLessonStops(curriculum, lessonId, stops, off),
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
