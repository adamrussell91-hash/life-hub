import { el } from '@/quiz/dom';
import { replayText, type WritingStep } from '@/quiz/writing';
import { writingPanel } from '@/quiz/writing-replay';
import { gameTeacherApi } from '../../api';
import { GAME_KIND_INFO, type Game } from '../../core/schema';
import { gameGlyph } from '../../glyphs';
import { pills } from '../../item-editors';
import { GRID, squareLabel } from './rules';
import type { FleetCampaignState, FleetControlApi, FleetFlag, FleetLogResult, FleetMember, FleetShot, FleetTeamState, FleetWritten } from './control-api';
import { calm } from '../../motion/motion';
import { createSea, type Sea } from './sea';
import './control-room.css';

/**
 * Fleet week, the teacher's control room (spec §1.3, §1.6–§1.9, §5). Before a
 * campaign: class, Lesson or Week mode (rounds and round cap, or the cut-off
 * time and the week's schedule) and how teams are balanced, then Open
 * campaign. During: polls `campaign_state` every 2 s and shows the phase and
 * time left on the server's clock, every match with real names, who has
 * placed or fired, the open round's shots (Void shot on any of them), owed
 * damage reports, written answers (Reject report, typing replay), writing
 * flags and standings, with Next round (lesson mode only), Reveal and Close.
 * After the reveal, a large-type board view for the projector: both fleets
 * per match, hits and misses, names, the winner and the class's hardest
 * squares. A student's typed answer never reaches the board view.
 */

export type FleetControlOptions = {
  lessonId: string;
  game: Game;
  classes: Array<{ id: string; name: string }>;
  /** The class picked first (defaults to the first class). */
  classId?: string | null;
  /** Defaults to the lesson's teacher API. */
  api?: FleetControlApi | null;
  pollMs?: number;
  now?: () => number;
  /** "See the results" on an ended game. Defaults to leaving the room (it opens from the Results tab). */
  onResults?: () => void;
};

export type FleetControlRoom = {
  root: HTMLElement;
  refresh(): Promise<void>;
  /** The latest campaign state, or null before a campaign is open. */
  state(): FleetCampaignState | null;
  dispose(): void;
};

type FleetSettings = { rounds?: number; round_cap_s?: number; cutoff?: string };
type Mode = 'lesson' | 'week';
type Balance = 'random' | 'mixed';
const CUTOFF = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_MS = 86_400_000;

const errText = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);
const btn = (text: string, kind: 'primary' | 'secondary' | 'ghost' | 'danger', onClick: () => void): HTMLButtonElement => {
  const b = el('button', `btn btn--${kind === 'danger' ? 'secondary' : kind}${kind === 'danger' ? ' fc-danger' : ''}`, text);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
};
const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
/** "2 h 15 min", "14 min", or m:ss under ten minutes. */
const longClock = (ms: number) => {
  const mins = Math.max(0, Math.ceil(ms / 60_000));
  if (mins < 10) return clock(ms);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return `${h} h${mins % 60 ? ` ${mins % 60} min` : ''}`;
};
const zoned = (ms: number, tz: string | undefined, opts: Intl.DateTimeFormatOptions): string => {
  try {
    return new Intl.DateTimeFormat('en-AU', { ...opts, ...(tz ? { timeZone: tz } : {}) }).format(ms);
  } catch {
    return new Intl.DateTimeFormat('en-AU', opts).format(ms);
  }
};
/** "8:00 pm" in the class's time zone. */
const timeAt = (ms: number, tz?: string): string =>
  zoned(ms, tz, { hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(/\s*([ap])\.?\s*m\.?/i, ' $1m')
    .toLowerCase();
/** "Tue 8:00 pm" in the class's time zone. */
export const cutoffAt = (ms: number, tz?: string): string => `${zoned(ms, tz, { weekday: 'short' })} ${timeAt(ms, tz)}`;

/**
 * The week in a line from every close (placement first, then each firing
 * round): "Placement until Mon 8:00 pm, firing Tue–Thu, reveal Fri".
 */
export function weekScheduleText(closes: number[], tz?: string): string {
  if (!closes.length) return '';
  const day = (ms: number) => zoned(ms, tz, { weekday: 'short' });
  const fire = closes.slice(1);
  const firing = !fire.length ? '' : fire.length === 1 ? `, firing ${day(fire[0]!)}` : `, firing ${day(fire[0]!)}–${day(fire[fire.length - 1]!)}`;
  return `Placement until ${cutoffAt(closes[0]!, tz)}${firing}, reveal ${day(closes[closes.length - 1]! + DAY_MS)}`;
}

/**
 * The week's closes before a campaign is open, on this device's clock: the
 * placement closes at today's cut-off (tomorrow's once it has passed), then a
 * firing round closes at each following day's cut-off. The server fixes the
 * real schedule in the class's time zone at the open.
 */
export function previewWeek(at: number, cutoff: string, rounds: number): number[] {
  const [hh, mm] = (CUTOFF.test(cutoff) ? cutoff : '20:00').split(':').map(Number) as [number, number];
  const first = new Date(at);
  first.setHours(hh, mm, 0, 0);
  if (first.getTime() <= at) first.setDate(first.getDate() + 1);
  return Array.from({ length: rounds + 1 }, (_, i) => {
    const d = new Date(first);
    d.setDate(first.getDate() + i);
    return d.getTime();
  });
}

const capLabel = (s: number) => (s % 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s / 60} min`);

/** "Ana Example & Ben Sample", or "Ghost fleet". */
export const teamName = (t: FleetTeamState | undefined): string => (!t ? 'Unknown team' : t.ghost ? 'Ghost fleet' : t.members.map((m) => m.name).join(' & ') || 'Empty team');

export function phaseText(s: FleetCampaignState): string {
  if (s.closed_at) return 'Closed';
  if (s.revealed_at) return 'Revealed';
  if (s.round === 0) return 'Placing ships';
  if (s.round > s.rounds || s.closes_at === null) return 'Every round played';
  return `Round ${s.round} of ${s.rounds}`;
}
const roundOpen = (s: FleetCampaignState) => !s.closed_at && !s.revealed_at && s.round <= s.rounds && s.closes_at !== null;

/** Each resolved shot at a team's chart: square → hit or miss (practice shots and duds leave it unknown). */
export function chartMarks(s: FleetCampaignState, teamId: string): Map<number, 'hit' | 'miss'> {
  const marks = new Map<number, 'hit' | 'miss'>();
  for (const round of s.log) {
    for (const r of round.results) {
      if (r.target !== teamId) continue;
      if (r.outcome === 'hit') marks.set(r.square, 'hit');
      else if (r.outcome === 'miss' && marks.get(r.square) !== 'hit') marks.set(r.square, 'miss');
    }
  }
  return marks;
}

/** First-try accuracy per square from the resolved log, hardest first (at least two tries, not all right). */
export function hardestSquares(s: FleetCampaignState, limit = 3): Array<{ square: number; right: number; total: number }> {
  const tally = new Map<number, { right: number; total: number }>();
  const counts = (r: FleetLogResult) => r.outcome !== 'void' && r.outcome !== 'dup';
  for (const round of s.log) {
    for (const r of round.results) {
      if (!counts(r)) continue;
      const t = tally.get(r.square) ?? { right: 0, total: 0 };
      t.total += 1;
      if (r.correct === true) t.right += 1;
      tally.set(r.square, t);
    }
  }
  return [...tally.entries()]
    .map(([square, t]) => ({ square, ...t }))
    .filter((t) => t.total >= 2 && t.right < t.total)
    .sort((a, b) => a.right / a.total - b.right / b.total || b.total - a.total || a.square - b.square)
    .slice(0, limit);
}

function chart(team: FleetTeamState | undefined, marks: Map<number, 'hit' | 'miss'>, size: 'sm' | 'lg', sea?: HTMLElement): HTMLElement {
  const ships = new Set((team?.fleet ?? []).flatMap((ship) => ship.squares));
  const grid = el('div', `fc-chart fc-chart--${size}`);
  if (sea) {
    // The rendered sea sits under the cells; the cells keep marks and titles.
    grid.classList.add('fc-chart--sea');
    grid.append(sea);
  }
  grid.setAttribute('role', 'img');
  const hits = [...marks.values()].filter((m) => m === 'hit').length;
  const misses = marks.size - hits;
  grid.setAttribute('aria-label', `${teamName(team)}: ${hits} hit${hits === 1 ? '' : 's'}, ${misses} miss${misses === 1 ? '' : 'es'}`);
  grid.append(el('span', 'fc-chart__corner'));
  for (let c = 0; c < GRID; c += 1) grid.append(el('span', 'fc-chart__head', String(c + 1)));
  for (let r = 0; r < GRID; r += 1) {
    grid.append(el('span', 'fc-chart__head', 'ABCDE'[r]));
    for (let c = 0; c < GRID; c += 1) {
      const i = r * GRID + c;
      const mark = marks.get(i);
      const cell = el('span', 'fc-chart__cell');
      if (ships.has(i)) cell.classList.add('is-ship');
      if (mark) cell.classList.add(`is-${mark}`);
      cell.title = `${squareLabel(i)}${mark ? ` · ${mark}` : ''}`;
      if (mark) cell.textContent = mark === 'hit' ? '✕' : '•';
      grid.append(cell);
    }
  }
  return grid;
}

function memberStatus(m: FleetMember, s: FleetCampaignState): { text: string; tone: 'done' | 'busy' | 'idle' } {
  if (s.round === 0) return m.done ? { text: 'Placed', tone: 'done' } : { text: m.seen ? 'Placing…' : 'Not opened', tone: m.seen ? 'busy' : 'idle' };
  if (!roundOpen(s)) return { text: '—', tone: 'idle' };
  if (m.done) return { text: `Fired ${m.shots}`, tone: 'done' };
  if (m.shots) return { text: `Fired ${m.shots}…`, tone: 'busy' };
  return { text: m.seen ? 'Not fired' : 'Not opened', tone: 'idle' };
}

/** A small typing replay: the counts, then the text rebuilt step by step. */
function replay(flag: FleetFlag): HTMLDetailsElement {
  const box = el('details', 'fc-replay');
  box.append(el('summary', '', 'Typing replay (teacher only)'));
  const steps = Array.isArray(flag.writing?.steps) ? (flag.writing!.steps as WritingStep[]) : [];
  const base = typeof flag.writing?.base === 'string' ? flag.writing.base : '';
  const out = el('pre', 'fc-replay__text', steps.length || base ? replayText({ base, steps }) : 'No typing was recorded.');
  const meta = el('p', 'gm-note', `${steps.length} change${steps.length === 1 ? '' : 's'}${typeof flag.writing?.ms === 'number' ? ` · ${Math.round(flag.writing.ms / 1000)} s typing` : ''}${flag.writing?.full ? ' · replay cut short' : ''}`);
  let timer: ReturnType<typeof setInterval> | null = null;
  const play = btn('Play', 'ghost', () => {
    if (timer) clearInterval(timer);
    let at = 0;
    timer = setInterval(() => {
      at += 1;
      out.textContent = replayText({ base, steps }, at);
      if (at >= steps.length && timer) {
        clearInterval(timer);
        timer = null;
      }
    }, 120);
  });
  play.disabled = !steps.length;
  box.append(meta, play, out);
  return box;
}

/** "Run Fleet week" rows for the editor's Results tab (null when the lesson has no Fleet week game). */
export function fleetLauncher(o: { games: Game[]; classes: Array<{ id: string; name: string }>; classId: string | null; lessonId: string; api: FleetControlApi | null | undefined }): HTMLElement | null {
  const fleets = o.games.filter((g) => g.kind === 'fleet_week');
  if (!fleets.length) return null;
  const panel = el('section', 'gm-panel gl-launch fc-launch');
  const head = el('div', 'gm-panel__head');
  head.append(el('h3', 'gm-h3', 'Fleet week'));
  panel.append(head, el('p', 'gm-note', o.api ? 'Opens the control room: pick the class and rounds, then run the game in this lesson.' : 'The control room needs the server. Publish and open this lesson in the teacher hub.'));
  const list = el('div', 'gl-launch__list');
  for (const g of fleets) {
    const row = el('div', 'gl-launch__row');
    const text = el('div', 'gl-launch__text');
    text.append(el('b', '', g.title || GAME_KIND_INFO[g.kind].label), el('span', 'gm-note', `${GAME_KIND_INFO[g.kind].label} · in teams, on phones, over a lesson`));
    const go = btn('Run Fleet week', 'primary', () => {
      openFleetControlRoom(document.body, { lessonId: o.lessonId, game: g, classes: o.classes, classId: o.classId, api: o.api });
    });
    go.disabled = !o.api;
    row.append(gameGlyph(g.kind, 'sm'), text, go);
    list.append(row);
  }
  panel.append(list);
  return panel;
}

export function openFleetControlRoom(host: HTMLElement, o: FleetControlOptions): FleetControlRoom {
  const api: FleetControlApi | null = o.api === undefined ? (gameTeacherApi(o.lessonId).fleet ?? null) : o.api;
  const now = o.now ?? (() => Date.now());
  const pollMs = o.pollMs ?? 2000;
  const settings = ((o.game as { settings?: FleetSettings }).settings ?? {}) as FleetSettings;
  const title = o.game.title || 'Fleet week';
  const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  let classId: string | null = o.classId ?? o.classes[0]?.id ?? null;
  let rounds = settings.rounds ?? 5;
  let capS = settings.round_cap_s ?? 240;
  let mode: Mode = 'lesson';
  let cutoff = settings.cutoff && CUTOFF.test(settings.cutoff) ? settings.cutoff : '20:00';
  let weekRounds = 3;
  let balance: Balance = 'random';
  /** Server clock minus this device's, from the latest `campaign_state.now`. */
  let offset = 0;
  const serverNow = () => now() + offset;
  let state: FleetCampaignState | null = null;
  let painted = '';
  let busy = false;
  let disposed = false;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let boardEl: HTMLElement | null = null;
  let boardAt = 0;
  /** Board seas by `match:team`, kept across repaints so the fog lifts once per showing. */
  const boardSeas = new Map<string, { layer: HTMLElement; sea: Sea; lifted: boolean }>();
  function dropSeas(keep?: string): void {
    for (const [k, v] of boardSeas) {
      if (keep && k.startsWith(`${keep}:`)) continue;
      v.sea.destroy();
      boardSeas.delete(k);
    }
  }
  const openReplays = new Set<string>();

  const root = el('div', 'fc');
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', `Fleet week control room: ${title}`);
  root.tabIndex = -1;
  const top = el('header', 'fc-top');
  const heading = el('div', 'fc-top__title');
  heading.append(el('p', 'fc-kicker', 'Fleet week · control room'), el('h2', 'fc-h2', title));
  const phase = el('p', 'fc-phase');
  phase.setAttribute('aria-live', 'polite');
  const timeLeft = el('p', 'fc-time');
  const leave = btn('Leave', 'ghost', () => handle.dispose());
  leave.title = 'Leave the control room. The game keeps running.';
  top.append(heading, phase, timeLeft, leave);
  const status = el('p', 'fc-status');
  status.setAttribute('role', 'status');
  const confirmBar = el('div', 'fc-confirm');
  confirmBar.hidden = true;
  const main = el('main', 'fc-main');
  root.append(top, status, confirmBar, main);
  host.append(root);
  root.focus();

  const className = () => o.classes.find((c) => c.id === classId)?.name ?? 'this class';

  function say(text: string, error = false): void {
    status.textContent = text;
    status.classList.toggle('is-error', error);
  }

  function askConfirm(question: string, yes: string, run: () => void): void {
    confirmBar.replaceChildren();
    confirmBar.hidden = false;
    const go = btn(yes, 'primary', () => {
      confirmBar.hidden = true;
      run();
    });
    go.classList.add('fc-confirm__yes');
    const no = btn('Cancel', 'ghost', () => {
      confirmBar.hidden = true;
    });
    confirmBar.append(el('p', 'fc-confirm__q', question), go, no);
    go.focus();
  }

  async function act(label: string, call: () => Promise<FleetCampaignState>, done?: string): Promise<void> {
    if (!api || busy) return;
    busy = true;
    say(label);
    try {
      apply(await call());
      say(done ?? '');
    } catch (e) {
      say(errText(e, 'That didn’t work. Try again.'), true);
    } finally {
      busy = false;
      paintTop();
    }
  }

  function apply(next: FleetCampaignState): void {
    if (typeof next.now === 'number' && Number.isFinite(next.now)) offset = next.now - now();
    state = next;
    paintTop();
    const key = JSON.stringify(next);
    if (key !== painted) {
      painted = key;
      paintRoom();
      if (boardEl) paintBoard();
    }
    schedule();
  }

  function schedule(): void {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    if (disposed || !state || state.closed_at || state.read_only) return;
    pollTimer = setTimeout(() => void handle.refresh(), pollMs);
  }

  // ------------------------------------------------------------ top bar
  function paintTop(): void {
    if (!state) {
      phase.textContent = 'Not started';
      timeLeft.textContent = '';
      return;
    }
    phase.textContent = `${phaseText(state)} · ${className()}`;
    const closes = roundOpen(state) ? state.closes_at : null;
    if (closes === null) timeLeft.textContent = '';
    else if (state.mode === 'week') timeLeft.textContent = `Next cut-off ${cutoffAt(closes, state.tz)} · ${longClock(closes - serverNow())} left`;
    else timeLeft.textContent = `${clock(closes - serverNow())} left`;
  }
  const tick = setInterval(() => {
    if (state) paintTop();
  }, 1000);

  // ------------------------------------------------------------ setup
  function paintSetup(): void {
    main.replaceChildren();
    const card = el('section', 'fc-card fc-setup');
    card.append(
      el('h3', 'fc-h3', 'Open a campaign'),
      el(
        'p',
        'gm-note',
        mode === 'week'
          ? 'Week mode: placement first, then one firing round a day, each closing at the cut-off. Phones load the game when students open it. If one is already running for the class, this picks it up.'
          : 'Lesson mode: phones poll, and you move the class on with Next round. If one is already running for the class, this picks it up.'
      )
    );
    if (o.classes.length) {
      const field = el('div', 'gm-field');
      field.append(
        el('span', 'gm-field__label', 'Class'),
        pills(o.classes.map((c): [string, string] => [c.id, c.name]), classId ?? '', 'Class', (v) => {
          classId = v;
        })
      );
      card.append(field);
    } else card.append(el('p', 'gm-note', 'No class teaches this unit yet. Add a class first.'));

    const modeField = el('div', 'gm-field fc-mode');
    modeField.append(
      el('span', 'gm-field__label', 'Mode'),
      pills<Mode>([['lesson', 'Lesson'], ['week', 'Week']], mode, 'Mode', (v) => {
        mode = v;
        paintSetup();
        main.querySelector<HTMLButtonElement>('.fc-mode .hub-pills__btn[aria-pressed="true"]')?.focus();
      })
    );
    card.append(modeField);

    const roundsField = el('label', 'gm-field');
    const roundsPick = el('select', 'gm-select');
    roundsPick.name = 'rounds';
    const picked = mode === 'week' ? weekRounds : rounds;
    for (let n = mode === 'week' ? 1 : 2; n <= 8; n += 1) {
      const opt = el('option', '', `${n} round${n === 1 ? '' : 's'}`);
      opt.value = String(n);
      opt.selected = n === picked;
      roundsPick.append(opt);
    }
    roundsField.append(el('span', 'gm-field__label', mode === 'week' ? 'Firing rounds' : 'Rounds'), roundsPick);
    const row = el('div', 'fc-row');
    row.append(roundsField);

    const schedule = el('p', 'fc-schedule');
    schedule.setAttribute('aria-live', 'polite');
    const paintSchedule = () => {
      schedule.textContent = `${weekScheduleText(previewWeek(now(), cutoff, weekRounds))}. The server sets the exact times in the class’s time zone when you open.`;
    };
    if (mode === 'week') {
      roundsPick.addEventListener('change', () => {
        weekRounds = Number(roundsPick.value);
        paintSchedule();
      });
      const cutField = el('label', 'gm-field');
      const cutPick = el('input', 'gm-input fc-cutoff');
      cutPick.type = 'time';
      cutPick.name = 'cutoff';
      cutPick.value = cutoff;
      cutPick.addEventListener('change', () => {
        if (CUTOFF.test(cutPick.value)) cutoff = cutPick.value;
        paintSchedule();
      });
      cutField.append(el('span', 'gm-field__label', 'Cut-off time'), cutPick);
      row.append(cutField);
      paintSchedule();
    } else {
      roundsPick.addEventListener('change', () => (rounds = Number(roundsPick.value)));
      const capField = el('label', 'gm-field');
      const capPick = el('select', 'gm-select');
      capPick.name = 'round_cap_s';
      const caps = new Set([60, 90, 120, 150, 180, 240, 300, 360, 420, 480, 540, 600, capS]);
      for (const sec of [...caps].sort((a, b) => a - b)) {
        const opt = el('option', '', capLabel(sec));
        opt.value = String(sec);
        opt.selected = sec === capS;
        capPick.append(opt);
      }
      capPick.addEventListener('change', () => (capS = Number(capPick.value)));
      capField.append(el('span', 'gm-field__label', 'Round cap'), capPick);
      row.append(capField);
    }
    card.append(row);
    if (mode === 'week') card.append(schedule);

    const teamsField = el('div', 'gm-field fc-balance');
    teamsField.append(
      el('span', 'gm-field__label', 'Teams'),
      pills<Balance>([['random', 'Random'], ['mixed', 'Mixed by recent accuracy']], balance, 'Teams', (v) => {
        balance = v;
      }),
      el('p', 'gm-note', 'Mixed pairs stronger with weaker players by their recent accuracy in this lesson’s games.')
    );
    card.append(teamsField);

    const open = btn('Open campaign', 'primary', () => {
      if (!classId || !api) return;
      const id = classId;
      const opts = mode === 'week' ? { mode, rounds: weekRounds, cutoff, balance } : { mode, rounds, round_cap_s: capS, balance };
      void act(
        `Opening Fleet week for ${className()}…`,
        () => api.open(o.game.id, id, opts),
        mode === 'week' ? 'Campaign open for the week. Students open the game on their phones to place ships before the cut-off.' : 'Campaign open. Students open the game on their phones to place ships.'
      );
    });
    open.classList.add('fc-open');
    open.disabled = !classId || !api;
    card.append(open);
    if (!api) card.append(el('p', 'gm-note', 'The control room needs the server.'));
    main.append(card);
  }

  // ------------------------------------------------------------ room
  function paintRoom(): void {
    const s = state;
    if (!s) return paintSetup();
    main.replaceChildren();
    const teamById = new Map(s.teams.map((t) => [t.id, t]));
    const live = !s.closed_at && !s.read_only;

    if (s.read_only) {
      // An ended game: no actions, a way to its results.
      const ended = el('div', 'fc-ended');
      ended.setAttribute('role', 'status');
      ended.append(el('p', 'fc-ended__text', 'This game has ended'));
      const go = el('a', 'fc-ended__link', 'See the results');
      go.href = '#results';
      go.addEventListener('click', (e) => {
        e.preventDefault();
        if (o.onResults) o.onResults();
        handle.dispose();
      });
      ended.append(go);
      main.append(ended);
    }

    const bar = el('div', 'fc-actions');
    const next = btn('Next round', 'primary', () => void act('Closing this round…', () => api!.next(o.game.id, classId!, s.campaign_id), 'Round closed.'));
    next.disabled = !live || !roundOpen(s);
    const reveal = btn(s.revealed_at ? 'Show the reveal board' : 'Reveal', 'primary', () => {
      if (s.revealed_at) return openBoard();
      askConfirm('Reveal to the class? Names and both fleets show on every phone. This can’t be undone.', 'Reveal now', () =>
        void act('Revealing…', () => api!.reveal(o.game.id, classId!, s.campaign_id), 'Revealed.').then(() => {
          if (state?.revealed_at) openBoard();
        })
      );
    });
    reveal.classList.add('fc-reveal');
    reveal.disabled = !!s.closed_at && !s.revealed_at;
    const close = btn('Close campaign', 'danger', () =>
      askConfirm('Close this campaign? Students can’t play it any more, and the class is free for a new one.', 'Close campaign', () =>
        void act('Closing…', () => api!.close(o.game.id, classId!, s.campaign_id), 'Campaign closed.')
      )
    );
    close.disabled = !live;
    if (s.mode !== 'week') bar.append(next);
    bar.append(reveal, close);
    if (!s.read_only) main.append(bar);
    if (s.mode === 'week' && s.schedule?.length) {
      const zone = s.tz ? ` (${s.tz.replace(/_/g, ' ')})` : '';
      main.append(el('p', 'fc-schedule', `${weekScheduleText(s.schedule, s.tz)}. Each round closes at ${timeAt(s.schedule[0]!, s.tz)}${zone}.`));
    }

    // Matches, grouped by team.
    const matches = el('section', 'fc-card');
    matches.append(el('h3', 'fc-h3', 'Matches'));
    const grid = el('div', 'fc-matches');
    for (const m of s.matches) {
      const card = el('article', 'fc-match');
      card.append(el('p', 'fc-match__title', `${m.id.toUpperCase()}${m.ended ? ' · fleet sunk' : ''}`));
      const sides = el('div', 'fc-match__sides');
      m.teams.forEach((tid, k) => {
        const t = teamById.get(tid);
        const side = el('div', `fc-team fc-team--${k + 1}`);
        side.append(el('p', 'fc-team__name', teamName(t)), el('p', 'fc-team__damage', `${t?.damage ?? 0} damage`));
        const members = el('ul', 'fc-members');
        for (const mem of t?.members ?? []) {
          const st = memberStatus(mem, s);
          const li = el('li', 'fc-member');
          li.append(el('span', 'fc-member__name', mem.name), el('span', `fc-pill fc-pill--${st.tone}`, st.text));
          members.append(li);
        }
        if (t?.ghost) members.append(el('li', 'gm-note', 'Ships placed by the app.'));
        side.append(members, chart(t, chartMarks(s, tid), 'sm'));
        sides.append(side);
      });
      card.append(sides);
      grid.append(card);
    }
    if (!s.matches.length) grid.append(el('p', 'gm-note', 'No matches yet.'));
    matches.append(grid);
    main.append(matches);

    // Owed damage reports.
    const owed = el('section', 'fc-card');
    owed.append(el('h3', 'fc-h3', `Damage reports owed (${s.owed.length})`));
    if (!s.owed.length) owed.append(el('p', 'gm-note', 'None owed.'));
    const owedList = el('ul', 'fc-list');
    for (const h of s.owed) {
      const li = el('li', 'fc-item');
      const partner = teamById.get(h.team)?.members.filter((mm) => mm.name !== h.by).map((mm) => mm.name).join(' & ');
      li.append(el('p', 'fc-item__head', `${h.by} hit ${squareLabel(h.square)} in round ${h.round} · ${partner ? `${partner} owes` : 'owed'} the report by round ${h.due}${h.rejected ? ' · returned once' : ''}`));
      if (h.filed) {
        li.append(el('p', 'fc-item__text', `Filed by ${h.filed.by}: “${h.filed.text}”`));
        // Reject sits with the written answer (below); an older server without that list keeps it here.
        if (live && !h.rejected && !s.written) li.append(rejectBtn(h.hit));
      } else li.append(el('p', 'gm-note', 'Not filed yet.'));
      owedList.append(li);
    }
    owed.append(owedList);
    main.append(owed);

    // Shots this round: Void shot on any of them.
    if (s.round >= 1 && roundOpen(s) && s.shots) main.append(shotsCard(s, live));

    // Written answers: damage reports and recall lines.
    if (s.written) main.append(writtenCard(s, live));

    // Writing flags.
    const flags = el('section', 'fc-card');
    flags.append(el('h3', 'fc-h3', `Writing flags (${s.flags.length})`));
    if (!s.flags.length) flags.append(el('p', 'gm-note', 'No pastes, time away or bursts.'));
    const flagList = el('ul', 'fc-list');
    for (const f of s.flags) {
      const li = el('li', 'fc-item fc-flag');
      const what = f.kind === 'answer' ? `answer at ${squareLabel(f.square ?? -1)}` : f.kind === 'report' ? 'damage report' : 'recall line';
      const marks = [f.pastes ? `${f.pastes} paste${f.pastes === 1 ? '' : 's'}` : '', f.away ? `${f.away}× away` : '', f.jumps ? `${f.jumps} burst${f.jumps === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
      li.append(el('p', 'fc-item__head', `${f.name} · round ${f.round} · ${what}`), el('p', 'fc-flag__marks', marks));
      if (!s.shots && f.kind === 'answer' && typeof f.seq === 'number' && live && roundOpen(s) && f.round === s.round) {
        const shot = { round: f.round, owner: f.owner, seq: f.seq };
        li.append(btn('Void shot', 'secondary', () => void act('Voiding the shot…', () => api!.voidShot(o.game.id, classId!, shot, s.campaign_id), 'Shot voided: it becomes a dud that doesn’t return.')));
      }
      const r = replay(f);
      const key = `${f.kind}:${f.owner}:${f.round}:${f.seq ?? f.hit ?? f.ship ?? ''}`;
      r.open = openReplays.has(key);
      r.addEventListener('toggle', () => (r.open ? openReplays.add(key) : openReplays.delete(key)));
      li.append(r);
      flagList.append(li);
    }
    flags.append(flagList);
    main.append(flags);

    // Standings.
    const standings = el('section', 'fc-card');
    standings.append(el('h3', 'fc-h3', 'Standings'));
    for (const st of s.standings) {
      const table = el('table', 'fc-table');
      const head = el('tr');
      for (const h of ['Team', 'Damage', 'Sunk', 'First-try']) head.append(el('th', '', h));
      table.append(el('caption', '', `${st.match.toUpperCase()}${st.winner ? ` · leading: ${teamName(teamById.get(st.winner))}` : ' · level'}`), head);
      for (const row of st.teams) {
        const tr = el('tr');
        tr.append(el('td', '', teamName(teamById.get(row.team))), el('td', '', String(row.damage)), el('td', '', String(row.sunk)), el('td', '', `${Math.round(row.accuracy * 100)}%`));
        table.append(tr);
      }
      standings.append(table);
    }
    main.append(standings);

    // Last resolved round, in words (outcomes only: no answers).
    const last = s.log[s.log.length - 1];
    if (last && last.round > 0) {
      const log = el('section', 'fc-card');
      log.append(el('h3', 'fc-h3', `Round ${last.round} results`));
      const ul = el('ul', 'fc-list fc-log');
      for (const r of last.results) ul.append(el('li', '', `${r.name} → ${squareLabel(r.square)}: ${r.outcome}${r.sure ? ' (sure)' : ''}${r.damage ? ` · ${r.damage} damage` : ''}`));
      if (!last.results.length) ul.append(el('li', 'gm-note', 'No shots.'));
      log.append(ul);
      main.append(log);
    }
  }

  function rejectBtn(hit: string): HTMLButtonElement {
    return btn('Reject report', 'secondary', () =>
      void act('Returning the report…', () => api!.rejectReport(o.game.id, classId!, hit, state!.campaign_id), 'Report returned to the partner.')
    );
  }

  function shotsCard(s: FleetCampaignState, live: boolean): HTMLElement {
    const shots = s.shots ?? [];
    const card = el('section', 'fc-card fc-shots');
    card.append(el('h3', 'fc-h3', `Shots this round (${shots.length})`));
    if (!shots.length) {
      card.append(el('p', 'gm-note', 'No shots yet this round.'));
      return card;
    }
    card.append(el('p', 'gm-note', 'Void any shot: it becomes a dud that doesn’t return.'));
    const flagged = new Set(s.flags.filter((f) => f.kind === 'answer' && f.round === s.round).map((f) => `${f.owner}:${f.seq}`));
    const list = el('ul', 'fc-list fc-shotlist');
    for (const shot of shots) list.append(shotRow(shot, s, live, flagged.has(`${shot.owner}:${shot.seq}`)));
    card.append(list);
    return card;
  }

  function shotRow(shot: FleetShot, s: FleetCampaignState, live: boolean, flagged: boolean): HTMLElement {
    const label = shot.square_label || squareLabel(shot.square);
    const li = el('li', `fc-shot${shot.voided ? ' is-voided' : ''}`);
    const tags = el('span', 'fc-shot__tags');
    tags.append(el('span', `fc-pill fc-pill--${shot.sure ? 'busy' : 'idle'}`, shot.sure ? 'Sure' : 'Unsure'));
    tags.append(el('span', `fc-pill fc-pill--${shot.answered ? 'done' : 'idle'}`, shot.answered ? 'Answered' : 'Waiting'));
    if (flagged) tags.append(el('span', 'fc-pill fc-pill--flag', 'Flagged'));
    if (shot.voided) tags.append(el('span', 'fc-pill fc-pill--void', 'Voided'));
    li.append(el('span', 'fc-shot__who', shot.owner_name), el('span', 'fc-shot__square', label), tags);
    if (!shot.voided && live && roundOpen(s)) {
      const v = btn('Void shot', 'secondary', () =>
        void act('Voiding the shot…', () => api!.voidShot(o.game.id, classId!, { round: shot.round, owner: shot.owner, seq: shot.seq }, s.campaign_id), 'Shot voided: it becomes a dud that doesn’t return.')
      );
      v.setAttribute('aria-label', `Void ${shot.owner_name}’s shot at ${label}`);
      li.append(v);
    }
    return li;
  }

  function writtenCard(s: FleetCampaignState, live: boolean): HTMLElement {
    const written = s.written ?? [];
    const card = el('section', 'fc-card fc-written');
    card.append(el('h3', 'fc-h3', `Written answers (${written.length})`));
    if (!written.length) {
      card.append(el('p', 'gm-note', 'No damage reports or recall lines yet.'));
      return card;
    }
    const owed = new Map(s.owed.map((h) => [h.hit, h]));
    const list = el('ul', 'fc-list');
    for (const w of written) list.append(writtenRow(w, w.kind === 'report' ? owed.get(w.hit) : undefined, live));
    card.append(list);
    return card;
  }

  function writtenRow(w: FleetWritten, owed: FleetCampaignState['owed'][number] | undefined, live: boolean): HTMLElement {
    const li = el('li', `fc-item fc-written__item fc-written__item--${w.kind}`);
    if (w.kind === 'report') {
      li.append(el('p', 'fc-item__head', `${w.name} · damage report · round ${w.round}${w.square !== null ? ` · ${squareLabel(w.square)}` : ''}`));
      if (w.prompt) li.append(el('p', 'fc-written__prompt', `Question: ${w.prompt}`));
      if (w.answer) li.append(el('p', 'fc-written__prompt', `${w.shooter}’s answer: ${w.answer}`));
    } else {
      li.append(el('p', 'fc-item__head', `${w.name} · recall line · round ${w.round} · ${w.correct ? 'right' : 'not right'}`));
      if (w.prompt) li.append(el('p', 'fc-written__prompt', `Question: ${w.prompt}`));
    }
    li.append(el('p', 'fc-item__text', w.text ? `“${w.text}”` : 'Nothing written.'));
    if (w.writing) li.append(writingPanel(w.writing, w.writing.log, w.text));
    if (w.kind === 'report' && owed?.rejected) li.append(el('p', 'gm-note', 'Returned once already.'));
    else if (w.kind === 'report' && live && owed?.filed) li.append(rejectBtn(w.hit));
    return li;
  }

  // ------------------------------------------------------------ board (projector)
  function openBoard(): void {
    if (boardEl || !state) return;
    boardEl = el('div', 'fc-board');
    boardEl.setAttribute('role', 'dialog');
    boardEl.setAttribute('aria-label', 'Fleet week reveal');
    boardEl.tabIndex = -1;
    boardEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeBoard();
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    });
    root.append(boardEl);
    paintBoard();
    boardEl.focus();
  }
  function closeBoard(): void {
    dropSeas();
    boardEl?.remove();
    boardEl = null;
  }
  function step(d: number): void {
    if (!state?.matches.length) return;
    boardAt = (boardAt + d + state.matches.length) % state.matches.length;
    paintBoard();
  }
  /** The reveal sea for one team's chart: fog first, then it lifts and the ships appear. */
  function revealSea(key: string, seed: string, team: FleetTeamState | undefined, marks: Map<number, 'hit' | 'miss'>, side: number): HTMLElement | undefined {
    let entry = boardSeas.get(key);
    if (!entry) {
      const layer = el('div', 'fc-sea');
      layer.setAttribute('aria-hidden', 'true');
      entry = { layer, sea: createSea(layer, { seed, mode: 'reveal', size: GRID }), lifted: false };
      boardSeas.set(key, entry);
    }
    if (!entry.sea.live) return undefined;
    const hits = new Set([...marks].filter(([, v]) => v === 'hit').map(([k]) => k));
    entry.sea.update({
      ships: (team?.fleet ?? []).map((ship) => ({ squares: ship.squares, tone: ship.squares.every((q) => hits.has(q)) ? 'sunk' : side ? 'teamB' : 'teamA' })),
      marks: Object.fromEntries(marks)
    });
    return entry.layer;
  }
  function liftSeas(): void {
    const waiting = [...boardSeas.values()].filter((v) => !v.lifted && v.sea.live);
    if (!waiting.length) return;
    waiting.forEach((v) => (v.lifted = true));
    const go = () => waiting.forEach((v) => void v.sea.lift());
    if (calm()) go();
    else setTimeout(go, 700);
  }
  function paintBoard(): void {
    const s = state;
    if (!boardEl || !s) return;
    boardEl.replaceChildren();
    const teamById = new Map(s.teams.map((t) => [t.id, t]));
    const m = s.matches[boardAt];
    const nav = el('div', 'fc-board__nav');
    const prev = btn('‹ Previous', 'ghost', () => step(-1));
    const nxt = btn('Next match ›', 'ghost', () => step(1));
    prev.disabled = nxt.disabled = s.matches.length < 2;
    nav.append(prev, el('span', 'fc-board__count', m ? `Match ${boardAt + 1} of ${s.matches.length}` : ''), nxt, btn('Close', 'ghost', closeBoard));
    boardEl.append(el('p', 'fc-board__kicker', `Fleet week · ${title}`), nav);
    if (!m) {
      dropSeas();
      boardEl.append(el('p', 'fc-board__empty', 'No matches.'));
      return;
    }
    dropSeas(m.id);
    const standing = s.standings.find((st) => st.match === m.id);
    const winner = standing?.winner ? teamById.get(standing.winner) : undefined;
    boardEl.append(el('h2', 'fc-board__winner', winner ? `${teamName(winner)} win${winner.members.length === 1 ? 's' : ''}` : standing ? 'A draw' : ''));
    const sides = el('div', 'fc-board__sides');
    for (const tid of m.teams) {
      const t = teamById.get(tid);
      const row = standing?.teams.find((r) => r.team === tid);
      const side = el('section', `fc-board__side${winner && winner.id === tid ? ' is-winner' : ''}`);
      side.append(el('h3', 'fc-board__team', teamName(t)), el('p', 'fc-board__stats', `${row?.damage ?? t?.damage ?? 0} damage · ${row?.sunk ?? 0} sunk · ${Math.round((row?.accuracy ?? 0) * 100)}% first try`));
      const marks = chartMarks(s, tid);
      side.append(chart(t, marks, 'lg', revealSea(`${m.id}:${tid}`, `${s.campaign_id}:${m.id}:${tid}`, t, marks, m.teams.indexOf(tid))));
      sides.append(side);
    }
    boardEl.append(sides);
    liftSeas();
    // The class's hardest squares: the server's board when it sent one, else the resolved log. Never an answer.
    const cols = (o.game as { columns?: string[] }).columns ?? [];
    const rows = (o.game as { rows?: string[] }).rows ?? [];
    const hard = s.board
      ? s.board.hardest
          .filter((h) => h.right < h.answered)
          .slice(0, 3)
          .map((h) => ({ square: h.square, label: h.label, topic: [h.row, h.column].filter(Boolean).join(' · '), right: h.right, total: h.answered }))
      : hardestSquares(s).map((h) => ({ ...h, label: squareLabel(h.square), topic: [rows[Math.floor(h.square / GRID)], cols[h.square % GRID]].filter(Boolean).join(' · ') }));
    if (hard.length) {
      const box = el('section', 'fc-board__hard');
      box.append(el('h3', 'fc-board__team', 'The class’s hardest squares'));
      const ul = el('ul', 'fc-board__hardlist');
      for (const h of hard) ul.append(el('li', '', `${h.label || squareLabel(h.square)}${h.topic ? ` (${h.topic})` : ''}: ${h.right} of ${h.total} right`));
      box.append(ul);
      boardEl.append(box);
    }
  }

  // ------------------------------------------------------------ handle
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !boardEl && !confirmBar.hidden) confirmBar.hidden = true;
  };
  root.addEventListener('keydown', onKey);

  const handle: FleetControlRoom = {
    root,
    state: () => state,
    async refresh() {
      if (!api || !state || !classId || busy || disposed) return schedule();
      try {
        const next = await api.state(o.game.id, classId, state.campaign_id);
        if (!disposed) apply(next);
      } catch (e) {
        say(errText(e, 'Lost touch with the server. Retrying…'), true);
        schedule();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (pollTimer) clearTimeout(pollTimer);
      clearInterval(tick);
      dropSeas();
      root.remove();
      returnFocus?.focus();
    }
  };
  paintTop();
  paintSetup();
  return handle;
}
