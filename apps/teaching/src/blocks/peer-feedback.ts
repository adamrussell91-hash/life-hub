import type { Block } from '@/schemas/block';
import { apiPost, ApiClientError } from '@/api/client';
import { button, el, errorText, field, isNotPublished, notLivePanel, identityName, readJSON, token, writeJSON } from '@/blocks/peer-feedback-ui';
import { giveView, receivedView as annotatedView, teacherLayers, type Code, type Piece, type ReceivedLayer, type TeacherLayer } from '@/blocks/peer-annotate';
import { mountBankEditor } from '@/blocks/peer-annotate-bank';
import { createFormatField } from '@/blocks/formats/registry';
import { taskCard } from '@/blocks/peer-feedback-task';
import type { RenderMode, RenderContext } from '@/blocks/render';
import './peer-feedback.css';
import { confirmBringBack, pastRounds } from '@/blocks/past-rounds';

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
 *
 * In annotate mode (peer-annotate.ts) feedback is notes on the text instead of
 * two boxes, and each answer goes to two readers.
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
  /** Comments: sent or not. Annotate: how many pieces annotated, out of `to_give`. */
  gave: boolean | number;
  reviewer?: string | null;
  received?: Received | null;
  to_give?: number;
  layers?: TeacherLayer[];
};
type Mode = 'comments' | 'annotate';
type TeacherState = {
  phase: Phase;
  session?: string;
  code?: string;
  mode?: Mode;
  show_symbols?: boolean;
  codes?: Code[];
  rows?: TeacherRow[];
};
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
  mode?: Mode;
  codes?: Code[];
  pieces?: Piece[];
  layers?: ReceivedLayer[];
};
/** What a device keeps: the round it joined and its secret token. Never its symbol. */
type Device = { session: string; token: string };

const POLL_MS = 5000;
const MAX_WRITING = 8000;
const MAX_FEEDBACK = 2000;

export { identityName };

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


export function createPeerFeedbackEditor(
  block: PeerBlock,
  onChange: (b: PeerBlock) => void,
  getLatest?: () => PeerBlock
): HTMLElement {
  const root = el('div', 'peer-feedback peer-feedback--editor');
  let current = block;
  // Start from the latest block so a lens added beside these fields is kept.
  const update = (content: Partial<PeerBlock['content']>): void => {
    const latest = getLatest?.() ?? current;
    current = { ...latest, content: { ...latest.content, ...content } };
    onChange(current);
  };
  const fields = [
    { key: 'prompt', label: 'What should students write about?', hint: 'Keep it to a short answer: a paragraph or two.', max: 4000, rows: 3 },
    { key: 'strength_prompt', label: 'First feedback box', hint: 'Usually what works well.', max: 300, rows: 1 },
    { key: 'suggestion_prompt', label: 'Second feedback box', hint: 'Usually one thing to improve, or a question.', max: 300, rows: 1 }
  ] as const;
  const textField = (f: (typeof fields)[number]) => {
    const { wrap, input } = field(f.label, f.hint);
    input.value = current.content[f.key];
    input.rows = f.rows;
    input.maxLength = f.max;
    input.addEventListener('input', () => {
      update({ [f.key]: input.value });
    });
    return wrap;
  };

  // How students give feedback is this block's Format: the shared control.
  const modeWrap = createFormatField({
    block,
    onPick: (id) => {
      if ((current.content.mode ?? 'comments') === id) return;
      update({ mode: id as Mode });
      paintMode();
    }
  });
  const perMode = el('div', 'pf-run');

  function paintMode(): void {
    const mode = current.content.mode ?? 'comments';
    perMode.replaceChildren(...(mode === 'annotate' ? [mountBankEditor()] : [textField(fields[1]), textField(fields[2])]));
  }

  root.append(textField(fields[0]), ...(modeWrap ? [modeWrap] : []), perMode);
  paintMode();
  root.append(
    el('p', 'pf-note block-secondary', 'To run it, publish the lesson, close this editor and press Start activity on the block.')
  );
  return root;
}

export function renderPeerFeedback(block: PeerBlock, mode: RenderMode, ctx: RenderContext = {}): HTMLElement {
  const root = el('section', 'peer-feedback');
  root.dataset.blockId = block.id;
  const head = el('header', 'pf-head');
  head.append(el('h3', 'pf-eyebrow block-eyebrow', 'Peer feedback'));
  head.append(taskCard(block.content.prompt.trim() || 'Write a short answer, swap it, and give each other feedback.'));
  root.append(head);

  if (mode === 'print') {
    const sheet = el('div', 'pf-print');
    const labels =
      block.content.mode === 'annotate'
        ? ['Your answer', 'Notes on a classmate’s answer: underline a part, then write what you’d say about it']
        : ['Your answer', block.content.strength_prompt, block.content.suggestion_prompt];
    for (const label of labels) {
      sheet.append(el('p', 'pf-print__label', label), el('div', 'pf-print__lines'));
    }
    root.append(sheet);
    return root;
  }
  if (!ctx.lessonId) {
    root.append(el('p', 'pf-note block-secondary', 'Students take part from the published lesson.'));
    return root;
  }
  if (mode === 'teacher' && ctx.display) {
    // The class screen shows the task; answers and feedback stay on the teacher's own screen.
    root.append(el('p', 'pf-note block-secondary', 'Write your answer on your own device, then swap and give feedback.'));
  } else if (mode === 'teacher') {
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
  /** Annotate mode: one student's piece and every note they gave, or everyone. */
  let focus: string | null = null;
  const past = pastRounds(endpoint, (session, pressed) => {
    if (!confirmBringBack(!!state && state.phase !== 'idle')) return;
    freshRound();
    return send('resume', { session }, pressed);
  });

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
      if (!state && isNotPublished(error)) {
        alert.hidden = true;
        painted = '';
        body.replaceChildren(notLivePanel());
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

  function freshRound(): void {
    excluded.clear();
    autoExcluded.clear();
    focus = null;
  }

  function paint(): void {
    if (!state) {
      body.replaceChildren(el('p', 'pf-note block-secondary', 'Loading…'));
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
    const signature = JSON.stringify([state, [...excluded], focus]);
    if (signature === painted) return;
    painted = signature;
    body.replaceChildren(state.phase === 'idle' ? idleView() : liveView(state));
  }

  function idleView(): HTMLElement {
    const box = el('div', 'pf-panel pf-panel--start');
    box.append(
      el('p', 'pf-panel__text block-body', 'Students join on the lesson link with the code. No accounts, and they never pick or see a symbol.'),
      button('Start activity', 'primary', function () {
        freshRound();
        void send('start', {}, this);
      }),
      past
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

    const annotate = s.mode === 'annotate';
    const handedIn = rows.filter((r) => r.text);
    const writing = rows.filter((r) => !r.text);
    const inSwap = handedIn.filter((r) => !excluded.has(r.id));
    const held = annotate
      ? rows.reduce((n, r) => n + (r.layers ?? []).reduce((m, l) => m + l.notes.filter((x) => x.status === 'held').length, 0), 0)
      : rows.filter((r) => r.received?.status === 'held').length;

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
      const due = annotate ? swapped.reduce((n, r) => n + (r.to_give ?? 0), 0) : swapped.length;
      const sent = annotate ? swapped.reduce((n, r) => n + Number(r.gave), 0) : swapped.filter((r) => r.gave).length;
      summary.textContent = annotate ? `${sent} of ${due} pieces annotated.` : `${sent} of ${swapped.length} have sent feedback.`;
      primary = button(sent < due ? 'Hand back what’s in' : 'Hand feedback back', 'primary', function () {
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
    wrap.append(next, past);

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

    if (annotate && s.phase !== 'write' && handedIn.length > 1) wrap.append(focusChips(handedIn));
    const shown = focus ? handedIn.filter((r) => r.id === focus || r.layers?.some((l) => l.reviewer === focus)) : handedIn;
    if (shown.length) {
      const list = el('ul', 'pf-list');
      for (const r of shown) list.append(teacherRow(s, r));
      wrap.append(list);
    }
    return wrap;
  }

  /** Pick a student to see their piece and every note they gave elsewhere. */
  function focusChips(rows: TeacherRow[]): HTMLElement {
    const bar = el('div', 'pa-focus');
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Show one student');
    bar.append(el('span', 'pa-focus__label', 'Show:'));
    const chip = (id: string | null) => {
      const b = button(id ? identityName(id) : 'Everyone', 'ghost', () => {
        focus = focus === id ? null : id;
        paint();
      });
      b.className = 'pa-focus__chip';
      if (id) b.prepend(token(id, 'sm'));
      b.setAttribute('aria-pressed', String(focus === id));
      return b;
    };
    bar.append(chip(null), ...rows.map((r) => chip(r.id)));
    return bar;
  }

  function teacherRow(s: TeacherState, r: TeacherRow): HTMLElement {
    const phase = s.phase;
    const annotate = s.mode === 'annotate';
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
    } else if (phase === 'review' && annotate) {
      const done = Number(r.gave) >= (r.to_give ?? 0);
      head.append(el('span', `pf-chip ${done ? 'pf-chip--done' : ''}`, `Annotated ${Number(r.gave)} of ${r.to_give ?? 0}`));
    } else if (phase === 'review') {
      head.append(el('span', `pf-chip ${r.gave ? 'pf-chip--done' : ''}`, r.gave ? 'Feedback sent' : 'Writing feedback'));
    }

    if (annotate && phase !== 'write' && r.included) {
      item.append(
        head,
        teacherLayers({
          text: r.text,
          layers: r.layers ?? [],
          codes: s.codes ?? [],
          only: focus && focus !== r.id ? focus : null,
          who: (id) => reviewerTag(id),
          onRelease: (reviewer, note, pressed) => void send('release_note', { reviewer, writer: r.id, note }, pressed),
          onRemove: (reviewer, note, pressed) => void send('remove_note', { reviewer, writer: r.id, note }, pressed)
        })
      );
      return item;
    }
    item.append(head, el('p', 'pf-row__text', r.text));

    // Feedback shows as it arrives, so anything held can be dealt with before hand-back.
    if (r.received) item.append(receivedView(r.received, r.reviewer ?? null));
    else if (phase === 'results' && r.included) item.append(el('p', 'pf-note block-secondary', 'No feedback came back for this one.'));
    return item;
  }

  function receivedView(received: Received, reviewer: string | null): HTMLElement {
    if (received.status === 'removed') {
      const gone = el('p', 'pf-note block-secondary');
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
  a.append(el('p', 'pf-feedback__label block-eyebrow', block.content.strength_prompt), el('p', 'pf-feedback__text block-body', feedback.strength));
  const b = el('div', 'pf-feedback__card pf-feedback__card--suggestion');
  b.append(el('p', 'pf-feedback__label block-eyebrow', block.content.suggestion_prompt), el('p', 'pf-feedback__text block-body', feedback.suggestion));
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
    const annotate = [(s.pieces ?? []).map((p) => p.sent).join(','), JSON.stringify(s.layers ?? [])];
    return [s.phase, s.submitted, s.included, s.reviewed, !!s.received, ...annotate].join(':');
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
      body.replaceChildren(el('p', 'pf-note block-secondary', 'Loading…'));
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
    box.append(el('p', 'pf-panel__title block-subtitle', title), el('p', 'pf-panel__text block-body', sub));
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
    codeWrap.append(codeLabel, code, el('p', 'pf-field__hint block-secondary', 'No account and no name. Classmates won’t know which answer is yours.'));

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
      if (s.mode === 'annotate') {
        stage.append(
          giveView({
            pieces: s.pieces ?? [],
            codes: s.codes ?? [],
            draftKey: (piece) => draftKey(`notes-${piece}`),
            onSend: (piece, notes, pressed) => send('annotate', { piece, notes }, pressed),
            onError: showError
          })
        );
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
    if (s.mode === 'annotate' && s.layers?.length) {
      stage.append(el('h4', 'pf-stage__title block-subtitle', 'Feedback on your answer'), annotatedView(s.text ?? '', s.layers, s.codes ?? []));
      return stage;
    }
    if (s.mode === 'annotate') {
      stage.append(
        waitPanel(
          s.included ? 'No notes have come back yet.' : 'Your answer wasn’t in this swap.',
          s.included ? 'This page updates by itself. If nothing arrives, ask your teacher.' : 'Ask your teacher if you’d like someone to read it.'
        )
      );
    } else if (s.received) {
      stage.append(el('h4', 'pf-stage__title block-subtitle', 'Feedback on your answer'), feedbackPair(block, s.received));
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
    const box = el('details', 'pf-own block-disclosure');
    box.open = open;
    box.append(el('summary', 'pf-own__summary block-disclosure__toggle', 'Your answer'), el('p', 'pf-own__text block-disclosure__panel block-body', text));
    return box;
  }

  function actionsRow(...buttons: HTMLButtonElement[]): HTMLElement {
    const row = el('div', 'pf-actions block-actions');
    row.append(...buttons);
    return row;
  }

  paint();
  // A poll only repaints when the student's step changes, so typing is never interrupted.
  poller(root, () => send('status').then(() => undefined));
  return root;
}
