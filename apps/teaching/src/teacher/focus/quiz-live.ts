import { apiPost } from '@/api/client';
import { errorText } from '@/quiz/dom';
import { formatCode, renderLiveStage, type LiveQuiz } from '@/quiz/live-stage';
import type { QuizSubject } from './checkpoint';

/**
 * A quiz lesson's live round, run from the focus view. The quiz step shows the
 * join code, then each question as the class answers it. The forward arrow
 * moves the round on (first question, reveal, next question) before it moves
 * the board to the next step, and a question revealed under the teacher's
 * move-on mark stops at the checkpoint. Page view keeps the self-paced quiz.
 */

export interface QuizLiveHandle {
  root: HTMLElement;
  /** A forward press: true when the round used it. */
  forward(): boolean;
  /** A back press: true when the round used it. */
  back(): boolean;
  /** Poll only while this step is on the board. */
  activate(on: boolean): void;
  /** The question on the board, if it was revealed under the mark. */
  subject(): QuizSubject | null;
  dispose(): void;
}

const POLL_MS = 2500;
const LETTERS = 'ABCDEFGHIJ';
const DEFAULT_MOVE_ON = 80;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

type Choice = { id: string; text: string };

/** The answers a live question offers, when it has a list to pick from. */
function choicesOf(l: LiveQuiz): Choice[] | null {
  const q = l.question;
  if (!q) return null;
  if ('options' in q) return q.options;
  if (q.kind === 'find_it') return q.segments;
  if (q.kind === 'true_false') return [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }];
  return null;
}

function rightIds(l: LiveQuiz): Set<string> {
  const a = l.key?.answer;
  if (a?.type === 'choice') return new Set(a.ids);
  if (a?.type === 'boolean') return new Set([String(a.value)]);
  return new Set();
}

/** Revealed and auto-marked under the mark: the checkpoint's view of it. Written answers never stop. */
export function quizSubject(l: LiveQuiz | null, next: () => void): QuizSubject | null {
  if (!l || l.phase !== 'reveal' || !l.marked) return null;
  const pct = Math.round(((l.right ?? 0) / l.marked) * 100);
  const mark = l.move_on ?? DEFAULT_MOVE_ON;
  if (pct >= mark) return null;
  const choices = choicesOf(l);
  const right = rightIds(l);
  const picks = l.picks ?? {};
  const wrong = (choices ?? [])
    .map((c, i) => ({ ...c, letter: LETTERS[i] ?? '?', n: picks[c.id] ?? 0 }))
    .filter((c) => !right.has(c.id) && c.n > 0)
    .sort((a, b) => b.n - a.n)[0];
  const rightLetters = (choices ?? []).map((c, i) => (right.has(c.id) ? LETTERS[i] : '')).filter(Boolean).join(' and ');
  let sub = `${l.right ?? 0} of ${l.marked} got full marks, under your ${mark}% mark.`;
  if (wrong) sub += ` Most common wrong answer: ${wrong.letter}, “${wrong.text}” (${wrong.n}).`;
  const why = l.key?.explanation ? ` ${l.key.explanation}` : '';
  const talk = wrong
    ? `“A few of you went for ${wrong.letter}, and I can see why. Let’s look at why ${rightLetters || 'the answer'} fits better.”${why}`
    : `Ask the class what made this one tricky, then walk through the answer together.${why}`;
  return { key: `${l.session}:${l.index}`, pct, moveOnMark: mark, sub, talk, wrongLetter: wrong?.letter ?? null, next };
}

export function mountQuizLive(lessonId: string, onChange: () => void): QuizLiveHandle {
  const endpoint = `/api/lessons/${encodeURIComponent(lessonId)}/quiz`;
  const root = el('div', 'fv-quiz-live');
  const body = el('div', 'fv-quiz-live__body');
  const alert = el('p', 'qz-alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  root.append(alert, body);

  let live: LiveQuiz | null = null;
  let loaded = false;
  let active = false;
  let busy = false;
  let timer = 0;
  let painted = '';

  async function act(action: string): Promise<void> {
    if (busy && action === 'live_status') return;
    busy = true;
    try {
      live = (await apiPost<{ live: LiveQuiz | null }>(endpoint, { action })).live;
      if (live?.phase === 'done') live = null;
      loaded = true;
      alert.hidden = true;
    } catch (error) {
      alert.textContent = errorText(error);
      alert.hidden = false;
    } finally {
      busy = false;
    }
    paint();
    onChange();
  }

  function schedule(): void {
    window.clearTimeout(timer);
    if (!active) return;
    timer = window.setTimeout(async () => {
      if (!root.isConnected || !active) return;
      if (!document.hidden) await act('live_status');
      schedule();
    }, POLL_MS);
  }

  function hint(text: string): HTMLElement {
    return el('p', 'fv-quiz-live__hint', text);
  }

  function paint(): void {
    const sig = JSON.stringify([loaded, live]);
    if (sig === painted) return;
    painted = sig;
    if (!loaded) {
      body.replaceChildren(el('p', 'qz-note block-secondary', 'Loading the live quiz…'));
      return;
    }
    if (!live) {
      const start = el('button', 'btn btn--primary', 'Start live quiz');
      start.type = 'button';
      start.addEventListener('click', () => void act('live_start'));
      body.replaceChildren(
        el('p', 'fv-quiz-live__title', 'Live quiz'),
        el('p', 'qz-note block-secondary', 'Run the quiz from the board, one question at a time. Students join on the quiz page with a code. You see how the class went, not who.'),
        start
      );
      return;
    }
    const end = el('button', 'btn btn--ghost', 'End live quiz');
    end.type = 'button';
    end.addEventListener('click', () => {
      if (window.confirm('End the live quiz?')) void act('live_end');
    });
    if (live.phase === 'lobby') {
      body.replaceChildren(
        el('p', 'fv-quiz-live__label', 'Open the quiz and type this code'),
        el('p', 'fv-quiz-live__code', formatCode(live.code)),
        el('p', 'fv-quiz-live__label', `${live.joined} joined`),
        hint('Press → for the first question.'),
        end
      );
      return;
    }
    const last = live.index + 1 >= live.total;
    body.replaceChildren(
      renderLiveStage(live, false),
      hint(live.phase === 'question' ? 'Press → to reveal the answer.' : last ? 'Press → to finish the quiz.' : 'Press → for the next question.'),
      end
    );
  }

  paint();

  return {
    root,
    forward() {
      if (!live) return false;
      void act(live.phase === 'question' ? 'live_reveal' : 'live_next');
      return true;
    },
    back() {
      if (!live || live.index <= 0 || live.phase === 'lobby') return false;
      void act('live_back');
      return true;
    },
    activate(on) {
      if (active === on) return;
      active = on;
      if (on) void act('live_status').then(schedule);
      else window.clearTimeout(timer);
    },
    subject: () => quizSubject(live, () => void act('live_next')),
    dispose() {
      active = false;
      window.clearTimeout(timer);
    }
  };
}
