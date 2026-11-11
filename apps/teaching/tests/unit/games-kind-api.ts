/**
 * A fake KindViewApi for board and phone smoke tests of custom live kinds
 * (live/kind-views.ts): records moves and controls, answers moves from a
 * callback (usually the rules harness), and builds RoomViews around a
 * kind_view. Not a test file itself.
 */
import type { EventResult, SoloEvent } from '@/games/api';
import type { GameKind } from '@/games/core/schema';
import type { Role, RoomView } from '@/games/core/room-protocol';
import type { KindViewApi } from '@/games/live/kind-views';
import { sfx } from '@/games/sound/sfx';

export type FakeApi = KindViewApi & {
  moves: SoloEvent[];
  controls: Array<{ name: string; data?: unknown }>;
  toasts: string[];
  actions: HTMLElement[];
};

export function fakeApi(owner: string, opts: { onMove?: (e: SoloEvent) => EventResult | { error: { message: string } }; onControl?: (name: string, data?: unknown) => unknown; now?: () => number } = {}): FakeApi {
  const api: FakeApi = {
    owner,
    moves: [],
    controls: [],
    toasts: [],
    actions: [],
    sfx,
    calm: () => true,
    serverNow: opts.now ?? (() => Date.now()),
    toast: (text) => void api.toasts.push(text),
    setActions: (buttons) => void (api.actions = buttons),
    async move(e) {
      api.moves.push(e);
      const r = opts.onMove?.(e) ?? { item: e.item };
      if ('error' in r) throw new Error(r.error.message);
      return r;
    },
    async control(name, data) {
      api.controls.push({ name, ...(data !== undefined ? { data } : {}) });
      const r = opts.onControl?.(name, data) as { error?: { message: string } } | undefined;
      if (r && r.error) throw new Error(r.error.message);
    }
  };
  return api;
}

export function kindRoomView(kind: GameKind, kindView: unknown, over: Partial<RoomView> = {}): RoomView {
  return { room: 'room_t', code: '123456', kind, style: 'custom', title: 'Test', phase: 'playing', now: Date.now(), seats: [], ticker: [], leaderboard: [], seq: 1, kind_view: kindView, ...over } as RoomView;
}

/** Visible text of an element (innerText is not in happy-dom everywhere). */
export const textOf = (node: Element) => (node.textContent ?? '').replace(/\s+/g, ' ').trim();

export type ViewSource = { view(role: Role, owner: string): unknown };
