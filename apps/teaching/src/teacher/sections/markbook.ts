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

export function mountMarkbook(host: HTMLElement, cls: Class, options: Options = {}): () => void {
  const api = options.api ?? httpMarkbookApi;
  const today = options.today ?? (() => todayInSydney());
  const media = typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 600px)') : null;
  const narrow = options.narrow ?? (() => !!media?.matches);
  let view: MarkbookView | null = null;
  let mode: 'grid' | 'outcomes' = 'grid';
  let showRemoved = false;
  let phoneIndex = 0;
  let pending = 0;
  let queue: Promise<void> = Promise.resolve();

  const section = el('section', 'mb');
  section.setAttribute('aria-labelledby', `mb-${cls.id}`);
  const head = el('div', 'mb__head');
  const title = el('h2', 'mb__title', 'Markbook');
  title.id = `mb-${cls.id}`;
  const tools = el('div', 'mb__tools');
  const toggle = el('button', 'btn btn--secondary mb__toggle', 'Outcomes');
  toggle.type = 'button';
  const removedToggle = el('button', 'btn btn--secondary mb__removed', 'Show removed students');
  removedToggle.type = 'button';
  tools.append(toggle, removedToggle);
  head.append(title, tools);
  const warning = el('p', 'mb__warning');
  warning.hidden = true;
  const status = el('p', 'mb__status');
  status.setAttribute('role', 'status');
  const body = el('div', 'mb__body');
  section.append(head, warning, status, body);
  host.replaceChildren(section);

  const setLocalMark = (columnId: string, studentId: string, mark: unknown | null): void => {
    if (!view) return;
    const byStudent = { ...(view.markbook.marks[columnId] ?? {}) };
    if (mark === null) delete byStudent[studentId];
    else byStudent[studentId] = mark;
    view = { ...view, markbook: { ...view.markbook, marks: { ...view.markbook.marks, [columnId]: byStudent } } };
  };

  /** Writes go one at a time; the server's copy is shown once the last one lands. */
  function save(run: () => Promise<Markbook>): void {
    pending += 1;
    queue = queue.then(async () => {
      try {
        const markbook = await run();
        pending -= 1;
        if (view && pending === 0) view = { ...view, markbook };
        status.textContent = '';
      } catch (error) {
        pending -= 1;
        status.textContent = error instanceof Error ? error.message : 'Couldn’t save that.';
        await load();
      }
      paint();
    });
  }

  const actions: MarkbookActions = {
    setMark: (columnId, studentId, mark) => {
      setLocalMark(columnId, studentId, mark);
      paint();
      save(() => api.setMark(cls.id, columnId, studentId, mark));
    },
    hideQuiz: (lessonId, hidden) => {
      if (view) view = { ...view, quizzes: view.quizzes.map((q) => (q.lesson_id === lessonId ? { ...q, hidden } : q)) };
      paint();
      save(() => api.hideQuiz(cls.id, lessonId, hidden));
    },
    editColumn: () => { status.textContent = 'Column editing arrives in the next step.'; },
    openAssessment: () => { status.textContent = 'Assessment marking arrives in the next step.'; },
    openQuiz: () => { status.textContent = 'Attempt summaries arrive in the next step.'; },
    openHeatmap: () => { status.textContent = 'Heatmaps arrive in the next step.'; }
  };

  function paint(): void {
    if (!view) return;
    const total = weightTotal(view.markbook);
    warning.hidden = total === 100 || assessments(view.markbook).length === 0;
    warning.textContent = `Assessment weights add to ${total}%, not 100%.`;
    toggle.textContent = mode === 'grid' ? 'Outcomes' : 'Marks';
    toggle.setAttribute('aria-pressed', String(mode === 'outcomes'));
    removedToggle.hidden = removedStudentIds(view).length === 0;
    removedToggle.textContent = showRemoved ? 'Hide removed students' : 'Show removed students';
    if (!view.students.length) {
      body.replaceChildren(el('p', 'mb__empty', 'Add students to this class to start a markbook.'));
      return;
    }
    const students = rowStudents(view, showRemoved);
    body.replaceChildren(renderGrid(view, students, actions, today()));
  }

  async function load(): Promise<void> {
    try {
      view = await api.load(cls.id);
      paint();
    } catch {
      status.textContent = 'Couldn’t load the markbook.';
    }
  }

  toggle.addEventListener('click', () => {
    mode = mode === 'grid' ? 'outcomes' : 'grid';
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
  return () => media?.removeEventListener('change', onMedia);
}
