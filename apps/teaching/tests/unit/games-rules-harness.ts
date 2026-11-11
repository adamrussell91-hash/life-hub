/**
 * Test harness for per-kind room rules (core/room-rules.ts): a RulesCtx over
 * plain objects, so a kind's rules can be driven move by move in Vitest
 * without room-core, sockets or the Worker. Not a test file itself.
 *
 *   const h = rulesHarness(rules, game, { seats: ['AB', 'CD', 'EF'], teams: 2 });
 *   h.start(); h.move('AB', { item: 'q1', move: 'answer', response: {...} }); h.control('next');
 *   h.view('student', 'AB'); h.events; h.scores; h.sent; h.timer; h.ended
 */

import type { EventResult, SoloEvent } from '@/games/api';
import { markMove } from '@/games/core/mark';
import { splitGame, type GameKeys } from '@/games/core/model';
import type { GameEvent } from '@/games/core/events';
import type { Game, PublicGame } from '@/games/core/schema';
import type { Role, RoomConfig, Seat, ServerMsg } from '@/games/core/room-protocol';
import type { KindControl, RoomRules, RulesCtx, RulesError } from '@/games/core/room-rules';

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Harness<K> = {
  ctx: RulesCtx;
  k: K;
  game: PublicGame;
  keys: GameKeys;
  seats: Record<string, Seat>;
  teamScores: Record<number, number>;
  events: GameEvent[];
  sent: Array<{ owner: string; msg: ServerMsg }>;
  ticker: Array<{ text: string; initials?: string }>;
  timer: number | undefined;
  ended: boolean;
  now: number;
  advance(ms: number): void;
  start(): void;
  move(initials: string, event: SoloEvent): EventResult | RulesError;
  control(name: string, data?: unknown, from?: { owner: string; role: Role }): void | RulesError;
  tick(): void;
  finish(): void;
  view(role: Role, owner: string): unknown;
};

/** `seats` are initials; each seat's owner is `o_<initials>`. With `teams`, seats are dealt round-robin into that many teams. */
export function rulesHarness<K>(rules: RoomRules<K>, full: Game, opts: { seats: string[]; teams?: number; seed?: number; now?: number } = { seats: [] }): Harness<K> {
  const random = seeded(opts.seed ?? 7);
  const { public: game, keys } = splitGame(full, seeded(11));
  const h = {
    game,
    keys,
    seats: {} as Record<string, Seat>,
    teamScores: {} as Record<number, number>,
    events: [] as GameEvent[],
    sent: [] as Array<{ owner: string; msg: ServerMsg }>,
    ticker: [] as Array<{ text: string; initials?: string }>,
    timer: undefined as number | undefined,
    ended: false,
    now: opts.now ?? 1_800_000_000_000
  } as Harness<K>;
  opts.seats.forEach((ini, i) => {
    h.seats[`o_${ini}`] = { owner: `o_${ini}`, initials: ini, connected: true, score: 0, ...(opts.teams ? { team: i % opts.teams } : {}) };
  });
  const config: RoomConfig = {
    room: 'room_test',
    code: '123456',
    lesson_id: 'lesson_test',
    class_id: 'class_test',
    game,
    keys,
    style: 'race',
    roster: Object.fromEntries(opts.seats.map((s) => [`st_${s}`, s])),
    ...(opts.teams ? { teams: { count: opts.teams } } : {}),
    fold_url: 'http://localhost/fold',
    opened_at: h.now
  };
  const history = (owner: string) => h.events.filter((e) => e.owner === owner);
  const ctx: RulesCtx = {
    get now() {
      return h.now;
    },
    config,
    game,
    keys,
    random,
    seats: () => Object.values(h.seats),
    seat: (owner) => h.seats[owner],
    teams: () => [...new Set(Object.values(h.seats).map((s) => s.team).filter((t): t is number => t !== undefined))].sort((a, b) => a - b),
    members: (team) => Object.values(h.seats).filter((s) => s.team === team).map((s) => s.owner),
    mark(owner, event, strength = 'live_solo') {
      const out = markMove(game, keys, history(owner), event, h.now, { play_id: config.room, owner, strength });
      if (out.error) return { error: { code: 'bad_item', message: 'That isn’t in this game.' } };
      if (out.stored) h.events.push({ ...out.stored, seq: h.events.length } as GameEvent);
      return { result: out.result, stored: out.stored };
    },
    record(owner, event) {
      h.events.push({ seq: h.events.length, at: h.now, game: keys.kind, play_id: config.room, owner, strength: 'live_solo', ...event } as GameEvent);
    },
    addScore: (owner, p) => void (h.seats[owner] && (h.seats[owner].score += p)),
    setScore: (owner, p) => void (h.seats[owner] && (h.seats[owner].score = p)),
    addTeamScore: (team, p) => void (h.teamScores[team] = (h.teamScores[team] ?? 0) + p),
    teamScore: (team) => h.teamScores[team] ?? 0,
    setProgress: (owner, progress) => void (h.seats[owner] && (h.seats[owner].progress = progress)),
    ticker: (text, initials) => void h.ticker.unshift({ text, ...(initials ? { initials } : {}) }),
    send: (owner, msg) => void h.sent.push({ owner, msg }),
    setTimer: (at) => void (h.timer = at),
    end: () => void (h.ended = true)
  };
  h.ctx = ctx;
  h.k = rules.init(ctx);
  h.advance = (ms) => void (h.now += ms);
  h.start = () => rules.start(ctx, h.k);
  h.move = (ini, event) => rules.move(ctx, h.k, `o_${ini}`, event);
  h.control = (name, data, from = { owner: 'teacher', role: 'teacher' }) => rules.control?.(ctx, h.k, { name, data } as KindControl, from);
  h.tick = () => rules.tick?.(ctx, h.k);
  h.finish = () => rules.finish?.(ctx, h.k);
  h.view = (role, owner) => rules.view(ctx, h.k, role, owner);
  return h;
}

/** Asserts no answer key text from `keys` appears anywhere in `value` (JSON). Pass the strings that must stay secret. */
export function leaks(value: unknown, secrets: string[]): string[] {
  const json = JSON.stringify(value ?? null).toLowerCase();
  return secrets.filter((s) => s.length > 2 && json.includes(s.toLowerCase()));
}
