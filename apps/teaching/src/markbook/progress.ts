import { apiPost } from '@/api/client';
import { el } from '@/quiz/dom';
import type { ScheduledLesson, Unit } from '@/schemas';
import type { DoneRecord, MarkbookView } from './types';

export type { DoneRecord };

/**
 * The teacher's Progress view: one row per student, one column per lesson of the class's active units.
 * A tick is complete, a half circle is partial, a grey box is not for that student, and a
 * red dot means it is still not complete a week after its set date. Pure rules first, then the table.
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
};

/**
 * The units' lessons, each once, with each lesson's earliest set date for the class, in date order.
 * Undated lessons follow the dated ones in unit order.
 */
export function unitProgressLessons(
  units: ReadonlyArray<Pick<Unit, 'lesson_ids'> & { title?: string }>,
  lessons: ReadonlyArray<{ id: string; title: string; status?: string; route_role?: ProgressLesson['role'] | null; pedagogical_mode?: string }>,
  scheduled: readonly (Pick<ScheduledLesson, 'lesson_id' | 'date'> & { delivery_status?: ScheduledLesson['delivery_status'] })[]
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
      ...(unit.title ? { unit: unit.title } : {})
    });
  }
  return out.sort((a, b) => (a.date && b.date ? a.date.localeCompare(b.date) : a.date ? -1 : b.date ? 1 : 0));
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
  /** The teacher ticked this side lesson as taken for the student. */
  took: boolean;
  today: string;
};

export function cellFor(input: CellInput): Cell {
  const { lesson, record, quizSubmitted, quizStarted, took, today } = input;
  const teacherDone = (record?.via === 'teacher' && !record.partial) || Boolean(input.quizMarked);
  const studentDone = Boolean(record && !record.partial && record.via !== 'teacher') || quizSubmitted;
  let state: CellState;
  if (lesson.assessment) {
    // Handed in or ticked, but not yet marked, is partial. A fully marked quiz is complete.
    state = teacherDone ? 'complete' : studentDone || record?.partial ? 'partial' : 'open';
  } else if (teacherDone || studentDone) state = 'complete';
  else if (record?.partial || quizStarted) state = 'partial';
  else state = 'open';
  if (state === 'open' && lesson.role !== 'core' && !took) return { state: 'na', late: false };
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
const shortDate = (day: string): string => `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1] ?? ''}`;

export type ProgressOptions = {
  view: MarkbookView;
  students: ReadonlyArray<{ id: string; name: string; initials: string }>;
  lessons: readonly ProgressLesson[];
  today: string;
  /** Called when a cell is pressed; the table redraws when it settles. */
  onMark: (studentId: string, lessonId: string, state: 'complete' | 'partial' | 'clear') => void;
  /** Set while a save is failing, shown above the table. */
  error?: string;
};

export function renderProgress(options: ProgressOptions): HTMLElement {
  const { view, students, lessons, today } = options;
  const root = el('div', 'mb-progress');
  if (!lessons.length) {
    root.append(el('p', 'mb__empty', 'This class has no unit lessons yet.'));
    return root;
  }
  if (options.error) {
    const alert = el('p', 'mb__error', options.error);
    alert.setAttribute('role', 'alert');
    root.append(alert);
  }
  const key = el('ul', 'mb-progress__key');
  const swatch = (cls: string, symbol: string, words: string) => {
    const li = el('li', 'mb-progress__keyitem');
    const box = el('span', `mb-progress__swatch ${cls}`, symbol);
    box.setAttribute('aria-hidden', 'true');
    li.append(box, words);
    return li;
  };
  key.append(
    swatch('mb-progress__btn--complete', '✓', 'Complete'),
    swatch('mb-progress__btn--partial', '◐', 'Partial or waiting to be marked'),
    swatch('mb-progress__btn--na', '', 'Not for this student'),
    swatch('mb-progress__btn--late', '', 'Overdue a week after its date'),
    el('li', 'mb-progress__keyhint', 'Press a cell to mark it complete. Press again to undo.')
  );
  root.append(key);
  const wrap = el('div', 'mb-progress__scroll');
  const table = el('table', 'mb-progress__table');
  const thead = el('thead');
  const units = lessons.map((l) => l.unit ?? '');
  if (new Set(units).size > 1) {
    const band = el('tr', 'mb-progress__units');
    band.append(el('td', 'mb-progress__corner'));
    for (let i = 0; i < units.length; ) {
      let n = 1;
      while (units[i + n] === units[i]) n++;
      const th = el('th', 'mb-progress__unit');
      th.scope = 'colgroup';
      th.colSpan = n;
      th.title = units[i]!;
      th.append(el('span', 'mb-progress__unitname', units[i]!));
      band.append(th);
      i += n;
    }
    thead.append(band);
  }
  const head = el('tr');
  head.append(el('th', 'mb-progress__corner', 'Student'));
  for (const l of lessons) {
    const th = el('th', `mb-progress__lesson mb-progress__lesson--${l.role}`);
    th.scope = 'col';
    th.title = l.title;
    const label = el('div', 'mb-progress__label');
    label.append(el('span', 'mb-progress__title', l.title));
    const tag = l.assessment ? 'Assessment' : l.role === 'core' ? '' : l.role === 'optional' ? 'Option' : l.role === 'support' ? 'Support' : 'Extension';
    const meta = [l.date ? shortDate(l.date) : '', tag].filter(Boolean).join(' · ');
    if (meta) label.append(el('span', 'mb-progress__meta', meta));
    th.append(label);
    head.append(th);
  }
  thead.append(head);
  table.append(thead);
  const body = el('tbody');
  for (const s of students) {
    const tr = el('tr');
    const name = el('th', 'mb-progress__student');
    name.scope = 'row';
    const who = el('span', 'mb-student');
    who.append(el('span', 'mb-student__initials', s.initials), el('span', 'mb-student__name', s.name));
    name.append(who);
    tr.append(name);
    for (const l of lessons) {
      const quiz = view.quizzes.find((q) => q.lesson_id === l.id);
      const score = quiz?.scores?.[s.id];
      const record = view.done?.[s.id]?.[l.id];
      const override = isOverride(record);
      const cell = cellFor({
        lesson: l,
        record,
        quizSubmitted: Boolean(score?.submitted_at),
        quizMarked: Boolean(score?.submitted_at) && score!.pending === 0,
        // Written work saved in the lesson counts as under way, like a quiz go not handed in.
        quizStarted: Boolean(quiz?.started?.includes(s.id)) || Boolean(view.work?.find((w) => w.lesson_id === l.id)?.students[s.id]),
        took: (view.markbook.took?.[s.id] ?? []).includes(l.id),
        today
      });
      const td = el('td', 'mb-progress__cell');
      // A handed-in quiz shows its mark instead of a tick.
      const scored = Boolean(score?.submitted_at) && score!.max > 0;
      const b = el('button', `mb-progress__btn mb-progress__btn--${cell.state}`, scored ? `${score!.score}/${score!.max}` : SYMBOL[cell.state]);
      if (scored) b.classList.add('mb-progress__btn--score');
      b.type = 'button';
      b.dataset.student = s.id;
      b.dataset.lesson = l.id;
      b.dataset.state = cell.state;
      if (override) {
        b.dataset.override = 'true';
        b.classList.add('mb-progress__btn--override');
      }
      if (cell.late) {
        b.dataset.late = 'true';
        b.classList.add('mb-progress__btn--late');
      }
      const quizWords = score?.submitted_at ? (score.pending ? `, quiz handed in, ${score.pending} to mark` : `, quiz ${score.score}/${score.max}`) : '';
      const words = `${s.name}, ${l.title}: ${WORD[cell.state]}${override ? ' (marked by you, press to undo)' : ''}${quizWords}${cell.late ? ', overdue' : ''}`;
      b.setAttribute('aria-label', words);
      b.title = words;
      b.addEventListener('click', () => options.onMark(s.id, l.id, override ? 'clear' : 'complete'));
      td.append(b);
      tr.append(td);
    }
    body.append(tr);
  }
  table.append(body);
  wrap.append(table);
  root.append(wrap);
  return root;
}
