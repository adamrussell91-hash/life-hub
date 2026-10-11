import { addCalendarDays, isCalendarDate, sydneyLocalStamp } from './time.js';
import { isDeletedRecord } from '../../../../packages/design-kit/js/record-liveness.js';

export const CREATINE_MODEL_VERSION = 'adherence-range-v1';
export const CREATINE_TARGET = 0.9;
const DAY = 86400000;
const clamp = value => Math.max(0, Math.min(1, value));
const validGrams = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
const defaultPlan = { mode: 'loading', daily_g: 5, maintenance_g: 5 };

/** Relative supplemental loading, not grams in muscle or a measured saturation.
 * Rates bracket population loading (~4 weeks at 3–5g; ~5–7 days at 20g)
 * and washout (~4–6 weeks). Dose release over 24h is ONLY a display/model
 * smoothing assumption, never an absorption or muscle-availability deadline.
 */
function advance(level, grams, fraction = 1) {
  // The gradual 3–5 g route shares the population ~4-week envelope.
  // Above 5 g the coarse rapid-loading branch approaches four daily units.
  const loadingUnits = Math.min(grams <= 5 * fraction ? grams / 3 : grams / 5, grams <= 5 * fraction ? fraction : 4 * fraction);
  const deficit = Math.max(0, fraction - grams / 3);
  return {
    low: clamp(level.low + loadingUnits / 35 - deficit / 28),
    high: clamp(level.high + loadingUnits / 21 - deficit / 42)
  };
}
const middle = level => (level.low + level.high) / 2;
const midnight = date => Date.parse(sydneyLocalStamp(date, '00:00'));

function uniqueRecords(events) {
  const records = new Map();
  for (const [index, event] of (events ?? []).entries()) {
    const record = event.record ?? event;
    // Path is the persisted identity: correction may replace the generated id.
    const key = event.path ?? record.id ?? `${record.type}:${record.date}:${record.dose_key ?? index}`;
    records.set(key, record);
  }
  return [...records.values()].filter(record => !isDeletedRecord(record));
}

export function buildCreatineModel({ events = [], date, now = new Date(), history = null, freshness = null } = {}) {
  if (!isCalendarDate(date)) throw new RangeError('Creatine display date is unavailable');
  const records = uniqueRecords(events).filter(record => isCalendarDate(record.date) && record.date <= date);
  const start = addCalendarDays(date, -90);
  const dayEnd = midnight(addCalendarDays(date, 1));
  const clock = Math.min(dayEnd, Math.max(midnight(date), new Date(now).getTime() || dayEnd));
  const plans = records.filter(record => record.type === 'creatine_plan')
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.updated_at ?? '').localeCompare(String(b.updated_at ?? '')));
  const planFor = day => plans.filter(plan => plan.date <= day).at(-1) ?? defaultPlan;
  const doses = records.flatMap(record => {
    const grams = record.type === 'meal' ? record.creatine_g : record.type === 'creatine' ? record.grams : null;
    if (!validGrams(grams) || grams === 0 || record.date < addCalendarDays(start, -1)) return [];
    const time = record.creatine_time ?? record.time;
    const timeKnown = typeof time === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time);
    const at = Date.parse(sydneyLocalStamp(record.date, timeKnown ? time : '12:00'));
    if (at > clock) return [];
    return [{ grams, date: record.date, at, timeKnown, time: timeKnown ? time : null,
      recordType: record.type, meal: record.meal ?? null, recordId: record.id ?? null,
      savedAt: record.updated_at ?? record.created_at ?? null,
      product: record.creatine_product ?? record.product ?? null }];
  }).sort((a, b) => a.at - b.at);
  const released = (dose, at) => clamp((at - dose.at) / DAY) * dose.grams;
  const gramsBetween = (from, to) => doses.reduce((sum, dose) => sum + released(dose, to) - released(dose, from), 0);
  let level = { low: 0, high: 0 }, everLoaded = false;
  const trace = [];
  // Explicit baseline seeds belong to their reported date, not to the time the
  // plan was written. Once 90 days have passed, washout has erased that seed.
  const baselines = plans.filter(plan => typeof plan.baseline === 'number' && plan.baseline >= 0 && plan.baseline <= 1)
    .map(plan => ({date: plan.baseline_date ?? plan.date, value: plan.baseline}));
  for (let day = start; day <= date; day = addCalendarDays(day, 1)) {
    const baseline = baselines.filter(item => item.date === day).at(-1);
    if (baseline) level = { low: baseline.value, high: baseline.value };
    const from = midnight(day), to = day === date ? clock : midnight(addCalendarDays(day, 1));
    level = advance(level, gramsBetween(from, to), (to - from) / DAY);
    everLoaded ||= level.low >= CREATINE_TARGET;
    if (day >= addCalendarDays(date, -6)) trace.push({ date: day, ...level, value: middle(level) });
  }
  const plan = planFor(date);
  const confidence = history?.loading || history?.error || freshness === 'fallback' ? 'incomplete' : 'estimated';
  const inTarget = level.low >= CREATINE_TARGET;
  const dailyGrams = plan.mode === 'paused' ? 0 : inTarget || plan.mode === 'maintenance' ? plan.maintenance_g : plan.daily_g;
  const pendingGrams = doses.reduce((sum, dose) => sum + dose.grams - released(dose, clock), 0);
  const units = Math.min(pendingGrams <= 5 ? pendingGrams / 3 : pendingGrams / 5, pendingGrams <= 5 ? 1 : 4);
  const pendingLevel = {low:clamp(level.low + units / 35), high:clamp(level.high + units / 21)};
  const forecast = [{ days: 0, ...level, value: middle(level) }];
  let projected = pendingLevel;
  let earliest = level.high >= CREATINE_TARGET ? 0 : null, latest = inTarget ? 0 : null;
  for (let days = 1; days <= 60; days += 1) {
    const intake = plan.mode === 'paused' ? 0 : projected.low >= CREATINE_TARGET || plan.mode === 'maintenance' ? plan.maintenance_g : plan.daily_g;
    projected = advance(projected, intake);
    forecast.push({ days, ...projected, value: middle(projected) });
    if (earliest === null && projected.high >= CREATINE_TARGET) earliest = days;
    if (latest === null && projected.low >= CREATINE_TARGET) latest = days;
    if (days >= 7 && latest !== null) break;
  }
  const eta = confidence === 'incomplete' || plan.mode === 'paused' || latest === null
    ? null : { low: earliest, high: latest };
  const todayGrams = doses.filter(dose => dose.date === date).reduce((sum, dose) => sum + dose.grams, 0);
  const phase = plan.mode === 'paused' ? 'Paused' : inTarget ? 'Maintenance' : everLoaded ? 'Rebuilding'
    : doses.length ? 'Loading' : 'Not started';
  return {
    date, asOf: new Date(clock).toISOString(), version: CREATINE_MODEL_VERSION, measured: false,
    confidence, phase, level, target: CREATINE_TARGET, inTarget, dailyGrams,
    plan, planConfirmed: plans.length > 0, todayGrams, pendingGrams,
    pendingLevel, doses, trace, forecast, eta,
    product: doses.filter(dose => dose.product).at(-1)?.product ?? null,
    intakeWeek: Array.from({ length: 7 }, (_, i) => {
      const day = addCalendarDays(date, i - 6);
      return { date: day, grams: doses.filter(dose => dose.date === day).reduce((sum, dose) => sum + dose.grams, 0) };
    })
  };
}

export function creatineEtaLabel(model) {
  if (model.confidence === 'incomplete') return 'History unavailable';
  if (model.inTarget) return 'In target zone';
  if (model.plan.mode === 'paused') return 'Paused';
  if (!model.eta) return 'No target forecast';
  const { low, high } = model.eta;
  return `≈ ${low === high ? high : `${low}–${high}`} days to target`;
}

export function creatineStatusLine(model) {
  return `${model.date} as of ${model.asOf}: ${model.phase}; ${model.todayGrams} g logged today; `
    + `${model.dailyGrams} g/day ${model.planConfirmed ? 'confirmed routine' : 'default routine, discuss plan'}; `
    + `${creatineEtaLabel(model)}. Relative supplemental loading estimate ${(model.level.low * 100).toFixed(0)}–${(model.level.high * 100).toFixed(0)}% of model range; not measured muscle saturation. `
    + `Unlogged intake = zero. ${model.version}. Recompute from intake history before giving current advice.`;
}
