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
  type RoomView,
  type Seat,
  type SeatRestore,
  type ServerMsg
} from './room-protocol';

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

export function roomStyle(kind: string): 'race' | 'paced' | null {
  if (RACE_KINDS.has(kind)) return 'race';
  if (PACED_KINDS.has(kind)) return 'paced';
  return null;
}

const keysOf = (s: RoomState): GameKeys => s.config.keys as GameKeys;
const isStudent = (role: Role) => role === 'student';
const pacedItems = (s: RoomState): string[] => (s.config.game.items ?? []).map((i) => i.id);
/** Seconds per paced item: the room config, else the game's setting, else 20; kept to 5–300. */
function itemSeconds(s: RoomState): number {
  const raw = Number(s.config.item_seconds ?? s.config.game.settings?.seconds);
  return Number.isFinite(raw) && raw > 0 ? Math.max(5, Math.min(300, Math.round(raw))) : ROOM_LIMITS.pacedSeconds;
}

export function initialState(config: RoomConfig, now: number): RoomState {
  return {
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
    at: now
  };
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
type Shared = { seq: number; all: Seat[]; rank: Map<string, number>; leaderboard: RoomView['leaderboard']; wall?: RoomView['class_wall'] };
/** The parts every viewer shares, worked out once per change (seq), not once per socket. */
const sharedCache = new WeakMap<RoomState, Shared>();
function sharedOf(s: RoomState): Shared {
  const held = sharedCache.get(s);
  if (held && held.seq === s.seq) return held;
  const all = studentSeats(s);
  const rank = ranks(s);
  const shared: Shared = { seq: s.seq, all, rank, leaderboard: all.slice(0, ROOM_LIMITS.leaderboardTop).map((x) => ({ initials: x.initials, score: x.score, rank: rank.get(x.owner) ?? 0 })) };
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
    ticker: s.config.style === 'race' ? s.ticker.slice(0, TICKER_MAX) : [],
    leaderboard: shared.leaderboard.map((x) => ({ ...x })),
    board_view: s.board_view,
    seq: s.seq
  };
  const item = pacedItemView(s);
  if (item) view.item = item;
  if (s.phase === 'paused' && s.paused_left_ms !== undefined) view.paused_left_ms = s.paused_left_ms;
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
  else seat.progress = { done: 0, total: pacedItems(s).length };
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

function endGame(s: RoomState, now: number, fx: Fx) {
  if (s.phase === 'ended' || s.phase === 'folded') return;
  if (s.config.style === 'paced') revealItem(s);
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

function onDisconnect(s: RoomState, a: Extract<RoomAction, { type: 'disconnect' }>): boolean {
  const conns = (s.conns ??= {});
  // A replaced socket closing late doesn't take the seat offline.
  if (a.conn && conns[a.owner] && conns[a.owner] !== a.conn) return false;
  delete conns[a.owner];
  const seat = s.seats[a.owner];
  if (!seat || !seat.connected) return false;
  seat.connected = false;
  return true;
}

function rateLimited(s: RoomState, owner: string, now: number): boolean {
  const rate = (s.rate ??= {});
  const r = rate[owner];
  if (!r || now - r.at >= RATE_WINDOW_MS) {
    rate[owner] = { at: now, n: 1 };
    return false;
  }
  r.n += 1;
  return r.n > ROOM_LIMITS.burst;
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

function onControl(s: RoomState, owner: string, conn: string | undefined, rid: string | undefined, op: ControlOp, now: number, fx: Fx): boolean {
  const ok = () => {
    remember(s, owner, rid, null);
    ack(fx, owner, conn, rid, {});
    return true;
  };
  const no = (code: string, message: string) => (fail(fx, owner, conn, rid, code, message), false);
  const paced = s.config.style === 'paced';
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
      return ok();
    }
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
  if (rateLimited(s, owner, now)) return fail(fx, owner, conn, rid, 'slow_down', 'Too many moves at once. Wait a moment.'), false;
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
    case 'control':
      if (isStudent(role)) return fail(fx, owner, conn, rid, 'not_allowed', 'Only your teacher can do that.'), false;
      return onControl(s, owner, conn, rid, msg.op ?? ({} as ControlOp), now, fx);
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
      changed = onDisconnect(s, action);
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
