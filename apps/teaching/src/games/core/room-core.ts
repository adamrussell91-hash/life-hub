import type { EventResult, SoloEvent } from '../api';
import { GAME_MOVES, PLAY_EVENTS_MAX, type GameEvent } from './events';
import { markMove, quotePoints, revealFor } from './mark';
import { gameTotal, wordHint, type GameKeys, type QuoteKey, type WallKey } from './model';
import { FAKE_SPEAKER } from './schema';
import {
  ROOM_LIMITS,
  type ClientMsg,
  type ControlOp,
  type FoldPayload,
  type PacedItem,
  type Role,
  type RoomAction,
  type RoomConfig,
  type RoomEffect,
  type RoomReducer,
  type RoomState,
  type RestoreGroup,
  type RoomStyle,
  type RoomView,
  type Seat,
  type SeatRestore,
  type ServerMsg,
  type TeamView
} from './room-protocol';
import { rulesFor, type KindControl, type RoomRules, type RulesCtx, type RulesError } from './room-rules';

/**
 * The live game room's rules (spec §3.2): a pure reducer the Durable Object
 * wraps (`workers/game-rooms`), bundled to `_shared/game-room-core.mjs`.
 *
 * - No I/O, no clock, no randomness: every call gets `now`.
 * - The state is updated in place and returned (the room owns its only copy;
 *   copying 35 players' move logs on every move would be the slow part).
 * - The keys live in `state.config.keys`. Nothing here copies a key into a
 *   view or a message: answers reach a phone only as the marker's verdict on
 *   that phone's own move (as in solo play) or at a paced item's reveal.
 *
 * Race (crossword, find-a-word, Connections): every phone plays its own copy;
 * moves are marked by `markMove`, exactly as solo. Paced (Who said it?): the
 * teacher moves the class through the quotes; one answer per seat per quote,
 * scored at the reveal.
 */

export { ROOM_LIMITS };

const RACE_KINDS = new Set(['crossword', 'find_a_word', 'connections']);
const PACED_KINDS = new Set(['who_said_it']);
/** Difficulty → the colour a Connections group shows in (never its label). */
export const GROUP_COLOURS: Record<number, string> = { 1: 'gold', 2: 'green', 3: 'blue', 4: 'purple' };
const TICKER_MAX = 8;
const SEEN_MAX = 200;
const RATE_WINDOW_MS = 10_000;
const CLASS_WALL_MAX = 8;

/** How a kind runs live: race and paced are built in; 'custom' when the kind registered its own rules (room-rules-index.ts). Null: not live yet. */
export function roomStyle(kind: string): RoomStyle | null {
  if (RACE_KINDS.has(kind)) return 'race';
  if (PACED_KINDS.has(kind)) return 'paced';
  if (rulesFor(kind)) return 'custom';
  return null;
}

/** A custom kind's team settings (min, max, default), or null for individual games. Netlify's `open` uses it for the team count. */
export function roomTeams(kind: string): { min: number; max: number; default: number } | null {
  if (RACE_KINDS.has(kind) || PACED_KINDS.has(kind)) return null;
  const t = rulesFor(kind)?.teams;
  return t ? { ...t } : null;
}

const rulesOf = (s: RoomState): RoomRules | undefined => (s.config.style === 'custom' ? rulesFor(s.config.game.kind) : undefined);

/** Team games: how many teams this room plays with (the room config, else the rules' default, kept to the rules' range). 0: not a team game. */
export function teamCount(s: RoomState): number {
  const t = rulesOf(s)?.teams;
  if (!t) return 0;
  const raw = Math.round(Number(s.config.teams?.count ?? t.default));
  return Math.max(t.min, Math.min(t.max, Number.isFinite(raw) ? raw : t.default));
}

const keysOf = (s: RoomState): GameKeys => s.config.keys as GameKeys;
const isStudent = (role: Role) => role === 'student';
const pacedItems = (s: RoomState): string[] => (s.config.game.items ?? []).map((i) => i.id);
/** Seconds per paced item: the room config, else the game's setting, else 20; kept to 5–300. */
function itemSeconds(s: RoomState): number {
  const raw = Number(s.config.item_seconds ?? s.config.game.settings?.seconds);
  return Number.isFinite(raw) && raw > 0 ? Math.max(5, Math.min(300, Math.round(raw))) : ROOM_LIMITS.pacedSeconds;
}

/** FNV-1a of the room id: the room's random seed. */
function seedOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 over `s.rng`: the same sequence every time the room replays. */
function nextRandom(s: { rng?: number }): number {
  const a = ((s.rng ?? 0) + 0x6d2b79f5) >>> 0;
  s.rng = a;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function initialState(config: RoomConfig, now: number): RoomState {
  const s: RoomState = {
    config,
    phase: 'lobby',
    seq: 0,
    seats: {},
    history: {},
    item_index: -1,
    ticker: [],
    board_view: 'race',
    seen: {},
    conns: {},
    students: {},
    kicked: {},
    rate: {},
    last: {},
    first: {},
    at: now,
    rng: seedOf(config.room)
  };
  const rules = rulesOf(s);
  if (rules) {
    if (rules.teams) s.team_scores = {};
    const k = safe(() => rules.init(rulesCtx(s, now, null)));
    s.custom = isRulesError(k) ? {} : k;
  }
  return s;
}

// ─────────────────────────────────────────────────────────────── custom rules

const isRulesError = (x: unknown): x is RulesError => !!x && typeof x === 'object' && 'error' in x && !!(x as RulesError).error && typeof (x as RulesError).error.code === 'string';
const SNAG: RulesError = { error: { code: 'rules_failed', message: 'The game hit a snag. Try that again.' } };
/** A kind's rules must never take the room down: a throw becomes an error the caller can answer with. */
function safe<T>(fn: () => T): T | RulesError {
  try {
    return fn();
  } catch {
    return SNAG;
  }
}

/** Team numbers in use (0-based), from the seats. */
const teamsInUse = (s: RoomState): number[] => [...new Set(Object.values(s.seats).map((x) => x.team).filter((t): t is number => t !== undefined))].sort((a, b) => a - b);

/** The smallest team (fewest seats; the lowest number on a tie). */
function smallestTeam(s: RoomState, count: number): number {
  const size = new Array<number>(count).fill(0);
  for (const seat of Object.values(s.seats)) if (seat.team !== undefined && seat.team < count) size[seat.team] += 1;
  let best = 0;
  for (let t = 1; t < count; t += 1) if (size[t] < size[best]) best = t;
  return best;
}

/** Puts every seat without a team (or on a team past the count) on the smallest team, in join order. */
function fillTeams(s: RoomState): void {
  const count = teamCount(s);
  if (!count) return;
  for (const seat of Object.values(s.seats)) if (seat.team === undefined || seat.team >= count) seat.team = smallestTeam(s, count);
}

/** Deals every seat into teams again: a seeded shuffle, then round-robin. */
function shuffleTeams(s: RoomState): void {
  const count = teamCount(s);
  if (!count) return;
  const seats = Object.values(s.seats);
  for (let i = seats.length - 1; i > 0; i -= 1) {
    const j = Math.floor(nextRandom(s) * (i + 1));
    [seats[i], seats[j]] = [seats[j] as Seat, seats[i] as Seat];
  }
  seats.forEach((seat, i) => (seat.team = i % count));
}

/**
 * The real RulesCtx (core/room-rules.ts) over the room's state. With `fx`
 * null (a view), every write is ignored: `view` only reads.
 */
function rulesCtx(s: RoomState, now: number, fx: Fx | null, random?: () => number): RulesCtx {
  const write = fx !== null;
  const keys = keysOf(s);
  const teamOf = (owner: string) => s.seats[owner]?.team ?? s.kicked?.[owner]?.team;
  const store = (owner: string, event: GameEvent) => {
    const history = (s.history[owner] ??= []);
    if (history.length >= PLAY_EVENTS_MAX) return false;
    const team = teamOf(owner);
    history.push({ ...event, ...(team !== undefined ? { team: String(team) } : {}), seq: history.length } as GameEvent);
    return true;
  };
  const view = { rng: s.rng };
  return {
    now,
    config: s.config,
    game: s.config.game,
    keys,
    random: random ?? (() => (write ? nextRandom(s) : nextRandom(view))),
    seats: () => Object.values(s.seats),
    seat: (owner) => s.seats[owner],
    teams: () => teamsInUse(s),
    members: (team) => Object.values(s.seats).filter((x) => x.team === team).map((x) => x.owner),
    mark(owner, event, strength = 'live_solo') {
      const history = s.history[owner] ?? [];
      if (write && history.length >= PLAY_EVENTS_MAX) return { error: { code: 'too_many', message: 'This game has had enough answers.' } };
      const who = { play_id: s.config.room, owner, ...(s.students?.[owner] ? { student_id: s.students[owner] } : {}), strength };
      const out = markMove(s.config.game, keys, history, event, now, who);
      if (out.error) return { error: { code: 'bad_item', message: 'That isn’t in this game.' } };
      if (write && out.stored) store(owner, out.stored as GameEvent);
      return { result: out.result, stored: out.stored ? ({ ...out.stored } as GameEvent) : null };
    },
    record(owner, event) {
      if (!write) return;
      const { strength, ...rest } = event;
      store(owner, { ...rest, at: now, game: keys.kind, play_id: s.config.room, owner, ...(s.students?.[owner] ? { student_id: s.students[owner] } : {}), strength: strength ?? 'live_solo' } as GameEvent);
    },
    addScore(owner, points) {
      const seat = s.seats[owner];
      if (write && seat && Number.isFinite(points)) seat.score += points;
    },
    setScore(owner, points) {
      const seat = s.seats[owner];
      if (write && seat && Number.isFinite(points)) seat.score = points;
    },
    addTeamScore(team, points) {
      if (!write || !Number.isFinite(points)) return;
      const scores = (s.team_scores ??= {});
      scores[team] = (scores[team] ?? 0) + points;
    },
    teamScore: (team) => s.team_scores?.[team] ?? 0,
    setProgress(owner, progress) {
      const seat = s.seats[owner];
      if (!write || !seat) return;
      if (progress) seat.progress = progress;
      else delete seat.progress;
    },
    ticker(text, initials) {
      if (!write) return;
      s.ticker.unshift({ initials: initials ?? '', text: String(text).slice(0, 120), at: now });
      s.ticker.length = Math.min(s.ticker.length, TICKER_MAX);
    },
    send(owner, msg) {
      if (write) fx.push({ kind: 'send', owner, msg });
    },
    setTimer(endsAt) {
      if (write) s.ends_at = endsAt !== undefined && Number.isFinite(endsAt) ? endsAt : undefined;
    },
    end() {
      if (write) endGame(s, now, fx, { finish: false });
    }
  };
}

/**
 * DEV ONLY: what a simulated classmate does next (`RoomRules.bot`), for the
 * dev preview's fake room. Read-only; `random` is the caller's own.
 */
export function botTurn(s: RoomState, owner: string, now: number, random: () => number): { move: SoloEvent } | { control: KindControl } | null {
  const rules = rulesOf(s);
  if (!rules?.bot) return null;
  const out = safe(() => rules.bot!(rulesCtx(s, now, null, random), s.custom, owner));
  return isRulesError(out) ? null : out;
}

/** Runs one of the kind's hooks with a writing ctx. False when the room has no rules (or no such hook). */
function runRules(s: RoomState, now: number, fx: Fx, hook: (r: RoomRules, ctx: RulesCtx, k: unknown) => unknown): unknown {
  const rules = rulesOf(s);
  if (!rules) return SNAG;
  return safe(() => hook(rules, rulesCtx(s, now, fx), s.custom));
}

// ─────────────────────────────────────────────────────────────── progress

function wallsOf(keys: GameKeys): Array<[string, WallKey]> {
  return Object.entries(keys.items).filter((e): e is [string, WallKey] => e[1].shape === 'wall');
}

function groupDifficulty(keys: GameKeys, groupId: string): number {
  for (const [, w] of wallsOf(keys)) {
    const g = w.groups.find((x) => x.id === groupId);
    if (g) return g.difficulty;
  }
  return 1;
}

const mistakesAllowed = (s: RoomState) => Number(s.config.game.settings?.mistakes) || 4;

/** A race seat's progress and score from its own moves. */
function raceProgress(s: RoomState, owner: string): { progress: NonNullable<Seat['progress']>; score: number; done: boolean } {
  const keys = keysOf(s);
  const events = s.history[owner] ?? [];
  const total = gameTotal(keys);
  if (keys.kind === 'connections') {
    const walls = wallsOf(keys);
    const limit = mistakesAllowed(s);
    const found: string[] = [];
    const wrong = new Map<string, number>();
    let lastWall = walls[0]?.[0] ?? '';
    for (const e of events) {
      if (e.move !== 'guess') continue;
      lastWall = e.item;
      if (e.correct === true && typeof e.extra?.group === 'string' && !found.includes(e.extra.group)) found.push(e.extra.group);
      if (e.correct === false) wrong.set(e.item, (wrong.get(e.item) ?? 0) + 1);
    }
    const over = walls.every(([id, w]) => (wrong.get(id) ?? 0) >= limit || w.groups.every((g) => found.includes(g.id)));
    return {
      progress: { done: found.length, total, mistakes: wrong.get(lastWall) ?? 0, mistakes_max: limit, groups: found.map((g) => groupDifficulty(keys, g)) },
      score: found.length,
      done: walls.length > 0 && over
    };
  }
  const solved = new Set(events.filter((e) => e.correct === true).map((e) => e.item));
  return { progress: { done: solved.size, total }, score: solved.size, done: total > 0 && solved.size >= total };
}

/** Ticker text for the first seat to solve an item: never the answer. */
function firstText(s: RoomState, item: string, group?: string): { key: string; text: string } | null {
  const game = s.config.game;
  if (game.kind === 'connections') {
    if (!group) return null;
    return { key: `g:${group}`, text: `found the ${GROUP_COLOURS[groupDifficulty(keysOf(s), group)] ?? 'gold'} group` };
  }
  if (game.grid?.kind === 'crossword') {
    const entry = game.grid.entries.find((x) => x.item === item);
    return entry ? { key: `i:${item}`, text: `solved ${entry.number} ${entry.dir}` } : null;
  }
  if (game.kind === 'find_a_word') {
    if (keysOf(s).items[item]?.shape === 'question') return { key: `i:${item}`, text: 'answered the hidden message' };
    const at = (game.items ?? []).findIndex((x) => x.id === item);
    return at >= 0 ? { key: `i:${item}`, text: `found word ${at + 1}` } : null;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────── views

function studentSeats(s: RoomState): Seat[] {
  return Object.values(s.seats).sort((a, b) => b.score - a.score || a.initials.localeCompare(b.initials) || a.owner.localeCompare(b.owner));
}

function ranks(s: RoomState): Map<string, number> {
  const out = new Map<string, number>();
  let rank = 0;
  let prev: number | null = null;
  studentSeats(s).forEach((seat, i) => {
    if (seat.score !== prev) rank = i + 1;
    prev = seat.score;
    out.set(seat.owner, rank);
  });
  return out;
}

/** Connections Class wall: tile pairs most often put together wrongly (from different groups). Anonymous. */
export function classWall(s: RoomState): NonNullable<RoomView['class_wall']> {
  const keys = keysOf(s);
  if (keys.kind !== 'connections') return [];
  const counts = new Map<string, { a: string; b: string; count: number }>();
  for (const events of Object.values(s.history)) {
    for (const e of events) {
      if (e.move !== 'guess' || e.correct !== false) continue;
      const wall = keys.items[e.item];
      if (wall?.shape !== 'wall') continue;
      const tiles = ((e.response as { tiles?: unknown })?.tiles as string[] | undefined) ?? [];
      const groupOf = (t: string) => wall.groups.find((g) => g.tiles.includes(t))?.id;
      for (let i = 0; i < tiles.length; i += 1) {
        for (let j = i + 1; j < tiles.length; j += 1) {
          const ti = tiles[i] as string;
          const tj = tiles[j] as string;
          if (groupOf(ti) === groupOf(tj)) continue;
          const [a, b] = [wall.tiles[ti] ?? '', wall.tiles[tj] ?? ''].sort();
          const k = `${a}\u0000${b}`;
          const row = counts.get(k) ?? { a: a as string, b: b as string, count: 0 };
          row.count += 1;
          counts.set(k, row);
        }
      }
    }
  }
  return [...counts.values()].sort((x, y) => y.count - x.count || x.a.localeCompare(y.a)).slice(0, CLASS_WALL_MAX);
}

/**
 * What a race seat's player needs to pick up where it was after a reload:
 * its own solved words (with its own letters or line), hints it used, and
 * its Connections walls. Only from this seat's own history; groups and hint
 * letters only where the room already sent them to this seat.
 */
export function seatRestore(s: RoomState, owner: string): SeatRestore | undefined {
  if (s.config.style !== 'race') return undefined;
  const keys = keysOf(s);
  const events = s.history[owner] ?? [];
  if (!events.length) return undefined;
  if (keys.kind === 'connections') {
    const limit = mistakesAllowed(s);
    const walls: NonNullable<SeatRestore['walls']> = [];
    for (const [id, w] of wallsOf(keys)) {
      const mine = events.filter((e) => e.item === id && e.move === 'guess');
      if (!mine.length) continue;
      const found = new Set<string>();
      const guesses = mine.map((e) => {
        if (e.correct === true && typeof e.extra?.group === 'string') found.add(e.extra.group);
        const tiles = ((e.response as { tiles?: unknown } | undefined)?.tiles as string[] | undefined) ?? [];
        return { tiles: tiles.filter((t) => typeof t === 'string'), correct: e.correct === true };
      });
      const mistakes = guesses.filter((g) => !g.correct).length;
      const out = mistakes >= limit && found.size < w.groups.length;
      const group = (g: WallKey['groups'][number], isFound: boolean): RestoreGroup => ({ id: g.id, label: g.label, why: g.why, difficulty: g.difficulty, tiles: [...g.tiles], found: isFound });
      // Found groups in the order found; once out of mistakes, the rest as the pass shows them.
      const groups = [...found].map((gid) => w.groups.find((g) => g.id === gid)).filter((g): g is WallKey['groups'][number] => !!g).map((g) => group(g, true));
      if (out) groups.push(...w.groups.filter((g) => !found.has(g.id)).sort((a, b) => a.difficulty - b.difficulty).map((g) => group(g, false)));
      walls.push({ wall: id, groups, guesses, mistakes, out });
    }
    return walls.length ? { walls } : undefined;
  }
  const grid = keys.grid ?? null;
  const solved: NonNullable<SeatRestore['solved']> = [];
  const done = new Set<string>();
  const hintCount = new Map<string, number>();
  for (const e of events) {
    if (e.move === 'hint') hintCount.set(e.item, (hintCount.get(e.item) ?? 0) + 1);
    if (e.correct !== true || done.has(e.item) || keys.items[e.item]?.shape !== 'term') continue;
    done.add(e.item);
    const r = (e.response ?? {}) as { text?: unknown; from?: unknown; to?: unknown };
    const hints = Math.min(3, Number(e.extra?.hints) || hintCount.get(e.item) || 0);
    const point = (p: unknown): [number, number] | undefined => (Array.isArray(p) && p.length === 2 && p.every((n) => Number.isInteger(n)) ? [p[0] as number, p[1] as number] : undefined);
    const from = point(r.from);
    const to = point(r.to);
    solved.push({ item: e.item, hints, ...(typeof r.text === 'string' ? { text: r.text.slice(0, 40) } : {}), ...(from && to ? { from, to } : {}) });
  }
  const hints: NonNullable<SeatRestore['hints']> = {};
  for (const [item, n] of hintCount) {
    if (done.has(item)) continue;
    const step = Math.min(3, n);
    hints[item] = { step, ...(grid?.kind === 'wordsearch' && grid.hints !== false ? wordHint(grid, item, step) : {}) };
  }
  const out: SeatRestore = {};
  if (solved.length) out.solved = solved;
  if (Object.keys(hints).length) out.hints = hints;
  // Every word found: the hidden message came back with the last one.
  const terms = Object.entries(keys.items).filter(([, x]) => x.shape === 'term').map(([id]) => id);
  if (grid?.kind === 'wordsearch' && grid.message && terms.length && terms.every((id) => done.has(id))) out.message = grid.message;
  return Object.keys(out).length ? out : undefined;
}

function pacedItemView(s: RoomState): PacedItem | undefined {
  if (!s.item) return undefined;
  const { choices: _choices, ...item } = s.item;
  return { ...item, answered: [...item.answered] };
}

/**
 * What one viewer may see. Students get their own seat, rank and last verdict
 * plus the top-5 leaderboard, never other seats' detail; teacher and board get
 * every seat. Built only from public game fields and the room's own counts.
 */
type Shared = { seq: number; all: Seat[]; rank: Map<string, number>; leaderboard: RoomView['leaderboard']; teams?: TeamView[]; wall?: RoomView['class_wall'] };
/** The parts every viewer shares, worked out once per change (seq), not once per socket. */
const sharedCache = new WeakMap<RoomState, Shared>();
function sharedOf(s: RoomState): Shared {
  const held = sharedCache.get(s);
  if (held && held.seq === s.seq) return held;
  const all = studentSeats(s);
  const rank = ranks(s);
  const shared: Shared = { seq: s.seq, all, rank, leaderboard: all.slice(0, ROOM_LIMITS.leaderboardTop).map((x) => ({ initials: x.initials, score: x.score, rank: rank.get(x.owner) ?? 0 })) };
  const count = teamCount(s);
  if (count) {
    // Team games: the leaderboard is the teams (spec §5.1), members by initials only.
    const rows = Array.from({ length: count }, (_, team) => ({ team, score: s.team_scores?.[team] ?? 0, members: all.filter((x) => x.team === team).sort((a, b) => a.initials.localeCompare(b.initials)).map((x) => x.initials), rank: 0 }));
    const sorted = rows.slice().sort((a, b) => b.score - a.score || a.team - b.team);
    sorted.forEach((r, i) => (r.rank = i > 0 && sorted[i - 1]!.score === r.score ? sorted[i - 1]!.rank : i + 1));
    shared.teams = rows;
    shared.leaderboard = sorted.map((r) => ({ initials: `Team ${r.team + 1}`, score: r.score, rank: r.rank, team: r.team }));
  }
  sharedCache.set(s, shared);
  return shared;
}

export function publicView(state: RoomState, role: Role, owner: string, now: number = state.at ?? 0, opts: { restore?: boolean } = {}): RoomView {
  const s = state;
  const shared = sharedOf(s);
  const { all, rank } = shared;
  const view: RoomView = {
    room: s.config.room,
    code: s.config.code,
    kind: s.config.game.kind,
    style: s.config.style,
    title: s.config.game.title,
    phase: s.phase,
    now,
    ...(s.ends_at !== undefined && s.phase !== 'paused' ? { ends_at: s.ends_at } : {}),
    seats: isStudent(role) ? [] : all.map((x) => ({ ...x, ...(x.progress ? { progress: { ...x.progress, ...(x.progress.groups ? { groups: [...x.progress.groups] } : {}) } } : {}) })),
    ticker: s.config.style !== 'paced' ? s.ticker.slice(0, TICKER_MAX) : [],
    leaderboard: shared.leaderboard.map((x) => ({ ...x })),
    board_view: s.board_view,
    seq: s.seq
  };
  const item = pacedItemView(s);
  if (item) view.item = item;
  if (s.phase === 'paused' && s.paused_left_ms !== undefined) view.paused_left_ms = s.paused_left_ms;
  if (shared.teams) {
    const mine = isStudent(role) ? s.seats[owner]?.team : undefined;
    view.teams = shared.teams.map((t) => ({ ...t, members: !isStudent(role) || t.team === mine ? [...t.members] : [] }));
  }
  const rules = rulesOf(s);
  if (rules) {
    // The kind's own part: built fresh per viewer; a throw shows nothing rather than breaking the view.
    const part = safe(() => rules.view(rulesCtx(s, now, null), s.custom, role, owner));
    if (!isRulesError(part) && part !== undefined) view.kind_view = part;
  }
  if (isStudent(role)) {
    const seat = s.seats[owner];
    const last = s.last?.[owner];
    const restore = opts.restore && seat ? seatRestore(s, owner) : undefined;
    view.you = { owner, ...(seat ? { seat: { ...seat } } : {}), ...(last ? { last } : {}), ...(seat ? { rank: rank.get(owner) ?? 0 } : {}), ...(restore ? { restore } : {}) };
  } else {
    view.you = { owner };
    if (s.config.game.kind === 'connections' && (role === 'teacher' || s.board_view === 'class_wall' || s.phase === 'ended' || s.phase === 'folded')) view.class_wall = (shared.wall ??= classWall(s));
  }
  return view;
}

/**
 * The top-level fields that changed between two views of the same viewer, for
 * a `delta`. Null: a field was removed (an item closed, a timer stopped), so
 * send a snapshot instead.
 */
export function viewDelta(prev: RoomView, next: RoomView): Partial<RoomView> | null {
  const patch: Record<string, unknown> = {};
  for (const k of Object.keys(prev)) if (!(k in next)) return null;
  for (const [k, v] of Object.entries(next)) {
    if (k === 'now' || k === 'seq') continue;
    if (JSON.stringify((prev as Record<string, unknown>)[k]) !== JSON.stringify(v)) patch[k] = v;
  }
  return patch as Partial<RoomView>;
}

/** When the room next needs a tick (countdown end, item end, the 6 h limit), server ms. Null once ended. */
export function nextAlarm(s: RoomState): number | null {
  if (s.phase === 'ended' || s.phase === 'folded') return null;
  const life = s.config.opened_at + ROOM_LIMITS.lifeMs;
  if ((s.phase === 'countdown' || s.phase === 'playing') && s.ends_at !== undefined) return Math.min(s.ends_at, life);
  return life;
}

/** The fold: every seat that played, and every stored move (with the room id as play id). */
export function foldPayload(s: RoomState): FoldPayload {
  const seats = [...Object.values(s.seats), ...Object.values(s.kicked ?? {})];
  const events: GameEvent[] = [];
  for (const [owner, list] of Object.entries(s.history)) {
    for (const e of list) {
      const { reply: _reply, ...rest } = e as GameEvent & { reply?: unknown };
      events.push({ ...rest, owner });
    }
  }
  return {
    room: s.config.room,
    lesson_id: s.config.lesson_id,
    class_id: s.config.class_id,
    game_id: s.config.game.id,
    kind: s.config.game.kind,
    started_at: s.started_at ?? s.config.opened_at,
    ended_at: s.ended_at ?? s.at ?? s.config.opened_at,
    strength: 'live_solo',
    seats: seats.map((x) => ({ owner: x.owner, ...(s.students?.[x.owner] ? { student_id: s.students[x.owner] } : {}), initials: x.initials, ...(x.team !== undefined ? { team: x.team } : {}), score: x.score })),
    ...(s.team_scores ? { team_scores: { ...s.team_scores } } : {}),
    events
  };
}

// ─────────────────────────────────────────────────────────────── reducer

type Fx = RoomEffect[];
const ack = (fx: Fx, owner: string, conn: string | undefined, rid: string | undefined, body: { result?: EventResult; error?: { code: string; message: string } }) =>
  fx.push({ kind: 'send', owner, ...(conn ? { conn } : {}), msg: { t: 'ack', ...(rid ? { rid } : {}), ...body } });
const fail = (fx: Fx, owner: string, conn: string | undefined, rid: string | undefined, code: string, message: string) => ack(fx, owner, conn, rid, { error: { code, message } });

function remember(s: RoomState, owner: string, rid: string | undefined, result: EventResult | null) {
  if (!rid) return;
  const mine = (s.seen[owner] ??= {});
  mine[rid] = result;
  const ids = Object.keys(mine);
  if (ids.length > SEEN_MAX) for (const id of ids.slice(0, ids.length - SEEN_MAX)) delete mine[id];
}

function newSeat(s: RoomState, owner: string, initials: string): Seat {
  const seat: Seat = { owner, initials, connected: true, score: 0 };
  if (s.config.style === 'race') seat.progress = raceProgress(s, owner).progress;
  else if (s.config.style === 'paced') seat.progress = { done: 0, total: pacedItems(s).length };
  // Team games: everyone joins the smallest team (round-robin by join order); late joiners too.
  const count = teamCount(s);
  if (count) seat.team = smallestTeam(s, count);
  return seat;
}

function openItem(s: RoomState, index: number, now: number) {
  const ids = pacedItems(s);
  const id = ids[index];
  if (id === undefined) return;
  const ends = now + itemSeconds(s) * 1000;
  s.item_index = index;
  s.item = { item: id, index, of: ids.length, opened_at: now, ends_at: ends, answered: [], choices: {} };
  s.ends_at = ends;
}

/** Closes the paced item: the class's spread of choices, the answer, and each seat's points. */
function revealItem(s: RoomState) {
  const item = s.item;
  if (!item || item.revealed) return;
  const key = keysOf(s).items[item.item];
  const counts: Record<string, number> = {};
  for (const c of Object.values(item.choices)) counts[c.choice] = (counts[c.choice] ?? 0) + 1;
  const reveal = key ? revealFor(keysOf(s).kind, key, {}) : undefined;
  item.revealed = { counts, reveal };
  const fake = key?.shape === 'quote' && (key as QuoteKey).speaker === FAKE_SPEAKER;
  const seconds = itemSeconds(s);
  for (const [owner, seat] of Object.entries(s.seats)) {
    const choice = item.choices[owner];
    const event = choice ? [...(s.history[owner] ?? [])].reverse().find((e) => e.item === item.item && e.move === 'answer') : undefined;
    const correct = event?.correct === true;
    if (choice) {
      seat.score += quotePoints(correct, fake, Math.max(0, choice.at - item.opened_at), seconds);
      if (correct && seat.progress) seat.progress = { ...seat.progress, done: seat.progress.done + 1 };
    }
    (s.last ??= {})[owner] = { item: item.item, ...(choice ? { correct } : {}), ...(reveal ? { reveal } : {}) };
  }
  s.ends_at = undefined;
}

function endGame(s: RoomState, now: number, fx: Fx, opts: { finish?: boolean } = {}) {
  if (s.phase === 'ended' || s.phase === 'folded') return;
  if (s.config.style === 'paced') revealItem(s);
  // The teacher (or the 6 h limit) ends a custom game: the kind reveals anything open and awards final points first.
  if (s.config.style === 'custom' && opts.finish !== false && rulesOf(s)?.finish) {
    runRules(s, now, fx, (r, ctx, k) => r.finish?.(ctx, k));
    // The rules may have ended it themselves (ctx.end): that already folded.
    if ((s.phase as RoomState['phase']) === 'ended') return;
  }
  s.phase = 'ended';
  s.ended_at = now;
  s.ends_at = undefined;
  s.paused_left_ms = undefined;
  fx.push({ kind: 'fold', payload: foldPayload(s) });
}

function onConnect(s: RoomState, a: Extract<RoomAction, { type: 'connect' }>, now: number, fx: Fx): boolean {
  const { owner, role, conn } = a;
  const close = (msg: ServerMsg) => fx.push({ kind: 'close', owner, ...(conn ? { conn } : {}), msg });
  let changed = false;
  if (isStudent(role)) {
    if (s.kicked?.[owner]) return close({ t: 'kicked' }), false;
    const initials = a.student_id ? s.config.roster[a.student_id] : undefined;
    if (!a.student_id || !initials) return close({ t: 'error', code: 'not_on_list', message: 'You’re not on this class list. Ask your teacher.' }), false;
    const seat = s.seats[owner];
    if (seat) {
      if (!seat.connected) changed = true;
      seat.connected = true;
    } else if (s.phase !== 'ended' && s.phase !== 'folded') {
      if (Object.keys(s.seats).length >= ROOM_LIMITS.seats) return close({ t: 'error', code: 'room_full', message: 'This game is full.' }), false;
      // Late joiners are welcome: they start on 0.
      s.seats[owner] = newSeat(s, owner, initials);
      s.history[owner] ??= [];
      (s.students ??= {})[owner] = a.student_id;
      changed = true;
    }
    // A custom game under way hears about a late joiner or a reconnect (e.g. to deal them in).
    if (changed) seatChanged(s, owner, now, fx);
  }
  const conns = (s.conns ??= {});
  const old = conns[owner];
  // Newest wins: the older device is told and closed.
  if (old && conn && old !== conn) fx.push({ kind: 'close', owner, conn: old, msg: { t: 'replaced' } });
  if (conn) conns[owner] = conn;
  // The connect snapshot carries the seat's own progress, so a reloaded phone restores its player.
  fx.push({ kind: 'send', owner, ...(conn ? { conn } : {}), msg: { t: 'snapshot', view: publicView(s, role, owner, now, { restore: true }) } });
  return changed;
}

/** A custom game under way hears that a seat joined late, came back, dropped or was removed. */
function seatChanged(s: RoomState, owner: string, now: number, fx: Fx): void {
  if (s.config.style === 'custom' && (s.phase === 'playing' || s.phase === 'paused') && rulesOf(s)?.seatChanged) runRules(s, now, fx, (r, ctx, k) => r.seatChanged?.(ctx, k, owner));
}

function onDisconnect(s: RoomState, a: Extract<RoomAction, { type: 'disconnect' }>, now: number, fx: Fx): boolean {
  const conns = (s.conns ??= {});
  // A replaced socket closing late doesn't take the seat offline.
  if (a.conn && conns[a.owner] && conns[a.owner] !== a.conn) return false;
  delete conns[a.owner];
  const seat = s.seats[a.owner];
  if (!seat || !seat.connected) return false;
  seat.connected = false;
  seatChanged(s, a.owner, now, fx);
  return true;
}

function rateLimited(s: RoomState, owner: string, now: number, burst: number = ROOM_LIMITS.burst): boolean {
  const rate = (s.rate ??= {});
  const r = rate[owner];
  if (!r || now - r.at >= RATE_WINDOW_MS) {
    rate[owner] = { at: now, n: 1 };
    return false;
  }
  r.n += 1;
  return r.n > burst;
}

function validMove(ev: unknown): ev is SoloEvent {
  if (!ev || typeof ev !== 'object' || Array.isArray(ev)) return false;
  const e = ev as Record<string, unknown>;
  if (typeof e.item !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(e.item)) return false;
  if (typeof e.move !== 'string' || !(GAME_MOVES as readonly string[]).includes(e.move)) return false;
  if (e.cid !== undefined && (typeof e.cid !== 'string' || !/^[A-Za-z0-9_-]{6,40}$/.test(e.cid))) return false;
  if (e.time_ms !== undefined && (typeof e.time_ms !== 'number' || !Number.isInteger(e.time_ms) || e.time_ms < 0 || e.time_ms > 3_600_000)) return false;
  if (e.extra !== undefined && (typeof e.extra !== 'object' || e.extra === null || Array.isArray(e.extra) || Object.keys(e.extra).length > 20)) return false;
  try {
    if (JSON.stringify(e.response ?? null).length > 2000) return false;
  } catch {
    return false;
  }
  return true;
}

const PHASE_ERRORS: Partial<Record<RoomState['phase'], [string, string]>> = {
  lobby: ['not_started', 'The game hasn’t started yet.'],
  countdown: ['not_started', 'Nearly: the game is about to start.'],
  paused: ['paused', 'The game is paused.'],
  ended: ['ended', 'This game has finished.'],
  folded: ['ended', 'This game has finished.']
};

/** Returns true when the move changed what everyone sees. */
function onMove(s: RoomState, owner: string, conn: string | undefined, msg: Extract<ClientMsg, { t: 'move' }>, now: number, fx: Fx): boolean {
  const seat = s.seats[owner];
  if (!seat) return fail(fx, owner, conn, msg.rid, 'no_seat', 'Join the game first.'), false;
  const phaseError = PHASE_ERRORS[s.phase];
  if (phaseError) return fail(fx, owner, conn, msg.rid, phaseError[0], phaseError[1]), false;
  if (!validMove(msg.event)) return fail(fx, owner, conn, msg.rid, 'bad_event', 'That move couldn’t be read.'), false;
  const history = (s.history[owner] ??= []);
  if (history.length >= PLAY_EVENTS_MAX) return fail(fx, owner, conn, msg.rid, 'too_many', 'This game has had enough answers.'), false;
  const keys = keysOf(s);
  const who = { play_id: s.config.room, owner, ...(s.students?.[owner] ? { student_id: s.students[owner] } : {}), strength: 'live_solo' as const };

  if (s.config.style === 'custom') {
    const out = runRules(s, now, fx, (r, ctx, k) => r.move(ctx, k, owner, msg.event));
    if (isRulesError(out)) return fail(fx, owner, conn, msg.rid, out.error.code, out.error.message), false;
    const result = (out && typeof out === 'object' ? out : { item: msg.event.item }) as EventResult;
    remember(s, owner, msg.rid, result);
    (s.last ??= {})[owner] = result;
    ack(fx, owner, conn, msg.rid, { result });
    return true;
  }

  if (s.config.style === 'paced') {
    const item = s.item;
    if (!item || item.revealed || msg.event.item !== item.item) return fail(fx, owner, conn, msg.rid, 'not_open', 'That quote has closed.'), false;
    if (msg.event.move !== 'answer') return fail(fx, owner, conn, msg.rid, 'bad_event', 'Pick an answer.'), false;
    if (item.choices[owner]) return fail(fx, owner, conn, msg.rid, 'answered', 'You’ve already answered this one.'), false;
    // Time from the room's own clock: the item opened on the server.
    const event = { ...msg.event, time_ms: Math.min(3_600_000, Math.max(0, now - item.opened_at)) };
    const { stored, error } = markMove(s.config.game, keys, history, event, now, who);
    if (error || !stored) return fail(fx, owner, conn, msg.rid, 'bad_item', 'That isn’t in this game.'), false;
    history.push({ ...stored, seq: history.length } as GameEvent);
    const r = stored.response as { speaker?: unknown; text?: unknown } | undefined;
    const choice = typeof r?.speaker === 'string' ? r.speaker : 'text';
    item.choices[owner] = { choice, at: now };
    item.answered.push(owner);
    // Received, not marked: right or wrong waits for the reveal.
    const result: EventResult = { item: item.item };
    remember(s, owner, msg.rid, result);
    ack(fx, owner, conn, msg.rid, { result });
    const live = Object.values(s.seats).filter((x) => x.connected);
    if (live.length > 0 && live.every((x) => item.choices[x.owner])) revealItem(s);
    return true;
  }

  const { result, stored, error } = markMove(s.config.game, keys, history, msg.event, now, who);
  if (error) return fail(fx, owner, conn, msg.rid, 'bad_item', 'That isn’t in this game.'), false;
  remember(s, owner, msg.rid, result);
  (s.last ??= {})[owner] = result;
  ack(fx, owner, conn, msg.rid, { result });
  if (!stored) return false;
  history.push({ ...stored, seq: history.length } as GameEvent);
  const p = raceProgress(s, owner);
  seat.progress = p.progress;
  seat.score = p.score;
  if (p.done) seat.finished = true;
  if (stored.correct === true) {
    const first = firstText(s, stored.item, typeof stored.extra?.group === 'string' ? stored.extra.group : undefined);
    if (first && !s.first?.[first.key]) {
      (s.first ??= {})[first.key] = true;
      s.ticker.unshift({ initials: seat.initials, text: first.text, at: now });
      s.ticker.length = Math.min(s.ticker.length, TICKER_MAX);
    }
  }
  return true;
}

const CONTROL_NAME = /^[A-Za-z0-9_-]{1,40}$/;

/** A control the kind's rules handle ('next', 'reveal', or `{ op: 'kind' }`). Returns an error, or null when it went through. */
function kindControl(s: RoomState, owner: string, role: Role, op: ControlOp, now: number, fx: Fx): RulesError | null {
  const rules = rulesOf(s);
  if (!rules?.control) return { error: { code: 'bad_control', message: 'This game has no such control.' } };
  const name = op.op === 'kind' ? op.name : op.op;
  if (typeof name !== 'string' || !CONTROL_NAME.test(name)) return { error: { code: 'bad_control', message: 'Unknown control.' } };
  const data = op.op === 'kind' ? op.data : undefined;
  try {
    if (data !== undefined && JSON.stringify(data).length > 4000) return { error: { code: 'bad_control', message: 'That was too much to send at once.' } };
  } catch {
    return { error: { code: 'bad_control', message: 'That couldn’t be read.' } };
  }
  if (s.phase === 'ended' || s.phase === 'folded') return { error: { code: 'ended', message: 'This game has finished.' } };
  if (s.phase === 'paused') return { error: { code: 'paused', message: 'The game is paused.' } };
  if (s.phase === 'countdown') return { error: { code: 'not_started', message: 'Nearly: the game is about to start.' } };
  // In the lobby only the teacher's own kind buttons (setting up), never a phone's or 'next'.
  if (s.phase === 'lobby' && (isStudent(role) || op.op !== 'kind')) return { error: { code: 'not_started', message: 'The game hasn’t started yet.' } };
  const control: KindControl = { name, ...(data !== undefined ? { data } : {}) };
  const out = runRules(s, now, fx, (r, ctx, k) => r.control?.(ctx, k, control, { owner, role }));
  return isRulesError(out) ? out : null;
}

function onControl(s: RoomState, owner: string, role: Role, conn: string | undefined, rid: string | undefined, op: ControlOp, now: number, fx: Fx): boolean {
  const ok = () => {
    remember(s, owner, rid, null);
    ack(fx, owner, conn, rid, {});
    return true;
  };
  const no = (code: string, message: string) => (fail(fx, owner, conn, rid, code, message), false);
  const paced = s.config.style === 'paced';
  if (s.config.style === 'custom' && (op.op === 'kind' || op.op === 'next' || op.op === 'reveal')) {
    const err = kindControl(s, owner, role, op, now, fx);
    return err ? no(err.error.code, err.error.message) : ok();
  }
  switch (op.op) {
    case 'start':
      if (s.phase !== 'lobby') return no('started', 'The game has already started.');
      s.phase = 'countdown';
      s.ends_at = now + ROOM_LIMITS.countdownMs;
      return ok();
    case 'pause':
      if (s.phase !== 'playing') return no('not_playing', 'Only a running game can pause.');
      s.phase = 'paused';
      s.paused_left_ms = s.ends_at !== undefined ? Math.max(0, s.ends_at - now) : undefined;
      return ok();
    case 'resume': {
      if (s.phase !== 'paused') return no('not_paused', 'The game isn’t paused.');
      s.phase = 'playing';
      if (s.paused_left_ms !== undefined) {
        const ends = now + s.paused_left_ms;
        if (s.item && !s.item.revealed) {
          // The paused time doesn't count against anyone's speed.
          const shift = ends - s.item.ends_at;
          s.item.opened_at += shift;
          s.item.ends_at = ends;
          for (const c of Object.values(s.item.choices)) c.at += shift;
        }
        s.ends_at = ends;
      }
      s.paused_left_ms = undefined;
      return ok();
    }
    case 'add_time': {
      const ms = Math.max(1, Math.min(300, Math.round(Number(op.seconds) || 0))) * 1000;
      if (s.phase === 'paused' && s.paused_left_ms !== undefined) s.paused_left_ms += ms;
      else if ((s.phase === 'playing' || s.phase === 'countdown') && s.ends_at !== undefined) s.ends_at += ms;
      else return no('no_timer', 'There’s no timer running.');
      if (s.item && !s.item.revealed && s.phase !== 'paused') s.item.ends_at = s.ends_at as number;
      if (s.item && !s.item.revealed && s.phase === 'paused') s.item.ends_at += ms;
      return ok();
    }
    case 'reveal':
      if (!paced) return no('not_paced', 'Each player sees their own answers in this game.');
      if (s.phase !== 'playing' || !s.item || s.item.revealed) return no('not_open', 'Nothing to reveal.');
      revealItem(s);
      return ok();
    case 'next': {
      if (!paced) return no('not_paced', 'Everyone plays at their own pace in this game.');
      if (s.phase !== 'playing') return no('not_playing', 'Start or resume the game first.');
      revealItem(s);
      const at = s.item_index + 1;
      if (at >= pacedItems(s).length) endGame(s, now, fx);
      else openItem(s, at, now);
      return ok();
    }
    case 'kick': {
      const seat = s.seats[op.owner];
      if (!seat) return no('no_seat', 'That player isn’t here.');
      delete s.seats[op.owner];
      (s.kicked ??= {})[op.owner] = { ...seat, connected: false };
      if (s.conns) delete s.conns[op.owner];
      if (s.item) s.item.answered = s.item.answered.filter((x) => x !== op.owner);
      fx.push({ kind: 'close', owner: op.owner, msg: { t: 'kicked' } });
      seatChanged(s, op.owner, now, fx);
      return ok();
    }
    case 'move_team': {
      const count = teamCount(s);
      if (!count) return no('no_teams', 'This game isn’t played in teams.');
      if (s.phase !== 'lobby') return no('started', 'Teams are set once the game starts.');
      const seat = s.seats[op.owner];
      if (!seat) return no('no_seat', 'That player isn’t here.');
      const team = Number(op.team);
      if (!Number.isInteger(team) || team < 0 || team >= count) return no('bad_team', 'There’s no such team.');
      seat.team = team;
      return ok();
    }
    case 'shuffle_teams':
      if (!teamCount(s)) return no('no_teams', 'This game isn’t played in teams.');
      if (s.phase !== 'lobby') return no('started', 'Teams are set once the game starts.');
      shuffleTeams(s);
      return ok();
    case 'board_view':
      if (op.view !== 'race' && op.view !== 'class_wall') return no('bad_view', 'Unknown view.');
      s.board_view = op.view;
      return ok();
    case 'end':
      if (s.phase === 'ended' || s.phase === 'folded') return no('ended', 'This game has finished.');
      endGame(s, now, fx);
      return ok();
    default:
      return no('bad_control', 'Unknown control.');
  }
}

function onMsg(s: RoomState, a: Extract<RoomAction, { type: 'msg' }>, now: number, fx: Fx): boolean {
  const { owner, role, msg, conn } = a;
  if (!msg || typeof msg !== 'object' || typeof (msg as { t?: unknown }).t !== 'string') {
    fx.push({ kind: 'send', owner, ...(conn ? { conn } : {}), msg: { t: 'error', code: 'bad_message', message: 'That message couldn’t be read.' } });
    return false;
  }
  const rid = typeof msg.rid === 'string' ? msg.rid.slice(0, 64) : undefined;
  if (msg.t === 'ping') {
    fx.push({ kind: 'send', owner, ...(conn ? { conn } : {}), msg: { t: 'pong', ...(rid ? { rid } : {}), sent: Number(msg.sent) || 0, now } });
    return false;
  }
  if (rateLimited(s, owner, now, rulesOf(s)?.burst ?? ROOM_LIMITS.burst)) return fail(fx, owner, conn, rid, 'slow_down', 'Too many moves at once. Wait a moment.'), false;
  if (rid && s.seen[owner] && rid in s.seen[owner]) {
    // A resent message: answered from what the room already decided, never applied twice.
    const result = s.seen[owner][rid];
    ack(fx, owner, conn, rid, result ? { result } : {});
    return false;
  }
  switch (msg.t) {
    case 'hello':
      fx.push({ kind: 'send', owner, ...(conn ? { conn } : {}), msg: { t: 'snapshot', view: publicView(s, role, owner, now, { restore: true }) } });
      return false;
    case 'move':
      if (!isStudent(role)) return fail(fx, owner, conn, rid, 'not_a_player', 'Only players make moves.'), false;
      return onMove(s, owner, conn, { ...msg, ...(rid ? { rid } : {}) }, now, fx);
    case 'finish': {
      const seat = s.seats[owner];
      if (!isStudent(role) || !seat) return fail(fx, owner, conn, rid, 'no_seat', 'Join the game first.'), false;
      remember(s, owner, rid, null);
      ack(fx, owner, conn, rid, {});
      if (seat.finished) return false;
      seat.finished = true;
      return true;
    }
    case 'control': {
      const op = msg.op ?? ({} as ControlOp);
      if (isStudent(role)) {
        // A phone may send the kind's own actions (a captain's pick); the rules decide what a student may do.
        if (s.config.style !== 'custom' || op.op !== 'kind') return fail(fx, owner, conn, rid, 'not_allowed', 'Only your teacher can do that.'), false;
        if (!s.seats[owner]) return fail(fx, owner, conn, rid, 'no_seat', 'Join the game first.'), false;
      }
      return onControl(s, owner, role, conn, rid, op, now, fx);
    }
    default:
      return fail(fx, owner, conn, rid, 'bad_message', 'That message couldn’t be read.'), false;
  }
}

function onTick(s: RoomState, now: number, fx: Fx): boolean {
  if (s.phase === 'ended' || s.phase === 'folded') return false;
  if (now >= s.config.opened_at + ROOM_LIMITS.lifeMs) {
    endGame(s, now, fx);
    return true;
  }
  if (s.phase === 'countdown' && s.ends_at !== undefined && now >= s.ends_at) {
    s.phase = 'playing';
    s.started_at = now;
    s.ends_at = undefined;
    if (s.config.style === 'paced') openItem(s, 0, now);
    if (s.config.style === 'custom') {
      fillTeams(s);
      runRules(s, now, fx, (r, ctx, k) => r.start(ctx, k));
    }
    return true;
  }
  // A custom game's timer (set with ctx.setTimer) has passed: the kind's tick.
  if (s.config.style === 'custom' && s.phase === 'playing' && s.ends_at !== undefined && now >= s.ends_at) {
    s.ends_at = undefined;
    runRules(s, now, fx, (r, ctx, k) => r.tick?.(ctx, k));
    return true;
  }
  if (s.phase === 'playing' && s.item && !s.item.revealed && now >= s.item.ends_at) {
    revealItem(s);
    return true;
  }
  return false;
}

export const reduce: RoomReducer = (state, action, now) => {
  const s = state;
  const fx: Fx = [];
  const alarmBefore = nextAlarm(s);
  // Views built during this action (a joiner's snapshot) must see it: drop the per-change cache first.
  sharedCache.delete(s);
  s.at = now;
  let changed = false;
  switch (action.type) {
    case 'connect':
      changed = onConnect(s, action, now, fx);
      break;
    case 'disconnect':
      changed = onDisconnect(s, action, now, fx);
      break;
    case 'msg':
      changed = onMsg(s, action, now, fx);
      break;
    case 'tick':
      changed = onTick(s, now, fx);
      break;
    case 'folded':
      if (s.phase !== 'folded') {
        s.phase = 'folded';
        s.folded = true;
        changed = true;
      }
      break;
  }
  if (changed) {
    s.seq += 1;
    fx.push({ kind: 'broadcast' });
  }
  const alarmAfter = nextAlarm(s);
  if (alarmAfter !== null && alarmAfter !== alarmBefore) fx.push({ kind: 'alarm', at: alarmAfter });
  return { state: s, effects: fx };
};
