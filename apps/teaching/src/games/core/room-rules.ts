/**
 * Per-kind room rules (spec §3.2: "each kind supplies its rules module").
 *
 * The race and paced styles (crossword, find-a-word, Connections, Who said
 * it?) are built into room-core. Every other live game plugs in here with
 * style 'custom': room-core keeps doing seats, tickets, teams, pause, timers,
 * dedupe, rate limits, leaderboard and fold, and hands the game's own moves,
 * controls and ticks to the kind's rules.
 *
 * Rules are pure like the reducer: no I/O, no Date.now, no Math.random. Use
 * `ctx.random()` (seeded per room) for anything random. Keep the kind's state
 * in the object `init` returns; room-core stores it in `state.custom` and
 * persists it with the room.
 *
 * Adding a kind: create `kinds/<kind>/rules.ts` exporting a RoomRules and add
 * one line to `core/room-rules-index.ts`.
 */

import type { EventResult, SoloEvent } from '../api';
import type { GameEvent, Strength } from './events';
import type { GameKeys } from './model';
import type { GameKind, PublicGame } from './schema';
import type { Role, RoomConfig, Seat, ServerMsg } from './room-protocol';

export type RulesError = { error: { code: string; message: string } };

export type RulesCtx = {
  readonly now: number;
  readonly config: RoomConfig;
  readonly game: PublicGame;
  readonly keys: GameKeys;
  /** Seeded per room; deterministic across replays. */
  random(): number;
  /** Student seats, in join order (connected or not). */
  seats(): Seat[];
  seat(owner: string): Seat | undefined;
  /** Team games: team numbers in use (0-based) and each team's members (owners). */
  teams(): number[];
  members(team: number): string[];
  /**
   * Marks a move with the shared marker (`markMove`, same as solo) and stores
   * it in that seat's history (it folds into evidence). Use for any answer to
   * a game item. `strength` defaults to 'live_solo'.
   */
  mark(owner: string, event: SoloEvent, strength?: Extract<Strength, 'live_solo' | 'live_team'>): { result: EventResult; stored: GameEvent | null } | RulesError;
  /** Stores a move the marker doesn't judge (a bet, a pick, a tap with its own verdict). Folds with the rest. */
  record(owner: string, event: Omit<GameEvent, 'seq' | 'at' | 'game' | 'play_id' | 'owner' | 'strength'> & { strength?: Strength }): void;
  addScore(owner: string, points: number): void;
  setScore(owner: string, points: number): void;
  /** Team games: the board's team scores. */
  addTeamScore(team: number, points: number): void;
  teamScore(team: number): number;
  /** Seat's progress bar (optional). */
  setProgress(owner: string, progress: Seat['progress']): void;
  ticker(text: string, initials?: string): void;
  /** A private message to one seat (or 'teacher' / 'board'). */
  send(owner: string, msg: ServerMsg): void;
  /** The timer every client draws (server ms), or undefined to clear. `tick` runs when it passes. */
  setTimer(endsAt: number | undefined): void;
  /** Ends the game: podium, then fold. */
  end(): void;
};

/** A teacher or board button the kind adds (e.g. 'spin', 'next_turn', 'spotlight'), or a kind action from a phone that isn't a game answer. */
export type KindControl = { name: string; data?: unknown };

export type RoomRules<K = any> = {
  kind: GameKind;
  /** Team games: room-core auto-balances seats into teams at start and puts late joiners on the smallest team. */
  teams?: { min: number; max: number; default: number };
  /** Moves per seat per 10 s (default ROOM_LIMITS.burst). Pictionary strokes need more. */
  burst?: number;
  /** Seconds the item timer runs by default when the rules call setTimer themselves; informational for the editor. */
  init(ctx: RulesCtx): K;
  /** Countdown finished: the game begins. */
  start(ctx: RulesCtx, k: K): void;
  /** A move from a student's phone. Return the ack (the result the phone sees) or an error. */
  move(ctx: RulesCtx, k: K, owner: string, event: SoloEvent): EventResult | RulesError;
  /** Teacher/board controls room-core doesn't handle itself ('next', 'reveal' and kind names), and kind actions. `from` is the owner who sent it. */
  control?(ctx: RulesCtx, k: K, op: KindControl, from: { owner: string; role: Role }): void | RulesError;
  /** The timer set with setTimer has passed. */
  tick?(ctx: RulesCtx, k: K): void;
  /** Called when the teacher ends the game (before fold): reveal anything open, award final points. */
  finish?(ctx: RulesCtx, k: K): void;
  /** A seat joined late or reconnected (e.g. redeal team match options). */
  seatChanged?(ctx: RulesCtx, k: K, owner: string): void;
  /**
   * The kind's part of each viewer's view (RoomView.kind_view). Must never
   * contain keys or other students' private data: students get their own
   * slice; teacher/board get the class picture. Tests assert this.
   */
  view(ctx: RulesCtx, k: K, role: Role, owner: string): unknown;
};

/** The registry. Filled by `core/room-rules-index.ts` (bundled with room-core). */
const registry = new Map<GameKind, RoomRules>();

export function registerRules(rules: RoomRules): void {
  registry.set(rules.kind, rules);
}

export function rulesFor(kind: GameKind | string): RoomRules | undefined {
  return registry.get(kind as GameKind);
}
