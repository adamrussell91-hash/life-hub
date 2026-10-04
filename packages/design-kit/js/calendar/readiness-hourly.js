/**
 * Hourly readiness: a battery across the day, and the weather it reads as.
 *
 * Start at the morning readiness. Time awake drains slowly; demanding calendar items drain
 * faster (teaching and deep work most, admin least); switching between many short items
 * drains extra (gusts). A free gap of 30 minutes or more is a recovery opportunity, not proof:
 * it closes part of the deficit and never lifts above the morning level. A check-in later in
 * the day re-anchors everything after it. Uncertainty grows with distance from the last
 * anchor (wake or a check-in).
 *
 * No meal, medication or "Corey lift" is assumed. An item may carry `lift: n` only when the
 * caller has personal evidence for it (learned from check-in residuals), and `profile(h)` is
 * where a learned personal daily shape plugs in. Both default to nothing.
 */
import { READINESS } from './readiness-model.js';

export const HOURLY = Object.freeze({
  step: 0.5, // hours
  // Drains are shares of what is left, per hour: a low day loses less in points, never hits zero.
  awakeDrain: 0.008,
  demand: Object.freeze({ class: 0.04, deep: 0.04, physical: 0.05, meeting: 0.03, shallow: 0.025, admin: 0.02 }),
  switchDrain: 0.01, // per switch beyond the first in the surrounding two hours
  overlapDrain: 0.015, // two commitments at once
  minRecoveryGap: 0.5, // hours of free time before recovery starts
  recoveryRate: 0.15, // share of the deficit closed per free hour
  recoveryCeiling: 0.9, // a gap restores toward 90% of the morning level, never past it
  bandGrowth: 2.2, // band half-width growth × sqrt(hours since anchor)
  bandMax: 30
});

/** The thirty supplied weather icons, by file number. Order and numbers are a contract. */
export const WEATHER_STATES = Object.freeze({
  1: 'Clear skies', 2: 'Brilliant sunshine', 3: 'Morning sunshine', 4: 'Afternoon sunshine',
  5: 'Sunny intervals', 6: 'Sun through cloud', 7: 'Warm front approaching', 8: 'Gentle breeze',
  9: 'Building breeze', 10: 'Gusty conditions', 11: 'Strong headwind', 12: 'Crosswinds',
  13: 'High cloud', 14: 'Increasing cloud', 15: 'Overcast', 16: 'Heavy cloud', 17: 'Low cloud',
  18: 'Morning mist', 19: 'Patchy fog', 20: 'Dense fog', 21: 'Fog lifting', 22: 'Light drizzle',
  23: 'Passing showers', 24: 'Persistent rain', 25: 'Squally showers', 26: 'Storm building',
  27: 'Thunderstorm', 28: 'Storm easing', 29: 'Cloud breaking', 30: 'Calm evening'
});

/** Colour family per state, so the forecast line can shift hue with conditions. */
export const WEATHER_FAMILY = Object.freeze({
  sun: [1, 2, 3, 4, 5, 6], breeze: [7, 8, 9], gust: [10, 11, 12], cloud: [13, 14, 15, 16, 17],
  fog: [18, 19, 20, 21], rain: [22, 23, 24, 25], storm: [26, 27, 28], clearing: [29, 30]
});

export function familyOf(id) {
  return Object.entries(WEATHER_FAMILY).find(([, ids]) => ids.includes(id))?.[0] ?? 'breeze';
}

/** Demand class of a calendar item. Logs, ghosts, protected and Corey time do not drain. */
export function demandOf(item) {
  if (!item || item.ghost || item.kind === 'log' || item.protected || item.kind === 'corey') return null;
  if (item.isClass || item.kind === 'teaching') return 'class';
  if (item.kind === 'fitness' || item.kind === 'workout') return 'physical';
  if (item.depth === 'deep' || item.cognitive_load === 'high') return 'deep';
  if (item.depth === 'admin') return 'admin';
  if (item.depth === 'shallow' || item.kind === 'task') return 'shallow';
  return 'meeting';
}

const overlaps = (item, h, step) => item.start < h + step && item.end > h;

/**
 * Project the day. `start` is the daily result ({ pct, low, high }); items are
 * [{ start, end, kind, isClass?, depth?, protected?, ghost?, lift? }] in hours.
 * observations: [{ h, pct }] intraday check-ins. Returns { points, anchors }.
 */
export function projectDay({ start, items = [], wakeHour = 7, bedHour = 22.5, observations = [], profile = () => 0 } = {}) {
  const step = HOURLY.step;
  const live = items.filter(item => demandOf(item) || item.lift);
  const half0 = Math.max(4, Math.round(((start?.high ?? 0) - (start?.low ?? 0)) / 2) || 8);
  const obs = [...observations].sort((a, b) => a.h - b.h);
  const points = [];
  let level = start?.pct ?? READINESS.normal;
  let ceiling = level;
  let anchorH = wakeHour;
  let anchorHalf = half0;
  let free = 0;
  for (let h = wakeHour; h <= bedHour + 1e-9; h += step) {
    const reading = obs.find(o => o.h >= h - step / 2 && o.h < h + step / 2);
    if (reading) {
      level = reading.pct;
      ceiling = Math.max(level, ceiling * 0.9);
      anchorH = h;
      anchorHalf = 6;
    }
    const now = live.filter(item => overlaps(item, h, step));
    const demands = now.map(demandOf).filter(Boolean);
    // Switches: commitments starting within an hour either side, beyond the first.
    const starts = live.filter(item => demandOf(item) && item.start >= h - 1 && item.start < h + 1).length;
    const transitions = Math.max(0, starts - 1);
    let rate = HOURLY.awakeDrain;
    for (const d of demands) rate += HOURLY.demand[d];
    if (demands.length > 1) rate += HOURLY.overlapDrain;
    rate += Math.max(0, transitions - 1) * HOURLY.switchDrain;
    free = demands.length ? 0 : free + step;
    let recover = 0;
    const restoreTo = ceiling * HOURLY.recoveryCeiling;
    if (!demands.length && free >= HOURLY.minRecoveryGap && level < restoreTo) recover = (restoreTo - level) * HOURLY.recoveryRate;
    const lift = now.reduce((sum, item) => sum + (Number(item.lift) || 0), 0);
    if (h > wakeHour && !reading) {
      level = level * (1 - rate * step) + recover * step + lift * step;
    }
    level = Math.min(READINESS.ceiling, Math.max(0, level));
    const shown = Math.min(READINESS.ceiling, Math.max(0, level + profile(h)));
    const half = Math.min(HOURLY.bandMax, anchorHalf + HOURLY.bandGrowth * Math.sqrt(Math.max(0, h - anchorH)));
    points.push({
      h,
      pct: Math.round(shown),
      low: Math.round(Math.max(0, shown - half)),
      high: Math.round(Math.min(100, shown + half)),
      demand: demands,
      transitions,
      free: demands.length === 0,
      observed: Boolean(reading)
    });
  }
  return { points, anchors: obs };
}

/**
 * Weather at point i, from the level, its trend, the calendar around it and the domain state.
 * Same score can read as different weather: the icon says conditions, the number says amount.
 */
export function weatherAt(points, i, state = null) {
  const p = points[i];
  const ahead = points[Math.min(points.length - 1, i + 4)];
  const behind = points[Math.max(0, i - 4)];
  const trend = ahead.pct - p.pct;
  const recent = p.pct - behind.pct;
  const span = points.slice(Math.max(0, i - 3), i + 4).map(q => q.pct);
  const swing = Math.max(...span) - Math.min(...span);
  const load = points.slice(i, i + 4).filter(q => q.demand.length).length * 0.5;
  const evening = p.h >= 19;
  const domain = d => state?.[d]?.v ?? READINESS.base[d];
  const wasStorm = points.slice(0, i).some(q => q.pct < 30);
  const morning = p.h < 11;

  if (p.pct < 25 && p.demand.length) return 27;
  if (p.pct < 35 && load >= 1.5) return 26;
  if (wasStorm && trend > 2 && p.pct < 50) return 28;
  if (swing >= 25) return 25;
  if (domain('focus') < 35) return morning ? 18 : 20;
  if (domain('focus') < 45) return morning ? 18 : p.h >= 13 ? 21 : 19;
  if (domain('mood') < 35) return 24;
  if (domain('mood') < 45) return 22;
  if (p.demand.length > 1) return 12;
  if (p.transitions >= 2) return 10;
  if (points.slice(i, i + 4).some(q => q.demand.length === 0 && q.free) && points.slice(i, i + 4).some(q => q.demand.length) && p.pct >= 60 && trend >= -2) {
    // Gaps between commitments with capacity to use them.
    if (p.pct < 75) return 5;
  }
  if (p.pct >= 90) return domain('energy') >= 95 ? 2 : 1;
  if (evening && load === 0) return 30;
  if (trend >= 4) return p.pct < 50 ? 29 : morning ? 9 : 4;
  if (trend <= -4) return morning && p.pct >= 60 ? 3 : 14;
  if (recent < -6 && trend > 0) return 23;
  if (p.pct < 35) return 16;
  if (p.pct < 50) return morning && domain('energy') < 45 ? 17 : 15;
  if (p.pct < 60 && p.demand.length) return 11;
  if (p.pct >= 70 && (domain('health') < 80 || domain('sleep') < 60)) return 6;
  if (p.pct < 70) return 13;
  return 8;
}

const WHY = {
  1: 'Rested and clear, with room to spare.', 2: 'High energy for demanding work.',
  3: 'A strong start; expect it to ease later.', 4: 'A slower start, better later.',
  5: 'Useful bursts between busier stretches.', 6: 'Good capacity, with one limitation still there.',
  7: 'Something coming up has lifted you before.', 8: 'Steady and comfortable.',
  9: 'Picking up as the morning goes.', 10: 'Lots of short switches will break up focus.',
  11: 'This stretch will take more effort than usual.', 12: 'Overlapping demands pull in two directions.',
  13: 'Mild background tiredness; plenty usable.', 14: 'Demands are stacking up; capacity will dip.',
  15: 'Low and flat, without sharp changes.', 16: 'Significant fatigue limits what feels manageable.',
  17: 'Getting started will be the hard part.', 18: 'Groggy start that should clear.',
  19: 'Concentration comes and goes.', 20: 'Mental clarity is well down.',
  21: 'Focus is coming back after a hard stretch.', 22: 'A little emotional friction.',
  23: 'Brief dips with recovery between.', 24: 'Emotional strain likely to stay.',
  25: 'Expect sharp swings.', 26: 'Demands converge on low reserves; a real dip is coming.',
  27: 'Overloaded right now.', 28: 'The worst is passing; recovery is incomplete.',
  29: 'A gap is starting to restore capacity.', 30: 'Demands are settling; time to wind down.'
};

/**
 * The forecast cards: weather only where it meaningfully changes, at most `max` cards.
 * Returns [{ h, pct, low, high, id, name, family, why }].
 */
export function weatherCards(points, state = null, { max = 6 } = {}) {
  if (!points.length) return [];
  const all = points.map((p, i) => ({ ...p, id: weatherAt(points, i, state) }));
  // Debounce: a new condition must hold for an hour (two points) before it earns a card.
  const changes = [all[0]];
  for (let i = 1; i < all.length; i++) {
    const last = changes[changes.length - 1];
    if (all[i].id === last.id) continue;
    const holds = all[i + 1]?.id === all[i].id || i === all.length - 1;
    if (holds && familyOf(all[i].id) !== familyOf(last.id)) changes.push(all[i]);
    else if (holds && Math.abs(all[i].pct - last.pct) >= 8) changes.push(all[i]);
  }
  let picked = changes;
  if (picked.length > max) {
    // Keep the first, then the biggest level moves.
    const [first, ...rest] = picked;
    const scored = rest.map(p => ({ p, score: Math.abs(p.pct - first.pct) + (p.id >= 26 ? 50 : 0) }));
    picked = [first, ...scored.sort((a, b) => b.score - a.score).slice(0, max - 1).map(x => x.p)].sort((a, b) => a.h - b.h);
  }
  return picked.map(p => ({ h: p.h, pct: p.pct, low: p.low, high: p.high, id: p.id, name: WEATHER_STATES[p.id], family: familyOf(p.id), why: WHY[p.id] }));
}

/**
 * Past versus forecast (the equation of time): for each observed reading, how far the
 * forecast issued earlier was off. snapshot: points from the earlier issue.
 */
export function driftAgainst(snapshot, observations) {
  return (observations ?? []).map(o => {
    const p = snapshot.reduce((best, q) => (Math.abs(q.h - o.h) < Math.abs(best.h - o.h) ? q : best), snapshot[0]);
    return { h: o.h, forecast: p?.pct ?? null, actual: o.pct, drift: p ? o.pct - p.pct : null };
  });
}
