import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyServerMsg, connectRoom, messagesFrom, type FetchLike, type RoomStatus } from '@/games/live/transport';
import type { ServerMsg } from '@/games/core/room-protocol';
import { FakeWS, flush, makeView } from './games-live-fakes';

let clock = 1_000_000;
const now = () => clock;

function open(over: { fetchImpl?: FetchLike } = {}) {
  const msgs: ServerMsg[] = [];
  const statuses: Array<{ s: RoomStatus; slow: boolean }> = [];
  const conn = connectRoom({
    wsBase: 'wss://rooms.test/g',
    room: 'room_test_0001',
    ticket: 'tkt.sig',
    WebSocketImpl: FakeWS,
    fetchImpl: over.fetchImpl ?? (vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true, data: { msgs: [] } }) })) as FetchLike),
    now,
    onMsg: (m) => msgs.push(m),
    onStatus: (s, info) => statuses.push({ s, slow: info.slow })
  });
  return { conn, msgs, statuses };
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeWS.reset();
  clock = 1_000_000;
});
afterEach(() => vi.useRealTimers());

describe('live transport', () => {
  it('opens a socket with the ticket, says hello and pings, then applies snapshot and delta', () => {
    const { conn, msgs } = open();
    const ws = FakeWS.last();
    expect(ws.url).toBe('wss://rooms.test/g/rooms/room_test_0001/ws?ticket=tkt.sig');
    ws.open();
    expect(conn.status()).toBe('open');
    expect(ws.sentOf('hello')).toHaveLength(1);
    expect(ws.sentOf('ping')).toHaveLength(1);
    ws.push({ t: 'snapshot', view: makeView({ seq: 4, now: clock }) });
    ws.push({ t: 'delta', seq: 5, now: clock, patch: { phase: 'countdown', ends_at: clock + 3000 } });
    expect(conn.view()?.phase).toBe('countdown');
    expect(conn.view()?.seq).toBe(5);
    expect(msgs.map((m) => m.t)).toEqual(['snapshot', 'delta']);
    // Pings again every 30 s.
    vi.advanceTimersByTime(30_000);
    expect(ws.sentOf('ping')).toHaveLength(2);
    conn.close();
  });

  it('takes the clock offset from ping and pong (best round trip wins)', () => {
    const { conn } = open();
    const ws = FakeWS.last();
    ws.open();
    const sent = ws.sentOf('ping')[0].sent;
    clock += 200; // 200 ms round trip; the server is 5 s ahead.
    ws.push({ t: 'pong', sent, now: sent + 100 + 5000 });
    expect(conn.offsetMs()).toBe(5000);
    expect(conn.serverNow()).toBe(clock + 5000);
    // A slower sample with a different answer doesn't win.
    vi.advanceTimersByTime(30_000);
    const sent2 = ws.sentOf('ping')[1].sent;
    clock += 2000;
    ws.push({ t: 'pong', sent: sent2, now: sent2 + 9000 });
    expect(conn.offsetMs()).toBe(5000);
    conn.close();
  });

  it('falls back to polling when the socket is not open within 4 s, and shows slow', async () => {
    const fetchImpl = vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => (url.includes('/poll') ? { ok: true, data: { seq: 2, msgs: [{ t: 'snapshot', view: makeView({ seq: 2 }) }] } } : { ok: true, data: { msgs: [] } })
    })) as unknown as FetchLike;
    const { conn, statuses } = open({ fetchImpl });
    vi.advanceTimersByTime(3999);
    expect(conn.slow()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(conn.slow()).toBe(true);
    expect(conn.status()).toBe('polling');
    expect(statuses.at(-1)).toEqual({ s: 'polling', slow: true });
    await flush();
    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0] as string);
    expect(calls.some((u) => u === 'https://rooms.test/g/rooms/room_test_0001/poll')).toBe(true);
    expect(conn.view()?.seq).toBe(2);
    // Next poll a second later asks from the last seq, with the ticket.
    await vi.advanceTimersByTimeAsync(1000);
    const later = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
    expect(later[0]).toBe('https://rooms.test/g/rooms/room_test_0001/poll?since=2');
    expect((later[1] as { headers: Record<string, string> }).headers.authorization).toBe('Ticket tkt.sig');
    conn.close();
  });

  it('reconnects with backoff, and polls after three drops in a minute', () => {
    const { conn } = open();
    FakeWS.last().open();
    FakeWS.last().drop();
    expect(conn.status()).toBe('reconnecting');
    expect(FakeWS.all).toHaveLength(1);
    vi.advanceTimersByTime(400);
    expect(FakeWS.all).toHaveLength(2);
    FakeWS.last().open();
    expect(conn.status()).toBe('open');
    FakeWS.last().drop();
    vi.advanceTimersByTime(400);
    FakeWS.last().open();
    expect(conn.slow()).toBe(false);
    FakeWS.last().drop();
    expect(conn.slow()).toBe(true);
    expect(conn.status()).toBe('polling');
    conn.close();
  });

  it('settles one promise per request id with its ack, and rejects on an ack error', async () => {
    const { conn } = open();
    const ws = FakeWS.last();
    ws.open();
    const a = conn.move({ item: 'w1', move: 'guess', response: { tiles: ['t1', 't2', 't3', 't4'] } });
    const b = conn.request({ t: 'control', op: { op: 'start' } });
    const [ma] = ws.sentOf('move');
    const [cb] = ws.sentOf('control');
    expect(ma.rid).toBeTruthy();
    expect(ma.rid).not.toBe(cb.rid);
    ws.push({ t: 'ack', rid: cb.rid, error: { code: 'not_teacher', message: 'Only the teacher can start.' } });
    ws.push({ t: 'ack', rid: ma.rid, result: { item: 'w1', correct: true } });
    await expect(a).resolves.toEqual({ item: 'w1', correct: true });
    await expect(b).rejects.toThrow('Only the teacher can start.');
    conn.close();
  });

  it('resends pending requests after a reconnect', async () => {
    const { conn } = open();
    FakeWS.last().open();
    const p = conn.move({ item: 'w1', move: 'pass' });
    const rid = FakeWS.last().sentOf('move')[0].rid;
    FakeWS.last().drop();
    vi.advanceTimersByTime(400);
    FakeWS.last().open();
    expect(FakeWS.last().sentOf('move')[0].rid).toBe(rid);
    FakeWS.last().push({ t: 'ack', rid, result: { item: 'w1' } });
    await expect(p).resolves.toEqual({ item: 'w1' });
    conn.close();
  });

  it('asks for a snapshot with hello since when a delta skips a number', () => {
    const { conn } = open();
    const ws = FakeWS.last();
    ws.open();
    ws.push({ t: 'snapshot', view: makeView({ seq: 7 }) });
    ws.push({ t: 'delta', seq: 9, now: clock, patch: { phase: 'playing' } });
    const hellos = ws.sentOf('hello');
    expect(hellos.at(-1)).toEqual({ t: 'hello', since: 7 });
    // The gap's patch is not applied.
    expect(conn.view()?.phase).toBe('lobby');
    conn.close();
  });

  it('closes on replaced and kicked, rejecting what was pending', async () => {
    const { conn } = open();
    const ws = FakeWS.last();
    ws.open();
    const p = conn.move({ item: 'w1', move: 'pass' });
    ws.push({ t: 'replaced' });
    await expect(p).rejects.toThrow();
    expect(conn.status()).toBe('closed');
  });

  it('reads the Worker reply envelope and older shapes', () => {
    const snap = { t: 'snapshot', view: makeView() };
    expect(messagesFrom({ ok: true, data: { seq: 1, msgs: [snap] } })).toHaveLength(1);
    expect(messagesFrom([snap])).toHaveLength(1);
    expect(messagesFrom({ messages: [snap] })).toHaveLength(1);
    expect(messagesFrom(null)).toEqual([]);
    expect(applyServerMsg(null, { t: 'delta', seq: 2, now: 0, patch: {} }).gap).toBe(true);
  });
});
