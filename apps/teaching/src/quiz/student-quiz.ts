import { apiPost, ApiClientError } from '@/api/client';
import type { Block } from '@/schemas/block';
import type { PublishedLesson } from '@/schemas/published-lesson';
import { hasAnswer, type MarkResult, type PublicQuestion, type QuestionKey, type QuizResponse } from '@/quiz/core';
import { mountQuestionPlayer, seededShuffle } from '@/quiz/player';
import { button, deviceToken, el, errorText, formatClock, formatMarks, plural, readJSON, writeJSON } from '@/quiz/dom';
import './quiz.css';

/**
 * The student's quiz: a start screen, one question at a time with timers,
 * hints and a "how sure" tap, then the marked result. Every mark comes from
 * the server; answers are kept on the device as the student goes, so a reload
 * or a dropped connection loses nothing. When the teacher runs the quiz live,
 * a join box appears and the class answers together.
 *
 * A quiz takes answers only from its class page. The first time, the student types their initials from the class list, and this device keeps them for every quiz in that class.
 */

type Settings = NonNullable<PublishedLesson['quiz']>;
type ResultRow = { id: string; question: PublicQuestion; mark: MarkResult; awarded: number | null; hinted: boolean; response: QuizResponse | null; key: QuestionKey | null };
type Result = { n: number; submitted_at: string; released: boolean; score?: number; max?: number; pending?: number; same_version?: boolean; keys_shown?: boolean; rows?: ResultRow[] };
type Current = {
  n: number;
  version: string;
  settings: Settings;
  questions: PublicQuestion[];
  started_at: string;
  deadline: string | null;
  hints: Record<string, string>;
  answers: Record<string, { response: QuizResponse | null; mark: MarkResult; key: QuestionKey | null }>;
};
type Status = {
  version: string;
  open: boolean;
  attempts_allowed: number;
  attempts_used: number;
  settings: Settings;
  questions: PublicQuestion[];
  live: boolean;
  identity?: { need: 'class' | 'initials' | null; initials: string | null };
  now?: string;
  current: Current | null;
  results: Result[];
  hint?: string;
  mark?: MarkResult;
  key?: QuestionKey | null;
};
type Draft = { order: string[]; index: number; responses: Record<string, QuizResponse>; confidence: Record<string, 1 | 2 | 3>; spent: Record<string, number> };
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

export function mountStudentQuiz(lesson: PublishedLesson, options: { classId?: string } = {}): HTMLElement {
  // The page's copy is only a first paint. The server sends the questions and
  // settings for each attempt, so a republish never leaves a student answering
  // against ids the marker no longer knows.
  let settings = lesson.quiz as Settings;
  const lessonId = lesson.lesson_id;
  const endpoint = `/api/published/quiz/${encodeURIComponent(lessonId)}`;
  let questions = collectQuestions(lesson.blocks);
  let byId = new Map(questions.map((q) => [q.id, q]));
  const useQuestions = (list: PublicQuestion[], next: Settings) => {
    questions = list;
    byId = new Map(list.map((q) => [q.id, q]));
    settings = next;
  };
  const token = deviceToken(`quiz:${lessonId}`);
  // Initials are claimed per class, so the class keeps its own token for this device.
  const classToken = options.classId ? deviceToken(`class:${options.classId}`) : null;
  const classFields = options.classId ? { class_id: options.classId, ...(classToken ? { class_token: classToken } : {}) } : {};

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

  const showError = (text: string) => {
    alert.textContent = text;
    alert.hidden = false;
  };

  async function call(action: string, extra: Record<string, unknown> = {}): Promise<Status | null> {
    try {
      const next = await apiPost<Status>(endpoint, { action, ...(token ? { token } : {}), ...classFields, ...extra });
      if (next.now) clockOffset = Date.parse(next.now) - Date.now();
      status = next;
      if (next.current) useQuestions(next.current.questions, next.current.settings);
      else if (next.questions) useQuestions(next.questions, next.settings);
      alert.hidden = true;
      return next;
    } catch (error) {
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
    if (saved && saved.order?.length === questions.length && saved.order.every((id) => byId.has(id))) return saved;
    const ids = questions.map((q) => q.id);
    return {
      order: settings.shuffle_questions ? seededShuffle(ids, `${token ?? ''}:${current.n}`) : ids,
      index: 0,
      responses: {},
      confidence: {},
      spent: {}
    };
  }
  function saveDraft(): void {
    if (draft && status?.current && !writeJSON(draftKey(status.current.n), draft)) {
      showError('This browser isn’t saving your answers as you go. Keep this page open until you finish.');
    }
  }

  /* ── Views ── */

  function paint(): void {
    window.clearInterval(tick);
    if (!status) {
      body.replaceChildren(el('p', 'qz-note', 'Loading the quiz…'));
      return;
    }
    if (!token || (options.classId && !classToken)) {
      body.replaceChildren(panel('This browser can’t remember you, so you can’t take the quiz here.', 'Use your usual browser, in a normal (not private) window.'));
      return;
    }
    if (status.identity?.need === 'class') {
      body.replaceChildren(panel('Open this quiz from your class page.', 'Your class page has the link that knows who you are.'));
      return;
    }
    if (status.identity?.need === 'initials') {
      body.replaceChildren(initialsView());
      return;
    }
    if (status.current && view !== 'review') view = 'quiz';
    if (view === 'quiz' && status.current) body.replaceChildren(quizView(status.current));
    else if (view === 'review' && status.current) body.replaceChildren(reviewView(status.current));
    else if (view === 'result') body.replaceChildren(resultView());
    else body.replaceChildren(landingView(status));
  }

  function initialsView(): HTMLElement {
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
      if (next && !next.identity?.need) paint();
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
    if ((settings.attempts ?? 1) > 1 && settings.feedback !== 'released') fact('Right answers show after your last go.');
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
          const next = await call('start');
          if (next?.current) {
            draft = loadDraft(next.current);
            questionStarted = Date.now();
            view = 'quiz';
          } else if (next) showError('The quiz didn’t open. Try again in a moment.');
          paint();
        })
      );
    }
    return wrap;
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
    const clocks = el('span', 'qz-taking__clocks');
    const quizClock = el('span', 'qz-clock');
    const questionClock = el('span', 'qz-clock qz-clock--question');
    clocks.append(quizClock, questionClock);
    bar.append(clocks);
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
      onChange: (response) => {
        d.responses[id] = response;
        saveDraft();
        paintDotsState();
      }
    });
    wrap.append(player);

    // Hint: opened once, costs a share of the marks, and stays open.
    if (q.has_hint && !checked) {
      const hint = current.hints[id];
      if (hint) wrap.append(el('p', 'qz-hint', `Hint: ${hint}`));
      else {
        const cost = settings.hint_cost ?? 0.5;
        const label = cost === 0 ? 'Show hint' : cost >= 1 ? 'Show hint (you’ll lose this question’s marks)' : `Show hint (costs ${cost === 0.5 ? 'half' : `${Math.round(cost * 100)}%`} of the marks)`;
        wrap.append(
          button(label, 'ghost', async function () {
            this.disabled = true;
            leaveQuestion();
            await call('hint', { question_id: id });
            paint();
          })
        );
      }
    }

    if (settings.confidence && !checked) {
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
      wrap.append(row);
    }

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
    wrap.append(el('h3', 'qz-h', 'Ready to hand in?'));
    if (unanswered.length) {
      wrap.append(el('p', 'qz-note', `${plural(unanswered.length, 'question')} not answered yet:`));
      const list = el('div', 'qz-actions');
      for (const id of unanswered) {
        const i = d.order.indexOf(id);
        list.append(
          button(`Question ${i + 1}`, 'ghost', () => {
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
    actions.append(
      button('Back to the questions', 'ghost', () => {
        view = 'quiz';
        paint();
      }),
      button('Hand it in', 'primary', async function () {
        this.disabled = true;
        await submit(false);
      })
    );
    wrap.append(actions);
    return wrap;
  }

  async function submit(auto: boolean): Promise<void> {
    if (submitting || !status?.current) return;
    submitting = true;
    const n = status.current.n;
    const d = draft ?? loadDraft(status.current);
    const res = await call('submit', { responses: d.responses, confidence: d.confidence });
    submitting = false;
    if (res) {
      writeJSON(draftKey(n), null);
      draft = null;
      checking = {};
      resultIndex = res.results.length - 1;
      view = 'result';
      if (auto) showError('Time’s up. Your answers were handed in.');
    }
    paint();
  }

  function resultView(): HTMLElement {
    const s = status as Status;
    const r = s.results[resultIndex] ?? s.results[s.results.length - 1];
    const wrap = el('div', 'qz-result-view');
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
      if (r.same_version === false) wrap.append(el('p', 'qz-note', 'Your teacher has changed the quiz since, so some questions may look different now.'));
      const list = el('ol', 'qz-result-list');
      if (r.keys_shown === false) wrap.append(el('p', 'qz-note', 'Right answers show after your last go.'));
      (r.rows ?? []).forEach((row, i) => {
        const q = row.question;
        const li = el('li');
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
        else if (view === 'landing') {
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
  return root;
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
