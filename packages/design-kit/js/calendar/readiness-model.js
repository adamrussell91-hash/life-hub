/**
 * Readiness model v2: today's capacity as a weather forecast.
 *
 * Source of truth for the design: docs/capacity-forecast-handoff/ (algorithm.md,
 * check-ins-and-logging.md, weather-states.md). Pure functions, no I/O.
 *
 * - 100 means full capacity: everything is peaches. It is reachable. No history ceiling.
 * - Missing answers are unknown, never zero and never "poor": they fall back to recent
 *   history and widen the band instead of moving the estimate.
 * - Sleep matters a lot, and yesterday's workload and hard exercise still cost recovery
 *   even when this morning's energy and focus answers are good.
 * - Mood is one domain, not the master input. Physical, cognitive and emotional state
 *   are tracked separately and drive the weather; the score is their weighted blend.
 * - Only evidence that existed when the forecast was issued is used (an evening diary
 *   never leaks into an archived 7 am forecast).
 *
 * Every number lives in READINESS. They are provisional design weights from the
 * comparison prototype, not fitted or clinically validated coefficients.
 */
import { symptomsIn } from './capacity-model.js';

export const MODEL_VERSION = 'readiness-2.0-provisional';

export const READINESS = Object.freeze({
  baseline: 75, // assumed personal ordinary day until history says otherwise
  history: Object.freeze({ yesterday: 0.55, week: 0.3, baseline: 0.15 }),
  weights: Object.freeze({ energy: 0.25, focus: 0.25, mood: 0.1, health: 0.2, sleep: 0.2 }),
  /** Diary vocabulary → domain anchors (prior-day evidence). */
  diaryEnergy: Object.freeze({ low: 30, medium: 70, high: 100 }),
  sleepDuration: Object.freeze([[5, 45], [6, 70], [7, 100]]),
  recovery: Object.freeze({ missing: 0.7, restorative: 0.4, adequate: 0.7, poor: 1 }),
  workCost: Object.freeze({ light: 0, moderate: 3, heavy: 8 }),
  workHours: Object.freeze({ moderate: 3.5, heavy: 6 }),
  exerciseCost: Object.freeze({ strenuous: 5, gentle: 0 }),
  poorSleepHeavyWork: 5,
  /** Uncertainty: half-width of the band in points. Illustrative, not calibrated. */
  spread: Object.freeze({ base: 4, perMissingWeight: 18, perStaleDay: 1.2, staleCap: 8, answeredOverall: 0.5, perHourAhead: 1.1 }),
  /** Reported overall readiness wins most of the blend: it is the observation. */
  reportedWeight: 0.7,
  discrepancyThreshold: 10,
  checkinWindow: Object.freeze({ from: 5, to: 12 })
});

/* ======================================================================== Answers */

/**
 * Morning bubble answers → anchors and nuance. Codes are stable: they are stored.
 * `anchor` is a coarse 0–100 reading; `resolution` says how coarse.
 */
export const ANSWERS = Object.freeze({
  sleep: Object.freeze({
    worse: { anchor: 20, label: 'Worse', trend: 'worse', residual: false },
    still_poor: { anchor: 30, label: 'Still poor', trend: 'same', residual: false },
    better_still_tired: { anchor: 60, label: 'Better, still tired', trend: 'better', residual: true },
    restorative: { anchor: 100, label: 'Restorative', trend: 'better', residual: false },
    poor: { anchor: 25, label: 'Poor', trend: null, residual: false },
    okay: { anchor: 70, label: 'Okay', trend: null, residual: false }
  }),
  energy: Object.freeze({
    drained: { anchor: 25, label: 'Drained' },
    heavy_manageable: { anchor: 55, label: 'Heavy but manageable' },
    normal: { anchor: 80, label: 'Back to normal' },
    energised: { anchor: 100, label: 'Energised' }
  }),
  focus: Object.freeze({
    foggy: { anchor: 25, label: 'Foggy' },
    brief: { anchor: 50, label: 'Can focus briefly' },
    distractible: { anchor: 65, label: 'Clear but distractible' },
    sharp: { anchor: 100, label: 'Sharp' }
  }),
  mood: Object.freeze({
    low: { anchor: 30, label: 'Low' },
    flat: { anchor: 55, label: 'Flat' },
    okay: { anchor: 75, label: 'Okay' },
    good: { anchor: 100, label: 'Good' }
  }),
  symptoms: Object.freeze({
    worse: { anchor: 30, label: 'Worse' },
    same: { anchor: 45, label: 'Same' },
    easing: { anchor: 70, label: 'Easing' },
    gone: { anchor: 100, label: 'Gone' }
  }),
  lingering: Object.freeze({
    soreness: { label: 'Physical soreness', exercise: 1.5, work: 1 },
    mental: { label: 'Mental fatigue', exercise: 1, work: 1.5 },
    both: { label: 'Both', exercise: 1.5, work: 1.5 },
    recovered: { label: 'Feeling recovered', exercise: 0.3, work: 0.3 }
  }),
  overall: Object.freeze({
    empty: { anchor: 20, label: 'Running on empty' },
    limited: { anchor: 40, label: 'Limited reserves' },
    manageable: { anchor: 60, label: 'Manageable' },
    strong: { anchor: 80, label: 'Feeling strong' },
    full: { anchor: 100, label: 'Full capacity' }
  }),
  break: Object.freeze({
    not_really: { anchor: null, label: 'Not really' },
    little: { anchor: null, label: 'A little' },
    refreshed: { anchor: null, label: 'Refreshed' }
  })
});

/** "What did we miss?" one-tap reasons. Hypotheses, never causal labels. */
export const REASONS = Object.freeze({
  sleep_worse: 'Sleep worse than expected',
  work_fatigue: 'Work took more out of me',
  pain_illness: 'Pain or illness',
  break_helped: 'A break helped',
  emotional_lift: 'Feeling emotionally lifted',
  something_else: 'Something else',
  not_sure: 'Not sure'
});

export function answerFor(domain, code) {
  return ANSWERS[domain]?.[code] ?? null;
}

/* ======================================================================== Time */

const SYDNEY = 'Australia/Sydney';

/** "YYYY-MM-DDTHH:MM" in Sydney for an ISO instant (or null). */
export function sydneyLocal(iso) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: SYDNEY, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  }).formatToParts(at).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function addDays(dateKey, n) {
  const at = new Date(`${dateKey}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + n);
  return at.toISOString().slice(0, 10);
}

/**
 * When a Life record became knowable, as Sydney local "YYYY-MM-DDTHH:MM".
 * Prefers the record's own entry timestamp; else its date and time; else the end of its
 * date (a diary with no time is assumed written that evening, so it never counts as
 * morning knowledge for its own day).
 */
export function availableAt(record) {
  for (const key of ['recorded_at', 'created_at']) {
    const value = record?.[key];
    if (typeof value === 'string' && value.includes('T')) {
      const local = sydneyLocal(value);
      if (local) return local;
    }
  }
  const date = typeof record?.date === 'string' ? record.date : null;
  if (!date) return null;
  const time = /^\d{2}:\d{2}$/.test(String(record?.time ?? '')) ? record.time : '23:59';
  return `${date}T${time}`;
}

/* ======================================================================== Evidence */

const clamp = (v, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));
const round = v => Math.round(v);

function durationAnchor(hours) {
  if (!Number.isFinite(hours)) return null;
  const pts = READINESS.sleepDuration;
  if (hours <= pts[0][0]) return clamp(pts[0][1] - (pts[0][0] - hours) * 15);
  for (let i = 1; i < pts.length; i += 1) {
    const [h1, a1] = pts[i];
    const [h0, a0] = pts[i - 1];
    if (hours <= h1) return a0 + ((hours - h0) / (h1 - h0)) * (a1 - a0);
  }
  return 100;
}

/** Strenuous vs gentle from a completed workout record. */
export function exerciseLoad(record) {
  if (record?.type !== 'workout' || record.status !== 'completed') return null;
  const kind = record.session_kind ?? 'strength';
  const minutes = Number(record.duration_min);
  if (kind === 'walk' || kind === 'mobility') return Number.isFinite(minutes) && minutes >= 90 ? 'strenuous' : 'gentle';
  if (kind === 'ep') return 'strenuous';
  if (Number.isFinite(minutes) && minutes < 25) return 'gentle';
  return 'strenuous';
}

/** Hours of work → light / moderate / heavy (null when unknown). */
export function workBand(hours) {
  if (!Number.isFinite(hours)) return null;
  if (hours >= READINESS.workHours.heavy) return 'heavy';
  if (hours >= READINESS.workHours.moderate) return 'moderate';
  return 'light';
}

/**
 * Everything the model may use for `date`, as known at `issuedLocal`.
 * events: Life calendar events ({ record, body }).
 * Returns domain evidence with provenance; nothing is invented for what is missing.
 */
export function collectEvidence(events, { date, issuedLocal }) {
  const yesterday = addDays(date, -1);
  const known = (events ?? []).filter(e => {
    const at = availableAt(e?.record);
    return at != null && (!issuedLocal || at <= issuedLocal);
  });
  const on = (d, type) => known.filter(e => e.record.date === d && e.record.type === type);

  // Sleep: the night that ended this morning is dated today.
  const sleepRec = on(date, 'sleep').at(-1)?.record ?? null;
  let sleep = null;
  if (sleepRec) {
    const quality = Number.isFinite(sleepRec.quality) ? clamp(sleepRec.quality * 10) : null;
    const duration = durationAnchor(sleepRec.duration_h);
    const values = [quality, duration].filter(v => v != null);
    // Quality and duration are one domain: seven hours does not cancel poor quality.
    if (values.length) sleep = { value: Math.min(...values), source: 'sleep_record' };
  }

  // Yesterday's diaries: prior-day state, not today's.
  const diaries = [...on(yesterday, 'diary'), ...on(date, 'diary')];
  const energies = diaries.map(d => READINESS.diaryEnergy[d.record.energy]).filter(Number.isFinite);
  const moods = diaries.map(d => d.record.mood_score).filter(Number.isFinite);
  // One episode, one count: the same symptom across diaries / days is named once.
  const recentDiaries = [...on(addDays(date, -2), 'diary'), ...diaries];
  const symptoms = [...new Set(recentDiaries.flatMap(d => symptomsIn(d.record, d.body)))];

  const workouts = [...on(yesterday, 'workout'), ...on(date, 'workout')];
  const loads = workouts.map(w => exerciseLoad(w.record)).filter(Boolean);
  const exercise = loads.includes('strenuous') ? 'strenuous' : loads.includes('gentle') ? 'gentle' : null;

  return {
    date,
    issuedLocal: issuedLocal ?? null,
    sleep,
    priorEnergy: energies.length ? Math.min(...energies) : null,
    priorMood: moods.length ? clamp(Math.min(...moods) * 10) : null,
    symptoms,
    exercise,
    sleepAnsweredDaysAgo: null
  };
}

/**
 * History fallback H. history: [{ date, score }] for days before `date`.
 * Uses whatever exists across week boundaries; falls back to the baseline.
 */
export function historyPrior(history, date) {
  const prior = (history ?? []).filter(h => h.date < date && Number.isFinite(h.score)).sort((a, b) => (a.date < b.date ? -1 : 1));
  const { yesterday, week, baseline } = READINESS.history;
  if (!prior.length) return { value: READINESS.baseline, yesterday: null, weekMean: null, days: 0 };
  const lastWeek = prior.filter(h => h.date >= addDays(date, -7));
  const last = prior.at(-1);
  const recent = last.date >= addDays(date, -3) ? last.score : null;
  const weekMean = lastWeek.length ? lastWeek.reduce((s, h) => s + h.score, 0) / lastWeek.length : null;
  const y = recent ?? weekMean ?? READINESS.baseline;
  const w = weekMean ?? y;
  return { value: round(yesterday * y + week * w + baseline * READINESS.baseline), yesterday: recent, weekMean, days: prior.length };
}

/* ======================================================================== Score */

/**
 * Readiness for one day.
 * @param {object} p
 * @param {object} p.evidence from collectEvidence (or a hand-built equivalent in tests)
 * @param {Array<{date:string,score:number}>} [p.history]
 * @param {object} [p.answers] latest morning answers by domain: { sleep, energy, focus, mood, symptoms, lingering, overall }
 * @param {number|null} [p.priorWorkHours] yesterday's actual (or, failing that, scheduled) work hours
 * @param {'actual'|'scheduled'|null} [p.priorWorkSource]
 * @param {number} [p.sleepStaleDays] days since sleep was last answered or recorded
 */
export function computeReadiness({
  evidence,
  history = [],
  answers = {},
  priorWorkHours = null,
  priorWorkSource = null,
  sleepStaleDays = 0
} = {}) {
  const ev = evidence ?? {};
  const H = historyPrior(history, ev.date ?? '9999-12-31');
  const a = name => answerFor(name, answers?.[name]);
  const sources = {};
  const missing = [];

  const pick = (name, answered, fallback, fallbackSource) => {
    if (answered != null) { sources[name] = 'check-in'; return answered; }
    if (fallback != null) { sources[name] = fallbackSource; return fallback; }
    sources[name] = 'history';
    missing.push(name);
    return H.value;
  };

  // Prior-day diary state informs today only partially: blend toward history.
  const priorBlend = v => (v == null ? null : round(0.6 * v + 0.4 * H.value));
  const energy = pick('energy', a('energy')?.anchor, priorBlend(ev.priorEnergy), 'yesterday’s diary');
  const focus = pick('focus', a('focus')?.anchor, null, null);
  const mood = pick('mood', a('mood')?.anchor, priorBlend(ev.priorMood), 'yesterday’s diary');

  // Health: an answered trend beats diary symptoms; no symptom evidence = no limitation.
  let health;
  if (a('symptoms')) { health = a('symptoms').anchor; sources.health = 'check-in'; }
  else if (ev.symptoms?.length) {
    health = ev.symptoms.length > 1 ? 45 : 65;
    sources.health = 'recent diary';
  } else { health = 100; sources.health = 'no symptoms logged'; }

  // Sleep: answer > record > history. Missing never implies poor.
  const sleepAnswer = a('sleep');
  let sleep;
  let sleepKnown = true;
  if (sleepAnswer) { sleep = sleepAnswer.anchor; sources.sleep = 'check-in'; }
  else if (ev.sleep) { sleep = ev.sleep.value; sources.sleep = 'sleep record'; }
  else { sleep = H.value; sleepKnown = false; sources.sleep = 'unconfirmed'; missing.push('sleep'); }

  const w = READINESS.weights;
  const base = w.energy * energy + w.focus * focus + w.mood * mood + w.health * health + w.sleep * sleep;

  const R = !sleepKnown ? READINESS.recovery.missing
    : sleep >= 85 ? READINESS.recovery.restorative
      : sleep >= 60 ? READINESS.recovery.adequate
        : READINESS.recovery.poor;
  const linger = a('lingering');
  const work = workBand(priorWorkHours);
  const exercise = ev.exercise ?? null;
  const workCost = (work ? READINESS.workCost[work] : 0) * R * (linger?.work ?? 1);
  const exerciseCost = (exercise ? READINESS.exerciseCost[exercise] : 0) * R * (linger?.exercise ?? 1);
  const interaction = sleepKnown && sleep < 60 && work === 'heavy' ? READINESS.poorSleepHeavyWork : 0;

  const modelled = clamp(base - workCost - exerciseCost - interaction);
  const overall = a('overall');
  const score = round(overall ? READINESS.reportedWeight * overall.anchor + (1 - READINESS.reportedWeight) * modelled : modelled);

  // Uncertainty: missing domains and stale sleep widen the band; an overall answer narrows it.
  const sp = READINESS.spread;
  const missingWeight = missing.reduce((s, name) => s + (w[name] ?? 0), 0) + (work == null ? 0.05 : 0);
  let spread = sp.base + missingWeight * sp.perMissingWeight;
  if (!sleepKnown) spread += Math.min(sp.staleCap, sp.perStaleDay * Math.max(1, sleepStaleDays));
  if (overall) spread *= sp.answeredOverall;
  spread = round(Math.max(sp.base, spread));

  // A domain only shapes the weather when something real speaks to it.
  // Sleep speaks to body and mind only when it was poor; "okay" sleep is not a limitation.
  const poorSleep = sleepKnown && sleep < 60;
  const known = {
    physical: sources.energy !== 'history' || poorSleep || sources.health !== 'no symptoms logged' || Boolean(workCost) || Boolean(exerciseCost),
    cognitive: sources.focus !== 'history' || poorSleep,
    emotional: sources.mood !== 'history'
  };
  const physical = round(clamp((energy + health + sleep) / 3 - exerciseCost - workCost * 0.5 - interaction));
  const cognitive = round(clamp(0.6 * focus + 0.4 * sleep - workCost * 0.5 - interaction));
  const emotional = round(clamp(mood));

  const contributors = [
    { id: 'sleep', label: sleepLabel(sleepAnswer, sleep, sleepKnown), effect: round(w.sleep * (sleep - 100)), source: sources.sleep },
    { id: 'energy', label: domainLabel('Energy', energy), effect: round(w.energy * (energy - 100)), source: sources.energy },
    { id: 'focus', label: domainLabel('Focus', focus), effect: round(w.focus * (focus - 100)), source: sources.focus },
    { id: 'mood', label: domainLabel('Mood', mood), effect: round(w.mood * (mood - 100)), source: sources.mood },
    { id: 'health', label: ev.symptoms?.length && !a('symptoms') ? `Recent ${ev.symptoms.slice(0, 2).join(', ')}` : domainLabel('Health', health), effect: round(w.health * (health - 100)), source: sources.health }
  ];
  if (workCost) contributors.push({ id: 'work', label: `Yesterday’s ${work} workload${priorWorkSource === 'scheduled' ? ' (as scheduled)' : ''}`, effect: -round(workCost), source: priorWorkSource ?? 'calendar' });
  if (exerciseCost) contributors.push({ id: 'exercise', label: 'Recent strenuous exercise', effect: -round(exerciseCost), source: 'fitness log' });
  if (interaction) contributors.push({ id: 'interaction', label: 'Poor sleep on top of a heavy day', effect: -interaction, source: 'model' });

  return {
    modelVersion: MODEL_VERSION,
    score,
    modelled: round(modelled),
    low: clamp(score - spread),
    high: clamp(score + spread),
    spread,
    reported: overall?.anchor ?? null,
    domains: { physical, cognitive, emotional },
    known,
    reportedLabel: overall?.label ?? null,
    inputs: { energy: round(energy), focus: round(focus), mood: round(mood), health: round(health), sleep: round(sleep), history: H.value },
    sources,
    missing,
    sleepKnown,
    work,
    exercise,
    residualFatigue: Boolean(sleepAnswer?.residual) || answers?.lingering === 'soreness' || answers?.lingering === 'mental' || answers?.lingering === 'both',
    trend: H.yesterday == null || missing.length >= 3 ? 'steady' : score > H.yesterday + 8 ? 'improving' : score < H.yesterday - 8 ? 'declining' : 'steady',
    contributors: contributors.filter(c => c.effect !== 0 || c.source === 'check-in').sort((x, y) => x.effect - y.effect)
  };
}

function domainLabel(name, value) {
  if (value >= 90) return `${name} strong`;
  if (value >= 70) return `${name} okay`;
  if (value >= 45) return `${name} reduced`;
  return `${name} low`;
}

function sleepLabel(answer, value, known) {
  if (!known) return 'Last night’s sleep unconfirmed';
  if (answer) return `Sleep: ${answer.label.toLowerCase()}`;
  return value >= 85 ? 'Sleep restorative' : value >= 60 ? 'Sleep adequate' : 'Sleep poor';
}

/* ======================================================================== Explanation */

/**
 * "What and why" under the headline. Never just a weather label.
 * e.g. "Energy is improving, but yesterday’s heavy workload may still limit recovery.
 * Last night’s sleep is unconfirmed."
 */
export function explainReadiness(r, { lift = null } = {}) {
  const parts = [];
  // Unanswered domains sit at the history fallback: unknown, not a drag.
  const drags = r.contributors.filter(c => c.effect <= -3 && c.source !== 'history' && c.source !== 'unconfirmed').slice(0, 2);
  const positive = r.score >= 90 && !drags.length;
  if (positive) parts.push('Rested, clear and steady — plenty in the tank for demanding work.');
  else if (r.reportedLabel) {
    const why = drags.map(c => phrase(c)).filter(Boolean);
    const said = `You’re starting with ${r.reportedLabel.toLowerCase()}`;
    parts.push(why.length ? `${said}; ${joinAnd(why)}.` : `${said}.`);
  } else {
    const lead = r.trend === 'improving' ? 'Capacity is improving' : r.trend === 'declining' ? 'Capacity is down on recent days' : r.score >= 80 ? 'Good capacity overall' : r.score >= 60 ? 'Reasonable capacity' : r.score >= 45 ? 'Capacity is reduced' : 'Capacity is low';
    const why = drags.map(c => phrase(c)).filter(Boolean);
    parts.push(why.length ? `${lead}: ${joinAnd(why)}.` : `${lead}.`);
  }
  if (r.residualFatigue && r.score >= 50) parts.push('Better than before, but some tiredness is lingering.');
  if (lift) parts.push(lift);
  if (!r.sleepKnown) parts.push('Last night’s sleep is unconfirmed.');
  else if (r.missing.length >= 2) parts.push(`No answer yet for ${joinAnd(r.missing.filter(m => m !== 'sleep'))}; using recent days.`);
  return parts.join(' ');
}

function phrase(c) {
  switch (c.id) {
    case 'work': return `${c.label.charAt(0).toLowerCase()}${c.label.slice(1)} may still limit recovery`;
    case 'exercise': return 'recent hard training is still being absorbed';
    case 'interaction': return 'poor sleep is compounding a heavy day';
    case 'sleep': return c.source === 'unconfirmed' ? null : c.effect >= -8 ? 'sleep was only okay' : 'sleep was poor';
    case 'health': return c.source === 'recent diary' ? `${c.label.replace(/^Recent /, '')} logged recently` : 'symptoms are still around';
    case 'energy': return 'energy is down';
    case 'focus': return 'focus is not at its best';
    case 'mood': return 'mood is lower';
    default: return c.label.toLowerCase();
  }
}

function joinAnd(list) {
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
}

/* ======================================================================== Weather states */

/** The 30 supplied states (docs/capacity-forecast-handoff/weather-states.md). Numbers are fixed. */
export const WEATHER_STATES = Object.freeze({
  1: { name: 'Clear skies', meaning: 'Full capacity; rested, focused, emotionally settled.', family: 'clear' },
  2: { name: 'Brilliant sunshine', meaning: 'High energy and strong motivation for demanding work.', family: 'clear' },
  3: { name: 'Morning sunshine', meaning: 'A strong start, with capacity likely to ease later.', family: 'clear' },
  4: { name: 'Afternoon sunshine', meaning: 'A slower morning, with better capacity expected later.', family: 'clear' },
  5: { name: 'Sunny intervals', meaning: 'Useful bursts of capacity between more tiring stretches.', family: 'clear' },
  6: { name: 'Sun through cloud', meaning: 'Good capacity, with a specific limitation still present.', family: 'clear' },
  7: { name: 'Warm front approaching', meaning: 'An anticipated event may lift mood and engagement.', family: 'clear' },
  8: { name: 'Gentle breeze', meaning: 'Steady, comfortable capacity for an ordinary day.', family: 'steady' },
  9: { name: 'Building breeze', meaning: 'Energy or focus is gradually picking up.', family: 'steady' },
  10: { name: 'Gusty conditions', meaning: 'Interruptions are likely to fragment usable focus.', family: 'wind' },
  11: { name: 'Strong headwind', meaning: 'Tasks may require more effort than usual.', family: 'wind' },
  12: { name: 'Crosswinds', meaning: 'Competing demands may pull attention in different directions.', family: 'wind' },
  13: { name: 'High cloud', meaning: 'Mild background tiredness; plenty of usable capacity remains.', family: 'cloud' },
  14: { name: 'Increasing cloud', meaning: 'Capacity is expected to decline as demands accumulate.', family: 'cloud' },
  15: { name: 'Overcast', meaning: 'Sustained low energy, without sharp changes expected.', family: 'cloud' },
  16: { name: 'Heavy cloud', meaning: 'Significant fatigue limits what feels manageable.', family: 'cloud' },
  17: { name: 'Low cloud', meaning: 'Sluggishness makes getting started harder.', family: 'cloud' },
  18: { name: 'Morning mist', meaning: 'Initial grogginess may clear as the morning progresses.', family: 'fog' },
  19: { name: 'Patchy fog', meaning: 'Concentration comes and goes.', family: 'fog' },
  20: { name: 'Dense fog', meaning: 'Mental clarity is substantially reduced.', family: 'fog' },
  21: { name: 'Fog lifting', meaning: 'Focus is improving after an earlier difficult stretch.', family: 'fog' },
  22: { name: 'Light drizzle', meaning: 'Mild emotional strain adds friction to the day.', family: 'rain' },
  23: { name: 'Passing showers', meaning: 'Brief dips are expected, with recovery between them.', family: 'rain' },
  24: { name: 'Persistent rain', meaning: 'Emotional strain is likely to remain through the forecast period.', family: 'rain' },
  25: { name: 'Squally showers', meaning: 'Energy, mood, or focus may fluctuate sharply.', family: 'rain' },
  26: { name: 'Storm building', meaning: 'Several demands are converging; a substantial dip is expected.', family: 'storm' },
  27: { name: 'Thunderstorm', meaning: 'Overload or distress currently limits usable capacity.', family: 'storm' },
  28: { name: 'Storm easing', meaning: 'The worst strain is passing, but recovery is incomplete.', family: 'recovery' },
  29: { name: 'Cloud breaking', meaning: 'Rest or reduced demand is beginning to restore capacity.', family: 'recovery' },
  30: { name: 'Calm evening', meaning: 'Demands are settling; capacity suits a gentler wind-down.', family: 'evening' }
});

/**
 * Pick a state from domain pattern and trajectory — not from score brackets.
 * ctx: { score, domains, delta (change over the window ahead, points), demandAhead (points),
 *        fragments (separate commitments in the window), evening, morning, prevState,
 *        energised, lift, recoveryOpportunity, spread }
 */
export function weatherState(ctx) {
  const { score, domains = {}, delta = 0, demandAhead = 0, fragments = 0, evening = false, morning = false, prevState = null, energised = false, lift = false, recoveryOpportunity = false } = ctx;
  // Unknown domains are left out: they never make fog, rain or cloud on their own.
  const known = ctx.known ?? { physical: true, cognitive: true, emotional: true };
  const val = name => (known[name] && Number.isFinite(domains[name]) ? domains[name] : null);
  const physical = val('physical');
  const cognitive = val('cognitive');
  const emotional = val('emotional');
  const values = [physical, cognitive, emotional].filter(v => v != null);
  const lowest = values.length ? Math.min(...values) : score;
  const spread = values.length > 1 ? Math.max(...values) - lowest : 0;
  const isLowest = v => v != null && v === lowest;
  const wasStorm = prevState === 26 || prevState === 27;
  const wasFog = prevState === 18 || prevState === 19 || prevState === 20;

  // Overload only with evidence of demand or strain, never from a low number alone.
  if (score < 35 && (demandAhead >= 12 || (emotional != null && emotional <= 35))) return 27;
  if (wasStorm && delta > 0) return 28;
  if (demandAhead >= 14 && delta <= -15) return 26;
  if (evening && score >= 35 && demandAhead < 4) return 30;

  if (cognitive != null && cognitive <= 40 && isLowest(cognitive)) return morning && delta > 6 ? 18 : 20;
  if (wasFog && delta > 4 && (cognitive == null || cognitive > 40)) return 21;
  if (cognitive != null && cognitive <= 58 && isLowest(cognitive) && spread >= 12) return morning && delta > 6 ? 18 : 19;

  if (emotional != null && emotional <= 35 && isLowest(emotional)) return 24;
  if (spread >= 40) return 25;
  if (emotional != null && emotional <= 55 && isLowest(emotional)) return delta > 4 ? 23 : 22;

  if (physical != null && physical <= 35) return 16;
  if (physical != null && physical <= 55 && isLowest(physical)) return morning && delta > 6 ? 17 : 15;

  if (recoveryOpportunity && delta >= 6 && score < 75) return 29;
  if (fragments >= 4) return 10;
  if (demandAhead >= 10 && score >= 55) return score >= 70 ? 12 : 11;
  if (delta <= -12) return score >= 80 ? 3 : 14;
  if (lift && score >= 55) return 7;

  if (score >= 92 && lowest >= 85) return energised ? 2 : 1;
  if (score >= 80) {
    if (delta >= 10) return 4;
    if (lowest < 75) return 6;
    return energised ? 2 : 1;
  }
  if (score >= 62) {
    if (morning && delta >= 10) return 4;
    if (lowest < 60) return 13;
    return delta >= 6 ? 9 : 8;
  }
  if (delta >= 8) return 9;
  if (score < 35) return 16;
  if (score < 50) return 15;
  return 13;
}

/* ======================================================================== Hourly projection */

/** Demand per hour by item kind (points of readiness). Free time is opportunity, not proof. */
export const DEMAND = Object.freeze({
  // Calendar chip kinds (tideline-model eventKind). Teaching is routine but real work.
  professional: 4, meeting: 4, event: 3, task: 3, study: 3, work: 3, teaching: 2.5,
  comm: 1.5, fitness: 2, health: 1.5, social: 1, family: 1, default: 2
});
const RECOVERY_PER_FREE_HOUR = 1.5;

function demandRate(item) {
  if (item.isClass) return DEMAND.teaching;
  if (item.kind === 'corey' || item.kind === 'log' || item.protected) return 0;
  return DEMAND[item.kind] ?? DEMAND.default;
}

/**
 * Project today forward through the waking day.
 * items: today's commitments [{ start, end, kind, isClass?, protected?, title? }] (hours).
 * Returns points every 30 min with score, band and demand, plus segments with weather.
 * Morning sleep inertia is applied only when sleep and focus are both poor (fog that
 * lifts); there are no lunch/tea bumps and no title-based spikes.
 */
export function projectDay(r, { items = [], wake = 6.5, lightsOut = 22.5, nowHour = wake, lifts = [] } = {}) {
  const step = 0.5;
  const start = Math.min(wake, Math.floor(nowHour * 2) / 2);
  const committed = (items ?? []).filter(i => Number.isFinite(i.start) && Number.isFinite(i.end) && i.end > i.start && !i.ghost);
  const busyAt = h => committed.filter(i => i.start < h + step && i.end > h);
  // Grogginess only from real evidence: known poor sleep and a foggy focus answer.
  const inertia = r.sleepKnown && r.sources?.focus === 'check-in' && r.inputs.sleep < 55 && r.inputs.focus < 55 ? 10 : 0;
  const points = [];
  let accumulated = 0;
  let recovered = 0;
  for (let h = start; h <= lightsOut + 1e-9; h += step) {
    const busy = busyAt(h);
    const rate = busy.reduce((s, i) => s + demandRate(i), 0);
    accumulated += rate * step;
    if (!busy.length && h > wake + 1) recovered = Math.min(accumulated * 0.5, recovered + RECOVERY_PER_FREE_HOUR * step);
    const fog = inertia ? inertia * Math.max(0, 1 - (h - wake) / 2.5) : 0;
    const lift = lifts.find(l => h >= l.start && h < l.end) ? 3 : 0;
    const value = clamp(r.score - accumulated + recovered - fog + lift);
    const ahead = Math.max(0, h - nowHour);
    const spread = r.spread + READINESS.spread.perHourAhead * Math.sqrt(ahead);
    points.push({ h: Number(h.toFixed(2)), score: round(value), low: round(clamp(value - spread)), high: round(clamp(value + spread)), demand: rate, busy: busy.length, fog: round(fog), lift: Boolean(lift), recovering: !busy.length && h > wake + 1 && recovered > 0 });
  }
  return { points, segments: segmentDay(r, points, { committed, lifts, wake }) };
}

/** Group the day into ~2–3 h windows; a new weather icon only where the state changes. */
function segmentDay(r, points, { committed, lifts, wake }) {
  const windows = [[wake, 10], [10, 13], [13, 16], [16, 19], [19, 23]];
  const out = [];
  let prev = null;
  for (const [from, to] of windows) {
    const inside = points.filter(p => p.h >= from && p.h < to);
    if (!inside.length) continue;
    const first = inside[0].score;
    const last = inside.at(-1).score;
    const mean = round(inside.reduce((s, p) => s + p.score, 0) / inside.length);
    const demandAhead = inside.reduce((s, p) => s + p.demand * 0.5, 0);
    const fragments = committed.filter(i => i.start >= from && i.start < to && (i.end - i.start) <= 1).length;
    const scale = mean / Math.max(1, r.score);
    const fogLift = inside[0].fog - inside.at(-1).fog;
    const state = weatherState({
      score: mean,
      domains: {
        physical: round(r.domains.physical * scale),
        cognitive: round(clamp(r.domains.cognitive * scale - inside[0].fog)),
        emotional: round(clamp(r.domains.emotional + (inside.some(p => p.lift) ? 5 : 0)))
      },
      delta: last - first + fogLift,
      demandAhead,
      fragments,
      evening: from >= 19,
      morning: from < 10,
      prevState: prev,
      known: r.known,
      energised: r.inputs.energy >= 95,
      lift: lifts.some(l => l.start >= from && l.start < to),
      recoveryOpportunity: inside.some(p => p.recovering)
    });
    out.push({ from, to, score: mean, state, changed: state !== prev });
    prev = state;
  }
  return out;
}

/** Headline state for the whole day from the morning window and what follows. */
export function dayState(r, projection) {
  const segs = projection?.segments ?? [];
  if (!segs.length) return weatherState({ score: r.score, domains: r.domains, known: r.known });
  const first = segs[0];
  const later = segs.slice(1, -1);
  const laterMean = later.length ? later.reduce((s, x) => s + x.score, 0) / later.length : first.score;
  return weatherState({
    score: r.score,
    domains: r.domains,
    delta: round(laterMean - first.score),
    demandAhead: projection.points.reduce((s, p) => s + p.demand * 0.5, 0) / Math.max(1, segs.length),
    morning: true,
    known: r.known,
    energised: r.inputs.energy >= 95
  });
}

/* ======================================================================== Discrepancy + snapshot */

/**
 * Should we ask "What did we miss?" Compare the reported overall anchor against the
 * prediction issued BEFORE the answer, same day and target. Coarse bubbles (20-point
 * anchors) mean a 10-point gap only counts when it clears half the anchor resolution
 * or sits outside the issued band.
 */
export function discrepancy({ predicted, predictedRange, reported, threshold = READINESS.discrepancyThreshold }) {
  if (!Number.isFinite(predicted) || !Number.isFinite(reported)) return { residual: null, ask: false };
  const residual = round(reported - predicted);
  const outsideBand = Array.isArray(predictedRange) && (reported < predictedRange[0] || reported > predictedRange[1]);
  const ask = Math.abs(residual) >= threshold && (outsideBand || Math.abs(residual) >= threshold + 10);
  return { residual, ask, direction: residual > 0 ? 'better' : residual < 0 ? 'worse' : 'same' };
}

/** Immutable forecast snapshot body (the server assigns id and issued_at). */
export function snapshotBody(r, { date, target = 'morning', state, explanation, features } = {}) {
  return {
    date,
    target,
    model_version: r.modelVersion,
    predicted_estimate: r.score,
    predicted_range: [r.low, r.high],
    domains: r.domains,
    inputs: r.inputs,
    sources: r.sources,
    missing: r.missing,
    state: state ?? null,
    explanation: explanation ?? null,
    features: features ?? null
  };
}

/** Score for an answered overall readiness bubble, for history. */
export function reportedEstimate(answers) {
  return answerFor('overall', answers?.overall)?.anchor ?? null;
}
