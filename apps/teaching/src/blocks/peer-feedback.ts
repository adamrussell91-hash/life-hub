import type { Block } from '@/schemas/block';
import { apiPost, ApiClientError } from '@/api/client';
import type { RenderMode, RenderContext } from '@/blocks/render';
import './peer-feedback.css';

/**
 * Peer feedback: students write a short answer, swap it anonymously, give
 * one strength and one suggestion, then read what came back.
 *
 * The teacher runs the round from the block on the lesson page. Students join
 * on their published lesson with just the code on the board; no accounts.
 * The server quietly gives each device a coloured symbol. Students never see
 * symbols unless the teacher turns on "Show student symbols", which puts each
 * student's own symbol in the corner of the block so the teacher can match a
 * symbol to a student. Drafts are kept on the device so a reload or a dropped
 * connection loses nothing. State lives on the server; this file paints it.
 */

type PeerBlock = Extract<Block, { block_type: 'peer_feedback' }>;
type Phase = 'idle' | 'write' | 'review' | 'results';
type Feedback = { strength: string; suggestion: string };

type Received = Feedback & { flagged: boolean; status: 'ok' | 'held' | 'released' | 'removed' };
type TeacherRow = {
  id: string;
  text: string;
  flagged: boolean;
  included: boolean;
  gave: boolean;
  reviewer: string | null;
  received: Received | null;
};
type TeacherState = { phase: Phase; session?: string; code?: string; show_symbols?: boolean; rows?: TeacherRow[] };
type StudentState = {
  phase: Phase;
  session?: string;
  joined?: boolean;
  symbol?: string | null;
  text?: string;
  submitted?: boolean;
  included?: boolean;
  reviewed?: boolean;
  assigned_text?: string;
  received?: Feedback | null;
};
/** What a device keeps: the round it joined and its secret token. Never its symbol. */
type Device = { session: string; token: string };

const POLL_MS = 5000;
const MAX_WRITING = 8000;
const MAX_FEEDBACK = 2000;

/* ── Identities: six colours by six shapes, drawn rather than typed ──── */

const COLOURS = [
  { name: 'Blue', fill: 'var(--wave)' },
  { name: 'Green', fill: 'var(--success)' },
  { name: 'Orange', fill: 'var(--high-sea-ink)' },
  { name: 'Gold', fill: 'var(--pastel-gold-ink)' },
  { name: 'Purple', fill: 'var(--pastel-lilac-ink)' },
  { name: 'Red', fill: 'var(--danger)' }
] as const;

const SHAPES = [
  { name: 'star', path: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z' },
  { name: 'circle', path: 'M12 5.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13z' },
  { name: 'square', path: 'M6.5 6.5h11v11h-11z' },
  { name: 'diamond', path: 'M12 4l8 8-8 8-8-8z' },
  { name: 'triangle', path: 'M12 5l8 14H4z' },
  { name: 'heart', path: 'M12 19.5s-7-4.3-7-9.2A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.3c0 4.9-7 9.2-7 9.2z' }
] as const;


function parts(id: string): [number, number] {
  const [c, s] = id.split('-').map(Number);
  return [c ?? 0, s ?? 0];
}

export function identityName(id: string): string {
  const [c, s] = parts(id);
  return `${COLOURS[c]?.name ?? ''} ${SHAPES[s]?.name ?? ''}`.trim();
}

function token(id: string, size: 'sm' | 'md' | 'lg' = 'md'): HTMLElement {
  const [c, s] = parts(id);
  const node = el('span', `pf-token pf-token--${size}`);
  node.style.setProperty('--pf-token', COLOURS[c]?.fill ?? 'var(--orca)');
  node.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${SHAPES[s]?.path ?? ''}"/></svg>`;
  return node;
}

/* ── Small DOM helpers ─────────────────────────────────────────────── */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(
  text: string,
  kind: 'primary' | 'secondary' | 'ghost',
  onClick: (this: HTMLButtonElement) => void
): HTMLButtonElement {
  const node = el('button', `btn btn--${kind}`, text);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

let fieldSeq = 0;
function field(label: string, hint?: string): { wrap: HTMLElement; input: HTMLTextAreaElement } {
  const id = `pf-field-${++fieldSeq}`;
  const wrap = el('div', 'pf-field');
  const lab = el('label', 'pf-field__label', label);
  lab.htmlFor = id;
  const input = el('textarea', 'pf-field__input');
  input.id = id;
  wrap.append(lab);
  if (hint) wrap.append(el('p', 'pf-field__hint', hint));
  wrap.append(input);
  return { wrap, input };
}

function readJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Returns false when the device won't store anything (private mode, full). */
function writeJSON(key: string, value: unknown): boolean {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function errorText(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.code === 'network_error') return 'Couldn’t reach the server. Check your connection and try again. Your writing is still here.';
    if (error.message) return error.message;
  }
  return 'Something went wrong. Try again.';
}

const STEPS: Array<{ phase: Exclude<Phase, 'idle'>; label: string }> = [
  { phase: 'write', label: 'Write' },
  { phase: 'review', label: 'Give feedback' },
  { phase: 'results', label: 'Read feedback' }
];

function stepper(phase: Phase): HTMLElement {
  const list = el('ol', 'pf-steps');
  list.setAttribute('aria-label', 'Activity steps');
  const at = STEPS.findIndex((s) => s.phase === phase);
  STEPS.forEach((step, i) => {
    const item = el('li', 'pf-steps__item');
    item.dataset.state = i < at ? 'done' : i === at ? 'now' : 'next';
    if (i === at) item.setAttribute('aria-current', 'step');
    item.append(el('span', 'pf-steps__dot', i < at ? '✓' : String(i + 1)), el('span', 'pf-steps__label', step.label));
    list.append(item);
  });
  return list;
}

/** Latest state per endpoint, so a re-rendered block paints at once instead of flashing empty. */
const lastState = new Map<string, unknown>();

/* ── Entry points ──────────────────────────────────────────────────── */

export function createPeerFeedbackEditor(block: PeerBlock, onChange: (b: PeerBlock) => void): HTMLElement {
  const root = el('div', 'peer-feedback peer-feedback--editor');
  let current = block;
  const fields = [
    { key: 'prompt', label: 'What should students write about?', hint: 'Keep it to a short answer: a paragraph or two.', max: 4000, rows: 3 },
    { key: 'strength_prompt', label: 'First feedback box', hint: 'Usually what works well.', max: 300, rows: 1 },
    { key: 'suggestion_prompt', label: 'Second feedback box', hint: 'Usually one thing to improve, or a question.', max: 300, rows: 1 }
  ] as const;
  for (const f of fields) {
    const { wrap, input } = field(f.label, f.hint);
    input.value = current.content[f.key];
    input.rows = f.rows;
    input.maxLength = f.max;
    input.addEventListener('input', () => {
      current = { ...current, content: { ...current.content, [f.key]: input.value } };
      onChange(current);
    });
    root.append(wrap);
  }
  root.append(
    el('p', 'pf-note', 'To run it, publish the lesson, close this editor and press Start activity on the block.')
  );
  return root;
}

export function renderPeerFeedback(block: PeerBlock, mode: RenderMode, ctx: RenderContext = {}): HTMLElement {
  const root = el('section', 'peer-feedback');
  root.dataset.blockId = block.id;
  const head = el('header', 'pf-head');
  head.append(el('p', 'pf-eyebrow', 'Peer feedback'));
  head.append(el('h3', 'pf-prompt', block.content.prompt.trim() || 'Write a short answer, swap it, and give each other feedback.'));
  root.append(head);

  if (mode === 'print') {
    const sheet = el('div', 'pf-print');
    for (const label of ['Your answer', block.content.strength_prompt, block.content.suggestion_prompt]) {
      sheet.append(el('p', 'pf-print__label', label), el('div', 'pf-print__lines'));
    }
    root.append(sheet);
    return root;
  }
  if (!ctx.lessonId) {
    root.append(el('p', 'pf-note', 'Students take part from the published lesson.'));
    return root;
  }
  if (mode === 'teacher') {
    root.append(mountTeacher(block, ctx.lessonId));
  } else {
    const corner = el('div', 'pf-corner');
    corner.hidden = true;
    head.append(corner);
    root.append(mountStudent(block, ctx.lessonId, corner));
  }
  return root;
}

/* ── Shared polling loop ───────────────────────────────────────────── */

function poller(root: HTMLElement, tick: () => Promise<void>): void {
  let timer: number | undefined;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(async () => {
      if (!root.isConnected) return document.removeEventListener('visibilitychange', onVisible);
      if (!document.hidden) await tick();
      schedule();
    }, POLL_MS);
  };
  const onVisible = () => {
    if (!root.isConnected) return document.removeEventListener('visibilitychange', onVisible);
    if (!document.hidden) void tick();
  };
  document.addEventListener('visibilitychange', onVisible);
  void tick().finally(schedule);
}

/* ── Teacher ───────────────────────────────────────────────────────── */

function mountTeacher(block: PeerBlock, lessonId: string): HTMLElement {
  const endpoint = `/api/lessons/${encodeURIComponent(lessonId)}/peer-feedback/${encodeURIComponent(block.id)}`;
  const root = el('div', 'pf-run');
  const alert = el('p', 'pf-alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  const body = el('div', 'pf-body');
  root.append(body, alert);

  let state = (lastState.get(endpoint) as TeacherState | undefined) ?? null;
  let painted = '';
  let busy = false;
  const excluded = new Set<string>();
  /** Flagged answers start out of the swap once; after that the tickbox is the teacher's. */
  const autoExcluded = new Set<string>();

  async function send(action: string, extra: Record<string, unknown> = {}, pressed?: HTMLButtonElement): Promise<void> {
    if (busy) return;
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
    } catch (error) {
      if (action !== 'status' || !state) {
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

  function freshRound(): void {
    excluded.clear();
    autoExcluded.clear();
  }

  function paint(): void {
    if (!state) {
      body.replaceChildren(el('p', 'pf-note', 'Loading…'));
      return;
    }
    if (state.phase === 'write') {
      for (const r of state.rows ?? []) {
        if (r.flagged && !autoExcluded.has(r.id)) {
          autoExcluded.add(r.id);
          excluded.add(r.id);
        }
      }
    }
    const signature = JSON.stringify([state, [...excluded]]);
    if (signature === painted) return;
    painted = signature;
    body.replaceChildren(state.phase === 'idle' ? idleView() : liveView(state));
  }

  function idleView(): HTMLElement {
    const box = el('div', 'pf-panel pf-panel--start');
    box.append(
      el('p', 'pf-panel__text', 'Students join on the lesson link with the code. No accounts, and they never pick or see a symbol.'),
      button('Start activity', 'primary', function () {
        freshRound();
        void send('start', {}, this);
      })
    );
    return box;
  }

  function liveView(s: TeacherState): HTMLElement {
    const rows = s.rows ?? [];
    const wrap = el('div', 'pf-live');

    const bar = el('div', 'pf-bar');
    const code = el('div', 'pf-code');
    code.append(el('span', 'pf-code__label', 'Code'), el('span', 'pf-code__value', formatCode(s.code ?? '')));
    const tools = el('div', 'pf-bar__tools');
    const symbols = el('label', 'pf-switch pf-switch--bar');
    const symbolsBox = el('input');
    symbolsBox.type = 'checkbox';
    symbolsBox.checked = !!s.show_symbols;
    symbolsBox.addEventListener('change', () => {
      void send('symbols', { show: symbolsBox.checked });
    });
    symbols.append(symbolsBox, el('span', '', 'Show student symbols'));
    symbols.title = 'Each student sees their own symbol in the corner of the block, so you can match a symbol to a student.';
    const showBig = button('Show on board', 'ghost', () => showCodeOverlay(s.code ?? ''));
    showBig.classList.add('pf-bar__board');
    tools.append(symbols, showBig);
    bar.append(code, stepper(s.phase), tools);
    wrap.append(bar);

    const handedIn = rows.filter((r) => r.text);
    const writing = rows.filter((r) => !r.text);
    const inSwap = handedIn.filter((r) => !excluded.has(r.id));
    const held = rows.filter((r) => r.received?.status === 'held').length;

    const next = el('div', 'pf-next');
    const summary = el('p', 'pf-next__text');
    let primary: HTMLButtonElement;
    if (s.phase === 'write') {
      summary.textContent = rows.length ? `${handedIn.length} of ${rows.length} handed in.` : 'Waiting for students to join.';
      if (inSwap.length < 2 && rows.length) summary.textContent += ' The swap needs at least two answers.';
      primary = button('Start the swap', 'primary', function () {
        void send('review', { exclude: [...excluded] }, this);
      });
      primary.disabled = inSwap.length < 2;
    } else if (s.phase === 'review') {
      const swapped = rows.filter((r) => r.included);
      const sent = swapped.filter((r) => r.gave).length;
      summary.textContent = `${sent} of ${swapped.length} have sent feedback.`;
      primary = button(sent < swapped.length ? 'Hand back what’s in' : 'Hand feedback back', 'primary', function () {
        void send('results', {}, this);
      });
    } else {
      summary.textContent = 'Feedback is back with the writers.';
      primary = button('Start a new activity', 'primary', function () {
        freshRound();
        void send('start', {}, this);
      });
    }
    if (held) summary.textContent += ` ${held} held for you to check.`;
    const end = button('End', 'ghost', function () {
      if (window.confirm('End this activity? Students will no longer see it.')) void send('end', {}, this);
    });
    const actions = el('div', 'pf-next__actions');
    actions.append(primary, end);
    next.append(summary, actions);
    wrap.append(next);

    if (writing.length && s.phase === 'write') {
      const still = el('div', 'pf-waiting');
      still.append(el('span', 'pf-waiting__label', 'Still writing'));
      const tokens = el('span', 'pf-waiting__tokens');
      for (const r of writing) {
        const t = token(r.id, 'sm');
        t.title = identityName(r.id);
        t.setAttribute('role', 'img');
        t.setAttribute('aria-label', identityName(r.id));
        tokens.append(t);
      }
      still.append(tokens);
      wrap.append(still);
    }

    if (handedIn.length) {
      const list = el('ul', 'pf-list');
      for (const r of handedIn) list.append(teacherRow(s.phase, r));
      wrap.append(list);
    }
    return wrap;
  }

  function teacherRow(phase: Phase, r: TeacherRow): HTMLElement {
    const item = el('li', 'pf-row');
    const out = phase === 'write' ? excluded.has(r.id) : !r.included;
    item.classList.toggle('pf-row--out', out);

    const head = el('div', 'pf-row__head');
    const who = el('span', 'pf-row__who');
    who.append(token(r.id, 'sm'), el('span', '', identityName(r.id)));
    if (r.flagged) who.append(el('span', 'pf-chip pf-chip--flag', 'Flagged words'));
    head.append(who);

    if (phase === 'write') {
      const toggle = el('label', 'pf-switch');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = !out;
      box.dataset.id = r.id;
      box.addEventListener('change', () => {
        if (box.checked) excluded.delete(r.id);
        else excluded.add(r.id);
        paint();
        body.querySelector<HTMLInputElement>(`input[data-id="${r.id}"]`)?.focus();
      });
      toggle.append(box, el('span', '', 'In the swap'));
      head.append(toggle);
    } else if (!r.included) {
      head.append(el('span', 'pf-chip', 'Left out'));
    } else if (phase === 'review') {
      head.append(el('span', `pf-chip ${r.gave ? 'pf-chip--done' : ''}`, r.gave ? 'Feedback sent' : 'Writing feedback'));
    }
    item.append(head, el('p', 'pf-row__text', r.text));

    // Feedback shows as it arrives, so anything held can be dealt with before hand-back.
    if (r.received) item.append(receivedView(r.received, r.reviewer));
    else if (phase === 'results' && r.included) item.append(el('p', 'pf-note', 'No feedback came back for this one.'));
    return item;
  }

  function receivedView(received: Received, reviewer: string | null): HTMLElement {
    if (received.status === 'removed') {
      const gone = el('p', 'pf-note');
      gone.append('Feedback from ', reviewerTag(reviewer), ' was removed. The writer won’t see it.');
      return gone;
    }
    const wrap = feedbackPair(block, received, reviewer);
    if (received.status === 'held' || received.status === 'released') {
      const bar = el('div', 'pf-held');
      bar.dataset.status = received.status;
      bar.append(
        el('span', 'pf-held__text', received.status === 'held' ? 'Held: flagged words. The writer can’t see this yet.' : 'Released after checking.')
      );
      const actions = el('div', 'pf-held__actions');
      if (received.status === 'held' && reviewer) {
        actions.append(
          button('Release', 'secondary', function () {
            void send('release', { reviewer }, this);
          })
        );
      }
      if (reviewer) {
        actions.append(
          button('Remove', 'ghost', function () {
            void send('remove', { reviewer }, this);
          })
        );
      }
      bar.append(actions);
      wrap.prepend(bar);
      wrap.classList.add('pf-feedback--held');
    }
    return wrap;
  }

  paint();
  poller(root, () => send('status'));
  return root;
}

function reviewerTag(id: string | null): HTMLElement {
  const tag = el('span', 'pf-tag');
  if (id) tag.append(token(id, 'sm'), ` ${identityName(id)}`);
  return tag;
}

function formatCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

function showCodeOverlay(code: string): void {
  const overlay = el('div', 'pf-board');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Activity code');
  const close = button('Close', 'secondary', () => dismiss());
  overlay.append(
    el('p', 'pf-board__label', 'Open the lesson and type this code'),
    el('p', 'pf-board__code', formatCode(code)),
    close
  );
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') dismiss();
  };
  function dismiss(): void {
    document.removeEventListener('keydown', onKey);
    overlay.remove();
  }
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) dismiss();
  });
  document.addEventListener('keydown', onKey);
  document.body.append(overlay);
  close.focus();
}

/** Two feedback cards. `from` is for the teacher only; students never see who wrote it. */
function feedbackPair(block: PeerBlock, feedback: Feedback, from?: string | null): HTMLElement {
  const wrap = el('div', 'pf-feedback');
  const a = el('div', 'pf-feedback__card pf-feedback__card--strength');
  a.append(el('p', 'pf-feedback__label', block.content.strength_prompt), el('p', 'pf-feedback__text', feedback.strength));
  const b = el('div', 'pf-feedback__card pf-feedback__card--suggestion');
  b.append(el('p', 'pf-feedback__label', block.content.suggestion_prompt), el('p', 'pf-feedback__text', feedback.suggestion));
  wrap.append(a, b);
  if (from) {
    const by = el('p', 'pf-feedback__from');
    by.append('From ', reviewerTag(from));
    wrap.append(by);
  }
  return wrap;
}

/* ── Student ───────────────────────────────────────────────────────── */

function mountStudent(block: PeerBlock, lessonId: string, corner: HTMLElement): HTMLElement {
  const endpoint = `/api/published/peer-feedback/${encodeURIComponent(lessonId)}/${encodeURIComponent(block.id)}`;
  const storage = `peer-feedback:${lessonId}:${block.id}`;
  const root = el('div', 'pf-run');
  const body = el('div', 'pf-body');
  const alert = el('p', 'pf-alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  root.append(body, alert);

  let device = readJSON<Device>(`${storage}:device`);
  let state = (lastState.get(endpoint) as StudentState | undefined) ?? null;
  let view = '';
  let busy = false;
  let joinCode = '';

  const draftKey = (name: string) => `${storage}:${state?.session ?? ''}:${name}`;

  function showError(text: string): void {
    alert.textContent = text;
    alert.hidden = false;
  }

  function forget(): void {
    device = null;
    writeJSON(`${storage}:device`, null);
  }

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
      if (device && next.session && next.session !== device.session) forget();
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

  function viewKey(s: StudentState): string {
    if (s.phase === 'idle') return 'idle';
    if (!device || !s.joined) return s.phase === 'write' ? 'join' : 'closed';
    return [s.phase, s.submitted, s.included, s.reviewed, !!s.received].join(':');
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

  function paint(): void {
    if (!state) {
      body.replaceChildren(el('p', 'pf-note', 'Loading…'));
      return;
    }
    paintCorner(state.symbol);
    const key = viewKey(state);
    if (key === view) return;
    view = key;
    const s = state;
    if (key === 'idle') {
      body.replaceChildren(waitPanel('Your teacher hasn’t started this yet.', 'This page updates by itself.'));
    } else if (key === 'join') {
      body.replaceChildren(joinView());
    } else if (key === 'closed') {
      body.replaceChildren(waitPanel('This activity has moved on, so joining has closed.', 'Ask your teacher what to do next.'));
    } else {
      const frame = el('div', 'pf-student');
      frame.append(stepper(s.phase), studentStage(s));
      body.replaceChildren(frame);
    }
  }

  function waitPanel(title: string, sub: string): HTMLElement {
    const box = el('div', 'pf-panel pf-panel--wait');
    box.append(el('p', 'pf-panel__title', title), el('p', 'pf-panel__text', sub));
    return box;
  }

  function joinView(): HTMLElement {
    const wrap = el('div', 'pf-join');
    const codeWrap = el('div', 'pf-field');
    const codeLabel = el('label', 'pf-field__label', 'Type the code on the board');
    codeLabel.htmlFor = `pf-code-${block.id}`;
    const code = el('input', 'pf-code-input');
    code.id = `pf-code-${block.id}`;
    code.inputMode = 'numeric';
    code.autocomplete = 'off';
    code.maxLength = 7;
    code.placeholder = '000 000';
    code.value = joinCode;
    codeWrap.append(codeLabel, code, el('p', 'pf-field__hint', 'No account and no name. Classmates won’t know which answer is yours.'));

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
      if (!state?.session) return;
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

  /** A draft-saving text box: every keystroke is kept on this device. */
  function draftField(label: string, name: string, max: number, rows: number, hint?: string): { wrap: HTMLElement; input: HTMLTextAreaElement } {
    const made = field(label, hint);
    made.input.rows = rows;
    made.input.maxLength = max;
    made.input.value = readJSON<string>(draftKey(name)) ?? '';
    made.input.addEventListener('input', () => {
      if (!writeJSON(draftKey(name), made.input.value)) showError('This browser isn’t saving drafts. Keep this page open until you send.');
    });
    return made;
  }

  function studentStage(s: StudentState): HTMLElement {
    const stage = el('div', 'pf-stage');

    if (s.phase === 'write' && !s.submitted) {
      const answer = draftField('Your answer', 'writing', MAX_WRITING, 7, 'You can’t change it after you hand it in.');
      const hand = button('Hand it in', 'primary', function () {
        if (!answer.input.value.trim()) {
          showError('Write something first.');
          answer.input.focus();
          return;
        }
        void send('submit', { text: answer.input.value }, this);
      });
      stage.append(answer.wrap, actionsRow(hand));
      return stage;
    }

    if (s.phase === 'write') {
      stage.append(waitPanel('Handed in.', 'When everyone’s done, your teacher will swap the answers.'));
      stage.append(ownAnswer(s.text ?? '', true));
      return stage;
    }

    if (s.phase === 'review') {
      if (!s.included) {
        stage.append(waitPanel('Your answer isn’t in this swap.', 'Your teacher will tell you what to do.'));
        return stage;
      }
      if (s.reviewed) {
        stage.append(waitPanel('Feedback sent.', 'Your teacher will hand everyone’s feedback back soon.'));
        return stage;
      }
      const pair = el('div', 'pf-review');
      const theirs = el('article', 'pf-paper');
      theirs.append(el('p', 'pf-paper__label', 'Someone’s answer'), el('p', 'pf-paper__text', s.assigned_text ?? ''));
      const form = el('div', 'pf-review__form');
      const strength = draftField(block.content.strength_prompt, 'strength', MAX_FEEDBACK, 3);
      const suggestion = draftField(block.content.suggestion_prompt, 'suggestion', MAX_FEEDBACK, 3);
      const sendBtn = button('Send feedback', 'primary', function () {
        if (!strength.input.value.trim() || !suggestion.input.value.trim()) {
          showError('Fill in both boxes before sending.');
          (strength.input.value.trim() ? suggestion : strength).input.focus();
          return;
        }
        void send('feedback', { strength: strength.input.value, suggestion: suggestion.input.value }, this);
      });
      form.append(strength.wrap, suggestion.wrap, actionsRow(sendBtn));
      pair.append(theirs, form);
      stage.append(pair);
      return stage;
    }

    // results
    if (s.received) {
      stage.append(el('h4', 'pf-stage__title', 'Feedback on your answer'), feedbackPair(block, s.received));
    } else {
      stage.append(
        waitPanel(
          s.included ? 'No feedback has come back yet.' : 'Your answer wasn’t in this swap.',
          s.included ? 'This page updates by itself. If nothing arrives, ask your teacher.' : 'Ask your teacher if you’d like someone to read it.'
        )
      );
    }
    if (s.text) stage.append(ownAnswer(s.text, false));
    return stage;
  }

  function ownAnswer(text: string, open: boolean): HTMLElement {
    const box = el('details', 'pf-own');
    box.open = open;
    box.append(el('summary', 'pf-own__summary', 'Your answer'), el('p', 'pf-own__text', text));
    return box;
  }

  function actionsRow(...buttons: HTMLButtonElement[]): HTMLElement {
    const row = el('div', 'pf-actions');
    row.append(...buttons);
    return row;
  }

  paint();
  // A poll only repaints when the student's step changes, so typing is never interrupted.
  poller(root, () => send('status').then(() => undefined));
  return root;
}
