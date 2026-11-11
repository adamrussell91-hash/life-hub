import type { EventResult, SoloEvent } from '../api';
import type { Game, GameKind, PublicGame } from '../core/schema';
import type { Sfx } from '../sound/sfx';

/**
 * Game kinds → their solo player and their print renderer. Phase 3 adds a
 * kind by calling `registerPlayer` and `registerPrint` from its module and
 * importing that module in `games/kinds/index.ts`. A kind with no player still
 * shows "Coming next" in the arcade; a kind with no print renderer prints a
 * one-line note.
 */

/** What the shell hands a player when it mounts. */
export type PlayerContext = {
  /** The game as students see it (no answers). */
  game: PublicGame;
  playId: string;
  /**
   * Sends one move. Resolves with the server's verdict (`correct`, `one_away`,
   * `decoy`, `reveal`) once its batch comes back. Moves are batched (5 or
   * 10 s); pass `{ now: true }` when the player is waiting on the answer (a
   * crossword word check, a Connections guess). Rejects only if the server
   * refused the move (the play ended); network trouble is retried.
   */
  emit(event: SoloEvent, options?: { now?: boolean }): Promise<EventResult>;
  /** The player is done (every item tried or the student chose Finish). The shell saves, then shows the finish card. */
  finish(): void;
  /** Puts the player's buttons in the docked action row (44 px, thumb reach). Pass [] to clear. */
  setActions(buttons: HTMLElement[]): void;
  /** A short line in the header, e.g. "3 of 8 found". */
  setStatus(text: string): void;
  /** A short message that slides up and goes. */
  toast(text: string, tone?: 'good' | 'bad' | 'plain'): void;
  /** Milliseconds since the play started. */
  elapsedMs(): number;
  /** True when moves should be calm (reduced motion or the Calm toggle). */
  calm(): boolean;
  /** Sound effects; silent on phones unless the student turned sound on. */
  sfx: Sfx;
};

export type MountedPlayer = {
  /** Keys the shell passes on while the player is open (arrows, letters, Enter). Return true when handled. */
  onKey?(event: KeyboardEvent): boolean;
  dispose(): void;
};

export type PlayerModule = {
  mount(host: HTMLElement, ctx: PlayerContext): MountedPlayer;
};

/**
 * Renders a game for paper from the teacher's full game (answers included).
 * With `answers`, add the answer key; put it in an element with class
 * `gm-print-key` so it starts on a new page.
 */
export type PrintRenderer = (game: Game, options: { answers: boolean }) => HTMLElement;

const players = new Map<GameKind, PlayerModule>();
const printers = new Map<GameKind, PrintRenderer>();

export function registerPlayer(kind: GameKind, player: PlayerModule): void {
  players.set(kind, player);
}
export function playerFor(kind: GameKind): PlayerModule | null {
  return players.get(kind) ?? null;
}
export function hasPlayer(kind: GameKind): boolean {
  return players.has(kind);
}

export function registerPrint(kind: GameKind, render: PrintRenderer): void {
  printers.set(kind, render);
}
export function printFor(kind: GameKind): PrintRenderer | null {
  return printers.get(kind) ?? null;
}

/** Tests and previews only. */
export function unregisterForTests(kind: GameKind): void {
  players.delete(kind);
  printers.delete(kind);
}
