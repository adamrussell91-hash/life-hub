import { apiPost, ApiClientError } from '@/api/client';
import { button, el, errorText, field, identityName, readJSON, token, writeJSON } from '@/blocks/peer-feedback-ui';
import { mountBoard, type BoardGroup, type Layout } from './board';
import { poller, type BrainstormBlock } from './shared';

type Status = 'pending' | 'shown' | 'removed';
type StudentState =
  | { phase: 'idle' }
  | {
      phase: 'live';
      session: string;
      open: boolean;
      joined?: boolean;
      symbol?: string | null;
      per_student?: number;
      max_length?: number;
      safety?: 'instant' | 'approve' | 'reveal';
      revealed?: boolean;
      mine?: Array<{ text: string; status: Status }>;
      board?: null | {
        revealed: boolean;
        layout: Layout;
        count: number;
        orbit?: Array<{ id: string; symbol: string | null }>;
        answers: Array<{ id: string; text: string }>;
        groups: BoardGroup[] | null;
      };
    };
type Live = Extract<StudentState, { phase: 'live' }>;
/** What a device keeps: the round it joined and its secret token. Never its symbol. */
type Device = { session: string; token: string };

const lastState = new Map<string, StudentState>();

function statusLabel(status: Status, s: Live): string {
  if (status === 'removed') return 'Not shown';
  if (status === 'pending') return 'Waiting for your teacher';
  return s.safety === 'reveal' && !s.revealed ? 'Sent' : 'On the board';
}

export function mountStudent(block: BrainstormBlock, lessonId: string, corner: HTMLElement): HTMLElement {
  const endpoint = `/api/published/brainstorm/${encodeURIComponent(lessonId)}/${encodeURIComponent(block.id)}`;
  const storage = `brainstorm:${lessonId}:${block.id}`;
  const root = el('div', 'bs-run');
  const body = el('div', 'bs-student');
  const alert = el('p', 'pf-alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  const board = mountBoard();
  board.root.classList.add('bs-board--student');
  root.append(body, alert, board.root);

  let device = readJSON<Device>(`${storage}:device`);
  let state = lastState.get(endpoint) ?? null;
  let view = '';
  let busy = false;
  let joinCode = '';
  let mineKey = '';
  let refocus = false;
  const mine = el('div', 'bs-mine-wrap');

  const draftKey = () => `${storage}:${state && state.phase === 'live' ? state.session : ''}:draft`;
  const showError = (text: string) => {
    alert.textContent = text;
    alert.hidden = false;
  };
  const forget = () => {
    device = null;
    writeJSON(`${storage}:device`, null);
  };

  async function send(action: string, extra: Record<string, unknown> = {}, pressed?: HTMLButtonElement): Promise<boolean> {
    if (busy) return false;
    busy = true;
    const label = pressed?.textContent;
    if (pressed) {
      pressed.disabled = true;
      pressed.textContent = 'Sending…';
    }
    try {
      const next = await apiPost<StudentState>(endpoint, { ...(device ?? {}), action, ...extra });
      if (device && next.phase === 'live' && next.session !== device.session) forget();
      state = next;
      lastState.set(endpoint, state);
      alert.hidden = true;
      paint();
      return true;
    } catch (error) {
      const code = error instanceof ApiClientError ? error.code : '';
      if (code === 'new_session' || code === 'not_joined') {
        forget();
        view = '';
        busy = false;
        await send('status');
      }
      if (action !== 'status') showError(errorText(error));
      return false;
    } finally {
      busy = false;
      if (pressed?.isConnected) {
        pressed.disabled = false;
        pressed.textContent = label ?? '';
      }
    }
  }

  function paintCorner(symbol: string | null | undefined): void {
    const key = symbol ?? '';
    if (corner.dataset.symbol === key) return;
    corner.dataset.symbol = key;
    corner.hidden = !symbol;
    corner.replaceChildren();
    if (symbol) {
      const t = token(symbol, 'sm');
      t.setAttribute('role', 'img');
      t.setAttribute('aria-label', `Your symbol: ${identityName(symbol)}`);
      corner.append(t);
    }
  }

  function waitPanel(title: string, sub: string): HTMLElement {
    const box = el('div', 'pf-panel pf-panel--wait');
    box.append(el('p', 'pf-panel__title block-subtitle', title), el('p', 'pf-panel__text block-body', sub));
    return box;
  }

  function joinView(): HTMLElement {
    const wrap = el('div', 'pf-join');
    const codeWrap = el('div', 'pf-field');
    const codeLabel = el('label', 'pf-field__label', 'Type the code on the board');
    codeLabel.htmlFor = `bs-code-${block.id}`;
    const code = el('input', 'pf-code-input');
    code.id = `bs-code-${block.id}`;
    code.inputMode = 'numeric';
    code.autocomplete = 'off';
    code.maxLength = 7;
    code.placeholder = '000 000';
    code.value = joinCode;
    codeWrap.append(codeLabel, code, el('p', 'pf-field__hint block-secondary', 'No account and no name. Classmates won’t know which answers are yours.'));
    const join = button('Join', 'primary', function () {
      void doJoin(this);
    });
    join.classList.add('pf-join__go');
    const ready = () => {
      join.disabled = joinCode.replace(/\D/g, '').length !== 6;
    };
    code.addEventListener('input', () => {
      joinCode = code.value;
      ready();
    });
    code.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !join.disabled) join.click();
    });
    ready();
    async function doJoin(pressed: HTMLButtonElement): Promise<void> {
      if (!state || state.phase !== 'live') return;
      const secret = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
      const candidate = { session: state.session, token: secret };
      if (!writeJSON(`${storage}:device`, candidate)) {
        showError('This browser won’t save anything, so you can’t join here. Try a normal (not private) window.');
        return;
      }
      device = candidate;
      const ok = await send('join', { code: joinCode }, pressed);
      if (!ok && device) forget();
    }
    wrap.append(codeWrap, join);
    return wrap;
  }

  function formView(s: Live): HTMLElement {
    const wrap = el('div', 'bs-answer');
    const sent = (s.mine ?? []).length;
    const cap = s.per_student ?? 3;
    const left = cap ? cap - sent : null;
    if (s.open && (left === null || left > 0)) {
      const { wrap: f, input } = field('Your answer', left === null ? 'Send as many as you like.' : `${left} of ${cap} left`);
      input.rows = 2;
      input.maxLength = s.max_length ?? 140;
      input.value = readJSON<string>(draftKey()) ?? '';
      input.addEventListener('input', () => void writeJSON(draftKey(), input.value));
      const go = button('Send', 'primary', function () {
        if (!input.value.trim()) {
          showError('Write something first.');
          input.focus();
          return;
        }
        // Clear the draft first: a successful send repaints this box from it.
        const text = input.value;
        const key = draftKey();
        writeJSON(key, null);
        refocus = true;
        void send('submit', { text }, this).then((ok) => {
          if (ok) return;
          refocus = false;
          writeJSON(key, text);
        });
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          go.click();
        }
      });
      const row = el('div', 'pf-actions block-actions');
      row.append(go);
      wrap.append(f, row);
      if (refocus) {
        refocus = false;
        queueMicrotask(() => input.isConnected && input.focus());
      }
    } else if (s.open) {
      wrap.append(waitPanel(`You’ve sent all ${cap} answers.`, 'Watch the board for what everyone said.'));
    } else {
      wrap.append(waitPanel('Answering has closed.', 'Watch the board for what everyone said.'));
    }
    return wrap;
  }

  function mineView(s: Live): HTMLElement {
    const list = el('ul', 'bs-mine');
    list.setAttribute('aria-label', 'Your answers');
    for (const m of s.mine ?? []) {
      const li = el('li', `bs-mine__item bs-mine__item--${m.status}`);
      li.append(el('span', 'bs-mine__text', m.text), el('span', 'bs-mine__status', statusLabel(m.status, s)));
      list.append(li);
    }
    return list;
  }

  function paint(): void {
    if (!state) {
      body.replaceChildren(el('p', 'pf-note block-secondary', 'Loading…'));
      board.root.hidden = true;
      return;
    }
    if (state.phase === 'idle') {
      paintCorner(null);
      board.root.hidden = true;
      if (view !== 'idle') body.replaceChildren(waitPanel('Your teacher hasn’t started this yet.', 'This page updates by itself.'));
      view = 'idle';
      return;
    }
    const s = state;
    paintCorner(s.symbol);
    const joined = !!device && !!s.joined;
    const key = !joined ? (s.open ? 'join' : 'closed') : JSON.stringify([s.open, (s.mine ?? []).length, s.per_student]);
    if (key !== view) {
      view = key;
      mineKey = '';
      if (key === 'join') body.replaceChildren(joinView());
      else if (key === 'closed') body.replaceChildren(waitPanel('This brainstorm has closed.', 'Ask your teacher what to do next.'));
      else body.replaceChildren(formView(s), mine);
    }
    const nextMine = joined ? JSON.stringify([s.mine, s.revealed]) : '';
    if (joined && nextMine !== mineKey) {
      mineKey = nextMine;
      mine.replaceChildren(...((s.mine ?? []).length ? [mineView(s)] : []));
    }
    board.root.hidden = !s.board;
    if (s.board) {
      board.update({
        question: block.content.question,
        revealed: s.board.revealed,
        layout: s.board.layout,
        answers: s.board.answers,
        count: s.board.count,
        orbit: s.board.orbit,
        symbolsOnCards: false,
        groups: s.board.groups
      });
    }
  }

  paint();
  poller(root, async () => {
    await send('status');
  });
  return root;
}
