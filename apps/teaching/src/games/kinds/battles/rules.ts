import type { EventResult, SoloEvent } from '../../api';
import type { GameKeys } from '../../core/model';
import type { Role } from '../../core/room-protocol';
import { registerRules, type KindControl, type RoomRules, type RulesCtx, type RulesError } from '../../core/room-rules';
// The comparative judgement engine itself (spec §6.7: "there is no second engine").
// Both modules are pure, so esbuild bundles them into the room Worker and Vite
// into the dev preview: the room runs the same pairing, fit and reliability
// signal as the CJ block server.
import { chipStats, choosePair, contestedPair, pairKey, thirdOf } from '../../../../../../netlify/functions/_shared/cj-maths.mjs';
import { computeScale, gamePool, POOL_TEXT_MAX } from '../../../../../../netlify/functions/_shared/cj-scale.mjs';

/**
 * Short-answer battles, live (spec §6.7; approved mockup
 * docs/mockups/games/battles.html).
 *
 * 1. Write: one prompt, on phones, against the timer. The board shows each
 *    seat's word count and a "writing" pulse, never text.
 * 2. Battle rounds: each phone gets two anonymous answers (never its own) and
 *    taps the better one, optionally with chips. Pairs come from CJ's
 *    `choosePair`; the scale from CJ's `computeScale` over a game pool
 *    (`gamePool`, the CJ module's in-game pool source).
 * 3. Spotlight (any time): CJ's most contested close pair as Answer A vs B.
 * 4. Results: the top three answers with the chips that won most; each phone
 *    gets its judging score (agreement with the final scale) and, only when the
 *    scale is reliable (≥ 0.70), the third its own answer landed in.
 *
 * Judging points reward agreeing with the final consensus: per agreed pair
 * round(60 + 40 · max(0, 1 − |Δθ| / 3)), so close calls are worth more, and
 * nobody's points depend on how their own answer did.
 *
 * Classes without a list can't play (CJ D23). Fewer than 6 answers: "Need at
 * least 6 answers to battle", Spotlight only.
 *
 * Answers are anonymous everywhere: pool ids are random, the owner stays in
 * this state and the fold, and no view pairs an answer with initials.
 */

export const BATTLES_ITEM = 'battle';
export const MIN_ANSWERS = 6;
export const ROUNDS = 5;
const RELIABLE = 0.7;
const DRAFT_MAX = POOL_TEXT_MAX;

export type Judgement = { left: string; right: string; winner: string; chips: { left: number[]; right: number[] }; at: number };
type Draft = { text: string; words: number; in: boolean; at: number };

export type BattlesPhase = 'no_list' | 'write' | 'too_few' | 'battle' | 'results';
export type BoardScreen = 'main' | 'spotlight' | 'judges' | 'teacher';

export type BattlesState = {
  phase: BattlesPhase;
  screen: BoardScreen;
  split: boolean;
  /** When the writing closes (server ms). */
  ends: number;
  drafts: Record<string, Draft>;
  /** Pool id → answer (owner stays server-side). */
  pool: Record<string, { text: string; owner: string }>;
  own: Record<string, string>;
  rounds: number;
  judgements: Record<string, Judgement[]>;
  pairs: Record<string, { left: string; right: string } | null>;
  /** Last fitted scale (refreshed at most once a second during battles). */
  scale: { at: number; n: number; order: string[]; theta: Record<string, number>; reliability: number; level: 'keep' | 'feedback' | 'marks' } | null;
  spot: { a: string; b: string; split: number | null } | null;
  final: {
    order: string[];
    theta: Record<string, number>;
    reliability: number;
    reliable: boolean;
    judges: Record<string, { agree: boolean[]; points: number }>;
    chips: Record<string, Array<[string, number]>>;
  } | null;
};

const err = (code: string, message: string): RulesError => ({ error: { code, message } });
const words = (s: string) => (s.trim().match(/\S+/g) ?? []).length;
export const judgingPoints = (gap: number): number => Math.round(60 + 40 * Math.max(0, 1 - Math.abs(gap) / 3));

export function battleContent(keys: GameKeys): { prompt: string; criterion: string; chips: string[] } {
  const b = keys.live?.battle;
  return { prompt: b?.prompt ?? '', criterion: b?.criterion ?? '', chips: b?.chips ?? [] };
}
export function battlesSettings(settings: unknown): { write_minutes: number } {
  const s = (settings ?? {}) as { write_minutes?: unknown };
  const m = typeof s.write_minutes === 'number' && Number.isFinite(s.write_minutes) ? Math.round(Math.min(8, Math.max(2, s.write_minutes))) : 4;
  return { write_minutes: m };
}

const anonId = (ctx: RulesCtx, taken: Record<string, unknown>) => {
  for (;;) {
    const id = `x${Math.floor(ctx.random() * 36 ** 6)
      .toString(36)
      .padStart(6, '0')}`;
    if (!(id in taken)) return id;
  }
};

function judgeMap(k: BattlesState): Map<string, { judgements: Judgement[] }> {
  return new Map(Object.entries(k.judgements).map(([owner, list]) => [owner, { judgements: list }]));
}

function refit(ctx: RulesCtx, k: BattlesState, force = false): void {
  const n = Object.values(k.judgements).reduce((a, l) => a + l.length, 0);
  if (!force && k.scale && (k.scale.n === n || ctx.now - k.scale.at < 1000)) return;
  const s = computeScale({ pool: Object.fromEntries(Object.entries(k.pool).map(([id, a]) => [id, { text: a.text, kind: 'student', ref: a.owner }])) }, { teacher_weight: 1, downweight_misfits: true }, judgeMap(k), ctx.random);
  k.scale = { at: ctx.now, n, order: s.studentOrder, theta: s.fit.theta, reliability: Math.round(s.reliability.value * 100) / 100, level: s.reliability.level };
}

function counts(k: BattlesState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const list of Object.values(k.judgements))
    for (const j of list) {
      out[j.left] = (out[j.left] ?? 0) + 1;
      out[j.right] = (out[j.right] ?? 0) + 1;
    }
  return out;
}

/** The next pair for a judge: CJ's choosePair, never their own answer, never a pair twice. */
function deal(ctx: RulesCtx, k: BattlesState, owner: string): void {
  const done = k.judgements[owner]?.length ?? 0;
  if (done >= k.rounds) {
    k.pairs[owner] = null;
    return;
  }
  const own = k.own[owner];
  const pair = choosePair({
    items: Object.keys(k.pool),
    theta: k.scale?.theta ?? {},
    counts: counts(k),
    seen: new Set((k.judgements[owner] ?? []).map((j) => pairKey(j.left, j.right))),
    exclude: new Set(own ? [own] : []),
    rng: () => ctx.random()
  }) as [string, string] | null;
  k.pairs[owner] = pair ? { left: pair[0], right: pair[1] } : null;
}

function startBattles(ctx: RulesCtx, k: BattlesState): void {
  // Every non-blank draft is an answer once the writing closes, handed in or not.
  const answers: Array<{ id: string; text: string; ref: string }> = [];
  for (const [owner, d] of Object.entries(k.drafts)) {
    if (!d.text.trim() || !ctx.seat(owner)) continue;
    const id = anonId(ctx, k.pool);
    k.pool[id] = { text: '', owner };
    answers.push({ id, text: d.text, ref: owner });
    ctx.record(owner, { item: BATTLES_ITEM, move: 'answer', response: { text: d.text.trim().slice(0, DRAFT_MAX) }, correct: null, extra: { words: d.words, handed_in: d.in } });
  }
  const pool = gamePool(answers);
  k.pool = Object.fromEntries(Object.entries(pool).map(([id, a]) => [id, { text: a.text, owner: a.ref }]));
  k.own = Object.fromEntries(Object.entries(k.pool).map(([id, a]) => [a.owner, id]));
  ctx.setTimer(undefined);
  const n = Object.keys(k.pool).length;
  if (n < MIN_ANSWERS) {
    k.phase = 'too_few';
    k.screen = 'main';
    return;
  }
  k.phase = 'battle';
  k.screen = 'main';
  // Each judge sees answers other than their own: m − 1 answers give (m−1)(m−2)/2 pairs.
  k.rounds = Math.min(ROUNDS, ((n - 1) * (n - 2)) / 2);
  for (const s of ctx.seats()) deal(ctx, k, s.owner);
}

function randomPair(ctx: RulesCtx, k: BattlesState, not?: { a: string; b: string } | null): { a: string; b: string; split: null } | null {
  const ids = Object.keys(k.pool);
  if (ids.length < 2) return null;
  for (let tries = 0; tries < 20; tries++) {
    const a = ids[Math.floor(ctx.random() * ids.length)] as string;
    const rest = ids.filter((x) => x !== a);
    const b = rest[Math.floor(ctx.random() * rest.length)] as string;
    if (!not || pairKey(a, b) !== pairKey(not.a, not.b) || ids.length === 2) return { a, b, split: null };
  }
  return { a: ids[0] as string, b: ids[1] as string, split: null };
}

function spotlight(ctx: RulesCtx, k: BattlesState): void {
  if (k.phase === 'battle' || k.phase === 'results') {
    refit(ctx, k, true);
    const comparisons = Object.values(k.judgements).flatMap((l) => l.map((j) => ({ winner: j.winner, loser: j.winner === j.left ? j.right : j.left })));
    k.spot = (contestedPair(comparisons, k.scale?.theta ?? {}) as BattlesState['spot']) ?? randomPair(ctx, k);
  } else k.spot = randomPair(ctx, k, k.spot);
  k.screen = 'spotlight';
  k.split = false;
}

function results(ctx: RulesCtx, k: BattlesState): void {
  if (k.phase !== 'battle') return;
  refit(ctx, k, true);
  const s = k.scale!;
  const judges: NonNullable<BattlesState['final']>['judges'] = {};
  for (const [owner, list] of Object.entries(k.judgements)) {
    let points = 0;
    const agree = list.map((j) => {
      const loser = j.winner === j.left ? j.right : j.left;
      const gap = (s.theta[j.winner] ?? 0) - (s.theta[loser] ?? 0);
      const ok = gap > 0;
      if (ok) points += judgingPoints(gap);
      return ok;
    });
    judges[owner] = { agree, points };
    if (points) ctx.addScore(owner, points);
    ctx.record(owner, {
      item: BATTLES_ITEM,
      move: 'judge',
      response: { agreed: agree.filter(Boolean).length, judged: agree.length },
      correct: null,
      extra: { summary: true, agreed: agree.filter(Boolean).length, judged: agree.length, accuracy: agree.length ? Math.round((agree.filter(Boolean).length / agree.length) * 100) : 0, points }
    });
  }
  const all = Object.values(k.judgements).flat();
  const { chips } = battleContent(ctx.keys);
  const won: Record<string, Array<[string, number]>> = {};
  for (const id of s.order.slice(0, 3)) {
    const tally = new Map<number, number>();
    for (const j of all) {
      if (j.winner !== id) continue;
      for (const c of j.chips[j.winner === j.left ? 'left' : 'right']) tally.set(c, (tally.get(c) ?? 0) + 1);
    }
    won[id] = [...tally.entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, 2)
      .map(([c, n]) => [chips[c] ?? '', n] as [string, number])
      .filter(([label]) => label);
  }
  k.final = { order: s.order, theta: s.theta, reliability: s.reliability, reliable: s.reliability >= RELIABLE, judges, chips: won };
  k.phase = 'results';
  k.screen = 'main';
  for (const o of Object.keys(k.pairs)) k.pairs[o] = null;
}

/* ── Rules ───────────────────────────────────────────────────────── */

export const battlesRules: RoomRules<BattlesState> = {
  kind: 'battles',
  init() {
    return { phase: 'write', screen: 'main', split: false, ends: 0, drafts: {}, pool: {}, own: {}, rounds: ROUNDS, judgements: {}, pairs: {}, scale: null, spot: null, final: null };
  },
  start(ctx, k) {
    if (!Object.keys(ctx.config.roster ?? {}).length) {
      k.phase = 'no_list';
      return;
    }
    k.phase = 'write';
    k.ends = ctx.now + battlesSettings(ctx.game.settings).write_minutes * 60_000;
    ctx.setTimer(k.ends);
  },
  move(ctx, k, owner, e: SoloEvent): EventResult | RulesError {
    if (k.phase === 'no_list') return err('no_list', 'Battles needs a class list.');
    if (e.move === 'answer') {
      if (k.phase !== 'write') return err('not_now', 'Writing has closed.');
      const r = (e.response ?? {}) as { text?: unknown; hand_in?: unknown };
      if (typeof r.text !== 'string') return err('bad_answer', 'Write your answer first.');
      if (r.text.length > DRAFT_MAX) return err('too_long', `Keep it under ${DRAFT_MAX} characters.`);
      const was = k.drafts[owner];
      const handIn = r.hand_in === true ? true : r.hand_in === false ? false : was?.in ?? false;
      if (handIn && !r.text.trim()) return err('empty', 'Write your answer first.');
      k.drafts[owner] = { text: r.text, words: words(r.text), in: handIn, at: ctx.now };
      if (handIn && !was?.in) ctx.ticker('handed in', ctx.seat(owner)?.initials);
      return { item: BATTLES_ITEM };
    }
    if (e.move === 'judge') {
      if (k.phase !== 'battle') return err('not_now', 'The battles aren’t running.');
      const pair = k.pairs[owner];
      const r = (e.response ?? {}) as { left?: unknown; right?: unknown; winner?: unknown; chips?: { left?: unknown; right?: unknown } };
      if (!pair || r.left !== pair.left || r.right !== pair.right) return err('bad_pair', 'That pair has changed.');
      if (r.winner !== pair.left && r.winner !== pair.right) return err('bad_winner', 'Pick one of the two answers.');
      const n = battleContent(ctx.keys).chips.length;
      const clean = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((i): i is number => Number.isInteger(i) && i >= 0 && i < n))].sort((a, b) => a - b) : []);
      const j: Judgement = { left: pair.left, right: pair.right, winner: r.winner, chips: { left: clean(r.chips?.left), right: clean(r.chips?.right) }, at: ctx.now };
      (k.judgements[owner] ??= []).push(j);
      ctx.record(owner, { item: BATTLES_ITEM, move: 'judge', response: { winner: j.winner === j.left ? 'left' : 'right' }, correct: null, extra: { left: j.left, right: j.right, winner: j.winner, chips: [...j.chips.left.map((c) => `L${c}`), ...j.chips.right.map((c) => `R${c}`)].join(' ') } });
      const done = k.judgements[owner]!.length;
      ctx.setProgress(owner, { done, total: k.rounds });
      if (done >= k.rounds) ctx.ticker('judged every pair', ctx.seat(owner)?.initials);
      refit(ctx, k);
      deal(ctx, k, owner);
      return { item: BATTLES_ITEM };
    }
    return err('bad_move', 'That move isn’t part of Short-answer battles.');
  },
  control(ctx, k, op: KindControl, from) {
    if (from.role !== 'teacher' && from.role !== 'board') return err('not_allowed', 'Only the teacher can do that.');
    switch (op.name) {
      case 'more_time':
        if (k.phase !== 'write') return err('not_now', 'Writing has closed.');
        k.ends = Math.max(ctx.now, k.ends) + 60_000;
        ctx.setTimer(k.ends);
        return;
      case 'battle':
      case 'next':
        if (k.phase === 'write') startBattles(ctx, k);
        else if (k.phase === 'battle' && op.name === 'next') results(ctx, k);
        return;
      case 'spotlight':
      case 'next_pair':
        if (k.phase === 'write' || k.phase === 'no_list') return err('not_now', 'Spotlight opens once the writing closes.');
        spotlight(ctx, k);
        return;
      case 'show_split':
        if (k.screen === 'spotlight') k.split = true;
        return;
      case 'back':
        k.screen = 'main';
        return;
      case 'results':
      case 'reveal':
        results(ctx, k);
        return;
      case 'judges':
      case 'teacher':
        if (k.phase !== 'results') return err('not_now', 'Results first.');
        k.screen = op.name;
        return;
      case 'final':
        ctx.end();
        return;
      default:
        return err('bad_control', 'Unknown control.');
    }
  },
  tick(ctx, k) {
    if (k.phase === 'write') startBattles(ctx, k);
  },
  finish(ctx, k) {
    if (k.phase === 'write') startBattles(ctx, k);
    if (k.phase === 'battle') results(ctx, k);
  },
  seatChanged(ctx, k, owner) {
    if (k.phase === 'battle' && ctx.seat(owner) && k.pairs[owner] === undefined) deal(ctx, k, owner);
  },
  view(ctx, k, role, owner) {
    return role === 'student' ? phoneView(ctx, k, owner) : boardView(ctx, k, role);
  },
  bot(ctx, k, owner) {
    return botMove(ctx, k, owner);
  }
};

/** Invented answers for the dev preview's simulated class (no real student writing). */
const BOT_ANSWERS = [
  'The storm is described as howling at the shutters, so the weather mirrors Mira’s fear and the house seems to attack her.',
  'Short sentences slow the reader down before Mira climbs the stairs, which builds tension and makes every sound feel like a threat.',
  'The house is personified as watching her from every window, so the reader feels she is never safe, even at home.',
  'The candle guttering in the window suggests hope fading, and the dark seems to swallow the only light in the house.',
  'It is scary because it is old and dark and there are noises at night.',
  'Repeating that she counts the stairs shows Mira trying to control a fear she cannot name, which unsettles the reader.',
  'The writer uses lots of adjectives like cold and empty to make the house feel frightening.',
  'Sibilance in the silent, sighing stairs creates a hushed sound that makes the house feel like it is breathing.',
  'The locked wing is never explained, so the reader imagines something worse than any description could give.',
  'The house groans like an old man, which makes it seem alive and angry that Mira is there.',
  'Darkness is everywhere in the chapter and that makes it frightening for the reader.',
  'The frozen lake outside traps the house in silence, so Mira has no escape and the reader feels her isolation.',
  'Rhetorical questions in Mira’s head show her doubt, and the reader starts doubting what is real too.',
  'The narrator calls the stairs a throat, a metaphor that makes climbing them feel like being swallowed.',
  'Doctor Hask’s calm voice is creepy because he speaks about fear like an illness he wants to cut out.',
  'The writer makes it scary with spooky words.'
];

/** Dev preview only: a simulated classmate writes an invented answer a few words at a time, hands in, then judges each pair (longer answers win more often). */
export function botMove(ctx: RulesCtx, k: BattlesState, owner: string): { move: SoloEvent } | null {
  if (k.phase === 'write') {
    const d = k.drafts[owner];
    if (d?.in) return null;
    // Each simulated writer takes the next unused answer, so no two match.
    const taken = new Set(Object.entries(k.drafts).filter(([o]) => o !== owner).map(([, x]) => BOT_ANSWERS.findIndex((a) => x.text && a.startsWith(x.text))));
    const mine = d?.text ? BOT_ANSWERS.findIndex((a) => a.startsWith(d.text)) : -1;
    const full = BOT_ANSWERS[mine >= 0 ? mine : BOT_ANSWERS.findIndex((_, i) => !taken.has(i))] ?? BOT_ANSWERS[0] ?? '';
    const all = full.split(' ');
    const have = d?.words ?? 0;
    if (have >= all.length) return { move: { item: BATTLES_ITEM, move: 'answer', response: { text: full, hand_in: true } } };
    const next = all.slice(0, Math.min(all.length, have + 3 + Math.floor(ctx.random() * 5))).join(' ');
    return { move: { item: BATTLES_ITEM, move: 'answer', response: { text: next } } };
  }
  if (k.phase === 'battle') {
    const p = k.pairs[owner];
    if (!p || !k.pool[p.left] || !k.pool[p.right]) return null;
    const lw = words(k.pool[p.left]!.text);
    const rw = words(k.pool[p.right]!.text);
    const longer = lw >= rw ? p.left : p.right;
    const winner = ctx.random() < 0.75 ? longer : longer === p.left ? p.right : p.left;
    const n = battleContent(ctx.keys).chips.length;
    const chips = n && ctx.random() < 0.6 ? [Math.floor(ctx.random() * n)] : [];
    return { move: { item: BATTLES_ITEM, move: 'judge', response: { left: p.left, right: p.right, winner, chips: { left: winner === p.left ? chips : [], right: winner === p.right ? chips : [] } } } };
  }
  return null;
}

/* ── Views ───────────────────────────────────────────────────────── */

export type BattlesBoardView = {
  who: 'board';
  phase: BattlesPhase;
  screen: BoardScreen;
  prompt: string;
  criterion: string;
  minutes: number;
  /** Write: word counts and pulses per seat (initials only, never text). */
  writers?: Array<{ initials: string; words: number; in: boolean; typing: boolean }>;
  total_words?: number;
  handed_in?: number;
  answers?: number;
  /** Battle: counts and the forming scale (positions only, no ids, no text). */
  round?: number;
  rounds?: number;
  judgements?: number;
  finished?: number;
  judging?: number;
  reliability?: number;
  reliable?: boolean;
  dots?: number[];
  spot?: { a: string; b: string; split: boolean; a_n?: number; b_n?: number; a_chips?: string[]; b_chips?: string[] };
  top?: Array<{ text: string; chips: Array<[string, number]> }>;
  judges?: Array<{ initials: string; points: number; agreed: number; judged: number }>;
  /** Teacher only (never the board): the scale as anonymous answer snippets and the judging spread. */
  teacher?: { scale: Array<{ text: string; theta: number }>; bins: number[]; low: string[]; perfect: string[] };
};

export type BattlesPhoneView = {
  who: 'phone';
  phase: BattlesPhase;
  prompt: string;
  criterion: string;
  minutes: number;
  draft?: { text: string; words: number; in: boolean };
  pair?: { left: { id: string; text: string }; right: { id: string; text: string } } | null;
  done?: number;
  rounds?: number;
  chips: string[];
  spotlight?: boolean;
  result?: { agree: boolean[]; points: number; place: number; of: number; third?: 'top' | 'middle' | 'bottom'; wrote: boolean };
};

const initialsOf = (ctx: RulesCtx, owner: string) => ctx.seat(owner)?.initials ?? '';

function judgeRows(ctx: RulesCtx, k: BattlesState) {
  return Object.entries(k.final?.judges ?? {})
    .filter(([o]) => ctx.seat(o))
    .map(([o, j]) => ({ owner: o, initials: initialsOf(ctx, o), points: j.points, agreed: j.agree.filter(Boolean).length, judged: j.agree.length }))
    .sort((a, b) => b.points - a.points || b.agreed - a.agreed || (a.initials < b.initials ? -1 : 1));
}

function boardView(ctx: RulesCtx, k: BattlesState, role: Role): BattlesBoardView {
  const c = battleContent(ctx.keys);
  const base: BattlesBoardView = { who: 'board', phase: k.phase, screen: k.screen, prompt: c.prompt, criterion: c.criterion, minutes: battlesSettings(ctx.game.settings).write_minutes };
  if (k.phase === 'no_list') return base;
  if (k.phase === 'write') {
    const writers = ctx.seats().map((s) => {
      const d = k.drafts[s.owner];
      return { initials: s.initials, words: d?.words ?? 0, in: !!d?.in, typing: !!d && !d.in && ctx.now - d.at < 3000 };
    });
    return { ...base, writers, total_words: writers.reduce((a, w) => a + w.words, 0), handed_in: writers.filter((w) => w.in).length };
  }
  const out: BattlesBoardView = { ...base, answers: Object.keys(k.pool).length };
  if (k.screen === 'spotlight' && k.spot && k.pool[k.spot.a] && k.pool[k.spot.b]) {
    const all = Object.values(k.judgements).flat().filter((j) => pairKey(j.left, j.right) === pairKey(k.spot!.a, k.spot!.b));
    const sideChips = (id: string) => {
      const tally = new Map<number, number>();
      for (const j of all) if (j.winner === id) for (const ch of j.chips[j.left === id ? 'left' : 'right']) tally.set(ch, (tally.get(ch) ?? 0) + 1);
      return [...tally.entries()].sort((x, y) => y[1] - x[1]).slice(0, 2).map(([i]) => c.chips[i] ?? '').filter(Boolean);
    };
    out.spot = {
      a: k.pool[k.spot.a]!.text,
      b: k.pool[k.spot.b]!.text,
      split: k.split,
      ...(k.split ? { a_n: all.filter((j) => j.winner === k.spot!.a).length, b_n: all.filter((j) => j.winner === k.spot!.b).length, a_chips: sideChips(k.spot.a), b_chips: sideChips(k.spot.b) } : {})
    };
  }
  if (k.phase === 'battle') {
    const seats = ctx.seats();
    const done = seats.map((s) => k.judgements[s.owner]?.length ?? 0);
    const fin = seats.filter((s, i) => (done[i] ?? 0) >= k.rounds || k.pairs[s.owner] === null).length;
    const avg = done.length ? done.reduce((a, b) => a + b, 0) / done.length : 0;
    Object.assign(out, {
      round: Math.min(k.rounds, Math.floor(avg) + 1),
      rounds: k.rounds,
      judgements: Object.values(k.judgements).reduce((a, l) => a + l.length, 0),
      finished: fin,
      judging: seats.length - fin,
      reliability: k.scale?.reliability ?? 0,
      reliable: (k.scale?.reliability ?? 0) >= RELIABLE,
      // Positions only, sorted, so a dot can't be traced to a seat or an answer.
      dots: k.scale ? k.scale.order.map((id) => Math.round((k.scale!.theta[id] ?? 0) * 100) / 100).sort((a, b) => a - b) : []
    });
  }
  if (k.phase === 'results' && k.final) {
    const f = k.final;
    out.reliability = f.reliability;
    out.reliable = f.reliable;
    out.judgements = Object.values(k.judgements).reduce((a, l) => a + l.length, 0);
    out.top = f.order.slice(0, 3).map((id) => ({ text: k.pool[id]?.text ?? '', chips: f.chips[id] ?? [] }));
    if (k.screen === 'judges' || k.screen === 'teacher') out.judges = judgeRows(ctx, k).map(({ owner: _o, ...r }) => r);
    if (role === 'teacher') {
      const rows = judgeRows(ctx, k);
      const bins = Array.from({ length: k.rounds + 1 }, (_, n) => rows.filter((r) => r.agreed === n).length);
      out.teacher = {
        scale: f.order.map((id) => ({ text: (k.pool[id]?.text ?? '').slice(0, 140), theta: Math.round((f.theta[id] ?? 0) * 100) / 100 })),
        bins,
        low: rows.filter((r) => r.judged && r.agreed / r.judged <= 0.4).map((r) => r.initials),
        perfect: rows.filter((r) => r.judged && r.agreed === r.judged).map((r) => r.initials)
      };
    }
  }
  return out;
}

function phoneView(ctx: RulesCtx, k: BattlesState, owner: string): BattlesPhoneView {
  const c = battleContent(ctx.keys);
  const base: BattlesPhoneView = { who: 'phone', phase: k.phase, prompt: c.prompt, criterion: c.criterion, minutes: battlesSettings(ctx.game.settings).write_minutes, chips: c.chips };
  if (k.phase === 'write') {
    const d = k.drafts[owner];
    return { ...base, draft: { text: d?.text ?? '', words: d?.words ?? 0, in: !!d?.in } };
  }
  if (k.phase === 'too_few') return { ...base, spotlight: k.screen === 'spotlight' };
  if (k.phase === 'battle') {
    const p = k.pairs[owner];
    return {
      ...base,
      spotlight: k.screen === 'spotlight',
      done: k.judgements[owner]?.length ?? 0,
      rounds: k.rounds,
      pair: p && k.pool[p.left] && k.pool[p.right] ? { left: { id: p.left, text: k.pool[p.left]!.text }, right: { id: p.right, text: k.pool[p.right]!.text } } : null
    };
  }
  if (k.phase === 'results' && k.final) {
    const rows = judgeRows(ctx, k);
    const mine = k.final.judges[owner];
    const own = k.own[owner];
    const at = own ? k.final.order.indexOf(own) : -1;
    return {
      ...base,
      result: {
        agree: mine?.agree ?? [],
        points: mine?.points ?? 0,
        place: Math.max(1, rows.findIndex((r) => r.owner === owner) + 1),
        of: Math.max(rows.length, 1),
        wrote: !!own,
        ...(k.final.reliable && at >= 0 ? { third: thirdOf(at, k.final.order.length) as 'top' | 'middle' | 'bottom' } : {})
      }
    };
  }
  return base;
}

/** Chip win/loss rates across every judgement (CJ D14), for the teacher's notes. */
export function chipRates(k: BattlesState, labels: string[]) {
  return chipStats(Object.values(k.judgements).flat(), labels);
}

registerRules(battlesRules);
