/**
 * Live game rooms (spec §3): one Durable Object per room, hibernatable
 * WebSockets, SQLite storage. The game rules are the pure reducer in
 * apps/teaching/src/games/core/room-core.ts, bundled to
 * netlify/functions/_shared/game-room-core.mjs and imported here, so Netlify
 * and the room run one implementation. This file is only sockets, storage,
 * alarms and HTTP.
 *
 * Routes (served at class.adam-russell.com/g/*, a zone route in front of the
 * class-site Custom Domain):
 *   POST /g/rooms                      create (body RoomConfig, signed by Netlify: x-game-room-signature)
 *   GET  /g/rooms/:room/ws?ticket=…    WebSocket
 *   GET  /g/rooms/:room/poll?since=N   fallback poll   (Authorization: Ticket …)
 *   POST /g/rooms/:room/send           fallback send   (Authorization: Ticket …, body ClientMsg)
 *   GET  /g/health
 *
 * Room codes are mapped to rooms on Netlify (it checks the code with the
 * student's identity at join), so the Worker needs no directory.
 *
 * Env: GAME_ROOM_SECRET (secret, same value as Netlify's), ALLOWED_ORIGINS
 * (comma list), GAME_ROOM (Durable Object binding).
 */
import { DurableObject } from 'cloudflare:workers';
import {
  ROOM_LIMITS, SIGNATURE_HEADER, initialState, nextAlarm, publicView, reduce, signBody, ticketFromAuthorization, verifyBody, verifyTicket, viewDelta
} from '../../../netlify/functions/_shared/game-room-core.mjs';

const ROOM_ID = /^[A-Za-z0-9_-]{8,64}$/;
const CODE = /^\d{6}$/;
const CONFIG_MAX = 1_000_000;
const MSG_MAX = 16_000;
const FOLD_CLEANUP_MS = 24 * 60 * 60 * 1000;
const CLOSE_CODES = { replaced: 4001, kicked: 4003, error: 4000 };
const DEFAULT_ORIGINS = 'https://life-hub.adam-russell.com,https://class.adam-russell.com,https://teaching-hub.adam-russell.com';

const log = (level, event, data = {}) => console[level === 'error' ? 'error' : 'log'](JSON.stringify({ level, event, ...data }));

// ─────────────────────────────────────────────────────────────── HTTP helpers

export function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(',').map((s) => s.trim()).filter(Boolean);
}

function cors(request, env) {
  const origin = request.headers.get('origin');
  if (!origin || !allowedOrigins(env).includes(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-max-age': '600',
    vary: 'origin'
  };
}

const json = (request, env, status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cors(request, env) } });
const fail = (request, env, status, code, message) => json(request, env, status, { ok: false, error: { code, message } });

/** Reads at most `max` characters of a body. */
async function readText(request, max) {
  const length = Number(request.headers.get('content-length'));
  if (Number.isFinite(length) && length > max) return null;
  const text = await request.text();
  return text.length > max ? null : text;
}

async function ticketWho(env, token, room) {
  const check = await verifyTicket(env.GAME_ROOM_SECRET, token, Date.now(), { room });
  if (!check.ok) return { error: check.code };
  const t = check.ticket;
  return { who: { owner: t.owner, role: t.role, ...(t.student_id ? { student_id: t.student_id } : {}), ...(t.initials ? { initials: t.initials } : {}) } };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request, env) });
    const url = new URL(request.url);
    const origin = request.headers.get('origin');
    // Browsers only from Life Hub pages; server calls (Netlify) send no Origin.
    if (origin && !allowedOrigins(env).includes(origin)) return fail(request, env, 403, 'forbidden', 'This origin is not allowed.');
    if (!env.GAME_ROOM_SECRET) return fail(request, env, 503, 'not_configured', 'Game rooms aren’t set up yet.');
    const path = url.pathname.replace(/\/+$/, '');

    if (path === '/g/health') return json(request, env, 200, { ok: true });

    if (path === '/g/rooms' && request.method === 'POST') {
      const text = await readText(request, CONFIG_MAX);
      if (text === null) return fail(request, env, 413, 'too_large', 'Room config too large.');
      if (!(await verifyBody(env.GAME_ROOM_SECRET, text, request.headers.get(SIGNATURE_HEADER), Date.now()))) return fail(request, env, 401, 'bad_signature', 'Not signed.');
      let config;
      try {
        config = JSON.parse(text);
      } catch {
        return fail(request, env, 400, 'bad_request', 'Invalid config.');
      }
      if (!config || !ROOM_ID.test(config.room ?? '') || !CODE.test(config.code ?? '') || !config.game || !config.keys || !['race', 'paced'].includes(config.style) || typeof config.fold_url !== 'string') {
        return fail(request, env, 400, 'bad_config', 'Invalid config.');
      }
      const result = await env.GAME_ROOM.getByName(config.room).create(config);
      if (!result.ok) return fail(request, env, 409, result.code, 'That room already exists.');
      return json(request, env, 201, { ok: true, data: { room: config.room, code: config.code } });
    }

    const m = /^\/g\/rooms\/([A-Za-z0-9_-]{8,64})\/(ws|poll|send)$/.exec(path);
    if (!m) return fail(request, env, 404, 'not_found', 'Not found.');
    const [, room, what] = m;
    const stub = env.GAME_ROOM.getByName(room);

    if (what === 'ws') {
      if (request.method !== 'GET' || request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return fail(request, env, 426, 'upgrade', 'Expected a WebSocket.');
      const { who, error } = await ticketWho(env, url.searchParams.get('ticket'), room);
      if (error) return fail(request, env, 401, error, 'Join again from the game page.');
      // Identity goes to the room in a header built here: never one a client sent.
      const headers = new Headers({ upgrade: 'websocket', 'x-game-room-who': JSON.stringify(who) });
      return stub.fetch(new Request('https://room/ws', { headers }));
    }

    const { who, error } = await ticketWho(env, ticketFromAuthorization(request.headers.get('authorization')), room);
    if (error) return fail(request, env, 401, error, 'Join again from the game page.');
    if (what === 'poll' && request.method === 'GET') {
      const out = await stub.poll(who, Number(url.searchParams.get('since') ?? -1));
      return out.ok ? json(request, env, 200, { ok: true, data: out }) : fail(request, env, 404, 'no_room', 'This game has closed.');
    }
    if (what === 'send' && request.method === 'POST') {
      const text = await readText(request, MSG_MAX);
      if (text === null) return fail(request, env, 413, 'too_large', 'Too much at once.');
      let msg;
      try {
        msg = JSON.parse(text);
      } catch {
        return fail(request, env, 400, 'bad_request', 'Invalid message.');
      }
      const out = await stub.send(who, msg);
      return out.ok ? json(request, env, 200, { ok: true, data: out }) : fail(request, env, 404, 'no_room', 'This game has closed.');
    }
    return fail(request, env, 405, 'method_not_allowed', 'Method not allowed.');
  }
};

// ─────────────────────────────────────────────────────────────── the room

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    /** conn → the last view sent on it, for deltas. In memory only: after hibernation the next send is a snapshot. */
    this.views = new Map();
    this.state = null;
    this.fold = null;
    this.persisted = new Map();
    ctx.blockConcurrencyWhile(async () => {
      const sql = ctx.storage.sql;
      sql.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
      sql.exec('CREATE TABLE IF NOT EXISTS events (owner TEXT NOT NULL, seq INTEGER NOT NULL, body TEXT NOT NULL, PRIMARY KEY (owner, seq))');
      this.load();
    });
  }

  // ── storage

  meta(k) {
    const row = this.ctx.storage.sql.exec('SELECT v FROM meta WHERE k = ?', k).toArray()[0];
    return row ? JSON.parse(row.v) : null;
  }

  setMeta(k, v) {
    this.ctx.storage.sql.exec('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v', k, JSON.stringify(v));
  }

  /** Rebuilds the room after a restart or hibernation: config, state, then every stored move. */
  load() {
    const config = this.meta('config');
    const rest = this.meta('state');
    this.fold = this.meta('fold');
    if (!config || !rest) return;
    const history = {};
    for (const row of this.ctx.storage.sql.exec('SELECT owner, body FROM events ORDER BY owner, seq')) {
      (history[row.owner] ??= []).push(JSON.parse(row.body));
    }
    for (const [owner, list] of Object.entries(history)) this.persisted.set(owner, list.length);
    this.state = { ...rest, config, history };
  }

  /** Writes what changed: the state (without config and moves) and any new moves. No await between writes: one atomic batch. */
  save() {
    const { config: _config, history, ...rest } = this.state;
    this.setMeta('state', rest);
    for (const [owner, list] of Object.entries(history)) {
      const from = this.persisted.get(owner) ?? 0;
      for (let i = from; i < list.length; i += 1) this.ctx.storage.sql.exec('INSERT OR REPLACE INTO events (owner, seq, body) VALUES (?, ?, ?)', owner, i, JSON.stringify(list[i]));
      this.persisted.set(owner, list.length);
    }
  }

  // ── reducer plumbing

  /**
   * Runs one action, persists, then carries out its effects. Messages for
   * `http` (a poller's own connection) are returned instead of sent.
   */
  async apply(action, http = null) {
    const now = Date.now();
    const { effects } = reduce(this.state, action, now);
    this.save();
    const outbox = [];
    for (const fx of effects) {
      if (fx.kind === 'send' || fx.kind === 'close') {
        const toHttp = http && fx.owner === http.owner && (!fx.conn || fx.conn === http.conn);
        if (toHttp) outbox.push(fx.msg);
        // A snapshot is the base the next delta for that connection is built on.
        if (fx.msg.t === 'snapshot' && fx.conn) this.views.set(fx.conn, fx.msg.view);
        for (const ws of this.socketsOf(fx.owner, fx.conn)) {
          this.sendTo(ws, fx.msg);
          if (fx.kind === 'close') this.closeSocket(ws, fx.msg);
        }
      } else if (fx.kind === 'broadcast') {
        this.broadcast(now);
      } else if (fx.kind === 'fold') {
        this.fold = { payload: fx.payload, attempts: 0, first_at: now, next_at: now };
        this.setMeta('fold', this.fold);
      }
    }
    await this.schedule();
    return outbox;
  }

  socketsOf(owner, conn) {
    return this.ctx.getWebSockets(owner).filter((ws) => !conn || ws.deserializeAttachment()?.conn === conn);
  }

  sendTo(ws, msg) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // Closed under us: webSocketClose tidies the seat.
    }
  }

  closeSocket(ws, msg) {
    const att = ws.deserializeAttachment();
    if (att?.conn) this.views.delete(att.conn);
    try {
      ws.close(CLOSE_CODES[msg.t] ?? CLOSE_CODES.error, msg.t);
    } catch {
      // Already closed.
    }
  }

  /** Each socket gets its own view: a delta of what changed for it, or a snapshot when it has no earlier view. */
  broadcast(now) {
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment();
      if (!att) continue;
      const view = publicView(this.state, att.role, att.owner, now);
      const prev = this.views.get(att.conn);
      const patch = prev ? viewDelta(prev, view) : null;
      this.views.set(att.conn, view);
      if (patch && !Object.keys(patch).length) continue;
      this.sendTo(ws, patch ? { t: 'delta', seq: view.seq, now, patch } : { t: 'snapshot', view });
    }
  }

  /** One alarm serves the room clock, fold retries and the clean-up after a fold. */
  async schedule() {
    const times = [];
    if (this.state) {
      const at = nextAlarm(this.state);
      if (at !== null) times.push(at);
    }
    if (this.fold && !this.fold.done && !this.fold.gave_up) times.push(this.fold.next_at);
    if (this.fold?.done) times.push(this.fold.done + FOLD_CLEANUP_MS);
    if (!times.length) return;
    const at = Math.min(...times);
    const current = await this.ctx.storage.getAlarm();
    if (current !== at) await this.ctx.storage.setAlarm(at);
  }

  // ── RPC from the Worker

  async create(config) {
    if (this.state) return this.state.config.code === config.code ? { ok: true, existed: true } : { ok: false, code: 'exists' };
    const now = Date.now();
    this.state = initialState(config, now);
    this.setMeta('config', config);
    this.save();
    await this.schedule();
    log('info', 'room_created', { room: config.room, kind: config.game?.kind, seats: Object.keys(config.roster ?? {}).length });
    return { ok: true };
  }

  /** Fallback poll: a snapshot when the poller is behind, else nothing. The first poll takes the seat. */
  async poll(who, since) {
    if (!this.state) return { ok: false };
    const conn = `poll:${who.owner}`;
    if (this.state.conns?.[who.owner] !== conn) {
      const msgs = await this.apply({ type: 'connect', ...who, conn }, { owner: who.owner, conn });
      return { ok: true, seq: this.state.seq, msgs };
    }
    const msgs = Number.isFinite(since) && since >= this.state.seq ? [] : [{ t: 'snapshot', view: publicView(this.state, who.role, who.owner, Date.now()) }];
    return { ok: true, seq: this.state.seq, msgs };
  }

  /** Fallback send: the reply (ack, pong, snapshot for hello) comes back in the response. */
  async send(who, msg) {
    if (!this.state) return { ok: false };
    const conn = `poll:${who.owner}`;
    const msgs = [];
    if (!this.state.conns?.[who.owner]) msgs.push(...(await this.apply({ type: 'connect', ...who, conn }, { owner: who.owner, conn })));
    msgs.push(...(await this.apply({ type: 'msg', owner: who.owner, role: who.role, conn, msg }, { owner: who.owner, conn })));
    return { ok: true, seq: this.state.seq, msgs };
  }

  // ── WebSockets (hibernatable)

  async fetch(request) {
    if (!this.state) return new Response('This game has closed.', { status: 404 });
    let who;
    try {
      who = JSON.parse(request.headers.get('x-game-room-who') ?? '');
    } catch {
      return new Response('Bad request', { status: 400 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const conn = crypto.randomUUID();
    this.ctx.acceptWebSocket(server, [who.owner]);
    server.serializeAttachment({ ...who, conn });
    await this.apply({ type: 'connect', ...who, conn });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, data) {
    const att = ws.deserializeAttachment();
    if (!att || !this.state) return;
    if (typeof data !== 'string' || data.length > MSG_MAX) return this.sendTo(ws, { t: 'error', code: 'too_large', message: 'That message is too large.' });
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return this.sendTo(ws, { t: 'error', code: 'bad_message', message: 'That message couldn’t be read.' });
    }
    await this.apply({ type: 'msg', owner: att.owner, role: att.role, conn: att.conn, msg });
  }

  async webSocketClose(ws) {
    const att = ws.deserializeAttachment();
    if (!att) return;
    this.views.delete(att.conn);
    if (this.state) await this.apply({ type: 'disconnect', owner: att.owner, conn: att.conn });
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }

  // ── alarms: the clock, the fold and its retries, clean-up

  async alarm() {
    const now = Date.now();
    if (this.fold?.done && now >= this.fold.done + FOLD_CLEANUP_MS) {
      // Folded a day ago: Netlify has everything. Close what's left and forget the room.
      for (const ws of this.ctx.getWebSockets()) this.closeSocket(ws, { t: 'error' });
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      this.state = null;
      this.fold = null;
      return;
    }
    if (this.state) await this.apply({ type: 'tick' });
    if (this.fold && !this.fold.done && !this.fold.gave_up && now >= this.fold.next_at) await this.postFold(now);
    await this.schedule();
  }

  async postFold(now) {
    const body = JSON.stringify(this.fold.payload);
    try {
      const res = await fetch(this.state.config.fold_url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [SIGNATURE_HEADER]: await signBody(this.env.GAME_ROOM_SECRET, body, now) },
        body
      });
      if (!res.ok) throw new Error(`fold ${res.status}`);
      this.fold = { ...this.fold, payload: null, done: now };
      this.setMeta('fold', this.fold);
      await this.apply({ type: 'folded' });
      log('info', 'room_folded', { room: this.state.config.room, attempts: this.fold.attempts + 1 });
    } catch (e) {
      const attempts = this.fold.attempts + 1;
      const gaveUp = now - this.fold.first_at >= ROOM_LIMITS.foldRetryMs;
      // Backoff: 15 s, 30 s, 1 min … up to 30 min, for 24 h.
      this.fold = { ...this.fold, attempts, next_at: now + Math.min(15_000 * 2 ** (attempts - 1), 30 * 60_000), ...(gaveUp ? { gave_up: now } : {}) };
      this.setMeta('fold', this.fold);
      log('error', gaveUp ? 'room_fold_gave_up' : 'room_fold_retry', { room: this.state.config.room, attempts, error: String(e?.message ?? e) });
    }
  }
}
