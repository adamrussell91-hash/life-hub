/**
 * The class markbook, on the teacher's class page only. Quiz columns come
 * from attempts; the teacher adds assessment, hand-in and check columns.
 * Students never see any of it.
 */
import type { Class } from '@/schemas';
import { el } from '@/quiz/dom';
import type { AssessmentColumn, AssessmentMark, Column, Markbook } from '@/markbook/schema';
import { httpMarkbookApi, type MarkbookApi } from '@/markbook/api';
import type { MarkbookActions, MarkbookView, OutcomeLabel } from '@/markbook/types';
import type { Evidence } from '@/evidence/types';
import { openFollowUpPlan } from '@/evidence/follow-up';
import { navigate } from '@/app/router';
import { assessments, formatPercent, markOf, overallFor, removedStudentIds, rowStudents, todayInSydney, weightTotal } from '@/markbook/calc';
import { renderGrid } from '@/markbook/grid';
import { openColumnForm } from '@/markbook/column-form';
import { openAssessmentPanel } from '@/markbook/assessment-panel';
import { renderPatterns } from '@/markbook/patterns-view';
import { openStudentPanel } from '@/markbook/student-panel';
import { loadInsightContext, codeLabel, type InsightContext } from '@/evidence/context';
import { markbookEvidence } from '@/evidence/markbook-evidence';
import { defaultKind } from '@/evidence/patterns';
import { expandTags, tagLabel } from '@/evidence/tags';
import { openHeatmap, openQuizAttempt } from '@/markbook/heatmap';
import { renderPhone, type PhoneControl } from '@/markbook/phone';
import { csvFileName, markbookCsv } from '@/markbook/csv';
import { withAppBase } from '@/app/base-path';
import { ApiClientError } from '@/api/client';
import { loadSkills } from '@/skills/api';
import type { SkillsContinuum } from '@/skills/schema';
import '@/markbook/markbook.css';

type Options = {
  /** Test seam. Defaults to POST /api/classes/:id/markbook. */
  api?: MarkbookApi;
  outcomes?: OutcomeLabel[];
  /** Test seam: true draws the one-student phone card. */
  narrow?: () => boolean;
  /** Test seam for today's date, YYYY-MM-DD. */
  today?: () => string;
};


/** A local change still waiting for the server, re-applied after a reload. */
type Change =
  | { kind: 'mark'; columnId: string; studentId: string; mark: unknown | null }
  | { kind: 'hide'; lessonId: string; hidden: boolean }
  | { kind: 'delete_column'; columnId: string }
  | { kind: 'focus'; studentId: string; pinned: string[]; dismissed: string[] };

/** The most recent shown quiz with evidence on this tag: the follow-up goes after it. */
function latestQuizFor(view: MarkbookView, tag: string, evidence: Evidence[]): string | null {
  const sources = new Set(evidence.filter((e) => e.tags.includes(tag) && e.source.startsWith('quiz:')).map((e) => e.source.slice(5)));
  const quizzes = view.quizzes.filter((q) => !q.hidden && sources.has(q.lesson_id)).sort((a, b) => b.date.localeCompare(a.date));
  return quizzes[0]?.lesson_id ?? null;
}

function applyChange(view: MarkbookView, change: Change): MarkbookView {
  if (change.kind === 'focus') {
    const focus = { ...(view.markbook.focus ?? {}) };
    if (!change.pinned.length && !change.dismissed.length) delete focus[change.studentId];
    else focus[change.studentId] = { pinned: change.pinned, dismissed: change.dismissed };
    return { ...view, markbook: { ...view.markbook, focus } };
  }
  if (change.kind === 'hide') {
    return { ...view, quizzes: view.quizzes.map((q) => (q.lesson_id === change.lessonId ? { ...q, hidden: change.hidden } : q)) };
  }
  if (change.kind === 'delete_column') {
    const { [change.columnId]: _gone, ...marks } = view.markbook.marks;
    return { ...view, markbook: { ...view.markbook, columns: view.markbook.columns.filter((c) => c.id !== change.columnId), marks } };
  }
  const byStudent = { ...(view.markbook.marks[change.columnId] ?? {}) };
  if (change.mark === null) delete byStudent[change.studentId];
  else byStudent[change.studentId] = change.mark;
  return { ...view, markbook: { ...view.markbook, marks: { ...view.markbook.marks, [change.columnId]: byStudent } } };
}

/** Takes the server's markbook, re-derives which quizzes are hidden, then lays the still-queued changes over it. */
function withServerCopy(view: MarkbookView, markbook: Markbook, queued: readonly Change[]): MarkbookView {
  const hidden = new Set(markbook.hidden_quizzes);
  const fresh: MarkbookView = { ...view, markbook, quizzes: view.quizzes.map((q) => ({ ...q, hidden: hidden.has(q.lesson_id) })) };
  return queued.reduce(applyChange, fresh);
}

export function mountMarkbook(host: HTMLElement, cls: Class, options: Options = {}): () => void {
  const api = options.api ?? httpMarkbookApi;
  const today = options.today ?? (() => todayInSydney());
  const media = typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 600px)') : null;
  const narrow = options.narrow ?? (() => !!media?.matches);
  let view: MarkbookView | null = null;
  /** The last view the server confirmed, with no local changes on it. */
  let confirmed: MarkbookView | null = null;
  let mode: 'grid' | 'patterns' = 'grid';
  /** Names for tags and codes, for Patterns and the student panel; loaded once, after the markbook. */
  let ctx: InsightContext | null = null;
  let showRemoved = false;
  let showHiddenList = false;
  /** The student on the phone card, by id, so a reload that adds or removes someone keeps the card on them. */
  let phoneStudentId: string | null = null;
  /** Where that student was, for when they leave the list. */
  let phoneIndex = 0;
  let disposed = false;
  /** The skills continuum for skill-linked criteria; the markbook works without it. */
  let skills: SkillsContinuum | null = null;
  void loadSkills().then((c) => { skills = c; }, () => {});
  const queued: Change[] = [];
  /** Told about each queued save that fails, e.g. by an open marking panel. */
  const saveErrorListeners = new Set<(change: Change, message: string) => void>();
  let queue: Promise<void> = Promise.resolve();

  const section = el('section', 'mb');
  section.setAttribute('aria-labelledby', `mb-${cls.id}`);
  const head = el('div', 'mb__head');
  const title = el('h2', 'mb__title', 'Markbook');
  title.id = `mb-${cls.id}`;
  title.tabIndex = -1;
  const tools = el('div', 'mb__tools');
  const toggle = el('button', 'btn btn--secondary mb__toggle', 'Patterns');
  toggle.type = 'button';
  const hiddenToggle = el('button', 'btn btn--secondary mb__hidden-toggle');
  hiddenToggle.type = 'button';
  hiddenToggle.hidden = true;
  const removedToggle = el('button', 'btn btn--secondary mb__removed', 'Show removed students');
  removedToggle.type = 'button';
  const addGroup = el('div', 'mb__add');
  addGroup.setAttribute('role', 'group');
  addGroup.setAttribute('aria-label', 'Add column');
  for (const [kind, text] of [['assessment', 'Add task'], ['handin', 'Add hand-in'], ['check', 'Add check']] as const) {
    const b = el('button', 'btn btn--secondary mb__add-kind', text);
    b.type = 'button';
    b.addEventListener('click', () => openForm(kind));
    addGroup.append(b);
  }
  const exportButton = el('button', 'btn btn--secondary mb__export', 'Export CSV');
  exportButton.type = 'button';
  exportButton.addEventListener('click', () => {
    if (!view) return;
    // The BOM makes Excel read the file as UTF-8, so names keep their accents.
    const blob = new Blob(['﻿', markbookCsv(view)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = el('a');
    link.href = url;
    link.download = csvFileName(cls.title || cls.code || 'class', today());
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    // Safari reads the file after the click returns; a slow download needs the URL a while longer.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  });
  tools.append(addGroup, toggle, hiddenToggle, removedToggle, exportButton);
  head.append(title, tools);
  const hiddenList = el('ul', 'mb__hidden-list');
  hiddenList.id = `mb-hidden-${cls.id}`;
  hiddenList.hidden = true;
  hiddenToggle.setAttribute('aria-controls', hiddenList.id);
  const warning = el('p', 'mb__warning');
  warning.hidden = true;
  const status = el('p', 'mb__status');
  status.setAttribute('role', 'status');
  // Outside the body, which is redrawn, so a screen reader hears each change.
  const announce = el('p', 'mb-sr mb__announce');
  announce.setAttribute('aria-live', 'polite');
  const body = el('div', 'mb__body');
  section.append(head, hiddenList, warning, status, announce, body);
  host.replaceChildren(section);

  /**
   * Writes go one at a time. A success shows the server's copy with the
   * changes still queued laid over it; a failure reloads and does the same.
   * Nothing a job throws can break the chain.
   */
  function save(item: Change, run: () => Promise<Markbook>): void {
    queued.push(item);
    queue = queue
      .then(async () => {
        try {
          const markbook = await run();
          queued.splice(queued.indexOf(item), 1);
          if (confirmed) {
            confirmed = withServerCopy(confirmed, markbook, []);
            view = queued.reduce(applyChange, confirmed);
          }
        } catch (error) {
          queued.splice(queued.indexOf(item), 1);
          // Roll the failed change back at once, so it never looks saved.
          if (confirmed) view = queued.reduce(applyChange, confirmed);
          const reached = await load(false);
          status.textContent = reached
            ? error instanceof Error ? error.message : 'Couldn’t save that.'
            : 'Couldn’t save that, and couldn’t reach the server. Check your connection.';
          for (const listener of saveErrorListeners) listener(item, status.textContent);
        } finally {
          paint();
        }
      })
      .catch(() => {});
  }

  /** Runs a job after every write already queued. Its failure goes to the caller and never stops the queue. */
  function enqueue<T>(job: () => Promise<T>): Promise<T> {
    const run = queue.then(job);
    queue = run.then(
      () => {},
      () => {}
    );
    return run;
  }

  function change(next: Change, run: () => Promise<Markbook>): void {
    status.textContent = '';
    if (view) view = applyChange(view, next);
    paint();
    save(next, run);
  }

  /** Add a column of `kind`, or edit the teacher column `columnId`. */
  function openForm(kind: Column['kind'], columnId?: string): void {
    const column = columnId ? view?.markbook.columns.find((c) => c.id === columnId) : undefined;
    if (columnId && !column) return;
    openColumnForm({
      kind: column?.kind ?? kind,
      column,
      outcomes: options.outcomes ?? [],
      skills,
      today: today(),
      returnFocus: () => (columnId ? findInBody('.mb-col__title', columnId) : null) ?? title,
      // A throw stays in the form, which shows the message and keeps the teacher's typing.
      onSave: async (saved) => {
        const markbook = await enqueue(() => api.saveColumn(cls.id, saved));
        if (disposed) return;
        if (!confirmed) {
          void load();
          return;
        }
        confirmed = withServerCopy(confirmed, markbook, []);
        view = queued.reduce(applyChange, confirmed);
        status.textContent = '';
        paint();
      },
      onDelete: column
        ? () => change({ kind: 'delete_column', columnId: column.id }, () => api.deleteColumn(cls.id, column.id))
        : undefined
    });
  }

  /** A column title, or with `studentId` a grid cell, as drawn now. */
  function findInBody(selector: string, columnId: string, studentId?: string): HTMLElement | null {
    return (
      [...body.querySelectorAll<HTMLElement>(selector)].find(
        (n) => n.dataset.col === columnId && (studentId === undefined || n.dataset.student === studentId)
      ) ?? null
    );
  }

  function openAssessment(columnId: string, studentId: string): void {
    const column = view?.markbook.columns.find((c): c is AssessmentColumn => c.id === columnId && c.kind === 'assessment');
    if (!column || !view) return;
    openAssessmentPanel({
      column,
      // Removed students are read-only, so Save and next never lands on one.
      students: rowStudents(view, showRemoved).filter((s) => !s.removed),
      studentId,
      skills,
      codes: ctx?.codes,
      // Reads the live view, so a mark saved or queued in this panel shows when the teacher comes back to it.
      markFor: (id) => (view ? markOf<AssessmentMark>(view.markbook, columnId, id) : undefined),
      onSave: (id, mark) => {
        // Unchanged, including passing over an unmarked student: nothing to send.
        const now = view ? markOf(view.markbook, columnId, id) : undefined;
        if (JSON.stringify(mark) === JSON.stringify(now ?? null)) return;
        actions.setMark(columnId, id, mark);
      },
      returnFocus: (id) => findInBody('.mb-cell', columnId, id) ?? title,
      subscribeErrors: (show) => {
        const listener = (failed: Change, message: string): void => {
          if (failed.kind !== 'mark' || failed.columnId !== columnId) return;
          const name = view?.students.find((s) => s.id === failed.studentId)?.name ?? 'A removed student';
          show(`${name}’s mark wasn’t saved: ${message}`);
        };
        saveErrorListeners.add(listener);
        return () => saveErrorListeners.delete(listener);
      }
    });
  }

  const actions: MarkbookActions = {
    openStudent: (studentId) => {
      const student = view?.students.find((s) => s.id === studentId);
      if (!view || !student || !ctx) return;
      const context = ctx;
      const evidence = expandTags(markbookEvidence(view, context.outcomes).evidence, context.table);
      const pins = view.markbook.focus?.[studentId] ?? { pinned: [], dismissed: [] };
      // Back to the name that opened it, or the heading once a redraw has replaced that name.
      const opener = document.activeElement;
      openStudentPanel({
        student,
        evidence,
        kind: defaultKind(evidence),
        label: (tag) => tagLabel(tag, context),
        codeLabel: (id) => codeLabel(id, context.codes),
        pins,
        overall: formatPercent(overallFor(view.markbook, studentId).percent),
        onPins: (next) =>
          change({ kind: 'focus', studentId, pinned: next.pinned, dismissed: next.dismissed }, () => api.setFocus(cls.id, studentId, next.pinned, next.dismissed)),
        returnFocus: () => (opener instanceof HTMLElement && opener !== title && section.contains(opener) ? opener : title)
      });
    },
    setMark: (columnId, studentId, mark) =>
      change({ kind: 'mark', columnId, studentId, mark }, () => api.setMark(cls.id, columnId, studentId, mark)),
    hideQuiz: (lessonId, hidden) => change({ kind: 'hide', lessonId, hidden }, () => api.hideQuiz(cls.id, lessonId, hidden)),
    editColumn: (columnId) => openForm('assessment', columnId),
    openAssessment,
    openQuiz: (lessonId, studentId) => {
      const quiz = view?.quizzes.find((q) => q.lesson_id === lessonId);
      const student = view?.students.find((s) => s.id === studentId);
      if (!quiz || !student) return;
      openQuizAttempt(quiz, student, withAppBase(`/lessons/${encodeURIComponent(lessonId)}`), {
        returnFocus: () => findInBody('.mb-cell', quiz.id, studentId) ?? title
      });
    },
    openHeatmap: (lessonId) => {
      const quiz = view?.quizzes.find((q) => q.lesson_id === lessonId);
      if (!quiz || !view) return;
      openHeatmap(quiz, rowStudents(view, false), { returnFocus: () => findInBody('.mb-col__title', quiz.id) ?? title });
    }
  };

  /** Which cell or column title had focus, so a redraw can put it back. */
  type FocusKey = { col: string; student?: string } | { phone: PhoneControl };

  function focusKey(): FocusKey | null {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !body.contains(active)) return null;
    if (active.dataset.phone) return { phone: active.dataset.phone as PhoneControl };
    if (!active.dataset.col) return null;
    if (active.classList.contains('mb-col__title')) return { col: active.dataset.col };
    return active.dataset.student ? { col: active.dataset.col, student: active.dataset.student } : null;
  }

  function restoreFocus(key: FocusKey | null): void {
    if (!key) return;
    if ('phone' in key) {
      const control = body.querySelector<HTMLButtonElement | HTMLSelectElement>(`[data-phone="${key.phone}"]`);
      // Previous on the first student or Next on the last is disabled now: go to the picker.
      (control && !control.disabled ? control : body.querySelector<HTMLElement>('[data-phone="pick"]'))?.focus();
      return;
    }
    findInBody(key.student === undefined ? '.mb-col__title' : '.mb-cell', key.col, key.student)?.focus();
  }

  function paintHidden(current: MarkbookView): void {
    const hidden = current.quizzes.filter((q) => q.hidden);
    hiddenToggle.hidden = hidden.length === 0;
    hiddenToggle.textContent = `Hidden quizzes (${hidden.length})`;
    if (!hidden.length) showHiddenList = false;
    hiddenToggle.setAttribute('aria-expanded', String(showHiddenList));
    hiddenList.hidden = !showHiddenList;
    hiddenList.replaceChildren(
      ...hidden.map((q) => {
        const item = el('li', 'mb__hidden-item');
        const unhide = el('button', 'btn btn--secondary mb__unhide', 'Unhide');
        unhide.type = 'button';
        unhide.setAttribute('aria-label', `Unhide ${q.title}`);
        unhide.addEventListener('click', () => actions.hideQuiz(q.lesson_id, false));
        item.append(el('span', 'mb__hidden-title', q.title), unhide);
        return item;
      })
    );
  }

  function paint(): void {
    if (disposed || !view) return;
    const active = document.activeElement;
    const hadFocus = active instanceof HTMLElement && section.contains(active) && active !== title;
    const key = focusKey();
    draw(view, key);
    if (!hadFocus) return;
    // The focused control went away (Hide, Unhide, an emptied list): fall back to the heading.
    const now = document.activeElement;
    if (!(now instanceof HTMLElement) || !section.contains(now) || now.closest('[hidden]')) title.focus();
  }

  function draw(current: MarkbookView, key: ReturnType<typeof focusKey>): void {
    const total = weightTotal(current.markbook);
    warning.hidden = total === 100 || assessments(current.markbook).length === 0;
    warning.textContent = `Assessment weights add to ${total}%, not 100%.`;
    toggle.setAttribute('aria-pressed', String(mode === 'patterns'));
    removedToggle.hidden = removedStudentIds(current).length === 0;
    removedToggle.textContent = showRemoved ? 'Hide removed students' : 'Show removed students';
    paintHidden(current);
    if (!current.students.length) {
      body.replaceChildren(el('p', 'mb__empty', 'Add students to this class to start a markbook.'));
      return;
    }
    const students = rowStudents(current, showRemoved);
    if (mode === 'patterns') {
      const context = ctx;
      body.replaceChildren(
        context
          ? renderPatterns(current, students, context, {
              openStudent: actions.openStudent,
              followUp: (tag, ids, evidence) => {
                const lessonId = latestQuizFor(current, tag, evidence);
                const quiz = current.quizzes.find((q) => q.lesson_id === lessonId);
                if (!quiz) {
                  status.textContent = 'Follow-ups start from a quiz; this tag only has assessment marks.';
                  return;
                }
                status.textContent = '';
                openFollowUpPlan({
                  sourceLessonId: quiz.lesson_id,
                  sourceTitle: quiz.title,
                  unitId: quiz.unit_id ?? '',
                  flagId: null,
                  tag,
                  students: current.students,
                  chosen: ids,
                  evidence,
                  label: (t) => tagLabel(t, context),
                  codeLabel: (id) => codeLabel(id, context.codes),
                  onDone: (id) => navigate(`/lessons/${encodeURIComponent(id)}`)
                });
              }
            })
          : el('p', 'mb__status', 'Loading patterns…')
      );
    }
    else if (narrow()) {
      const found = students.findIndex((s) => s.id === phoneStudentId);
      // Clamp only when the student has left the list (or none was chosen yet).
      phoneIndex = found >= 0 ? found : Math.max(0, Math.min(students.length - 1, phoneIndex));
      phoneStudentId = students[phoneIndex]?.id ?? null;
      body.replaceChildren(
        renderPhone(current, students, actions, phoneIndex, (i) => {
          const s = students[i];
          if (!s) return;
          phoneIndex = i;
          phoneStudentId = s.id;
          announce.textContent = `${s.name}, ${i + 1} of ${students.length}`;
          paint();
        }, today())
      );
    }
    else body.replaceChildren(renderGrid(current, students, actions, today()));
    restoreFocus(key);
  }

  /** Fetches a fresh view; changes still queued are laid over it. Says whether the server answered. */
  async function load(repaint = true): Promise<boolean> {
    if (disposed) return false;
    try {
      confirmed = await api.load(cls.id);
      view = queued.reduce(applyChange, confirmed);
      if (repaint) paint();
      return true;
    } catch (error) {
      // A server's own message says what went wrong; a dropped connection or garbled reply gets the plain one.
      const fromServer = error instanceof ApiClientError && error.code !== 'network_error' && error.code !== 'invalid_response';
      if (repaint) status.textContent = fromServer ? error.message : 'Couldn’t load the markbook.';
      return false;
    }
  }

  toggle.addEventListener('click', () => {
    mode = mode === 'grid' ? 'patterns' : 'grid';
    paint();
  });
  hiddenToggle.addEventListener('click', () => {
    showHiddenList = !showHiddenList;
    paint();
  });
  removedToggle.addEventListener('click', () => {
    showRemoved = !showRemoved;
    paint();
  });
  const onMedia = () => paint();
  // Safari before 14 only has the older addListener.
  if (typeof media?.addEventListener === 'function') media.addEventListener('change', onMedia);
  else media?.addListener?.(onMedia);
  void load();
  void loadInsightContext().then((loaded) => {
    ctx = { ...loaded, outcomes: options.outcomes ?? loaded.outcomes };
    if (mode === 'patterns') paint();
  });
  return () => {
    disposed = true;
    if (typeof media?.removeEventListener === 'function') media.removeEventListener('change', onMedia);
    else media?.removeListener?.(onMedia);
  };
}
