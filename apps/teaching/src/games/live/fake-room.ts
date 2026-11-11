import type { EventResult, SoloEvent } from '../api';
import type { PublicGame } from '../core/schema';
import { FAKE_SPEAKER } from '../core/schema';
import { MARKED_MOVES } from '../core/events';
import { checkAnswer, checkSelection, crosswordHint, gameTotal, wordHint, type GameKeys } from '../core/model';
import { ROOM_LIMITS, type ClientMsg, type ControlOp, type PacedItem, type Phase, type Role, type RoomView, type Seat, type ServerMsg, type TicketPayload } from '../core/room-protocol';
import { quotePoints } from '../kinds/who-said-it/player';
import type { SocketLike } from './transport';

/**
 * DEV ONLY: an in-browser stand-in for the game room, so the board and phones
 * can be walked in /games.html without the Worker. It speaks the protocol
 * (room-protocol.ts) over a BroadcastChannel, so phones in other tabs reach
 * the board's tab. It is NOT the real reducer (`core/room-core.ts`); it marks
 * race moves with the same model checks the solo endpoint uses and keeps just
 * enough state to drive the screens. "Simulate class" adds invented seats
 * that join and play.
 */

export const FAKE_WS_BASE = 'fake://game-rooms';

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

/** A ticket in the real format, signed with nothing (the fake room doesn't check). */
export function fakeTicket(payload: TicketPayload): string {
  return `${b64(JSON.stringify(payload))}.dev`;
}
function readTicket(ticket: string): TicketPayload | null {
  try {
    return JSON.parse(unb64(ticket.split('.')[0])) as TicketPayload;
  } catch {
    return null;
  }
}

/* ── A tiny message bus: BroadcastChannel, or in-page when that's missing ── */

type Wire = { k: 'open' | 'msg' | 'close'; cid: string; ticket?: string; data?: unknown; to?: 'room' } | { k: 'opened' | 'msg' | 'closed'; cid: string; data?: unknown; to: 'client' };
type Bus = { post(m: Wire): void; on(fn: (m: Wire) => void): void; close(): void };
const local = new Map<string, Set<(m: Wire) => void>>();
function bus(name: string): Bus {
  if (typeof BroadcastChannel === 'function') {
    const ch = new BroadcastChannel(name);
    const fns: Array<(m: Wire) => void> = [];
    ch.onmessage = (e) => fns.forEach((f) => f(e.data as Wire));
    return { post: (m) => ch.postMessage(m), on: (f) => fns.push(f), close: () => ch.close() };
  }
  const set = local.get(name) ?? new Set();
  local.set(name, set);
  const mine: Array<(m: Wire) => void> = [];
  return {
    post: (m) => set.forEach((f) => !mine.includes(f) && setTimeout(() => f(m), 0)),
    on: (f) => {
      mine.push(f);
      set.add(f);
    },
    close: () => mine.forEach((f) => set.delete(f))
  };
}
const channelFor = (room: string) => `gl-fake-room:${room}`;

/** A WebSocket look-alike that talks to a fake room over the bus. URL: `fake://game-rooms/rooms/{room}/ws?ticket=…`. */
export class FakeSocket implements SocketLike {
  readyState = 0;
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  private cid = `c${Math.random().toString(36).slice(2, 10)}`;
  private bus: Bus;
  constructor(url: string) {
    const m = /\/rooms\/([^/?]+)(?:\/ws)?\?ticket=([^&]+)/.exec(url);
    const room = m ? decodeURIComponent(m[1]) : 'none';
    this.bus = bus(channelFor(room));
    this.bus.on((w) => {
      if (w.to !== 'client' || w.cid !== this.cid) return;
      if (w.k === 'opened') {
        this.readyState = 1;
        this.onopen?.({});
      } else if (w.k === 'msg') this.onmessage?.({ data: JSON.stringify(w.data) });
      else if (w.k === 'closed') this.shut();
    });
    this.bus.post({ k: 'open', cid: this.cid, ticket: m ? decodeURIComponent(m[2]) : '', to: 'room' });
  }
  send(data: string): void {
    if (this.readyState !== 1) return;
    this.bus.post({ k: 'msg', cid: this.cid, data: JSON.parse(data), to: 'room' });
  }
  close(): void {
    if (this.readyState === 3) return;
    this.bus.post({ k: 'close', cid: this.cid, to: 'room' });
    this.shut();
  }
  private shut(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.({});
    this.bus.close();
  }
}

/* ── The fake room ──────────────────────────────────────────────── */

export type FakeRoomOptions = { room: string; code: string; game: PublicGame; keys: GameKeys; title?: string; itemSeconds?: number };
export type FakeRoom = { simulate(n?: number): void; stop(): void; seats(): Seat[] };

const SIM_INITIALS = ['AK', 'BL', 'CM', 'DN', 'EO', 'FP', 'GR', 'HS', 'IT', 'JW', 'KY', 'LZ', 'MB', 'NC', 'OD', 'PE', 'QF', 'RG', 'SH', 'TJ', 'UK', 'VL', 'WM', 'XN'];

type Conn = { cid: string; owner: string; role: Role };
type Past = { item: string; move: string; correct?: boolean; group?: string };

export function createFakeRoom(o: FakeRoomOptions): FakeRoom {
  const b = bus(channelFor(o.room));
  const style: 'race' | 'paced' = o.game.kind === 'who_said_it' ? 'paced' : 'race';
  const seconds = o.itemSeconds ?? (Number(o.game.settings.seconds) || ROOM_LIMITS.pacedSeconds);
  const total = gameTotal(o.keys);
  const quoteIds = Object.keys(o.keys.items).filter((id) => o.keys.items[id].shape === 'quote');
  const conns = new Map<string, Conn>();
  const seats = new Map<string, Seat>();
  const history = new Map<string, Past[]>();
  const last = new Map<string, EventResult>();
  const firsts = new Set<string>();
  const pairs = new Map<string, number>();
  let phase: Phase = 'lobby';
  let seq = 0;
  let endsAt: number | undefined;
  let pausedLeft = 0;
  let boardView: 'race' | 'class_wall' = 'race';
  let item: (PacedItem & { choices: Record<string, { choice: string; at: number }> }) | undefined;
  let itemIndex = -1;
  let ticker: RoomView['ticker'] = [];
  let timers: Array<ReturnType<typeof setTimeout>> = [];
  let sim: ReturnType<typeof setInterval> | null = null;
  const simSeats = new Set<string>();

  const now = () => Date.now();
  const later = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

  function leaderboard(): RoomView['leaderboard'] {
    const rows = [...seats.values()].sort((a, b) => b.score - a.score || Number(!!b.finished) - Number(!!a.finished) || a.initials.localeCompare(b.initials));
    return rows.map((s, i) => ({ initials: s.initials, score: s.score, rank: i + 1 }));
  }

  function viewFor(c: Conn): RoomView {
    const lb = leaderboard();
    const all = [...seats.values()];
    const student = c.role === 'student';
    const mine = seats.get(c.owner);
    const publicItem: PacedItem | undefined = item ? { item: item.item, index: item.index, of: item.of, opened_at: item.opened_at, ends_at: item.ends_at, answered: item.answered, ...(item.revealed ? { revealed: item.revealed } : {}) } : undefined;
    return {
      room: o.room,
      code: o.code,
      kind: o.game.kind,
      style,
      title: o.title ?? o.game.title,
      phase,
      now: now(),
      ...(endsAt ? { ends_at: endsAt } : {}),
      // Like the room: students get no seats, only `you` and the top five.
      seats: student ? [] : all,
      ticker,
      ...(style === 'race' ? { board_view: boardView } : {}),
      ...(phase === 'paused' && pausedLeft ? { paused_left_ms: pausedLeft } : {}),
      ...(publicItem ? { item: publicItem } : {}),
      leaderboard: lb.slice(0, ROOM_LIMITS.leaderboardTop),
      ...(student ? { you: { owner: c.owner, ...(mine ? { seat: mine } : {}), ...(last.get(c.owner) ? { last: last.get(c.owner) } : {}), rank: lb.find((r) => r.initials === mine?.initials)?.rank } } : {}),
      ...(o.game.kind === 'connections' ? { class_wall: [...pairs.entries()].map(([k, count]) => ({ a: k.split('\u0000')[0], b: k.split('\u0000')[1], count })) } : {}),
      seq
    };
  }

  const sendTo = (cid: string, msg: ServerMsg) => b.post({ k: 'msg', cid, data: msg, to: 'client' });
  function broadcast(): void {
    seq += 1;
    for (const c of conns.values()) {
      const v = viewFor(c);
      const { seq: s, now: n, ...patch } = v;
      sendTo(c.cid, { t: 'delta', seq: s, now: n, patch });
    }
  }

  function seatFor(owner: string, initials: string): Seat {
    let s = seats.get(owner);
    if (!s) {
      s = { owner, initials, connected: true, score: 0, ...(style === 'race' ? { progress: { done: 0, total, ...(o.game.kind === 'connections' ? { mistakes: 0, mistakes_max: Number(o.game.settings.mistakes) || 4, groups: [] } : {}) } } : {}) };
      seats.set(owner, s);
    }
    return s;
  }

  /* Race marking: the same model checks as the solo endpoint, kept short. */
  function mark(owner: string, e: SoloEvent): EventResult {
    const past = history.get(owner) ?? [];
    history.set(owner, past);
    const grid = o.keys.grid;
    const key = o.keys.items[e.item];
    const out: EventResult = { item: e.item };
    if (o.game.kind === 'find_a_word' && grid?.kind === 'wordsearch' && e.move === 'answer') {
      const check = checkSelection(grid, e.item === 'any' ? null : e.item, e.response);
      if (!check.item) return { item: e.item, correct: false };
      const solved = past.some((p) => p.item === check.item && p.correct);
      past.push({ item: check.item, move: 'answer', correct: check.correct === true });
      return { item: check.item, correct: check.correct === true, ...(check.decoy ? { decoy: true } : {}), ...(solved && check.correct ? { again: true } : {}) };
    }
    if (!key) return out;
    if (MARKED_MOVES.has(e.move)) {
      const check = checkAnswer(key, e.response);
      past.push({ item: e.item, move: e.move, correct: check.correct, ...(check.group ? { group: check.group } : {}) });
      out.correct = check.correct;
      if (check.one_away) out.one_away = true;
      if (key.shape === 'wall' && check.group) {
        const g = key.groups.find((x) => x.id === check.group);
        if (g) out.reveal = { group: { id: g.id, label: g.label, why: g.why, difficulty: g.difficulty, tiles: g.tiles } };
      }
      if (key.shape === 'wall' && !check.correct && Array.isArray((e.response as { tiles?: unknown })?.tiles)) {
        const texts = ((e.response as { tiles: string[] }).tiles).map((id) => o.game.walls?.flatMap((w) => w.tiles).find((t) => t.id === id)?.text ?? id);
        for (let i = 0; i < texts.length; i += 1) for (let j = i + 1; j < texts.length; j += 1) {
          const k = [texts[i], texts[j]].sort().join('\u0000');
          pairs.set(k, (pairs.get(k) ?? 0) + 1);
        }
      }
      return out;
    }
    if (e.move === 'hint' && grid && key.shape === 'term') {
      const step = Math.min(3, past.filter((p) => p.item === e.item && p.move === 'hint').length + 1);
      past.push({ item: e.item, move: 'hint' });
      const typed = typeof (e.response as { letters?: unknown })?.letters === 'string' ? (e.response as { letters: string }).letters : '';
      out.reveal = grid.kind === 'crossword' ? { step, cells: crosswordHint(grid, e.item, step, typed) } : { step, ...wordHint(grid, e.item, step) };
      return out;
    }
    if (e.move === 'pass' && key.shape === 'wall') {
      const got = new Set(past.filter((p) => p.correct && p.group).map((p) => p.group));
      out.reveal = { groups: key.groups.filter((g) => !got.has(g.id)).map(({ id, label, why, difficulty, tiles }) => ({ id, label, why, difficulty, tiles })) };
    }
    return out;
  }

  /** Like the room: names no one and no answer ("found the purple group", "solved 4 down", "found word 3"). */
  function tickerText(itemId: string, difficulty?: number): string {
    if (o.game.kind === 'connections') return `found the ${['gold', 'green', 'blue', 'purple'][(difficulty ?? 1) - 1] ?? 'next'} group`;
    const entry = o.game.grid?.kind === 'crossword' ? o.game.grid.entries.find((x) => x.item === itemId) : undefined;
    if (entry) return `solved ${entry.number} ${entry.dir}`;
    const idx = (o.game.items ?? []).findIndex((i) => i.id === itemId);
    return idx >= 0 ? `found word ${idx + 1}` : 'found a word';
  }

  function progress(owner: string, result: EventResult): void {
    const s = seats.get(owner);
    if (!s?.progress) return;
    const past = history.get(owner) ?? [];
    if (o.game.kind === 'connections') {
      const groups = past.filter((p) => p.correct && p.group).map((p) => p.group as string);
      const uniq = [...new Set(groups)];
      const wall = Object.values(o.keys.items).find((k) => k.shape === 'wall');
      s.progress.groups = uniq.map((g) => (wall && wall.shape === 'wall' ? wall.groups.find((x) => x.id === g)?.difficulty ?? 1 : 1));
      s.progress.done = uniq.length;
      s.progress.mistakes = past.filter((p) => p.move === 'guess' && p.correct === false).length;
      if (result.correct && result.reveal?.group && !firsts.has(result.reveal.group.id)) {
        firsts.add(result.reveal.group.id);
        ticker = [{ initials: '', text: tickerText('', result.reveal.group.difficulty), at: now() }, ...ticker].slice(0, 8);
      }
      if (s.progress.done >= total || (s.progress.mistakes ?? 0) >= (s.progress.mistakes_max ?? 4)) s.finished = true;
    } else {
      s.progress.done = new Set(past.filter((p) => p.correct).map((p) => p.item)).size;
      if (result.correct && !firsts.has(result.item)) {
        firsts.add(result.item);
        ticker = [{ initials: '', text: tickerText(result.item), at: now() }, ...ticker].slice(0, 8);
      }
      if (s.progress.done >= total) s.finished = true;
    }
    s.score = s.progress.done;
  }

  /* Paced */
  function openItem(index: number): void {
    itemIndex = index;
    const id = quoteIds[index];
    if (!id) return end();
    const t = now();
    item = { item: id, index, of: quoteIds.length, opened_at: t, ends_at: t + seconds * 1000, answered: [], choices: {} };
    endsAt = item.ends_at;
    phase = 'playing';
    broadcast();
  }
  function reveal(): void {
    if (!item || item.revealed) return;
    const key = o.keys.items[item.item];
    const speaker = key?.shape === 'quote' ? key.speaker : FAKE_SPEAKER;
    const counts: Record<string, number> = {};
    for (const [owner, ch] of Object.entries(item.choices)) {
      counts[ch.choice] = (counts[ch.choice] ?? 0) + 1;
      const correct = ch.choice === speaker;
      const s = seats.get(owner);
      if (s && correct) s.score += quotePoints(true, speaker === FAKE_SPEAKER, ch.at - item.opened_at, seconds);
      last.set(owner, { item: item.item, correct });
    }
    item.ends_at = Math.min(item.ends_at, now());
    item.revealed = { counts, reveal: key?.shape === 'quote' ? { speaker, ...(key.source ? { source: key.source } : {}), ...(key.why_fake ? { why_fake: key.why_fake } : {}) } : undefined };
    broadcast();
  }
  function end(): void {
    phase = 'ended';
    endsAt = undefined;
    if (sim) clearInterval(sim);
    broadcast();
  }

  function control(op: ControlOp): string | null {
    switch (op.op) {
      case 'start':
        if (phase !== 'lobby') return 'Already started.';
        phase = 'countdown';
        endsAt = now() + ROOM_LIMITS.countdownMs;
        later(ROOM_LIMITS.countdownMs, () => {
          if (style === 'paced') openItem(0);
          else {
            phase = 'playing';
            endsAt = undefined;
            broadcast();
          }
        });
        return null;
      case 'pause':
        if (phase !== 'playing') return 'Not playing.';
        phase = 'paused';
        if (item && !item.revealed) pausedLeft = Math.max(0, item.ends_at - now());
        return null;
      case 'resume':
        if (phase !== 'paused') return 'Not paused.';
        phase = 'playing';
        if (item && !item.revealed && pausedLeft) item.ends_at = now() + pausedLeft;
        pausedLeft = 0;
        return null;
      case 'next':
        if (style !== 'paced') return 'Race games have no next.';
        openItem(itemIndex + 1);
        return null;
      case 'reveal':
        reveal();
        return null;
      case 'add_time':
        if (item && !item.revealed) item.ends_at = Math.max(item.ends_at, now()) + op.seconds * 1000;
        return null;
      case 'kick': {
        seats.delete(op.owner);
        for (const c of [...conns.values()]) if (c.owner === op.owner) {
          sendTo(c.cid, { t: 'kicked' });
          b.post({ k: 'closed', cid: c.cid, to: 'client' });
          conns.delete(c.cid);
        }
        return null;
      }
      case 'board_view':
        boardView = op.view;
        return null;
      case 'end':
        end();
        return null;
      default:
        return 'Unknown control.';
    }
  }

  function onClient(c: Conn, msg: ClientMsg): void {
    const ack = (extra: Partial<Extract<ServerMsg, { t: 'ack' }>> = {}) => sendTo(c.cid, { t: 'ack', rid: msg.rid, ...extra });
    if (msg.t === 'hello') return sendTo(c.cid, { t: 'snapshot', view: viewFor(c) });
    if (msg.t === 'ping') return sendTo(c.cid, { t: 'pong', rid: msg.rid, sent: msg.sent, now: now() });
    if (msg.t === 'control') {
      if (c.role === 'student') return ack({ error: { code: 'forbidden', message: 'Only the teacher can do that.' } });
      const err = control(msg.op);
      ack(err ? { error: { code: 'bad_control', message: err } } : {});
      if (!err && msg.op.op !== 'next' && msg.op.op !== 'end' && msg.op.op !== 'reveal') broadcast();
      return;
    }
    if (msg.t === 'finish') {
      const s = seats.get(c.owner);
      if (s) s.finished = true;
      ack();
      broadcast();
      return;
    }
    if (msg.t === 'move') {
      if (phase !== 'playing') return ack({ error: { code: 'not_playing', message: phase === 'paused' ? 'The game is paused.' : 'The game isn’t running.' } });
      if (style === 'paced') {
        if (!item || item.revealed || now() > item.ends_at) return ack({ error: { code: 'closed', message: 'Answers have closed.' } });
        const choice = String((msg.event.response as { speaker?: unknown })?.speaker ?? '');
        if (!item.choices[c.owner]) {
          item.choices[c.owner] = { choice, at: now() };
          item.answered = [...item.answered, c.owner];
        }
        ack({ result: { item: item.item } });
        const here = [...seats.values()].filter((s) => s.connected).length;
        if (item.answered.length >= here) item.ends_at = now();
        broadcast();
        return;
      }
      const result = mark(c.owner, msg.event);
      progress(c.owner, result);
      ack({ result });
      broadcast();
    }
  }

  b.on((w) => {
    if (w.to !== 'room') return;
    if (w.k === 'open') {
      const t = readTicket(w.ticket ?? '');
      if (!t || t.room !== o.room) return b.post({ k: 'closed', cid: w.cid, to: 'client' });
      // Two sockets on one seat: the newest wins.
      for (const old of [...conns.values()]) if (t.role === 'student' && old.owner === t.owner) {
        sendTo(old.cid, { t: 'replaced' });
        b.post({ k: 'closed', cid: old.cid, to: 'client' });
        conns.delete(old.cid);
      }
      const c: Conn = { cid: w.cid, owner: t.owner, role: t.role };
      conns.set(w.cid, c);
      if (t.role === 'student') seatFor(t.owner, t.initials ?? '??').connected = true;
      b.post({ k: 'opened', cid: w.cid, to: 'client' });
      if (t.role === 'student') broadcast();
    } else if (w.k === 'close') {
      const c = conns.get(w.cid);
      conns.delete(w.cid);
      const s = c && seats.get(c.owner);
      if (s && ![...conns.values()].some((x) => x.owner === c!.owner)) s.connected = false;
      broadcast();
    } else if (w.k === 'msg') {
      const c = conns.get(w.cid);
      if (c) onClient(c, w.data as ClientMsg);
    }
  });

  /* Simulated classmates */
  function simulate(n = 12): void {
    const free = SIM_INITIALS.filter((i) => ![...seats.values()].some((s) => s.initials === i)).slice(0, n);
    free.forEach((initials, k) =>
      later(250 + k * 450, () => {
        const owner = `sim_${initials}`;
        simSeats.add(owner);
        seatFor(owner, initials).connected = true;
        broadcast();
      })
    );
    if (sim) clearInterval(sim);
    sim = setInterval(simTick, 900);
  }
  function simTick(): void {
    if (phase !== 'playing') return;
    const busy = [...simSeats].map((o2) => seats.get(o2)).filter((s): s is Seat => !!s && !s.finished);
    if (style === 'paced') {
      if (!item || item.revealed || now() > item.ends_at) return;
      const speakers = [...(o.game.cast ?? []).map((c) => c.id), FAKE_SPEAKER];
      const key = o.keys.items[item.item];
      const right = key?.shape === 'quote' ? key.speaker : FAKE_SPEAKER;
      for (const s of busy) {
        if (item.choices[s.owner] || Math.random() > 0.35) continue;
        const choice = Math.random() < 0.62 ? right : speakers[Math.floor(Math.random() * speakers.length)];
        item.choices[s.owner] = { choice, at: now() };
        item.answered = [...item.answered, s.owner];
      }
      broadcast();
      return;
    }
    const s = busy[Math.floor(Math.random() * busy.length)];
    if (!s?.progress) return;
    if (o.game.kind === 'connections') {
      const groups = s.progress.groups ?? [];
      if (Math.random() < 0.62) {
        const next = [1, 2, 3, 4].find((d) => !groups.includes(d));
        if (next) groups.push(next);
        s.progress.groups = groups;
        s.progress.done = groups.length;
        if (next && !firsts.has(`d${next}`)) {
          firsts.add(`d${next}`);
          ticker = [{ initials: '', text: tickerText('', next), at: now() }, ...ticker].slice(0, 8);
        }
      } else s.progress.mistakes = (s.progress.mistakes ?? 0) + 1;
      if (s.progress.done >= 4 || (s.progress.mistakes ?? 0) >= (s.progress.mistakes_max ?? 4)) s.finished = true;
    } else {
      s.progress.done = Math.min(total, s.progress.done + 1);
      const ids = Object.keys(o.keys.items);
      const id = ids[Math.min(ids.length - 1, s.progress.done - 1)];
      if (id && !firsts.has(id)) {
        firsts.add(id);
        ticker = [{ initials: '', text: tickerText(id), at: now() }, ...ticker].slice(0, 8);
      }
      if (s.progress.done >= total) s.finished = true;
    }
    s.score = s.progress.done;
    broadcast();
  }

  return {
    simulate,
    seats: () => [...seats.values()],
    stop() {
      timers.forEach(clearTimeout);
      timers = [];
      if (sim) clearInterval(sim);
      b.close();
    }
  };
}
