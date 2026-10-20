import { ApiClientError, apiGet, apiPost } from '@/api/client';
import type { Quadrant } from '@/schemas/toolkit';
import { identityName, token } from '@/blocks/peer-feedback-ui';
import { pulseDeviceId } from '@/student/block-pulse';
import { askConfirmCard } from '@/teacher/confirm-dialog';
import { QUADRANT_LABEL } from './content';
import '@/blocks/peer-feedback.css';

/**
 * Question Quadrant, live. Points on the map run 0–1 on both axes: x from
 * closed to open, y from textual (top) to intellectual (bottom).
 *
 * Students write a question and place it themselves. The app's own guess is
 * shown to the teacher only, as a faint marker, so a disagreement becomes
 * something to talk through. The teacher can move any dot, switch to columns,
 * and choose questions to explore; chosen questions show to the class.
 */

export type Pt = { x: number; y: number };

export type ClassQuestion = { id: string; text: string; symbol: string; student: Pt; ai?: Pt; teacher?: Pt };
export type ClassBoard = { open: boolean; questions: ClassQuestion[]; chosen: string[] };
type StudentState = {
  open: boolean;
  symbol: string | null;
  per_student: number;
  mine: Array<{ id: string; text: string; student: Pt }>;
  chosen: Array<{ id: string; text: string }>;
};

export const QUESTION_MAX = 200;
const COLUMN_ORDER: Quadrant[] = ['comprehension', 'speculation', 'research', 'inquiry'];
const STUDENT_POLL_MS = 10_000;
const TEACHER_POLL_MS = 5_000;
const CENTRE: Pt = { x: 0.5, y: 0.5 };

/* ── Geometry ──────────────────────────────────────────────────────── */

export function quadrantAt(p: Pt): Quadrant {
  if (p.y < 0.5) return p.x < 0.5 ? 'comprehension' : 'speculation';
  return p.x < 0.5 ? 'research' : 'inquiry';
}

/** "Inquiry, only just open": where a point sits, in words a student can use. */
export function describePoint(p: Pt): string {
  const lean = (d: number, low: string, high: string) => {
    const side = d < 0.5 ? low : high;
    const far = Math.abs(d - 0.5);
    return far < 0.1 ? `only just ${side}` : far < 0.3 ? side : `very ${side}`;
  };
  return `${QUADRANT_LABEL[quadrantAt(p)]}: ${lean(p.x, 'closed', 'open')}, ${lean(p.y, 'textual', 'intellectual')}`;
}

export const placed = (q: ClassQuestion): Pt => q.teacher ?? q.student;

/** The app disagrees when it puts the question in another quadrant. */
export function disagrees(q: ClassQuestion): boolean {
  return !!q.ai && quadrantAt(q.ai) !== quadrantAt(placed(q));
}

/**
 * Where the teacher's own questions sit: their quadrant, fanned out so they
 * do not stack. Authored questions only carry a quadrant, not a point.
 */
export function authoredPoint(quadrant: Quadrant, nth: number): Pt {
  const cx = quadrant === 'comprehension' || quadrant === 'research' ? 0.25 : 0.75;
  const cy = quadrant === 'comprehension' || quadrant === 'speculation' ? 0.25 : 0.75;
  const angle = nth * 2.4;
  const r = nth === 0 ? 0 : 0.08 + 0.03 * Math.floor(nth / 4);
  return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r * 0.8 };
}

/* ── DOM ───────────────────────────────────────────────────────────── */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function btn(text: string, className: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', className, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

function errorMessage(error: unknown): string {
  return error instanceof ApiClientError ? error.message : 'That did not send. Check your connection and try again.';
}

/** Polls while the node is on the page and the tab is visible. */
function poll(node: HTMLElement, ms: number, tick: () => void): void {
  const timer = window.setInterval(() => {
    if (!node.isConnected) { window.clearInterval(timer); return; }
    if (document.visibilityState === 'visible') tick();
  }, ms);
}

/** The layer that sits over the four tiles. Dots inside it are placed in %. */
export function mapLayer(grid: HTMLElement, className = ''): HTMLElement {
  grid.classList.add('tk-quadrant__grid--plotted');
  const layer = el('div', `tk-quadrant__layer ${className}`.trim());
  grid.append(layer);
  return layer;
}

export function setAt(node: HTMLElement, p: Pt): void {
  node.style.left = `${p.x * 100}%`;
  node.style.top = `${p.y * 100}%`;
}

function pointFromEvent(layer: HTMLElement, event: PointerEvent): Pt {
  const r = layer.getBoundingClientRect();
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  return { x: clamp((event.clientX - r.left) / r.width), y: clamp((event.clientY - r.top) / r.height) };
}

/**
 * Drag with a pointer, or nudge with the arrow keys. A press that barely
 * moves counts as a click.
 */
function draggable(dot: HTMLElement, layer: HTMLElement, start: () => Pt, handlers: {
  onMove?: (p: Pt) => void;
  onDrop: (p: Pt) => void;
  onClick?: () => void;
}): void {
  let origin: { x: number; y: number } | null = null;
  let moved = false;
  let at = start();
  dot.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    dot.setPointerCapture(event.pointerId);
    origin = { x: event.clientX, y: event.clientY };
    moved = false;
    at = start();
  });
  dot.addEventListener('pointermove', (event) => {
    if (!origin) return;
    if (!moved && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) < 5) return;
    moved = true;
    at = pointFromEvent(layer, event);
    setAt(dot, at);
    handlers.onMove?.(at);
  });
  const end = () => {
    if (!origin) return;
    origin = null;
    if (moved) handlers.onDrop(at);
    else handlers.onClick?.();
  };
  dot.addEventListener('pointerup', end);
  dot.addEventListener('pointercancel', end);
  dot.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 0.1 : 0.03;
    const delta: Record<string, Pt> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } };
    const d = delta[event.key];
    if (d) {
      event.preventDefault();
      const p = start();
      at = { x: Math.min(1, Math.max(0, p.x + d.x)), y: Math.min(1, Math.max(0, p.y + d.y)) };
      setAt(dot, at);
      handlers.onMove?.(at);
      handlers.onDrop(at);
    } else if ((event.key === 'Enter' || event.key === ' ') && handlers.onClick) {
      event.preventDefault();
      handlers.onClick();
    }
  });
}

function symbolDot(symbol: string, className: string, label: string): HTMLButtonElement {
  const dot = el('button', `tk-qdot ${className}`);
  dot.type = 'button';
  dot.setAttribute('aria-label', label);
  dot.append(token(symbol, 'sm'));
  return dot;
}

/** A teacher-written question on the map: its number from the list. */
export function numberMarker(n: number, p: Pt, text: string): HTMLElement {
  const marker = el('span', 'tk-qdot tk-qdot--authored', String(n));
  marker.title = text;
  marker.setAttribute('aria-label', `Question ${n}: ${text}`);
  setAt(marker, p);
  return marker;
}

function chosenPanel(items: Array<{ id: string; text: string }>, onRemove?: (id: string) => void): HTMLElement {
  const panel = el('section', 'tk-chosen');
  panel.hidden = items.length === 0;
  panel.append(el('p', 'tk-chosen__label block-eyebrow', items.length > 1 ? 'Chosen questions' : 'Chosen question'));
  const list = el('ul', 'tk-chosen__list');
  for (const item of items) {
    const li = el('li', 'tk-chosen__item');
    li.append(el('span', 'tk-chosen__text block-body', item.text));
    if (onRemove) {
      const remove = btn('Remove', 'btn btn--ghost tk-chosen__remove', () => onRemove(item.id));
      remove.setAttribute('aria-label', `Remove “${item.text}” from chosen`);
      li.append(remove);
    }
    list.append(li);
  }
  panel.append(list);
  return panel;
}

/* ── Student ───────────────────────────────────────────────────────── */

export function mountStudentQuestions(host: HTMLElement, layer: HTMLElement, options: { lessonId: string; blockId: string }): void {
  const url = `/api/published/quadrant/${encodeURIComponent(options.lessonId)}`;
  const base = { block_id: options.blockId, device_id: pulseDeviceId() };
  let state: StudentState | null = null;
  let draftAt: Pt | null = null;
  let sending = false;

  const form = el('section', 'tk-ask');
  const chosenSlot = el('div');
  host.append(form, chosenSlot);

  const draft = el('button', 'tk-qdot tk-qdot--draft');
  draft.type = 'button';
  draft.setAttribute('aria-label', 'Your question. Drag it, or use the arrow keys, to place it.');
  draft.hidden = true;
  // Shown on the grid itself while a written question is still waiting for a spot.
  const prompt = el('p', 'tk-quadrant__prompt block-body', 'Tap where your question belongs');
  prompt.hidden = true;
  layer.append(prompt, draft);

  const text = el('textarea', 'tk-ask__text');
  text.maxLength = QUESTION_MAX;
  text.rows = 2;
  text.placeholder = 'Write one question about the stimulus';
  const readout = el('p', 'tk-ask__where block-eyebrow');
  readout.setAttribute('aria-live', 'polite');
  const error = el('p', 'tk-ask__error');
  error.setAttribute('role', 'alert');
  const send = btn('Send my question', 'btn btn--primary', () => void submit());

  function paintReadout(): void {
    readout.textContent = draftAt
      ? `You placed it in ${describePoint(draftAt)}.`
      : 'Then tap the quadrant above where you think it belongs, or move the dot with the arrow keys.';
  }

  /** Once there is a question to place, put an unplaced dot in the middle of the map to show where it goes. */
  function syncDraft(): void {
    const waiting = !draftAt && !!text.value.trim() && !!state?.open && !layer.classList.contains('is-full');
    draft.hidden = !draftAt && !waiting;
    draft.classList.toggle('is-pending', waiting);
    prompt.hidden = !waiting;
    if (waiting) setAt(draft, CENTRE);
  }

  const placeDraft = (p: Pt) => {
    draftAt = p;
    setAt(draft, p);
    syncDraft();
    paintReadout();
  };
  draggable(draft, layer, () => draftAt ?? CENTRE, { onMove: placeDraft, onDrop: placeDraft });
  layer.addEventListener('pointerdown', (event) => {
    if (event.target !== layer || !state?.open || layer.classList.contains('is-full')) return;
    placeDraft(pointFromEvent(layer, event));
  });
  text.addEventListener('input', () => { error.textContent = ''; syncDraft(); });

  function showMap(): void {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    (layer.parentElement ?? layer).scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'center' });
    draft.focus({ preventScroll: true });
    draft.classList.remove('is-nudged');
    void draft.offsetWidth;
    draft.classList.add('is-nudged');
  }

  async function submit(): Promise<void> {
    if (sending) return;
    if (!text.value.trim()) { error.textContent = 'Write your question first.'; text.focus(); return; }
    if (!draftAt) { error.textContent = 'Place your question on the quadrant first.'; showMap(); return; }
    sending = true;
    send.disabled = true;
    try {
      state = await apiPost<StudentState>(url, { ...base, action: 'send', text: text.value.trim(), student: draftAt });
      text.value = '';
      draftAt = null;
      error.textContent = '';
      paint();
    } catch (e) {
      error.textContent = errorMessage(e);
    } finally {
      sending = false;
      send.disabled = false;
    }
  }

  function paint(): void {
    if (!state) return;
    layer.querySelectorAll('.tk-qdot--mine').forEach((n) => n.remove());
    for (const mine of state.mine) {
      const dot = symbolDot(state.symbol ?? '0-0', 'tk-qdot--mine', `Your question: ${mine.text}`);
      dot.tabIndex = -1;
      dot.title = mine.text;
      setAt(dot, mine.student);
      layer.append(dot);
    }
    const full = state.mine.length >= state.per_student;
    layer.classList.toggle('is-full', full || !state.open);

    form.replaceChildren(el('p', 'tk-subhead block-subtitle', 'Your questions'));
    if (state.mine.length) {
      const list = el('ul', 'tk-ask__mine');
      for (const mine of state.mine) {
        const li = el('li');
        li.append(token(state.symbol ?? '0-0', 'sm'), el('span', undefined, mine.text), el('small', undefined, QUADRANT_LABEL[quadrantAt(mine.student)]));
        list.append(li);
      }
      form.append(list);
    }
    if (!state.open) {
      form.append(el('p', 'tk-ask__note block-secondary', 'Your teacher has closed questions for now.'));
    } else if (full) {
      form.append(el('p', 'tk-ask__note block-secondary', `You have sent ${state.per_student} questions. Look for yours on the board.`));
    } else {
      paintReadout();
      form.append(
        el('p', 'tk-ask__note block-secondary', `Write a question, then place it. You can send ${state.per_student - state.mine.length} more.`),
        text,
        readout,
        error,
        send
      );
    }
    chosenSlot.replaceChildren(chosenPanel(state.chosen));
    syncDraft();
  }

  const refresh = () => apiPost<StudentState>(url, { ...base, action: 'status' }).then((s) => {
    const before = JSON.stringify(state);
    state = s;
    if (JSON.stringify(state) !== before) {
      const typing = document.activeElement === text;
      const keep = text.value;
      paint();
      text.value = keep;
      if (typing) text.focus();
    }
  }).catch(() => undefined);
  form.append(el('p', 'tk-ask__note block-secondary', 'Loading…'));
  void refresh();
  poll(host, STUDENT_POLL_MS, () => void refresh());
}

/* ── Teacher ───────────────────────────────────────────────────────── */

export function mountClassQuestions(host: HTMLElement, layer: HTMLElement, mapView: HTMLElement, options: { lessonId: string; blockId: string }): void {
  const url = `/api/lessons/${encodeURIComponent(options.lessonId)}/quadrant`;
  let board: ClassBoard = { open: true, questions: [], chosen: [] };
  let view: 'map' | 'columns' = 'map';
  let showApp = true;
  let selected: string | null = null;
  let dragging = false;

  const bar = el('div', 'tk-class__bar');
  const columns = el('div', 'tk-class__columns');
  columns.hidden = true;
  const detail = el('div', 'tk-class__detail');
  const chosenSlot = el('div');
  host.append(bar, detail, columns, chosenSlot);
  const lines = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  lines.setAttribute('class', 'tk-quadrant__lines');
  lines.setAttribute('viewBox', '0 0 100 100');
  lines.setAttribute('preserveAspectRatio', 'none');
  lines.setAttribute('aria-hidden', 'true');
  layer.prepend(lines);

  const act = (body: Record<string, unknown>) =>
    apiPost<ClassBoard>(url, { block_id: options.blockId, ...body }).then((b) => { board = b; paint(); }).catch(() => undefined);
  const refresh = () => {
    if (dragging) return;
    void apiGet<ClassBoard>(`${url}?block_id=${encodeURIComponent(options.blockId)}`).then((b) => {
      if (dragging || JSON.stringify(b) === JSON.stringify(board)) return;
      board = b;
      paint();
    }).catch(() => undefined);
  };

  const byId = (id: string | null) => board.questions.find((q) => q.id === id) ?? null;
  const select = (id: string | null) => { selected = id; paint(); };

  function paintBar(): void {
    const toggle = (label: string, value: typeof view) => {
      const b = btn(label, 'btn btn--secondary tk-class__view', () => { view = value; paint(); });
      b.setAttribute('aria-pressed', String(view === value));
      return b;
    };
    const count = board.questions.length;
    const appLabel = el('label', 'tk-class__check');
    const appBox = el('input');
    appBox.type = 'checkbox';
    appBox.checked = showApp;
    appBox.addEventListener('change', () => { showApp = appBox.checked; paint(); });
    appLabel.append(appBox, document.createTextNode(' Show where the app would put them'));
    bar.replaceChildren(
      el('p', 'tk-subhead tk-class__title block-subtitle', 'Class questions'),
      el('span', 'tk-class__count', count === 1 ? '1 question' : `${count} questions`),
      toggle('Map', 'map'),
      toggle('Columns', 'columns'),
      appLabel,
      btn(board.open ? 'Close questions' : 'Open questions', 'btn btn--ghost', () => void act({ action: 'open', on: !board.open })),
      btn('Clear all', 'btn btn--ghost', () => void clearAll())
    );
  }

  async function clearAll(): Promise<void> {
    const ok = await askConfirmCard({
      title: 'Clear every question for this quadrant?',
      supporting: 'Students’ questions, your moves and chosen questions all go. This cannot be undone.',
      confirmLabel: 'Clear questions'
    });
    if (ok) await act({ action: 'reset' });
  }

  function paintMap(): void {
    layer.querySelectorAll('.tk-qdot--class, .tk-qdot--ghost').forEach((n) => n.remove());
    lines.replaceChildren();
    for (const q of board.questions) {
      const at = placed(q);
      if (showApp && q.ai && disagrees(q)) {
        const ghost = el('span', 'tk-qdot tk-qdot--ghost');
        ghost.append(token(q.symbol, 'sm'));
        ghost.setAttribute('aria-hidden', 'true');
        setAt(ghost, q.ai);
        layer.append(ghost);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', String(at.x * 100));
        line.setAttribute('y1', String(at.y * 100));
        line.setAttribute('x2', String(q.ai.x * 100));
        line.setAttribute('y2', String(q.ai.y * 100));
        line.setAttribute('vector-effect', 'non-scaling-stroke');
        lines.append(line);
      }
      const dot = symbolDot(q.symbol, 'tk-qdot--class', `${identityName(q.symbol)}: ${q.text}`);
      dot.classList.toggle('is-selected', q.id === selected);
      dot.classList.toggle('is-chosen', board.chosen.includes(q.id));
      dot.title = q.text;
      setAt(dot, at);
      draggable(dot, layer, () => placed(q), {
        onMove: () => { dragging = true; },
        onDrop: (p) => {
          dragging = false;
          q.teacher = p;
          selected = q.id;
          void act({ action: 'move', question_id: q.id, to: p });
        },
        onClick: () => select(q.id === selected ? null : q.id)
      });
      layer.append(dot);
    }
  }

  function paintDetail(): void {
    const q = byId(selected);
    detail.replaceChildren();
    detail.hidden = !q;
    if (!q) return;
    const head = el('div', 'tk-class__detail-head');
    head.append(token(q.symbol, 'md'), el('p', 'tk-class__question block-body', q.text));
    const facts = el('ul', 'tk-class__facts');
    facts.append(el('li', undefined, `Student put it in ${describePoint(q.student)}.`));
    if (q.teacher) facts.append(el('li', undefined, `You moved it to ${describePoint(q.teacher)}.`));
    if (q.ai) {
      facts.append(el('li', disagrees(q) ? 'tk-class__disagree' : undefined, disagrees(q)
        ? `The app would put it in ${QUADRANT_LABEL[quadrantAt(q.ai)]}. Worth asking the class why.`
        : `The app agrees: ${QUADRANT_LABEL[quadrantAt(q.ai)]}.`));
    }
    const chosen = board.chosen.includes(q.id);
    const actions = el('div', 'tk-class__actions block-actions');
    actions.append(btn(chosen ? 'Unchoose' : 'Choose this question', chosen ? 'btn btn--secondary' : 'btn btn--primary',
      () => void act({ action: 'choose', question_id: q.id, on: !chosen })));
    if (q.teacher) actions.append(btn('Put back where the student had it', 'btn btn--ghost', () => void act({ action: 'unmove', question_id: q.id })));
    actions.append(btn('Hide', 'btn btn--ghost', () => { selected = null; void act({ action: 'hide', question_id: q.id }); }));
    actions.append(btn('Close', 'btn btn--ghost', () => select(null)));
    detail.append(head, facts, actions);
  }

  function paintColumns(): void {
    columns.replaceChildren();
    for (const quadrant of COLUMN_ORDER) {
      const col = el('section', `tk-class__col tk-quadrant__tile--${quadrant}`);
      const inCol = board.questions.filter((q) => quadrantAt(placed(q)) === quadrant);
      col.append(el('p', 'tk-quadrant__name block-subtitle', `${QUADRANT_LABEL[quadrant]} (${inCol.length})`));
      for (const q of inCol) {
        const card = btn('', 'tk-class__card', () => select(q.id === selected ? null : q.id));
        card.classList.toggle('is-selected', q.id === selected);
        card.classList.toggle('is-chosen', board.chosen.includes(q.id));
        card.append(token(q.symbol, 'sm'), el('span', undefined, q.text));
        col.append(card);
      }
      columns.append(col);
    }
  }

  function paint(): void {
    paintBar();
    mapView.hidden = view !== 'map';
    columns.hidden = view !== 'columns';
    paintMap();
    if (view === 'columns') paintColumns();
    paintDetail();
    const chosen = board.chosen.map((id) => byId(id)).filter((q): q is ClassQuestion => !!q);
    chosenSlot.replaceChildren(chosenPanel(chosen, (id) => void act({ action: 'choose', question_id: id, on: false })));
  }

  paint();
  refresh();
  poll(host, TEACHER_POLL_MS, refresh);
}
