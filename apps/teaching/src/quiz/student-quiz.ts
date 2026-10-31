import { apiPost, ApiClientError } from '@/api/client';
import type { Block } from '@/schemas/block';
import type { PublishedLesson } from '@/schemas/published-lesson';
import { hasAnswer, QUIZ_KIND_INFO, WRITTEN_KINDS, type MarkResult, type PublicQuestion, type QuestionKey, type QuizResponse, type WritingLog } from '@/quiz/core';
import { mountQuestionPlayer, seededShuffle } from '@/quiz/player';
import type { WritingWatch } from '@/quiz/writing-watch';
import { button, deviceToken, el, errorText, formatClock, formatMarks, plural, practiceChip, readJSON, writeJSON } from '@/quiz/dom';
import './quiz.css';

/**
 * The student's quiz: a start screen, one question at a time with timers,
 * hints and a "how sure" tap, then the marked result. Every mark comes from
 * the server; answers are kept on the device as the student goes, so a reload
 * or a dropped connection loses nothing. When the teacher runs the quiz live,
 * a join box takes the start screen's place and the class answers together.
 * A student already partway through a self-paced go keeps going.
 *
 * A quiz takes answers only for a class. The class page names it; a plain
 * lesson link picks the lesson's class by itself, or asks the student which
 * when the lesson is in several. The first time, the student types their
 * initials from the class list, and this device keeps them for every quiz in
 * that class.
 */

type Settings = NonNullable<PublishedLesson['quiz']>;
type ResultRow = { practice?: boolean; id: string; question: PublicQuestion; mark: MarkResult; awarded: number | null; hinted: boolean; response: QuizResponse | null; key: QuestionKey | null };
type Result = { practice?: { score: number; max: number; pending: number } | null; n: number; submitted_at: string; released: boolean; score?: number; max?: number; pending?: number; same_version?: boolean; keys_shown?: boolean; rows?: ResultRow[] };
type Current = {
  n: number;
  version: string;
  settings: Settings;
  questions: PublicQuestion[];
  practice?: string[];
  started_at: string;
  deadline: string | null;
  hints: Record<string, string>;
  saved?: { responses: Record<string, QuizResponse>; confidence: Record<string, 1 | 2 | 3>; writing?: Record<string, WritingLog>; at?: string };
  answers: Record<string, { response: QuizResponse | null; mark: MarkResult; key: QuestionKey | null }>;
};
type Status = {
  version: string;
  open: boolean;
  attempts_allowed: number;
  attempts_used: number;
  settings: Settings;
  questions: PublicQuestion[];
  practice?: string[];
  live: boolean;
  identity?: { need: 'class' | 'initials' | null; initials: string | null; classes?: Array<{ id: string; title: string }> };
  now?: string;
  current: Current | null;
  results: Result[];
  hint?: string;
  mark?: MarkResult;
  key?: QuestionKey | null;
};
type Draft = {
  order: string[];
  index: number;
  responses: Record<string, QuizResponse>;
  confidence: Record<string, 1 | 2 | 3>;
  spent: Record<string, number>;
  /** How each written answer was typed (writing.ts). */
  writing?: Record<string, WritingLog>;
};
type LiveView = {
  session: string;
  phase: 'lobby' | 'question' | 'reveal';
  index: number;
  total: number;
  joined: boolean;
  question?: PublicQuestion;
  answered?: boolean;
  response?: QuizResponse | null;
  mark?: MarkResult | null;
  key?: QuestionKey;
};

const FEEDBACK_TEXT = {
  instant: 'You’ll see if you’re right after each question.',
  end: 'You’ll see your marks when you finish.',
  released: 'Your teacher will share the marks later.'
} as const;

/**
 * Slots, keyed by question (block) id, put each question's answer space where
 * the teacher placed it in the lesson. The quiz box itself then keeps the
 * start, the hand-in and the marks; it is still one go, one hand-in.
 */
export type StudentQuizOptions = { classId?: string; pickClass?: boolean; slots?: Map<string, HTMLElement> };

/** What the lesson footer needs from a quiz on the page: how far the open go has got, and a way to hand it in. */
export type LessonQuizHandle = {
  progress(): { open: boolean; answered: number; total: number; blank: Array<{ prompt: string; marks: number }> };
  /** Hands in the open go. True once the server has it; true with nothing open. */
  handIn(): Promise<boolean>;
};
const lessonQuizzes = new Map<string, { root: HTMLElement; handle: LessonQuizHandle }>();

/** The quiz mounted for this lesson, while it's on the page. */
export function lessonQuiz(lessonId: string): LessonQuizHandle | null {
  const held = lessonQuizzes.get(lessonId);
  return held && held.root.isConnected ? held.handle : null;
}

export function mountStudentQuiz(lesson: PublishedLesson, options: StudentQuizOptions = {}): HTMLElement {
  // The page's copy is only a first paint. The server sends the questions and
  // settings for each attempt, so a republish never leaves a student answering
  // against ids the marker no longer knows.
  let settings = lesson.quiz as Settings;
  const lessonId = lesson.lesson_id;
  const endpoint = `/api/published/quiz/${encodeURIComponent(lessonId)}`;
  let questions = collectQuestions(lesson.blocks);
  let byId = new Map(questions.map((q) => [q.id, q]));
  let practice = new Set<string>();
  const useQuestions = (list: PublicQuestion[], next: Settings) => {
    questions = list;
    byId = new Map(list.map((q) => [q.id, q]));
    settings = next;
  };
  const token = deviceToken(`quiz:${lessonId}`);
  // A class picked on a plain lesson link is kept, so the next visit goes straight in.
  const pickClass = options.pickClass !== false && !options.classId;
  const pickedKey = `quiz-class:${lessonId}`;
  let classId = options.classId ?? (pickClass ? readJSON<string>(pickedKey) ?? undefined : undefined);
  // Initials are claimed per class, so the class keeps its own token for this device.
  let classToken: string | null = null;
  let classFields: Record<string, string> = {};
  const useClass = (id: string | undefined) => {
    classId = id;
    classToken = id ? deviceToken(`class:${id}`) : null;
    classFields = id ? { class_id: id, ...(classToken ? { class_token: classToken } : {}) } : {};
  };
  useClass(classId);
  let autoPick = true;
  const slots = options.slots?.size ? options.slots : null;

  const root = el('section', 'qz-quiz');
  root.setAttribute('aria-label', 'Quiz');
  const liveHost = el('div', 'qz-quiz__live');
  const body = el('div', 'qz-quiz__body');
  const alert = el('p', 'qz-alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  root.append(liveHost, alert, body);

  let status: Status | null = null;
  let draft: Draft | null = null;
  let clockOffset = 0;
  let tick: number | undefined;
  let questionStarted = Date.now();
  let checking: Record<string, { mark: MarkResult; key: QuestionKey | null }> = {};
  let autoSubmitted = -1;
  let view: 'landing' | 'quiz' | 'review' | 'result' = 'landing';
  let resultIndex = -1;
  let submitting = false;
  let receiptAt: Date | null = null;

  const showError = (text: string) => {
    alert.textContent = text;
    alert.hidden = false;
  };

  async function call(action: string, extra: Record<string, unknown> = {}): Promise<Status | null> {
    try {
      const next = await apiPost<Status>(endpoint, { action, ...(token ? { token } : {}), ...classFields, ...extra });
      if (next.now) clockOffset = Date.parse(next.now) - Date.now();
      status = next;
      practice = new Set(next.current?.practice ?? next.practice ?? []);
      if (next.current) useQuestions(next.current.questions, next.current.settings);
      else if (next.questions) useQuestions(next.questions, next.settings);
      alert.hidden = true;
      return next;
    } catch (error) {
      if (pickClass && classId && error instanceof ApiClientError && error.code === 'need_class') {
        // The class this device picked is gone: forget it and ask again.
        writeJSON(pickedKey, null);
        useClass(undefined);
        autoPick = false;
        return call('status');
      }
      showError(errorText(error));
      if (error instanceof ApiClientError && action !== 'status') {
        // Whatever went wrong, show the server's view of things rather than a stale one.
        const message = alert.textContent ?? '';
        await call('status');
        showError(message);
      }
      return null;
    }
  }

  const draftKey = (n: number) => `quiz:${lessonId}:${status?.current?.version ?? settings.version}:${n}`;
  function loadDraft(current: Current): Draft {
    const saved = readJSON<Draft>(draftKey(current.n));
    // Answers kept by the server fill in whatever this browser lost or never had.
    const fromServer = (d: Draft): Draft => {
      for (const [id, response] of Object.entries(current.saved?.responses ?? {})) if (byId.has(id) && !hasAnswer(d.responses[id])) d.responses[id] = response;
      for (const [id, value] of Object.entries(current.saved?.confidence ?? {})) if (byId.has(id) && !d.confidence[id]) d.confidence[id] = value;
      for (const [id, log] of Object.entries(current.saved?.writing ?? {})) {
        if (!byId.has(id)) continue;
        d.writing ??= {};
        if (!d.writing[id]) d.writing[id] = log;
      }
      return d;
    };
    if (saved && saved.order?.length === questions.length && saved.order.every((id) => byId.has(id))) return fromServer(saved);
    const ids = questions.map((q) => q.id);
    return fromServer({
      order: settings.shuffle_questions ? seededShuffle(ids, `${token ?? ''}:${current.n}`) : ids,
      index: 0,
      responses: {},
      confidence: {},
      spent: {}
    });
  }

  /* ── Saving to the server as the student goes ── */

  type SaveState = 'saved' | 'saving' | 'failed';
  let saveState: SaveState = 'saved';
  let dirty = false;
  let lastSavedAt: number | null = null;
  let saveTimer: number | undefined;
  let saving = false;
  const saveChips = new Set<HTMLElement>();
  /** Written answers whose typing log changed since the last save. Only those go out, since a log can run to kilobytes. */
  const writingDirty = new Set<string>();

  /** Watches a written question's box, when the quiz has the writing check on. */
  function writingWatch(d: Draft, q: PublicQuestion): WritingWatch | undefined {
    const check = settings.writing_check ?? 'flag';
    if (check === 'off' || !WRITTEN_KINDS.includes(q.kind)) return undefined;
    return {
      check,
      log: d.writing?.[q.id] ?? null,
      onLog: (log) => {
        d.writing = { ...(d.writing ?? {}), [q.id]: log };
        writingDirty.add(q.id);
        saveDraft();
      }
    };
  }

  /** Marks a written answer's log as changed, after typing in it. */
  function typed(d: Draft, id: string): void {
    if (d.writing?.[id]) writingDirty.add(id);
  }

  function paintSaveChip(chip: HTMLElement): void {
    chip.dataset.state = saveState;
    chip.textContent = saveState === 'failed' ? 'Not saved yet. Keep this page open.' : saveState === 'saving' ? 'Saving…' : 'Saved ✓';
  }

  function paintSaveChips(): void {
    for (const chip of saveChips) {
      if (!chip.isConnected) saveChips.delete(chip);
      else paintSaveChip(chip);
    }
  }

  function saveChip(): HTMLElement {
    const chip = el('span', 'qz-save');
    chip.setAttribute('role', 'status');
    saveChips.add(chip);
    paintSaveChip(chip);
    return chip;
  }

  /** Sends the answers so far to the server. Safe to call often; failures retry on the next beat. */
  async function pushSave(): Promise<void> {
    window.clearTimeout(saveTimer);
    if (saving || !draft || !status?.current || submitting) return;
    saving = true;
    saveState = 'saving';
    paintSaveChips();
    const sent = JSON.stringify([draft.responses, draft.confidence]);
    const logs = draft.writing ?? {};
    const writing = Object.fromEntries([...writingDirty].filter((id) => logs[id]).map((id) => [id, logs[id]]));
    writingDirty.clear();
    try {
      await apiPost(endpoint, { action: 'save', ...(token ? { token } : {}), ...classFields, responses: draft.responses, confidence: draft.confidence, ...(Object.keys(writing).length ? { writing } : {}) });
      lastSavedAt = Date.now();
      if (draft && JSON.stringify([draft.responses, draft.confidence]) === sent) dirty = false;
      saveState = 'saved';
    } catch (error) {
      // The attempt may have ended (handed in elsewhere, or closed): nothing to keep saving.
      if (error instanceof ApiClientError && ['no_attempt', 'need_class', 'need_initials'].includes(error.code ?? '')) dirty = false;
      else for (const id of Object.keys(writing)) writingDirty.add(id);
      saveState = dirty ? 'failed' : 'saved';
    }
    saving = false;
    paintSaveChips();
    if (dirty && saveState === 'saved') queueSave();
  }

  function queueSave(): void {
    dirty = true;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => void pushSave(), 700);
  }

  // A beat every 10 seconds covers a failed save and any change the quick save missed.
  window.setInterval(() => {
    if (!root.isConnected || !draft || !status?.current) return;
    if (dirty || saveState === 'failed' || lastSavedAt === null || Date.now() - lastSavedAt > 30_000) {
      dirty = true;
      void pushSave();
    }
  }, 10_000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && dirty && root.isConnected) void pushSave();
  });
  window.addEventListener('beforeunload', (event) => {
    if (dirty && saveState === 'failed' && root.isConnected) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  function saveDraft(): void {
    if (draft && status?.current && !writeJSON(draftKey(status.current.n), draft)) {
      showError('This browser isn’t saving your answers as you go. Keep this page open until you finish.');
    }
    if (draft && status?.current) queueSave();
  }

  /* ── Views ── */

  function paint(): void {
    paintBody();
    paintSlots();
  }

  function paintBody(): void {
    window.clearInterval(tick);
    if (!status) {
      body.replaceChildren(el('p', 'qz-note', 'Loading the quiz…'));
      return;
    }
    if (!token || (classId && !classToken)) {
      body.replaceChildren(panel('This browser can’t remember you, so you can’t take the quiz here.', 'Use your usual browser, in a normal (not private) window.'));
      return;
    }
    if (status.identity?.need === 'class') {
      const classes = pickClass ? status.identity.classes ?? [] : [];
      if (classes.length === 1 && autoPick) {
        body.replaceChildren(el('p', 'qz-note', 'Loading the quiz…'));
        void chooseClass((classes[0] as { id: string }).id);
      } else if (classes.length) body.replaceChildren(classPicker(classes));
      else body.replaceChildren(panel('Open this quiz from your class page.', 'Your class page has the link that knows who you are.'));
      return;
    }
    if (status.identity?.need === 'initials') {
      body.replaceChildren(initialsView());
      return;
    }
    if (status.current && view !== 'review') view = 'quiz';
    // Answering happens in the slots, so the box here is the hand-in.
    if (slots && status.current && (view === 'quiz' || view === 'review')) body.replaceChildren(reviewView(status.current));
    else if (view === 'quiz' && status.current) body.replaceChildren(quizView(status.current));
    else if (view === 'review' && status.current) body.replaceChildren(reviewView(status.current));
    else if (view === 'result') body.replaceChildren(resultView());
    // One way in at a time: while the teacher runs it live, the join box above is the quiz.
    else if (status.live) body.replaceChildren();
    else body.replaceChildren(landingView(status));
  }

  async function chooseClass(id: string): Promise<void> {
    useClass(id);
    writeJSON(pickedKey, id);
    const next = await call('status');
    if (next?.current) {
      draft = loadDraft(next.current);
      questionStarted = Date.now();
    }
    paint();
    if (next?.live) await pollLive();
  }

  function classPicker(classes: Array<{ id: string; title: string }>): HTMLElement {
    const box = el('div', 'qz-panel qz-class-pick');
    box.append(el('p', 'qz-panel__title', 'Which class are you in?'));
    const row = el('div', 'qz-actions');
    for (const c of classes) {
      row.append(
        button(c.title, 'secondary', async function () {
          for (const b of row.querySelectorAll('button')) b.disabled = true;
          await chooseClass(c.id);
        })
      );
    }
    box.append(row);
    return box;
  }

  // `opensQuestion`: typed in a question card, so the go starts and that question opens to answer.
  function initialsView(opensQuestion = false): HTMLElement {
    const box = el('div', 'qz-panel qz-initials');
    box.append(
      el('p', 'qz-panel__title', 'Type your initials'),
      el('p', 'qz-note', 'Use the initials your teacher gave you, like BB. This device keeps them for every quiz in this class.')
    );
    const input = el('input', 'qz-input qz-initials__input');
    input.autocomplete = 'off';
    input.maxLength = 5;
    input.placeholder = 'BB';
    input.setAttribute('autocapitalize', 'characters');
    input.setAttribute('aria-label', 'Your initials');
    const go = button('Continue', 'primary', async function () {
      this.disabled = true;
      const next = await call('claim', { initials: input.value });
      this.disabled = false;
      if (!next || next.identity?.need) return;
      const fresh = !next.current && !next.live && next.open && !next.results.length && next.attempts_allowed > next.attempts_used;
      if (opensQuestion && fresh) await startAttempt();
      else paint();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') go.click();
    });
    const row = el('div', 'qz-actions');
    row.append(input, go);
    box.append(row);
    return box;
  }

  function landingView(s: Status): HTMLElement {
    const wrap = el('div', 'qz-landing');
    if (s.identity?.initials) wrap.append(el('p', 'qz-note qz-who', `Quizzing as ${s.identity.initials}`));
    const facts = el('ul', 'qz-facts');
    const fact = (text: string) => facts.append(el('li', '', text));
    fact(`${plural(settings.question_count, 'question')} · ${plural(settings.total_marks, 'mark')}`);
    if (settings.timer_minutes) fact(`${settings.timer_minutes} minutes${settings.timer_hard ? ', and answers lock when time’s up' : ''}`);
    if (settings.question_seconds) fact(`${settings.question_seconds} seconds a question`);
    fact(settings.attempts === 1 ? 'One go' : `${settings.attempts} goes, ${Math.max(0, s.attempts_allowed - s.attempts_used)} left`);
    fact(FEEDBACK_TEXT[settings.feedback ?? 'end']);
    if (slots) fact('You answer each question where it sits in the lesson, then hand in here.');
    if ((settings.attempts ?? 1) > 1 && settings.feedback !== 'released') fact('Right answers show after your last go.');
    const check = settings.writing_check ?? 'flag';
    if (check !== 'off' && questions.some((q) => WRITTEN_KINDS.includes(q.kind))) {
      fact(check === 'block' ? 'Pasting is off in written answers. Your teacher sees how each one was typed.' : 'Your teacher sees how written answers were typed.');
    }
    if (settings.closes_at) fact(`Closes ${new Date(settings.closes_at).toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`);
    wrap.append(facts);

    if (s.results.length) {
      const last = s.results[s.results.length - 1] as Result;
      const box = el('div', 'qz-panel qz-panel--done');
      if (last.released && last.max !== undefined) {
        box.append(el('p', 'qz-panel__title', `Your score: ${formatMarks(last.score ?? 0)} / ${formatMarks(last.max)}`));
        if (last.pending) box.append(el('p', 'qz-note', `${plural(last.pending, 'answer')} still to be marked by your teacher.`));
        box.append(
          button('See your answers', 'secondary', () => {
            resultIndex = s.results.length - 1;
            view = 'result';
            paint();
          })
        );
      } else {
        box.append(el('p', 'qz-panel__title', 'Sent.'), el('p', 'qz-note', 'Your teacher will share the marks later. This page updates by itself.'));
      }
      wrap.append(box);
    }

    const left = s.attempts_allowed - s.attempts_used;
    if (!questions.length) wrap.append(panel('There are no questions in this quiz yet.', 'Check back later.'));
    else if (!s.open) wrap.append(panel('This quiz has closed.', ''));
    else if (left > 0) {
      wrap.append(
        button(s.results.length ? 'Try again' : 'Start the quiz', 'primary', async function () {
          this.disabled = true;
          if ((await startAttempt()) && slots) firstSlot()?.scrollIntoView({ block: 'center' });
        })
      );
    }
    return wrap;
  }

  async function startAttempt(): Promise<boolean> {
    const next = await call('start');
    if (next?.current) {
      draft = loadDraft(next.current);
      questionStarted = Date.now();
      view = 'quiz';
    } else if (next) showError('The quiz didn’t open. Try again in a moment.');
    paint();
    return !!next?.current;
  }

  function remainingMs(current: Current): number | null {
    if (!current.deadline) return null;
    return Date.parse(current.deadline) - (Date.now() + clockOffset);
  }

  function quizView(current: Current): HTMLElement {
    if (!draft) draft = loadDraft(current);
    const d = draft;
    const id = d.order[d.index] as string;
    const q = byId.get(id) as PublicQuestion;
    const instant = settings.feedback === 'instant';
    const checked = current.answers[id] ?? checking[id];
    const wrap = el('div', 'qz-taking');

    // Top bar: where you are, the clocks, and the question dots.
    const bar = el('div', 'qz-taking__bar');
    bar.append(el('span', 'qz-taking__where', `Question ${d.index + 1} of ${d.order.length}`));
    if (practice.has(id)) bar.append(practiceChip());
    const clocks = el('span', 'qz-taking__clocks');
    const quizClock = el('span', 'qz-clock');
    const questionClock = el('span', 'qz-clock qz-clock--question');
    clocks.append(quizClock, questionClock);
    bar.append(clocks, saveChip());
    wrap.append(bar);

    const dots = el('ol', 'qz-dots');
    dots.setAttribute('aria-label', 'Questions');
    d.order.forEach((qid, i) => {
      const li = el('li');
      const b = el('button', 'qz-dot', String(i + 1));
      b.type = 'button';
      const done = hasAnswer(d.responses[qid]) || !!current.answers[qid];
      b.dataset.state = i === d.index ? 'now' : done ? 'done' : 'todo';
      b.setAttribute('aria-label', `Question ${i + 1}${done ? ', answered' : ''}`);
      if (i === d.index) b.setAttribute('aria-current', 'step');
      b.addEventListener('click', () => go(i));
      li.append(b);
      dots.append(li);
    });
    wrap.append(dots);

    const spentBefore = d.spent[id] ?? 0;
    const questionLimit = settings.question_seconds ? settings.question_seconds * 1000 : null;
    const timeUp = () => questionLimit !== null && spentBefore + (Date.now() - questionStarted) >= questionLimit;
    const locked = !!checked || (settings.timer_hard && questionLimit !== null && spentBefore >= questionLimit);

    const player = mountQuestionPlayer({
      question: q,
      number: d.index + 1,
      response: checked?.response ?? d.responses[id] ?? null,
      locked,
      shuffle: !!settings.shuffle_options,
      seed: `${token ?? ''}:${current.n}`,
      result: checked ? { mark: checked.mark, key: checked.key } : null,
      writing: writingWatch(d, q),
      onChange: (response) => {
        d.responses[id] = response;
        typed(d, id);
        saveDraft();
        paintDotsState();
      }
    });
    wrap.append(player);

    if (q.has_hint && !checked) wrap.append(hintControl(current, id, leaveQuestion));
    if (settings.confidence && !checked) wrap.append(confidenceControl(d, id));

    const nav = el('div', 'qz-actions qz-actions--nav');
    const back = button('Back', 'ghost', () => go(d.index - 1));
    back.disabled = d.index === 0;
    nav.append(back);
    if (instant && !checked) {
      nav.append(
        button('Check answer', 'primary', async function () {
          if (!hasAnswer(d.responses[id])) {
            showError('Answer the question first.');
            return;
          }
          this.disabled = true;
          leaveQuestion();
          const res = await call('check', { question_id: id, response: d.responses[id], confidence: d.confidence[id] });
          if (res?.mark) checking = { ...checking, [id]: { mark: res.mark, key: res.key ?? null } };
          paint();
        })
      );
    }
    const last = d.index === d.order.length - 1;
    nav.append(
      button(last ? 'Finish' : 'Next', instant && !checked ? 'secondary' : 'primary', () => {
        if (last) {
          leaveQuestion();
          view = 'review';
          paint();
        } else go(d.index + 1);
      })
    );
    wrap.append(nav);

    function paintDotsState(): void {
      dots.querySelectorAll<HTMLButtonElement>('.qz-dot').forEach((b, i) => {
        if (i === d.index) return;
        const qid = d.order[i] as string;
        b.dataset.state = hasAnswer(d.responses[qid]) || current.answers[qid] ? 'done' : 'todo';
      });
    }

    // Clocks: the quiz countdown from the server, and this question's own countdown.
    const paintClocks = () => {
      const left = remainingMs(current);
      quizClock.hidden = left === null;
      if (left !== null) {
        quizClock.textContent = left > 0 ? `${formatClock(left)} left` : 'Time’s up';
        quizClock.dataset.state = left <= 0 ? 'over' : left < 60_000 ? 'low' : '';
        if (left <= 0 && settings.timer_hard && !submitting && autoSubmitted !== current.n) {
          autoSubmitted = current.n;
          void submit(true);
          return;
        }
      }
      questionClock.hidden = questionLimit === null || !!checked;
      if (questionLimit !== null && !checked) {
        const qLeft = questionLimit - spentBefore - (Date.now() - questionStarted);
        questionClock.textContent = qLeft > 0 ? `${formatClock(qLeft)} for this one` : 'Time’s up for this one';
        questionClock.dataset.state = qLeft <= 0 ? 'over' : qLeft < 10_000 ? 'low' : '';
        if (qLeft <= 0 && settings.timer_hard && !player.dataset.locked) {
          player.dataset.locked = 'true';
          player.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>('button, input, select, textarea').forEach((x) => (x.disabled = true));
          const at = d.index;
          if (timeUp() && !last) window.setTimeout(() => draft?.index === at && go(at + 1), 800);
        }
      }
    };
    paintClocks();
    tick = window.setInterval(() => {
      if (!wrap.isConnected) return window.clearInterval(tick);
      paintClocks();
    }, 500);
    return wrap;
  }

  /** Hint: opened once, costs a share of the marks, and stays open. */
  function hintControl(current: Current, id: string, before: () => void): HTMLElement {
    const hint = current.hints[id];
    if (hint) return el('p', 'qz-hint', `Hint: ${hint}`);
    const cost = settings.hint_cost ?? 0.5;
    const label = cost === 0 ? 'Show hint' : cost >= 1 ? 'Show hint (you’ll lose this question’s marks)' : `Show hint (costs ${cost === 0.5 ? 'half' : `${Math.round(cost * 100)}%`} of the marks)`;
    return button(label, 'ghost', async function () {
      this.disabled = true;
      before();
      await call('hint', { question_id: id });
      paint();
    });
  }

  function confidenceControl(d: Draft, id: string): HTMLElement {
    const row = el('div', 'qz-confidence');
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', 'How sure are you?');
    row.append(el('span', 'qz-confidence__label', 'How sure are you?'));
    ([
      [1, 'Guessing'],
      [2, 'Fairly sure'],
      [3, 'Sure']
    ] as const).forEach(([value, text]) => {
      const b = el('button', 'qz-chip', text);
      b.type = 'button';
      b.setAttribute('aria-pressed', String(d.confidence[id] === value));
      b.addEventListener('click', () => {
        d.confidence[id] = value;
        saveDraft();
        row.querySelectorAll('.qz-chip').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      });
      row.append(b);
    });
    return row;
  }

  /* ── Slots: each question answered where it sits in the lesson ── */

  const slotList = () => [...(slots?.entries() ?? [])];
  const firstSlot = (only?: (id: string) => boolean) => slotList().find(([id]) => !only || only(id))?.[1];

  function paintSlots(): void {
    for (const [id, slot] of slotList()) {
      // Repaint only when this question's state changes, so typing elsewhere keeps its place.
      const sig = slotSignature(id);
      if (slot.dataset.sig === sig) continue;
      slot.dataset.sig = sig;
      slot.replaceChildren(slotView(id));
    }
  }

  function slotSignature(id: string): string {
    const s = status;
    const current = s?.current;
    return JSON.stringify([
      !!s,
      current?.n ?? null,
      !!draft,
      byId.has(id),
      !!(current?.answers[id] ?? checking[id]),
      !!current?.hints[id],
      s?.identity?.need ?? null,
      !!s?.live,
      s?.open ?? null,
      s?.results.length ?? 0,
      s ? s.attempts_allowed - s.attempts_used : null
    ]);
  }

  function slotView(id: string): HTMLElement {
    const q = byId.get(id);
    const current = status?.current;
    if (current && q) {
      if (!draft) draft = loadDraft(current);
      return slotTaking(current, id, q);
    }
    const box = el('div', 'qz-slot');
    if (q) {
      box.append(el('p', 'qz-eyebrow block-eyebrow', `${QUIZ_KIND_INFO[q.kind]?.label ?? 'Question'} · ${formatMarks(q.marks)} ${q.marks === 1 ? 'mark' : 'marks'}`));
      box.append(el('p', 'qz-card__prompt block-title', q.prompt));
    }
    const s = status;
    const toBox = (label: string) => button(label, 'secondary', () => root.scrollIntoView({ block: 'center' }));
    if (!s) box.append(el('p', 'qz-note', 'Loading…'));
    else if (current) box.append(el('p', 'qz-note', 'This question isn’t part of your current go.'));
    else if (s.live) box.append(el('p', 'qz-note', 'Your teacher is running this quiz live. Join at the end of the lesson.'), toBox('Go to the quiz'));
    else if (s.identity?.need === 'initials') box.append(initialsView(true));
    else if (s.identity?.need === 'class') {
      const classes = pickClass ? s.identity.classes ?? [] : [];
      if (classes.length === 1 && autoPick) box.append(el('p', 'qz-note', 'Loading…'));
      else if (classes.length) box.append(classPicker(classes));
      else box.append(el('p', 'qz-note', 'Open this quiz from your class page.'));
    }
    else if (!s.open) box.append(el('p', 'qz-note', 'This quiz has closed.'));
    else if (s.attempts_allowed - s.attempts_used > 0) {
      box.append(
        button(s.results.length ? 'Try again' : 'Start answering', 'primary', async function () {
          this.disabled = true;
          if (!(await startAttempt())) this.disabled = false;
        })
      );
    } else box.append(el('p', 'qz-note', 'Handed in. Your marks are at the end of the lesson.'), toBox('See your marks'));
    return box;
  }

  function slotTaking(current: Current, id: string, q: PublicQuestion): HTMLElement {
    const d = draft as Draft;
    const checked = current.answers[id] ?? checking[id];
    const wrap = el('div', 'qz-slot qz-slot--taking');
    if (practice.has(id)) wrap.append(practiceChip());
    wrap.append(
      mountQuestionPlayer({
        question: q,
        response: checked?.response ?? d.responses[id] ?? null,
        locked: !!checked,
        shuffle: !!settings.shuffle_options,
        seed: `${token ?? ''}:${current.n}`,
        result: checked ? { mark: checked.mark, key: checked.key } : null,
        writing: writingWatch(d, q),
        onChange: (response) => {
          d.responses[id] = response;
          typed(d, id);
          saveDraft();
          // The hand-in box counts what's left to answer.
          paintBody();
        }
      })
    );
    if (q.has_hint && !checked) wrap.append(hintControl(current, id, saveDraft));
    if (settings.confidence && !checked) wrap.append(confidenceControl(d, id));
    const row = el('div', 'qz-actions');
    if (settings.feedback === 'instant' && !checked) {
      row.append(
        button('Check answer', 'primary', async function () {
          if (!hasAnswer(d.responses[id])) {
            note.textContent = 'Answer the question first.';
            note.hidden = false;
            return;
          }
          this.disabled = true;
          const res = await call('check', { question_id: id, response: d.responses[id], confidence: d.confidence[id] });
          if (res?.mark) checking = { ...checking, [id]: { mark: res.mark, key: res.key ?? null } };
          paint();
        })
      );
    }
    row.append(saveChip());
    const note = el('p', 'qz-alert');
    note.setAttribute('role', 'alert');
    note.hidden = true;
    wrap.append(note, row);
    return wrap;
  }

  function leaveQuestion(): void {
    if (!draft) return;
    const id = draft.order[draft.index] as string;
    draft.spent[id] = (draft.spent[id] ?? 0) + (Date.now() - questionStarted);
    questionStarted = Date.now();
    saveDraft();
  }

  function go(index: number): void {
    if (!draft || index < 0 || index >= draft.order.length) return;
    leaveQuestion();
    draft.index = index;
    saveDraft();
    alert.hidden = true;
    paint();
    body.querySelector<HTMLElement>('.qz-player__prompt, .qz-player')?.scrollIntoView({ block: 'nearest' });
  }

  function reviewView(current: Current): HTMLElement {
    const d = draft ?? loadDraft(current);
    const wrap = el('div', 'qz-review');
    const unanswered = d.order.filter((id) => !hasAnswer(d.responses[id]) && !current.answers[id]);
    wrap.append(el('h3', 'qz-h', slots ? 'Hand in your answers' : 'Ready to hand in?'), saveChip());
    if (slots) wrap.append(el('p', 'qz-note', 'Answer each question where it sits in the lesson. Your teacher only sees your answers after you press Hand it in.'));
    else wrap.append(el('p', 'qz-note', 'Your answers are saved, but your teacher only sees them after you press Hand it in.'));
    if (unanswered.length) {
      wrap.append(el('p', 'qz-note', `${plural(unanswered.length, 'question')} not answered yet:`));
      const list = el('div', 'qz-actions');
      for (const id of unanswered) {
        const i = d.order.indexOf(id);
        list.append(
          button(`Question ${i + 1}`, 'ghost', () => {
            if (slots) {
              slots.get(id)?.scrollIntoView({ block: 'center' });
              return;
            }
            view = 'quiz';
            go(i);
          })
        );
      }
      wrap.append(list);
    } else wrap.append(el('p', 'qz-note', 'Every question has an answer.'));
    const clock = el('p', 'qz-note');
    const paintClock = () => {
      const left = remainingMs(current);
      clock.hidden = left === null;
      if (left === null) return;
      clock.textContent = left > 0 ? `${formatClock(left)} left.` : 'Time’s up: hand it in now.';
      if (left <= 0 && settings.timer_hard && !submitting && autoSubmitted !== current.n) {
        autoSubmitted = current.n;
        void submit(true);
      }
    };
    paintClock();
    wrap.append(clock);
    tick = window.setInterval(() => {
      if (!wrap.isConnected) return window.clearInterval(tick);
      paintClock();
    }, 500);
    const actions = el('div', 'qz-actions');
    if (!slots) {
      actions.append(
        button('Back to the questions', 'ghost', () => {
          view = 'quiz';
          paint();
        })
      );
    }
    actions.append(
      button('Hand it in', 'primary', async function () {
        this.disabled = true;
        await submit(false);
      })
    );
    wrap.append(actions);
    return wrap;
  }

  async function submit(auto: boolean): Promise<boolean> {
    if (submitting || !status?.current) return false;
    submitting = true;
    window.clearTimeout(saveTimer);
    const n = status.current.n;
    const d = draft ?? loadDraft(status.current);
    const res = await call('submit', { responses: d.responses, confidence: d.confidence, ...(d.writing ? { writing: d.writing } : {}) });
    submitting = false;
    // Handed in only when the server's own list says so; anything else keeps the answers and says so.
    const confirmed = res?.results.find((r) => r.n === n);
    if (res && confirmed) {
      writeJSON(draftKey(n), null);
      draft = null;
      dirty = false;
      checking = {};
      receiptAt = new Date(confirmed.submitted_at);
      resultIndex = res.results.length - 1;
      view = 'result';
      if (auto) showError('Time’s up. Your answers were handed in.');
    } else if (res) {
      showError('Your hand-in didn’t go through. Your answers are kept: press Hand it in again.');
      view = 'review';
    }
    paint();
    return !!(res && confirmed);
  }

  function resultView(): HTMLElement {
    const s = status as Status;
    const r = s.results[resultIndex] ?? s.results[s.results.length - 1];
    const wrap = el('div', 'qz-result-view');
    if (r) {
      const at = receiptAt && new Date(r.submitted_at).getTime() === receiptAt.getTime() ? receiptAt : new Date(r.submitted_at);
      const receipt = el('div', 'qz-receipt');
      receipt.setAttribute('role', 'status');
      receipt.append(
        el('p', 'qz-receipt__title', '✓ Handed in'),
        el('p', 'qz-note', `Your teacher has your answers, received ${at.toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}.${s.identity?.initials ? ` Handed in as ${s.identity.initials}.` : ''} Take a photo of this screen if you want proof.`)
      );
      wrap.append(receipt);
    }
    if (!r) {
      wrap.append(panel('Nothing handed in yet.', ''));
      return wrap;
    }
    if (!r.released || r.max === undefined) {
      wrap.append(panel('Handed in.', 'Your teacher will share the marks later. This page updates by itself.'));
    } else {
      const pct = r.max ? Math.round(((r.score ?? 0) / r.max) * 100) : 0;
      const top = el('div', 'qz-score');
      top.append(el('p', 'qz-score__big', `${formatMarks(r.score ?? 0)} / ${formatMarks(r.max)}`), el('p', 'qz-note', `${pct}%${r.pending ? ` · ${plural(r.pending, 'answer')} still to be marked` : ''}`));
      wrap.append(top);
      if (r.practice) wrap.append(el('p', 'qz-result__practice', `Practice for you: ${formatMarks(r.practice.score)}/${formatMarks(r.practice.max)}${r.practice.pending ? ' (some still to mark)' : ''}`));
      if (r.same_version === false) wrap.append(el('p', 'qz-note', 'Your teacher has changed the quiz since, so some questions may look different now.'));
      const list = el('ol', 'qz-result-list');
      if (r.keys_shown === false) wrap.append(el('p', 'qz-note', 'Right answers show after your last go.'));
      (r.rows ?? []).forEach((row, i) => {
        const q = row.question;
        const li = el('li');
        if (row.practice) li.append(practiceChip());
        li.append(mountQuestionPlayer({ question: q, number: i + 1, response: row.response, result: { mark: row.mark, key: row.key, hinted: row.hinted, awarded: row.awarded } }));
        list.append(li);
      });
      wrap.append(list);
    }
    const actions = el('div', 'qz-actions');
    actions.append(
      button('Done', 'secondary', () => {
        view = 'landing';
        alert.hidden = true;
        paint();
      })
    );
    wrap.append(actions);
    return wrap;
  }

  /* ── Live ── */

  const liveKey = `quiz-live:${lessonId}`;
  let liveSession = readJSON<string>(liveKey);
  let liveState: LiveView | null = null;
  let livePainted = '';
  let liveResponse: QuizResponse | null = null;
  let liveTimer: number | undefined;

  async function pollLive(): Promise<void> {
    if (!token) return;
    try {
      const res = await apiPost<{ live: LiveView | null }>(endpoint, { action: 'live_status', token, ...classFields, ...(liveSession ? { session: liveSession } : {}) });
      liveState = res.live;
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'new_session') {
        liveSession = null;
        writeJSON(liveKey, null);
      }
      liveState = null;
    }
    paintLive();
    // The live round ended: bring back the self-paced start.
    if (!liveState && status?.live && (await call('status')) && view === 'landing') paint();
  }

  function paintLive(): void {
    const l = liveState;
    const signature = JSON.stringify(l ? [l.session, l.phase, l.index, l.joined, l.answered, !!l.mark] : null);
    if (signature === livePainted) return;
    livePainted = signature;
    root.classList.toggle('qz-quiz--live', !!l?.joined);
    if (!l) {
      liveHost.replaceChildren();
      return;
    }
    const box = el('div', 'qz-panel qz-live-student');
    if (!l.joined) {
      box.append(el('p', 'qz-panel__title', 'Your teacher is running this quiz live'));
      const input = el('input', 'qz-input qz-code-input');
      input.inputMode = 'numeric';
      input.autocomplete = 'off';
      input.maxLength = 7;
      input.placeholder = '000 000';
      input.setAttribute('aria-label', 'Code on the board');
      const join = button('Join', 'primary', async function () {
        this.disabled = true;
        try {
          const res = await apiPost<{ live: LiveView | null }>(endpoint, { action: 'live_join', token, ...classFields, code: input.value });
          liveState = res.live;
          if (res.live?.session) {
            liveSession = res.live.session;
            writeJSON(liveKey, liveSession);
          }
          alert.hidden = true;
        } catch (error) {
          showError(errorText(error));
        }
        this.disabled = false;
        livePainted = '';
        paintLive();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') join.click();
      });
      const row = el('div', 'qz-actions');
      row.append(input, join);
      box.append(el('p', 'qz-note', 'Type the code on the board.'), row);
    } else if (l.phase === 'lobby' || !l.question) {
      box.append(el('p', 'qz-panel__title', 'You’re in.'), el('p', 'qz-note', 'The first question will appear here.'));
    } else {
      const q = l.question;
      box.append(el('p', 'qz-player__meta', `Live · Question ${l.index + 1} of ${l.total}`));
      const revealed = l.phase === 'reveal';
      if (!l.answered && !revealed) liveResponse = null;
      box.append(
        mountQuestionPlayer({
          question: q,
          response: l.response ?? liveResponse,
          locked: l.answered || revealed,
          result: revealed && l.key ? { mark: l.mark ?? { score: 0, max: q.marks, correct: false }, key: l.key } : null,
          onChange: (response) => (liveResponse = response)
        })
      );
      if (!l.answered && !revealed) {
        box.append(
          button('Send answer', 'primary', async function () {
            if (!liveResponse || !hasAnswer(liveResponse)) {
              showError('Answer the question first.');
              return;
            }
            this.disabled = true;
            try {
              const res = await apiPost<{ live: LiveView | null }>(endpoint, { action: 'live_answer', token, ...classFields, index: l.index, response: liveResponse });
              liveState = res.live;
              alert.hidden = true;
            } catch (error) {
              showError(errorText(error));
            }
            livePainted = '';
            paintLive();
          })
        );
      } else if (!revealed) box.append(el('p', 'qz-note', 'Answer sent. Wait for your teacher to show the answer.'));
      else if (!l.answered) box.append(el('p', 'qz-note', 'You didn’t answer this one.'));
    }
    liveHost.replaceChildren(box);
  }

  function scheduleLive(): void {
    window.clearTimeout(liveTimer);
    liveTimer = window.setTimeout(async () => {
      if (!root.isConnected) return;
      if (!document.hidden) {
        if (liveState || status?.live) await pollLive();
        // While the student is typing initials, a refresh would repaint the box
        // and wipe what they typed; nothing (not even live) opens before a claim.
        else if (view === 'landing' && !status?.identity?.need) {
          await call('status');
          if (view === 'landing') paint();
          if (status?.live) await pollLive();
        }
      }
      scheduleLive();
    }, liveState ? 2500 : 10000);
  }

  paint();
  void call('status').then(async (s) => {
    if (s?.current) {
      draft = loadDraft(s.current);
      questionStarted = Date.now();
    }
    paint();
    if (s?.live) await pollLive();
    scheduleLive();
  });
  lessonQuizzes.set(lessonId, {
    root,
    handle: {
      progress() {
        const current = status?.current;
        if (!current) return { open: false, answered: 0, total: 0, blank: [] };
        const d = draft ?? loadDraft(current);
        const done = (id: string) => hasAnswer(d.responses[id]) || !!current.answers[id];
        const blank = d.order.filter((id) => !done(id)).map((id) => byId.get(id)).filter((q): q is PublicQuestion => !!q);
        return { open: true, answered: d.order.length - blank.length, total: d.order.length, blank: blank.map((q) => ({ prompt: q.prompt, marks: q.marks })) };
      },
      async handIn() {
        if (!status?.current) return true;
        return submit(false);
      }
    }
  });
  return root;
}

/** True when a quiz question sits inside a section, columns or tabs rather than on the page itself. */
export function hasNestedQuizQuestion(blocks: Block[]): boolean {
  const top = new Set(blocks.filter((b) => b.block_type === 'quiz_question').map((b) => b.id));
  return collectQuestions(blocks).some((q) => !top.has(q.id));
}

function collectQuestions(blocks: Block[]): PublicQuestion[] {
  const out: PublicQuestion[] = [];
  const walk = (list: Block[]) => {
    for (const b of list) {
      if (b.block_type === 'quiz_question') out.push(b.content.question as unknown as PublicQuestion);
      const c = b.content as { blocks?: Block[]; columns?: Array<{ blocks: Block[] }>; tabs?: Array<{ blocks: Block[] }> };
      if (Array.isArray(c.blocks)) walk(c.blocks);
      for (const col of c.columns ?? []) walk(col.blocks);
      for (const tab of c.tabs ?? []) walk(tab.blocks);
    }
  };
  walk(blocks);
  return out;
}

function panel(title: string, sub: string): HTMLElement {
  const box = el('div', 'qz-panel qz-panel--wait');
  box.append(el('p', 'qz-panel__title', title));
  if (sub) box.append(el('p', 'qz-note', sub));
  return box;
}
