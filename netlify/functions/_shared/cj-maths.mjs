/**
 * Comparative judgement maths. Pure: no imports, no I/O, no model calls, so
 * the server and the dev preview's fake server share it.
 *
 * Bradley–Terry fitted by MM (Hunter 2004) with a weak prior: each item gets
 * half a virtual win and half a virtual loss against a fixed reference of
 * strength 1, which keeps an answer that always wins (or always loses) finite
 * and shrinks thin evidence towards the middle. θ is log strength, centred
 * at 0. Design decisions D7–D17 in
 * docs/superpowers/specs/2026-11-11-comparative-judgement-design.md.
 */

const PRIOR = 0.5;
const MAX_ITERATIONS = 2000;
const TOLERANCE = 1e-9;

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const variance = (xs) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1);
};
const logistic = (x) => 1 / (1 + Math.exp(-x));
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Usable comparisons: both items known, different, positive weight. */
function usable(itemIds, comparisons) {
  const known = new Set(itemIds);
  const out = [];
  for (const c of Array.isArray(comparisons) ? comparisons : []) {
    if (!c || !known.has(c.winner) || !known.has(c.loser) || c.winner === c.loser) continue;
    const weight = c.weight === undefined ? 1 : Number(c.weight);
    if (!Number.isFinite(weight) || weight <= 0) continue;
    out.push({ ...c, weight });
  }
  return out;
}

function shuffled(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Fit a Bradley–Terry scale.
 * @param {string[]} itemIds
 * @param {Array<{ winner: string, loser: string, weight?: number }>} comparisons
 * @param {{ maxIterations?: number, tolerance?: number }} [opts]
 * @returns {{ theta: Record<string, number>, se: Record<string, number>, iterations: number }}
 */
export function fitBradleyTerry(itemIds, comparisons, opts = {}) {
  const ids = [...new Set(Array.isArray(itemIds) ? itemIds : [])];
  const maxIterations = opts.maxIterations ?? MAX_ITERATIONS;
  const tolerance = opts.tolerance ?? TOLERANCE;
  const index = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;
  const wins = new Array(n).fill(PRIOR);
  const pairs = [];
  for (const c of usable(ids, comparisons)) {
    const w = index.get(c.winner);
    const l = index.get(c.loser);
    wins[w] += c.weight;
    pairs.push([w, l, c.weight]);
  }
  let strength = new Array(n).fill(1);
  let iterations = 0;
  for (; iterations < maxIterations; iterations += 1) {
    // Prior: weight 2 × 0.5 against the reference, strength 1.
    const denom = strength.map((p) => (2 * PRIOR) / (p + 1));
    for (const [a, b, weight] of pairs) {
      const share = weight / (strength[a] + strength[b]);
      denom[a] += share;
      denom[b] += share;
    }
    const next = strength.map((_, i) => wins[i] / denom[i]);
    let change = 0;
    for (let i = 0; i < n; i += 1) change = Math.max(change, Math.abs(Math.log(next[i]) - Math.log(strength[i])));
    strength = next;
    if (change < tolerance) {
      iterations += 1;
      break;
    }
  }
  const logs = strength.map((p) => Math.log(p));
  const info = logs.map((t) => {
    const p = logistic(t);
    return 2 * PRIOR * p * (1 - p);
  });
  for (const [a, b, weight] of pairs) {
    const p = logistic(logs[a] - logs[b]);
    info[a] += weight * p * (1 - p);
    info[b] += weight * p * (1 - p);
  }
  const centre = mean(logs);
  const theta = {};
  const se = {};
  ids.forEach((id, i) => {
    theta[id] = logs[i] - centre;
    se[id] = 1 / Math.sqrt(info[i]);
  });
  return { theta, se, iterations };
}

/**
 * Scale separation reliability, (var θ − mean SE²) / var θ, clamped 0..1. 0 when θ has no spread.
 * @param {Record<string, number>} theta
 * @param {Record<string, number>} se
 * @returns {number}
 */
export function ssr(theta, se) {
  const ids = Object.keys(theta ?? {});
  const v = variance(ids.map((id) => theta[id]));
  if (!(v > 0)) return 0;
  const noise = mean(ids.map((id) => (se?.[id] ?? 0) ** 2));
  return Math.min(1, Math.max(0, (v - noise) / v));
}

function pearson(xs, ys) {
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i += 1) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}

/**
 * Judge split-half reliability: judges split at random into two halves, each
 * half fitted, θs correlated and Spearman–Brown corrected, averaged over splits.
 * @param {string[]} itemIds
 * @param {Array<{ winner: string, loser: string, weight?: number, judge: string }>} comparisons
 * @param {{ splits?: number, rng?: () => number }} [opts]
 * @returns {number | null} null with fewer than 4 distinct judges
 */
export function splitHalf(itemIds, comparisons, { splits = 20, rng = Math.random } = {}) {
  const list = usable(itemIds, comparisons).filter((c) => c.judge !== undefined && c.judge !== null);
  const judges = [...new Set(list.map((c) => String(c.judge)))].sort();
  if (judges.length < 4) return null;
  const ids = [...new Set(itemIds)];
  let total = 0;
  for (let s = 0; s < splits; s += 1) {
    const order = shuffled(judges, rng);
    const half = new Set(order.slice(0, Math.floor(order.length / 2)));
    const a = fitBradleyTerry(ids, list.filter((c) => half.has(String(c.judge))));
    const b = fitBradleyTerry(ids, list.filter((c) => !half.has(String(c.judge))));
    const r = pearson(ids.map((id) => a.theta[id]), ids.map((id) => b.theta[id]));
    total += 1 + r > 0 ? (2 * r) / (1 + r) : -1;
  }
  return total / splits;
}

/**
 * The "reliable enough" signal (D9). `value` is the lower of SSR and split-half when split-half exists.
 * @param {{ ssr: number, splitHalf: number | null, comparisons: number, items: number }} input
 *   comparisons: how many judgements; items: how many answers in the pool.
 * @returns {{ value: number, level: 'keep' | 'feedback' | 'marks', per_item: number, more_to_12: number }}
 */
export function reliabilitySignal({ ssr: s, splitHalf: half, comparisons, items }) {
  const value = half === null || half === undefined ? s : Math.min(s, half);
  const level = value >= 0.8 ? 'marks' : value >= 0.7 ? 'feedback' : 'keep';
  const count = Math.max(0, Number(comparisons) || 0);
  const n = Math.max(0, Number(items) || 0);
  const per_item = n ? Math.round(((2 * count) / n) * 10) / 10 : 0;
  const more_to_12 = Math.max(0, Math.ceil((12 * n) / 2 - count));
  return { value, level, per_item, more_to_12 };
}

/**
 * The next pair for a judge (D10, D11). Warm-up until every eligible item has
 * `warmup` comparisons: least-compared item with a least-compared partner.
 * After that: least-compared item, partner drawn with weight exp(−Δθ² / 0.5).
 * @param {{ items: string[], theta?: Record<string, number>, counts?: Record<string, number>,
 *   seen?: Set<string>, exclude?: Set<string>, rng?: () => number, warmup?: number }} input
 *   seen holds sorted keys 'a|b' of pairs this judge has judged.
 * @returns {[string, string] | null} in random left/right order
 */
export function choosePair({ items, theta = {}, counts = {}, seen = new Set(), exclude = new Set(), rng = Math.random, warmup = 3 }) {
  const eligible = [...new Set(items ?? [])].filter((id) => !exclude.has(id));
  const count = (id) => counts[id] ?? 0;
  const partners = (a) => eligible.filter((b) => b !== a && !seen.has(pairKey(a, b)));
  const open = eligible.filter((a) => partners(a).length);
  if (!open.length) return null;
  const least = (list) => {
    const low = Math.min(...list.map(count));
    const tied = list.filter((id) => count(id) === low);
    return tied[Math.floor(rng() * tied.length)];
  };
  const first = least(open);
  const choices = partners(first);
  let second;
  if (eligible.some((id) => count(id) < warmup)) {
    second = least(choices);
  } else {
    const weights = choices.map((b) => Math.exp(-(((theta[first] ?? 0) - (theta[b] ?? 0)) ** 2) / 0.5));
    const sum = weights.reduce((a, b) => a + b, 0);
    if (!(sum > 0)) second = choices[Math.floor(rng() * choices.length)];
    else {
      let pick = rng() * sum;
      second = choices[choices.length - 1];
      for (let i = 0; i < choices.length; i += 1) {
        pick -= weights[i];
        if (pick < 0) {
          second = choices[i];
          break;
        }
      }
    }
  }
  return rng() < 0.5 ? [first, second] : [second, first];
}

/**
 * Infit mean square per judge: Σ(x − p)² / Σ p(1 − p), x = 1 for the choice made.
 * @param {Array<{ winner: string, loser: string, judge: string }>} comparisons
 * @param {Record<string, number>} theta
 * @returns {Record<string, { infit: number, n: number }>}
 */
export function judgeFit(comparisons, theta) {
  const sums = {};
  for (const c of Array.isArray(comparisons) ? comparisons : []) {
    if (!c || c.judge === undefined || !(c.winner in theta) || !(c.loser in theta) || c.winner === c.loser) continue;
    const p = logistic(theta[c.winner] - theta[c.loser]);
    const row = (sums[c.judge] ??= { res: 0, info: 0, n: 0 });
    row.res += (1 - p) ** 2;
    row.info += p * (1 - p);
    row.n += 1;
  }
  return Object.fromEntries(Object.entries(sums).map(([judge, r]) => [judge, { infit: r.info > 0 ? r.res / r.info : 0, n: r.n }]));
}

/**
 * Judges whose infit is above mean + 2 SD among judges with at least `minN` judgements (needs ≥ 3 such judges).
 * @param {Record<string, { infit: number, n: number }>} fit
 * @param {{ minN?: number }} [opts]
 * @returns {Set<string>}
 */
export function flagMisfits(fit, { minN = 3 } = {}) {
  const rows = Object.entries(fit ?? {}).filter(([, r]) => r.n >= minN);
  if (rows.length < 3) return new Set();
  const values = rows.map(([, r]) => r.infit);
  const m = mean(values);
  const sd = Math.sqrt(values.reduce((a, x) => a + (x - m) ** 2, 0) / values.length);
  return new Set(rows.filter(([, r]) => r.infit > m + 2 * sd).map(([judge]) => judge));
}

/**
 * How often each chip was ticked on the winning side and on the losing side (D14).
 * @param {Array<{ left: string, right: string, winner: string, chips?: { left?: number[], right?: number[] } }>} judgements
 * @param {string[]} chipLabels
 * @returns {Array<{ label: string, winner_rate: number, loser_rate: number, diff: number }>}
 */
export function chipStats(judgements, chipLabels) {
  const list = (Array.isArray(judgements) ? judgements : []).filter((j) => j && (j.winner === j.left || j.winner === j.right));
  return (chipLabels ?? []).map((label, i) => {
    let won = 0;
    let lost = 0;
    for (const j of list) {
      const winSide = j.winner === j.left ? 'left' : 'right';
      const loseSide = winSide === 'left' ? 'right' : 'left';
      if ((j.chips?.[winSide] ?? []).includes(i)) won += 1;
      if ((j.chips?.[loseSide] ?? []).includes(i)) lost += 1;
    }
    const winner_rate = list.length ? won / list.length : 0;
    const loser_rate = list.length ? lost / list.length : 0;
    return { label, winner_rate, loser_rate, diff: winner_rate - loser_rate };
  });
}

/**
 * The most contested close pair (D17): judged at least twice with the split
 * nearest 50/50 (ties: smaller θ gap, then more judgements); otherwise the two
 * neighbouring items with the smallest θ gap, split null.
 * @param {Array<{ winner: string, loser: string }>} comparisons
 * @param {Record<string, number>} theta
 * @returns {{ a: string, b: string, split: number | null } | null} split = a's share of the wins
 */
export function contestedPair(comparisons, theta) {
  const known = theta ?? {};
  const pairs = new Map();
  for (const c of Array.isArray(comparisons) ? comparisons : []) {
    if (!c || !(c.winner in known) || !(c.loser in known) || c.winner === c.loser) continue;
    const [a, b] = c.winner < c.loser ? [c.winner, c.loser] : [c.loser, c.winner];
    const row = pairs.get(`${a}|${b}`) ?? { a, b, aWins: 0, n: 0 };
    row.n += 1;
    if (c.winner === a) row.aWins += 1;
    pairs.set(`${a}|${b}`, row);
  }
  let best = null;
  for (const row of pairs.values()) {
    if (row.n < 2) continue;
    const split = row.aWins / row.n;
    const score = [Math.abs(split - 0.5), Math.abs(known[row.a] - known[row.b]), -row.n];
    if (!best || score[0] < best.score[0] - 1e-12 || (Math.abs(score[0] - best.score[0]) <= 1e-12 && (score[1] < best.score[1] || (score[1] === best.score[1] && score[2] < best.score[2])))) {
      best = { a: row.a, b: row.b, split, score };
    }
  }
  if (best) return { a: best.a, b: best.b, split: best.split };
  const ordered = Object.keys(known).sort((x, y) => known[y] - known[x] || (x < y ? -1 : 1));
  if (ordered.length < 2) return null;
  let at = 0;
  for (let i = 1; i < ordered.length - 1; i += 1) {
    if (known[ordered[i]] - known[ordered[i + 1]] < known[ordered[at]] - known[ordered[at + 1]]) at = i;
  }
  return { a: ordered[at], b: ordered[at + 1], split: null };
}

/**
 * Least-squares line mark = a + bθ through anchors with known marks (D20).
 * @param {Array<{ theta: number, mark: number }>} points
 * @returns {{ a: number, b: number } | null} null with fewer than 2 points, fewer than 2 distinct marks, or no θ spread
 */
export function fitMarks(points) {
  const list = (Array.isArray(points) ? points : []).filter((p) => Number.isFinite(p?.theta) && Number.isFinite(p?.mark));
  if (list.length < 2 || new Set(list.map((p) => p.mark)).size < 2) return null;
  const mx = mean(list.map((p) => p.theta));
  const my = mean(list.map((p) => p.mark));
  let sxy = 0;
  let sxx = 0;
  for (const p of list) {
    sxy += (p.theta - mx) * (p.mark - my);
    sxx += (p.theta - mx) ** 2;
  }
  if (!(sxx > 1e-12)) return null;
  const b = sxy / sxx;
  return { a: my - b * mx, b };
}

/**
 * A mark from the fitted line, clamped to 0..outOf and rounded to the nearest 0.5.
 * @param {{ a: number, b: number }} fit
 * @param {number} theta
 * @param {number} outOf
 * @returns {number}
 */
export function markFor(fit, theta, outOf) {
  const raw = fit.a + fit.b * theta;
  const rounded = Math.round((Number.isFinite(raw) ? raw : 0) * 2) / 2;
  return Math.min(outOf, Math.max(0, rounded));
}

/**
 * Which third a rank sits in; rank 0 is the strongest.
 * @param {number} rankIndex
 * @param {number} n
 * @returns {'top' | 'middle' | 'bottom'}
 */
export function thirdOf(rankIndex, n) {
  if (!(n > 0)) return 'middle';
  const part = Math.min(2, Math.max(0, Math.floor((rankIndex * 3) / n)));
  return part === 0 ? 'top' : part === 1 ? 'middle' : 'bottom';
}

/** Sorted 'a|b' key for an unordered pair, the form `choosePair` reads in `seen`. */
export { pairKey };
