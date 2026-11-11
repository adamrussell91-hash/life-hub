import type { ClientMsg, RoomView, ServerMsg } from '@/games/core/room-protocol';

/** Test doubles for live games: a WebSocket the test drives, and a view builder. Invented content only. */

export class FakeWS {
  static all: FakeWS[] = [];
  static last(): FakeWS {
    return FakeWS.all[FakeWS.all.length - 1];
  }
  static reset(): void {
    FakeWS.all = [];
  }
  readyState = 0;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  sent: ClientMsg[] = [];
  constructor(public url: string) {
    FakeWS.all.push(this);
  }
  send(data: string): void {
    this.sent.push(JSON.parse(data) as ClientMsg);
  }
  close(): void {
    this.readyState = 3;
  }
  /** Server side: the socket opens. */
  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }
  /** Server side: one message to the client. */
  push(msg: ServerMsg): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
  /** Server side: the socket drops. */
  drop(): void {
    this.readyState = 3;
    this.onclose?.({});
  }
  sentOf<T extends ClientMsg['t']>(t: T): Array<Extract<ClientMsg, { t: T }>> {
    return this.sent.filter((m): m is Extract<ClientMsg, { t: T }> => m.t === t);
  }
}

export function makeView(over: Partial<RoomView> = {}): RoomView {
  return {
    room: 'room_test_0001',
    code: '482913',
    kind: 'connections',
    style: 'race',
    title: 'Week 5 wall',
    phase: 'lobby',
    now: Date.now(),
    seats: [],
    ticker: [],
    leaderboard: [],
    seq: 1,
    ...over
  };
}

export const flush = async (n = 20): Promise<void> => {
  for (let i = 0; i < n; i += 1) await Promise.resolve();
};
