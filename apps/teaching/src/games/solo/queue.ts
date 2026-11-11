import type { EventResult, SoloEvent } from '../api';

/**
 * The solo event queue (spec §3.6). Moves go to the server in small batches:
 * when 5 are waiting, 10 s after the first one waited, when a player asks for
 * an answer now (a crossword word check), and on finish. One batch is in
 * flight at a time. A failed batch goes back to the front of the queue and is
 * retried with backoff; nothing is dropped and nothing is sent twice by this
 * queue. Each move's promise resolves with the server's verdict for it.
 */

export type QueueState = 'idle' | 'waiting' | 'sending' | 'retrying' | 'offline';

export type QueueOptions = {
  send(events: SoloEvent[]): Promise<{ results: EventResult[] }>;
  /** Send once this many moves are waiting. */
  batchSize?: number;
  /** The server's limit per request (solo_event takes ≤ 20). */
  maxBatch?: number;
  /** Send this long after the first move started waiting. */
  intervalMs?: number;
  /** Waits between retries; the last one repeats. */
  retryDelaysMs?: number[];
  /** A drain (finish) gives up waiting after this many failures in a row; the moves stay queued and retries go on. */
  drainAttempts?: number;
  /** Network trouble is worth retrying; a refusal (the play has ended, a bad item) is not. */
  isRetryable?(error: unknown): boolean;
  onState?(state: QueueState, waiting: number): void;
};

export type EventQueue = {
  /** Queues a move. `now` sends it straight away (with anything else waiting). */
  push(event: SoloEvent, options?: { now?: boolean }): Promise<EventResult>;
  /** Sends everything waiting now, without waiting for the reply. */
  flush(): void;
  /** Sends everything and resolves once the server has every move. Rejects if it can't get through (moves stay queued). */
  drain(): Promise<void>;
  /** Moves not yet confirmed by the server (waiting or in flight). */
  size(): number;
  state(): QueueState;
  /** Stops timers. Moves still waiting are kept but no longer sent. */
  dispose(): void;
};

type Entry = { event: SoloEvent; resolve(r: EventResult): void; reject(e: unknown): void };
type Waiter = { resolve(): void; reject(e: unknown): void };

const RETRYABLE_CODES = new Set(['network_error', 'invalid_response', 'retry', 'timeout']);

/** Network failures and the server's own "send it again" are retried; anything else is a refusal. */
export function defaultIsRetryable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return true;
  const code = (error as { code?: unknown }).code;
  if (typeof code !== 'string') return true;
  return RETRYABLE_CODES.has(code);
}

export function createEventQueue(options: QueueOptions): EventQueue {
  // The server's limit wins: never send more than maxBatch at once.
  const maxBatch = Math.max(1, options.maxBatch ?? 20);
  const batchSize = Math.min(maxBatch, Math.max(1, options.batchSize ?? 5));
  const intervalMs = options.intervalMs ?? 10_000;
  const delays = options.retryDelaysMs?.length ? options.retryDelaysMs : [1000, 2000, 4000, 8000, 10_000];
  const drainAttempts = Math.max(1, options.drainAttempts ?? 3);
  const isRetryable = options.isRetryable ?? defaultIsRetryable;

  let pending: Entry[] = [];
  let inFlight: Entry[] | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let forced = false;
  let failures = 0;
  /** Failures counted when the current drain began. */
  let drainFrom = 0;
  let disposed = false;
  let current: QueueState = 'idle';
  let waiters: Waiter[] = [];

  const size = () => pending.length + (inFlight?.length ?? 0);
  function setState(next: QueueState): void {
    current = next;
    options.onState?.(next, size());
  }

  function clearTimer(): void {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function armTimer(): void {
    if (timer || disposed || !pending.length) return;
    timer = setTimeout(() => {
      timer = null;
      forced = true;
      pump();
    }, intervalMs);
  }

  function settleWaiters(): void {
    if (size()) return;
    const ws = waiters;
    waiters = [];
    for (const w of ws) w.resolve();
  }

  function failWaiters(error: unknown): void {
    const ws = waiters;
    waiters = [];
    for (const w of ws) w.reject(error);
  }

  function pump(): void {
    if (disposed || inFlight || retryTimer) return;
    if (!pending.length) {
      forced = false;
      clearTimer();
      setState('idle');
      settleWaiters();
      return;
    }
    if (!forced && pending.length < batchSize) {
      armTimer();
      setState('waiting');
      return;
    }
    clearTimer();
    const batch = pending.slice(0, maxBatch);
    pending = pending.slice(batch.length);
    inFlight = batch;
    setState('sending');
    options.send(batch.map((e) => e.event)).then(
      (reply) => {
        inFlight = null;
        failures = 0;
        const results = Array.isArray(reply?.results) ? reply.results : [];
        batch.forEach((entry, i) => entry.resolve(results[i] ?? { item: entry.event.item }));
        // Forced sends carry on until the queue is empty; otherwise wait for the next trigger.
        pump();
      },
      (error: unknown) => {
        inFlight = null;
        if (!isRetryable(error)) {
          // Refused: these moves can't be saved, so their callers hear why. Later moves still get their turn.
          for (const entry of batch) entry.reject(error);
          failWaiters(error);
          failures = 0;
          pump();
          return;
        }
        // Back to the front, in order, and try again after a pause.
        pending = [...batch, ...pending];
        failures += 1;
        if (waiters.length && failures - drainFrom >= drainAttempts) {
          failWaiters(error);
          setState('offline');
        } else setState('retrying');
        if (disposed) return;
        const wait = delays[Math.min(failures - 1, delays.length - 1)];
        retryTimer = setTimeout(() => {
          retryTimer = null;
          forced = true;
          pump();
        }, wait);
      }
    );
  }

  return {
    push(event, opts = {}) {
      return new Promise<EventResult>((resolve, reject) => {
        pending.push({ event, resolve, reject });
        if (opts.now) forced = true;
        pump();
      });
    },
    flush() {
      if (!pending.length) return;
      forced = true;
      pump();
    },
    drain() {
      if (!size()) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        if (!waiters.length) drainFrom = failures;
        waiters.push({ resolve, reject });
        forced = true;
        if (retryTimer) {
          // A drain is a person waiting: try again now rather than at the end of the backoff.
          clearTimeout(retryTimer);
          retryTimer = null;
        }
        pump();
      });
    },
    size,
    state: () => current,
    dispose() {
      disposed = true;
      clearTimer();
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
    }
  };
}
