import type { EventResult, SoloEvent } from '../../api';
import { normaliseAnswer, type GameKeys } from '../../core/model';
import type { Role } from '../../core/room-protocol';
import { registerRules, type KindControl, type RoomRules, type RulesCtx, type RulesError } from '../../core/room-rules';

/**
 * Pictionary, live (spec §6.11; approved mockup docs/mockups/games/pictionary.html).
 *
 * Each round a drawer (rotating through the class, or the teacher from the
 * laptop) gets a prompt on their phone and draws on the phone canvas
 * (kinds/pictionary/canvas.ts). Strokes come to the room as `draw` moves,
 * batched by the phone about ten times a second, and the board redraws them
 * as they arrive; nobody else's view changes with a stroke. Everyone else
 * types guesses on their phone: a right guess turns that phone green and only
 * the guesser's initials reach the board; a near miss (one key word) says
 * "Close!" to the guesser only. Guessers score by speed (200 less 2.4 a
 * second, at least 40); the drawer 20 for everyone who got it. First letters
 * appear after 40 seconds. The teacher can Disqualify a drawing (letters in
 * it): the round is void, its points come back off and nothing is marked.
 *
 * Guesses are marked with `ctx.mark` when the round closes (not void): the
 * right ones with the answer they matched and the seconds it took, everyone
 * else who guessed with their last guess. A wrong first guess doesn't decide
 * the evidence; getting it does. The drawer's round is a `draw` record.
 */

export const PICTIONARY_KIND = 'pictionary' as const;

/** Drawing canvas units: points are integers 0…1000 on a square. */
export const CANVAS = 1000;
export const STROKE_LIMITS = { strokes: 300, points: 9000, perMove: 600, colours: 4, widths: 2 } as const;
export const HINT_AFTER_MS = 40_000;

export type Stroke = { id: number; c: number; w: number; p: number[] };
export type Try = { text: string; close: boolean };
export type Guesser = { ms?: number; points?: number; tries: Try[]; matched?: string };

export type PicRound = {
  n: number;
  item: string;
  /** A seat's owner, or 'teacher'. */
  drawer: string;
  started_at: number;
  seconds: number;
  strokes: Stroke[];
  guessers: Record<string, Guesser>;
  /** Owners in the order they got it. */
  order: string[];
  guesses: number;
  /** Points given this round, so a disqualified round can take them back. */
  gains: Record<string, number>;
  /** When the room's alarm was last set for (the hint at 40 s, then the end), so a pause can be taken off the clock. */
  alarm?: number;
  closed?: 'time' | 'all' | 'ended' | 'void';
};

export type GalleryEntry = { n: number; item: string; answer: string; drawer: string; got: number; of: number; void: boolean; fast?: number };

export type PictionaryState = {
  phase: 'ready' | 'draw' | 'reveal' | 'standings';
  deck: string[];
  round: PicRound | null;
  drawn: string[];
  gallery: GalleryEntry[];
  /** Per round played: who got it, in seconds (teacher's guess-speed view). */
  speed: Array<{ n: number; item: string; drawer: string; void: boolean; times: Record<string, number>; guesses: Record<string, number> }>;
  teacher_next: boolean;
};

export type PictionarySettings = { seconds: number; rounds: number };

export function pictionarySettings(s: Record<string, unknown> | undefined, items: number): PictionarySettings {
  const sec = typeof s?.seconds === 'number' && Number.isFinite(s.seconds) ? Math.round(Math.min(90, Math.max(60, s.seconds))) : 75;
  return { seconds: sec, rounds: items };
}

/* ── Content ─────────────────────────────────────────────────────── */

const STOP = new Set(['the', 'and', 'a', 'an', 'of', 'to', 'in', 'on', 'it', 'is', 'was', 'i', 'my', 'me', 'he', 'she', 'his', 'her', 'they', 'we', 'you', 'that', 'this', 'with', 'for', 'as', 'at', 'by', 'from', 'out', 'up', 'be', 'or', 'but', 'not', 'so', 'all', 'only', 'into']);
/** Lower-case words without accents (normaliseAnswer joins words, so split first). */
const words = (s: string) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .split(/[^\p{L}\p{N}']+/u)
    .map((w) => w.replace(/'/g, ''))
    .filter(Boolean);
const keyWords = (s: string) => words(s).filter((w) => w.length >= 4 && !STOP.has(w));

export type Prompt = {
  id: string;
  shape: 'term' | 'quote';
  /** What the drawer sees. */
  prompt: string;
  /** The answer as revealed. */
  answer: string;
  /** Whole answers that count (term and its spellings; a quote's line and its key-word phrases). */
  answers: string[];
  /** The blanks students see, and the words whose first letters the hint shows. */
  blanks: string;
  /** Quotes: every one of these words in a guess counts as right. */
  key: string[];
};

export function promptsOf(keys: GameKeys): Map<string, Prompt> {
  const out = new Map<string, Prompt>();
  const cards = keys.live?.cards ?? {};
  for (const [id, key] of Object.entries(keys.items)) {
    if (key.shape === 'term') {
      const term = key.label || key.answers[0] || '';
      if (!term) continue;
      out.set(id, { id, shape: 'term', prompt: cards[id]?.draw || term, answer: term, answers: key.answers, blanks: term, key: [] });
    } else if (key.shape === 'quote') {
      const text = key.label || key.answers[0] || '';
      if (!text) continue;
      const phrases = key.answers.slice(1);
      const blanks = phrases[0] || keyWords(text).sort((a, b) => b.length - a.length).slice(0, 2).join(' ');
      out.set(id, { id, shape: 'quote', prompt: text, answer: text, answers: key.answers, blanks, key: keyWords(blanks) });
    }
  }
  return out;
}

function lev(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) (d[0] as number[])[j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const row = d[i] as number[];
      const up = d[i - 1] as number[];
      row[j] = Math.min((up[j] as number) + 1, (row[j - 1] as number) + 1, (up[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  return (d[a.length] as number[])[b.length] as number;
}

/**
 * A guess against a prompt: `right` with the whole answer it matched (spelling
 * slips allowed: one letter in short words, two in long), or `close` when one
 * key word is right.
 */
export function judgeGuess(p: Prompt, raw: string): { right: string | null; close: boolean } {
  const g = normaliseAnswer(raw);
  if (!g) return { right: null, close: false };
  for (const a of p.answers) {
    const n = normaliseAnswer(a);
    if (!n) continue;
    if (n === g) return { right: a, close: false };
    if (p.shape === 'term' && n.length >= 4 && lev(n, g) <= (n.length >= 8 ? 2 : 1)) return { right: a, close: false };
  }
  const gw = new Set(words(raw));
  if (p.shape === 'quote' && p.key.length && p.key.every((k) => gw.has(k) || [...gw].some((w) => w.length >= 5 && lev(w, k) <= 1))) return { right: p.answers[1] ?? p.answers[0] ?? '', close: false };
  const pool = new Set([...p.answers.flatMap(keyWords), ...p.key]);
  const close = [...gw].some((w) => pool.has(w) || (w.length >= 6 && [...pool].some((k) => k.startsWith(w.slice(0, 6)))));
  return { right: null, close };
}

/** Points for getting it after `ms`: 200 less 2.4 a second, rounded to 10, at least 40. */
export const guessPoints = (ms: number): number => Math.max(40, Math.round((200 - (ms / 1000) * 2.4) / 10) * 10);
export const DRAWER_POINTS = 20;

/** Lengths of the blank words, and (after the hint) each word's first letter. */
function blanksOf(p: Prompt, hinted: boolean): { lengths: number[]; first?: string[] } {
  const ws = p.blanks.split(/\s+/).filter(Boolean).map((w) => w.replace(/[^\p{L}\p{N}'’-]/gu, ''));
  return { lengths: ws.map((w) => w.length), ...(hinted ? { first: ws.map((w) => (w[0] ?? '').toUpperCase()) } : {}) };
}

function shuffle<T>(list: readonly T[], random: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

const err = (code: string, message: string): RulesError => ({ error: { code, message } });

/* ── Strokes ─────────────────────────────────────────────────────── */

const pointCount = (r: PicRound) => r.strokes.reduce((a, s) => a + s.p.length / 2, 0);

/**
 * One batch from the drawer: `{ s, c, w, p, from }` appends points to stroke
 * `s` (starting it when `from` is 0); `full: true` replaces its points (the
 * simplified stroke at pointer-up); `undo` takes the last stroke off;
 * `clear` wipes the page. Points are integers 0…1000, x then y.
 */
export function applyStroke(r: PicRound, data: unknown): string | null {
  const d = (data ?? {}) as Record<string, unknown>;
  if (d.clear === true) {
    r.strokes = [];
    return null;
  }
  if (d.undo === true) {
    r.strokes.pop();
    return null;
  }
  const id = Number(d.s);
  const pts = Array.isArray(d.p) ? d.p : [];
  if (!Number.isInteger(id) || id < 0 || id > 1e6) return 'bad_stroke';
  if (pts.length % 2 || pts.length > STROKE_LIMITS.perMove * 2 || pts.some((v) => typeof v !== 'number' || !Number.isFinite(v))) return 'bad_stroke';
  const clean = (pts as number[]).map((v) => Math.round(Math.min(CANVAS, Math.max(0, v))));
  const c = Math.min(STROKE_LIMITS.colours - 1, Math.max(0, Math.round(Number(d.c) || 0)));
  const w = Math.min(STROKE_LIMITS.widths - 1, Math.max(0, Math.round(Number(d.w) || 0)));
  let s = r.strokes.find((x) => x.id === id);
  if (!s) {
    if (r.strokes.length >= STROKE_LIMITS.strokes) return 'too_much';
    s = { id, c, w, p: [] };
    r.strokes.push(s);
  }
  const room = STROKE_LIMITS.points * 2 - (pointCount(r) * 2 - s.p.length);
  if (d.full === true) s.p = clean.slice(0, Math.max(0, room));
  else {
    const from = Number(d.from) || 0;
    // A batch that repeats points already held only adds what's new.
    const fresh = clean.slice(Math.max(0, (s.p.length / 2 - from) * 2));
    s.p = [...s.p, ...fresh].slice(0, Math.max(0, room));
  }
  return null;
}

/* ── Rounds ──────────────────────────────────────────────────────── */

const guesserOwners = (ctx: RulesCtx, r: PicRound) => ctx.seats().map((s) => s.owner).filter((o) => o !== r.drawer);

function nextDrawer(ctx: RulesCtx, k: PictionaryState): string | undefined {
  const seats = ctx.seats();
  const online = seats.filter((s) => s.connected);
  const pool = online.length ? online : seats;
  const fresh = pool.find((s) => !k.drawn.includes(s.owner));
  if (fresh) return fresh.owner;
  // Everyone has drawn: start the rotation again.
  k.drawn = [];
  return pool[0]?.owner;
}

function startRound(ctx: RulesCtx, k: PictionaryState): void | RulesError {
  if (k.phase === 'draw') return err('not_now', 'A round is running.');
  const prompts = promptsOf(ctx.keys);
  const item = k.deck.shift();
  if (!item || !prompts.has(item)) return err('deck_empty', 'Every prompt has been drawn.');
  const drawer = k.teacher_next ? 'teacher' : nextDrawer(ctx, k);
  if (!drawer) return err('no_drawer', 'Nobody is here to draw.');
  k.teacher_next = false;
  if (drawer !== 'teacher') k.drawn.push(drawer);
  const s = pictionarySettings(ctx.game.settings, 0);
  k.round = { n: (k.round?.n ?? 0) + 1, item, drawer, started_at: ctx.now, seconds: s.seconds, strokes: [], guessers: {}, order: [], guesses: 0, gains: {} };
  k.phase = 'draw';
  arm(ctx, k.round);
}

/**
 * The room's one alarm: first at the hint (40 s), so the first letters reach
 * every screen even when nobody is moving, then at the round's end. The ring
 * and bars run off `started_at + seconds`, never the alarm.
 */
function arm(ctx: RulesCtx, r: PicRound): void {
  const end = r.started_at + r.seconds * 1000;
  const hint = r.started_at + HINT_AFTER_MS;
  r.alarm = ctx.now < hint && hint < end ? hint : end;
  ctx.setTimer(r.alarm);
}

function gain(ctx: RulesCtx, r: PicRound, owner: string, points: number) {
  if (owner === 'teacher' || !ctx.seat(owner)) return;
  ctx.addScore(owner, points);
  r.gains[owner] = (r.gains[owner] ?? 0) + points;
}

function closeRound(ctx: RulesCtx, k: PictionaryState, why: NonNullable<PicRound['closed']>): void {
  const r = k.round;
  if (!r || k.phase !== 'draw') return;
  r.closed = why;
  k.phase = 'reveal';
  ctx.setTimer(undefined);
  const p = promptsOf(ctx.keys).get(r.item);
  const of = guesserOwners(ctx, r).length;
  if (why === 'void') {
    for (const [owner, pts] of Object.entries(r.gains)) ctx.addScore(owner, -pts);
    r.gains = {};
  } else {
    // Marked now: the right guesses with the answer they matched, everyone else who guessed with their last try.
    for (const [owner, g] of Object.entries(r.guessers)) {
      if (!ctx.seat(owner)) continue;
      const n = g.tries.length + (g.ms !== undefined ? 1 : 0);
      if (g.ms !== undefined) ctx.mark(owner, { item: r.item, move: 'guess', response: { text: g.matched ?? p?.answer ?? '' }, time_ms: g.ms, extra: { guesses: n } }, 'live_solo');
      else if (g.tries.length) ctx.mark(owner, { item: r.item, move: 'guess', response: { text: g.tries[g.tries.length - 1]?.text ?? '' }, extra: { guesses: n, close: g.tries.some((t) => t.close) } }, 'live_solo');
    }
  }
  if (r.drawer !== 'teacher' && ctx.seat(r.drawer)) ctx.record(r.drawer, { item: r.item, move: 'draw', extra: { got: r.order.length, of, void: why === 'void', strokes: r.strokes.length } });
  const first = r.order[0];
  k.gallery.push({
    n: r.n,
    item: r.item,
    answer: p?.answer ?? '',
    drawer: r.drawer === 'teacher' ? 'Teacher' : ctx.seat(r.drawer)?.initials ?? '',
    got: r.order.length,
    of,
    void: why === 'void',
    ...(first && r.guessers[first]?.ms !== undefined ? { fast: Math.round((r.guessers[first]?.ms ?? 0) / 1000) } : {})
  });
  k.speed.push({
    n: r.n,
    item: r.item,
    drawer: r.drawer === 'teacher' ? 'Teacher' : ctx.seat(r.drawer)?.initials ?? '',
    void: why === 'void',
    times: Object.fromEntries(r.order.map((o) => [ctx.seat(o)?.initials ?? o, Math.round((r.guessers[o]?.ms ?? 0) / 1000)])),
    guesses: Object.fromEntries(Object.entries(r.guessers).map(([o, g]) => [ctx.seat(o)?.initials ?? o, g.tries.length + (g.ms !== undefined ? 1 : 0)]))
  });
}

/* ── Rules ───────────────────────────────────────────────────────── */

export const pictionaryRules: RoomRules<PictionaryState> = {
  kind: PICTIONARY_KIND,
  // Strokes arrive about ten times a second while someone draws, plus a stroke end each lift of the finger.
  burst: 200,
  init() {
    return { phase: 'ready', deck: [], round: null, drawn: [], gallery: [], speed: [], teacher_next: false };
  },
  start(ctx, k) {
    k.deck = shuffle([...promptsOf(ctx.keys).keys()], ctx.random);
    k.phase = 'ready';
  },
  move(ctx, k, owner, e: SoloEvent): EventResult | RulesError {
    const r = k.round;
    if (e.move === 'draw') {
      if (k.phase !== 'draw' || !r) return err('not_now', 'The round is over.');
      if (r.drawer !== owner) return err('not_drawer', 'Only the drawer can draw.');
      if (e.item !== r.item) return err('stale', 'That round has finished.');
      const bad = applyStroke(r, e.response);
      return bad ? err(bad, bad === 'too_much' ? 'That drawing is full.' : 'That stroke didn’t go through.') : { item: e.item };
    }
    if (e.move === 'guess' || e.move === 'answer') {
      if (k.phase !== 'draw' || !r) return err('not_now', 'Wait for the next drawing.');
      if (r.drawer === owner) return err('not_guesser', 'You’re drawing this one.');
      if (e.item !== r.item) return err('stale', 'That drawing has finished.');
      const g = (r.guessers[owner] ??= { tries: [] });
      if (g.ms !== undefined) return { item: e.item, correct: true };
      const raw = typeof (e.response as { text?: unknown } | undefined)?.text === 'string' ? (e.response as { text: string }).text.slice(0, 120) : '';
      if (!raw.trim()) return err('empty', 'Type a guess.');
      if (g.tries.length >= 60) return err('slow_down', 'That’s a lot of guesses. Watch the drawing.');
      const p = promptsOf(ctx.keys).get(r.item);
      if (!p) return err('bad_item', 'That isn’t in this game.');
      r.guesses += 1;
      const verdict = judgeGuess(p, raw);
      if (!verdict.right) {
        g.tries.push({ text: raw.trim().slice(0, 40), close: verdict.close });
        return { item: e.item, correct: false };
      }
      g.ms = Math.max(0, ctx.now - r.started_at);
      g.matched = verdict.right;
      g.points = guessPoints(g.ms);
      r.order.push(owner);
      gain(ctx, r, owner, g.points);
      gain(ctx, r, r.drawer, DRAWER_POINTS);
      ctx.ticker('got it', ctx.seat(owner)?.initials);
      if (r.order.length >= guesserOwners(ctx, r).length) closeRound(ctx, k, 'all');
      return { item: e.item, correct: true };
    }
    return err('bad_move', 'That move isn’t part of Pictionary.');
  },
  control(ctx, k, op: KindControl, from) {
    const staff = from.role === 'teacher' || from.role === 'board';
    // The teacher draws from the laptop (no phone): strokes come as controls.
    if (op.name === 'stroke') {
      if (!staff || k.round?.drawer !== 'teacher' || k.phase !== 'draw') return err('not_drawer', 'Only the drawer can draw.');
      const bad = applyStroke(k.round, op.data);
      return bad ? err(bad, 'That stroke didn’t go through.') : undefined;
    }
    if (!staff) return err('not_allowed', 'Only your teacher can do that.');
    switch (op.name) {
      case 'next':
      case 'next_round':
        return startRound(ctx, k);
      case 'teacher_draws':
        if (k.phase === 'draw') return err('not_now', 'A round is running.');
        k.teacher_next = true;
        return startRound(ctx, k);
      case 'end_round':
      case 'reveal':
        if (k.phase !== 'draw') return err('not_now', 'No round is running.');
        closeRound(ctx, k, 'time');
        return;
      case 'disqualify':
        if (k.phase !== 'draw') return err('not_now', 'No round is running.');
        closeRound(ctx, k, 'void');
        return;
      case 'more_time':
        if (k.phase !== 'draw' || !k.round) return err('not_now', 'No round is running.');
        k.round.seconds += 15;
        arm(ctx, k.round);
        return;
      case 'standings':
        if (k.phase !== 'reveal') return err('not_now', 'Finish the round first.');
        k.phase = 'standings';
        return;
      case 'final':
        ctx.end();
        return;
      default:
        return err('bad_control', 'Unknown control.');
    }
  },
  tick(ctx, k) {
    const r = k.round;
    if (k.phase !== 'draw' || !r) return;
    // A pause moves the room's alarm on: take the paused time off this round's clock (and everyone's speed).
    if (r.alarm !== undefined && ctx.now - r.alarm > 1000) r.started_at += ctx.now - r.alarm;
    if (ctx.now < r.started_at + r.seconds * 1000 - 250) arm(ctx, r);
    else closeRound(ctx, k, 'time');
  },
  finish(ctx, k) {
    if (k.phase === 'draw') closeRound(ctx, k, 'ended');
  },
  seatChanged(ctx, k, owner) {
    // The last guesser who hadn't got it left: close the round if everyone left has.
    const r = k.round;
    if (k.phase === 'draw' && r && r.order.length && r.order.length >= guesserOwners(ctx, r).length) closeRound(ctx, k, 'all');
    void owner;
  },
  view(ctx, k, role, owner) {
    return pictionaryView(ctx, k, role, owner);
  },
  bot(ctx, k, owner) {
    return botMove(ctx, k, owner);
  }
};

/** Dev preview only: a simulated classmate. The drawer scribbles a few strokes; guessers miss, get close, and get it more often as time passes. */
export function botMove(ctx: RulesCtx, k: PictionaryState, owner: string): { move: SoloEvent } | null {
  const r = k.round;
  if (k.phase !== 'draw' || !r) return null;
  const p = promptsOf(ctx.keys).get(r.item);
  if (!p) return null;
  if (r.drawer === owner) {
    if (r.strokes.length >= 14) return null;
    const pts: number[] = [];
    let x = 150 + ctx.random() * 700;
    let y = 150 + ctx.random() * 700;
    let dir = ctx.random() * Math.PI * 2;
    for (let i = 0; i < 14; i++) {
      pts.push(Math.round(x), Math.round(y));
      dir += (ctx.random() - 0.5) * 0.9;
      x = Math.min(960, Math.max(40, x + Math.cos(dir) * 45));
      y = Math.min(960, Math.max(40, y + Math.sin(dir) * 45));
    }
    const id = (r.strokes.at(-1)?.id ?? 0) + 1;
    return { move: { item: r.item, move: 'draw', response: { s: id, c: Math.floor(ctx.random() * STROKE_LIMITS.colours), w: ctx.random() < 0.7 ? 0 : 1, p: pts, full: true } } };
  }
  if (r.guessers[owner]?.ms !== undefined || ctx.random() < 0.45) return null;
  const elapsed = ctx.now - r.started_at;
  const roll = ctx.random();
  const right = Math.min(0.75, 0.1 + elapsed / 50_000);
  const answer = p.shape === 'quote' ? p.blanks : p.answers[0] ?? p.answer;
  const near = keyWords(p.answer)[0] ?? keyWords(p.blanks)[0];
  const misses = ['metaphor', 'a storm', 'symbolism', 'the house', 'imagery', 'contrast', 'tone'];
  const text = roll < right ? answer : roll < right + 0.2 && near ? `${near} thing` : misses[Math.floor(ctx.random() * misses.length)] ?? 'imagery';
  return { move: { item: r.item, move: 'guess', response: { text } } };
}

/* ── Views ───────────────────────────────────────────────────────── */

export type PictionaryBoardView = {
  who: 'board';
  phase: PictionaryState['phase'];
  n: number;
  of: number;
  drawer?: string;
  shape?: 'term' | 'quote';
  blanks?: { lengths: number[]; first?: string[] };
  /** The drawing so far (board and teacher only). */
  strokes?: Array<{ c: number; w: number; p: number[] }>;
  /** Initials and seconds of everyone who's got it, in order. Never a guess. */
  got: Array<{ initials: string; s: number }>;
  guessers: number;
  guesses: number;
  seconds?: number;
  started_at?: number;
  closed?: PicRound['closed'];
  /** After the round only. */
  answer?: string;
  drawer_points?: number;
  /** Teacher draws from the laptop: the prompt, only then, for the teacher's screen (the board hides it behind a hold-to-peek button). */
  prompt?: string;
  teacher_drawing?: boolean;
  gallery: GalleryEntry[];
  deck_left: number;
  /** Teacher's view only: guess speed per student per prompt. */
  speed?: PictionaryState['speed'];
};

export type PictionaryPhoneView = {
  who: 'phone';
  phase: PictionaryState['phase'];
  n: number;
  of: number;
  drawer?: string;
  role: 'drawer' | 'guesser' | 'waiting';
  item?: string;
  shape?: 'term' | 'quote';
  blanks?: { lengths: number[]; first?: string[] };
  /** The drawer only, while drawing. */
  prompt?: string;
  got_count: number;
  guessers: number;
  started_at?: number;
  seconds?: number;
  /** This phone's own guesses (never anyone else's). */
  mine?: { got: boolean; s?: number; points?: number; tries: Try[] };
  closed?: PicRound['closed'];
  answer?: string;
  /** Drawer, after the round: points for the drawing. */
  drew?: { got: number; points: number; first?: { initials: string; s: number } };
  score: number;
};

export function pictionaryView(ctx: RulesCtx, k: PictionaryState, role: Role, owner: string): PictionaryBoardView | PictionaryPhoneView {
  const r = k.round;
  const p = r ? promptsOf(ctx.keys).get(r.item) : undefined;
  const open = k.phase === 'draw';
  const hinted = !!r && open && ctx.now - r.started_at >= HINT_AFTER_MS;
  const revealed = !!r && !open && r.closed !== undefined;
  const total = promptsOf(ctx.keys).size;
  const drawerIni = r ? (r.drawer === 'teacher' ? 'Teacher' : ctx.seat(r.drawer)?.initials ?? '') : undefined;
  const blanks = p ? (revealed ? { lengths: blanksOf(p, false).lengths } : blanksOf(p, hinted)) : undefined;
  const got = r ? r.order.map((o) => ({ initials: ctx.seat(o)?.initials ?? '', s: Math.round((r.guessers[o]?.ms ?? 0) / 1000) })) : [];
  if (role !== 'student') {
    const v: PictionaryBoardView = {
      who: 'board',
      phase: k.phase,
      n: r?.n ?? 0,
      of: total,
      ...(drawerIni ? { drawer: drawerIni } : {}),
      ...(p ? { shape: p.shape } : {}),
      ...(blanks ? { blanks } : {}),
      ...(r ? { strokes: r.strokes.map((s) => ({ c: s.c, w: s.w, p: s.p })) } : {}),
      got,
      guessers: r ? guesserOwners(ctx, r).length : ctx.seats().length,
      guesses: r?.guesses ?? 0,
      ...(r ? { seconds: r.seconds, started_at: r.started_at } : {}),
      ...(r?.closed ? { closed: r.closed } : {}),
      ...(revealed && p ? { answer: p.answer, drawer_points: r?.closed === 'void' ? 0 : (r?.order.length ?? 0) * DRAWER_POINTS } : {}),
      // The laptop runs the board (board ticket), so it needs the prompt to draw; it stays hidden until held.
      ...(r?.drawer === 'teacher' && open ? { teacher_drawing: true, ...(p ? { prompt: p.prompt } : {}) } : {}),
      gallery: k.gallery.map((g) => ({ ...g })),
      deck_left: k.deck.length,
      ...(role === 'teacher' ? { speed: k.speed.map((x) => ({ ...x, times: { ...x.times }, guesses: { ...x.guesses } })) } : {})
    };
    return v;
  }
  const isDrawer = !!r && r.drawer === owner;
  const g = r?.guessers[owner];
  const v: PictionaryPhoneView = {
    who: 'phone',
    phase: k.phase,
    n: r?.n ?? 0,
    of: total,
    ...(drawerIni ? { drawer: drawerIni } : {}),
    role: !r ? 'waiting' : isDrawer ? 'drawer' : 'guesser',
    ...(r ? { item: r.item, started_at: r.started_at, seconds: r.seconds } : {}),
    ...(p ? { shape: p.shape } : {}),
    ...(blanks && !isDrawer ? { blanks } : {}),
    ...(isDrawer && open && p ? { prompt: p.prompt } : {}),
    got_count: r?.order.length ?? 0,
    guessers: r ? guesserOwners(ctx, r).length : 0,
    // Copies, never the state's own arrays: the room diffs each view against the last one it sent.
    ...(r && !isDrawer ? { mine: { got: g?.ms !== undefined, ...(g?.ms !== undefined ? { s: Math.round(g.ms / 1000), points: g.points } : {}), tries: (g?.tries ?? []).map((t) => ({ ...t })) } } : {}),
    ...(r?.closed ? { closed: r.closed } : {}),
    ...(revealed && p ? { answer: p.answer } : {}),
    // Someone who got it may see the answer at once (their phone is green and hidden from others).
    ...(open && p && g?.ms !== undefined ? { answer: p.answer } : {}),
    ...(isDrawer && revealed && r
      ? { drew: { got: r.closed === 'void' ? 0 : r.order.length, points: r.closed === 'void' ? 0 : r.order.length * DRAWER_POINTS, ...(got[0] ? { first: got[0] } : {}) } }
      : {}),
    score: ctx.seat(owner)?.score ?? 0
  };
  return v;
}

registerRules(pictionaryRules);
