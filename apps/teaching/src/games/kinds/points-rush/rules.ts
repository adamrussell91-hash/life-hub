import type { EventResult, SoloEvent } from '../../api';
import type { Role } from '../../core/room-protocol';
import { registerRules, type KindControl, type RoomRules, type RulesCtx, type RulesError } from '../../core/room-rules';
import { contentItems, shownItem } from '../wager/content';
import { applyAnswer, autoGoal, buy, MILESTONES, newRunner, nextItem, runnerSummary, shopRows, UPGRADES, type Runner, type Upgrade } from './engine';

/**
 * Points rush, live (spec §6.6): every seat gets its own question stream for
 * a fixed time (5–15 min). Right: points × multiplier; wrong: no loss and the
 * item comes back 3–6 questions later until it's right. A 2-tap shop sells
 * Multiplier, Streak bonus and Insurance only. The board shows one class bar
 * toward the teacher's goal (milestones at 25/50/75/100%) and the top five.
 *
 * Every answer is marked with `ctx.mark` (first try, every come-back, time);
 * the per-item first try / tries until right / time folds from those events.
 * A shop purchase is a phone action (`control` 'buy' from the student), never
 * a game answer, so it isn't stored as evidence.
 */

export type RushState = {
  items: string[];
  minutes: number;
  goal: number;
  /** The teacher set the goal (setting or board control); otherwise it follows the class size. */
  goal_set: boolean;
  started_at?: number;
  ends_at?: number;
  over: boolean;
  runners: Record<string, Runner>;
  /** Class picture: answers in the last minute (times), first-try and come-back counts, upgrades bought. */
  recent: number[];
  first: { n: number; right: number };
  back: { n: number; right: number };
  upgrades: number;
  milestones: number[];
  /** What the board shows: the rush, the teacher's first-try-vs-come-back view, or its no-names class version. */
  board: 'race' | 'insight' | 'anon';
};

const err = (code: string, message: string): RulesError => ({ error: { code, message } });
const classEarned = (k: RushState) => Object.values(k.runners).reduce((n, r) => n + r.earned, 0);

function runner(ctx: RulesCtx, k: RushState, owner: string): Runner | null {
  if (!k.runners[owner]) {
    if (!ctx.seat(owner)) return null;
    k.runners[owner] = newRunner(k.items, () => ctx.random());
    if (k.started_at !== undefined && !k.over) nextItem(k.runners[owner], k.items, () => ctx.random(), ctx.now);
  }
  return k.runners[owner];
}

function syncGoal(ctx: RulesCtx, k: RushState): void {
  if (!k.goal_set) k.goal = autoGoal(ctx.seats().length, k.minutes);
}

function finishRush(ctx: RulesCtx, k: RushState): void {
  if (k.over) return;
  k.over = true;
  k.ends_at = undefined;
  ctx.setTimer(undefined);
}

export const pointsRushRules: RoomRules<RushState> = {
  kind: 'points_rush',
  burst: 90,
  init(ctx) {
    const items = contentItems(ctx.game, ctx.keys)
      .filter((i) => shownItem(i) && ctx.keys.items[i.id])
      .map((i) => i.id);
    const minutes = Math.min(15, Math.max(5, Number(ctx.game.settings?.minutes) || 8));
    const set = Number(ctx.game.settings?.class_goal) || 0;
    const k: RushState = { items, minutes, goal: set || autoGoal(ctx.seats().length, minutes), goal_set: set > 0, over: false, runners: {}, recent: [], first: { n: 0, right: 0 }, back: { n: 0, right: 0 }, upgrades: 0, milestones: [], board: 'race' };
    return k;
  },
  start(ctx, k) {
    if (!k.items.length) return ctx.end();
    syncGoal(ctx, k);
    k.started_at = ctx.now;
    k.ends_at = ctx.now + k.minutes * 60_000;
    ctx.setTimer(k.ends_at);
    for (const seat of ctx.seats()) {
      const r = runner(ctx, k, seat.owner);
      if (r && !r.cur) nextItem(r, k.items, () => ctx.random(), ctx.now);
    }
  },
  move(ctx, k, owner, event: SoloEvent): EventResult | RulesError {
    if (k.over || k.started_at === undefined) return err('closed', 'Time’s up.');
    if (k.ends_at !== undefined && ctx.now >= k.ends_at) {
      finishRush(ctx, k);
      ctx.end();
      return err('closed', 'Time’s up.');
    }
    const r = runner(ctx, k, owner);
    if (!r) return err('no_seat', 'Join the game first.');
    if (!r.cur) nextItem(r, k.items, () => ctx.random(), ctx.now);
    if (event.move !== 'answer' || !r.cur || event.item !== r.cur.item) return err('stale', 'That question has moved on.');
    const back = r.cur.back;
    const marked = ctx.mark(owner, { item: event.item, move: 'answer', response: event.response, time_ms: Math.max(0, ctx.now - r.cur.shown_at), extra: { back, n: r.cur.n } });
    if ('error' in marked) return marked;
    const correct = marked.result.correct === true;
    const v = applyAnswer(r, correct, () => ctx.random(), ctx.now);
    if (back) {
      k.back.n += 1;
      if (correct) k.back.right += 1;
    } else if (r.rec[event.item]?.tries === 1) {
      k.first.n += 1;
      if (correct) k.first.right += 1;
    }
    k.recent.push(ctx.now);
    while (k.recent.length && k.recent[0] < ctx.now - 60_000) k.recent.shift();
    if (k.recent.length > 3000) k.recent.splice(0, k.recent.length - 3000);
    ctx.setScore(owner, r.points);
    const pct = (classEarned(k) / Math.max(1, k.goal)) * 100;
    for (const m of MILESTONES) {
      if (pct >= m && !k.milestones.includes(m)) {
        k.milestones.push(m);
        ctx.ticker(m === 100 ? 'Class goal reached' : `Class goal ${m}%`);
      }
    }
    nextItem(r, k.items, () => ctx.random(), ctx.now);
    // Right or wrong only: the answer itself never comes back (it will be asked again).
    return { item: event.item, correct: v?.correct ?? correct };
  },
  control(ctx, k, op: KindControl, from) {
    if (op.name === 'buy') {
      if (from.role !== 'student') return err('not_allowed', 'Only players can buy upgrades.');
      if (k.over) return err('closed', 'Time’s up.');
      const r = runner(ctx, k, from.owner);
      const key = (op.data as { up?: unknown } | undefined)?.up;
      if (!r || typeof key !== 'string' || !(UPGRADES as readonly string[]).includes(key)) return err('bad_upgrade', 'That isn’t an upgrade.');
      if (!buy(r, key as Upgrade)) return err('cant_buy', 'Not enough points for that yet.');
      k.upgrades += 1;
      ctx.setScore(from.owner, r.points);
      return;
    }
    if (from.role === 'student') return err('not_allowed', 'Only the teacher can do that.');
    if (op.name === 'goal') {
      const goal = Math.round(Number((op.data as { goal?: unknown } | undefined)?.goal));
      if (!Number.isFinite(goal) || goal < 100 || goal > 1_000_000) return err('bad_goal', 'Pick a goal between 100 and 1,000,000.');
      k.goal = goal;
      k.goal_set = true;
      k.milestones = MILESTONES.filter((m) => (classEarned(k) / goal) * 100 >= m);
      return;
    }
    if (op.name === 'show') {
      const v = (op.data as { view?: unknown } | undefined)?.view;
      if (v !== 'race' && v !== 'insight' && v !== 'anon') return err('bad_view', 'That view isn’t part of Points rush.');
      k.board = v;
      return;
    }
    if (op.name === 'add_time' && k.ends_at !== undefined && !k.over) {
      const secs = Number((op.data as { seconds?: unknown } | undefined)?.seconds) || 60;
      k.ends_at += Math.min(300, Math.max(15, secs)) * 1000;
      ctx.setTimer(k.ends_at);
      return;
    }
    if (op.name === 'next' || op.name === 'end_now') {
      finishRush(ctx, k);
      ctx.end();
      return;
    }
    return err('unknown', 'That control isn’t part of Points rush.');
  },
  tick(ctx, k) {
    if (!k.over && k.ends_at !== undefined && ctx.now >= k.ends_at) {
      finishRush(ctx, k);
      ctx.end();
    }
  },
  finish(ctx, k) {
    finishRush(ctx, k);
  },
  seatChanged(ctx, k, owner) {
    syncGoal(ctx, k);
    const r = runner(ctx, k, owner);
    if (r) ctx.setScore(owner, r.points);
  },
  view(ctx, k, role: Role, owner: string) {
    const earned = classEarned(k);
    const base = {
      minutes: k.minutes,
      goal: k.goal,
      class_earned: earned,
      milestones: [...k.milestones],
      over: k.over,
      ...(k.started_at !== undefined ? { started_at: k.started_at } : {}),
      ...(k.ends_at !== undefined ? { ends_at: k.ends_at } : {})
    };
    if (role === 'student') {
      const r = k.runners[owner];
      if (!r) return { ...base, you: null };
      const cur = r.cur && !k.over ? { item: r.cur.item, back: r.cur.back, n: r.cur.n, q: shownItem(contentItems(ctx.game, ctx.keys).find((i) => i.id === r.cur?.item)) } : null;
      const rank = 1 + Object.values(k.runners).filter((x) => x.points > r.points).length;
      return {
        ...base,
        you: {
          points: r.points,
          earned: r.earned,
          streak: r.streak,
          best: r.best,
          mult: r.up.mult + 1,
          up: { ...r.up },
          answered: r.answered,
          shop: shopRows(r),
          cur,
          ...(r.last ? { last: r.last } : {}),
          ...(k.over ? { summary: runnerSummary(r), rank, of: Object.keys(k.runners).length } : {})
        }
      };
    }
    return {
      ...base,
      board: k.board,
      stats: {
        per_minute: k.recent.filter((t) => t >= ctx.now - 60_000).length,
        first_pct: k.first.n ? Math.round((k.first.right / k.first.n) * 100) : null,
        back_pct: k.back.n ? Math.round((k.back.right / k.back.n) * 100) : null,
        upgrades: k.upgrades
      },
      top: Object.entries(k.runners)
        .map(([o, r]) => ({ initials: ctx.seat(o)?.initials ?? '?', points: r.points }))
        .sort((a, b) => b.points - a.points || a.initials.localeCompare(b.initials))
        .slice(0, 5),
      insight: insightOf(ctx, k)
    };
  }
};

/**
 * First try vs come-back (spec §4.5): per item, right first time and right
 * when it came back; per student (initials), the same and what's still to
 * fix. Teacher and board only.
 */
export function insightOf(ctx: RulesCtx, k: RushState): {
  items: Array<{ item: string; label: string; first_pct: number | null; back_pct: number | null; first_n: number; back_n: number }>;
  students: Array<{ initials: string; first_pct: number | null; fixed_pct: number | null; still: number }>;
} {
  const per = new Map<string, { fn: number; fr: number; bn: number; br: number }>();
  for (const r of Object.values(k.runners)) {
    for (const [id, rec] of Object.entries(r.rec)) {
      const p = per.get(id) ?? { fn: 0, fr: 0, bn: 0, br: 0 };
      if (rec.first !== null) {
        p.fn += 1;
        if (rec.first) p.fr += 1;
        else {
          // A missed item that came back at least once: did it get fixed?
          if (rec.tries > 1 || rec.fixed) {
            p.bn += 1;
            if (rec.fixed) p.br += 1;
          }
        }
      }
      per.set(id, p);
    }
  }
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);
  // The prompt or clue, never the term: the board may be projected while the rush runs.
  const content = contentItems(ctx.game, ctx.keys);
  const label = (id: string) => (shownItem(content.find((i) => i.id === id))?.prompt ?? id).slice(0, 90);
  const items = [...per.entries()]
    .map(([item, p]) => ({ item, label: label(item), first_pct: pct(p.fr, p.fn), back_pct: pct(p.br, p.bn), first_n: p.fn, back_n: p.bn }))
    .sort((a, b) => (a.first_pct ?? 101) - (b.first_pct ?? 101));
  const students = Object.entries(k.runners)
    .map(([o, r]) => {
      const s = runnerSummary(r);
      return { initials: ctx.seat(o)?.initials ?? '?', first_pct: pct(s.first_right, s.tried), fixed_pct: pct(s.fixed, s.missed), still: s.still.length };
    })
    .sort((a, b) => (b.first_pct ?? -1) - (a.first_pct ?? -1) || a.initials.localeCompare(b.initials));
  return { items, students };
}

registerRules(pointsRushRules);
