import type { EventResult, SoloEvent } from '../../api';
import type { Role } from '../../core/room-protocol';
import { registerRules, type KindControl, type RoomRules, type RulesCtx, type RulesError } from '../../core/room-rules';
import { botResponse, choiceOf, contentItems, optionsOf, shownItem, type ShownItem } from './content';

/**
 * Wager (spec §6.8): everyone starts with 100 points; each question, answer
 * then bet inside one timer; the pot is every point bet on a wrong answer
 * (and the minimum bet of anyone who didn't answer). Right answers get their
 * bet back, a house bonus of half their bet, and a share of the pot in
 * proportion to their bet. Nobody right: the pot rolls over. Anyone under the
 * minimum at the start of a question is topped up to it (rescued, kept out of
 * calibration until they rebuild above half the starting points). The final
 * question doubles the house bonus.
 *
 * Every answer is marked with `ctx.mark` (it folds into evidence); every bet
 * is recorded with `ctx.record` (`move: 'bet'`, extra: bet, held, confidence,
 * rescued) so Results can plot confidence against accuracy.
 *
 * Stages per question: open (answers and bets) → closed (bets shown per
 * option) → revealed (wrong stacks into the pot, the pot splits) → standings
 * (top five) → next question. After the last question's standings the
 * teacher ends the game (podium) or opens the calibration view first.
 */

export type WagerSettings = { start: number; min_bet: number; seconds: number; house_bonus: number; rescue: boolean; final_all_in: boolean };

export function wagerSettings(s: Record<string, unknown> | undefined): WagerSettings {
  const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  return {
    start: Math.round(num(s?.start, 100, 10, 10_000)),
    min_bet: Math.round(num(s?.min_bet, 10, 1, 1000)),
    seconds: Math.round(num(s?.seconds, 30, 10, 120)),
    house_bonus: num(s?.house_bonus, 0.5, 0, 2),
    rescue: s?.rescue !== false,
    final_all_in: s?.final_all_in !== false
  };
}

export type WagerStage = 'idle' | 'open' | 'closed' | 'revealed' | 'standings' | 'calibration';

export type WagerPick = { response: unknown; choice: string | null; bet: number; time_ms?: number };

/** One seat's outcome on one question. `correct` null: no answer (the minimum bet was lost). */
export type Payout = { choice: string | null; bet: number; correct: boolean | null; bonus: number; share: number; change: number; before: number; after: number; rescued: boolean };

export type CalibrationRow = { item: string; bet: number; held: number; correct: boolean; rescued: boolean };

export type WagerState = {
  s: WagerSettings;
  order: string[];
  index: number;
  stage: WagerStage;
  ends_at?: number;
  /** The pot coming into this question (a rolled-over jackpot), and the pot now. */
  carried: number;
  pot: number;
  points: Record<string, number>;
  /** Rescued players stay out of calibration until they rebuild above half the start. */
  calib_off: Record<string, boolean>;
  /** Topped up at the start of this question. */
  rescued_now: Record<string, boolean>;
  picks: Record<string, WagerPick>;
  /** After close: points riding on each option, and how many picked it. */
  riding?: Record<string, number>;
  counts?: Record<string, number>;
  /** After close (applied at reveal): each seat's outcome, the right option ids, the pot paid in. */
  payouts?: Record<string, Payout>;
  right?: string[];
  pot_in?: number;
  winners?: number;
  /** Points before this question's reveal (for the standings' rolling counters). */
  before?: Record<string, number>;
  calibration: Record<string, CalibrationRow[]>;
  /** Every answer, rescued or not: right and answered per seat. */
  tally: Record<string, { right: number; answered: number }>;
  /** Per question, for the end summary and the confident-misconception flags. */
  log: Array<{ item: string; riding: Record<string, number>; right: string[]; total: number; winners: number; answered: number }>;
};

const finalBonus = (k: WagerState) => k.s.house_bonus * 2;
export const isFinal = (k: Pick<WagerState, 'index' | 'order'>) => k.index === k.order.length - 1;
const bonusRate = (k: WagerState) => (isFinal(k) && k.s.final_all_in ? finalBonus(k) : k.s.house_bonus);
const err = (code: string, message: string): RulesError => ({ error: { code, message } });

function shown(ctx: RulesCtx, id: string | undefined): ShownItem | null {
  if (!id) return null;
  return shownItem(contentItems(ctx.game, ctx.keys).find((i) => i.id === id));
}

/** The smallest bet a seat can make with `held` points. */
export const minBetFor = (s: WagerSettings, held: number) => Math.max(0, Math.min(s.min_bet, held));

/** A bet the room accepts: whole points, at least the minimum, at most everything held. */
export function clampBet(s: WagerSettings, held: number, bet: unknown): number {
  const b = typeof bet === 'number' && Number.isFinite(bet) ? Math.round(bet) : s.min_bet;
  return Math.min(held, Math.max(minBetFor(s, held), b));
}

/**
 * Splits a pot in proportion to each winner's bet: whole points, nothing
 * lost to rounding (largest remainders get the odd points, ties to the
 * bigger bet, then the earlier seat).
 */
export function splitPot(pot: number, bets: Array<{ owner: string; bet: number }>): Record<string, number> {
  const total = bets.reduce((n, b) => n + b.bet, 0);
  const out: Record<string, number> = {};
  if (!bets.length || pot <= 0) {
    for (const b of bets) out[b.owner] = 0;
    return out;
  }
  // Every winner bet at least something; a zero total (all bet 0) splits evenly.
  const weight = (b: { bet: number }) => (total > 0 ? b.bet / total : 1 / bets.length);
  const raw = bets.map((b, i) => ({ ...b, i, exact: pot * weight(b) }));
  let given = 0;
  for (const r of raw) {
    out[r.owner] = Math.floor(r.exact);
    given += out[r.owner];
  }
  const rest = raw.sort((a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)) || b.bet - a.bet || a.i - b.i);
  for (let j = 0; j < pot - given; j++) out[rest[j % rest.length].owner] += 1;
  return out;
}

/** Right option ids for a choice or true/false question (none for typed answers). */
function rightOptions(ctx: RulesCtx, id: string): string[] {
  const key = ctx.keys.items[id];
  if (key?.shape !== 'question') return [];
  const a = key.key.answer;
  if (a.type === 'choice') return [...a.ids];
  if (a.type === 'boolean') return [a.value ? 'true' : 'false'];
  return [];
}

function ensure(ctx: RulesCtx, k: WagerState, owner: string): void {
  if (!(owner in k.points) && ctx.seat(owner)) k.points[owner] = k.s.start;
}

function openQuestion(ctx: RulesCtx, k: WagerState, index: number): void {
  k.index = index;
  k.stage = 'open';
  k.carried = k.pot;
  k.picks = {};
  k.rescued_now = {};
  delete k.riding;
  delete k.counts;
  delete k.payouts;
  delete k.right;
  delete k.pot_in;
  delete k.winners;
  for (const seat of ctx.seats()) ensure(ctx, k, seat.owner);
  for (const owner of Object.keys(k.points)) {
    if (k.s.rescue && k.points[owner] < k.s.min_bet) {
      k.points[owner] = k.s.min_bet;
      k.rescued_now[owner] = true;
      k.calib_off[owner] = true;
    } else if (k.calib_off[owner] && k.points[owner] > k.s.start / 2) delete k.calib_off[owner];
    ctx.setScore(owner, k.points[owner]);
  }
  k.ends_at = ctx.now + k.s.seconds * 1000;
  ctx.setTimer(k.ends_at);
}

/** Answers close: mark every answer, record every bet, work out (not yet apply) the payouts. */
function closeAnswers(ctx: RulesCtx, k: WagerState): void {
  if (k.stage !== 'open') return;
  const item = k.order[k.index];
  k.stage = 'closed';
  k.ends_at = undefined;
  ctx.setTimer(undefined);
  const riding: Record<string, number> = {};
  const counts: Record<string, number> = {};
  const payouts: Record<string, Payout> = {};
  const winners: Array<{ owner: string; bet: number }> = [];
  let potIn = 0;
  // Everyone holding points takes part: a seat that answered, or a connected seat that didn't (it loses the minimum).
  const owners = Object.keys(k.points).filter((o) => k.picks[o] || ctx.seat(o)?.connected);
  for (const owner of owners) {
    const held = k.points[owner];
    const pick = k.picks[owner];
    const rescued = !!k.calib_off[owner];
    if (!pick) {
      const bet = minBetFor(k.s, held);
      potIn += bet;
      payouts[owner] = { choice: null, bet, correct: null, bonus: 0, share: 0, change: -bet, before: held, after: held - bet, rescued };
      ctx.record(owner, { item, move: 'bet', extra: { bet, held, confidence: held ? round2(bet / held) : 0, rescued, no_answer: true } });
      continue;
    }
    const marked = ctx.mark(owner, { item, move: 'answer', response: pick.response, ...(pick.time_ms !== undefined ? { time_ms: pick.time_ms } : {}) });
    const correct = 'error' in marked ? false : marked.result.correct === true;
    const bet = clampBet(k.s, held, pick.bet);
    if (pick.choice) {
      riding[pick.choice] = (riding[pick.choice] ?? 0) + bet;
      counts[pick.choice] = (counts[pick.choice] ?? 0) + 1;
    }
    ctx.record(owner, {
      item,
      move: 'bet',
      ...(pick.choice ? { response: { choice: pick.choice } } : {}),
      correct,
      extra: { bet, held, confidence: held ? round2(bet / held) : 0, rescued, ...(isFinal(k) ? { final: true } : {}), ...(bet === held ? { all_in: true } : {}) }
    });
    if (!rescued) (k.calibration[owner] ??= []).push({ item, bet, held, correct, rescued });
    const t = (k.tally[owner] ??= { right: 0, answered: 0 });
    t.answered += 1;
    if (correct) t.right += 1;
    if (correct) winners.push({ owner, bet });
    else potIn += bet;
    payouts[owner] = { choice: pick.choice, bet, correct, bonus: 0, share: 0, change: correct ? 0 : -bet, before: held, after: correct ? held : held - bet, rescued };
  }
  const pot = k.carried + potIn;
  const shares = winners.length ? splitPot(pot, winners) : {};
  for (const w of winners) {
    const p = payouts[w.owner];
    p.bonus = Math.round(w.bet * bonusRate(k));
    p.share = shares[w.owner] ?? 0;
    p.change = p.bonus + p.share;
    p.after = p.before + p.change;
  }
  k.riding = riding;
  k.counts = counts;
  k.payouts = payouts;
  k.right = rightOptions(ctx, item);
  k.pot_in = potIn;
  k.winners = winners.length;
}

function reveal(ctx: RulesCtx, k: WagerState): void {
  if (k.stage === 'open') closeAnswers(ctx, k);
  if (k.stage !== 'closed' || !k.payouts) return;
  k.stage = 'revealed';
  k.before = { ...k.points };
  for (const [owner, p] of Object.entries(k.payouts)) {
    k.points[owner] = p.after;
    ctx.setScore(owner, p.after);
  }
  const pot = k.carried + (k.pot_in ?? 0);
  k.pot = k.winners ? 0 : pot;
  const total = Object.values(k.riding ?? {}).reduce((n, v) => n + v, 0);
  k.log.push({ item: k.order[k.index], riding: { ...(k.riding ?? {}) }, right: [...(k.right ?? [])], total, winners: k.winners ?? 0, answered: Object.keys(k.picks).length });
  if (!k.winners && pot > 0) ctx.ticker(`Nobody right: jackpot ${pot}`);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Moves the game on one step: close → reveal → standings → next question (or, after the last, stays for the teacher to end). */
function step(ctx: RulesCtx, k: WagerState): void {
  if (k.stage === 'idle') openQuestion(ctx, k, 0);
  else if (k.stage === 'open') closeAnswers(ctx, k);
  else if (k.stage === 'closed') reveal(ctx, k);
  else if (k.stage === 'revealed') k.stage = 'standings';
  else if (k.stage === 'standings' || k.stage === 'calibration') {
    if (k.index < k.order.length - 1) openQuestion(ctx, k, k.index + 1);
    else ctx.end();
  }
}

/** Per student: rounds kept for calibration, confidence (mean bet ÷ held) and accuracy. Initials only. */
export function calibrationOf(ctx: RulesCtx, k: WagerState): Array<{ initials: string; confidence: number; accuracy: number; rounds: number; big_wrong: number }> {
  return Object.entries(k.calibration)
    .filter(([, rows]) => rows.length)
    .map(([owner, rows]) => ({
      initials: ctx.seat(owner)?.initials ?? '?',
      confidence: round2(rows.reduce((n, r) => n + (r.held ? r.bet / r.held : 0), 0) / rows.length),
      accuracy: round2(rows.filter((r) => r.correct).length / rows.length),
      rounds: rows.length,
      big_wrong: rows.filter((r) => !r.correct && r.held && r.bet / r.held >= 0.5).length
    }))
    .sort((a, b) => a.initials.localeCompare(b.initials));
}

/** Wrong options that drew at least 30% of the points bet on a question (spec: confident misconceptions). Anonymous. */
export function confidentMisconceptions(ctx: RulesCtx, k: WagerState): Array<{ item: string; index: number; option: string; text: string; share: number }> {
  const out: Array<{ item: string; index: number; option: string; text: string; share: number }> = [];
  k.log.forEach((q, index) => {
    if (!q.total) return;
    const opts = optionsOf(shown(ctx, q.item));
    for (const [option, pts] of Object.entries(q.riding)) {
      if (q.right.includes(option) || pts / q.total < 0.3) continue;
      out.push({ item: q.item, index, option, text: opts.find((o) => o.id === option)?.text ?? option, share: round2(pts / q.total) });
    }
  });
  return out.sort((a, b) => b.share - a.share);
}

export const wagerRules: RoomRules<WagerState> = {
  kind: 'wager',
  init(ctx) {
    const s = wagerSettings(ctx.game.settings);
    const order = contentItems(ctx.game, ctx.keys)
      .filter((i) => i.shape === 'question' && shownItem(i) && ctx.keys.items[i.id])
      .map((i) => i.id);
    const points: Record<string, number> = {};
    for (const seat of ctx.seats()) points[seat.owner] = s.start;
    return { s, order, index: -1, stage: 'idle', carried: 0, pot: 0, points, calib_off: {}, rescued_now: {}, picks: {}, calibration: {}, tally: {}, log: [] };
  },
  start(ctx, k) {
    if (!k.order.length) return ctx.end();
    openQuestion(ctx, k, 0);
  },
  move(ctx, k, owner, event: SoloEvent): EventResult | RulesError {
    const item = k.order[k.index];
    if (k.stage !== 'open' || !item) return err('closed', 'Answers are closed for this question.');
    if (event.item !== item || event.move !== 'answer') return err('bad_item', 'That isn’t the question on the board.');
    if (k.ends_at !== undefined && ctx.now > k.ends_at + 500) return err('closed', 'Time’s up for this question.');
    ensure(ctx, k, owner);
    if (!(owner in k.points)) return err('no_seat', 'Join the game first.');
    const it = shown(ctx, item);
    const choice = choiceOf(event.response);
    if (it && (it.mode === 'choice' || it.mode === 'truefalse') && !(choice && optionsOf(it).some((o) => o.id === choice))) return err('bad_answer', 'Pick one of the answers.');
    const bet = clampBet(k.s, k.points[owner], event.extra?.bet);
    k.picks[owner] = { response: event.response, choice, bet, ...(event.time_ms !== undefined ? { time_ms: Math.max(0, Math.round(event.time_ms)) } : {}) };
    // Locked in: no verdict until the reveal.
    return { item };
  },
  control(ctx, k, op: KindControl, from) {
    if (from.role === 'student') return err('not_allowed', 'Only the teacher can do that.');
    if (op.name === 'next') return void step(ctx, k);
    if (op.name === 'close') return void closeAnswers(ctx, k);
    if (op.name === 'reveal') return void reveal(ctx, k);
    if (op.name === 'standings' && k.stage === 'revealed') return void (k.stage = 'standings');
    if (op.name === 'calibration' && (k.stage === 'standings' || k.stage === 'revealed') && isFinal(k)) return void (k.stage = 'calibration');
    if (op.name === 'add_time' && k.stage === 'open' && k.ends_at !== undefined) {
      const secs = Number((op.data as { seconds?: unknown } | undefined)?.seconds) || 15;
      k.ends_at += Math.min(120, Math.max(5, secs)) * 1000;
      ctx.setTimer(k.ends_at);
      return;
    }
    return err('unknown', 'That control isn’t part of Wager.');
  },
  tick(ctx, k) {
    if (k.stage === 'open' && k.ends_at !== undefined && ctx.now >= k.ends_at) closeAnswers(ctx, k);
  },
  finish(ctx, k) {
    if (k.stage === 'open' || k.stage === 'closed') reveal(ctx, k);
  },
  seatChanged(ctx, k, owner) {
    ensure(ctx, k, owner);
    if (owner in k.points) ctx.setScore(owner, k.points[owner]);
  },
  /** DEV ONLY: a simulated classmate answers once per question (right about 6 in 10) and bets a slice of what it holds. */
  bot(ctx, k, owner) {
    const item = k.order[k.index];
    if (k.stage !== 'open' || !item || owner in k.picks || !(owner in k.points)) return null;
    const it = shown(ctx, item);
    if (!it) return null;
    const held = k.points[owner];
    const bet = isFinal(k) && ctx.random() < 0.3 ? held : Math.max(k.s.min_bet, Math.round((held * (0.1 + ctx.random() * 0.5)) / 10) * 10);
    return { move: { item, move: 'answer', response: botResponse(it, ctx.keys.items[item], 0.6, () => ctx.random()), extra: { bet } } };
  },
  view(ctx, k, role: Role, owner: string) {
    const itemId = k.order[k.index];
    const it = k.stage === 'idle' ? null : shown(ctx, itemId);
    const answered = Object.keys(k.picks).length;
    const after = k.stage === 'revealed' || k.stage === 'standings' || k.stage === 'calibration';
    const base = {
      stage: k.stage,
      index: k.index,
      of: k.order.length,
      final: isFinal(k) && k.s.final_all_in,
      bonus: bonusRate(k),
      min_bet: k.s.min_bet,
      start: k.s.start,
      ...(k.ends_at !== undefined ? { ends_at: k.ends_at } : {}),
      ...(it ? { item: it } : {}),
      carried: k.carried,
      pot: k.pot
    };
    if (role === 'student') {
      const held = k.points[owner] ?? k.s.start;
      const pick = k.picks[owner];
      const p = after ? k.payouts?.[owner] : undefined;
      const rank = after ? 1 + Object.values(k.points).filter((v) => v > held).length : undefined;
      return {
        ...base,
        you: {
          points: held,
          ...(k.rescued_now[owner] ? { rescued: true } : {}),
          ...(pick ? { locked: { choice: pick.choice, bet: pick.bet, ...(pick.choice ? {} : { text: textOf(pick.response) }) } } : {}),
          ...(p ? { result: p, ...(rank ? { rank, of: Object.keys(k.points).length } : {}) } : {}),
          ...(k.stage !== 'open' && !pick && k.payouts?.[owner] ? { missed: k.payouts[owner].bet } : {})
        },
        ...(after ? { right: k.right ?? [] } : {}),
        ...(after && isFinal(k) ? { summary: studentSummary(k, owner) } : {})
      };
    }
    const seats = ctx.seats();
    const locked = seats.filter((s) => k.picks[s.owner]).map((s) => s.initials);
    const board = {
      ...base,
      answered,
      seats: Object.keys(k.points).length,
      locked_initials: k.stage === 'open' ? locked : [],
      ...(k.stage !== 'open' && k.stage !== 'idle' ? { riding: k.riding ?? {}, counts: k.counts ?? {}, pot_in: k.pot_in ?? 0 } : {}),
      ...(after ? { right: k.right ?? [], winners: k.winners ?? 0, standings: standings(ctx, k) } : {}),
      ...(isFinal(k) && after ? { misconceptions: confidentMisconceptions(ctx, k) } : {}),
      ...(k.stage === 'calibration' ? { calibration: calibrationOf(ctx, k) } : {})
    };
    return board;
  }
};

const textOf = (r: unknown) => (r && typeof r === 'object' && typeof (r as { text?: unknown }).text === 'string' ? ((r as { text: string }).text.slice(0, 80)) : '');

/** Top five with their points before and after this question (initials only: the board's leaderboard rule). */
function standings(ctx: RulesCtx, k: WagerState): Array<{ initials: string; before: number; after: number; climbed: boolean }> {
  const before = k.before ?? k.points;
  const rankBy = (m: Record<string, number>) => Object.keys(k.points).sort((a, b) => (m[b] ?? 0) - (m[a] ?? 0) || (ctx.seat(a)?.initials ?? '').localeCompare(ctx.seat(b)?.initials ?? ''));
  const was = rankBy(before);
  return rankBy(k.points)
    .slice(0, 5)
    .map((o, i) => ({ initials: ctx.seat(o)?.initials ?? '?', before: before[o] ?? 0, after: k.points[o], climbed: was.indexOf(o) > i }));
}

/** The final card: questions right and whether confidence matched accuracy. */
function studentSummary(k: WagerState, owner: string): { right: number; of: number; confidence: number | null; accuracy: number | null } {
  const rows = k.calibration[owner] ?? [];
  const t = k.tally[owner] ?? { right: 0, answered: 0 };
  return {
    right: t.right,
    of: k.order.length,
    confidence: rows.length ? round2(rows.reduce((n, r) => n + (r.held ? r.bet / r.held : 0), 0) / rows.length) : null,
    accuracy: rows.length ? round2(rows.filter((r) => r.correct).length / rows.length) : null
  };
}

registerRules(wagerRules);
