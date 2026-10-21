import { apiPost } from '@/api/client';
import { button, el, errorText, identityName, isNotPublished, notLivePanel, token } from '@/blocks/peer-feedback-ui';
import { poller, formatCode, showCodeOverlay } from '@/blocks/brainstorm/shared';
import { mountStage } from './stage';
import { liveStatements, type ContinuumBlock, type Phase } from './shared';

type Entry = { symbol: string; pos?: number; reason?: string; flagged?: boolean; new_pos?: number; why?: string; why_flagged?: boolean };
type Group = { id: string; name: string; answer_ids: string[] };
type StatementState = { id: string; phase: Phase; placed: number; moved: number; moves_shown: boolean; entries: Entry[]; groups: Group[] | null };
type TeacherState =
  | { phase: 'idle' }
  | { phase: 'live'; session: string; code: string; open: boolean; pace: 'teacher' | 'student'; replace: boolean; current: number; joined: number; statements: StatementState[] };
type Live = Extract<TeacherState, { phase: 'live' }>;
type Panel = 'none' | 'all' | 'groups' | 'moved';

const lastState = new Map<string, TeacherState>();

export function mountTeacher(block: ContinuumBlock, lessonId: string, stimulus: HTMLElement): HTMLElement {
  const endpoint = `/api/lessons/${encodeURIComponent(lessonId)}/continuum/${encodeURIComponent(block.id)}`;
  const statements = liveStatements(block);
  const root = el('div', 'cl-run');
  const round = el('div', 'cl-round');
  const top = el('div', 'cl-top');
  const head = el('div', 'cl-head');
  const nav = el('div', 'cl-nav');
  const statementText = el('p', 'cl-statement');
  head.append(nav, statementText);
  top.append(stimulus, head);
  const bar = el('div', 'cl-bar');
  const counter = el('span', 'cl-counter');
  const status = el('span', 'cl-status block-secondary');
  const actions = el('div', 'cl-bar__actions');
  const barInfo = el('div', 'cl-bar__info');
  barInfo.append(counter, status);
  bar.append(barInfo, actions);
  const stage = mountStage((symbol) => {
    picked = symbol;
    paintStage();
  });
  const card = el('div', 'cl-card');
  card.hidden = true;
  stage.root.append(card);
  const panel = el('div', 'cl-panel');
  const alert = el('p', 'pf-alert');
  alert.setAttribute('role', 'alert');
  alert.hidden = true;
  const idle = el('div', 'pf-panel pf-panel--start');
  const notLive = notLivePanel();
  notLive.hidden = true;
  const live = el('div', 'cl-live');
  live.append(round, top, bar, stage.root, panel);
  root.append(alert, notLive, idle, live);

  let state = lastState.get(endpoint) ?? null;
  let busy = false;
  let viewing = 0;
  let picked: string | null = null;
  let shown = new Set<string>();
  let panelMode: Panel = 'none';
  let paintedKey = '';
  let paintedPanel = '';
  let paintedRound = '';

  async function send(action: string, extra: Record<string, unknown> = {}, pressed?: HTMLButtonElement): Promise<void> {
    if (busy) return;
    busy = true;
    const label = pressed?.textContent;
    if (pressed) {
      pressed.disabled = true;
      pressed.textContent = action === 'group' ? 'Sorting…' : 'Working…';
    }
    try {
      state = await apiPost<TeacherState>(endpoint, { action, ...extra });
      lastState.set(endpoint, state);
      alert.hidden = true;
      paint();
    } catch (error) {
      if (!state && isNotPublished(error)) {
        alert.hidden = true;
        idle.hidden = true;
        live.hidden = true;
        notLive.hidden = false;
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

  const statementAt = (s: Live) => s.statements.find((x) => x.id === statements[viewing]?.id) ?? null;

  function go(index: number, s: Live): void {
    if (index < 0 || index >= statements.length) return;
    viewing = index;
    picked = null;
    shown = new Set();
    panelMode = 'none';
    if (s.pace === 'teacher') void send('go', { statement: statements[index]!.id });
    else paint();
  }

  function paintRound(s: Live): void {
    const sig = JSON.stringify([s.code, s.open]);
    if (sig === paintedRound) return;
    paintedRound = sig;
    const code = el('div', 'pf-code');
    if (s.open) code.append(el('span', 'pf-code__label', 'Code'), el('span', 'pf-code__value', formatCode(s.code)));
    else code.append(el('span', 'pf-code__label', 'Placing closed'));
    const right = el('div', 'cl-round__actions');
    if (s.open) right.append(button('Show code on board', 'ghost', () => showCodeOverlay(s.code)));
    right.append(
      s.open
        ? button('Close the activity', 'ghost', function () {
            void send('end', {}, this);
          })
        : button('Start a new round', 'ghost', function () {
            if (confirm('Start a new round? Every line clears and students join again.')) void send('start', {}, this);
          })
    );
    round.replaceChildren(code, right);
  }

  let paintedNav = '';
  function paintNav(s: Live): void {
    const sig = JSON.stringify([viewing, s.pace, s.statements.map((x) => [x.phase, x.placed])]);
    if (sig === paintedNav) return;
    paintedNav = sig;
    const prev = button('‹', 'ghost', () => go(viewing - 1, s));
    prev.className = 'cl-arrow';
    prev.setAttribute('aria-label', 'Previous statement');
    prev.disabled = viewing === 0;
    const next = button('›', 'ghost', () => go(viewing + 1, s));
    next.className = 'cl-arrow';
    next.setAttribute('aria-label', 'Next statement');
    next.disabled = viewing >= statements.length - 1;
    const dots = el('div', 'cl-dots');
    statements.forEach((st, i) => {
      const info = s.statements.find((x) => x.id === st.id);
      const dot = button(String(i + 1), 'ghost', () => i !== viewing && go(i, s));
      dot.className = 'cl-dot';
      dot.setAttribute('aria-current', String(i === viewing));
      dot.setAttribute('aria-label', `Statement ${i + 1}`);
      if (s.pace === 'student' && info) dot.append(el('small', '', info.phase === 'collect' ? ` ${info.placed}` : ' ✓'));
      dots.append(dot);
    });
    const count = el('span', 'cl-nav__count block-secondary', `Statement ${viewing + 1} of ${statements.length}${statements[viewing]?.snap ? ' · snapped' : ''}`);
    nav.replaceChildren(prev, count, next, dots);
  }

  function paintBar(s: Live, st: StatementState): void {
    counter.replaceChildren();
    if (st.phase === 'collect') {
      counter.append(String(st.placed), el('span', '', ` of ${s.joined} placed`));
      status.textContent = s.pace === 'student' ? 'Students move through at their own pace.' : 'A reason is required. Nothing shows until you reveal.';
    } else if (st.phase === 'revealed') {
      counter.append(String(st.placed), el('span', '', ' placed'));
      status.textContent = 'Click a symbol to read its reason.';
    } else {
      counter.append(String(st.moved), el('span', '', ' moved'));
      status.textContent = st.moves_shown ? 'Dashed = where they started.' : 'Moves stay hidden until you show them.';
    }
    const key = JSON.stringify([st.id, st.phase, st.moves_shown, panelMode, s.replace, s.pace, viewing]);
    if (key === paintedKey) return;
    paintedKey = key;
    const btns: HTMLElement[] = [];
    const toggle = (label: string, mode: Panel) => {
      const b = button(label, 'secondary', () => {
        panelMode = panelMode === mode ? 'none' : mode;
        paint();
      });
      b.setAttribute('aria-pressed', String(panelMode === mode));
      return b;
    };
    const sortBtn = () => {
      const b = button(st.groups ? 'Sorted reasons' : 'Sort reasons', 'secondary', function () {
        if (panelMode === 'groups') {
          panelMode = 'none';
          paint();
          return;
        }
        panelMode = 'groups';
        if (st.groups) paint();
        else void send('group', { statement: st.id }, this);
      });
      b.setAttribute('aria-pressed', String(panelMode === 'groups'));
      return b;
    };
    if (st.phase === 'collect') {
      btns.push(button('Reveal', 'primary', function () {
        void send('reveal', { statement: st.id }, this);
      }));
    } else if (st.phase === 'revealed') {
      btns.push(toggle('Show all reasons', 'all'), sortBtn());
      btns.push(button('Hide again', 'ghost', function () {
        picked = null;
        panelMode = 'none';
        void send('collect', { statement: st.id }, this);
      }));
      if (s.replace) btns.push(button('Let them re-place', 'primary', function () {
        void send('replace', { statement: st.id }, this);
      }));
    } else {
      const showMoves = button(st.moves_shown ? 'Hide moves' : 'Show moves', st.moves_shown ? 'secondary' : 'primary', function () {
        void send('show_moves', { statement: st.id, show: !st.moves_shown }, this);
      });
      btns.push(showMoves);
      if (st.moves_shown) btns.push(toggle('Who moved and why', 'moved'));
      btns.push(toggle('Show all reasons', 'all'), sortBtn());
    }
    if (st.phase !== 'collect' && s.pace === 'teacher' && viewing < statements.length - 1) {
      btns.push(button('Next statement', 'secondary', () => go(viewing + 1, s)));
    }
    actions.replaceChildren(...btns);
  }

  /** A reason as the teacher sees it: held text stays covered until shown. */
  function reasonText(text: string | undefined, flagged: boolean | undefined, key: string): HTMLElement {
    if (!flagged || shown.has(key)) return el('p', 'cl-reason__text', text ?? '');
    const wrap = el('p', 'cl-reason__text cl-reason__text--held');
    wrap.append(el('span', '', 'Held by the word check. '));
    const show = button('Show', 'ghost', () => {
      shown.add(key);
      paintedPanel = '';
      paint();
    });
    show.classList.add('cl-inline');
    show.addEventListener('click', (e) => e.stopPropagation());
    wrap.append(show);
    return wrap;
  }

  function miniLine(e: Entry, movesShown: boolean): HTMLElement {
    const mini = el('div', 'cl-mini');
    const now = movesShown && e.new_pos != null ? e.new_pos : e.pos ?? 0.5;
    if (movesShown && e.new_pos != null) {
      const was = el('i', 'cl-mini__was');
      was.style.left = `${(e.pos ?? 0) * 100}%`;
      mini.append(was);
    }
    const dot = el('i', 'cl-mini__dot');
    dot.style.left = `${now * 100}%`;
    mini.append(dot);
    return mini;
  }

  function reasonCard(e: Entry, st: StatementState, focus: 'reason' | 'why' = 'reason'): HTMLElement {
    const c = el('div', 'cl-reason');
    c.addEventListener('click', () => {
      picked = e.symbol;
      paintStage();
    });
    c.append(token(e.symbol, 'sm'));
    const body = el('div', 'cl-reason__body');
    const moved = st.moves_shown && e.new_pos != null;
    if (focus === 'why' && moved) {
      body.append(reasonText(e.why, e.why_flagged, `why:${st.id}:${e.symbol}`), miniLine(e, true));
      body.append(el('p', 'cl-reason__first block-secondary', `First said: ${e.reason ?? ''}`));
    } else {
      body.append(reasonText(e.reason, e.flagged, `r:${st.id}:${e.symbol}`), miniLine(e, st.moves_shown));
      if (moved) body.append(el('p', 'cl-reason__first block-secondary', `Moved: ${e.why ?? ''}`));
    }
    c.append(body);
    return c;
  }

  function paintPanel(st: StatementState): void {
    const sig = JSON.stringify([panelMode, st.id, st.phase, st.moves_shown, st.entries, st.groups, [...shown]]);
    if (sig === paintedPanel) return;
    paintedPanel = sig;
    if (st.phase === 'collect' || panelMode === 'none') {
      panel.replaceChildren();
      return;
    }
    const scale = block.content.scale;
    const pos = (e: Entry) => (st.moves_shown && e.new_pos != null ? e.new_pos : e.pos ?? 0.5);
    const byPos = [...st.entries].sort((a, b) => pos(a) - pos(b));
    const head = el('div', 'cl-panel__head');
    const list = el('div', 'cl-reasons');
    if (panelMode === 'all') {
      head.append(el('h4', 'cl-panel__title', `All reasons, ${scale.left} to ${scale.right}`));
      list.append(...byPos.map((e) => reasonCard(e, st)));
      panel.replaceChildren(head, list);
    } else if (panelMode === 'moved') {
      const movers = byPos.filter((e) => e.new_pos != null);
      head.append(el('h4', 'cl-panel__title', `Who moved and why (${movers.length})`));
      list.append(...movers.map((e) => reasonCard(e, st, 'why')));
      if (!movers.length) list.append(el('p', 'block-secondary', 'Nobody has moved yet.'));
      panel.replaceChildren(head, list);
    } else if (st.groups) {
      head.append(el('h4', 'cl-panel__title', 'Sorted by how they argued'));
      const wrap = el('div', 'cl-groups');
      const bySymbol = new Map(st.entries.map((e) => [e.symbol, e]));
      for (const g of st.groups) {
        const col = el('section', 'cl-group');
        const items = g.answer_ids.map((id) => bySymbol.get(id)).filter((e): e is Entry => !!e).sort((a, b) => pos(a) - pos(b));
        if (!items.length) continue;
        const title = el('h5', 'cl-group__title', g.name);
        title.append(el('span', 'block-secondary', ` ${items.length}`));
        col.append(title, ...items.map((e) => reasonCard(e, st)));
        wrap.append(col);
      }
      const regroup = button('Sort again', 'ghost', function () {
        void send('group', { statement: st.id }, this);
      });
      head.append(regroup);
      panel.replaceChildren(head, wrap);
    } else {
      panel.replaceChildren();
    }
  }

  function paintCard(st: StatementState): void {
    const e = picked ? st.entries.find((x) => x.symbol === picked) : null;
    if (!e || st.phase === 'collect') {
      card.hidden = true;
      return;
    }
    const headLine = el('div', 'cl-card__head');
    headLine.append(token(e.symbol, 'sm'), el('span', '', identityName(e.symbol)));
    const close = button('×', 'ghost', () => {
      picked = null;
      paintStage();
    });
    close.className = 'cl-card__close';
    close.setAttribute('aria-label', 'Close');
    headLine.append(close);
    card.replaceChildren(headLine, reasonText(e.reason, e.flagged, `r:${st.id}:${e.symbol}`));
    if (st.moves_shown && e.new_pos != null) {
      const moved = el('div', 'cl-card__moved');
      moved.append(el('b', '', 'Moved because'), reasonText(e.why, e.why_flagged, `why:${st.id}:${e.symbol}`));
      card.append(moved);
    }
    card.hidden = false;
    placeCard();
  }

  function placeCard(): void {
    if (card.hidden || !picked) return;
    const at = stage.at(picked);
    if (!at) return;
    const { W, s } = stage.size();
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    const x = Math.max(12, Math.min(W - w - 12, at.x + s / 2 - w / 2));
    let y = at.y - h - 10;
    if (y < 8) y = at.y + s + 10;
    card.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
  }
  // The symbol is still gliding for a moment after a click, so the card follows it briefly.
  let follow = 0;
  function followCard(): void {
    cancelAnimationFrame(follow);
    const until = performance.now() + 1500;
    const step = () => {
      placeCard();
      if (performance.now() < until && card.isConnected) follow = requestAnimationFrame(step);
    };
    follow = requestAnimationFrame(step);
  }

  function paintStage(): void {
    if (!state || state.phase !== 'live') return;
    const st = statementAt(state);
    if (!st) return;
    stage.update({
      key: `${state.session}:${st.id}`,
      scale: block.content.scale,
      snap: !!statements[viewing]?.snap,
      phase: st.phase,
      movesShown: st.moves_shown,
      entries: st.entries,
      picked
    });
    paintCard(st);
    followCard();
  }

  function paint(): void {
    notLive.hidden = true;
    if (!state) {
      idle.hidden = false;
      idle.replaceChildren(el('p', 'pf-note block-secondary', 'Loading…'));
      live.hidden = true;
      return;
    }
    if (state.phase === 'idle') {
      live.hidden = true;
      idle.hidden = false;
      paintedRound = '';
      paintedKey = '';
      idle.replaceChildren(
        el('p', 'pf-panel__text block-body', 'Students join on the lesson link with the code. No accounts. Each gets a colour-and-shape symbol to place on the line.'),
        button('Start the line', 'primary', function () {
          void send('start', {}, this);
        })
      );
      return;
    }
    const s = state;
    if (!statements.length) {
      idle.hidden = false;
      live.hidden = true;
      idle.replaceChildren(el('p', 'pf-note block-secondary', 'Add a statement to this block first.'));
      return;
    }
    if (s.pace === 'teacher') viewing = Math.min(s.current, statements.length - 1);
    viewing = Math.min(viewing, statements.length - 1);
    idle.hidden = true;
    live.hidden = false;
    const st = statementAt(s);
    if (!st) return;
    if (st.phase === 'collect') {
      picked = null;
      panelMode = 'none';
    }
    if (panelMode === 'moved' && !st.moves_shown) panelMode = 'none';
    if (panelMode === 'groups' && !st.groups) panelMode = 'none';
    paintRound(s);
    paintNav(s);
    statementText.textContent = statements[viewing]?.text ?? '';
    paintBar(s, st);
    paintPanel(st);
    paintStage();
  }

  paint();
  poller(root, () => send('status'));
  return root;
}
