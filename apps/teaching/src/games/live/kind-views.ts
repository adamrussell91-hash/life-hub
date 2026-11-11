/**
 * Board and phone screens for live kinds with their own room rules
 * (style 'custom', see core/room-rules.ts). The live shell (board.ts,
 * phone.ts) keeps the lobby, countdown, pause overlay, leaderboard, podium,
 * teacher controls and connection handling; while the game is playing it
 * hands the stage to the kind's view and calls `update` with every new view.
 *
 * Adding a kind: create `kinds/<kind>/live.ts` calling `registerLiveKind`, and
 * import it from `kinds/index.ts` (with the solo player, if the kind has one).
 */

import type { EventResult, SoloEvent } from '../api';
import type { GameKind } from '../core/schema';
import type { RoomView } from '../core/room-protocol';
import type { Sfx } from '../sound/sfx';

export type KindViewApi = {
  /** Sends a move (phone) and resolves with the room's ack result; rejects with the room's error message. */
  move(event: SoloEvent): Promise<EventResult>;
  /** Sends a kind control (board/teacher, or a phone action such as a captain's pick). */
  control(name: string, data?: unknown): Promise<void>;
  /** Server time now (ms), from the clock offset. */
  serverNow(): number;
  calm(): boolean;
  sfx: Sfx;
  toast(text: string, tone?: 'good' | 'bad' | 'plain'): void;
  /** Phone only: the docked action row, as in solo play. */
  setActions?(buttons: HTMLElement[]): void;
  /** This viewer's seat owner ('teacher' / 'board' on the board). */
  owner: string;
};

export type KindView = {
  /** Every new view (snapshot or delta applied). `view.kind_view` is the kind's own part. */
  update(view: RoomView): void;
  /** Keys on the board (teacher shortcuts) or phone. Return true when handled. */
  onKey?(event: KeyboardEvent): boolean;
  /** Board only: extra teacher control buttons for the control bar (built by the shell's btn helper). */
  controls?(view: RoomView): Array<{ label: string; name: string; data?: unknown; key?: string; primary?: boolean }>;
  dispose(): void;
};

export type LiveKind = {
  board(host: HTMLElement, api: KindViewApi): KindView;
  phone(host: HTMLElement, api: KindViewApi): KindView;
};

const kinds = new Map<GameKind, LiveKind>();

export function registerLiveKind(kind: GameKind, live: LiveKind): void {
  kinds.set(kind, live);
}

export function liveKind(kind: GameKind | string): LiveKind | undefined {
  return kinds.get(kind as GameKind);
}
