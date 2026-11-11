import { el } from '@/quiz/dom';
import type { EventResult, LiveJoin, SoloEvent } from '../api';
import { GAME_KIND_INFO, type PublicGame } from '../core/schema';
import type { RoomView, Seat, ServerMsg } from '../core/room-protocol';
import { calm, calmToggleOn, countUp, enter, loadCalm, setCalm } from '../motion/motion';
import { confetti } from '../motion/confetti';
import { setSfxRole, sfx, soundToggle } from '../sound/sfx';
import { playerFor, type MountedPlayer, type PlayerContext } from '../solo/registry';
import { createCodeField } from './code-field';
import { connectRoom, type ConnectOptions, type RoomConnection, type RoomStatus } from './transport';
import { mountPacedPhone, type PacedPhone } from './paced-phone';
import { earForText } from '../kinds/who-said-it/player';
import { ordinal } from './format';
import { liveKind, type KindView } from './kind-views';
import { teamColour } from './board-parts';
import '../kinds';
import '../games.css';
import './live.css';

/**
 * A student's phone in a live game (spec §3.3, §5.1; approved mockup
 * docs/mockups/games/lobby.html, phone side). Code entry (six boxes, R4),
 * then "You're in" with initials and team colour while the teacher waits for
 * the class, then the game:
 *   - race (crossword, find-a-word, Connections): the SAME solo player from
 *     the registry, with a live context whose moves go to the room and
 *     resolve with the room's ack; the header shows the student's rank.
 *   - paced (Who said it?): the cast as a hand of cards for the open quote,
 *     the room's timer as a thin bar, then "Right · +120" after the reveal.
 * Pause frosts the screen; the end shows a personal finish card and rank.
 */

export type LivePhoneOptions = {
  game: PublicGame;
  /** The arcade client's `join`: code → signed ticket. */
  join: (gameId: string, code: string) => Promise<LiveJoin>;
  host?: HTMLElement;
  /** A code to start with (from a QR link). */
  code?: string;
  /** Socket, fetch and clock overrides (tests and the dev fake room). */
  connect?: Partial<Pick<ConnectOptions, 'WebSocketImpl' | 'fetchImpl' | 'now' | 'httpBase'>>;
  onClose?(): void;
};

export type LivePhone = { root: HTMLElement; close(): void; connection(): RoomConnection | null };

type Screen = 'code' | 'joining' | 'connecting' | 'lobby' | 'countdown' | 'play' | 'done' | 'ended' | 'gone';

/** "3rd", or "3rd of 24" when the view carries the seats (the room sends students none). */
const placeText = (v: RoomView, rank: number) => (v.seats.length ? `${ordinal(rank)} of ${v.seats.length}` : ordinal(rank));
const message = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export function openLivePhone(options: LivePhoneOptions): LivePhone {
  const host = options.host ?? document.body;
  let game = options.game;
  const info = GAME_KIND_INFO[game.kind];
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  loadCalm();
  setSfxRole('phone');

  const root = el('div', 'gm gm-solo gl-phone');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', `Live game: ${game.title || info.label}`);
  const panel = el('div', 'gm-solo__panel');
  panel.tabIndex = -1;
  const head = el('header', 'gm-solo__head');
  const back = el('button', 'gm-icon-btn gm-solo__back', 'Leave');
  back.type = 'button';
  const titles = el('div', 'gm-solo__titles');
  const title = el('h2', 'gm-solo__title', game.title || info.label);
  const status = el('p', 'gm-solo__status');
  status.setAttribute('aria-live', 'polite');
  titles.append(title, status);
  const slowChip = el('span', 'gl-chip-slow', 'Slow connection');
  slowChip.hidden = true;
  slowChip.title = 'This network blocks the fast connection, so the game checks in every second instead.';
  const calmBtn = el('button', 'gm-icon-btn gm-calm-toggle', 'Calm');
  calmBtn.type = 'button';
  const paintCalm = () => {
    calmBtn.setAttribute('aria-pressed', String(calmToggleOn()));
    root.classList.toggle('gm-calm', calm());
  };
  calmBtn.addEventListener('click', () => {
    setCalm(!calmToggleOn());
    paintCalm();
  });
  paintCalm();
  const tools = el('div', 'gm-solo__tools');
  tools.append(slowChip, calmBtn, soundToggle());
  head.append(back, titles, tools);
  const body = el('div', 'gm-solo__body');
  const stage = el('div', 'gm-solo__stage');
  body.append(stage);
  const dock = el('div', 'gm-solo__dock');
  dock.dataset.part = 'form-actions';
  const toastEl = el('div', 'gm-solo__toast');
  toastEl.setAttribute('role', 'status');
  const pause = el('div', 'gl-pause');
  pause.hidden = true;
  pause.setAttribute('role', 'status');
  pause.append(el('b', '', 'Paused'), el('small', '', 'Your teacher paused the game. Hold tight.'));
  panel.append(head, body, dock, toastEl, pause);
  root.append(panel);

  let screen: Screen = 'code';
  let conn: RoomConnection | null = null;
  let ticket: LiveJoin | null = null;
  let lastCode = options.code ?? '';
  let player: MountedPlayer | null = null;
  let paced: PacedPhone | null = null;
  let kindView: KindView | null = null;
  let kindEndTimer: ReturnType<typeof setTimeout> | null = null;
  let lobbyTeam: number | undefined;
  let playerStatus = '';
  let playStarted = 0;
  let closed = false;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let countdownRaf = 0;
  let finishedSeat = false;

  function setDock(buttons: HTMLElement[]): void {
    dock.replaceChildren(...buttons);
    dock.hidden = buttons.length === 0;
  }
  function button(text: string, kind: 'primary' | 'secondary', onClick: () => void): HTMLButtonElement {
    const b = el('button', `btn btn--${kind} gm-solo__action`, text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }
  function toast(text: string, tone: 'good' | 'bad' | 'plain' = 'plain'): void {
    toastEl.textContent = text;
    toastEl.dataset.tone = tone;
    toastEl.classList.add('is-shown');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-shown'), 2600);
  }
  const me = (): Seat | undefined => conn?.view()?.you?.seat;
  function paintStatus(): void {
    const v = conn?.view();
    const rank = v?.you?.rank;
    const parts = [playerStatus];
    // No rank while nobody has scored: "1st of 15" at 0 points says nothing.
    // Students get no seats list, only their rank and the top five. No rank while nobody has scored.
    const scored = (v?.you?.seat?.score ?? 0) > 0 || !!v?.leaderboard.some((x) => x.score > 0);
    if (v && rank && scored && (v.phase === 'playing' || v.phase === 'paused')) parts.push(placeText(v, rank));
    status.textContent = parts.filter(Boolean).join(' · ');
  }
  function disposePlay(): void {
    try {
      player?.dispose();
    } catch {
      // A player's own tidy-up must not stop the phone.
    }
    player = null;
    paced?.dispose();
    paced = null;
    try {
      kindView?.dispose();
    } catch {
      // Same for a kind's phone view.
    }
    kindView = null;
    if (kindEndTimer) clearTimeout(kindEndTimer);
    kindEndTimer = null;
    playerStatus = '';
  }
  function state(text: string, opts: { error?: boolean } = {}): void {
    const box = el('div', opts.error ? 'gm-solo__state gm-solo__state--error' : 'gm-solo__state');
    const p = el('p', '', text);
    if (opts.error) p.setAttribute('role', 'alert');
    box.append(p);
    stage.replaceChildren(box);
  }

  /* ── 1. Code ──────────────────────────────────────────────────── */

  function showCode(error = ''): void {
    screen = 'code';
    disposePlay();
    const wrap = el('div', 'gl-join');
    const h = el('p', 'gl-join__h', 'Enter the code on the board');
    h.id = `gl-join-h-${game.id}`;
    const field = createCodeField({
      onChange: (code) => {
        go.disabled = code.length !== 6;
      }
    });
    field.root.setAttribute('aria-labelledby', h.id);
    const sub = el('p', 'gl-join__sub', 'Six numbers. It’s on the big screen.');
    const err = el('p', 'gm-err', error);
    err.setAttribute('role', 'alert');
    wrap.append(h, field.root, sub, err);
    const form = el('form', 'gl-join__form');
    form.noValidate = true;
    form.append(wrap);
    stage.replaceChildren(form);
    const go = button('Join', 'primary', () => submit());
    go.disabled = true;
    setDock([go]);
    const submit = () => {
      if (!field.complete()) return;
      lastCode = field.value();
      void doJoin(lastCode, () => {
        field.invalid(true);
        field.focus();
      });
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submit();
    });
    field.root.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') {
        e.preventDefault();
        submit();
      }
    });
    if (lastCode) field.set(lastCode);
    if (error) field.invalid(true);
    field.focus();
  }

  async function doJoin(code: string, onBadCode?: () => void): Promise<void> {
    screen = 'joining';
    setDock([]);
    const old = stage.querySelector('.gl-join__form');
    old?.classList.add('is-busy');
    let reply: LiveJoin;
    try {
      reply = await options.join(game.id, code);
    } catch (e) {
      if (closed) return;
      const text = message(e, 'That didn’t work. Check the code on the board.');
      showCode(text);
      onBadCode?.();
      toast(text, 'bad');
      return;
    }
    if (closed) return;
    ticket = reply;
    if (reply.game) game = reply.game;
    connect(reply);
  }

  /* ── 2. Room ──────────────────────────────────────────────────── */

  function connect(reply: LiveJoin): void {
    conn?.close();
    screen = 'connecting';
    state('Joining the game…');
    conn = connectRoom({
      wsBase: reply.ws_base,
      room: reply.room,
      ticket: reply.ticket,
      ...(reply.http_base ? { httpBase: reply.http_base } : {}),
      ...options.connect,
      onMsg: onMsg,
      onStatus: onStatus
    });
  }

  function onStatus(s: RoomStatus, info2: { slow: boolean; reason?: string }): void {
    slowChip.hidden = !info2.slow || s === 'closed';
    root.dataset.link = s;
    if (s === 'reconnecting') toast('Reconnecting…');
  }

  function onMsg(msg: ServerMsg, c: RoomConnection): void {
    if (closed || c !== conn) return;
    if (msg.t === 'replaced') return gone('Playing on another device', 'This game opened on another phone or tab, so this one has stepped out. Your score is safe.', true);
    if (msg.t === 'kicked') return gone('You’re out of this game', 'Your teacher took this seat out of the game. Ask them if you think it was a mistake.', false);
    if (msg.t === 'error') toast(msg.message || 'The game had a problem.', 'bad');
    const v = c.view();
    if (v) render(v);
  }

  function gone(heading: string, line: string, canRejoin: boolean): void {
    screen = 'gone';
    disposePlay();
    pause.hidden = true;
    const box = el('section', 'gl-gone');
    box.append(el('h3', 'gl-gone__h', heading), el('p', '', line));
    stage.replaceChildren(box);
    const buttons = [button('Back to games', canRejoin ? 'secondary' : 'primary', () => close())];
    if (canRejoin && ticket) buttons.unshift(button('Play on this phone', 'primary', () => ticket && connect(ticket)));
    setDock(buttons);
    status.textContent = '';
  }

  function render(v: RoomView): void {
    root.classList.toggle('gm-calm', calm());
    pause.hidden = v.phase !== 'paused';
    if (v.phase === 'paused' && screen === 'play') pause.querySelector('small')!.textContent = 'Your teacher paused the game. Hold tight.';
    if (v.phase === 'lobby') {
      // Teams can change in the lobby (the teacher moves or shuffles): the badge follows.
      if (screen !== 'lobby' || v.you?.seat?.team !== lobbyTeam) showLobby(v);
    } else if (v.phase === 'countdown') {
      if (screen !== 'countdown') showCountdown(v);
    } else if (v.phase === 'playing' || v.phase === 'paused') {
      if (v.style === 'custom') {
        if (screen !== 'play') showCustom(v);
        paintCustom(v);
      } else if (v.style === 'paced') {
        if (screen !== 'play') showPaced();
        paced?.update(v);
      } else if (me()?.finished || finishedSeat) {
        if (screen !== 'done') showDone(v);
        else paintDone(v);
      } else if (screen !== 'play') showRace();
    } else if (v.phase === 'ended' || v.phase === 'folded') {
      if (screen === 'play' && kindView) {
        // The kind's last screen (its final reveal) stays a moment, then the finish card.
        paintCustom(v);
        kindEndTimer ??= setTimeout(() => {
          const now = conn?.view();
          if (!closed && now) showEnded(now);
        }, calm() ? 1200 : 3200);
      } else if (screen !== 'ended') showEnded(v);
    }
    paintStatus();
  }

  function showLobby(v: RoomView): void {
    screen = 'lobby';
    disposePlay();
    const seat = v.you?.seat;
    const initials = seat?.initials ?? ticket?.initials ?? '';
    const team = seat?.team ?? ticket?.team;
    const first = screen !== 'lobby';
    lobbyTeam = seat?.team;
    const box = el('div', 'gl-in');
    const badge = el('div', 'gl-in__badge', initials);
    // Teams are numbered from 0 in the room; six team colours, then they repeat.
    if (team !== undefined) {
      box.classList.add('is-team');
      box.style.setProperty('--gl-team', teamColour(team));
      box.style.setProperty('--gl-team-soft', teamColour(team, true));
      badge.style.setProperty('--gl-team', teamColour(team));
    }
    badge.setAttribute('aria-hidden', 'true');
    box.append(badge, el('p', 'gl-in__h', 'You’re in'));
    if (team !== undefined) {
      const on = el('p', 'gl-in__team');
      on.append('You’re on ', el('b', '', `Team ${team + 1}`));
      box.append(on);
    }
    const sub = el('p', 'gl-in__sub', 'Waiting for your teacher to start');
    box.append(sub);
    box.setAttribute('aria-label', `You’re in as ${initials}${team !== undefined ? `, on Team ${team + 1}` : ''}. Waiting for your teacher to start.`);
    stage.replaceChildren(box);
    setDock([]);
    void enter(box);
    if (first) toast('Joined', 'good');
    else if (team !== undefined) toast(`You’re on Team ${team + 1} now`);
  }

  function showCountdown(v: RoomView): void {
    screen = 'countdown';
    disposePlay();
    const box = el('div', 'gl-count');
    const num = el('div', 'gl-count__n', '3');
    num.setAttribute('aria-live', 'assertive');
    const bar = el('div', 'gl-bar');
    const fill = el('i');
    bar.append(fill);
    box.append(el('p', 'gl-in__sub', 'Get ready'), num, bar);
    stage.replaceChildren(box);
    setDock([]);
    const ends = v.ends_at ?? (conn?.serverNow() ?? Date.now()) + 3000;
    const total = 3000;
    let last = -1;
    const frame = () => {
      countdownRaf = 0;
      if (screen !== 'countdown' || !conn) return;
      const left = Math.max(0, ends - conn.serverNow());
      const s = Math.ceil(left / 1000);
      if (s !== last) {
        last = s;
        num.textContent = s > 0 ? String(s) : 'Go';
        if (s > 0) sfx.tick();
      }
      fill.style.transform = `scaleX(${(left / total).toFixed(3)})`;
      if (left > 0 && typeof requestAnimationFrame === 'function') countdownRaf = requestAnimationFrame(frame);
    };
    frame();
  }

  function showRace(): void {
    screen = 'play';
    disposePlay();
    const module = playerFor(game.kind);
    if (!module || !conn) {
      state('This game plays on the board. Watch the big screen.');
      setDock([]);
      return;
    }
    const c = conn;
    playStarted = Date.now();
    const ctx: PlayerContext = {
      game,
      playId: ticket?.room ?? 'live',
      emit(event: SoloEvent): Promise<EventResult> {
        return c.move({ ...event, time_ms: event.time_ms ?? Date.now() - playStarted });
      },
      finish() {
        finishedSeat = true;
        void c.request({ t: 'finish' }).catch(() => undefined);
        const v = c.view();
        if (v) showDone(v);
      },
      setActions: setDock,
      setStatus(text) {
        playerStatus = text;
        paintStatus();
      },
      toast,
      elapsedMs: () => Date.now() - playStarted,
      calm,
      sfx
    };
    // Reopened mid-race (a reload, or back on this phone): the player starts from this seat's own progress.
    const restore = c.view()?.you?.restore;
    if (restore) ctx.restore = restore;
    stage.replaceChildren();
    setDock([]);
    try {
      player = module.mount(stage, ctx);
    } catch (e) {
      state(message(e, 'This game couldn’t open.'), { error: true });
    }
  }

  function showPaced(): void {
    screen = 'play';
    disposePlay();
    stage.replaceChildren();
    const c = conn!;
    paced = mountPacedPhone(stage, {
      game,
      owner: ticket?.owner ?? c.view()?.you?.owner ?? '',
      answer: (item, speaker, timeMs) => c.move({ item, move: 'answer', response: { speaker }, time_ms: timeMs }),
      serverNow: () => c.serverNow(),
      setActions: setDock,
      setStatus: (text) => {
        playerStatus = text;
        paintStatus();
      },
      toast,
      calm,
      sfx
    });
  }

  /** A kind with its own rules: its phone view gets the stage, the dock and every view. */
  function showCustom(v: RoomView): void {
    screen = 'play';
    disposePlay();
    stage.replaceChildren();
    setDock([]);
    const live = liveKind(v.kind);
    const c = conn!;
    if (!live) {
      state('This game’s screens are coming. Watch the board for now.');
      return;
    }
    playStarted = Date.now();
    try {
      kindView = live.phone(stage, {
        move: (event) => c.move({ ...event, time_ms: event.time_ms ?? Date.now() - playStarted }),
        control: (name, data) => c.request({ t: 'control', op: { op: 'kind', name, ...(data !== undefined ? { data } : {}) } }).then(() => undefined),
        serverNow: () => c.serverNow(),
        calm,
        sfx,
        toast,
        setActions: setDock,
        owner: ticket?.owner ?? v.you?.owner ?? ''
      });
    } catch (e) {
      kindView = null;
      state(message(e, 'This game couldn’t open.'), { error: true });
    }
  }
  function paintCustom(v: RoomView): void {
    try {
      kindView?.update(v);
    } catch {
      // One bad paint must not stop the phone; the next view tries again.
    }
  }

  let doneNum: HTMLElement | null = null;
  function showDone(v: RoomView): void {
    screen = 'done';
    disposePlay();
    const box = el('section', 'gl-finish');
    box.append(el('span', 'ws-eyebrow gl-eyebrow', 'You’ve finished'));
    doneNum = el('div', 'gl-finish__rank');
    box.append(doneNum, el('p', 'gl-in__sub', 'Waiting for the others. Eyes on the board.'));
    stage.replaceChildren(box);
    setDock([]);
    paintDone(v);
    void enter(box);
    sfx.ding();
  }
  function paintDone(v: RoomView): void {
    if (doneNum) doneNum.textContent = v.you?.rank ? ordinal(v.you.rank) : '…';
  }

  function showEnded(v: RoomView): void {
    screen = 'ended';
    const answers = paced?.answers() ?? [];
    disposePlay();
    pause.hidden = true;
    const seat = v.you?.seat;
    const rank = v.you?.rank;
    const card = el('section', 'gm-finish gl-finish');
    const top = v.teams?.length && seat?.team !== undefined ? v.teams.find((t) => t.team === seat.team)?.rank === 1 : rank === 1;
    const heading = el('h3', 'gm-finish__title', top ? 'You won!' : 'Game over');
    heading.tabIndex = -1;
    const big = el('p', 'gm-finish__score');
    const num = el('span', 'gm-finish__num', '0');
    const total = seat?.progress?.total;
    if (v.style === 'race' && total) big.append(num, el('span', 'gm-finish__of', ` / ${total}`));
    else big.append(num, el('span', 'gm-finish__of', ' pts'));
    const stats = el('dl', 'gm-finish__stats');
    const stat = (label: string, value: string) => {
      const d = el('div', 'gm-finish__stat');
      d.append(el('dt', '', label), el('dd', '', value));
      stats.append(d);
    };
    const myTeam = seat?.team !== undefined ? v.teams?.find((t) => t.team === seat.team) : undefined;
    if (myTeam) {
      stat('Team', `Team ${myTeam.team + 1} · ${ordinal(myTeam.rank)} of ${v.teams!.length}`);
      stat('Team points', myTeam.score.toLocaleString('en-AU'));
    }
    if (rank) stat('Place', placeText(v, rank));
    if (seat?.progress?.mistakes !== undefined) stat('Mistakes', String(seat.progress.mistakes));
    if (v.style === 'paced' && answers.length) {
      const ear = earForText(answers);
      stat('Right', `${answers.filter((a) => a.correct).length} of ${v.item?.of ?? answers.length}`);
      if (ear.fakes) stat('Fakes caught', `${ear.caught} of ${ear.fakes}`);
      stat('Ear for the text', `${ear.ear >= 0 ? '+' : '−'}${Math.abs(ear.ear)}`);
    }
    card.append(heading, big, stats, el('p', 'gm-note', 'Your answers are saved for your teacher.'));
    stage.replaceChildren(card);
    setDock([button('Back to games', 'primary', () => close())]);
    void enter(card);
    countUp(num, 0, seat?.score ?? 0);
    sfx.fanfare();
    if (top) void confetti(panel);
    heading.focus({ preventScroll: true });
    status.textContent = rank ? placeText(v, rank) : '';
  }

  /* ── Shell ────────────────────────────────────────────────────── */

  function onKey(e: KeyboardEvent): void {
    const paused = conn?.view()?.phase === 'paused';
    // A kind's phone view hears its keys first (not while paused).
    let kindKey = false;
    try {
      kindKey = !paused && !!kindView?.onKey?.(e);
    } catch {
      kindKey = false;
    }
    if (kindKey) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (paused) return;
    if (player?.onKey?.(e) || paced?.onKey(e)) e.preventDefault();
  }

  function close(): void {
    if (closed) return;
    closed = true;
    if (countdownRaf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(countdownRaf);
    disposePlay();
    conn?.close();
    if (toastTimer) clearTimeout(toastTimer);
    root.removeEventListener('keydown', onKey);
    root.remove();
    document.documentElement.classList.remove('gm-solo-open');
    returnFocus?.focus?.();
    options.onClose?.();
  }

  back.addEventListener('click', () => close());
  root.addEventListener('keydown', onKey);
  host.append(root);
  document.documentElement.classList.add('gm-solo-open');
  panel.focus();
  void enter(panel);
  showCode();
  if (options.code && /^\d{6}$/.test(options.code)) void doJoin(options.code);

  return { root, close, connection: () => conn };
}
