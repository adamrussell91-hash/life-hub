import { apiPost } from '@/api/client';
import type { Block } from '@/schemas/block';
import type { Lesson } from '@/schemas/lesson';
import {
  QUIZ_KIND_INFO,
  blankQuestion,
  norm,
  resolveQuizSettings,
  type MarkResult,
  type PublicQuestion,
  type QuestionKey,
  type QuizQuestion,
  type QuizResponse,
  type QuizSettings
} from '@/quiz/core';
import { answerLines } from '@/blocks/quiz-question';
import { mountQuestionBuilder } from '@/quiz/builder';
import { mountQuestionPlayer } from '@/quiz/player';
import { spanText } from '@/quiz/word-picker';
import { formatCode, keySummary, meter, renderLiveStage, type LiveQuiz } from '@/quiz/live-stage';
import { button, checkbox, el, errorText, formatMarks, labelled, plural, select } from '@/quiz/dom';
import { httpInsightApi, isInsight, type InsightApi, type InsightReply } from '@/evidence/api';
import { loadInsightContext, type InsightContext } from '@/evidence/context';
import type { InsightPayload } from '@/evidence/types';
import { renderQuizInsight } from '@/evidence/views/quiz-insight';
import { codeChips } from '@/evidence/code-chips';
import { navigate } from '@/app/router';
import './quiz.css';

/**
 * The teacher's quiz panel, shown above the canvas on a lesson whose type is
 * Quiz: questions students sent in, quiz settings, results with marking, and
 * the live round. Approving a student's question adds it to the lesson as an
 * ordinary quiz question block, so the canvas stays the one place questions
 * are edited and ordered.
 */

export type QuizPanelOptions = {
  getLesson: () => Lesson;
  onSettings: (settings: QuizSettings) => void;
  onAddBlocks: (blocks: Block[]) => void;
  onRemoveBlock: (blockId: string) => void;
  idFactory: () => string;
  /** Test seam for the insight calls; defaults to the quiz endpoint. */
  insightApi?: InsightApi;
};

export type QuizPanelHandle = { root: HTMLElement; update(lesson: Lesson): void; dispose(): void };

type Submission = {
  id: string;
  question: QuizQuestion;
  flagged: boolean;
  created_at: string;
  source_lesson_id: string;
  source_title: string;
  block_id: string;
  device: string;
  status: 'pending' | 'approved' | 'rejected';
  quiz_block_id: string | null;
};

type Row = { id: string; mark: MarkResult; awarded: number | null; hinted: boolean; response: QuizResponse | null; confidence: number | null; question: PublicQuestion; key: QuestionKey; codes: string[] };
/** Initials and name from the class list; both null when the student was removed. */
type StudentLabel = { initials: string | null; name: string | null };

type AttemptSummary = { student: StudentLabel | null; id: string; device: string; n: number; go: number; submitted_at: string; overtime: boolean; score: number; max: number; pending: number; current: boolean };
type QuestionStats = {
  id: string;
  question: PublicQuestion;
  key: QuestionKey;
  answered: number;
  total: number;
  full: number;
  pending: number;
  hinted: number;
  confidence: Record<'1' | '2' | '3', [number, number]>;
  picks: Record<string, number>;
};
type Results = { published: false } | { published: true; version: string; feedback: string; released: boolean; attempts: AttemptSummary[]; questions: QuestionStats[] };
type Tab = 'tray' | 'settings' | 'results' | 'live';

const TAB_KEY = 'quiz-panel:tab';

export function mountQuizPanel(options: QuizPanelOptions): QuizPanelHandle {
  const lessonId = options.getLesson().id;
  const endpoint = `/api/lessons/${encodeURIComponent(lessonId)}/quiz`;
  const root = el('section', 'qz-panel-root');
  root.setAttribute('aria-label', 'Quiz');
  const tabs = el('div', 'qz-tabs');
  tabs.setAttribute('role', 'tablist');
  const body = el('div', 'qz-tabpanel');
  body.setAttribute('role', 'tabpanel');
  const alert = el('p', 'qz-alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  root.append(tabs, alert, body);

  let tab: Tab = (sessionStorageGet(TAB_KEY) as Tab) || 'tray';
  let submissions: Submission[] | null = null;
  let filter: 'pending' | 'approved' | 'rejected' | 'flagged' = 'pending';
  let editing: string | null = null;
  let results: Results | null = null;
  let openAttempt: string | null = null;
  let live: LiveQuiz | null = null;
  let disposed = false;
  let timer: number | undefined;
  const insightApi = options.insightApi ?? httpInsightApi;
  let insight: InsightPayload | null = null;
  let compareInsight: InsightPayload | null = null;
  const followInsights = new Map<string, InsightPayload>();
  /** Which class and compare/follow-up ids the cached side insights were loaded for. */
  let sideKey = '';
  let classes: Array<{ id: string; title: string }> | null = null;
  let insightClass: string | null = null;
  let ctx: InsightContext | null = null;

  const post = <T>(body: Record<string, unknown>) => apiPost<T>(endpoint, body);
  const showError = (error: unknown) => {
    alert.textContent = errorText(error);
    alert.hidden = false;
  };

  /**
   * Bumped by every insight load and every insight action. A load commits only
   * if nothing bumped it during its awaits, so a slow poll never undoes Close
   * now, a dismiss or a class switch, and two loads never interleave writes.
   */
  let insightGen = 0;

  /**
   * Insights for the chosen class. The context and class list load once; the
   * insight reloads with each results poll. The Compare with quiz and follow-ups
   * reload only when the class or their ids change, so polls stay one call.
   * Returns false when a newer load or an action superseded this one.
   */
  async function loadInsight(): Promise<boolean> {
    const gen = ++insightGen;
    if (!classes) {
      try {
        classes = (await insightApi.classes(lessonId)).classes;
        insightClass = classes[0]?.id ?? null;
      } catch (error) {
        // Not retried each poll: insights fall back to every class.
        classes = [];
        insightClass = null;
        showError(error);
      }
    }
    const classId = insightClass;
    const reply: InsightReply = await insightApi.load(lessonId, classId);
    const next = isInsight(reply) ? reply : null;
    if (next) ctx ??= await loadInsightContext();
    const key = JSON.stringify([classId, next?.compare_with ?? null, (next?.follow_ups ?? []).map((f) => f.lesson_id)]);
    let side: { compare: InsightPayload | null; follow: Map<string, InsightPayload> } | null = null;
    if (key !== sideKey) {
      side = { compare: null, follow: new Map() };
      if (next?.compare_with) {
        const other = await insightApi.load(next.compare_with, classId).catch(() => null);
        side.compare = isInsight(other) ? other : null;
      }
      for (const f of next?.follow_ups ?? []) {
        const reply2 = await insightApi.load(f.lesson_id, classId).catch(() => null);
        if (isInsight(reply2)) side.follow.set(f.lesson_id, reply2);
      }
    }
    if (gen !== insightGen) return false;
    insight = next;
    if (side) {
      sideKey = key;
      compareInsight = side.compare;
      followInsights.clear();
      for (const [id, p] of side.follow) followInsights.set(id, p);
    }
    return true;
  }

  const TAB_LABELS: Record<Tab, string> = { tray: 'From students', settings: 'Settings', results: 'Results', live: 'Live' };
  function paintTabs(): void {
    tabs.replaceChildren();
    for (const t of Object.keys(TAB_LABELS) as Tab[]) {
      const waiting = t === 'tray' && submissions ? submissions.filter((s) => s.status === 'pending').length : 0;
      const b = el('button', 'qz-tab', waiting ? `${TAB_LABELS[t]} (${waiting})` : TAB_LABELS[t]);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(t === tab));
      b.addEventListener('click', () => {
        tab = t;
        sessionStorageSet(TAB_KEY, t);
        openAttempt = null;
        alert.hidden = true;
        paintTabs();
        paint();
        void refresh();
      });
      tabs.append(b);
    }
  }

  function paint(): void {
    if (disposed) return;
    if (tab === 'tray') body.replaceChildren(trayView());
    else if (tab === 'settings') body.replaceChildren(settingsView());
    else if (tab === 'results') body.replaceChildren(resultsView());
    else body.replaceChildren(liveView());
  }

  let painted = '';
  async function refresh(): Promise<void> {
    try {
      let data: unknown;
      if (tab === 'tray') data = submissions = (await post<{ submissions: Submission[] }>({ action: 'submissions' })).submissions;
      else if (tab === 'results' && !openAttempt) {
        results = await post<Results>({ action: 'results' });
        // A failed insight must not hide the results underneath it.
        try {
          await loadInsight();
        } catch (error) {
          showError(error);
        }
        data = [results, insight, compareInsight?.built_at ?? null, [...followInsights.values()].map((f) => f.built_at)];
      }
      else if (tab === 'live') data = live = (await post<{ live: LiveQuiz | null }>({ action: 'live_status' })).live;
      else return;
      paintTabs();
      if (tab === 'tray' && editing) return; // never repaint under a teacher who is editing
      // Polls only repaint when something changed, so buttons never move under a click.
      const signature = JSON.stringify([tab, filter, data]);
      if (signature === painted) return;
      painted = signature;
      paint();
      board?.refresh();
    } catch (error) {
      if (tab !== 'settings') showError(error);
    }
  }

  function schedule(): void {
    window.clearTimeout(timer);
    if (disposed) return;
    const wait = tab === 'live' && live ? 2500 : 15000;
    timer = window.setTimeout(async () => {
      if (!root.isConnected) return;
      if (!document.hidden && (tab !== 'results' || !openAttempt)) await refresh();
      schedule();
    }, wait);
  }

  /* ── Tray ── */

  function trayView(): HTMLElement {
    const wrap = el('div', 'qz-tray');
    const bar = el('div', 'qz-tray__bar');
    const add = button('Write a question yourself', 'secondary', () => {
      const id = options.idFactory();
      const now = new Date().toISOString();
      options.onAddBlocks([
        {
          id,
          type: 'block',
          block_type: 'quiz_question',
          variant: 'medium',
          visibility: 'student_teacher',
          content: { question: blankQuestion('multiple_choice', id) },
          layout: {},
          print: {},
          settings: {},
          created_at: now,
          updated_at: now,
          schema_version: 1
        } as Block
      ]);
    });
    if (!submissions) {
      wrap.append(bar, el('p', 'qz-note block-secondary', 'Loading questions…'));
      bar.append(add);
      return wrap;
    }
    const counts = {
      pending: submissions.filter((s) => s.status === 'pending' && !s.flagged).length,
      flagged: submissions.filter((s) => s.status === 'pending' && s.flagged).length,
      approved: submissions.filter((s) => s.status === 'approved').length,
      rejected: submissions.filter((s) => s.status === 'rejected').length
    };
    const pick = select(
      [
        { value: 'pending', label: `Waiting (${counts.pending})` },
        { value: 'flagged', label: `Flagged words (${counts.flagged})` },
        { value: 'approved', label: `Approved (${counts.approved})` },
        { value: 'rejected', label: `Rejected (${counts.rejected})` }
      ],
      filter
    );
    pick.setAttribute('aria-label', 'Show');
    pick.addEventListener('change', () => {
      filter = pick.value as typeof filter;
      paint();
    });
    bar.append(pick, add);
    const shown = submissions.filter((s) =>
      filter === 'flagged' ? s.status === 'pending' && s.flagged : filter === 'pending' ? s.status === 'pending' && !s.flagged : s.status === filter
    );
    if (filter === 'pending' && shown.length > 1) {
      bar.append(
        button(`Approve all ${shown.length}`, 'ghost', async function () {
          if (!window.confirm(`Add all ${shown.length} waiting questions to the quiz? You can still edit or remove them on the page.`)) return;
          this.disabled = true;
          await approveMany(shown);
        })
      );
    }
    wrap.append(bar);
    if (!submissions.length) {
      wrap.append(
        el('p', 'qz-note block-secondary', 'No questions yet. Add a Question drop block to this week’s lessons and choose this quiz as where it feeds into.')
      );
      return wrap;
    }
    if (!shown.length) {
      wrap.append(el('p', 'qz-note block-secondary', filter === 'pending' ? 'Nothing waiting. You’re all caught up.' : 'None here.'));
      return wrap;
    }
    const names = deviceNames(submissions.map((s) => s.device));
    const list = el('div', 'qz-tray__list');
    for (const group of similarGroups(shown)) {
      if (group.length > 1) {
        const g = el('div', 'qz-similar');
        g.append(el('p', 'qz-similar__title', `${group.length} similar questions: pick the best`));
        for (const s of group) g.append(submissionCard(s, names));
        list.append(g);
      } else list.append(submissionCard(group[0] as Submission, names));
    }
    wrap.append(list);
    return wrap;
  }

  function submissionCard(s: Submission, names: Map<string, string>): HTMLElement {
    const card = el('article', 'qz-sub');
    card.dataset.status = s.status;
    const head = el('div', 'qz-sub__head');
    head.append(
      el('span', 'qz-eyebrow block-eyebrow', QUIZ_KIND_INFO[s.question.kind]?.label ?? 'Question'),
      el('span', 'qz-sub__meta', `${names.get(s.device) ?? 'A student'} · ${s.source_title} · ${plural(s.question.marks, 'mark')}`)
    );
    if (s.flagged) head.append(el('span', 'qz-chip qz-chip--flag', 'Flagged words'));
    card.append(head);

    if (editing === s.id) {
      let edited = s.question;
      const builder = mountQuestionBuilder({ question: s.question, audience: 'teacher', allowImageUrl: true, onChange: (q) => (edited = q) });
      const actions = el('div', 'qz-actions');
      actions.append(
        button('Save and approve', 'primary', async function () {
          const problem = builder.problem();
          if (problem) {
            showError(problem);
            return;
          }
          this.disabled = true;
          editing = null;
          await approve(s, edited);
        }),
        button('Cancel', 'ghost', () => {
          editing = null;
          paint();
        })
      );
      card.append(builder.root, actions);
      return card;
    }

    const prompt = s.question.prompt?.trim();
    if (prompt) card.append(el('p', 'qz-sub__prompt', prompt));
    const lines = el('div', 'qz-card__answer');
    for (const line of answerLines(s.question)) lines.append(el('p', 'qz-card__line', line));
    card.append(lines);
    if (s.question.hint) card.append(el('p', 'qz-note block-secondary', `Hint: ${s.question.hint}`));

    const actions = el('div', 'qz-actions');
    if (s.status === 'pending') {
      actions.append(
        button('Approve', 'primary', async function () {
          this.disabled = true;
          await approve(s, s.question);
        }),
        button('Edit, then approve', 'secondary', () => {
          editing = s.id;
          paint();
        }),
        button('Reject', 'ghost', async function () {
          this.disabled = true;
          await review(s, 'rejected');
        })
      );
    } else {
      const inQuiz = s.quiz_block_id && blockExists(options.getLesson().blocks, s.quiz_block_id);
      actions.append(el('span', 'qz-note block-secondary', s.status === 'approved' ? (inQuiz ? 'In the quiz.' : 'Approved, then removed from the page.') : 'Rejected.'));
      actions.append(
        button('Undo', 'ghost', async function () {
          this.disabled = true;
          if (s.status === 'approved' && s.quiz_block_id && inQuiz) options.onRemoveBlock(s.quiz_block_id);
          await review(s, 'pending');
        })
      );
    }
    card.append(actions);
    return card;
  }

  function questionBlock(s: Submission, question: QuizQuestion): Block {
    const id = options.idFactory();
    const now = new Date().toISOString();
    return {
      id,
      type: 'block',
      block_type: 'quiz_question',
      variant: 'medium',
      visibility: 'student_teacher',
      content: { question: { ...question, id }, from_submission: s.id },
      layout: {},
      print: {},
      settings: {},
      created_at: now,
      updated_at: now,
      schema_version: 1
    } as Block;
  }

  async function approve(s: Submission, question: QuizQuestion): Promise<void> {
    const block = questionBlock(s, question);
    try {
      submissions = (await post<{ submissions: Submission[] }>({ action: 'review', submission_id: s.id, status: 'approved', quiz_block_id: block.id })).submissions;
      options.onAddBlocks([block]);
      alert.hidden = true;
    } catch (error) {
      showError(error);
    }
    paintTabs();
    paint();
  }

  async function approveMany(list: Submission[]): Promise<void> {
    const added: Block[] = [];
    for (const s of list) {
      const block = questionBlock(s, s.question);
      try {
        submissions = (await post<{ submissions: Submission[] }>({ action: 'review', submission_id: s.id, status: 'approved', quiz_block_id: block.id })).submissions;
        added.push(block);
      } catch (error) {
        showError(error);
        break;
      }
    }
    if (added.length) options.onAddBlocks(added);
    paintTabs();
    paint();
  }

  async function review(s: Submission, status: 'rejected' | 'pending'): Promise<void> {
    try {
      submissions = (await post<{ submissions: Submission[] }>({ action: 'review', submission_id: s.id, status })).submissions;
      alert.hidden = true;
    } catch (error) {
      showError(error);
    }
    paintTabs();
    paint();
  }

  /* ── Settings ── */

  function settingsView(): HTMLElement {
    const lesson = options.getLesson();
    const raw: QuizSettings = { ...(lesson.quiz ?? {}) };
    const s = resolveQuizSettings(raw);
    const wrap = el('div', 'qz-settings');
    const save = (patch: Partial<QuizSettings>) => {
      const next: QuizSettings = { ...(options.getLesson().quiz ?? {}), ...patch };
      for (const k of Object.keys(next) as Array<keyof QuizSettings>) if (next[k] === undefined) delete next[k];
      options.onSettings(next);
    };
    const number = (label: string, value: number | undefined, min: number, max: number, hint: string, apply: (n: number | undefined) => void) => {
      const input = el('input', 'qz-input qz-input--marks');
      input.type = 'number';
      input.min = String(min);
      input.max = String(max);
      input.placeholder = 'Off';
      input.value = value ? String(value) : '';
      input.addEventListener('change', () => {
        const n = Math.round(Number(input.value));
        if (!input.value.trim() || !Number.isFinite(n) || n <= 0) {
          input.value = '';
          apply(undefined);
          return;
        }
        const clamped = Math.max(min, Math.min(max, n));
        input.value = String(clamped);
        apply(clamped);
      });
      return labelled(label, input, hint);
    };
    const grid = el('div', 'qz-settings__grid');
    grid.append(
      number('Quiz timer (minutes)', raw.timer_minutes, 1, 180, 'Blank for no timer.', (n) => save({ timer_minutes: n })),
      number('Time per question (seconds)', raw.question_seconds, 10, 600, 'Blank for no limit.', (n) => save({ question_seconds: n })),
      number('Live quiz: move on at or above (% right)', raw.move_on, 1, 100, 'Blank for 80%. Running live in focus view, a question revealed below this stops at a checkpoint.', (n) => save({ move_on: n }))
    );
    const attempts = select(
      [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: n === 1 ? 'One go' : `${n} goes` })),
      String(s.attempts)
    );
    attempts.addEventListener('change', () => save({ attempts: Number(attempts.value) }));
    grid.append(labelled('Attempts', attempts));
    const feedback = select(
      [
        { value: 'instant', label: 'After each question' },
        { value: 'end', label: 'At the end' },
        { value: 'released', label: 'When I release them' }
      ],
      s.feedback
    );
    feedback.addEventListener('change', () => save({ feedback: feedback.value as QuizSettings['feedback'] }));
    grid.append(labelled('Show right answers', feedback));
    const hint = select(
      [
        { value: '0', label: 'Free' },
        { value: '0.25', label: 'A quarter of the marks' },
        { value: '0.5', label: 'Half the marks' },
        { value: '1', label: 'All the marks' }
      ],
      String(s.hint_cost)
    );
    hint.addEventListener('change', () => save({ hint_cost: Number(hint.value) }));
    grid.append(labelled('A hint costs', hint));
    const closes = el('input', 'qz-input');
    closes.type = 'datetime-local';
    closes.value = raw.closes_at ? toLocalInput(raw.closes_at) : '';
    closes.addEventListener('change', () => save({ closes_at: closes.value ? new Date(closes.value).toISOString() : undefined }));
    grid.append(labelled('Closes', closes, 'Also stops new questions arriving from Question drop blocks.'));
    const siblings = insight?.siblings ?? [];
    const current = raw.compare_with ?? '';
    const compareOptions = [{ value: '', label: 'None' }, ...siblings.map((x) => ({ value: x.lesson_id, label: x.title }))];
    if (current && !siblings.some((x) => x.lesson_id === current)) compareOptions.push({ value: current, label: 'An earlier quiz' });
    const compareWith = select(compareOptions, current);
    compareWith.addEventListener('change', () => {
      save({ compare_with: compareWith.value || undefined });
      // Drop in-flight loads and the cached compare panel; Results reloads it when shown.
      insightGen++;
      sideKey = '';
      if (tab === 'results') void refresh();
    });
    grid.append(
      labelled(
        'Compare with',
        compareWith,
        siblings.length ? 'Results shows before and after against this quiz. No republish needed.' : 'Open Results once to list this unit’s other quizzes.'
      )
    );
    if (raw.for_students?.length) {
      const n = raw.for_students.length;
      grid.append(el('p', 'qz-note block-secondary', `For ${n} ${n === 1 ? 'student' : 'students'} only (a follow-up quiz).`));
    }
    wrap.append(grid);

    const toggles = el('div', 'qz-settings__toggles');
    toggles.append(
      checkbox('Hard timer: lock answers when time runs out', !!s.timer_hard, (on) => save({ timer_hard: on })),
      checkbox('Shuffle question order', !!s.shuffle_questions, (on) => save({ shuffle_questions: on })),
      checkbox('Shuffle answer options', !!s.shuffle_options, (on) => save({ shuffle_options: on })),
      checkbox('Ask “How sure are you?” on each question', !!s.confidence, (on) => save({ confidence: on }))
    );
    wrap.append(toggles, el('p', 'qz-note block-secondary', 'Students get changes to questions and settings when you publish.'));
    return wrap;
  }

  /* ── Results ── */

  function resultsView(): HTMLElement {
    const wrap = el('div', 'qz-results');
    if (openAttempt) {
      wrap.append(el('p', 'qz-note block-secondary', 'Loading attempt…'));
      void post<{ attempt: AttemptDetail }>({ action: 'attempt', attempt_id: openAttempt })
        .then((res) => wrap.replaceChildren(attemptView(res.attempt)))
        .catch(showError);
      return wrap;
    }
    if (!results) {
      wrap.append(el('p', 'qz-note block-secondary', 'Loading results…'));
      return wrap;
    }
    if (!results.published) {
      wrap.append(el('p', 'qz-note block-secondary', 'Publish the quiz to start collecting results.'));
      return wrap;
    }
    const r = results;
    const total = r.attempts.length;
    const avg = total ? r.attempts.reduce((sum, a) => sum + (a.max ? a.score / a.max : 0), 0) / total : 0;
    const waiting = r.attempts.reduce((sum, a) => sum + a.pending, 0);
    const top = el('div', 'qz-results__top');
    top.append(
      stat(String(total), total === 1 ? 'attempt' : 'attempts'),
      stat(total ? `${Math.round(avg * 100)}%` : '–', 'average'),
      stat(String(waiting), waiting === 1 ? 'answer to mark' : 'answers to mark')
    );
    if (r.feedback === 'released') {
      top.append(
        button(r.released ? 'Hide results from students' : 'Release results to students', r.released ? 'ghost' : 'primary', async function () {
          this.disabled = true;
          try {
            results = await post<Results>({ action: 'release', released: !r.released });
          } catch (error) {
            showError(error);
          }
          paint();
        })
      );
    }
    wrap.append(top);
    if (insight && ctx) wrap.append(...insightSection(insight, ctx));
    if (!total) {
      wrap.append(el('p', 'qz-note block-secondary', 'No one has finished the quiz yet. This updates by itself.'));
      return wrap;
    }

    wrap.append(el('h4', 'qz-h', 'Answers by question'));
    const qs = el('ol', 'qz-qstats');
    for (const q of r.questions) qs.append(questionStat(q));
    wrap.append(qs);

    wrap.append(el('h4', 'qz-h', 'Attempts'));
    const names = deviceNames(r.attempts.filter((a) => !a.student).map((a) => a.device));
    const list = el('ul', 'qz-attempts');
    for (const a of r.attempts) {
      const li = el('li');
      const b = el('button', 'qz-attempt');
      b.type = 'button';
      b.append(
        el('span', 'qz-attempt__who', `${whoLabel(a, names)}${a.go > 0 ? ` · go ${a.go + 1}` : ''}`),
        el('span', 'qz-attempt__score', `${formatMarks(a.score)} / ${formatMarks(a.max)}`),
        el('span', 'qz-attempt__meta', [a.pending ? `${a.pending} to mark` : '', a.overtime ? 'Late' : '', a.current ? '' : 'Earlier version', timeAgo(a.submitted_at)].filter(Boolean).join(' · '))
      );
      if (a.pending) b.dataset.pending = 'true';
      b.addEventListener('click', () => {
        openAttempt = a.id;
        paint();
      });
      li.append(b);
      list.append(li);
    }
    wrap.append(list);
    const foot = el('div', 'qz-results__foot');
    foot.append(
      button('Clear all attempts', 'ghost', async function () {
        if (!window.confirm(`${total === 1 ? 'Clear the 1 attempt' : `Clear all ${total} attempts`} so everyone can start again? Answers and marks are deleted for good.`)) return;
        this.disabled = true;
        try {
          results = await post<Results>({ action: 'clear_all' });
        } catch (error) {
          showError(error);
        }
        paint();
      })
    );
    wrap.append(foot);
    return wrap;
  }

  function insightSection(p: InsightPayload, context: InsightContext): HTMLElement[] {
    const out: HTMLElement[] = [];
    if ((classes?.length ?? 0) > 1) {
      const pick = select((classes ?? []).map((c) => ({ value: c.id, label: c.title })), insightClass ?? '');
      pick.addEventListener('change', async () => {
        const previous = insightClass;
        insightClass = pick.value || null;
        try {
          await loadInsight();
        } catch (error) {
          insightClass = previous;
          showError(error);
        }
        paint();
      });
      out.push(labelled('Class', pick, 'Insights use each student’s first attempt.'));
    }
    const act = (run: () => Promise<InsightReply>) => async () => {
      insightGen++;
      try {
        const reply = await run();
        insightGen++; // a poll sent before this reply is now stale
        insight = isInsight(reply) ? reply : insight;
      } catch (error) {
        showError(error);
      }
      paint();
    };
    out.push(
      renderQuizInsight(p, {
        ctx: context,
        compare: compareInsight,
        followUps: followInsights,
        onClose: act(() => insightApi.close(lessonId, insightClass)),
        onReopen: act(() => insightApi.reopen(lessonId, insightClass)),
        onDismiss: async (flag) => {
          insightGen++;
          try {
            const { dismissed } = await insightApi.dismiss(lessonId, flag.id);
            insightGen++;
            if (insight) insight = { ...insight, dismissed };
          } catch (error) {
            showError(error);
          }
          paint();
        },
        openLesson: (id) => navigate(`/lessons/${encodeURIComponent(id)}`)
      })
    );
    return out;
  }

  function questionStat(q: QuestionStats): HTMLElement {
    const li = el('li', 'qz-qstat');
    const pct = q.total ? Math.round((q.full / q.total) * 100) : 0;
    const head = el('div', 'qz-qstat__head');
    head.append(el('span', 'qz-qstat__prompt', questionLabel(q.question)), el('span', 'qz-qstat__pct', `${pct}% full marks`));
    li.append(head);
    li.append(meter(pct));
    const notes: string[] = [];
    if (q.pending) notes.push(`${q.pending} to mark`);
    if (q.hinted) notes.push(`${q.hinted} used the hint`);
    const sureWrong = q.confidence['3'][0] - q.confidence['3'][1];
    if (sureWrong > 0) notes.push(`${sureWrong} ${sureWrong === 1 ? 'was' : 'were'} sure but didn’t get full marks`);
    if (notes.length) li.append(el('p', 'qz-note block-secondary', notes.join(' · ')));
    if ('options' in q.question && q.key.answer.type === 'choice') {
      const right = new Set(q.key.answer.ids);
      const picksTotal = Object.values(q.picks).reduce((a, b) => a + b, 0);
      const bars = el('ul', 'qz-bars');
      for (const o of q.question.options) {
        const n = q.picks[o.id] ?? 0;
        const row = el('li', 'qz-bars__row');
        if (right.has(o.id)) row.dataset.state = 'right';
        row.append(el('span', 'qz-bars__label', o.text), meter(picksTotal ? Math.round((n / picksTotal) * 100) : 0), el('span', 'qz-bars__n', String(n)));
        bars.append(row);
      }
      li.append(bars);
    }
    return li;
  }

  type AttemptDetail = { student: StudentLabel | null; id: string; device: string; n: number; submitted_at: string; overtime: boolean; score: number; max: number; pending: number; rows: Row[] };

  /**
   * Mark saves go out one at a time: the server rewrites an attempt's whole
   * marks record on each, so two at once could lose one.
   */
  let markQueue: Promise<unknown> = Promise.resolve();
  function inOrder<T>(fn: () => Promise<T>): Promise<T> {
    const next = markQueue.then(fn, fn);
    markQueue = next.catch(() => undefined);
    return next;
  }

  function attemptView(a: AttemptDetail): HTMLElement {
    const wrap = el('div', 'qz-attempt-detail');
    const bar = el('div', 'qz-tray__bar');
    bar.append(
      button('← All attempts', 'ghost', () => {
        openAttempt = null;
        paint();
        void refresh();
      }),
      el('span', 'qz-attempt__who', a.student ? whoLabel(a, new Map()) : 'Anonymous attempt'),
      el('span', 'qz-attempt__score', `${formatMarks(a.score)} / ${formatMarks(a.max)}${a.pending ? ` · ${a.pending} to mark` : ''}${a.overtime ? ' · Late' : ''}`),
      button('Give another go', 'ghost', async function () {
        const who = a.student ? whoLabel(a, new Map()) : 'this student';
        if (!window.confirm(`Clear every attempt by ${who} on this quiz so they can start again? Their answers and marks are deleted for good.`)) return;
        this.disabled = true;
        try {
          results = await post<Results>({ action: 'reset', attempt_id: a.id });
          openAttempt = null;
          paint();
        } catch (error) {
          showError(error);
          this.disabled = false;
        }
      })
    );
    wrap.append(bar);
    a.rows.forEach((r, i) => {
      const item = el('div', 'qz-attempt-row');
      item.append(mountQuestionPlayer({ question: r.question, response: r.response, number: i + 1, result: { mark: r.mark, key: r.key, hinted: r.hinted, awarded: r.awarded } }));
      if (r.confidence) item.append(el('p', 'qz-note block-secondary', `How sure: ${['', 'Guessing', 'Fairly sure', 'Sure'][r.confidence]}`));
      const markRow = el('div', 'qz-mark');
      const input = el('input', 'qz-input qz-input--marks');
      input.type = 'number';
      input.min = '0';
      input.max = String(r.mark.max);
      input.step = '0.5';
      input.value = r.awarded === null ? '' : String(r.awarded);
      input.placeholder = '–';
      const save = button(r.awarded === null ? 'Mark' : 'Change mark', r.awarded === null ? 'primary' : 'ghost', async function () {
        const score = input.value.trim() === '' ? null : Number(input.value);
        this.disabled = true;
        try {
          // Codes are read when the post goes out, so a chip changed just before still counts.
          const res = await inOrder(() =>
            post<{ attempt: AttemptDetail }>({ action: 'mark', attempt_id: a.id, question_id: r.id, score, codes: score === null || score >= r.mark.max ? [] : (r.codes ?? []) })
          );
          wrap.replaceWith(attemptView(res.attempt));
        } catch (error) {
          showError(error);
          this.disabled = false;
        }
      });
      markRow.append(labelled(`Marks out of ${formatMarks(r.mark.max)}`, input), save);
      item.append(markRow);
      // Saving the current mark with codes turns an automatic mark into a teacher mark of the same value.
      const awarded = r.awarded;
      const codes = ctx?.codes ?? [];
      if (codes.length && awarded !== null && awarded < r.mark.max) {
        const chipHost = el('div', 'qz-attempt-codes');
        let confirmed = [...(r.codes ?? [])];
        let waiting = 0;
        const paintChips = (): void => {
          chipHost.replaceChildren(
            codeChips({
              codes,
              selected: r.codes ?? [],
              label: `Why marks were lost: question ${i + 1}`,
              onChange: (ids) => {
                r.codes = ids;
                waiting += 1;
                inOrder(() => post<{ attempt: AttemptDetail }>({ action: 'mark', attempt_id: a.id, question_id: r.id, score: awarded, codes: ids })).then(
                  (res) => {
                    waiting -= 1;
                    confirmed = res.attempt.rows.find((x) => x.id === r.id)?.codes ?? ids;
                    if (!waiting) r.codes = confirmed;
                  },
                  (error: unknown) => {
                    waiting -= 1;
                    showError(error);
                    r.codes = [...confirmed];
                    paintChips();
                  }
                );
              }
            })
          );
        };
        paintChips();
        item.append(el('p', 'qz-field__label', 'Why marks were lost (optional)'), chipHost);
      }
      wrap.append(item);
    });
    return wrap;
  }

  /* ── Live ── */

  function liveView(): HTMLElement {
    const wrap = el('div', 'qz-live');
    if (!live) {
      wrap.append(
        el('p', 'qz-note block-secondary', 'Run the quiz from the front, one question at a time. Students join on the quiz page with a code. No leaderboard: you see how the class went, not who.'),
        button('Start live quiz', 'primary', async function () {
          this.disabled = true;
          await liveAction('live_start');
        })
      );
      return wrap;
    }
    const l = live;
    const bar = el('div', 'qz-live__bar');
    const code = el('div', 'qz-code');
    code.append(el('span', 'qz-code__label', 'Code'), el('span', 'qz-code__value', formatCode(l.code)));
    bar.append(
      code,
      el('span', 'qz-note block-secondary', `${plural(l.joined, 'student')} joined${l.index >= 0 ? ` · Question ${l.index + 1} of ${l.total}` : ''}`),
      button('Show on board', 'ghost', () => showBoard())
    );
    wrap.append(bar, renderLiveStage(l, false), liveControls(l));
    return wrap;
  }

  function liveControls(l: LiveQuiz): HTMLElement {
    const actions = el('div', 'qz-actions');
    if (l.phase === 'lobby') {
      actions.append(button('First question', 'primary', async function () {
        this.disabled = true;
        await liveAction('live_next');
      }));
    } else if (l.phase === 'question') {
      actions.append(button('Reveal answer', 'primary', async function () {
        this.disabled = true;
        await liveAction('live_reveal');
      }));
    } else if (l.phase === 'reveal') {
      actions.append(button(l.index + 1 >= l.total ? 'Finish' : 'Next question', 'primary', async function () {
        this.disabled = true;
        await liveAction('live_next');
      }));
      if (l.index > 0) actions.append(button('Back', 'ghost', () => void liveAction('live_back')));
    }
    actions.append(
      button('End', 'ghost', async function () {
        if (!window.confirm('End the live quiz?')) return;
        this.disabled = true;
        await liveAction('live_end');
      })
    );
    return actions;
  }

  async function liveAction(action: string): Promise<void> {
    try {
      live = (await post<{ live: LiveQuiz | null }>({ action })).live;
      if (live?.phase === 'done') live = null;
      alert.hidden = true;
    } catch (error) {
      showError(error);
    }
    paint();
    board?.refresh();
    schedule();
  }

  let board: { refresh(): void } | null = null;
  function showBoard(): void {
    const overlay = el('div', 'qz-board');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Live quiz board');
    const inner = el('div', 'qz-board__inner');
    const close = button('Close board', 'secondary', () => dismiss());
    overlay.append(inner, close);
    const paintBoard = () => {
      if (!live) {
        dismiss();
        return;
      }
      inner.replaceChildren();
      if (live.phase === 'lobby') {
        inner.append(el('p', 'qz-board__label', 'Open the quiz and type this code'), el('p', 'qz-board__code', formatCode(live.code)), el('p', 'qz-board__label', plural(live.joined, 'student') + ' joined'));
      } else {
        inner.append(renderLiveStage(live, true), liveControls(live));
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    function dismiss(): void {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      board = null;
    }
    document.addEventListener('keydown', onKey);
    document.body.append(overlay);
    board = { refresh: paintBoard };
    paintBoard();
    close.focus();
  }

  paintTabs();
  paint();
  void refresh().finally(schedule);
  const onVisible = () => {
    if (!document.hidden && root.isConnected) void refresh();
  };
  document.addEventListener('visibilitychange', onVisible);

  return {
    root,
    update() {
      // Settings controls already show what the teacher typed; repainting them would steal focus.
      if (tab === 'tray' && !editing) paint();
    },
    dispose() {
      disposed = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      root.remove();
    }
  };
}

export { keySummary };

/* ── helpers ── */

/** A question's words for a list: its prompt, or its passage with the gaps shown. */
function questionLabel(q: PublicQuestion): string {
  if (q.prompt.trim()) return q.prompt;
  if (q.kind === 'fill_gap') return q.parts.map((p) => (p.type === 'text' ? p.text : '____')).join('');
  return QUIZ_KIND_INFO[q.kind].label;
}

function stat(value: string, label: string): HTMLElement {
  const box = el('div', 'qz-stat');
  box.append(el('span', 'qz-stat__value', value), el('span', 'qz-stat__label', label));
  return box;
}

/** "BB · Bob Brown" for a known student, else the anonymous "Student A" style label. */
function whoLabel(a: { device: string; student: StudentLabel | null }, names: Map<string, string>): string {
  if (a.student) return a.student.initials ? `${a.student.initials} · ${a.student.name}` : 'Removed student';
  return names.get(a.device) ?? 'A student';
}

/** "Student A", "Student B" in order of first appearance. Never a name. */
function deviceNames(devices: string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const d of devices) {
    if (out.has(d)) continue;
    const n = out.size;
    const letters = n < 26 ? String.fromCharCode(65 + n) : `${String.fromCharCode(65 + Math.floor(n / 26) - 1)}${String.fromCharCode(65 + (n % 26))}`;
    out.set(d, `Student ${letters}`);
  }
  return out;
}

/** Groups questions whose wording mostly overlaps, so the teacher can keep the best one. */
function similarGroups(list: Submission[]): Submission[][] {
  const words = (s: Submission) =>
    new Set(
      norm(`${s.question.prompt ?? ''} ${(s.question as { quote?: string }).quote ?? ''} ${(s.question as { passage?: string }).passage ?? ''}`)
        .split(/[^a-z0-9']+/)
        .filter((w) => w.length > 2)
    );
  const sets = list.map(words);
  const groups: number[][] = [];
  const seen = new Set<number>();
  for (let i = 0; i < list.length; i++) {
    if (seen.has(i)) continue;
    const group = [i];
    seen.add(i);
    for (let j = i + 1; j < list.length; j++) {
      if (seen.has(j)) continue;
      const a = sets[i] as Set<string>;
      const b = sets[j] as Set<string>;
      if (a.size < 2 || b.size < 2) continue;
      const shared = [...a].filter((w) => b.has(w)).length;
      if (shared / (a.size + b.size - shared) >= 0.6) {
        group.push(j);
        seen.add(j);
      }
    }
    groups.push(group);
  }
  return groups.map((g) => g.map((i) => list[i] as Submission));
}

function blockExists(blocks: Block[], id: string): boolean {
  for (const b of blocks) {
    if (b.id === id) return true;
    const c = b.content as { blocks?: Block[]; columns?: Array<{ blocks: Block[] }>; tabs?: Array<{ blocks: Block[] }> };
    const nested = [c.blocks, ...(c.columns ?? []).map((x) => x.blocks), ...(c.tabs ?? []).map((x) => x.blocks)];
    if (nested.some((children) => Array.isArray(children) && blockExists(children, id))) return true;
  }
  return false;
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function timeAgo(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (!Number.isFinite(mins)) return '';
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

function sessionStorageGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function sessionStorageSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* private mode: the tab just won't be remembered */
  }
}
