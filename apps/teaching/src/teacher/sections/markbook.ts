/**
 * The class markbook, on the teacher's class page only. Quiz columns come
 * from attempts; the teacher adds assessment, hand-in and check columns.
 * Students never see any of it.
 */
import type { Class } from '@/schemas';
import { el } from '@/quiz/dom';
import type { Markbook } from '@/markbook/schema';
import { httpMarkbookApi, type MarkbookApi } from '@/markbook/api';
import type { MarkbookActions, MarkbookView, OutcomeLabel } from '@/markbook/types';
import { assessments, removedStudentIds, rowStudents, todayInSydney, weightTotal } from '@/markbook/calc';
import { renderGrid } from '@/markbook/grid';
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
  | { kind: 'hide'; lessonId: string; hidden: boolean };

function applyChange(view: MarkbookView, change: Change): MarkbookView {
  if (change.kind === 'hide') {
    return { ...view, quizzes: view.quizzes.map((q) => (q.lesson_id === change.lessonId ? { ...q, hidden: change.hidden } : q)) };
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
  let mode: 'grid' | 'outcomes' = 'grid';
  let showRemoved = false;
  let showHiddenList = false;
  let phoneIndex = 0;
  let disposed = false;
  const queued: Change[] = [];
  let queue: Promise<void> = Promise.resolve();

  const section = el('section', 'mb');
  section.setAttribute('aria-labelledby', `mb-${cls.id}`);
  const head = el('div', 'mb__head');
  const title = el('h2', 'mb__title', 'Markbook');
  title.id = `mb-${cls.id}`;
  const tools = el('div', 'mb__tools');
  const toggle = el('button', 'btn btn--secondary mb__toggle', 'Outcomes');
  toggle.type = 'button';
  const hiddenToggle = el('button', 'btn btn--secondary mb__hidden-toggle');
  hiddenToggle.type = 'button';
  hiddenToggle.hidden = true;
  const removedToggle = el('button', 'btn btn--secondary mb__removed', 'Show removed students');
  removedToggle.type = 'button';
  tools.append(toggle, hiddenToggle, removedToggle);
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
          if (view) view = withServerCopy(view, markbook, queued);
        } catch (error) {
          queued.splice(queued.indexOf(item), 1);
          status.textContent = error instanceof Error ? error.message : 'Couldn’t save that.';
          await load(false);
        } finally {
          paint();
        }
      })
      .catch(() => {});
  }

  function change(next: Change, run: () => Promise<Markbook>): void {
    status.textContent = '';
    if (view) view = applyChange(view, next);
    paint();
    save(next, run);
  }

  const actions: MarkbookActions = {
    setMark: (columnId, studentId, mark) =>
      change({ kind: 'mark', columnId, studentId, mark }, () => api.setMark(cls.id, columnId, studentId, mark)),
    hideQuiz: (lessonId, hidden) => change({ kind: 'hide', lessonId, hidden }, () => api.hideQuiz(cls.id, lessonId, hidden)),
    editColumn: () => { status.textContent = 'Column editing arrives in the next step.'; },
    openAssessment: () => { status.textContent = 'Assessment marking arrives in the next step.'; },
    openQuiz: () => { status.textContent = 'Attempt summaries arrive in the next step.'; },
    openHeatmap: () => { status.textContent = 'Heatmaps arrive in the next step.'; }
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
    const selector = key.student === undefined ? '.mb-col__title' : '.mb-cell';
    const target = [...body.querySelectorAll<HTMLElement>(selector)].find(
      (n) => n.dataset.col === key.col && (key.student === undefined || n.dataset.student === key.student)
    );
    target?.focus();
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
    const total = weightTotal(view.markbook);
    warning.hidden = total === 100 || assessments(view.markbook).length === 0;
    warning.textContent = `Assessment weights add to ${total}%, not 100%.`;
    toggle.setAttribute('aria-pressed', String(mode === 'outcomes'));
    removedToggle.hidden = removedStudentIds(view).length === 0;
    removedToggle.textContent = showRemoved ? 'Hide removed students' : 'Show removed students';
    paintHidden(view);
    if (!view.students.length) {
      body.replaceChildren(el('p', 'mb__empty', 'Add students to this class to start a markbook.'));
      return;
    }
    const key = focusKey();
    const students = rowStudents(view, showRemoved);
    body.replaceChildren(renderGrid(view, students, actions, today()));
    restoreFocus(key);
  }

  /** Fetches a fresh view; changes still queued are laid over it. */
  async function load(draw = true): Promise<void> {
    if (disposed) return;
    try {
      const fresh = await api.load(cls.id);
      view = queued.reduce(applyChange, fresh);
      if (draw) paint();
    } catch {
      status.textContent = 'Couldn’t load the markbook.';
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
