import { ROOM_LIMITS, type ClientMsg, type RoomView, type ServerMsg } from '../core/room-protocol';
import type { EventResult } from '../api';

/**
 * The live room client (spec §3.4). One connection per screen: WebSocket
 * first; HTTPS polling of the same room when the socket isn't open within
 * `ROOM_LIMITS.socketOpenMs` or drops `socketDropsPerMinute` times in a
 * minute (school networks that block wss still play, with a "Slow
 * connection" chip). Keeps the merged `RoomView` (snapshot, then deltas by
 * `seq`; a gap asks for a snapshot with `hello since`), a clock offset from
 * ping/pong (on join and every 30 s), and one promise per request id that
 * the room's `ack` settles. Unacked requests are sent again after a
 * reconnect; the room answers a repeated `rid` from its own record.
 *
 * Every dependency (socket, fetch, clock, timers) can be passed in, so the
 * whole thing runs in unit tests with fakes.
 */

export type RoomStatus = 'connecting' | 'open' | 'polling' | 'reconnecting' | 'closed';
/** Why a connection closed for good: the teacher removed the seat, it opened elsewhere, or the client closed it. */
export type ClosedReason = 'replaced' | 'kicked' | 'closed';

type Ack = Extract<ServerMsg, { t: 'ack' }>;
/** A client message without its request id (the connection adds one). */
export type Outgoing = ClientMsg extends infer M ? (M extends ClientMsg ? Omit<M, 'rid'> : never) : never;

/** The bits of `WebSocket` the client uses, so tests can pass a fake. */
export type SocketLike = {
  readyState: number;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
};
export type SocketCtor = new (url: string) => SocketLike;
export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export type ConnectOptions = {
  /** `wss://host/g` (the Worker's base). Sockets open at `{wsBase}/rooms/{room}/ws?ticket=…` (workers/game-rooms). */
  wsBase: string;
  /** HTTPS base for polling; defaults to `wsBase` with `ws` → `http`. */
  httpBase?: string;
  room: string;
  ticket: string;
  /** Every message from the room, after the view has been updated. */
  onMsg(msg: ServerMsg, conn: RoomConnection): void;
  onStatus?(status: RoomStatus, info: { slow: boolean; reason?: ClosedReason }): void;
  WebSocketImpl?: SocketCtor | null;
  fetchImpl?: FetchLike;
  /** Local clock (ms). */
  now?: () => number;
};

export type RoomConnection = {
  /** Sends one message with a fresh request id; resolves with the room's ack (rejects on an ack error or close). */
  request(msg: Outgoing): Promise<Ack>;
  /** A move; resolves with the marker's verdict. */
  move(event: Extract<Outgoing, { t: 'move' }>['event']): Promise<EventResult>;
  /** Server time now, from the clock offset. */
  serverNow(): number;
  offsetMs(): number;
  view(): RoomView | null;
  status(): RoomStatus;
  slow(): boolean;
  close(): void;
};

/** Pure: applies one room message to the client's view. `gap` means a delta skipped a number: ask for a snapshot. */
export function applyServerMsg(view: RoomView | null, msg: ServerMsg): { view: RoomView | null; gap: boolean; changed: boolean } {
  if (msg.t === 'snapshot') return { view: msg.view, gap: false, changed: true };
  if (msg.t !== 'delta') return { view, gap: false, changed: false };
  if (!view) return { view, gap: true, changed: false };
  if (msg.seq <= view.seq) return { view, gap: false, changed: false };
  if (msg.seq !== view.seq + 1) return { view, gap: true, changed: false };
  return { view: { ...view, ...msg.patch, now: msg.now, seq: msg.seq }, gap: false, changed: true };
}

/** `wss://a/b` → `https://a/b`. */
export function httpFromWs(base: string): string {
  return base.replace(/^ws(s?):/i, 'http$1:').replace(/\/+$/, '');
}

/** Reads a poll or send reply: a list of messages, `{ messages }`, `{ msgs }` or one message. */
export function messagesFrom(body: unknown): ServerMsg[] {
  if (Array.isArray(body)) return body.filter(isMsg);
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>;
    if (Array.isArray(o.messages)) return o.messages.filter(isMsg);
    if (Array.isArray(o.msgs)) return o.msgs.filter(isMsg);
    // The Worker's envelope: { ok, data: { seq, msgs } }.
    if (o.data && typeof o.data === 'object') return messagesFrom(o.data);
    if (isMsg(o)) return [o];
  }
  return [];
}
const isMsg = (m: unknown): m is ServerMsg => !!m && typeof m === 'object' && typeof (m as { t?: unknown }).t === 'string';

const OPEN = 1;
const BACKOFF_MS = [400, 1000, 2000, 4000, 8000];

let ridCounter = 0;
const newRid = () => `r${Date.now().toString(36)}${(ridCounter += 1).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function connectRoom(options: ConnectOptions): RoomConnection {
  const now = options.now ?? (() => Date.now());
  const fetchImpl: FetchLike | null = options.fetchImpl ?? (typeof fetch === 'function' ? (fetch.bind(globalThis) as unknown as FetchLike) : null);
  const Socket: SocketCtor | null = options.WebSocketImpl === undefined ? ((globalThis as { WebSocket?: SocketCtor }).WebSocket ?? null) : options.WebSocketImpl;
  const httpBase = (options.httpBase ?? httpFromWs(options.wsBase)).replace(/\/+$/, '');
  const roomPath = `/rooms/${encodeURIComponent(options.room)}`;

  let view: RoomView | null = null;
  let status: RoomStatus = 'connecting';
  let mode: 'socket' | 'polling' = 'socket';
  let closed = false;
  let closedReason: ClosedReason | undefined;
  let socket: SocketLike | null = null;
  let openTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let polling = false;
  let attempts = 0;
  let drops: number[] = [];
  /** Clock samples: offset with its round trip; the shortest trip wins. */
  let samples: Array<{ offset: number; rtt: number }> = [];
  let offset = 0;
  let haveOffset = false;
  const pending = new Map<string, { msg: ClientMsg; resolve: (a: Ack) => void; reject: (e: Error) => void }>();

  const conn: RoomConnection = {
    request,
    move(event) {
      return request({ t: 'move', event }).then((ack) => ack.result ?? { item: event.item });
    },
    serverNow: () => now() + offset,
    offsetMs: () => offset,
    view: () => view,
    status: () => status,
    slow: () => mode === 'polling',
    close: () => shut('closed')
  };

  function setStatus(next: RoomStatus): void {
    status = next;
    options.onStatus?.(next, { slow: mode === 'polling', ...(closedReason ? { reason: closedReason } : {}) });
  }

  function handle(msg: ServerMsg): void {
    if (closed) return;
    if (msg.t === 'pong') {
      const t = now();
      const rtt = Math.max(0, t - msg.sent);
      samples = [...samples, { offset: msg.now + rtt / 2 - t, rtt }].slice(-5);
      offset = samples.reduce((best, s) => (s.rtt < best.rtt ? s : best)).offset;
      haveOffset = true;
    }
    if ((msg.t === 'snapshot' || msg.t === 'delta') && !haveOffset) {
      // Until a ping comes back, the view's own server time is the best guess.
      offset = (msg.t === 'snapshot' ? msg.view.now : msg.now) - now();
    }
    const applied = applyServerMsg(view, msg);
    view = applied.view;
    if (applied.gap) send({ t: 'hello', ...(view ? { since: view.seq } : {}) });
    if (msg.t === 'ack' && msg.rid) {
      const p = pending.get(msg.rid);
      if (p) {
        pending.delete(msg.rid);
        if (msg.error) p.reject(Object.assign(new Error(msg.error.message || 'The room said no.'), { code: msg.error.code }));
        else p.resolve(msg);
      }
    }
    options.onMsg(msg, conn);
    if (msg.t === 'replaced' || msg.t === 'kicked') shut(msg.t);
  }

  function request(msg: Outgoing): Promise<Ack> {
    if (closed) return Promise.reject(Object.assign(new Error('The game has closed on this device.'), { code: closedReason ?? 'closed' }));
    const rid = newRid();
    const full = { ...msg, rid } as ClientMsg;
    return new Promise<Ack>((resolve, reject) => {
      pending.set(rid, { msg: full, resolve, reject });
      send(full);
    });
  }

  /** Sends now if there's a way to; otherwise the message waits in `pending` (requests) or is dropped (hello/ping are resent on open). */
  function send(msg: ClientMsg): void {
    if (closed) return;
    if (mode === 'socket') {
      if (socket && socket.readyState === OPEN) {
        try {
          socket.send(JSON.stringify(msg));
        } catch {
          // The close handler takes it from here; pending requests go again on reopen.
        }
      }
      return;
    }
    void post(msg);
  }

  async function post(msg: ClientMsg): Promise<void> {
    if (!fetchImpl) return;
    try {
      const res = await fetchImpl(`${httpBase}${roomPath}/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Ticket ${options.ticket}` },
        body: JSON.stringify(msg)
      });
      if (!res.ok) return;
      for (const m of messagesFrom(await res.json().catch(() => null))) handle(m);
    } catch {
      // Network blip: requests stay pending and go again on the next poll round.
    }
  }

  function ping(): void {
    send({ t: 'ping', sent: now() });
  }

  function onOpened(): void {
    attempts = 0;
    setStatus('open');
    send({ t: 'hello', ...(view ? { since: view.seq } : {}) });
    ping();
    for (const p of pending.values()) send(p.msg);
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(ping, ROOM_LIMITS.pingEveryMs);
  }

  function openSocket(): void {
    if (closed) return;
    if (!Socket) {
      startPolling();
      return;
    }
    let s: SocketLike;
    try {
      s = new Socket(`${options.wsBase.replace(/\/+$/, '')}${roomPath}/ws?ticket=${encodeURIComponent(options.ticket)}`);
    } catch {
      startPolling();
      return;
    }
    socket = s;
    if (openTimer) clearTimeout(openTimer);
    openTimer = setTimeout(() => {
      if (socket === s && s.readyState !== OPEN) {
        // Not open in time: this network probably blocks sockets.
        detach(s);
        startPolling();
      }
    }, ROOM_LIMITS.socketOpenMs);
    s.onopen = () => {
      if (socket !== s || closed) return;
      if (openTimer) clearTimeout(openTimer);
      onOpened();
    };
    s.onmessage = (ev) => {
      if (socket !== s) return;
      let data: unknown;
      try {
        data = typeof ev.data === 'string' ? JSON.parse(ev.data) : null;
      } catch {
        return;
      }
      if (isMsg(data)) handle(data);
    };
    s.onerror = () => undefined;
    s.onclose = (ev) => {
      if (socket !== s || closed) return;
      // The room closes a replaced seat with 4001 and a kicked one with 4003: final, never retried.
      const code = (ev as { code?: number } | null)?.code;
      if (code === 4001 || code === 4003) {
        handle({ t: code === 4001 ? 'replaced' : 'kicked' });
        return;
      }
      if (openTimer) clearTimeout(openTimer);
      socket = null;
      if (pingTimer) clearInterval(pingTimer);
      const t = now();
      drops = [...drops.filter((d) => t - d < 60_000), t];
      if (drops.length >= ROOM_LIMITS.socketDropsPerMinute) {
        startPolling();
        return;
      }
      setStatus('reconnecting');
      const wait = BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)];
      attempts += 1;
      retryTimer = setTimeout(openSocket, wait);
    };
  }

  function detach(s: SocketLike): void {
    s.onopen = s.onmessage = s.onclose = s.onerror = null;
    try {
      s.close();
    } catch {
      // Already closed.
    }
    if (socket === s) socket = null;
  }

  function startPolling(): void {
    if (closed || mode === 'polling') return;
    mode = 'polling';
    if (socket) detach(socket);
    if (pingTimer) clearInterval(pingTimer);
    setStatus('polling');
    ping();
    for (const p of pending.values()) void post(p.msg);
    pingTimer = setInterval(ping, ROOM_LIMITS.pingEveryMs);
    void pollOnce();
  }

  async function pollOnce(): Promise<void> {
    if (closed || polling) return;
    polling = true;
    try {
      if (fetchImpl) {
        const since = view ? `?since=${view.seq}` : '';
        const res = await fetchImpl(`${httpBase}${roomPath}/poll${since}`, { method: 'GET', headers: { authorization: `Ticket ${options.ticket}` } });
        if (res.ok) for (const m of messagesFrom(await res.json().catch(() => null))) handle(m);
      }
    } catch {
      // Keep polling: the next round tries again.
    } finally {
      polling = false;
      if (!closed) pollTimer = setTimeout(() => void pollOnce(), ROOM_LIMITS.pollMs);
    }
  }

  function shut(reason: ClosedReason): void {
    if (closed) return;
    closedReason = reason;
    closed = true;
    for (const t of [openTimer, retryTimer, pollTimer]) if (t) clearTimeout(t);
    if (pingTimer) clearInterval(pingTimer);
    if (socket) detach(socket);
    for (const p of pending.values()) p.reject(Object.assign(new Error('The game has closed on this device.'), { code: reason }));
    pending.clear();
    status = 'closed';
    options.onStatus?.('closed', { slow: mode === 'polling', reason });
  }

  setStatus('connecting');
  openSocket();
  return conn;
}

/** Seconds left until a server time, from this client's clock offset (never negative). */
export function secondsLeft(endsAt: number | undefined, serverNow: number): number {
  if (!endsAt) return 0;
  return Math.max(0, Math.ceil((endsAt - serverNow) / 1000));
}
