/**
 * Points rush, the pure part (spec §6.6): one player's question stream,
 * scoring and the 2-tap shop. The live room (rules.ts) and the solo player
 * (player.ts) both run it, so a right answer is worth the same everywhere.
 *
 * - Right: 100 × multiplier, plus the streak bonus on every third in a row.
 * - Wrong: no points lost; the item comes back 3–6 questions later, again
 *   and again until it's answered right. Insurance (if held) keeps the streak.
 * - Shop: Multiplier (+1 ×, three levels), Streak bonus (three levels),
 *   Insurance (one held at a time). Nothing else: no sabotage, no cosmetics,
 *   no hints for sale. Spending points never lowers the class goal.
 */

export const BASE_POINTS = 100;
export const STREAK_BONUS = [0, 100, 250, 500] as const;
export const UPGRADES = ['mult', 'streak', 'ins'] as const;
export type Upgrade = (typeof UPGRADES)[number];
export const UPGRADE_INFO: Record<Upgrade, { name: string; costs: number[]; max: number }> = {
  mult: { name: 'Multiplier', costs: [300, 800, 1800], max: 3 },
  streak: { name: 'Streak bonus', costs: [250, 700, 1500], max: 3 },
  ins: { name: 'Insurance', costs: [200], max: 1 }
};

/** Per item: first try right or wrong, tries until right, whether it was fixed when it came back, total time. */
export type ItemRecord = { first: boolean | null; tries: number; fixed: boolean; ms: number };

export type Runner = {
  /** Items in this player's order; refilled (reshuffled) once every item is right and nothing is waiting. */
  queue: string[];
  qi: number;
  answered: number;
  /** Missed items waiting to come back, due after `due` answers. */
  back: Array<{ item: string; due: number }>;
  cur: { item: string; back: boolean; n: number; shown_at: number } | null;
  points: number;
  /** Points scored (spending never takes these back): what fills the class goal. */
  earned: number;
  streak: number;
  best: number;
  up: Record<Upgrade, number>;
  bought: number;
  rec: Record<string, ItemRecord>;
  /** The last answer's outcome, for the phone's burst and note. */
  last?: Verdict;
};

export type Verdict = { item: string; correct: boolean; back: boolean; gain: number; bonus: number; insurance_used: boolean; streak: number; n: number };

export type Rand = () => number;

export function shuffle<T>(xs: readonly T[], random: Rand): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function newRunner(items: readonly string[], random: Rand): Runner {
  return { queue: shuffle(items, random), qi: 0, answered: 0, back: [], cur: null, points: 0, earned: 0, streak: 0, best: 0, up: { mult: 0, streak: 0, ins: 0 }, bought: 0, rec: {} };
}

/** The multiplier now: ×1, then ×2, ×3, ×4 as Multiplier is bought. */
export const multiplier = (r: Pick<Runner, 'up'>) => r.up.mult + 1;

/**
 * Picks the next item: a missed item once it's due; otherwise the next fresh
 * one; then any missed item still waiting; then a fresh shuffle (never the
 * item just answered first, when there is a choice).
 */
export function nextItem(r: Runner, items: readonly string[], random: Rand, now: number): Runner['cur'] {
  if (!items.length) return (r.cur = null);
  let item: string;
  let back = false;
  const due = r.back.findIndex((b) => b.due <= r.answered);
  if (due > -1) {
    item = r.back.splice(due, 1)[0].item;
    back = true;
  } else if (r.qi < r.queue.length) item = r.queue[r.qi++];
  else if (r.back.length) {
    r.back.sort((a, b) => a.due - b.due);
    item = (r.back.shift() as { item: string }).item;
    back = true;
  } else {
    const prev = r.cur?.item;
    r.queue = shuffle(items, random);
    if (r.queue.length > 1 && r.queue[0] === prev) r.queue.push(r.queue.shift() as string);
    r.qi = 0;
    item = r.queue[r.qi++];
  }
  r.cur = { item, back, n: r.answered + 1, shown_at: now };
  return r.cur;
}

/** Applies one marked answer to the current item. Call `nextItem` after it. */
export function applyAnswer(r: Runner, correct: boolean, random: Rand, now: number): Verdict | null {
  const cur = r.cur;
  if (!cur) return null;
  const rec = (r.rec[cur.item] ??= { first: null, tries: 0, fixed: false, ms: 0 });
  const solved = rec.first === true || rec.fixed;
  if (!solved) {
    rec.tries += 1;
    rec.ms += Math.max(0, now - cur.shown_at);
    if (rec.first === null) rec.first = correct;
    else if (correct) rec.fixed = true;
  }
  r.answered += 1;
  let gain = 0;
  let bonus = 0;
  let insurance = false;
  if (correct) {
    r.streak += 1;
    r.best = Math.max(r.best, r.streak);
    gain = BASE_POINTS * multiplier(r);
    if (r.streak % 3 === 0) bonus = STREAK_BONUS[r.up.streak] ?? 0;
    r.points += gain + bonus;
    r.earned += gain + bonus;
  } else {
    if (r.up.ins > 0) {
      r.up.ins = 0;
      insurance = true;
    } else r.streak = 0;
    r.back.push({ item: cur.item, due: r.answered + 3 + Math.floor(random() * 4) });
  }
  r.last = { item: cur.item, correct, back: cur.back, gain, bonus, insurance_used: insurance, streak: r.streak, n: cur.n };
  return r.last;
}

export type ShopRow = { key: Upgrade; name: string; level: number; max: number; cost: number | null; can: boolean };

/** The shop as this player sees it: each upgrade's level, its next cost (null when maxed or held) and whether it's affordable. */
export function shopRows(r: Pick<Runner, 'up' | 'points'>): ShopRow[] {
  return UPGRADES.map((key) => {
    const info = UPGRADE_INFO[key];
    const level = r.up[key];
    const cost = level >= info.max ? null : info.costs[level];
    return { key, name: info.name, level, max: info.max, cost, can: cost !== null && r.points >= cost };
  });
}

/** Buys an upgrade. Returns false when it's maxed, held or too dear. */
export function buy(r: Runner, key: Upgrade): boolean {
  const row = shopRows(r).find((x) => x.key === key);
  if (!row?.can || row.cost === null) return false;
  r.points -= row.cost;
  r.up[key] += 1;
  r.bought += 1;
  return true;
}

/** End-of-game numbers for one player. */
export function runnerSummary(r: Runner): { first_right: number; tried: number; missed: number; fixed: number; still: string[]; best: number } {
  const recs = Object.entries(r.rec);
  const missed = recs.filter(([, x]) => x.first === false);
  return {
    first_right: recs.filter(([, x]) => x.first === true).length,
    tried: recs.length,
    missed: missed.length,
    fixed: missed.filter(([, x]) => x.fixed).length,
    still: missed.filter(([, x]) => !x.fixed).map(([id]) => id),
    best: r.best
  };
}

/** A class goal when the teacher hasn't set one: about 4 answers a minute each, two in three right. */
export function autoGoal(seats: number, minutes: number): number {
  const raw = Math.max(1, seats) * minutes * 4 * BASE_POINTS * 0.66;
  return Math.max(1000, Math.round(raw / 1000) * 1000);
}

export const MILESTONES = [25, 50, 75, 100] as const;
