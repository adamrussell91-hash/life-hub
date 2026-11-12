import { el } from '@/quiz/dom';
import { studentSiteOrigin } from '@/app/class-site';
import type { LiveOpen } from '../api';
import { FAKE_SPEAKER, GAME_KIND_INFO, type PublicGame } from '../core/schema';
import { ROOM_LIMITS, type ControlOp, type PacedItem, type RoomView, type Seat, type ServerMsg } from '../core/room-protocol';
import { animate, calm, calmToggleOn, countUp, enter, loadCalm, setCalm } from '../motion/motion';
import { confetti } from '../motion/confetti';
import { setSfxRole, sfx, soundOn, setSoundOn } from '../sound/sfx';
import { primeSound } from '@/blocks/classroom-tools/sound';
import { cameo, castLooks, type Look } from '../kinds/who-said-it/portraits';
import { connectRoom, type ConnectOptions, type RoomConnection, type RoomStatus } from './transport';
import { avatar, createLeaderboard, createRing, teamBadge, teamColour, type Leaderboard, type Ring } from './board-parts';
import { liveKind, type KindView, type KindViewApi } from './kind-views';
import { spacedCode } from './code-field';
import { clock, ordinal } from './format';
import { qrSvg } from './qr';
import '../kinds';
import '../games.css';
import '../kinds/who-said-it/who-said-it.css';
import './live.css';

/**
 * The live game board (spec §5.1, §7 "Run live"; approved mockups
 * docs/mockups/games/lobby.html and the live parts of crossword, find-a-word,
 * connections and who-said-it). Full screen on the teacher's Display:
 *   lobby (huge code + QR, initials fly in) → 3-s countdown ring →
 *   race wall (progress per seat, "first to solve" ticker, top five) or
 *   paced (typewriter quote, timer ring, answered count, reveal bars, the
 *   right card flips) → podium (top three rise, confetti, class summary).
 * Initials only, top five only on the projected leaderboard; the teacher's
 * full ranks sit in a side panel that starts closed. Board sound on; Calm
 * respected everywhere. Controls dock bottom right, hide after 3 s of no
 * mouse, and have keys: Space next/reveal/start, P pause, + 15 s, L
 * leaderboard, W class wall, T ranks, M mute, C calm, F full screen.
 */

export type LiveBoardOptions = {
  open: LiveOpen;
  /** The game as students see it (cast, quotes). Falls back to `open.game`. */
  game?: PublicGame | null;
  host?: HTMLElement;
  connect?: Partial<Pick<ConnectOptions, 'WebSocketImpl' | 'fetchImpl' | 'now' | 'httpBase'>>;
  /** Extra buttons for the control dock (the dev preview's Simulate class). */
  extraControls?: HTMLElement[];
  onClose?(): void;
};

export type LiveBoard = { root: HTMLElement; close(): void; connection(): RoomConnection };

type Screen = 'connecting' | 'lobby' | 'countdown' | 'race' | 'paced' | 'custom' | 'ended';
type KindButton = ReturnType<NonNullable<KindView['controls']>>[number];
/** How long a custom game's last screen stays up before the podium. */
const KIND_END_MS = 3200;

const KIND_TICKER: Record<string, string> = { connections: 'First to find it', who_said_it: 'First to lock in' };

/**
 * Where the QR sends a phone: this lesson for this class on the class site, with the code ready
 * (the arcade offers it on Join live game). The class site serves only student pages, so its root is no use.
 */
export function joinUrl(open: LiveOpen): string {
  if (open.join_url) return open.join_url;
  const origin = studentSiteOrigin();
  const code = encodeURIComponent(open.code);
  if (open.lesson_id && open.class_id) return `${origin}/s/classes/${encodeURIComponent(open.class_id)}/lessons/${encodeURIComponent(open.lesson_id)}?join=${code}`;
  if (open.lesson_id) return `${origin}/s/lessons/${encodeURIComponent(open.lesson_id)}?join=${code}`;
  return `${origin}/?join=${code}`;
}

export function openLiveBoard(options: LiveBoardOptions): LiveBoard {
  const open = options.open;
  const game = options.game ?? open.game ?? null;
  const host = options.host ?? document.body;
  loadCalm();
  setSfxRole('board');
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const kindLabel = (k: RoomView['kind'] | undefined) => (k ? GAME_KIND_INFO[k]?.label ?? '' : game ? GAME_KIND_INFO[game.kind].label : '');

  const root = el('div', 'gl-board');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Live game board');
  root.tabIndex = -1;
  root.dataset.boardTheme = 'dark';

  const top = el('header', 'gl-top');
  const titleEl = el('p', 'gl-top__title');
  const slow = el('span', 'gl-chip-slow', 'Slow connection');
  slow.hidden = true;
  const codePill = el('p', 'gl-top__code');
  codePill.append('Code ', el('b', '', spacedCode(open.code)));
  top.append(titleEl, slow, codePill);

  const stage = el('main', 'gl-stage');
  const ranks = el('aside', 'gl-ranks');
  ranks.hidden = true;
  ranks.setAttribute('aria-label', 'Every rank (teacher)');
  const controls = el('div', 'gl-controls');
  controls.setAttribute('role', 'toolbar');
  controls.setAttribute('aria-label', 'Game controls');
  const pause = el('div', 'gl-pause gl-pause--board');
  pause.hidden = true;
  pause.append(el('b', '', 'Paused'), el('small', '', 'Eyes up here. We’ll carry on in a moment.'));
  const toastEl = el('div', 'gl-board__toast');
  toastEl.setAttribute('role', 'status');
  root.append(top, stage, ranks, pause, controls, toastEl);
  // The controls float over the board's foot; when a kind's buttons wrap them to two rows the stage
  // must stop above them, so the board's bottom padding follows their real height.
  const footObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => root.style.setProperty('--gl-controls-h', `${controls.offsetHeight}px`)) : null;
  footObserver?.observe(controls);

  let screen: Screen = 'connecting';
  let closed = false;
  let view: RoomView | null = null;
  let ranksOpen = false;
  let classWall = false;
  let showLb = false;
  let endArmed: ReturnType<typeof setTimeout> | null = null;
  let controlsSig = '';
  let ranksSig = '';
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let clockTimer: ReturnType<typeof setInterval> | null = null;
  let raceStarted = 0;
  const seen = new Set<string>();
  /** Paced results so far, for the class summary: item → right, answered. */
  const pacedTally = new Map<string, { right: number; answered: number; index: number }>();

  function toast(text: string, tone: 'plain' | 'bad' = 'plain'): void {
    toastEl.textContent = text;
    toastEl.dataset.tone = tone;
    toastEl.classList.add('is-shown');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-shown'), 2600);
  }

  const conn = connectRoom({
    wsBase: open.ws_base,
    room: open.room,
    ticket: open.board_ticket || open.teacher_ticket,
    ...(open.http_base ? { httpBase: open.http_base } : {}),
    ...options.connect,
    onMsg,
    onStatus
  });

  function control(op: ControlOp): void {
    primeSound();
    void conn.request({ t: 'control', op }).catch((e: unknown) => toast(e instanceof Error && e.message ? e.message : 'The room didn’t take that. Try again.', 'bad'));
  }
  /** A kind's own control (style 'custom'), from its view or the control bar. */
  function kindControl(name: string, data?: unknown): Promise<void> {
    primeSound();
    return conn.request({ t: 'control', op: { op: 'kind', name, ...(data !== undefined ? { data } : {}) } }).then(() => undefined);
  }

  function onStatus(s: RoomStatus, info: { slow: boolean }): void {
    slow.hidden = !info.slow || s === 'closed';
    root.dataset.link = s;
    if (s === 'reconnecting') toast('Reconnecting to the room…');
  }

  function onMsg(msg: ServerMsg, c: RoomConnection): void {
    if (closed) return;
    if (msg.t === 'error') toast(msg.message || 'The room had a problem.', 'bad');
    if (msg.t === 'replaced') {
      toast('This board opened somewhere else.', 'bad');
      return;
    }
    const v = c.view();
    if (v && (msg.t === 'snapshot' || msg.t === 'delta')) render(v);
  }

  /* ── Render by phase ──────────────────────────────────────────── */

  function render(v: RoomView): void {
    const prev = view;
    view = v;
    // The room's board_view wins when it sends one (a second board follows the first).
    if (v.board_view && v.board_view !== prev?.board_view) classWall = v.board_view === 'class_wall';
    root.classList.toggle('gm-calm', calm());
    root.dataset.phase = v.phase;
    root.dataset.style = v.style;
    const label = kindLabel(v.kind);
    const name = v.title || game?.title || '';
    titleEl.replaceChildren(el('b', '', label), ...(name && !name.startsWith(label) ? [` · ${name}`] : name !== label ? [name.slice(label.length)] : []));
    codePill.hidden = v.phase === 'lobby';
    pause.hidden = v.phase !== 'paused';
    if (v.phase === 'lobby') {
      if (screen !== 'lobby') buildLobby();
      paintLobby(v);
    } else if (v.phase === 'countdown') {
      if (screen !== 'countdown') buildCountdown(v);
    } else if (v.phase === 'playing' || v.phase === 'paused') {
      if (v.style === 'custom') {
        if (screen !== 'custom') buildCustom(v);
        paintCustom(v);
      } else if (v.style === 'paced') {
        if (screen !== 'paced') buildPaced();
        paintPaced(v, prev);
      } else {
        if (screen !== 'race') buildRace(v);
        paintRace(v);
      }
    } else if (screen === 'custom' && kindView) {
      // The kind's last screen (its final reveal) stays up a moment, then the podium.
      paintCustom(v);
      endTimer ??= setTimeout(() => {
        if (!closed && view) buildEnded(view);
      }, calm() ? 1200 : KIND_END_MS);
    } else {
      if (screen !== 'ended') buildEnded(v);
    }
    paintRanks();
    paintControls();
  }

  /* ── Lobby ────────────────────────────────────────────────────── */

  let lobbyChips: HTMLElement | null = null;
  let lobbyCount: HTMLElement | null = null;

  function buildLobby(): void {
    screen = 'lobby';
    stopClock();
    disposeKind();
    const wrap = el('div', 'gl-lobby');
    const hero = el('div', 'gl-lobby__hero');
    hero.append(el('span', 'gl-eyebrow', `Live game · ${kindLabel(view?.kind)}`), el('h2', 'gl-lobby__title', view?.title || game?.title || 'Live game'));
    const join = el('div', 'gl-join-card');
    const qr = el('div', 'gl-qr');
    const url = joinUrl(open);
    try {
      qr.innerHTML = qrSvg(url, `QR code: ${url}`);
    } catch {
      qr.hidden = true;
    }
    const code = el('div', 'gl-join-card__code');
    const go = el('small');
    // The class site has no page of its own for codes: students join from inside the lesson.
    go.append('Scan, or open this lesson and tap ', el('span', '', 'Join live game'));
    const big = el('b', '', spacedCode(open.code));
    big.setAttribute('aria-label', `Code ${open.code.split('').join(' ')}`);
    code.append(go, big);
    join.append(qr, code);
    lobbyCount = el('p', 'gl-lobby__count');
    hero.append(join, lobbyCount);
    lobbyChips = el('div', 'gl-lobby__chips');
    lobbyChips.setAttribute('aria-label', 'Who’s here');
    lobbyChips.setAttribute('aria-live', 'polite');
    wrap.append(hero, lobbyChips);
    stage.replaceChildren(wrap);
    void enter(hero);
    seen.clear();
  }

  function lobbyChip(s: Seat): HTMLElement {
    const chip = el('span', 'gl-chip');
    chip.dataset.owner = s.owner;
    chip.append(avatar(s.initials), el('span', 'gl-chip__i', s.initials));
    if (!seen.has(s.owner)) {
      seen.add(s.owner);
      sfx.ding();
      void animate(
        chip,
        [
          { transform: 'translate(-30vw, -12vh) scale(0.3) rotate(-25deg)', opacity: 0 },
          { transform: 'scale(1.15)', opacity: 1, offset: 0.7 },
          { transform: 'none', opacity: 1 }
        ],
        { duration: 750 }
      );
    }
    return chip;
  }

  /* Team games: one column per team. Drag a chip to another team, or tap it, then tap the team. */
  let picked: string | null = null;
  let teamsSig = '';
  function paintTeamLobby(v: RoomView, teams: NonNullable<RoomView['teams']>): void {
    if (!lobbyChips) return;
    lobbyChips.classList.add('gl-teams');
    lobbyChips.style.setProperty('--n', String(teams.length));
    const sig = `${picked ?? ''}|${teams.map((t) => t.team).join(',')}|${v.seats.map((s) => `${s.owner}:${s.team}:${s.connected ? 1 : 0}`).join(',')}`;
    if (sig === teamsSig) return;
    teamsSig = sig;
    const move = (owner: string, team: number) => {
      picked = null;
      teamsSig = '';
      const seat = v.seats.find((s) => s.owner === owner);
      if (seat && seat.team !== team) control({ op: 'move_team', owner, team });
      else if (view) paintLobby(view);
    };
    const cols = teams.map((t) => {
      const col = el('section', 'gl-team');
      col.dataset.team = String(t.team);
      col.style.setProperty('--gl-team', teamColour(t.team));
      col.style.setProperty('--gl-team-soft', teamColour(t.team, true));
      const members = v.seats.filter((s) => s.team === t.team);
      const head = el('button', 'gl-team__head');
      head.type = 'button';
      head.append(teamBadge(t.team), el('b', '', t.name), el('small', '', String(members.length)));
      head.setAttribute('aria-label', picked ? `Move ${v.seats.find((s) => s.owner === picked)?.initials ?? ''} to the ${t.name}` : `${t.name}, ${members.length} players`);
      head.addEventListener('click', () => picked && move(picked, t.team));
      const list = el('div', 'gl-team__list');
      for (const s of members) {
        const chip = lobbyChip(s);
        chip.classList.toggle('is-away', !s.connected);
        chip.classList.toggle('is-picked', picked === s.owner);
        chip.setAttribute('role', 'button');
        chip.tabIndex = 0;
        chip.draggable = true;
        chip.setAttribute('aria-label', `${s.initials}, ${t.name}. Press to move to another team.`);
        const pick = () => {
          picked = picked === s.owner ? null : s.owner;
          teamsSig = '';
          if (picked) toast(`Tap a team to move ${s.initials}`);
          if (view) paintLobby(view);
        };
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          pick();
        });
        chip.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            pick();
          }
        });
        chip.addEventListener('dragstart', (e) => {
          e.dataTransfer?.setData('text/plain', s.owner);
          chip.classList.add('is-dragging');
        });
        chip.addEventListener('dragend', () => chip.classList.remove('is-dragging'));
        list.append(chip);
      }
      col.append(head, list);
      col.addEventListener('click', () => picked && move(picked, t.team));
      col.addEventListener('dragover', (e) => {
        e.preventDefault();
        col.classList.add('is-over');
      });
      col.addEventListener('dragleave', () => col.classList.remove('is-over'));
      col.addEventListener('drop', (e) => {
        e.preventDefault();
        col.classList.remove('is-over');
        const owner = e.dataTransfer?.getData('text/plain');
        if (owner) move(owner, t.team);
      });
      return col;
    });
    lobbyChips.replaceChildren(...cols);
  }

  function paintLobby(v: RoomView): void {
    if (!lobbyChips || !lobbyCount) return;
    const here = v.seats.filter((s) => s.connected);
    lobbyCount.replaceChildren(el('b', '', String(here.length)), ` ${here.length === 1 ? 'player' : 'players'} here`);
    if (v.teams?.length) {
      paintTeamLobby(v, v.teams);
      return;
    }
    const keep = new Set(v.seats.map((s) => s.owner));
    for (const chip of [...lobbyChips.children] as HTMLElement[]) if (!keep.has(chip.dataset.owner ?? '')) chip.remove();
    for (const s of v.seats) {
      let chip = lobbyChips.querySelector<HTMLElement>(`[data-owner="${CSS.escape(s.owner)}"]`);
      if (!chip) {
        chip = lobbyChip(s);
        lobbyChips.append(chip);
      }
      chip.classList.toggle('is-away', !s.connected);
    }
  }

  /* ── Countdown ────────────────────────────────────────────────── */

  function buildCountdown(v: RoomView): void {
    screen = 'countdown';
    stopClock();
    disposeKind();
    const wrap = el('div', 'gl-countdown');
    const ring = createRing('gl-ring--xl');
    wrap.append(el('span', 'gl-eyebrow', 'Get ready'), ring.root);
    stage.replaceChildren(wrap);
    ring.run(v.ends_at ?? conn.serverNow() + ROOM_LIMITS.countdownMs, ROOM_LIMITS.countdownMs, () => conn.serverNow());
    sfx.fanfare();
  }

  /* ── Race wall ────────────────────────────────────────────────── */

  let wall: HTMLElement | null = null;
  let raceSub: HTMLElement | null = null;
  let raceClock: HTMLElement | null = null;
  let ticker: HTMLElement | null = null;
  let tickerTop = '';
  let raceLb: Leaderboard | null = null;
  let classWallHost: HTMLElement | null = null;

  function buildRace(v: RoomView): void {
    screen = 'race';
    const wrap = el('div', 'gl-race');
    const head = el('div', 'gl-race__head');
    raceSub = el('span', 'gl-race__sub');
    raceClock = el('span', 'gl-race__clock');
    head.append(el('h2', 'gl-race__h', 'The race'), raceSub, raceClock);
    wall = el('div', 'gl-wall');
    wall.setAttribute('aria-label', 'Race progress, initials only');
    const side = el('section', 'gl-race__side');
    raceLb = createLeaderboard();
    side.append(el('h3', 'gl-side__h', 'Top five'), raceLb.root);
    ticker = el('div', 'gl-ticker');
    ticker.setAttribute('aria-live', 'polite');
    tickerTop = '';
    classWallHost = el('div', 'gl-classwall');
    classWallHost.hidden = true;
    const body = el('div', 'gl-race__body');
    body.append(wall, side);
    wrap.append(head, body, classWallHost, ticker);
    stage.replaceChildren(wrap);
    if (!raceStarted) raceStarted = Date.now();
    startClock();
    if (v.kind === 'connections') wrap.append(connectionsLegend());
  }

  function connectionsLegend(): HTMLElement {
    const legend = el('div', 'gl-legend');
    [1, 2, 3, 4].forEach((d) => {
      const s = el('span');
      const sw = el('i', `gl-sw gl-sw--${d}`);
      s.append(sw, d === 1 ? 'Easiest' : d === 4 ? 'Trickiest' : '');
      legend.append(s);
    });
    return legend;
  }

  function seatCard(s: Seat, kind: RoomView['kind']): HTMLElement {
    const card = el('div', 'gl-card');
    card.dataset.owner = s.owner;
    const who = el('div', 'gl-card__who');
    who.append(avatar(s.initials), el('span', 'gl-card__i', s.initials));
    if (kind === 'connections') {
      const miss = el('span', 'gl-card__miss');
      miss.setAttribute('aria-label', 'Mistakes left');
      who.append(miss);
      card.append(who, el('div', 'gl-slots'));
    } else {
      const cnt = el('span', 'gl-card__cnt');
      who.append(cnt);
      card.append(who, el('div', 'gl-segs'));
    }
    return card;
  }

  function paintCard(card: HTMLElement, s: Seat, kind: RoomView['kind']): void {
    const p = s.progress ?? { done: s.score, total: 0 };
    const was = Number(card.dataset.done ?? '-1');
    card.dataset.done = String(p.done);
    card.classList.toggle('is-done', !!s.finished);
    card.classList.toggle('is-away', !s.connected);
    if (kind === 'connections') {
      const slots = card.querySelector('.gl-slots')!;
      const groups = p.groups ?? [];
      if (slots.children.length !== 4) slots.replaceChildren(...[0, 1, 2, 3].map(() => el('i')));
      [...slots.children].forEach((n, k) => {
        const d = groups[k];
        const cls = d ? `gl-sw--${d}` : '';
        if (n.className !== cls) {
          n.className = cls;
          if (d && was !== -1) void animate(n, [{ transform: 'scaleX(0)' }, { transform: 'none' }], { duration: 450 });
        }
      });
      const max = p.mistakes_max ?? 4;
      const left = Math.max(0, max - (p.mistakes ?? 0));
      const miss = card.querySelector('.gl-card__miss')!;
      if (miss.children.length !== max) miss.replaceChildren(...Array.from({ length: max }, () => el('i')));
      [...miss.children].forEach((n, k) => n.classList.toggle('is-gone', k >= left));
      miss.setAttribute('aria-label', `${left} mistakes left`);
    } else {
      const cnt = card.querySelector('.gl-card__cnt')!;
      cnt.replaceChildren(el('b', '', String(p.done)), p.total ? ` / ${p.total}` : '');
      const segs = card.querySelector<HTMLElement>('.gl-segs')!;
      const n = Math.min(p.total || 1, 16);
      if (segs.children.length !== n) segs.replaceChildren(...Array.from({ length: n }, () => el('i')));
      segs.style.setProperty('--n', String(n));
      const on = p.total > 16 ? Math.round((p.done / p.total) * n) : p.done;
      [...segs.children].forEach((seg, k) => {
        const lit = k < on;
        if (lit && !seg.classList.contains('is-on') && was !== -1) void animate(seg, [{ transform: 'scaleX(0)' }, { transform: 'none' }], { duration: 450, calmFade: false });
        seg.classList.toggle('is-on', lit);
      });
    }
    if (was !== -1 && p.done > was) void animate(card, [{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }], { duration: 420, calmFade: false });
    if (s.finished && card.dataset.fin !== '1') {
      card.dataset.fin = '1';
      const fin = el('span', 'gl-card__fin', 'Done');
      card.append(fin);
      if (was !== -1) {
        sfx.ding();
        void animate(card, [{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 600, calmFade: false });
      }
    }
  }

  function paintRace(v: RoomView): void {
    if (!wall || !raceSub || !ticker || !raceLb) return;
    const finished = v.seats.filter((s) => s.finished).length;
    raceSub.textContent = `${finished} of ${v.seats.length} finished · answers stay hidden`;
    const keep = new Set(v.seats.map((s) => s.owner));
    for (const c of [...wall.children] as HTMLElement[]) if (!keep.has(c.dataset.owner ?? '')) c.remove();
    v.seats.forEach((s) => {
      let card = wall!.querySelector<HTMLElement>(`[data-owner="${CSS.escape(s.owner)}"]`);
      if (!card) {
        card = seatCard(s, v.kind);
        wall!.append(card);
      }
      paintCard(card, s, v.kind);
    });
    wall.dataset.count = String(v.seats.length);
    raceLb.update(v.leaderboard);
    paintTicker(v);
    paintClassWall(v);
  }

  function paintTicker(v: RoomView): void {
    if (!ticker) return;
    const first = v.ticker[0];
    const key = first ? `${first.initials}|${first.text}|${first.at}` : '';
    if (key === tickerTop && ticker.childNodes.length) return;
    tickerTop = key;
    const label = el('span', 'gl-ticker__lbl', KIND_TICKER[v.kind] ?? 'First to solve');
    if (!v.ticker.length) {
      ticker.replaceChildren(label, el('span', 'gl-ticker__empty', 'Firsts appear here. Answers stay hidden.'));
      return;
    }
    const pills = v.ticker.slice(0, 4).map((t) => {
      const p = el('span', 'gl-pill');
      // The room names no one ("found the purple group"); initials only if a later style sends them.
      p.append(t.text);
      if (t.initials) p.append(' ', el('b', '', t.initials));
      return p;
    });
    ticker.replaceChildren(label, ...pills);
    void animate(pills[0], [{ opacity: 0, transform: 'translateX(-30px) scale(0.9)' }, { opacity: 1, transform: 'none' }], { duration: 500 });
  }

  function paintClassWall(v: RoomView): void {
    if (!classWallHost) return;
    const on = classWall && v.kind === 'connections';
    classWallHost.hidden = !on;
    stage.querySelector('.gl-race__body')?.toggleAttribute('hidden', on);
    if (!on) return;
    const pairs = (v.class_wall ?? []).slice().sort((a, b) => b.count - a.count).slice(0, 6);
    const head = el('div', 'gl-classwall__head');
    head.append(el('span', 'gl-eyebrow', 'What we mixed up most'), el('p', 'gl-classwall__note', 'Tiles people put in the same guess that belonged to different groups. Thicker means more often. No names.'));
    const list = el('div', 'gl-classwall__list');
    const max = Math.max(1, ...pairs.map((p) => p.count));
    if (!pairs.length) list.append(el('p', 'gl-classwall__note', 'No mix-ups yet.'));
    for (const p of pairs) {
      const row = el('div', 'gl-classwall__row');
      const link = el('i', 'gl-classwall__link');
      link.style.setProperty('--w', String(2 + (p.count / max) * 10));
      row.append(el('span', 'gl-tile', p.a), link, el('span', 'gl-tile', p.b), el('b', 'gl-classwall__n', `${p.count}×`));
      list.append(row);
    }
    classWallHost.replaceChildren(head, list);
  }

  function startClock(): void {
    stopClock();
    const tick = () => {
      if (raceClock) raceClock.replaceChildren(el('small', '', 'Elapsed'), el('b', '', clock(Date.now() - raceStarted)));
    };
    tick();
    clockTimer = setInterval(tick, 1000);
  }
  function stopClock(): void {
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = null;
  }

  /* ── Paced (Who said it?) ─────────────────────────────────────── */

  const cast = (game?.cast ?? []).filter((c) => c.id !== FAKE_SPEAKER);
  const looks = castLooks(cast);
  const quotes = new Map((game?.items ?? []).flatMap((i) => (i.shape === 'quote' ? [[i.id, i.text] as const] : [])));
  const lookOf = (id: string): Look | 'fake' => (id === FAKE_SPEAKER ? 'fake' : looks.get(id) ?? { hat: 0, prop: 0, tone: 1 });
  const nameOf = (id: string | null | undefined) => (id === FAKE_SPEAKER ? 'Nobody' : cast.find((c) => c.id === id)?.name || 'Someone');

  let pacedWrap: HTMLElement | null = null;
  let pacedItem: string | null = null;
  let pacedRing: Ring | null = null;
  let pacedQuote: HTMLElement | null = null;
  let pacedSrc: HTMLElement | null = null;
  let pacedCast: HTMLElement | null = null;
  let pacedLocked: HTMLElement | null = null;
  let pacedRevealed = false;
  let typing = 0;
  let pacedLb: Leaderboard | null = null;

  function buildPaced(): void {
    screen = 'paced';
    stopClock();
    pacedItem = null;
    pacedWrap = el('div', 'gl-paced-board');
    stage.replaceChildren(pacedWrap);
  }

  function buildItem(item: PacedItem): void {
    if (!pacedWrap) return;
    pacedItem = item.item;
    pacedRevealed = false;
    showLb = false;
    const head = el('div', 'gl-q');
    head.append(el('span', 'gl-eyebrow', `Quote ${item.index + 1} of ${item.of} · who said it?`));
    pacedQuote = el('p', 'gl-q__text');
    const text = `“${quotes.get(item.item) ?? 'Quote'}”`;
    pacedQuote.append(el('span', 'gl-q__ghost', text));
    const typed = el('span', 'gl-q__typed');
    typed.setAttribute('aria-hidden', 'true');
    pacedQuote.append(typed);
    pacedQuote.setAttribute('aria-label', text);
    pacedSrc = el('div', 'gl-q__src');
    head.append(pacedQuote, pacedSrc);
    pacedRing = createRing('gl-ring--q');
    pacedCast = el('div', 'gl-cast');
    pacedCast.style.setProperty('--n', String(cast.length + 1));
    [...cast.map((c) => c.id), FAKE_SPEAKER].forEach((id, k) => {
      const card = el('div', `gl-cc${id === FAKE_SPEAKER ? ' gl-cc--fake' : ''}`);
      card.dataset.k = id;
      const flipEl = el('div', 'gl-cc__flip');
      const front = el('div', 'gl-cc__face gl-cc__front');
      const member = cast.find((c) => c.id === id);
      front.append(cameo(lookOf(id), member?.emblem), el('span', 'gl-cc__nm', id === FAKE_SPEAKER ? 'Nobody' : member?.name ?? ''), el('span', 'gl-cc__rl', id === FAKE_SPEAKER ? 'It’s fake' : ''));
      const dist = el('span', 'gl-cc__dist');
      const barEl = el('span', 'gl-cc__bar');
      barEl.append(el('i'));
      dist.append(barEl, el('b', '', '0'));
      front.append(dist);
      const back = el('div', 'gl-cc__face gl-cc__back');
      flipEl.append(front, back);
      card.append(flipEl);
      pacedCast!.append(card);
      void animate(card, [{ opacity: 0, transform: 'translateY(60px) rotate(-3deg) scale(0.92)' }, { opacity: 1, transform: 'none' }], { duration: 650, delay: 200 + 90 * k, fill: 'backwards' });
    });
    pacedLocked = el('div', 'gl-locked');
    pacedWrap.replaceChildren(head, pacedRing.root, pacedCast, pacedLocked);
    pacedWrap.classList.remove('is-closed', 'is-lb');
    void typeOn(typed, text);
  }

  async function typeOn(target: HTMLElement, full: string): Promise<void> {
    const mine = (typing += 1);
    if (calm()) {
      target.textContent = full;
      return;
    }
    const out = el('span');
    const caret = el('i', 'gl-q__caret');
    target.replaceChildren(out, caret);
    await new Promise((r) => setTimeout(r, 450));
    for (let n = 1; n <= full.length; n += 1) {
      if (mine !== typing || closed) return;
      out.textContent = full.slice(0, n);
      if (n % 3 === 0 && full[n - 1] !== ' ') sfx.click();
      await new Promise((r) => setTimeout(r, /[,.:;!?]/.test(full[n - 1]) ? 160 : 26));
    }
    setTimeout(() => caret.remove(), 900);
  }

  function paintPaced(v: RoomView, prev: RoomView | null): void {
    if (!pacedWrap) return;
    const item = v.item;
    if (!item) {
      pacedItem = null;
      if (showLb) paintPacedLb(v);
      else {
        const w = el('div', 'gl-interlude');
        w.append(el('span', 'gl-eyebrow', 'Who said it?'), el('h2', 'gl-lobby__title', v.title || game?.title || ''), el('p', 'gl-race__sub', `${v.seats.length} playing · next quote coming`));
        pacedWrap.replaceChildren(w);
      }
      return;
    }
    if (item.item !== pacedItem) buildItem(item);
    if (showLb) {
      paintPacedLb(v);
      return;
    }
    if (pacedWrap.classList.contains('is-lb')) {
      // Back from the leaderboard to the revealed quote.
      pacedItem = null;
      buildItem(item);
    }
    // Locked-in count and dots.
    if (pacedLocked) {
      const students = v.seats.length;
      const n = item.answered.length;
      const dots = el('span', 'gl-dots');
      for (let k = 0; k < students; k += 1) dots.append(el('i', k < n ? 'is-on' : ''));
      pacedLocked.replaceChildren(el('span', '', `${n} / ${students} locked in`), dots);
    }
    const timeUp = conn.serverNow() >= item.ends_at;
    if (item.revealed) {
      if (!pacedRevealed) reveal(item);
      pacedRing?.hold(0, 0);
    } else if (v.phase === 'paused') {
      const left = v.paused_left_ms ?? Math.max(0, item.ends_at - conn.serverNow());
      pacedRing?.hold(Math.ceil(left / 1000), left / Math.max(1, item.ends_at - item.opened_at));
    } else {
      pacedRing?.run(item.ends_at, item.ends_at - item.opened_at, () => conn.serverNow(), () => {
        pacedWrap?.classList.add('is-closed');
        paintControls();
      });
    }
    pacedWrap.classList.toggle('is-closed', timeUp || !!item.revealed);
    if (prev?.item?.ends_at && prev.item.item === item.item && item.ends_at > prev.item.ends_at && !item.revealed) toast(`+${Math.round((item.ends_at - prev.item.ends_at) / 1000)} seconds`);
  }

  function reveal(item: PacedItem): void {
    if (!pacedCast || !item.revealed) return;
    pacedRevealed = true;
    const counts = item.revealed.counts;
    const speaker = item.revealed.reveal?.speaker ?? null;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const right = speaker ? counts[speaker] ?? 0 : 0;
    if (!pacedTally.has(item.item)) pacedTally.set(item.item, { right, answered: total, index: item.index });
    const max = Math.max(1, ...Object.values(counts));
    sfx.reveal();
    [...pacedCast.children].forEach((card, k) => {
      const id = (card as HTMLElement).dataset.k ?? '';
      const val = counts[id] ?? 0;
      const fill = card.querySelector<HTMLElement>('.gl-cc__bar i')!;
      const num = card.querySelector<HTMLElement>('.gl-cc__dist b')!;
      setTimeout(() => {
        fill.style.transform = `scaleX(${(val / max).toFixed(3)})`;
        countUp(num, 0, val, 800);
      }, calm() ? 0 : k * 90);
    });
    pacedWrap?.classList.add('is-closed');
    const flipAt = calm() ? 0 : 1100;
    setTimeout(() => {
      if (closed || pacedItem !== item.item || !pacedCast) return;
      const fake = speaker === FAKE_SPEAKER;
      const card = speaker ? pacedCast.querySelector<HTMLElement>(`.gl-cc[data-k="${CSS.escape(speaker)}"]`) : null;
      if (card) {
        const back = card.querySelector('.gl-cc__back')!;
        const src = item.revealed?.reveal?.source;
        const said = el('span', 'gl-cc__said', fake ? 'Nobody said it' : 'Said it');
        const got = el('small', '', `${right} of ${total || view?.seats.length || 0} ${fake ? 'caught it' : 'got it'}`);
        const where = el('span', 'gl-cc__src');
        where.append(fake ? 'It’s fake' : src ?? '', got);
        back.replaceChildren(said, cameo(lookOf(speaker!)), el('span', 'gl-cc__nm', fake ? 'Nobody' : nameOf(speaker)), where);
        pacedCast.querySelectorAll('.gl-cc').forEach((n) => n.classList.add(n === card ? 'is-right' : 'is-dim'));
      }
      if (pacedSrc) {
        const tag = el('span', 'gl-q__tag', fake ? 'Fake' : 'Real');
        const why = item.revealed?.reveal?.why_fake;
        const line = el('span', 'gl-q__line');
        if (fake) line.textContent = why ?? 'Nobody in the text says this.';
        else line.append(el('b', '', nameOf(speaker)), item.revealed?.reveal?.source ? ` · ${item.revealed.reveal.source}` : '');
        pacedSrc.replaceChildren(tag, line);
        pacedSrc.classList.toggle('is-fake', fake);
        void animate(pacedSrc, [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: 600, fill: 'both' });
      }
      paintControls();
    }, flipAt);
  }

  function paintPacedLb(v: RoomView): void {
    if (!pacedWrap) return;
    if (!pacedWrap.classList.contains('is-lb')) {
      pacedWrap.classList.add('is-lb');
      const box = el('div', 'gl-lbscreen');
      pacedLb = pacedLb ?? createLeaderboard();
      box.append(el('h2', 'gl-lbscreen__h', 'Top five'), pacedLb.root);
      pacedWrap.replaceChildren(box);
    }
    pacedLb?.update(v.leaderboard);
  }

  /* ── Custom kinds (their own board view) ─────────────────────── */

  let kindView: KindView | null = null;
  let kindHost: HTMLElement | null = null;
  let kindLbBox: HTMLElement | null = null;
  let kindLb: Leaderboard | null = null;
  let endTimer: ReturnType<typeof setTimeout> | null = null;

  const kindApi: KindViewApi = {
    move: () => Promise.reject(new Error('The board doesn’t make moves.')),
    control: (name, data) => kindControl(name, data),
    serverNow: () => conn.serverNow(),
    calm,
    sfx,
    toast: (text, tone) => toast(text, tone === 'bad' ? 'bad' : 'plain'),
    owner: 'board'
  };

  function disposeKind(): void {
    try {
      kindView?.dispose();
    } catch {
      // A kind's own tidy-up must not stop the board.
    }
    kindView = null;
    kindHost = null;
    kindLbBox = null;
    if (endTimer) clearTimeout(endTimer);
    endTimer = null;
  }

  function buildCustom(v: RoomView): void {
    screen = 'custom';
    stopClock();
    disposeKind();
    showLb = false;
    const wrap = el('div', 'gl-kind');
    kindHost = el('div', 'gl-kind__stage');
    kindLbBox = el('div', 'gl-kind__lb');
    kindLbBox.hidden = true;
    wrap.append(kindHost, kindLbBox);
    stage.replaceChildren(wrap);
    const live = liveKind(v.kind);
    if (!live) {
      const box = el('div', 'gl-interlude');
      box.append(el('span', 'gl-eyebrow', kindLabel(v.kind)), el('h2', 'gl-lobby__title', 'This game’s screens are coming'), el('p', 'gl-race__sub', 'The room is running, but this board can’t show this game yet. You can end it from the controls.'));
      kindHost.append(box);
      return;
    }
    try {
      kindView = live.board(kindHost, kindApi);
    } catch {
      kindView = null;
      kindHost.replaceChildren(el('p', 'gl-race__sub', 'This game’s board couldn’t open. End the game and try again.'));
    }
  }

  function paintCustom(v: RoomView): void {
    try {
      kindView?.update(v);
    } catch {
      // One bad paint must not take the board down; the next view tries again.
    }
    if (kindLbBox) {
      kindLbBox.hidden = !showLb;
      if (showLb) {
        if (!kindLb || !kindLbBox.contains(kindLb.root)) {
          kindLb = createLeaderboard({ title: v.teams?.length ? 'Teams' : 'Top five' });
          kindLbBox.replaceChildren(el('h2', 'gl-lbscreen__h', v.teams?.length ? 'Teams' : 'Top five'), kindLb.root);
        }
        kindLb.update(v.leaderboard);
      }
    }
  }

  /** The kind's own buttons for the control bar, while it plays. */
  function kindButtons(v: RoomView): KindButton[] {
    if (v.style !== 'custom' || v.phase !== 'playing' || !kindView?.controls) return [];
    try {
      return kindView.controls(v) ?? [];
    } catch {
      return [];
    }
  }
  function runKindButton(c: KindButton): void {
    void kindControl(c.name, c.data).catch((e: unknown) => toast(e instanceof Error && e.message ? e.message : 'The room didn’t take that. Try again.', 'bad'));
  }

  /* ── Ended: podium ────────────────────────────────────────────── */

  function summary(v: RoomView): string {
    if (v.style === 'paced') {
      const rows = [...pacedTally.values()];
      const answered = rows.reduce((a, r) => a + r.answered, 0);
      const right = rows.reduce((a, r) => a + r.right, 0);
      if (!answered) return '';
      const hardest = rows.filter((r) => r.answered).sort((a, b) => a.right / a.answered - b.right / b.answered)[0];
      return `Class got ${Math.round((right / answered) * 100)}%${hardest ? ` · hardest: quote ${hardest.index + 1}` : ''}`;
    }
    // Race wording only: custom kinds use seat progress for their own things (quick checks, steps).
    if (v.style !== 'race') return '';
    const total = v.seats.reduce((a, s) => a + (s.progress?.total ?? 0), 0);
    const done = v.seats.reduce((a, s) => a + (s.progress?.done ?? 0), 0);
    const fin = v.seats.filter((s) => s.finished).length;
    return total ? `Class solved ${Math.round((done / total) * 100)}% · ${fin} of ${v.seats.length} finished` : '';
  }

  /** Rows after the podium: places 4–5, or every other team. */
  const r0 = (v: RoomView) => (v.teams?.length ? v.teams.length : 5);

  function buildEnded(v: RoomView): void {
    screen = 'ended';
    stopClock();
    disposeKind();
    typing += 1;
    const wrap = el('div', 'gl-end');
    const head = el('div', 'gl-end__head');
    head.append(el('span', 'gl-eyebrow', 'Final scores'));
    const line = summary(v);
    if (line) head.append(el('p', 'gl-end__sum', line));
    const lb = v.leaderboard.slice().sort((a, b) => a.rank - b.rank);
    const podium = el('div', 'gl-podium');
    const order: Array<[number, string]> = [
      [1, 'p2'],
      [0, 'p1'],
      [2, 'p3']
    ];
    const pods: HTMLElement[] = [];
    for (const [i, cls] of order) {
      const r = lb[i];
      // Two teams (or two players) stand on two steps: no empty third step.
      if (!r && i > 0) continue;
      const pod = el('div', `gl-pod gl-pod--${cls}`);
      if (r && r.team !== undefined) {
        // Team games: the teams rise, with their members' initials.
        pod.style.setProperty('--gl-team', teamColour(r.team));
        pod.classList.add('is-team');
        const members = v.teams?.find((t) => t.team === r.team)?.members ?? [];
        pod.append(teamBadge(r.team, 'gl-av--xl'), el('span', 'gl-pod__name', r.initials), el('span', 'gl-pod__score', `${r.score.toLocaleString('en-AU')} pts`));
        if (members.length) pod.append(el('span', 'gl-pod__members', members.join(' · ')));
      } else if (r) {
        pod.append(avatar(r.initials, 'gl-av--xl'), el('span', 'gl-pod__name', r.initials), el('span', 'gl-pod__score', v.style !== 'race' ? `${r.score.toLocaleString('en-AU')} pts` : `${r.score}`));
      }
      pod.append(el('div', 'gl-pod__block', String(i + 1)));
      podium.append(pod);
      pods.push(pod);
    }
    const also = el('div', 'gl-also');
    lb.slice(3, r0(v)).forEach((r) => {
      const row = el('div', 'gl-lb__row');
      row.append(el('span', 'gl-lb__rank', String(r.rank)), r.team !== undefined ? teamBadge(r.team) : avatar(r.initials), el('span', 'gl-lb__name', r.initials), el('span', 'gl-lb__pts', String(r.score)));
      also.append(row);
    });
    wrap.append(head, podium, also);
    stage.replaceChildren(wrap);
    const delays = [400, 1100, 0];
    pods.forEach((p, k) => void animate(p, [{ transform: 'translateY(100%)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 900, delay: delays[k], fill: 'backwards' }));
    [...also.children].forEach((r, k) => void animate(r, [{ opacity: 0, transform: 'translateX(-40px)' }, { opacity: 1, transform: 'none' }], { duration: 500, delay: 1700 + k * 150, fill: 'backwards' }));
    sfx.reveal();
    setTimeout(() => {
      if (closed) return;
      sfx.fanfare();
      void confetti(root);
    }, calm() ? 0 : 1300);
  }

  /* ── Teacher ranks ────────────────────────────────────────────── */

  const kickArmed = new Set<string>();
  function paintRanks(): void {
    ranks.hidden = !ranksOpen;
    if (!ranksOpen || !view) return;
    const rows = view.seats.slice().sort((a, b) => b.score - a.score || a.initials.localeCompare(b.initials));
    // Same reason as the controls: don't rebuild under a click.
    const sig = rows.map((s) => `${s.owner}:${s.score}:${s.connected ? 1 : 0}:${kickArmed.has(s.owner) ? 1 : 0}`).join(',');
    if (sig === ranksSig) return;
    ranksSig = sig;
    const head = el('div', 'gl-ranks__head');
    head.append(el('span', 'gl-eyebrow', 'Teacher · every rank'), el('p', 'gl-ranks__note', 'Close this before turning the projector on if you want only the top five showing.'));
    const list = el('ol', 'gl-ranks__list');
    rows.forEach((s, i) => {
      const li = el('li', `gl-ranks__row${s.connected ? '' : ' is-away'}`);
      li.dataset.owner = s.owner;
      const kick = el('button', 'gl-ranks__kick', kickArmed.has(s.owner) ? 'Sure? Remove' : 'Remove');
      kick.type = 'button';
      kick.setAttribute('aria-label', `Remove ${s.initials} from the game`);
      kick.addEventListener('click', () => {
        if (!kickArmed.has(s.owner)) {
          kickArmed.add(s.owner);
          paintRanks();
          setTimeout(() => {
            kickArmed.delete(s.owner);
            paintRanks();
          }, 4000);
          return;
        }
        kickArmed.delete(s.owner);
        control({ op: 'kick', owner: s.owner });
      });
      li.append(el('span', 'gl-ranks__n', ordinal(i + 1)), avatar(s.initials), el('span', 'gl-ranks__i', s.initials), el('span', 'gl-ranks__s', String(s.score)), kick);
      list.append(li);
    });
    const shut = el('button', 'gl-btn', 'Close');
    shut.type = 'button';
    shut.addEventListener('click', () => toggleRanks(false));
    ranks.replaceChildren(head, rows.length ? list : el('p', 'gl-ranks__note', 'Nobody has joined yet.'), shut);
  }

  function toggleRanks(on = !ranksOpen): void {
    ranksOpen = on;
    paintRanks();
    paintControls();
  }

  /* ── Controls ─────────────────────────────────────────────────── */

  function btn(text: string, onClick: () => void, opts: { primary?: boolean; key?: string; pressed?: boolean; label?: string } = {}): HTMLButtonElement {
    const b = el('button', `gl-btn${opts.primary ? ' gl-btn--primary' : ''}`, text);
    b.type = 'button';
    if (opts.key) b.setAttribute('aria-keyshortcuts', opts.key);
    if (opts.pressed !== undefined) b.setAttribute('aria-pressed', String(opts.pressed));
    if (opts.label) b.setAttribute('aria-label', opts.label);
    b.addEventListener('click', () => {
      sfx.click();
      onClick();
    });
    return b;
  }

  function primaryAction(): (() => void) | null {
    const v = view;
    if (!v) return null;
    if (v.phase === 'lobby') return () => control({ op: 'start' });
    if (v.phase === 'paused') return () => control({ op: 'resume' });
    if (v.phase === 'playing' && v.style === 'custom') {
      const main = kindButtons(v).find((c) => c.primary);
      return main ? () => runKindButton(main) : null;
    }
    if (v.phase !== 'playing' || v.style !== 'paced') return null;
    const item = v.item;
    if (item && !item.revealed) return () => control({ op: 'reveal' });
    if (!item || item.revealed) return item && item.index >= item.of - 1 ? () => control({ op: 'end' }) : () => control({ op: 'next' });
    return null;
  }

  function endButton(): HTMLButtonElement {
    const b = btn(endArmed ? 'Sure? End game' : 'End', () => {
      if (!endArmed) {
        endArmed = setTimeout(() => {
          endArmed = null;
          paintControls();
        }, 4000);
        paintControls();
        return;
      }
      clearTimeout(endArmed);
      endArmed = null;
      control({ op: 'end' });
    }, { key: 'E' });
    if (endArmed) b.classList.add('is-armed');
    return b;
  }

  function paintControls(): void {
    const v = view;
    const list: HTMLElement[] = [];
    if (v?.phase === 'lobby') {
      if (v.teams?.length) list.push(btn('Shuffle teams', () => control({ op: 'shuffle_teams' }), { label: 'Deal everyone into teams again at random' }));
      list.push(btn('Start game', () => control({ op: 'start' }), { primary: true, key: 'Space' }));
    } else if (v?.phase === 'playing' || v?.phase === 'paused') {
      list.push(v.phase === 'paused' ? btn('Resume', () => control({ op: 'resume' }), { primary: true, key: 'P' }) : btn('Pause', () => control({ op: 'pause' }), { key: 'P' }));
      if (v.style === 'paced' && v.phase === 'playing') {
        const item = v.item;
        if (item && !item.revealed) {
          list.push(btn('+15 s', () => control({ op: 'add_time', seconds: 15 }), { key: '+', label: 'Add 15 seconds' }));
          list.push(btn(conn.serverNow() >= item.ends_at ? 'Reveal' : 'Reveal now', () => control({ op: 'reveal' }), { primary: true, key: 'Space' }));
        } else {
          if (item?.revealed) list.push(btn(showLb ? 'Back to the quote' : 'Leaderboard', () => toggleLb(), { key: 'L', pressed: showLb }));
          const last = !!item && item.index >= item.of - 1;
          list.push(btn(last ? 'Final scores' : item ? 'Next quote' : 'First quote', () => control(last ? { op: 'end' } : { op: 'next' }), { primary: true, key: 'Space' }));
        }
      }
      if (v.style === 'race' && v.kind === 'connections') list.push(btn(classWall ? 'Back to race' : 'Class wall', () => toggleClassWall(), { key: 'W', pressed: classWall }));
      if (v.style === 'custom') {
        // The kind's own buttons join the bar (sent as { op: 'kind', name, data }).
        for (const c of kindButtons(v)) {
          const b = btn(c.label, () => runKindButton(c), { ...(c.primary ? { primary: true } : {}), ...(c.key ? { key: c.key } : {}) });
          b.dataset.kind = `${c.name}:${JSON.stringify(c.data ?? null)}`;
          list.push(b);
        }
        list.push(btn(showLb ? 'Back to the game' : v.teams?.length ? 'Teams' : 'Leaderboard', () => toggleLb(), { key: 'L', pressed: showLb }));
      }
      list.push(endButton());
    }
    const tools: HTMLElement[] = [];
    if (v && v.phase !== 'ended' && v.phase !== 'folded') tools.push(btn('Ranks', () => toggleRanks(), { key: 'T', pressed: ranksOpen, label: 'Every rank (teacher only)' }));
    tools.push(btn('Calm', () => {
      setCalm(!calmToggleOn());
      root.classList.toggle('gm-calm', calm());
      paintControls();
    }, { key: 'C', pressed: calmToggleOn() }));
    tools.push(btn(soundOn() ? 'Sound on' : 'Sound off', () => {
      setSoundOn(!soundOn());
      paintControls();
    }, { key: 'M', pressed: soundOn() }));
    tools.push(btn('Full screen', () => fullScreen(), { key: 'F' }));
    tools.push(...(options.extraControls ?? []));
    tools.push(btn('Close board', () => close(), { label: 'Close the board (the game keeps running)' }));
    // Rebuild only when a button changes: every move sends a delta, and a rebuilt
    // button loses a click in progress and the keyboard focus.
    const sig = [...tools, ...list].map((b) => `${b.textContent}|${b.getAttribute('aria-pressed') ?? ''}|${b.className}|${b.dataset.kind ?? ''}`).join('/');
    if (sig === controlsSig) return;
    controlsSig = sig;
    const toolRow = el('div', 'gl-controls__tools');
    toolRow.append(...tools);
    const mainRow = el('div', 'gl-controls__main');
    mainRow.append(...list);
    const focused = controls.contains(document.activeElement) ? (document.activeElement as HTMLElement).textContent : null;
    controls.replaceChildren(toolRow, mainRow);
    if (focused) [...controls.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent === focused)?.focus();
  }

  function toggleLb(): void {
    showLb = !showLb;
    if (view) render(view);
  }
  function toggleClassWall(): void {
    classWall = !classWall;
    control({ op: 'board_view', view: classWall ? 'class_wall' : 'race' });
    if (view) render(view);
    if (classWall) sfx.reveal();
  }
  function fullScreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void root.requestFullscreen?.().catch(() => undefined);
  }

  /* ── Keys and idle ────────────────────────────────────────────── */

  function wake(): void {
    root.classList.remove('is-idle');
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!controls.matches(':hover') && !controls.contains(document.activeElement)) root.classList.add('is-idle');
    }, 3000);
  }

  function onKey(e: KeyboardEvent): void {
    wake();
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (closed || (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) || target?.isContentEditable) return;
    if (target && target.tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;
    const k = e.key.toLowerCase();
    const v = view;
    // A custom kind's board gets its keys first, then its control-bar shortcuts.
    if (v?.style === 'custom' && kindView) {
      let handled = false;
      try {
        handled = !!kindView.onKey?.(e);
      } catch {
        handled = false;
      }
      if (handled) {
        e.preventDefault();
        return;
      }
      const hit = kindButtons(v).find((c) => c.key && c.key !== 'Space' && c.key.toLowerCase() === k);
      if (hit) {
        e.preventDefault();
        runKindButton(hit);
        return;
      }
    }
    if (e.key === ' ' || e.key === 'Enter') {
      const act = primaryAction();
      if (act) {
        e.preventDefault();
        act();
      }
    } else if (k === 'p' && v && (v.phase === 'playing' || v.phase === 'paused')) control({ op: v.phase === 'paused' ? 'resume' : 'pause' });
    else if ((e.key === '+' || e.key === '=') && v?.item && !v.item.revealed) control({ op: 'add_time', seconds: 15 });
    else if (k === 'l' && ((v?.style === 'paced' && v.item?.revealed) || (v?.style === 'custom' && (v.phase === 'playing' || v.phase === 'paused')))) toggleLb();
    else if (k === 'w' && v?.kind === 'connections' && v.style === 'race') toggleClassWall();
    else if (k === 't') toggleRanks();
    else if (k === 'm') {
      setSoundOn(!soundOn());
      paintControls();
    } else if (k === 'c') {
      setCalm(!calmToggleOn());
      root.classList.toggle('gm-calm', calm());
      paintControls();
    } else if (k === 'f') fullScreen();
    else if (k === 'e' && v && (v.phase === 'playing' || v.phase === 'paused')) endButton().click();
    else if (e.key === 'Escape') {
      if (ranksOpen) toggleRanks(false);
      e.preventDefault();
    } else return;
  }

  function close(): void {
    if (closed) return;
    closed = true;
    typing += 1;
    stopClock();
    disposeKind();
    pacedRing?.stop();
    for (const t of [endArmed, idleTimer, toastTimer]) if (t) clearTimeout(t);
    conn.close();
    document.removeEventListener('keydown', onKey);
    footObserver?.disconnect();
    root.removeEventListener('mousemove', wake);
    if (document.fullscreenElement === root) void document.exitFullscreen?.();
    root.remove();
    document.documentElement.classList.remove('gl-board-open');
    setSfxRole('phone');
    returnFocus?.focus?.();
    options.onClose?.();
  }

  // On the document: after a button is replaced, focus falls to <body>, and the keys must still work.
  document.addEventListener('keydown', onKey);
  root.addEventListener('mousemove', wake);
  root.addEventListener('pointerdown', () => primeSound(), { once: true });
  host.append(root);
  document.documentElement.classList.add('gl-board-open');
  stage.replaceChildren(el('p', 'gl-race__sub', 'Opening the room…'));
  titleEl.replaceChildren(el('b', '', kindLabel(undefined)), ` · ${game?.title ?? ''}`);
  paintControls();
  root.focus({ preventScroll: true });
  wake();

  return { root, close, connection: () => conn };
}
