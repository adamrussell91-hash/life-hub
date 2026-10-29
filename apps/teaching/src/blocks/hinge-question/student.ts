import { apiPost, ApiClientError } from '@/api/client';
import { el, errorText, readJSON, writeJSON } from '@/blocks/peer-feedback-ui';
import { LETTERS, formatSeconds, poller, secondsLeft, type HingeBlock } from './shared';

type StudentState =
  | { phase: 'idle' }
  | {
      phase: 'live';
      session: string;
      open: boolean;
      closes_at: string | null;
      revealed: boolean;
      mine: string | null;
      correct_id?: string;
      /** Set during a back-up round: that question is not in the published block. */
      question?: { prompt: string; options: Array<{ id: string; text: string }> };
    };
type Live = Extract<StudentState, { phase: 'live' }>;

const lastState = new Map<string, StudentState>();

/** A device's secret, kept per block. The server stores only its hash. */
function deviceToken(key: string): string | null {
  const saved = readJSON<string>(key);
  if (saved && /^[a-f0-9]{48}$/.test(saved)) return saved;
  const fresh = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
  return writeJSON(key, fresh) ? fresh : null;
}

export function mountStudent(block: HingeBlock, lessonId: string, promptEl?: HTMLElement): HTMLElement {
  const endpoint = `/api/published/hinge/${encodeURIComponent(lessonId)}/${encodeURIComponent(block.id)}`;
  const token = deviceToken(`hinge:${lessonId}:${block.id}:device`);
  const root = el('div', 'hq-run');
  const body = el('div', 'hq-student');
  const alert = el('p', 'pf-alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  root.append(body, alert);

  let state = lastState.get(endpoint) ?? null;
  let busy = false;
  let painted = '';
  // A countdown above the answers when the round has a time limit.
  const clock = el('div', 'hq-timer');
  clock.setAttribute('role', 'timer');
  clock.setAttribute('aria-live', 'off');
  const clockTime = el('span', 'hq-timer__time');
  const clockText = el('span', 'hq-timer__text block-secondary');
  clock.append(clockTime, clockText);
  const ticker = window.setInterval(() => {
    if (!root.isConnected) return window.clearInterval(ticker);
    paintClock();
  }, 1000);

  async function send(action: string, extra: Record<string, unknown> = {}): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      state = await apiPost<StudentState>(endpoint, { ...(token ? { token } : {}), action, ...extra });
      lastState.set(endpoint, state);
      alert.hidden = true;
      paint();
    } catch (error) {
      const code = error instanceof ApiClientError ? error.code : '';
      if (action !== 'status' || !state) {
        alert.textContent = errorText(error);
        alert.hidden = false;
      }
      if (code === 'closed' || code === 'new_session') {
        busy = false;
        await send('status');
      }
    } finally {
      busy = false;
    }
  }

  function paintClock(): void {
    if (!state || state.phase !== 'live' || !state.open) return;
    const left = secondsLeft(state.closes_at);
    clockTime.hidden = left === null;
    clockTime.textContent = left === null ? '' : formatSeconds(left);
    clockText.textContent = left === null ? 'You can change your answer until your teacher closes it.' : 'left to answer. You can change your answer until then.';
    clock.classList.toggle('is-ending', left !== null && left <= 10);
    if (left === 0 && !busy) void send('status');
  }

  function waitPanel(title: string, sub: string): HTMLElement {
    const box = el('div', 'pf-panel pf-panel--wait');
    box.append(el('p', 'pf-panel__title block-subtitle', title), el('p', 'pf-panel__text block-body', sub));
    return box;
  }

  function choices(s: Live): HTMLElement {
    const list = el('div', 'hq-choices');
    list.setAttribute('role', 'radiogroup');
    list.setAttribute('aria-label', 'Your answer');
    (s.question?.options ?? block.content.options).forEach((o, i) => {
      const chosen = s.mine === o.id;
      const shown = s.revealed && !!s.correct_id;
      const choice = el('button', 'hq-choice');
      choice.type = 'button';
      choice.setAttribute('role', 'radio');
      choice.setAttribute('aria-checked', String(chosen));
      choice.dataset.chosen = String(chosen);
      if (shown) choice.dataset.right = String(o.id === s.correct_id);
      choice.disabled = !s.open;
      choice.append(el('span', 'hq-letter', LETTERS[i] ?? '?'), el('span', 'hq-choice__text', o.text));
      if (chosen) choice.append(el('span', 'hq-choice__mine', 'Your answer'));
      choice.addEventListener('click', () => {
        if (!s.open || chosen) return;
        void send('answer', { session: s.session, pick: o.id });
      });
      list.append(choice);
    });
    return list;
  }

  function verdict(s: Live): HTMLElement | null {
    if (!s.revealed || !s.correct_id) {
      if (s.open) return null;
      return waitPanel('Answers are closed.', 'Your teacher will tell you what happens next.');
    }
    if (!s.mine) return waitPanel('This round has finished.', 'The right answer is marked above.');
    const right = s.mine === s.correct_id;
    const box = el('div', `hq-verdict hq-verdict--${right ? 'right' : 'wrong'}`);
    box.setAttribute('role', 'status');
    box.append(
      el('p', 'hq-verdict__title block-subtitle', right ? 'You got it.' : 'Not this time.'),
      el('p', 'block-body', right ? 'Your answer was right.' : 'The right answer is marked above. Your teacher will help you see why.')
    );
    return box;
  }

  function paint(): void {
    if (!state) {
      body.replaceChildren(el('p', 'pf-note block-secondary', 'Loading…'));
      return;
    }
    if (state.phase === 'idle') {
      if (promptEl) promptEl.textContent = block.content.prompt.trim() || 'Choose one answer.';
      if (painted !== 'idle') body.replaceChildren(waitPanel('Waiting for your teacher to ask.', 'This page updates by itself.'));
      painted = 'idle';
      return;
    }
    const s = state;
    const sig = JSON.stringify([s.session, s.open, s.revealed, s.mine, s.correct_id, s.question]);
    if (sig === painted) return paintClock();
    painted = sig;
    if (promptEl) promptEl.textContent = s.question?.prompt ?? (block.content.prompt.trim() || 'Choose one answer.');
    const parts: HTMLElement[] = [];
    if (s.open) parts.push(clock);
    parts.push(choices(s));
    if (!token) parts.push(el('p', 'pf-alert', 'Open a normal (not private) window to answer here.'));
    const v = verdict(s);
    if (v) parts.push(v);
    body.replaceChildren(...parts);
    paintClock();
  }

  paint();
  poller(root, () => send('status'));
  return root;
}
