import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventResult, SoloEvent } from '@/games/api';
import { createEventQueue, defaultIsRetryable } from '@/games/solo/queue';

const ev = (item: string): SoloEvent => ({ item, move: 'answer', response: item });

/** A fake server: records each batch; fails while `down` is set. */
function server() {
  const batches: string[][] = [];
  const s = {
    batches,
    down: false as boolean | { code: string },
    send: vi.fn(async (events: SoloEvent[]) => {
      if (s.down) throw Object.assign(new Error('Network request failed'), { code: s.down === true ? 'network_error' : s.down.code });
      batches.push(events.map((e) => e.item));
      return { results: events.map((e): EventResult => ({ item: e.item, correct: e.item.startsWith('r') })) };
    })
  };
  return s;
}

const tick = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('solo event queue', () => {
  it('waits for 5 moves, then sends them as one batch and resolves each with its verdict', async () => {
    const s = server();
    const q = createEventQueue({ send: s.send });
    const ps = ['r1', 'w2', 'r3', 'w4'].map((i) => q.push(ev(i)));
    await tick();
    expect(s.send).not.toHaveBeenCalled();
    const fifth = q.push(ev('r5'));
    await tick();
    expect(s.batches).toEqual([['r1', 'w2', 'r3', 'w4', 'r5']]);
    expect((await ps[0]).correct).toBe(true);
    expect((await ps[1]).correct).toBe(false);
    expect((await fifth).item).toBe('r5');
    expect(q.size()).toBe(0);
  });

  it('sends after 10 s when fewer than 5 are waiting', async () => {
    const s = server();
    const q = createEventQueue({ send: s.send });
    void q.push(ev('r1'));
    void q.push(ev('r2'));
    await vi.advanceTimersByTimeAsync(9_999);
    expect(s.send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(s.batches).toEqual([['r1', 'r2']]);
  });

  it('now: true sends straight away with anything waiting', async () => {
    const s = server();
    const q = createEventQueue({ send: s.send });
    void q.push(ev('r1'));
    const r = await q.push(ev('r2'), { now: true });
    expect(r.correct).toBe(true);
    expect(s.batches).toEqual([['r1', 'r2']]);
  });

  it('keeps a failed batch, retries it in order, and sends nothing twice', async () => {
    const s = server();
    const states: string[] = [];
    const q = createEventQueue({ send: s.send, retryDelaysMs: [1000], onState: (st) => states.push(st) });
    s.down = true;
    const ps = ['r1', 'r2', 'r3', 'r4', 'r5'].map((i) => q.push(ev(i)));
    await tick();
    expect(s.send).toHaveBeenCalledTimes(1);
    expect(q.size()).toBe(5);
    expect(states).toContain('retrying');
    // A move made while offline joins the queue behind the failed batch.
    void q.push(ev('r6'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.send).toHaveBeenCalledTimes(2);
    s.down = false;
    await vi.advanceTimersByTimeAsync(1000);
    expect(s.batches).toEqual([['r1', 'r2', 'r3', 'r4', 'r5', 'r6']]);
    expect((await ps[4]).correct).toBe(true);
    expect(q.size()).toBe(0);
  });

  it('only one batch is in flight at a time', async () => {
    let release: () => void = () => undefined;
    const sent: string[][] = [];
    const send = vi.fn((events: SoloEvent[]) => {
      sent.push(events.map((e) => e.item));
      return new Promise<{ results: EventResult[] }>((res) => {
        release = () => res({ results: events.map((e) => ({ item: e.item })) });
      });
    });
    const q = createEventQueue({ send });
    for (const i of ['a', 'b', 'c', 'd', 'e']) void q.push(ev(i));
    for (const i of ['f', 'g', 'h', 'i', 'j']) void q.push(ev(i));
    await tick();
    expect(send).toHaveBeenCalledTimes(1);
    release();
    await tick();
    expect(sent).toEqual([['a', 'b', 'c', 'd', 'e'], ['f', 'g', 'h', 'i', 'j']]);
  });

  it('drain (finish) sends everything waiting, in batches of at most 20, then resolves', async () => {
    const s = server();
    const q = createEventQueue({ send: s.send, batchSize: 100 });
    for (let i = 0; i < 23; i += 1) void q.push(ev(`r${i}`));
    await q.drain();
    expect(s.batches.map((b) => b.length)).toEqual([20, 3]);
    expect(new Set(s.batches.flat()).size).toBe(23);
    expect(q.size()).toBe(0);
  });

  it('drain does not lose moves when offline: it rejects, keeps them, and a later drain sends them once', async () => {
    const s = server();
    const q = createEventQueue({ send: s.send, retryDelaysMs: [500], drainAttempts: 2 });
    s.down = true;
    void q.push(ev('r1'));
    void q.push(ev('r2'));
    const first = q.drain();
    const caught = first.catch((e) => e);
    await vi.advanceTimersByTimeAsync(500);
    expect((await caught).code).toBe('network_error');
    expect(q.size()).toBe(2);
    expect(q.state()).toBe('offline');
    s.down = false;
    await q.drain();
    expect(s.batches).toEqual([['r1', 'r2']]);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(s.batches).toEqual([['r1', 'r2']]);
  });

  it('a refusal (the play has ended) is not retried: the moves and the drain hear why', async () => {
    const s = server();
    const q = createEventQueue({ send: s.send });
    s.down = { code: 'ended' };
    const p = q.push(ev('r1'), { now: true }).catch((e) => e);
    expect((await p).code).toBe('ended');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(s.send).toHaveBeenCalledTimes(1);
    expect(q.size()).toBe(0);
  });

  it('knows which errors are worth retrying', () => {
    expect(defaultIsRetryable({ code: 'network_error' })).toBe(true);
    expect(defaultIsRetryable({ code: 'retry' })).toBe(true);
    expect(defaultIsRetryable(new Error('boom'))).toBe(true);
    expect(defaultIsRetryable({ code: 'bad_play' })).toBe(false);
  });
});
