import { apiPost, ApiClientError } from '@/api/client';
import { button, el, errorText, identityName, readJSON, token, writeJSON } from '@/blocks/peer-feedback-ui';
import { poller } from '@/blocks/brainstorm/shared';
import { lineMarks, liveStatements, nearestStop, scaleValueText, type ContinuumBlock, type Phase } from './shared';

type Mine = { pos: number; reason: string; new_pos?: number; why?: string };
type StatementView = { id: string; phase: Phase; placed: number; mine: Mine | null; class: number[] | null; answer?: number };
type StudentState =
  | { phase: 'idle' }
  | { phase: 'live'; session: string; open: boolean; pace: 'teacher' | 'student' | 'self'; mode?: 'opinion' | 'predict'; joined?: boolean; symbol?: string; current?: number; statements?: StatementView[] };
type Live = Extract<StudentState, { phase: 'live' }>;
/** What a device keeps: the round it joined and its secret token. */
type Device = { session: string; token: string };

const lastState = new Map<string, StudentState>();
const MAX_REASON = 280;

/**
 * Where this device last put its symbol on each statement of an earlier line
 * (a return line's source), by statement id. Reads the source line's own
 * device token, so it needs no account; empty if this device never joined it.
 */
async function earlierPlacements(lessonId: string, sourceId: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const device = readJSON<Device>(`continuum:${lessonId}:${sourceId}:device`);
  if (!device) return out;
  try {
    const endpoint = `/api/published/continuum/${encodeURIComponent(lessonId)}/${encodeURIComponent(sourceId)}`;
    const s = await apiPost<StudentState>(endpoint, { ...device, action: 'status' });
    if (s.phase !== 'live') return out;
    for (const sv of s.statements ?? []) if (sv.mine) out.set(sv.id, sv.mine.new_pos ?? sv.mine.pos);
  } catch {
    // The earlier line has gone or closed: the student just places fresh.
  }
  return out;
}

export function mountStudent(block: ContinuumBlock, lessonId: string, corner: HTMLElement, stimulus: HTMLElement): HTMLElement {
  const endpoint = `/api/published/continuum/${encodeURIComponent(lessonId)}/${encodeURIComponent(block.id)}`;
  const storage = `continuum:${lessonId}:${block.id}`;
  const predict = block.content.mode === 'predict';
  const returning = !!block.content.returns_to;
  /** A return line: where this student put their symbol the first time. */
  let before = new Map<string, number>();
  const statements = liveStatements(block);
  const root = el('div', 'cl-run cl-run--student');
  const body = el('div', 'cl-student');
  const alert = el('p', 'pf-alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  root.append(stimulus, body, alert);

  let device = readJSON<Device>(`${storage}:device`);
  let state = lastState.get(endpoint) ?? null;
  let busy = false;
  let view = '';
  let joinCode = '';
  /** Student paced: the statement this student is on. */
  let at = 0;
  /** Statements this student is changing or re-placing, and drafts that survive repaints. */
  const editing = new Set<string>();
  const kept = new Set<string>();
  const drafts = new Map<string, { pos: number | null; text: string }>();

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

  function paintCorner(symbol: string | undefined): void {
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
    codeLabel.htmlFor = `cl-code-${block.id}`;
    const code = el('input', 'pf-code-input');
    code.id = `cl-code-${block.id}`;
    code.inputMode = 'numeric';
    code.autocomplete = 'off';
    code.maxLength = 7;
    code.placeholder = '000 000';
    code.value = joinCode;
    codeWrap.append(codeLabel, code, el('p', 'pf-field__hint block-secondary', 'You join with a symbol of your own. Classmates see the symbol and your name stays private.'));
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
        showError('Open a normal (not private) window to join here.');
        return;
      }
      device = candidate;
      const ok = await send('join', { code: joinCode }, pressed);
      if (!ok && device) forget();
    }
    wrap.append(codeWrap, join);
    return wrap;
  }

  /**
   * A line the student can place on: tap or drag, or nudge with the arrows.
   * `ghost` is where they first placed; `dots` is the class after a reveal.
   */
  function line(opts: { symbol: string; pos: number | null; snap: boolean; ghost?: number; dots?: number[]; answer?: number; onMove?: (pos: number) => void }): HTMLElement {
    const wrap = el('div', 'cl-place');
    const box = el('div', `cl-line${opts.onMove ? ' cl-line--live' : ''}`);
    const track = el('div', 'cl-track');
    track.append(lineMarks(block.content.scale, opts.snap));
    box.append(track);
    if (opts.answer != null) {
      const mark = el('span', 'cl-answer-mark');
      mark.append(el('span', 'cl-answer-mark__label', 'Answer'));
      mark.style.left = `${opts.answer * 100}%`;
      box.append(mark);
    }
    for (const d of opts.dots ?? []) {
      const dot = el('i', 'cl-line__dot');
      dot.style.left = `${d * 100}%`;
      box.append(dot);
    }
    if (opts.ghost != null) {
      const g = token(opts.symbol, 'md');
      g.classList.add('cl-line__sym', 'cl-line__sym--ghost');
      g.style.left = `${opts.ghost * 100}%`;
      box.append(g);
    }
    const me = token(opts.symbol, 'md');
    me.classList.add('cl-line__sym');
    me.hidden = opts.pos == null;
    if (opts.pos != null) me.style.left = `${opts.pos * 100}%`;
    box.append(me);
    wrap.append(box);
    if (!opts.onMove) return wrap;

    const hint = el('p', 'cl-line__hint block-secondary', 'Tap the line to place your symbol');
    hint.hidden = opts.pos != null;
    box.append(hint);
    box.setAttribute('role', 'slider');
    box.tabIndex = 0;
    box.setAttribute('aria-label', `Your position, from ${block.content.scale.left} to ${block.content.scale.right}`);
    box.setAttribute('aria-valuemin', '0');
    box.setAttribute('aria-valuemax', '100');
    box.setAttribute('aria-valuetext', 'Choose a place on the line');
    let pos = opts.pos;
    if (pos != null) {
      box.setAttribute('aria-valuenow', String(Math.round(pos * 100)));
      box.setAttribute('aria-valuetext', scaleValueText(block.content.scale, pos));
    }
    const set = (p: number) => {
      pos = opts.snap ? nearestStop(p, block.content.scale.stops) : Math.round(Math.min(1, Math.max(0, p)) * 1000) / 1000;
      me.hidden = false;
      hint.hidden = true;
      me.style.left = `${pos * 100}%`;
      box.setAttribute('aria-valuenow', String(Math.round(pos * 100)));
      box.setAttribute('aria-valuetext', scaleValueText(block.content.scale, pos));
      opts.onMove?.(pos);
    };
    const fromPointer = (e: PointerEvent) => {
      const r = box.getBoundingClientRect();
      set((e.clientX - r.left) / r.width);
    };
    let dragging = false;
    box.addEventListener('pointerdown', (e) => {
      dragging = true;
      box.setPointerCapture?.(e.pointerId);
      fromPointer(e);
    });
    box.addEventListener('pointermove', (e) => dragging && fromPointer(e));
    box.addEventListener('pointerup', () => (dragging = false));
    box.addEventListener('pointercancel', () => (dragging = false));
    const step = (dir: -1 | 1) => {
      if (pos == null) return set(0.5);
      if (!opts.snap) return set(pos + dir * 0.05);
      const points = [0, ...block.content.scale.stops.map((_, i, a) => (i + 1) / (a.length + 1)), 1];
      const i = points.indexOf(pos);
      set(points[Math.min(points.length - 1, Math.max(0, i + dir))]!);
    };
    box.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') step(-1);
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') step(1);
      else if (e.key === 'Home') set(0);
      else if (e.key === 'End') set(1);
      else return;
      e.preventDefault();
    });
    const nudge = el('div', 'cl-nudge');
    const left = button('‹', 'secondary', () => step(-1));
    left.setAttribute('aria-label', `Move towards ${block.content.scale.left}`);
    const right = button('›', 'secondary', () => step(1));
    right.setAttribute('aria-label', `Move towards ${block.content.scale.right}`);
    nudge.append(left, right);
    wrap.append(nudge);
    return wrap;
  }

  function reasonField(label: string, placeholder: string, draft: { text: string }, onInput: () => void): HTMLElement {
    const f = el('div', 'pf-field');
    const id = `cl-why-${block.id}`;
    const lab = el('label', 'pf-field__label', label);
    lab.htmlFor = id;
    const input = el('textarea', 'pf-field__input');
    input.id = id;
    input.rows = 3;
    input.maxLength = MAX_REASON;
    input.placeholder = placeholder;
    input.value = draft.text;
    input.addEventListener('input', () => {
      draft.text = input.value;
      onInput();
    });
    f.append(lab, input);
    return f;
  }

  function placeView(s: Live, sv: StatementView, snap: boolean): HTMLElement {
    const wrap = el('div', 'cl-answer');
    const draft = drafts.get(sv.id) ?? { pos: sv.mine?.pos ?? null, text: sv.mine?.reason ?? '' };
    drafts.set(sv.id, draft);
    const first = before.get(sv.id);
    if (returning) {
      wrap.append(el('p', 'cl-lead block-body', first != null ? 'You’ve come back to this. The dashed symbol is where you put it earlier. Where would you put it now?' : 'You’ve come back to this. Where would you put it now?'));
    }
    const go = button(sv.mine ? 'Save my change' : 'Place it', 'primary', function () {
      void send('place', { statement: sv.id, pos: draft.pos, reason: draft.text }, this).then((ok) => {
        if (!ok) return;
        editing.delete(sv.id);
        drafts.delete(sv.id);
        view = '';
        paint();
      });
    });
    const ready = () => {
      go.disabled = draft.pos == null || !draft.text.trim();
    };
    wrap.append(
      line({ symbol: s.symbol ?? '0-0', pos: draft.pos, snap, ghost: first, onMove: (p) => ((draft.pos = p), ready()) }),
      returning
        ? reasonField(first != null ? 'What moved you, or what kept you there?' : 'Why there?', 'Now I think… because…', draft, ready)
        : predict
          ? reasonField('What makes you predict that?', 'I predict this because…', draft, ready)
          : reasonField('Why there?', 'I put it here because…', draft, ready),
      el('p', 'pf-field__hint block-secondary', 'You need a reason before you can place it.')
    );
    const row = el('div', 'pf-actions block-actions');
    row.append(go);
    if (sv.mine) row.append(button('Cancel', 'ghost', () => {
      editing.delete(sv.id);
      drafts.delete(sv.id);
      view = '';
      paint();
    }));
    wrap.append(row);
    ready();
    return wrap;
  }

  function replaceView(s: Live, sv: StatementView, snap: boolean): HTMLElement {
    const mine = sv.mine!;
    const wrap = el('div', 'cl-answer');
    const draft = drafts.get(sv.id) ?? { pos: mine.pos, text: '' };
    drafts.set(sv.id, draft);
    const hint = el('p', 'pf-field__hint block-secondary');
    const go = button('Move it', 'primary', function () {
      void send('move', { statement: sv.id, pos: draft.pos, why: draft.text }, this).then((ok) => {
        if (!ok) return;
        drafts.delete(sv.id);
        view = '';
        paint();
      });
    });
    const ready = () => {
      const moved = draft.pos != null && Math.abs(draft.pos - mine.pos) > 0.01;
      go.disabled = !moved || !draft.text.trim();
      hint.textContent = moved ? 'Say why you moved before you send it.' : 'Drag your symbol if you’ve changed your mind.';
    };
    wrap.append(
      el('p', 'cl-lead block-body', 'Changed your mind? Move your symbol. The dashed one is where you started.'),
      line({ symbol: s.symbol ?? '0-0', pos: draft.pos, snap, ghost: mine.pos, dots: sv.class ?? [], onMove: (p) => ((draft.pos = p), ready()) }),
      reasonField('Why did you move?', 'I moved because…', draft, ready),
      hint
    );
    const row = el('div', 'pf-actions block-actions');
    row.append(
      button('Keep it here', 'secondary', () => {
        kept.add(sv.id);
        drafts.delete(sv.id);
        view = '';
        paint();
      }),
      go
    );
    wrap.append(row);
    ready();
    return wrap;
  }

  function statementView(s: Live, index: number): HTMLElement {
    const st = statements[index]!;
    const sv = s.statements?.find((x) => x.id === st.id);
    const wrap = el('div', 'cl-step');
    const head = el('div', 'cl-step__head');
    head.append(el('span', 'block-secondary', `Statement ${index + 1} of ${statements.length}`));
    if (s.pace !== 'teacher') {
      const bar = el('div', 'cl-progress');
      statements.forEach((x, i) => {
        const done = !!s.statements?.find((y) => y.id === x.id)?.mine;
        bar.append(el('i', `${done ? 'is-done' : ''}${i === index ? ' is-here' : ''}`));
      });
      head.append(bar);
    }
    wrap.append(head, el('p', 'cl-statement cl-statement--student', st.text));
    if (!sv) return wrap;
    const symbol = s.symbol ?? '0-0';
    const nav = () => {
      const row = el('div', 'pf-actions block-actions');
      if (s.pace === 'teacher') return row;
      if (index > 0) row.append(button('‹ Back', 'ghost', () => ((at = index - 1), (view = ''), paint())));
      if (index < statements.length - 1) row.append(button('Next statement ›', sv.mine ? 'primary' : 'ghost', () => ((at = index + 1), (view = ''), paint())));
      return row;
    };

    if (sv.phase === 'collect') {
      if (!s.open) wrap.append(waitPanel('Placing has closed.', 'Ask your teacher what to do next.'));
      else if (!sv.mine || editing.has(sv.id)) wrap.append(placeView(s, sv, st.snap));
      else {
        const done = waitPanel('Placed', 'Only you can see where you put it. Everyone’s goes up together when your teacher reveals.');
        done.append(line({ symbol, pos: sv.mine.pos, snap: st.snap }), el('p', 'cl-mine-reason block-body', sv.mine.reason));
        const row = nav();
        row.prepend(button('Change my answer', 'secondary', () => (editing.add(sv.id), (view = ''), paint())));
        done.append(row);
        wrap.append(done);
      }
      return wrap;
    }
    if (!sv.mine) {
      wrap.append(
        sv.answer != null ? waitPanel('The answer is up', 'The marked spot is where it really sits.') : waitPanel('Revealed', 'Here’s where the class put their symbols.'),
        line({ symbol, pos: null, snap: st.snap, dots: sv.class ?? [], answer: sv.answer }),
        nav()
      );
      return wrap;
    }
    if (sv.phase === 'replace' && sv.mine.new_pos == null && !kept.has(sv.id) && s.open) {
      wrap.append(replaceView(s, sv, st.snap));
      return wrap;
    }
    const moved = sv.mine.new_pos != null;
    const title = sv.answer != null ? 'The answer is up' : moved ? 'Moved' : sv.phase === 'replace' ? 'Kept where it was' : 'Revealed';
    // A prediction is a guess made before the evidence: the gap is something to wonder about, never a score.
    const sub =
      sv.answer != null
        ? 'The marked spot is where it really sits. What surprised you? What would you look at differently next time?'
        : moved
          ? 'Your teacher will show the moves.'
          : sv.phase === 'replace'
            ? 'You can still move if the discussion changes your mind.'
            : 'The grey dots are the class. Yours is your symbol.';
    const panel = waitPanel(title, sub);
    panel.append(line({ symbol, pos: moved ? sv.mine.new_pos! : sv.mine.pos, snap: st.snap, ghost: moved ? sv.mine.pos : undefined, dots: sv.class ?? [], answer: sv.answer }));
    const row = nav();
    if (sv.phase === 'replace' && !moved && kept.has(sv.id) && s.open) row.prepend(button('Move after all', 'secondary', () => (kept.delete(sv.id), (view = ''), paint())));
    panel.append(row);
    wrap.append(panel);
    return wrap;
  }

  /** Self-run has no code: the first visit joins on its own, with a fresh device token. */
  let joining = false;
  async function autoJoin(s: Live): Promise<void> {
    if (joining) return;
    joining = true;
    try {
      const secret = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
      const candidate = { session: s.session, token: secret };
      if (!writeJSON(`${storage}:device`, candidate)) {
        showError('Open a normal (not private) window to join here.');
        return;
      }
      device = candidate;
      // paint() runs inside send(), which is still busy: step out of it before joining.
      await new Promise((resolve) => setTimeout(resolve, 0));
      if (!(await send('join', { code: '' })) && device) forget();
    } finally {
      joining = false;
    }
  }

  function paint(): void {
    if (!state) {
      body.replaceChildren(el('p', 'pf-note block-secondary', 'Loading…'));
      return;
    }
    if (state.phase === 'idle') {
      paintCorner(undefined);
      if (view !== 'idle') body.replaceChildren(waitPanel('Waiting for your teacher to start.', 'This page updates by itself.'));
      view = 'idle';
      return;
    }
    const s = state;
    const joined = !!device && !!s.joined;
    paintCorner(joined ? s.symbol : undefined);
    if (!joined && s.open && s.pace === 'self') {
      void autoJoin(s);
      if (view !== 'joining') body.replaceChildren(waitPanel('Getting you started…', 'One moment.'));
      view = 'joining';
      return;
    }
    if (!joined) {
      const key = s.open ? 'join' : 'closed';
      if (key !== view) {
        view = key;
        body.replaceChildren(key === 'join' ? joinView() : waitPanel('This activity has closed.', 'Ask your teacher what to do next.'));
      }
      return;
    }
    if (!statements.length) return;
    const index = Math.min(s.pace === 'teacher' ? s.current ?? 0 : at, statements.length - 1);
    const sv = s.statements?.find((x) => x.id === statements[index]!.id);
    // The class count changes as others place; leave it out so typing isn't interrupted.
    const key = JSON.stringify([index, s.open, s.pace, sv && [sv.id, sv.phase, sv.mine, sv.class, sv.answer], editing.has(sv?.id ?? ''), kept.has(sv?.id ?? ''), before.size]);
    if (key === view) return;
    view = key;
    body.replaceChildren(statementView(s, index));
  }

  paint();
  if (returning) {
    void earlierPlacements(lessonId, block.content.returns_to!).then((found) => {
      before = found;
      view = '';
      paint();
    });
  }
  poller(root, async () => {
    await send('status');
  });
  return root;
}
