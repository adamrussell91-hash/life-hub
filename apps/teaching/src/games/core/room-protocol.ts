/**
 * Live game rooms: the contract between the room (Cloudflare Durable Object,
 * `workers/game-rooms`, reducer `room-core.ts`) and its clients (the board on
 * Display and each student's phone). Spec §3 and §5.1.
 *
 * Plain types only (no zod, no DOM) so the Worker, Netlify and the app can all
 * import it. Both sides of Phase 4 build against this file; change it only
 * together.
 *
 * Shape of a live game:
 *   lobby → (countdown) → playing ⇄ paused → ended → folded
 *
 * Two play styles for the Phase 3 games:
 *   - race   (crossword, find-a-word, Connections): every phone plays its own
 *            copy with the SOLO player; moves go to the room instead of the
 *            solo endpoint and are marked by the same pure marker
 *            (`markMove`, shared with the solo path). The board shows a race wall.
 *   - paced  (Who said it?): the teacher moves the class through items
 *            together; the room opens an item with a timer, collects one
 *            answer per seat, reveals the distribution then the answer.
 * Later phases add their own styles (Jeopardy, team match, …) as new
 * `RoomRules` modules; the envelope below stays the same.
 */

import type { GameKind, PublicGame } from './schema';
import type { EventResult, SoloEvent } from '../api';
import type { GameEvent, Strength } from './events';

// ─────────────────────────────────────────────────────────────── identity

export type Role = 'teacher' | 'student' | 'board';

/**
 * HMAC-signed by Netlify with GAME_ROOM_SECRET (sha256, base64url), sent as
 * `?ticket=` on the socket URL or `Authorization: Ticket …` on HTTPS.
 * Format: base64url(JSON payload) + "." + base64url(hmac). The room never sees
 * device tokens or full names.
 */
export type TicketPayload = {
  room: string;
  role: Role;
  /** Stable seat id: deviceHash(`student:{class}:{student}`) for students, 'teacher' / 'board' otherwise. */
  owner: string;
  student_id?: string;
  initials?: string;
  /** Unix ms. Students: 3 h. Teacher and board: 6 h. */
  exp: number;
};

// ─────────────────────────────────────────────────────────────── config

/** Built by Netlify on `open` and posted (signed) to the Worker. Holds the keys: never sent to a client. */
export type RoomConfig = {
  room: string;
  /** 6 digits, unique among open rooms. */
  code: string;
  lesson_id: string;
  class_id: string;
  game: PublicGame;
  /** The game's server-only keys, as stored by `storeGameKeys` (record.games[game_id]). */
  keys: unknown;
  style: 'race' | 'paced';
  /** Roster seats allowed in: student id → initials. Only these may hold a student ticket. */
  roster: Record<string, string>;
  /** Team games only (later phases). */
  teams?: { count: number };
  /** Seconds per item for paced games (default 20). */
  item_seconds?: number;
  /** Netlify fold endpoint, absolute. */
  fold_url: string;
  opened_at: number;
};

// ─────────────────────────────────────────────────────────────── state

export type Phase = 'lobby' | 'countdown' | 'playing' | 'paused' | 'ended' | 'folded';

export type Seat = {
  owner: string;
  initials: string;
  team?: number;
  connected: boolean;
  /** Race: items finished (words, groups). Paced: points. */
  score: number;
  /** Race: right out of total, for the progress bar. */
  progress?: { done: number; total: number; mistakes?: number; mistakes_max?: number; groups?: number[] };
  finished?: boolean;
};

/** Paced item on screen. `answer` is only filled after the reveal. */
export type PacedItem = {
  item: string;
  index: number;
  of: number;
  opened_at: number;
  ends_at: number;
  /** Seats that have answered (not what they chose). */
  answered: string[];
  revealed?: {
    /** Choice → count (e.g. cast id or 'fake' → n). */
    counts: Record<string, number>;
    reveal: EventResult['reveal'];
  };
};

/** What every client may see. Built by `publicView(state, role, owner)`: students get only their own seat's detail. */
export type RoomView = {
  room: string;
  code: string;
  kind: GameKind;
  style: 'race' | 'paced';
  title: string;
  phase: Phase;
  /** Server time this view was made (ms), for the client's clock offset. */
  now: number;
  /** Countdown or paced item end, server ms. */
  ends_at?: number;
  seats: Seat[];
  /** Race: "first to solve" ticker, newest first, max 8. Never names an answer before the reveal. */
  ticker: Array<{ initials: string; text: string; at: number }>;
  item?: PacedItem;
  /** Top 5 for individual games; teams for team games. Teacher and board get every rank in `seats`. */
  leaderboard: Array<{ initials: string; score: number; rank: number }>;
  /** Only in the viewer's own copy. */
  you?: { owner: string; seat?: Seat; last?: EventResult; rank?: number };
  /** Board's Class wall for Connections: anonymous confusion pairs (tile text pair → count). */
  class_wall?: Array<{ a: string; b: string; count: number }>;
  seq: number;
};

// ─────────────────────────────────────────────────────────────── messages

/** Client → room. Every message may carry `rid` (request id); the room echoes it in the matching `ack`. */
export type ClientMsg =
  | { t: 'hello'; rid?: string; since?: number }
  | { t: 'ping'; rid?: string; sent: number }
  /** Race: one move from the solo player (same shape as the solo endpoint). Paced: { item, move: 'answer', response }. */
  | { t: 'move'; rid?: string; event: SoloEvent }
  /** Race: the student's player said it's finished. */
  | { t: 'finish'; rid?: string }
  /** Teacher / board only. */
  | { t: 'control'; rid?: string; op: ControlOp };

export type ControlOp =
  | { op: 'start' }
  | { op: 'pause' }
  | { op: 'resume' }
  | { op: 'next' }
  | { op: 'reveal' }
  | { op: 'add_time'; seconds: number }
  | { op: 'kick'; owner: string }
  | { op: 'board_view'; view: 'race' | 'class_wall' }
  | { op: 'end' };

/** Room → client. */
export type ServerMsg =
  /** Full view on connect, reconnect, or when a poller is too far behind. */
  | { t: 'snapshot'; view: RoomView }
  /** Small change; clients apply by replacing the listed top-level fields. `seq` increases by 1 per broadcast. */
  | { t: 'delta'; seq: number; now: number; patch: Partial<RoomView> }
  | { t: 'pong'; rid?: string; sent: number; now: number }
  /** Reply to a move or control: the marker's verdict for race moves. */
  | { t: 'ack'; rid?: string; result?: EventResult; error?: { code: string; message: string } }
  /** This seat opened on another device; this socket is closed after it. */
  | { t: 'replaced' }
  | { t: 'kicked' }
  | { t: 'error'; code: string; message: string };

// ─────────────────────────────────────────────────────────────── reducer

/** Internal state, persisted in DO storage after each action. Contains keys: never broadcast. */
export type RoomState = {
  config: RoomConfig;
  phase: Phase;
  seq: number;
  seats: Record<string, Seat>;
  /** Per-seat history the marker needs (stored moves) — same role as the solo play's events. */
  history: Record<string, GameEvent[]>;
  item?: PacedItem & { choices: Record<string, { choice: string; at: number }> };
  item_index: number;
  ticker: RoomView['ticker'];
  board_view: 'race' | 'class_wall';
  ends_at?: number;
  paused_left_ms?: number;
  ended_at?: number;
  folded?: boolean;
  /** Request ids already handled per seat, so a resent move is answered from here, not stored twice. */
  seen: Record<string, Record<string, EventResult | null>>;
};

export type RoomAction =
  | { type: 'connect'; owner: string; role: Role; initials?: string; student_id?: string }
  | { type: 'disconnect'; owner: string }
  | { type: 'msg'; owner: string; role: Role; msg: ClientMsg }
  /** Alarm tick: countdown end, paced item end, auto-end after 6 h. */
  | { type: 'tick' }
  | { type: 'folded' };

export type RoomEffect =
  /** Broadcast to everyone; the wrapper builds each viewer's own view with `publicView`. */
  | { kind: 'broadcast' }
  | { kind: 'send'; owner: string; msg: ServerMsg }
  | { kind: 'close'; owner: string; msg: ServerMsg }
  /** Next alarm, server ms. */
  | { kind: 'alarm'; at: number }
  /** Post the fold (after `end` or the 6 h limit). */
  | { kind: 'fold'; payload: FoldPayload };

/** `(state, action, now) → { state, effects }`. Pure: no I/O, no Date.now, no Math.random. */
export type RoomReducer = (state: RoomState, action: RoomAction, now: number) => { state: RoomState; effects: RoomEffect[] };

/** One play's results, posted signed to Netlify `POST /api/games/fold`. Idempotent by `room`. */
export type FoldPayload = {
  room: string;
  lesson_id: string;
  class_id: string;
  game_id: string;
  kind: GameKind;
  started_at: number;
  ended_at: number;
  strength: Extract<Strength, 'live_solo' | 'live_team'>;
  seats: Array<{ owner: string; student_id?: string; initials: string; team?: number; score: number }>;
  events: GameEvent[];
};

// ─────────────────────────────────────────────────────────────── limits

export const ROOM_LIMITS = {
  seats: 40,
  /** Messages per seat per 10 s before the room starts dropping them. */
  burst: 60,
  countdownMs: 3000,
  pacedSeconds: 20,
  /** A room closes itself (and folds) after this. */
  lifeMs: 6 * 60 * 60 * 1000,
  /** Fold retries with backoff for this long. */
  foldRetryMs: 24 * 60 * 60 * 1000,
  /** Client: switch to HTTPS polling if the socket isn't open in this time, or drops this many times in a minute. */
  socketOpenMs: 4000,
  socketDropsPerMinute: 3,
  pollMs: 1000,
  pingEveryMs: 30_000,
  /** Show at most this many on the board's leaderboard for individual games. */
  leaderboardTop: 5
} as const;
