import { apiPost } from '@/api/client';
import { button, el, errorText, isNotPublished } from '@/blocks/peer-feedback-ui';
import { openBoard } from './board';
import { LETTERS, formatSeconds, nextStep, percent, poller, secondsLeft, type HingeBlock } from './shared';
import { confirmBringBack, pastRounds } from '@/blocks/past-rounds';

type TeacherOption = { id: string; text: string; misconception: string };
/** The block's back-up question, for the focus view checkpoint preview. */
export type HingeBackupView = { prompt: string; options: Array<{ id: string; text: string }>; correct_id: string; source: 'teacher' | 'ann' };
export type TeacherState =
  | { phase: 'idle'; stale: boolean; ready: boolean; backup?: HingeBackupView | null }
  | {
      phase: 'live';
      session: string;
      round?: 'main' | 'backup';
      backup?: HingeBackupView | null;
      open: boolean;
      closes_at: string | null;
      revealed: boolean;
      prompt: string;
      options: TeacherOption[];
      correct_id: string;
      move_on: number;
      reteach: number;
      stale: boolean;
      answered: number;
      picks: Record<string, number>;
    };
type Live = Extract<TeacherState, { phase: 'live' }>;

/** Latest state per endpoint, so a re-rendered block paints at once. */
const lastState = new Map<string, TeacherState>();

/**
 * Every new state is announced on the block as a bubbling `hinge-state`
 * event, so the focus view can stop at a checkpoint and run the back-up
 * question through the same panel.
 */
export type HingeStateDetail = {
  blockId: string;
  endpoint: string;
  state: TeacherState;
  send: (action: string, extra?: Record<string, unknown>) => Promise<void>;
};

const STALE = 'You’ve changed this question since publishing. Students still see the published one, so publish again before you ask.';

/**
 * On the Display view the class can see the screen, so the panel shows what
 * the board shows: the answers and a big timer, then the spread and the right
 * answer only once the teacher reveals. Never the misconceptions or the next step.
 */
export function mountTeacher(block: HingeBlock, lessonId: string, promptEl?: HTMLElement, display = false): HTMLElement {
  const endpoint = `/api/lessons/${encodeURIComponent(lessonId)}/hinge/${encodeURIComponent(block.id)}`;
  const root = el('div', 'hq-run');
  const alert = el('p', 'pf-alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  const notice = el('p', 'pf-note hq-stale');
  notice.hidden = true;
  const body = el('div', 'hq-teacher');
  root.append(notice, alert, body);

  let state = lastState.get(endpoint) ?? null;
  let busy = false;
  let inflight: Promise<void> = Promise.resolve();
  let painted = '';
  let board: ReturnType<typeof openBoard> | null = null;
  const clock = el('span', display ? 'hq-clock hq-clock--display' : 'hq-clock');
  const ticker = window.setInterval(() => {
    if (!root.isConnected) return window.clearInterval(ticker);
    paintClock();
  }, 1000);

  const past = pastRounds(
    endpoint,
    (session, pressed) => {
      if (confirmBringBack(state?.phase === 'live')) return send('resume', pressed, { session }).catch(() => undefined);
    },
    (n) => `${n} ${n === 1 ? 'answer' : 'answers'}`
  );

  async function send(action: string, pressed?: HTMLButtonElement, extra: Record<string, unknown> = {}): Promise<void> {
    // A background poll gives way; a teacher's action waits its turn rather than being dropped.
    if (busy && action === 'status') return;
    const turn = inflight.then(() => run(action, pressed, extra));
    inflight = turn.catch(() => undefined);
    return turn;
  }

  /** A button press: the panel's alert already says what went wrong. */
  function act(action: string, pressed?: HTMLButtonElement, extra?: Record<string, unknown>): void {
    void send(action, pressed, extra).catch(() => undefined);
  }

  async function run(action: string, pressed: HTMLButtonElement | undefined, extra: Record<string, unknown>): Promise<void> {
    busy = true;
    const label = pressed?.textContent;
    if (pressed) {
      pressed.disabled = true;
      pressed.textContent = 'Working…';
    }
    try {
      state = await apiPost<TeacherState>(endpoint, { action, ...extra });
      lastState.set(endpoint, state);
      alert.hidden = true;
      paint();
      const detail: HingeStateDetail = { blockId: block.id, endpoint, state, send: (a, more) => send(a, undefined, more) };
      root.dispatchEvent(new CustomEvent('hinge-state', { bubbles: true, detail }));
    } catch (error) {
      if (!state && isNotPublished(error)) {
        body.replaceChildren(notLive());
        painted = 'not-live';
      } else if (action !== 'status' || !state) {
        alert.textContent = errorText(error);
        alert.hidden = false;
      }
      if (action !== 'status') throw error;
    } finally {
      busy = false;
      if (pressed?.isConnected) {
        pressed.disabled = false;
        pressed.textContent = label ?? '';
      }
    }
  }

  function notLive(): HTMLElement {
    const box = el('div', 'pf-panel pf-panel--quiet');
    box.append(
      el('p', 'pf-panel__title block-subtitle', 'Not live yet'),
      el('p', 'pf-panel__text block-body', 'Publish this lesson and block, then Ask the class appears here.')
    );
    return box;
  }

  function paintClock(): void {
    if (!state || state.phase !== 'live') return;
    const left = state.open ? secondsLeft(state.closes_at) : null;
    if (display) {
      clock.textContent = state.open ? (left === null ? 'Answers open' : `${formatSeconds(left)} left`) : 'Answers closed';
      clock.classList.toggle('is-ending', state.open && left !== null && left <= 10);
    } else {
      clock.textContent = state.open ? (left === null ? 'Open' : `Open · ${formatSeconds(left)} left`) : 'Answers closed';
    }
    // The timer ran out between polls: fetch the closed state now.
    if (state.open && left === 0 && !busy) void send('status');
  }

  /** The Display view's list: letters and answers, with the spread only after reveal. */
  function displayList(s: Live): HTMLElement {
    const list = el('ol', 'hq-spread');
    list.setAttribute('aria-label', s.revealed ? 'How the class answered' : 'The answers');
    s.options.forEach((o, i) => {
      const right = s.revealed && o.id === s.correct_id;
      const li = el('li', 'hq-spread__row');
      li.dataset.right = String(right);
      const head = el('div', 'hq-spread__head');
      head.append(el('span', 'hq-letter', LETTERS[i] ?? '?'), el('span', 'hq-spread__text', o.text));
      li.append(head);
      if (s.revealed) {
        const pct = percent(s.picks[o.id] ?? 0, s.answered);
        if (right) head.append(el('span', 'pf-chip pf-chip--done', 'Right'));
        head.append(el('span', 'hq-spread__count', `${pct}%`));
        const bar = el('span', 'hq-bar');
        bar.style.setProperty('--hq-pct', `${pct}%`);
        li.append(bar);
      }
      list.append(li);
    });
    return list;
  }

  function spread(s: Live): HTMLElement {
    const list = el('ol', 'hq-spread');
    list.setAttribute('aria-label', 'How the class answered');
    s.options.forEach((o, i) => {
      const n = s.picks[o.id] ?? 0;
      const pct = percent(n, s.answered);
      const right = o.id === s.correct_id;
      const li = el('li', 'hq-spread__row');
      li.dataset.right = String(right);
      const head = el('div', 'hq-spread__head');
      head.append(el('span', 'hq-letter', LETTERS[i] ?? '?'), el('span', 'hq-spread__text', o.text));
      if (right) head.append(el('span', 'pf-chip pf-chip--done', 'Right'));
      head.append(el('span', 'hq-spread__count', `${n} · ${pct}%`));
      const bar = el('span', 'hq-bar');
      bar.style.setProperty('--hq-pct', `${pct}%`);
      li.append(head, bar);
      if (!right && n > 0) {
        li.append(el('p', 'hq-spread__note', o.misconception.trim() ? `They may think ${lowerFirst(o.misconception.trim())}` : 'No misconception noted for this answer.'));
      }
      list.append(li);
    });
    return list;
  }

  function stepCard(s: Live): HTMLElement {
    const box = el('div', 'hq-step');
    if (!s.answered) {
      box.append(el('p', 'hq-step__text block-secondary', 'Your next step shows here once students answer.'));
      return box;
    }
    const rightPct = percent(s.picks[s.correct_id] ?? 0, s.answered);
    const step = nextStep(rightPct, s.move_on, s.reteach);
    box.dataset.step = step.kind;
    const why =
      step.kind === 'move_on'
        ? `${rightPct}% right, at or above your ${s.move_on}% mark.`
        : step.kind === 'reteach'
          ? `${rightPct}% right, below your ${s.reteach}% mark.`
          : `${rightPct}% right, between your marks. Take the students who missed it aside while the rest go on.`;
    box.append(el('p', 'hq-step__label', step.label), el('p', 'hq-step__text', why), el('p', 'hq-step__private block-secondary', 'Only you see this.'));
    return box;
  }

  function boardView(s: Live) {
    return {
      prompt: s.prompt,
      options: s.options.map(({ id, text }) => ({ id, text })),
      open: s.open,
      closes_at: s.closes_at,
      revealed: s.revealed,
      correct_id: s.correct_id,
      answered: s.answered,
      picks: s.picks
    };
  }

  function paintPrompt(): void {
    if (!promptEl) return;
    const backupRound = state?.phase === 'live' && state.round === 'backup';
    promptEl.textContent = backupRound && state?.phase === 'live' ? state.prompt : block.content.prompt.trim() || 'Choose one answer.';
    promptEl.closest('.hinge-question')?.classList.toggle('is-backup-round', backupRound);
  }

  function paint(): void {
    paintPrompt();
    if (!state) {
      body.replaceChildren(el('p', 'pf-note block-secondary', 'Loading…'));
      return;
    }
    notice.hidden = !state.stale;
    notice.textContent = STALE;
    if (state.phase === 'idle') {
      board?.close();
      if (painted === `idle:${state.ready}`) return;
      painted = `idle:${state.ready}`;
      const panel = el('div', 'pf-panel pf-panel--start');
      const ask = button('Ask the class', 'primary', function () {
        act('ask', this);
      });
      ask.disabled = !state.ready;
      panel.append(
        el('p', 'pf-panel__text block-body', state.ready
          ? 'Students answer on the lesson link. No accounts and no code. You see the spread; the class sees it only if you reveal.'
          : 'Finish the question and mark the right answer, then publish again.'),
        ask,
        past
      );
      body.replaceChildren(panel);
      return;
    }
    const s = state;
    board?.update(boardView(s));
    // On the Display view the picks stay off screen until reveal, so they needn't trigger a repaint.
    const sig = JSON.stringify([s.session, s.round, s.open, s.revealed, s.answered, display && !s.revealed ? null : s.picks, s.options, s.correct_id, s.move_on, s.reteach]);
    if (sig === painted) return paintClock();
    painted = sig;

    const bar = el('div', 'pf-bar hq-bar-row');
    const status = el('div', 'hq-status');
    status.append(clock, el('span', 'hq-answered', `${s.answered} answered`));
    const actions = el('div', 'hq-actions');
    if (s.open) actions.append(button('Close answers', 'secondary', function () {
      act('close', this);
    }));
    actions.append(
      button(s.revealed ? 'Hide the answer' : 'Reveal to the class', s.open ? 'ghost' : 'primary', function () {
        act(s.revealed ? 'hide' : 'reveal', this);
      })
    );
    if (!display) actions.append(
      button('Show on board', 'ghost', () => {
        if (board) return;
        board = openBoard(boardView(s), () => (board = null));
        // Paint the newest state, not the one this button was drawn with.
        if (state?.phase === 'live') board.update(boardView(state));
      })
    );
    bar.append(status, actions);

    const round = el('div', 'hq-round');
    round.append(
      button('Ask again', 'ghost', function () {
        if (confirm('Ask again? Answers clear and students answer afresh.')) act('ask', this, { round: s.round ?? 'main' });
      }),
      button('Finish', 'ghost', function () {
        act('finish', this);
      })
    );
    const hint = el('p', 'hq-private block-secondary', 'This screen shows the misconceptions and your next step. Projecting? Use Show on board.');
    const parts: HTMLElement[] = [];
    if (s.round === 'backup') {
      parts.push(el('p', 'pf-chip hq-round-tag', s.backup?.source === 'ann' ? 'Back-up question · drafted by Ann' : 'Back-up question'));
    }
    if (display) body.replaceChildren(...parts, bar, displayList(s), round, past);
    else body.replaceChildren(...parts, bar, spread(s), stepCard(s), hint, round, past);
    paintClock();
  }

  paint();
  poller(root, () => send('status'));
  return root;
}

function lowerFirst(text: string): string {
  return /^[A-Z][a-z]/.test(text) ? text[0]!.toLowerCase() + text.slice(1) : text;
}
