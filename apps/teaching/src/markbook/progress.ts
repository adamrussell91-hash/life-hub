import { apiPost } from '@/api/client';
import { el } from '@/quiz/dom';
import type { ScheduledLesson, Unit } from '@/schemas';
import type { DoneRecord, MarkbookView } from './types';

export type { DoneRecord };

/**
 * Lesson progress for the markbook's Marks & progress view: which lessons of the class's active units
 * each student has done. A tick is complete, a half circle is partial, a grey box is not for that
 * student, and a red dot means it is still not complete a week after its set date. Every lesson in
 * the unit is for every student, side lessons too; only a tutorial is for just the students in its groups.
 */

/** A lesson is late this many days after its set date. */
export const LATE_AFTER_DAYS = 7;

export type ProgressLesson = {
  id: string;
  title: string;
  role: 'core' | 'support' | 'extension' | 'optional';
  /** An assessment fills only when the teacher marks it. */
  assessment: boolean;
  /** The lesson's set date for this class, YYYY-MM-DD. */
  date?: string;
  /** The unit it belongs to, for the band above the columns. */
  unit?: string;
  /** A tutorial: only the students in its groups. Missing means every student. */
  students?: string[];
};

type TutorialGroups = { class_id: string; groups: ReadonlyArray<{ students: readonly string[] }> };

/**
 * The units' lessons, each once, with each lesson's earliest set date for the class, in date order.
 * Undated lessons follow the dated ones in unit order.
 */
export function unitProgressLessons(
  units: ReadonlyArray<Pick<Unit, 'lesson_ids'> & { title?: string }>,
  lessons: ReadonlyArray<{ id: string; title: string; status?: string; route_role?: ProgressLesson['role'] | null; pedagogical_mode?: string; tutorial?: TutorialGroups | null }>,
  scheduled: readonly (Pick<ScheduledLesson, 'lesson_id' | 'date'> & { delivery_status?: ScheduledLesson['delivery_status'] })[],
  /** The class, so a tutorial set for another class is for nobody here. */
  classId?: string
): ProgressLesson[] {
  const byId = new Map(lessons.map((l) => [l.id, l] as const));
  const out: ProgressLesson[] = [];
  const seen = new Set<string>();
  for (const unit of units)
  for (const id of unit.lesson_ids ?? []) {
    const lesson = byId.get(id);
    if (!lesson || lesson.status === 'trashed' || seen.has(id)) continue;
    seen.add(id);
    const dates = scheduled.filter((r) => r.lesson_id === id && r.date && r.delivery_status !== 'skipped').map((r) => r.date.slice(0, 10)).sort();
    out.push({
      id,
      title: lesson.title,
      role: lesson.route_role ?? 'core',
      assessment: lesson.pedagogical_mode === 'assessment',
      ...(dates[0] ? { date: dates[0] } : {}),
      ...(unit.title ? { unit: unit.title } : {}),
      ...(lesson.pedagogical_mode === 'tutorial' ? { students: tutorialStudents(lesson.tutorial, classId) } : {})
    });
  }
  return out.sort((a, b) => (a.date && b.date ? a.date.localeCompare(b.date) : a.date ? -1 : b.date ? 1 : 0));
}

function tutorialStudents(tutorial: TutorialGroups | null | undefined, classId: string | undefined): string[] {
  if (!tutorial || (classId && tutorial.class_id !== classId)) return [];
  return [...new Set(tutorial.groups.flatMap((g) => g.students))];
}

export type CellState = 'complete' | 'partial' | 'na' | 'open';
export type Cell = { state: CellState; late: boolean };

const addDays = (day: string, n: number): string => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export type CellInput = {
  lesson: ProgressLesson;
  record: DoneRecord | undefined;
  quizSubmitted: boolean;
  /** Handed in with nothing left to mark. */
  quizMarked?: boolean;
  quizStarted: boolean;
  /** The teacher ticked this lesson as taken for the student. */
  took: boolean;
  /** The lesson is set for this student: every lesson is, except a tutorial they aren't grouped in. */
  forStudent: boolean;
  today: string;
};

export function cellFor(input: CellInput): Cell {
  const { lesson, record, quizSubmitted, quizStarted, took, forStudent, today } = input;
  const teacherDone = (record?.via === 'teacher' && !record.partial) || Boolean(input.quizMarked);
  const studentDone = Boolean(record && !record.partial && record.via !== 'teacher') || quizSubmitted;
  let state: CellState;
  if (lesson.assessment) {
    // Handed in or ticked, but not yet marked, is partial. A fully marked quiz is complete.
    state = teacherDone ? 'complete' : studentDone || record?.partial ? 'partial' : 'open';
  } else if (teacherDone || studentDone) state = 'complete';
  else if (record?.partial || quizStarted) state = 'partial';
  else state = 'open';
  if (state === 'open' && !forStudent && !took) return { state: 'na', late: false };
  const late = state !== 'complete' && Boolean(lesson.date) && addDays(lesson.date!.slice(0, 10), LATE_AFTER_DAYS) < today;
  return { state, late };
}

export type ProgressApi = {
  /** Saves one mark and answers with that student's done records. */
  mark: (classId: string, studentId: string, lessonId: string, state: 'complete' | 'partial' | 'clear') => Promise<Record<string, DoneRecord>>;
};

export const httpProgressApi: ProgressApi = {
  mark: async (classId, studentId, lessonId, state) =>
    (await apiPost<{ done: Record<string, Record<string, DoneRecord>> }>(`/api/classes/${encodeURIComponent(classId)}/profile`, { action: 'mark', student_id: studentId, lesson_id: lessonId, state })).done[studentId] ?? {}
};

/** The student's records as they will be once a mark lands, so the cell can change before the save does. */
export function withMark(records: Record<string, DoneRecord>, lessonId: string, state: 'complete' | 'partial' | 'clear', at: string): Record<string, DoneRecord> {
  const held = records[lessonId];
  const own = held?.via === 'teacher' ? held.was : held;
  const out = { ...records };
  if (state === 'clear') {
    if (own) out[lessonId] = own;
    else delete out[lessonId];
  } else out[lessonId] = { at, via: 'teacher', ...(state === 'partial' ? { partial: true } : {}), ...(own ? { was: own } : {}) };
  return out;
}

/** A teacher's complete mark overrides the cell; a second press clears it back to what the student did. */
const isOverride = (record: DoneRecord | undefined): boolean => record?.via === 'teacher' && !record.partial;

const SYMBOL: Record<CellState, string> = { complete: '✓', partial: '◐', na: '', open: '' };
const WORD: Record<CellState, string> = { complete: 'complete', partial: 'partial', na: 'not for this student', open: 'not done' };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** 2026-10-12 → 12 Oct. */
export const shortDate = (day: string): string => `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1] ?? ''}`;

/** A lesson's state for one student, from their record, the lesson's quiz and saved work. */
export function lessonCell(view: MarkbookView, studentId: string, lesson: ProgressLesson, today: string): Cell {
  const quiz = view.quizzes.find((q) => q.lesson_id === lesson.id);
  const score = quiz?.scores?.[studentId];
  return cellFor({
    lesson,
    record: view.done?.[studentId]?.[lesson.id],
    quizSubmitted: Boolean(score?.submitted_at),
    quizMarked: Boolean(score?.submitted_at) && score!.pending === 0,
    // Written work saved in the lesson counts as under way, like a quiz go not handed in.
    quizStarted: Boolean(quiz?.started?.includes(studentId)) || Boolean(view.work?.find((w) => w.lesson_id === lesson.id)?.students[studentId]),
    took: (view.markbook.took?.[studentId] ?? []).includes(lesson.id),
    forStudent: !lesson.students || lesson.students.includes(studentId),
    today
  });
}

/**
 * One lesson box: a press marks it complete as the teacher's own mark, and a second press takes that
 * mark off so the box shows what the student did. A removed student's box can't be pressed.
 */
export function lessonButton(
  view: MarkbookView,
  student: { id: string; name: string; removed?: true },
  lesson: ProgressLesson,
  today: string,
  onMark: (studentId: string, lessonId: string, state: 'complete' | 'clear') => void
): HTMLElement {
  const cell = lessonCell(view, student.id, lesson, today);
  const override = isOverride(view.done?.[student.id]?.[lesson.id]);
  const b = el(student.removed ? 'span' : 'button', `mb-progress__btn mb-progress__btn--${cell.state}`, SYMBOL[cell.state]);
  if (b instanceof HTMLButtonElement) {
    b.type = 'button';
    b.addEventListener('click', () => onMark(student.id, lesson.id, override ? 'clear' : 'complete'));
  }
  b.dataset.col = `lesson:${lesson.id}`;
  b.dataset.student = student.id;
  b.dataset.lesson = lesson.id;
  b.dataset.state = cell.state;
  if (override) {
    b.dataset.override = 'true';
    b.classList.add('mb-progress__btn--override');
  }
  if (cell.late) {
    b.dataset.late = 'true';
    b.classList.add('mb-progress__btn--late');
  }
  const words = `${student.name}, ${lesson.title}: ${WORD[cell.state]}${override ? ' (marked by you, press to undo)' : ''}${cell.late ? ', overdue' : ''}`;
  b.setAttribute('aria-label', words);
  b.title = words;
  return b;
}
