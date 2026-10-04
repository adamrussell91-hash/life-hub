/**
 * Readiness model v1 — the fixed capacity formula (docs/capacity-forecast-handoff/algorithm.md).
 *
 * 100 means full capacity: everything is peaches. A normal, unremarkable day sits at 80.
 *
 * Five domains carry their own state: energy, focus, mood, health, sleep.
 * - An observed domain takes the observation (check-in answers beat diary/sleep logs for the same day).
 * - An unobserved domain carries yesterday's value and drifts back toward where the other
 *   evidence says it should be (baseline, pulled down by an active health episode or sleep debt).
 *   Unknown is never zero, never "poor", and never frozen: an old bad report fades.
 * - Each day without fresh evidence widens the uncertainty band instead of moving the score.
 * History is built only from observations and their drift, never from earlier model outputs.
 *
 * Yesterday's demand (hard training, heavy work) is a recovery cost scaled by last night's sleep.
 * When Adam answers energy and focus fresh, those answers already contain part of the cost, so the
 * cost applies at half strength rather than being counted twice.
 *
 * Coefficients are provisional until evaluated against prospective check-ins.
 */
import { symptomsInRecord } from './readiness-symptoms.js';

export const READINESS = Object.freeze({
  version: 'readiness-v1',
  normal: 80,
  floor: 5,
  ceiling: 100,
  weights: Object.freeze({ energy: 0.25, focus: 0.25, mood: 0.1, health: 0.2, sleep: 0.2 }),
  // Domain baselines: weighted they give `normal` (0.8 × 75 + 0.2 × 100 = 80).
  base: Object.freeze({ energy: 75, focus: 75, mood: 75, health: 100, sleep: 75 }),
  // Share of the gap to the drift target that closes each day without evidence.
  drift: Object.freeze({ energy: 0.5, focus: 0.5, mood: 0.5, health: 0.5, sleep: 0.5 }),
  // An unobserved focus/energy moves this share toward a same-day observation of the other.
  coMove: 0.5,
  // The weakest domain limits the day: share of the score taken from the minimum domain.
  weakest: 0.2,
  softenPct: 40,
  holidayLift: 5,
  discrepancy: 10
});

const DOMAINS = Object.keys(READINESS.weights);

/** Morning check-in answers → domain values (0–100). */
export const ANSWERS = Object.freeze({
  sleep: Object.freeze({ worse: 20, still_poor: 30, better_tired: 60, restorative: 100 }),
  energy: Object.freeze({ drained: 20, heavy: 50, normal: 80, energised: 100 }),
  focus: Object.freeze({ foggy: 30, brief: 45, distractible: 60, sharp: 100 }),
  overall: Object.freeze({ empty: 15, limited: 35, manageable: 60, strong: 85, full: 100 })
});

/** The questions the morning check-in can ask. Options keep the wording nuance in their codes. */
export const QUESTIONS = Object.freeze({
  sleep: {
    id: 'sleep', prompt: 'How was last night?',
    options: [['worse', 'Worse'], ['still_poor', 'Still poor'], ['better_tired', 'Better, still tired'], ['restorative', 'Restorative']]
  },
  health: {
    id: 'health', prompt: 'How is it today?',
    options: [['worse', 'Worse'], ['same', 'Same'], ['easing', 'Easing'], ['gone', 'Gone']]
  },
  energy: {
    id: 'energy', prompt: 'How is your energy?',
    options: [['drained', 'Drained'], ['heavy', 'Heavy but manageable'], ['normal', 'Back to normal'], ['energised', 'Energised']]
  },
  focus: {
    id: 'focus', prompt: 'How is focus?',
    options: [['foggy', 'Foggy'], ['brief', 'Can focus briefly'], ['distractible', 'Clear but distractible'], ['sharp', 'Sharp']]
  },
  lingering: {
    id: 'lingering', prompt: 'What is lingering from yesterday?',
    options: [['physical', 'Physical soreness'], ['mental', 'Mental fatigue'], ['both', 'Both'], ['recovered', 'Feeling recovered']]
  },
  overall: {
    id: 'overall', prompt: 'How ready do you feel?',
    options: [['empty', 'Running on empty'], ['limited', 'Limited reserves'], ['manageable', 'Manageable'], ['strong', 'Feeling strong'], ['full', 'Full capacity']]
  }
});

export const DISCREPANCY_REASONS = Object.freeze([
  ['sleep_worse', 'Sleep worse than expected'],
  ['work_fatigue', 'Work took more out of me'],
  ['pain_illness', 'Pain or illness'],
  ['break_helped', 'A break helped'],
  ['emotional_lift', 'Feeling emotionally lifted'],
  ['something_else', 'Something else'],
  ['not_sure', 'Not sure']
]);

const clamp = (v, lo = READINESS.floor, hi = READINESS.ceiling) => Math.min(hi, Math.max(lo, v));
const round = v => Math.round(v);

/** Sleep hours → sleep value. Seven hours or more is full; below four is very poor. */
export function sleepFromHours(hours) {
  if (!Number.isFinite(hours)) return null;
  const pts = [[4, 25], [5, 45], [6, 70], [7, 100]];
  if (hours <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [h1, v1] = pts[i];
    const [h0, v0] = pts[i - 1];
    if (hours <= h1) return v0 + ((hours - h0) / (h1 - h0)) * (v1 - v0);
  }
  return 100;
}

const ENERGY_WORD = { low: 30, medium: 70, high: 100 };

/**
 * Evidence for one day from Life events: sleep logs, diaries, workouts, work sessions, check-ins.
 * Returns { observed: {domain: value}, symptoms, costs: {workHours, training}, checkin, logged }.
 */
export function evidenceForDay(events) {
  const observed = {};
  const symptoms = new Set();
  let workMinutes = 0;
  let training = null;
  let checkin = null;
  let logged = false;
  const energies = [];
  const moods = [];
  for (const event of events ?? []) {
    const rec = event?.record;
    if (!rec) continue;
    if (rec.type === 'sleep' && Number.isFinite(rec.duration_h)) {
      observed.sleep = Math.min(observed.sleep ?? 100, sleepFromHours(rec.duration_h));
      logged = true;
    } else if (rec.type === 'diary') {
      logged = true;
      if (rec.energy in ENERGY_WORD) energies.push(ENERGY_WORD[rec.energy]);
      if (Number.isFinite(rec.mood_score)) moods.push(clamp(rec.mood_score * 10, 0, 100));
      else if (rec.mood === 'low') moods.push(30);
      for (const s of symptomsInRecord(rec, event.body)) symptoms.add(s);
    } else if (rec.type === 'workout') {
      const hard = rec.day_type === 'workout_45_60' ? 'hard' : rec.day_type === 'workout_30' ? 'moderate' : 'gentle';
      training = [training, hard].includes('hard') ? 'hard' : (training === 'moderate' || hard === 'moderate') ? 'moderate' : 'gentle';
    } else if (rec.type === 'work_session') {
      const mins = Number(rec.actual_duration ?? rec.duration_minutes ?? rec.duration);
      if (Number.isFinite(mins) && mins > 0) workMinutes += mins;
    } else if (rec.type === 'readiness_checkin' && !rec.skipped) {
      checkin = rec;
      logged = true;
    }
  }
  // The worst moment of the day is the day's truth.
  if (energies.length) observed.energy = Math.min(...energies);
  if (moods.length) observed.mood = Math.min(...moods);
  if (symptoms.size) observed.health = symptoms.size === 1 ? 65 : 35;
  return { observed, symptoms: [...symptoms], costs: { workHours: workMinutes / 60, training }, checkin, logged };
}

function emptyState() {
  const state = {};
  for (const d of DOMAINS) state[d] = { v: READINESS.base[d], age: Infinity };
  return state;
}

/** Where an unobserved domain drifts: baseline, pulled down by illness and sleep debt. */
function driftTarget(domain, state) {
  const base = READINESS.base[domain];
  if (domain === 'energy' || domain === 'focus') {
    const illness = (100 - state.health.v) * 0.5;
    const debt = domain === 'focus' ? Math.max(0, READINESS.base.sleep - state.sleep.v) * 0.3 : 0;
    return Math.max(25, base - illness - debt);
  }
  return base;
}

/** One day forward with no evidence: every domain drifts and ages. */
function carry(prev) {
  const next = {};
  for (const d of DOMAINS) {
    const { v, age } = prev[d];
    const target = driftTarget(d, prev);
    next[d] = { v: v + (target - v) * READINESS.drift[d], age: age + 1 };
  }
  return next;
}

/** Apply check-in answers to the carried state. Returns { state, overall, lingering }. */
function applyCheckin(state, answers, carriedHealth) {
  const out = { ...state };
  const a = answers ?? {};
  if (a.sleep in ANSWERS.sleep) out.sleep = { v: ANSWERS.sleep[a.sleep], age: 0 };
  if (a.energy in ANSWERS.energy) out.energy = { v: ANSWERS.energy[a.energy], age: 0 };
  if (a.focus in ANSWERS.focus) out.focus = { v: ANSWERS.focus[a.focus], age: 0 };
  if (a.health) {
    const prev = carriedHealth;
    const v = a.health === 'gone' ? 100 : a.health === 'easing' ? prev + (100 - prev) / 2 : a.health === 'worse' ? Math.max(20, prev - 20) : prev;
    out.health = { v, age: 0 };
  }
  return { state: out, overall: a.overall in ANSWERS.overall ? ANSWERS.overall[a.overall] : null, lingering: a.lingering ?? null };
}

function costsFor(yesterday, sleepNow, { freshEnergyFocus, lingering, holiday }) {
  if (!yesterday || lingering === 'recovered') return [];
  const R = sleepNow == null ? 0.7 : sleepNow >= 85 ? 0.4 : sleepNow >= 60 ? 0.7 : 1;
  const half = freshEnergyFocus ? 0.5 : 1;
  const out = [];
  const work = yesterday.workHours >= 6 ? 'heavy' : yesterday.workHours >= 3 ? 'moderate' : 'light';
  const workCost = { light: 0, moderate: 3, heavy: 8 }[work] * R * half;
  if (workCost > 0 && !holiday) out.push({ id: 'work', label: work === 'heavy' ? 'heavy day yesterday' : 'busy day yesterday', delta: -workCost });
  const trainCost = (yesterday.training === 'hard' ? 5 : yesterday.training === 'moderate' ? 2 : 0) * R * half;
  if (trainCost > 0) out.push({ id: 'training', label: "yesterday's training", delta: -trainCost });
  if (sleepNow != null && sleepNow < 60 && work === 'heavy') out.push({ id: 'interaction', label: 'short sleep after a heavy day', delta: -5 });
  if (lingering === 'physical' || lingering === 'both') out.push({ id: 'lingering_physical', label: 'physical soreness', delta: -4 });
  if (lingering === 'mental' || lingering === 'both') out.push({ id: 'lingering_mental', label: 'mental fatigue', delta: -4 });
  return out;
}

/** Score + band + contributors for one domain state. */
export function scoreState(state, costs = []) {
  const w = READINESS.weights;
  const mean = DOMAINS.reduce((sum, d) => sum + w[d] * state[d].v, 0);
  const minimum = Math.min(...DOMAINS.map(d => state[d].v));
  // Weakest link: the domain furthest below its own baseline drags a share of its gap.
  // A normal day has no gap, so it still scores 80; an all-good day still reaches 100.
  const worstGap = Math.min(0, ...DOMAINS.map(d => state[d].v - READINESS.base[d]));
  const raw = mean + READINESS.weakest * worstGap - costs.reduce((s, c) => s - c.delta, 0);
  const pct = round(clamp(raw));
  const uncertainty = DOMAINS.reduce((sum, d) => {
    const age = state[d].age;
    const u = age === 0 ? 4 : Number.isFinite(age) ? Math.min(25, 8 + 4 * age) : 14;
    return sum + w[d] * u;
  }, 0);
  const half = round(uncertainty);
  return { pct, low: round(clamp(pct - half, 0)), high: round(clamp(pct + half, 0)), mean: round(mean), minimum: round(minimum) };
}

const DOMAIN_LABEL = {
  energy: v => (v < 45 ? 'low energy' : v >= 90 ? 'good energy' : null),
  focus: v => (v < 45 ? 'foggy' : v >= 90 ? 'sharp focus' : null),
  mood: v => (v < 45 ? 'low mood' : v >= 90 ? 'good mood' : null),
  sleep: v => (v < 60 ? 'poor sleep' : v < 75 ? 'short sleep' : v >= 90 ? 'restorative sleep' : null),
  health: () => null
};

function contributors(state, symptoms, costs) {
  const w = READINESS.weights;
  const out = [];
  for (const d of DOMAINS) {
    const delta = w[d] * (state[d].v - READINESS.base[d]);
    if (d === 'health') {
      if (state.health.v < 95 && symptoms.length) out.push({ id: 'symptoms', label: symptoms.slice(0, 2).join(', '), delta, symptoms });
      else if (state.health.v < 95) out.push({ id: 'health', label: 'still recovering', delta });
      continue;
    }
    const label = DOMAIN_LABEL[d](state[d].v);
    if (label && Math.abs(delta) >= 1) out.push({ id: d, label, delta, fresh: state[d].age === 0 });
  }
  return [...out, ...costs];
}

/** The two biggest drains (symptoms and sleep first on ties), else the biggest lift, else "steady". */
export function noteFor(factors) {
  const order = { symptoms: 0, health: 1, sleep: 2, energy: 3, focus: 4, mood: 5, work: 6, training: 7, interaction: 8 };
  const name = f => (f.id === 'symptoms' && f.symptoms?.length ? f.symptoms[0] : f.label);
  const drains = factors
    .filter(f => f.delta < 0)
    .sort((a, b) => a.delta - b.delta || (order[a.id] ?? 9) - (order[b.id] ?? 9));
  if (!drains.length) {
    const lift = factors.filter(f => f.delta > 0).sort((a, b) => b.delta - a.delta)[0];
    return lift ? lift.label : 'steady';
  }
  const [main, second] = drains;
  return second ? `${name(main)}, ${name(second)}` : name(main);
}

/** Plain-language why, for the caseback and the check-in: what drives the score and what is unconfirmed. */
export function explain({ factors, state }) {
  const drains = factors.filter(f => f.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 2);
  const lifts = factors.filter(f => f.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 1);
  const parts = [];
  if (lifts.length) parts.push(`${cap(lifts[0].label)} is helping.`);
  if (drains.length) parts.push(`${cap(drains.map(d => d.label).join(' and '))} ${drains.length > 1 ? 'are' : 'is'} holding it back.`);
  if (!parts.length) parts.push('Nothing is pulling the day down.');
  const unknown = ['sleep', 'energy', 'focus'].filter(d => state[d].age !== 0);
  if (unknown.length === 3) parts.push("Today's sleep, energy and focus are unconfirmed.");
  else if (unknown.includes('sleep')) parts.push("Last night's sleep is unconfirmed.");
  return parts.join(' ');
}

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Readiness for every date in `dateKeys` (ascending YYYY-MM-DD), from events.
 * Walks from `lookbackDays` before the first date so a Monday sees Sunday.
 * Returns Map(date → result) where result is
 * { pct, low, high, note, factors, soften, forecast, state, explanation, checkin, predicted? }.
 */
export function readinessForDates(events, dateKeys, { isHoliday = () => false, lookbackDays = 10 } = {}) {
  const out = new Map();
  if (!dateKeys?.length) return out;
  const byDate = new Map();
  for (const event of events ?? []) {
    const date = event?.record?.date;
    if (typeof date !== 'string') continue;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(event);
  }
  const wanted = new Set(dateKeys);
  const first = addDays(dateKeys[0], -lookbackDays);
  const last = dateKeys[dateKeys.length - 1];
  let state = emptyState();
  let everLogged = false;
  let yesterday = null;
  let lastSymptoms = [];
  for (let date = first; date <= last; date = addDays(date, 1)) {
    const ev = evidenceForDay(byDate.get(date));
    const result = stepDay(state, ev, yesterday, { holiday: isHoliday(date), lastSymptoms });
    if (ev.symptoms.length) lastSymptoms = ev.symptoms;
    else if (result.state.health.v >= 95) lastSymptoms = [];
    everLogged = everLogged || ev.logged;
    if (wanted.has(date)) {
      out.set(date, everLogged ? result.view : { ...result.view, note: 'no logs', forecast: true });
    }
    state = result.state;
    yesterday = ev.costs;
  }
  return out;
}

/** Advance one day: carry, observe, apply the check-in, score. Exported for the check-in card. */
export function stepDay(prevState, ev, yesterday, { holiday = false, lastSymptoms = [] } = {}) {
  const carried = carry(prevState);
  // Observations from logs.
  let state = { ...carried };
  for (const [d, v] of Object.entries(ev.observed)) state[d] = { v, age: 0 };
  // Same-day co-movement: an observed energy pulls an unobserved focus, and the reverse.
  if (state.energy.age === 0 && state.focus.age !== 0) state.focus = { ...state.focus, v: state.focus.v + (state.energy.v - state.focus.v) * READINESS.coMove };
  else if (state.focus.age === 0 && state.energy.age !== 0) state.energy = { ...state.energy, v: state.energy.v + (state.focus.v - state.energy.v) * READINESS.coMove };
  const predictedState = state;
  const predictedCosts = costsFor(yesterday, state.sleep.age === 0 ? state.sleep.v : null, { freshEnergyFocus: false, holiday });
  const predicted = scoreState(predictedState, predictedCosts);

  let overall = null;
  let lingering = null;
  if (ev.checkin) {
    const applied = applyCheckin(state, ev.checkin.answers, carried.health.v);
    state = applied.state;
    overall = applied.overall;
    lingering = applied.lingering;
  }
  const fresh = ev.checkin && state.energy.age === 0 && state.focus.age === 0;
  const costs = costsFor(yesterday, state.sleep.age === 0 ? state.sleep.v : null, { freshEnergyFocus: fresh, lingering, holiday });
  let score = scoreState(state, costs);
  if (overall != null) {
    // Unasked domains move halfway toward the overall answer (it speaks for them too),
    // then the direct report dominates while evidence keeps a voice. The band tightens.
    for (const d of DOMAINS) {
      if (state[d].age !== 0) state[d] = { v: state[d].v + (overall - state[d].v) * READINESS.coMove, age: 0 };
    }
    score = scoreState(state, costs);
    const pct = round(clamp(0.7 * overall + 0.3 * score.pct));
    score = { ...score, pct, low: round(clamp(pct - 6, 0)), high: round(clamp(pct + 6, 0)) };
  }
  const forecast = !ev.logged;
  if (forecast && holiday) score = { ...score, pct: round(clamp(score.pct + READINESS.holidayLift)) };
  const symptoms = ev.symptoms.length ? ev.symptoms : (state.health.v < 95 ? lastSymptoms : []);
  const factors = contributors(state, symptoms, costs);
  const mainDrain = noteFor(factors.filter(f => f.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 1));
  const note = forecast && factors.some(f => f.delta < 0) ? `${mainDrain} lingering` : noteFor(factors);
  return {
    state,
    view: {
      pct: score.pct,
      low: score.low,
      high: score.high,
      note,
      factors,
      soften: score.pct < READINESS.softenPct,
      forecast,
      explanation: explain({ factors, state }),
      checkin: ev.checkin ?? null,
      predicted,
      version: READINESS.version
    }
  };
}

/**
 * The questions for this morning, at most three, from the state carried into today.
 * Context the hub already has (yesterday's training and work) is never asked for again.
 * `carried`: domain state before today's answers. `yesterday`: { workHours, training }.
 */
export function selectQuestions(carried, yesterday = null, { symptoms = [] } = {}) {
  const picks = [];
  if (carried.sleep.age >= 2 || carried.sleep.v < 70) picks.push(QUESTIONS.sleep);
  if (carried.health.v < 90) {
    const name = symptoms[0];
    picks.push({ ...QUESTIONS.health, prompt: name ? `How is the ${name} today?` : QUESTIONS.health.prompt });
  }
  if (carried.energy.v < 55) picks.push(QUESTIONS.energy);
  if (carried.focus.v < 55) picks.push(QUESTIONS.focus);
  if (yesterday && (yesterday.training === 'hard' || yesterday.workHours >= 6)) picks.push(QUESTIONS.lingering);
  if (picks.length < 3) picks.push(QUESTIONS.overall);
  return picks.slice(0, 3);
}

/** True when the answer lands outside the band issued before it. Coarse bubbles never trip on rounding. */
export function isDiscrepancy(predicted, finalPct) {
  if (!predicted || !Number.isFinite(finalPct)) return false;
  const outside = finalPct < predicted.low || finalPct > predicted.high;
  return outside && Math.abs(finalPct - predicted.pct) >= READINESS.discrepancy;
}

/**
 * The state carried into `date` (before any of its evidence) plus yesterday's costs and
 * recent symptoms — what the check-in card needs to choose questions and issue its prediction.
 */
export function morningContext(events, date, { lookbackDays = 10 } = {}) {
  const byDate = new Map();
  for (const event of events ?? []) {
    const d = event?.record?.date;
    if (typeof d !== 'string' || d >= date) continue;
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d).push(event);
  }
  let state = emptyState();
  let yesterday = null;
  let symptoms = [];
  for (let d = addDays(date, -lookbackDays); d < date; d = addDays(d, 1)) {
    const ev = evidenceForDay(byDate.get(d));
    state = stepDay(state, ev, yesterday, { lastSymptoms: symptoms }).state;
    if (ev.symptoms.length) symptoms = ev.symptoms;
    else if (state.health.v >= 95) symptoms = [];
    yesterday = ev.costs;
  }
  // Today's own logs so far (an overnight sleep log, say) count toward the prediction.
  const todays = (events ?? []).filter(e => e?.record?.date === date && e.record.type !== 'readiness_checkin');
  return { state, yesterday, symptoms, todays };
}

/** Preview the result for `date` with these answers (null answers = the prediction). */
export function previewCheckin(context, answers = null) {
  const ev = evidenceForDay(context.todays);
  if (answers) {
    ev.checkin = { type: 'readiness_checkin', answers };
    ev.logged = true;
  }
  return stepDay(context.state, ev, context.yesterday, { lastSymptoms: context.symptoms }).view;
}

function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
