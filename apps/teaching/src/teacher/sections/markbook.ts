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
import { FOLLOW_UP } from '@/evidence/constants';
import { navigate } from '@/app/router';
import { assessments, formatPercent, markOf, overallFor, removedStudentIds, rowStudents, todayInSydney, weightTotal } from '@/markbook/calc';
import { renderGrid } from '@/markbook/grid';
import { httpProgressApi, renderProgress, withMark, type DoneRecord, type ProgressApi, type ProgressLesson } from '@/markbook/progress';
import { newSyllabusGridState, renderSyllabusGrid } from '@/markbook/syllabus-grid';
import { openColumnForm } from '@/markbook/column-form';
import { openAssessmentPanel } from '@/markbook/assessment-panel';
import { newDetailState, renderPatterns } from '@/markbook/patterns-view';
import { newNextState, renderNextSteps } from '@/markbook/next-view';
import { openStudentPanel, type StudentPanelHandle } from '@/markbook/student-panel';
import { loadInsightContext, codeLabel, type InsightContext } from '@/evidence/context';
import { classEvidence } from '@/evidence/class-evidence';
import { defaultKind } from '@/evidence/patterns';
import { tagLabel } from '@/evidence/tags';
import { historyEventsFor, joinWhy, leavesFor, newGroupId } from '@/evidence/groups';
import { newHistoryState, renderHistory } from '@/markbook/history-view';
import { mixUpText } from '@/evidence/views/parts';
import { openTutorialPlan } from '@/tutorial/plan-sheet';
import { openHeatmap, openQuizAttempt, openWorkSheet } from '@/markbook/heatmap';
import { renderPhone, type PhoneControl } from '@/markbook/phone';
import { csvFileName, markbookCsv } from '@/markbook/csv';
import { withAppBase } from '@/app/base-path';
import { ApiClientError, apiGet } from '@/api/client';
import { loadAlignment } from '@/alignment/api';
import { getLesson } from '@/teacher/lessons-library/api';
import { visitBlocks } from '@/blocks/walk-blocks';
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
  /** The view the markbook opens on. Defaults to the syllabus Grid. */
  view?: Mode;
  /** The class's unit lessons in order, for the Progress view. */
  progressLessons?: ProgressLesson[];
  /** Test seam. Defaults to POST /api/classes/:id/profile. */
  progressApi?: ProgressApi;
  /** The class's unit lessons, for linking a task to a lesson block. */
  pieceLessons?: { id: string; title: string }[];
  /** Test seam. The blocks of a lesson that students can hand in through. */
  loadPieceBlocks?: (lessonId: string) => Promise<{ id: string; label: string }[]>;
};

/** Question-set blocks of a lesson, labelled by title or position, for the column form's block picker. */
async function lessonPieceBlocks(lessonId: string): Promise<{ id: string; label: string }[]> {
  const lesson = await getLesson(lessonId);
  const out: { id: string; label: string }[] = [];
  visitBlocks(lesson.blocks, (block) => {
    if (block.block_type !== 'question_set') return;
    const title = block.content.title?.trim();
    out.push({ id: block.id, label: title || `Question set ${out.length + 1}` });
  });
  return out;
}

/** `grid` is the syllabus Grid; `marks` is the table of quizzes and tasks. */
type Mode = 'grid' | 'next' | 'detail' | 'history' | 'marks' | 'progress';
const MODES: Array<[Mode, string]> = [['grid', 'Grid'], ['next', 'Next steps'], ['detail', 'Detail'], ['history', 'History'], ['marks', 'Marks'], ['progress', 'Progress']];


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

/** Whether a hidden quiz holds evidence on this tag: Next steps and Detail leave hidden quizzes out. */
function hiddenQuizzesHave(view: MarkbookView, tag: string, context: InsightContext): boolean {
  const hidden = view.quizzes.filter((q) => q.hidden).map((q) => ({ ...q, hidden: false }));
  if (!hidden.length) return false;
  const only: MarkbookView = { ...view, quizzes: hidden, markbook: { ...view.markbook, columns: [] } };
  return classEvidence(only, context).evidence.some((e) => e.tags.includes(tag));
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

/** How often the markbook reloads while students are mid-way through work, and otherwise. */
const LIVE_EVERY_MS = 30_000;
const IDLE_EVERY_MS = 120_000;

export function mountMarkbook(host: HTMLElement, cls: Class, options: Options = {}): () => void {
  const api = options.api ?? httpMarkbookApi;
  const progressApi = options.progressApi ?? httpProgressApi;
  let progressError = '';
  const today = options.today ?? (() => todayInSydney());
  const media = typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 600px)') : null;
  const narrow = options.narrow ?? (() => !!media?.matches);
  let view: MarkbookView | null = null;
  /** The last view the server confirmed, with no local changes on it. */
  let confirmed: MarkbookView | null = null;
  let mode: Mode = options.view ?? 'grid';
  /** Sort orders and open rows, kept across redraws. */
  const nextState = newNextState();
  const gridState = newSyllabusGridState();
  const detailState = newDetailState();
  const historyState = newHistoryState();
  /** Names for tags and codes, for Next steps, Detail and the student panel; loaded once, after the markbook. */
  let ctx: InsightContext | null = null;
  /** Set when the tag names could not be loaded, so those views and the student panel say so. */
  let ctxError: string | null = null;
  /** A student whose name was pressed before the tag names arrived; their panel opens once they do. */
  let pendingStudent: string | null = null;
  /** The open student panel, redrawn after each markbook repaint so a rolled-back save shows. */
  let studentPanel: StudentPanelHandle | null = null;
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
  /** Concept keys for tagging a criterion, and how many handed-in pieces wait on each linked task. Skipped under a test api. */
  let conceptChoices: { key: string; name: string }[] = [];
  const waitingByColumn = new Map<string, number>();
  if (!options.api) {
    void loadAlignment().then((a) => { conceptChoices = a.concepts.map((c) => ({ key: c.key, name: c.name })); }, () => {});
    void apiGet<{ tasks: { class_id: string; column_id: string; waiting: number }[] }>('/api/to-mark').then(
      (r) => {
        for (const task of r.tasks) if (task.class_id === cls.id) waitingByColumn.set(task.column_id, task.waiting);
        if (!disposed && view) paint();
      },
      () => {}
    );
  }
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
  const modes = el('div', 'mb__modes');
  modes.setAttribute('role', 'group');
  modes.setAttribute('aria-label', 'Markbook view');
  for (const [value, text] of MODES) {
    const b = el('button', 'btn btn--secondary mb__mode', text);
    b.type = 'button';
    b.dataset.mode = value;
    b.addEventListener('click', () => {
      mode = value;
      paint();
      b.focus();
    });
    modes.append(b);
  }
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
  tools.append(addGroup, hiddenToggle, removedToggle, exportButton);
  head.append(title, modes, tools);
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
      lessons: options.pieceLessons,
      loadBlocks: options.loadPieceBlocks ?? lessonPieceBlocks,
      concepts: conceptChoices,
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
    markLink: (columnId) => {
      const path = `/mark/${encodeURIComponent(cls.id)}/${encodeURIComponent(columnId)}`;
      return { href: withAppBase(path), waiting: waitingByColumn.get(columnId) ?? 0, open: () => navigate(path) };
    },
    openStudent: (studentId) => {
      const student = view?.students.find((s) => s.id === studentId);
      // One panel at a time; a panel whose overlay has gone without closing counts as closed.
      if (studentPanel && !studentPanel.isOpen()) studentPanel = null;
      if (!view || !student || studentPanel) return;
      if (!ctx) {
        // The tag names are still loading: open once they arrive.
        status.textContent = ctxError ?? 'Loading…';
        if (!ctxError) pendingStudent = studentId;
        return;
      }
      const context = ctx;
      const { evidence } = classEvidence(view, context);
      const pinsNow = () => view?.markbook.focus?.[studentId] ?? { pinned: [], dismissed: [] };
      studentPanel = openStudentPanel({
        student,
        evidence,
        kind: defaultKind(evidence),
        label: (tag) => tagLabel(tag, context),
        codeLabel: (id) => codeLabel(id, context.codes),
        pins: pinsNow(),
        pinsNow,
        history: (view.markbook.history ?? []),
        loadAnalysis: () => Promise.resolve().then(() => api.analysis(cls.id, studentId)),
        outcomeName: (key) => analysisName(key),
        onGroup: (ids, pattern) => void saveHoldingGroup(ids, pattern.key, analysisName(pattern.key), pattern.step),
        overall: formatPercent(overallFor(view.markbook, studentId).percent),
        onPins: (next) =>
          change({ kind: 'focus', studentId, pinned: next.pinned, dismissed: next.dismissed }, () => api.setFocus(cls.id, studentId, next.pinned, next.dismissed)),
        // Back to this student's name, which a redraw may have replaced, else the heading.
        returnFocus: () => body.querySelector<HTMLElement>(`.mb-patterns__name[data-student="${CSS.escape(studentId)}"]`) ?? title,
        onClose: () => {
          studentPanel = null;
        }
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
    openWork: (lessonId, studentId) => {
      const work = view?.work?.find((w) => w.lesson_id === lessonId);
      const student = view?.students.find((s) => s.id === studentId);
      if (!work || !student) return;
      openWorkSheet(work, student, withAppBase(`/lessons/${encodeURIComponent(lessonId)}`), {
        returnFocus: () => findInBody('.mb-cell', work.id, studentId) ?? title
      });
    },
    openHeatmap: (lessonId) => {
      const quiz = view?.quizzes.find((q) => q.lesson_id === lessonId);
      if (!quiz || !view) return;
      openHeatmap(quiz, rowStudents(view, false), { returnFocus: () => findInBody('.mb-col__title', quiz.id) ?? title });
    }
  };

  /** Quiz and task titles by evidence source, for history wording. */
  function sourceTitles(current: MarkbookView): Map<string, string> {
    const titles = new Map<string, string>();
    for (const q of current.quizzes) titles.set(q.id, q.title);
    for (const c of current.markbook.columns) titles.set(c.id, c.title);
    return titles;
  }

  /** Once per load: write what the evidence now shows about saved groups. The server keeps each event once. */
  let synced = false;
  async function syncGroups(): Promise<void> {
    const current = view;
    const context = ctx;
    if (synced || !current || !context || !(current.markbook.groups ?? []).length) return;
    synced = true;
    const { evidence } = classEvidence(current, context);
    const have = new Set((current.markbook.history ?? []).map((e) => e.id));
    const events = historyEventsFor((current.markbook.groups ?? []), current.quizzes).filter((e) => !have.has(e.id));
    const leaves = leavesFor((current.markbook.groups ?? []), evidence, sourceTitles(current));
    if (!events.length && !leaves.length) return;
    try {
      const markbook = await enqueue(() => api.recordHistory(cls.id, events, leaves));
      if (disposed || !view) return;
      if (confirmed) confirmed = withServerCopy(confirmed, markbook, []);
      view = queued.reduce(applyChange, confirmed ?? view);
      paint();
    } catch {
      // The next load tries again; nothing is lost.
      synced = false;
    }
  }

  /** A readable name for an `out:`, `con:` or `skill:` key. */
  function analysisName(key: string): string {
    const rest = key.slice(key.indexOf(':') + 1);
    return rest.replace(/^skill:/, '').replace(/[-_.]/g, ' ').replace(/^./, (c) => c.toUpperCase());
  }

  /** Saves the students holding on one target as a group, with the evidence as the why. */
  async function saveHoldingGroup(students: string[], key: string, name: string, step: string): Promise<void> {
    const why = `Holding at ${step} on ${name}.`;
    const group = { id: newGroupId(), name: `${name} · holding at ${step}`.slice(0, 120), tags: [key], members: students.map((s) => ({ student: s, why })) };
    await writeGroups(() => api.saveGroup(cls.id, group, today()));
  }

  async function saveGroup(current: MarkbookView, context: InsightContext, tags: string[], students: string[]): Promise<void> {
    const { evidence } = classEvidence(current, context);
    const label = (t: string) => tagLabel(t, context);
    const titles = sourceTitles(current);
    const group = { id: newGroupId(), name: tags.map(label).join(' · '), tags, members: students.map((s) => ({ student: s, why: joinWhy(s, tags, evidence, titles, label) })) };
    await writeGroups(() => api.saveGroup(cls.id, group, today()));
  }

  async function addFlagged(current: MarkbookView, context: InsightContext, groupId: string, students: string[]): Promise<void> {
    const group = (current.markbook.groups ?? []).find((g) => g.id === groupId);
    if (!group) return;
    const { evidence } = classEvidence(current, context);
    const label = (t: string) => tagLabel(t, context);
    const titles = sourceTitles(current);
    const members = students.map((s) => ({ student: s, why: joinWhy(s, group.tags, evidence, titles, label) }));
    await writeGroups(() => api.addMembers(cls.id, groupId, members, today()));
  }

  async function writeGroups(call: () => Promise<Markbook>): Promise<void> {
    try {
      const markbook = await enqueue(call);
      if (disposed || !view) return;
      if (confirmed) confirmed = withServerCopy(confirmed, markbook, []);
      view = queued.reduce(applyChange, confirmed ?? view);
      status.textContent = '';
      paint();
    } catch (error) {
      status.textContent = error instanceof ApiClientError ? error.message : 'That didn’t save. Try again.';
    }
  }

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
    if (studentPanel?.isOpen()) studentPanel.refresh();
    if (!hadFocus) return;
    // The focused control went away (Hide, Unhide, an emptied list): fall back to the heading.
    const now = document.activeElement;
    if (!(now instanceof HTMLElement) || !section.contains(now) || now.closest('[hidden]')) title.focus();
  }

  function draw(current: MarkbookView, key: ReturnType<typeof focusKey>): void {
    const total = weightTotal(current.markbook);
    warning.hidden = total === 100 || assessments(current.markbook).length === 0;
    warning.textContent = `Assessment weights add to ${total}%, not 100%.`;
    for (const b of modes.querySelectorAll<HTMLButtonElement>('.mb__mode')) b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    removedToggle.hidden = removedStudentIds(current).length === 0;
    removedToggle.textContent = showRemoved ? 'Hide removed students' : 'Show removed students';
    paintHidden(current);
    if (!current.students.length) {
      body.replaceChildren(el('p', 'mb__empty', 'Add students to this class to start a markbook.'));
      return;
    }
    const students = rowStudents(current, showRemoved);
    if (mode === 'progress') {
      body.replaceChildren(
        renderProgress({ view: current, students, lessons: options.progressLessons ?? [], today: today(), error: progressError, onMark: markProgress })
      );
      restoreFocus(key);
      return;
    }
    if (mode !== 'marks') {
      const context = ctx;
      if (!context) body.replaceChildren(el('p', 'mb__status', ctxError ?? 'Loading…'));
      else if (mode === 'grid')
        body.replaceChildren(
          renderSyllabusGrid(
            current,
            students,
            context,
            gridState,
            {
              openStudent: actions.openStudent,
              followUp: (tag, ids, evidence) => followUp(current, context, tag, ids, evidence),
              planTutorial: (tag, ids, evidence) => planTutorial(current, context, tag, ids, evidence),
              repaint: paint
            },
            narrow()
          )
        );
      else if (mode === 'next')
        body.replaceChildren(
          renderNextSteps(current, students, context, nextState, {
            openStudent: actions.openStudent,
            followUp: (tag, ids, evidence) => followUp(current, context, tag, ids, evidence),
            planTutorial: (tag, ids, evidence) => planTutorial(current, context, tag, ids, evidence),
            saveGroup: (tags, ids) => void saveGroup(current, context, tags, ids),
            addFlagged: (groupId, ids) => void addFlagged(current, context, groupId, ids),
            pins: (id) => current.markbook.focus?.[id] ?? { pinned: [], dismissed: [] },
            repaint: paint
          })
        );
      else if (mode === 'history')
        body.replaceChildren(
          renderHistory({
            groups: (current.markbook.groups ?? []),
            history: (current.markbook.history ?? []),
            names: new Map(current.students.map((s) => [s.id, `${s.initials} · ${s.name}`])),
            label: (t) => tagLabel(t, context),
            state: historyState,
            repaint: paint,
            openStudent: actions.openStudent
          })
        );
      else
        body.replaceChildren(
          renderPatterns(current, students, context, { openStudent: actions.openStudent, followUp: (tag, ids, evidence) => followUp(current, context, tag, ids, evidence) }, detailState)
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

  /** Ann's follow-up quiz for `ids` on `tag`, placed after the latest shown quiz with evidence on it. */
  function followUp(current: MarkbookView, context: InsightContext, tag: string, ids: string[], evidence: Evidence[]): void {
    const lessonId = latestQuizFor(current, tag, evidence);
    const quiz = current.quizzes.find((q) => q.lesson_id === lessonId);
    if (!quiz) {
      status.textContent = hiddenQuizzesHave(current, tag, context)
        ? 'This tag’s quizzes are hidden in the markbook.'
        : 'Follow-ups start from a quiz; this tag only has assessment marks.';
      return;
    }
    if (!quiz.unit_id) {
      status.textContent = FOLLOW_UP.noUnit;
      return;
    }
    status.textContent = '';
    // Only students still on the list; a removed student can sit in a group while they are shown.
    const listed = new Set(current.students.map((s) => s.id));
    openFollowUpPlan({
      sourceLessonId: quiz.lesson_id,
      sourceTitle: quiz.title,
      unitId: quiz.unit_id,
      flagId: null,
      tag,
      students: current.students,
      chosen: ids.filter((id) => listed.has(id)),
      evidence,
      label: (t) => tagLabel(t, context),
      codeLabel: (id) => codeLabel(id, context.codes),
      onDone: (id) => navigate(`/lessons/${encodeURIComponent(id)}`)
    });
  }

  /** Plan a tutorial for `ids` on `tag`, placed after the latest shown quiz with evidence on it. */
  function planTutorial(current: MarkbookView, context: InsightContext, tag: string, ids: string[], evidence: Evidence[]): void {
    const lessonId = latestQuizFor(current, tag, evidence);
    const quiz = current.quizzes.find((q) => q.lesson_id === lessonId);
    if (!quiz) {
      status.textContent = hiddenQuizzesHave(current, tag, context)
        ? 'This tag’s quizzes are hidden in the markbook.'
        : 'Tutorials start from a quiz; this tag only has assessment marks.';
      return;
    }
    if (!quiz.unit_id) {
      status.textContent = 'Tutorials start from a quiz in a unit.';
      return;
    }
    status.textContent = '';
    // Only students still on the list; a tutorial's groups are this class's students.
    const roster = current.students.filter((s) => !s.removed);
    const listed = new Set(roster.map((s) => s.id));
    const label = (t: string) => tagLabel(t, context);
    openTutorialPlan({
      classId: cls.id,
      unitId: quiz.unit_id,
      sourceLessonId: quiz.lesson_id,
      tag,
      tagLabel: label(tag),
      students: roster,
      chosen: ids.filter((id) => listed.has(id)),
      evidence,
      mistakeText: (why) => mixUpText({ tag, key: '', why, count: 1, students: [] }, label, (id) => codeLabel(id, context.codes)),
      onDone: (id) => navigate(`/lessons/${encodeURIComponent(id)}`)
    });
  }

  /** The Progress view's marks go to the profile endpoint; its reply is every student's records. */
  /** Progress saves, one at a time, and how many are still waiting for each student. */
  let progressQueue: Promise<void> = Promise.resolve();
  const progressPending = new Map<string, number>();

  /** Sets one student's done records on the shown view and the confirmed copy. */
  function setDone(studentId: string, records: Record<string, DoneRecord>): void {
    const lay = (v: MarkbookView): MarkbookView => ({ ...v, done: { ...v.done, [studentId]: records } });
    if (confirmed) confirmed = lay(confirmed);
    if (view) view = lay(view);
  }

  /** The cell changes at once; the save runs behind it, and a failed one puts the student's row back. */
  function markProgress(studentId: string, lessonId: string, state: 'complete' | 'partial' | 'clear'): void {
    const before = view?.done?.[studentId] ?? {};
    setDone(studentId, withMark(before, lessonId, state, new Date().toISOString()));
    progressPending.set(studentId, (progressPending.get(studentId) ?? 0) + 1);
    paint();
    progressQueue = progressQueue.then(async () => {
      let reply: Record<string, DoneRecord> | null = null;
      try {
        reply = await progressApi.mark(cls.id, studentId, lessonId, state);
        progressError = '';
      } catch (error) {
        progressError = error instanceof ApiClientError && error.code !== 'network_error' ? error.message : 'Couldn’t save that mark. Try again.';
        const row = { ...(view?.done?.[studentId] ?? {}) };
        if (before[lessonId]) row[lessonId] = before[lessonId];
        else delete row[lessonId];
        setDone(studentId, row);
      }
      const left = (progressPending.get(studentId) ?? 1) - 1;
      progressPending.set(studentId, left);
      // Later presses for this student are already shown; only the last reply settles the row.
      if (reply && left === 0) setDone(studentId, reply);
      if (!disposed) paint();
    });
  }

  /** Fetches a fresh view; changes still queued are laid over it. Says whether the server answered. */
  async function load(repaint = true): Promise<boolean> {
    if (disposed) return false;
    try {
      const fresh = await api.load(cls.id);
      const shown = view?.done;
      confirmed = fresh;
      // A Progress save still on its way keeps its row as shown.
      for (const [id, n] of progressPending) if (n > 0 && shown?.[id]) confirmed = { ...confirmed, done: { ...confirmed.done, [id]: shown[id] } };
      view = queued.reduce(applyChange, confirmed);
      if (repaint) paint();
      void syncGroups();
      return true;
    } catch (error) {
      // A server's own message says what went wrong; a dropped connection or garbled reply gets the plain one.
      const fromServer = error instanceof ApiClientError && error.code !== 'network_error' && error.code !== 'invalid_response';
      if (repaint) status.textContent = fromServer ? error.message : 'Couldn’t load the markbook.';
      return false;
    }
  }

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
  // Live: students' saved answers come in as they work. Reload while the page is in view,
  // more often while someone is mid-way, and never under the teacher's hands.
  let lastLoad = Date.now();
  const busy = (): boolean => {
    if (queued.length || document.querySelector('[role="dialog"], .mb-sheet')) return true;
    const active = document.activeElement;
    return !!active && section.contains(active) && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName);
  };
  const working = (current: MarkbookView | null): boolean => {
    if (!current) return false;
    if (current.quizzes.some((q) => q.started?.length)) return true;
    const recent = Date.now() - 3 * 3600_000;
    return (current.work ?? []).some((w) => Object.values(w.students).some((s) => Date.parse(s.at) > recent));
  };
  const live = window.setInterval(() => {
    if (disposed || document.hidden || !section.isConnected || busy()) return;
    if (Date.now() - lastLoad < (working(view) ? LIVE_EVERY_MS : IDLE_EVERY_MS)) return;
    lastLoad = Date.now();
    void load();
  }, 5_000);
  void loadInsightContext().then(
    (loaded) => {
      if (disposed) return;
      ctx = { ...loaded, outcomes: options.outcomes ?? loaded.outcomes };
      if (mode !== 'marks') paint();
      void syncGroups();
      const waiting = pendingStudent;
      pendingStudent = null;
      if (waiting) {
        if (status.textContent === 'Loading…') status.textContent = '';
        actions.openStudent(waiting);
      }
    },
    () => {
      if (disposed) return;
      ctxError = 'Couldn’t load the tag names, so Next steps, Detail and student panels can’t open. Reload to try again.';
      pendingStudent = null;
      status.textContent = ctxError;
      if (mode !== 'marks') paint();
    }
  );
  return () => {
    disposed = true;
    window.clearInterval(live);
    // Closing releases the overlay's hold on the rest of the page.
    studentPanel?.close();
    studentPanel = null;
    if (typeof media?.removeEventListener === 'function') media.removeEventListener('change', onMedia);
    else media?.removeListener?.(onMedia);
  };
}
