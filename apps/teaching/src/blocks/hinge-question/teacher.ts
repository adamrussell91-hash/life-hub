import { apiPost } from '@/api/client';
import { button, el, errorText, isNotPublished } from '@/blocks/peer-feedback-ui';
import { openBoard } from './board';
import { LETTERS, formatSeconds, nextStep, percent, poller, secondsLeft, type HingeBlock } from './shared';

type TeacherOption = { id: string; text: string; misconception: string };
type TeacherState =
  | { phase: 'idle'; stale: boolean; ready: boolean }
  | {
      phase: 'live';
      session: string;
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

const STALE = 'You’ve changed this question since publishing. Students still see the published one, so publish again before you ask.';

export function mountTeacher(block: HingeBlock, lessonId: string): HTMLElement {
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
  let painted = '';
  let board: ReturnType<typeof openBoard> | null = null;
  const clock = el('span', 'hq-clock');
  const ticker = window.setInterval(() => {
    if (!root.isConnected) return window.clearInterval(ticker);
    paintClock();
  }, 1000);

  async function send(action: string, pressed?: HTMLButtonElement): Promise<void> {
    if (busy) return;
    busy = true;
    const label = pressed?.textContent;
    if (pressed) {
      pressed.disabled = true;
      pressed.textContent = 'Working…';
    }
    try {
      state = await apiPost<TeacherState>(endpoint, { action });
      lastState.set(endpoint, state);
      alert.hidden = true;
      paint();
    } catch (error) {
      if (!state && isNotPublished(error)) {
        body.replaceChildren(notLive());
        painted = 'not-live';
      } else if (action !== 'status' || !state) {
        alert.textContent = errorText(error);
        alert.hidden = false;
      }
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
    clock.textContent = state.open ? (left === null ? 'Open' : `Open · ${formatSeconds(left)} left`) : 'Answers closed';
    // The timer ran out between polls: fetch the closed state now.
    if (state.open && left === 0 && !busy) void send('status');
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

  function paint(): void {
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
        void send('ask', this);
      });
      ask.disabled = !state.ready;
      panel.append(
        el('p', 'pf-panel__text block-body', state.ready
          ? 'Students answer on the lesson link. No accounts and no code. You see the spread; the class sees it only if you reveal.'
          : 'Finish the question and mark the right answer, then publish again.'),
        ask
      );
      body.replaceChildren(panel);
      return;
    }
    const s = state;
    board?.update(boardView(s));
    const sig = JSON.stringify([s.session, s.open, s.revealed, s.answered, s.picks, s.options, s.correct_id, s.move_on, s.reteach]);
    if (sig === painted) return paintClock();
    painted = sig;

    const bar = el('div', 'pf-bar hq-bar-row');
    const status = el('div', 'hq-status');
    status.append(clock, el('span', 'hq-answered', `${s.answered} answered`));
    const actions = el('div', 'hq-actions');
    if (s.open) actions.append(button('Close answers', 'secondary', function () {
      void send('close', this);
    }));
    actions.append(
      button(s.revealed ? 'Hide the answer' : 'Reveal to the class', s.open ? 'ghost' : 'primary', function () {
        void send(s.revealed ? 'hide' : 'reveal', this);
      }),
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
        if (confirm('Ask again? Answers clear and students answer afresh.')) void send('ask', this);
      }),
      button('Finish', 'ghost', function () {
        void send('finish', this);
      })
    );
    const hint = el('p', 'hq-private block-secondary', 'This screen shows the misconceptions and your next step. Projecting? Use Show on board.');
    body.replaceChildren(bar, spread(s), stepCard(s), hint, round);
    paintClock();
  }

  paint();
  poller(root, () => send('status'));
  return root;
}

function lowerFirst(text: string): string {
  return /^[A-Z][a-z]/.test(text) ? text[0]!.toLowerCase() + text.slice(1) : text;
}
