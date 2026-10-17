import type { Block } from '@/schemas/block';
import { apiPost, ApiClientError } from '@/api/client';
import type { RenderMode, RenderContext } from '@/blocks/render';
import './peer-feedback.css';

/**
 * Peer feedback: students write a short answer, swap it anonymously, give
 * one strength and one suggestion, then read what came back.
 *
 * The teacher runs the round from the block on the lesson page. Students join
 * on their published lesson with the code on the board and a coloured symbol;
 * no accounts. A random token on the device proves which symbol is theirs, and
 * drafts are kept on the device so a reload or a dropped connection loses
 * nothing. State lives on the server; this file only paints it.
 */

type PeerBlock = Extract<Block, { block_type: 'peer_feedback' }>;
type Phase = 'idle' | 'write' | 'review' | 'results';
type Feedback = { strength: string; suggestion: string };

type TeacherRow = {
  id: string;
  text: string;
  included: boolean;
  gave: boolean;
  reviewer: string | null;
  received: Feedback | null;
};
type TeacherState = { phase: Phase; session?: string; code?: string; rows?: TeacherRow[] };
type StudentState = {
  phase: Phase;
  session?: string;
  taken?: string[];
  identity?: string;
  text?: string;
  submitted?: boolean;
  included?: boolean;
  reviewed?: boolean;
  assigned_text?: string;
  received?: Feedback | null;
};
type Identity = { session: string; identity: string; token: string };

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

const IDENTITIES = Array.from({ length: 36 }, (_, i) => `${i % 6}-${Math.floor(i / 6)}`);

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
  root.append(mode === 'teacher' ? mountTeacher(block, ctx.lessonId) : mountStudent(block, ctx.lessonId));
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

  function paint(): void {
    if (!state) {
      body.replaceChildren(el('p', 'pf-note', 'Loading…'));
      return;
    }
    const signature = JSON.stringify([state, [...excluded]]);
    if (signature === painted) return;
    painted = signature;
    body.replaceChildren(state.phase === 'idle' ? idleView() : liveView(state));
  }

  function idleView(): HTMLElement {
    const box = el('div', 'pf-panel pf-panel--start');
    box.append(
      el('p', 'pf-panel__text', 'Students join on the lesson link with a code and a coloured symbol. No accounts.'),
      button('Start activity', 'primary', function (this: HTMLButtonElement) {
        excluded.clear();
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
    const showBig = button('Show on board', 'ghost', () => showCodeOverlay(s.code ?? ''));
    showBig.classList.add('pf-bar__board');
    bar.append(code, stepper(s.phase), showBig);
    wrap.append(bar);

    const handedIn = rows.filter((r) => r.text);
    const writing = rows.filter((r) => !r.text);
    const inSwap = handedIn.filter((r) => !excluded.has(r.id));

    const next = el('div', 'pf-next');
    const summary = el('p', 'pf-next__text');
    let primary: HTMLButtonElement | null = null;
    if (s.phase === 'write') {
      summary.textContent = rows.length
        ? `${handedIn.length} of ${rows.length} handed in.`
        : 'Waiting for students to join.';
      primary = button('Start the swap', 'primary', function (this: HTMLButtonElement) {
        void send('review', { exclude: [...excluded] }, this);
      });
      primary.disabled = inSwap.length < 2;
      if (inSwap.length < 2 && rows.length) summary.textContent += ' The swap needs at least two answers.';
    } else if (s.phase === 'review') {
      const swapped = rows.filter((r) => r.included);
      const sent = swapped.filter((r) => r.gave).length;
      summary.textContent = `${sent} of ${swapped.length} have sent feedback.`;
      primary = button(sent < swapped.length ? 'Hand back what’s in' : 'Hand feedback back', 'primary', function (this: HTMLButtonElement) {
        void send('results', {}, this);
      });
    } else {
      summary.textContent = 'Feedback is back with the writers.';
      primary = button('Start a new activity', 'primary', function (this: HTMLButtonElement) {
        excluded.clear();
        void send('start', {}, this);
      });
    }
    const end = button('End', 'ghost', function (this: HTMLButtonElement) {
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

    if (phase === 'results' && r.included) {
      if (r.received) item.append(feedbackPair(block, r.received, r.reviewer));
      else item.append(el('p', 'pf-note', 'No feedback came back for this one.'));
    }
    return item;
  }

  paint();
  poller(root, () => send('status'));
  return root;
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

function feedbackPair(block: PeerBlock, feedback: Feedback, from?: string | null): HTMLElement {
  const wrap = el('div', 'pf-feedback');
  const a = el('div', 'pf-feedback__card pf-feedback__card--strength');
  a.append(el('p', 'pf-feedback__label', block.content.strength_prompt), el('p', 'pf-feedback__text', feedback.strength));
  const b = el('div', 'pf-feedback__card pf-feedback__card--suggestion');
  b.append(el('p', 'pf-feedback__label', block.content.suggestion_prompt), el('p', 'pf-feedback__text', feedback.suggestion));
  wrap.append(a, b);
  if (from) {
    const by = el('p', 'pf-feedback__from');
    by.append('From ', token(from, 'sm'), ` ${identityName(from)}`);
    wrap.append(by);
  }
  return wrap;
}

/* ── Student ───────────────────────────────────────────────────────── */

function mountStudent(block: PeerBlock, lessonId: string): HTMLElement {
  const endpoint = `/api/published/peer-feedback/${encodeURIComponent(lessonId)}/${encodeURIComponent(block.id)}`;
  const storage = `peer-feedback:${lessonId}:${block.id}`;
  const root = el('div', 'pf-run');
  const body = el('div', 'pf-body');
  const alert = el('p', 'pf-alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  root.append(body, alert);

  let identity = readJSON<Identity>(`${storage}:identity`);
  let state = (lastState.get(endpoint) as StudentState | undefined) ?? null;
  let view = '';
  let busy = false;
  let joinCode = '';
  let picked: string | null = null;
  /** Taken symbols live in the picker; it updates in place so a half-typed code survives. */
  let refreshPicker: (() => void) | null = null;

  const draftKey = (name: string) => `${storage}:${state?.session ?? ''}:${identity?.identity ?? ''}:${name}`;

  function showError(text: string): void {
    alert.textContent = text;
    alert.hidden = false;
  }

  function forget(): void {
    identity = null;
    writeJSON(`${storage}:identity`, null);
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
      const next = await apiPost<StudentState>(endpoint, { ...(identity ?? {}), action, ...extra });
      if (identity && next.session && next.session !== identity.session) forget();
      state = next;
      lastState.set(endpoint, state);
      alert.hidden = true;
      paint();
      return true;
    } catch (error) {
      const code = error instanceof ApiClientError ? error.code : '';
      if (code === 'new_session' || code === 'not_joined' || code === 'taken') {
        forget();
        picked = null;
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
    if (!identity || !s.identity) return s.phase === 'write' ? 'join' : 'closed';
    return [s.phase, s.identity, s.submitted, s.included, s.reviewed, !!s.received].join(':');
  }

  function paint(): void {
    if (!state) {
      body.replaceChildren(el('p', 'pf-note', 'Loading…'));
      return;
    }
    const key = viewKey(state);
    if (key === view) {
      refreshPicker?.();
      return;
    }
    view = key;
    refreshPicker = null;
    const s = state;
    if (key === 'idle') {
      body.replaceChildren(waitPanel('Your teacher hasn’t started this yet.', 'This page updates by itself.'));
    } else if (key === 'join') {
      body.replaceChildren(joinView());
    } else if (key === 'closed') {
      body.replaceChildren(waitPanel('This activity has moved on, so joining has closed.', 'Ask your teacher what to do next.'));
    } else {
      const frame = el('div', 'pf-student');
      const top = el('div', 'pf-student__top');
      top.append(youBar(s.identity!, s.phase), stepper(s.phase));
      frame.append(top, studentStage(s));
      body.replaceChildren(frame);
    }
  }

  function waitPanel(title: string, sub: string): HTMLElement {
    const box = el('div', 'pf-panel pf-panel--wait');
    box.append(el('p', 'pf-panel__title', title), el('p', 'pf-panel__text', sub));
    return box;
  }

  function youBar(id: string, phase: Phase): HTMLElement {
    const bar = el('div', 'pf-you');
    bar.append(token(id, 'md'));
    const words = el('div', 'pf-you__words');
    words.append(el('span', 'pf-you__name', `You’re ${identityName(id)}`));
    words.append(el('span', 'pf-you__sub', phase === 'review' ? 'The writer won’t see your symbol.' : 'Nobody else sees your symbol.'));
    bar.append(words);
    return bar;
  }

  function joinView(): HTMLElement {
    const wrap = el('div', 'pf-join');

    const codeWrap = el('div', 'pf-field');
    const codeLabel = el('label', 'pf-field__label', '1. Type the code on the board');
    codeLabel.htmlFor = `pf-code-${block.id}`;
    const code = el('input', 'pf-code-input');
    code.id = `pf-code-${block.id}`;
    code.inputMode = 'numeric';
    code.autocomplete = 'off';
    code.maxLength = 7;
    code.placeholder = '000 000';
    code.value = joinCode;
    code.addEventListener('input', () => {
      joinCode = code.value;
      update();
    });
    codeWrap.append(codeLabel, code);

    const pickWrap = el('div', 'pf-field');
    const pickLabel = el('p', 'pf-field__label', '2. Pick a symbol');
    pickLabel.id = `pf-pick-${block.id}`;
    const grid = el('div', 'pf-picker');
    grid.setAttribute('role', 'radiogroup');
    grid.setAttribute('aria-labelledby', pickLabel.id);
    const choices = new Map<string, HTMLButtonElement>();
    for (const id of IDENTITIES) {
      const choice = el('button', 'pf-pick');
      choice.type = 'button';
      choice.setAttribute('role', 'radio');
      choice.setAttribute('aria-label', identityName(id));
      choice.append(token(id, 'md'));
      choice.addEventListener('click', () => {
        picked = id;
        update();
      });
      choices.set(id, choice);
      grid.append(choice);
    }
    const pickedName = el('p', 'pf-picked');
    pickWrap.append(pickLabel, grid, pickedName);

    const join = button('Join', 'primary', function (this: HTMLButtonElement) {
      void doJoin(this);
    });
    join.classList.add('pf-join__go');

    function update(): void {
      const taken = new Set(state?.taken ?? []);
      if (picked && taken.has(picked)) picked = null;
      for (const [id, choice] of choices) {
        const isTaken = taken.has(id);
        choice.disabled = isTaken;
        choice.setAttribute('aria-checked', String(id === picked));
        choice.title = isTaken ? `${identityName(id)} (taken)` : identityName(id);
      }
      pickedName.textContent = picked ? `You’ll be ${identityName(picked)}.` : '';
      join.disabled = !picked || joinCode.replace(/\D/g, '').length !== 6;
    }
    refreshPicker = update;

    async function doJoin(pressed: HTMLButtonElement): Promise<void> {
      if (!picked || !state?.session) return;
      const tokenValue = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
      const candidate = { session: state.session, identity: picked, token: tokenValue };
      if (!writeJSON(`${storage}:identity`, candidate)) {
        showError('This browser won’t save anything, so you can’t join here. Try a normal (not private) window.');
        return;
      }
      identity = candidate;
      const ok = await send('join', { code: joinCode.replace(/\D/g, '') }, pressed);
      if (!ok && identity) forget();
    }

    update();
    wrap.append(codeWrap, pickWrap, join);
    return wrap;
  }

  /** A draft-saving text box: every keystroke is kept on this device. */
  function draftField(label: string, name: string, max: number, rows: number, hint?: string): HTMLTextAreaElement {
    const { wrap, input } = field(label, hint);
    input.rows = rows;
    input.maxLength = max;
    input.value = readJSON<string>(draftKey(name)) ?? '';
    input.addEventListener('input', () => {
      if (!writeJSON(draftKey(name), input.value)) showError('This browser isn’t saving drafts. Keep this page open until you send.');
    });
    pending.push(wrap);
    return input;
  }
  let pending: HTMLElement[] = [];

  function studentStage(s: StudentState): HTMLElement {
    const stage = el('div', 'pf-stage');
    pending = [];

    if (s.phase === 'write' && !s.submitted) {
      const input = draftField('Your answer', 'writing', MAX_WRITING, 7, 'You can’t change it after you hand it in.');
      const hand = button('Hand it in', 'primary', function (this: HTMLButtonElement) {
        if (!input.value.trim()) {
          showError('Write something first.');
          input.focus();
          return;
        }
        void send('submit', { text: input.value }, this);
      });
      stage.append(...pending, actionsRow(hand));
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
      const sendBtn = button('Send feedback', 'primary', function (this: HTMLButtonElement) {
        if (!strength.value.trim() || !suggestion.value.trim()) {
          showError('Fill in both boxes before sending.');
          (strength.value.trim() ? suggestion : strength).focus();
          return;
        }
        void send('feedback', { strength: strength.value, suggestion: suggestion.value }, this);
      });
      form.append(...pending, actionsRow(sendBtn));
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
          s.included ? 'No feedback came back this time.' : 'Your answer wasn’t in this swap.',
          'Ask your teacher if you’d like someone to read it.'
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
