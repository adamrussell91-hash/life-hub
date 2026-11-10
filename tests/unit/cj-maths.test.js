import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chipStats, choosePair, contestedPair, fitBradleyTerry, fitMarks, flagMisfits, judgeFit, markFor, pairKey,
  reliabilitySignal, splitHalf, ssr, thirdOf
} from '../../netlify/functions/_shared/cj-maths.mjs';

/** Seeded random numbers, so every run sees the same judgements. */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ITEMS = Array.from({ length: 10 }, (_, i) => `a${i}`);
// True quality: a0 strongest, a9 weakest, a steady step apart.
const TRUE = Object.fromEntries(ITEMS.map((id, i) => [id, 2 - (4 * i) / 9]));

/** Judges who choose by the true scale (or reverse it), each judging `per` random pairs. */
function simulate(rng, { judges = 8, per = 30, reversed = [] } = {}) {
  const out = [];
  for (let j = 0; j < judges; j += 1) {
    const judge = `j${j}`;
    for (let k = 0; k < per; k += 1) {
      const a = ITEMS[Math.floor(rng() * ITEMS.length)];
      let b = ITEMS[Math.floor(rng() * ITEMS.length)];
      while (b === a) b = ITEMS[Math.floor(rng() * ITEMS.length)];
      const p = 1 / (1 + Math.exp(TRUE[b] - TRUE[a]));
      let aWins = rng() < p;
      if (reversed.includes(judge)) aWins = !aWins;
      out.push({ winner: aWins ? a : b, loser: aWins ? b : a, judge });
    }
  }
  return out;
}

function spearman(xs, ys) {
  const rank = (v) => { const order = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]); const r = []; order.forEach(([, i], k) => { r[i] = k; }); return r; };
  const rx = rank(xs); const ry = rank(ys); const n = xs.length;
  const d2 = rx.reduce((a, r, i) => a + (r - ry[i]) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
}

test('recovers a known order from simulated judgements', () => {
  const comps = simulate(seeded(1));
  const { theta, se, iterations } = fitBradleyTerry(ITEMS, comps);
  assert.ok(iterations > 0);
  assert.ok(spearman(ITEMS.map((id) => theta[id]), ITEMS.map((id) => TRUE[id])) > 0.9);
  const centre = ITEMS.reduce((a, id) => a + theta[id], 0) / ITEMS.length;
  assert.ok(Math.abs(centre) < 1e-9, 'θ is centred');
  for (const id of ITEMS) assert.ok(se[id] > 0 && Number.isFinite(se[id]));
});

test('no comparisons: every θ is 0; disconnected and unknown items stay finite', () => {
  const empty = fitBradleyTerry(['x', 'y', 'z'], []);
  assert.deepEqual(empty.theta, { x: 0, y: 0, z: 0 });
  const fit = fitBradleyTerry(['x', 'y', 'z', 'lonely'], [{ winner: 'x', loser: 'y' }, { winner: 'ghost', loser: 'x' }, { winner: 'z', loser: 'z' }]);
  for (const v of Object.values(fit.theta)) assert.ok(Number.isFinite(v));
  assert.ok(fit.theta.x > fit.theta.lonely && fit.theta.lonely > fit.theta.y);
});

test('an answer that always wins stays finite, and weights count', () => {
  const comps = ['b', 'c', 'd'].flatMap((loser) => Array.from({ length: 5 }, () => ({ winner: 'a', loser })));
  const { theta, se } = fitBradleyTerry(['a', 'b', 'c', 'd'], comps);
  assert.ok(Number.isFinite(theta.a) && theta.a > 0 && Number.isFinite(se.a));
  const light = fitBradleyTerry(['p', 'q'], [{ winner: 'p', loser: 'q', weight: 1 }]);
  const heavy = fitBradleyTerry(['p', 'q'], [{ winner: 'p', loser: 'q', weight: 3 }]);
  assert.ok(heavy.theta.p > light.theta.p);
  const none = fitBradleyTerry(['p', 'q'], [{ winner: 'p', loser: 'q', weight: 0 }]);
  assert.equal(none.theta.p, 0);
});

test('SSR stays within 0..1 and is 0 with no spread', () => {
  assert.equal(ssr({ a: 0, b: 0 }, { a: 1, b: 1 }), 0);
  assert.equal(ssr({ a: 1, b: -1 }, { a: 10, b: 10 }), 0);
  const fit = fitBradleyTerry(ITEMS, simulate(seeded(2), { per: 60 }));
  const value = ssr(fit.theta, fit.se);
  assert.ok(value > 0.7 && value <= 1, `ssr ${value}`);
});

test('split-half is null under 4 judges and high for consistent judges', () => {
  const few = simulate(seeded(3), { judges: 3 });
  assert.equal(splitHalf(ITEMS, few, { rng: seeded(4) }), null);
  const many = simulate(seeded(5), { judges: 10, per: 40 });
  const half = splitHalf(ITEMS, many, { rng: seeded(6) });
  assert.ok(half > 0.7, `split-half ${half}`);
  const noise = Array.from({ length: 200 }, (_, i) => {
    const r = seeded(100 + i);
    const a = ITEMS[Math.floor(r() * 10)]; let b = ITEMS[Math.floor(r() * 10)]; if (b === a) b = ITEMS[(ITEMS.indexOf(a) + 1) % 10];
    return r() < 0.5 ? { winner: a, loser: b, judge: `n${i % 6}` } : { winner: b, loser: a, judge: `n${i % 6}` };
  });
  assert.ok(splitHalf(ITEMS, noise, { rng: seeded(7) }) < half);
});

test('reliability signal takes the lower of the two and counts towards 12 per answer', () => {
  assert.deepEqual(reliabilitySignal({ ssr: 0.9, splitHalf: 0.75, comparisons: 60, items: 10 }), { value: 0.75, level: 'feedback', per_item: 12, more_to_12: 0 });
  assert.equal(reliabilitySignal({ ssr: 0.85, splitHalf: null, comparisons: 10, items: 10 }).level, 'marks');
  const keep = reliabilitySignal({ ssr: 0.4, splitHalf: 0.9, comparisons: 10, items: 10 });
  assert.equal(keep.level, 'keep');
  assert.equal(keep.per_item, 2);
  assert.equal(keep.more_to_12, 50);
  assert.equal(reliabilitySignal({ ssr: 0, splitHalf: null, comparisons: 0, items: 0 }).per_item, 0);
});

test('choosePair never offers the judge’s own answer or a pair already seen', () => {
  const rng = seeded(8);
  const items = ['a', 'b', 'c', 'd'];
  const seen = new Set([pairKey('b', 'c'), pairKey('c', 'd')]);
  for (let i = 0; i < 200; i += 1) {
    const pair = choosePair({ items, seen, exclude: new Set(['a']), rng });
    assert.deepEqual(pair && [...pair].sort(), ['b', 'd']);
  }
  assert.equal(choosePair({ items, seen: new Set([pairKey('b', 'c'), pairKey('c', 'd'), pairKey('b', 'd')]), exclude: new Set(['a']), rng }), null);
  assert.equal(choosePair({ items: ['a'], rng }), null);
});

test('choosePair warms up on the least compared, then prefers close pairs', () => {
  const rng = seeded(9);
  const warm = choosePair({ items: ['a', 'b', 'c', 'd'], counts: { a: 5, b: 5, c: 0, d: 1 }, rng });
  assert.deepEqual([...warm].sort(), ['c', 'd']);
  const theta = { a: 0, b: 0.1, c: 3, d: -3, e: 2.5 };
  const counts = { a: 3, b: 5, c: 5, d: 5, e: 5 };
  let close = 0;
  const left = { a: 0, b: 0 };
  for (let i = 0; i < 400; i += 1) {
    const pair = choosePair({ items: Object.keys(theta), theta, counts, rng });
    assert.ok(pair.includes('a'), 'least compared goes first');
    if (pair.includes('b')) close += 1;
    left[pair[0] === 'a' ? 'a' : 'b'] += 1;
  }
  assert.ok(close > 380, `close ${close}`);
  assert.ok(left.a > 100 && left.b > 100, 'left and right are random');
});

test('misfit flags a judge who reverses the scale', () => {
  const comps = simulate(seeded(10), { judges: 10, per: 30, reversed: ['j3'] });
  const { theta } = fitBradleyTerry(ITEMS, comps);
  const fit = judgeFit(comps, theta);
  assert.equal(fit.j0.n, 30);
  assert.deepEqual([...flagMisfits(fit)], ['j3']);
  // Fewer than three judges with enough judgements: nobody is flagged.
  assert.equal(flagMisfits({ x: { infit: 9, n: 5 }, y: { infit: 1, n: 5 }, z: { infit: 1, n: 2 } }).size, 0);
});

test('chipStats compares the winning and losing sides', () => {
  const judgements = [
    { left: 'a', right: 'b', winner: 'a', chips: { left: [0, 1], right: [1] } },
    { left: 'c', right: 'd', winner: 'd', chips: { left: [], right: [0] } },
    { left: 'e', right: 'f', winner: 'e', chips: { left: [], right: [] } },
    { left: 'g', right: 'h', winner: 'h' }
  ];
  const [quote, argument, effect] = chipStats(judgements, ['Precise quote', 'Clear argument', 'Analyses effect']);
  assert.deepEqual(quote, { label: 'Precise quote', winner_rate: 0.5, loser_rate: 0, diff: 0.5 });
  assert.deepEqual(argument, { label: 'Clear argument', winner_rate: 0.25, loser_rate: 0.25, diff: 0 });
  assert.deepEqual(effect, { label: 'Analyses effect', winner_rate: 0, loser_rate: 0, diff: 0 });
  assert.deepEqual(chipStats([], ['x']), [{ label: 'x', winner_rate: 0, loser_rate: 0, diff: 0 }]);
});

test('contestedPair picks the split nearest 50/50, else the closest neighbours', () => {
  const theta = { a: 1, b: 0.2, c: 0, d: -1.2 };
  const comps = [
    { winner: 'a', loser: 'd' }, { winner: 'a', loser: 'd' },
    { winner: 'b', loser: 'c' }, { winner: 'c', loser: 'b' },
    { winner: 'a', loser: 'b' }
  ];
  assert.deepEqual(contestedPair(comps, theta), { a: 'b', b: 'c', split: 0.5 });
  assert.deepEqual(contestedPair([{ winner: 'a', loser: 'b' }], theta), { a: 'b', b: 'c', split: null });
  assert.equal(contestedPair([], { a: 0 }), null);
});

test('fitMarks needs two marks apart; markFor clamps and rounds to 0.5', () => {
  assert.equal(fitMarks([{ theta: 1, mark: 10 }]), null);
  assert.equal(fitMarks([{ theta: 1, mark: 10 }, { theta: -1, mark: 10 }]), null);
  assert.equal(fitMarks([{ theta: 1, mark: 10 }, { theta: 1, mark: 4 }]), null);
  const line = fitMarks([{ theta: 1, mark: 16 }, { theta: -1, mark: 8 }]);
  assert.deepEqual(line, { a: 12, b: 4 });
  assert.equal(markFor(line, 0.3, 20), 13);
  assert.equal(markFor(line, 0.4, 20), 13.5);
  assert.equal(markFor(line, 5, 20), 20);
  assert.equal(markFor(line, -5, 20), 0);
});

test('thirdOf splits a ranking into thirds', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => thirdOf(i, 9)), ['top', 'top', 'top', 'middle', 'middle', 'middle', 'bottom', 'bottom', 'bottom']);
  assert.equal(thirdOf(0, 1), 'top');
  assert.equal(thirdOf(1, 2), 'middle');
  assert.equal(thirdOf(0, 0), 'middle');
});
