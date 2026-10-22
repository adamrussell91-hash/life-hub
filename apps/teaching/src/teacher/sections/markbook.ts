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
import { assessments, markOf, removedStudentIds, rowStudents, todayInSydney, weightTotal } from '@/markbook/calc';
import { renderGrid } from '@/markbook/grid';
import { openColumnForm } from '@/markbook/column-form';
import { openAssessmentPanel } from '@/markbook/assessment-panel';
import { renderOutcomes, type OutcomeSelection } from '@/markbook/outcomes-view';
import { openHeatmap, openQuizAttempt } from '@/markbook/heatmap';
import { withAppBase } from '@/app/base-path';
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
  | { kind: 'delete_column'; columnId: string };

function applyChange(view: MarkbookView, change: Change): MarkbookView {
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
  let mode: 'grid' | 'outcomes' = 'grid';
  /** The outcome cell whose evidence is open, kept across redraws. */
  let selectedOutcome: OutcomeSelection | null = null;
  let showRemoved = false;
  let showHiddenList = false;
  let phoneIndex = 0;
  let disposed = false;
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
  const toggle = el('button', 'btn btn--secondary mb__toggle', 'Outcomes');
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
  tools.append(addGroup, toggle, hiddenToggle, removedToggle);
  head.append(title, tools);
  const hiddenList = el('ul', 'mb__hidden-list');
  hiddenList.id = `mb-hidden-${cls.id}`;
  hiddenList.hidden = true;
  hiddenToggle.setAttribute('aria-controls', hiddenList.id);
  const warning = el('p', 'mb__warning');
  warning.hidden = true;
  const status = el('p', 'mb__status');
  status.setAttribute('role', 'status');
  const body = el('div', 'mb__body');
  section.append(head, hiddenList, warning, status, body);
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

  /** A column title, or with `studentId` a cell (grid or outcomes view), as drawn now. */
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
  function focusKey(): { col: string; student?: string } | null {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !body.contains(active) || !active.dataset.col) return null;
    if (active.classList.contains('mb-col__title')) return { col: active.dataset.col };
    return active.dataset.student ? { col: active.dataset.col, student: active.dataset.student } : null;
  }

  function restoreFocus(key: { col: string; student?: string } | null): void {
    if (!key) return;
    findInBody(key.student === undefined ? '.mb-col__title' : '.mb-cell, .mb-outcome-cell', key.col, key.student)?.focus();
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
    toggle.setAttribute('aria-pressed', String(mode === 'outcomes'));
    removedToggle.hidden = removedStudentIds(current).length === 0;
    removedToggle.textContent = showRemoved ? 'Hide removed students' : 'Show removed students';
    paintHidden(current);
    if (!current.students.length) {
      body.replaceChildren(el('p', 'mb__empty', 'Add students to this class to start a markbook.'));
      return;
    }
    const students = rowStudents(current, showRemoved);
    if (mode === 'outcomes') {
      body.replaceChildren(
        renderOutcomes(current, students, options.outcomes ?? [], {
          selected: selectedOutcome,
          onSelect: (next) => {
            selectedOutcome = next;
          }
        })
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
    } catch {
      if (repaint) status.textContent = 'Couldn’t load the markbook.';
      return false;
    }
  }

  toggle.addEventListener('click', () => {
    mode = mode === 'grid' ? 'outcomes' : 'grid';
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
  media?.addEventListener('change', onMedia);
  void load();
  void phoneIndex;
  void narrow;
  return () => {
    disposed = true;
    media?.removeEventListener('change', onMedia);
  };
}
