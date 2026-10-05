/**
 * Readiness insights: patterns between daily capacity and the rest of Adam's life,
 * for the agents to OFFER — never to blurt. Adam decides whether he wants to hear one.
 *
 * Pure and deterministic (no AI). Capacity comes from capacityForDates, so an insight
 * always talks about the same number the calendar shows.
 *
 * Guardrails (agreed with Adam, Oct 2026):
 * - Enough evidence first: minimum day counts and a comparison with his normal rate.
 * - Patterns, never causes: "on your low days … compared with …", never "X causes Y".
 * - No food shaming: food findings are framed around energy, never willpower.
 * - Deleted check-ins never count ("Not sure" reasons stay unexplained; they are not used).
 * Each insight carries `topic` (what an agent may say when offering) separately from
 * `finding` (what it may say only after Adam says yes).
 */
import { capacityForDates } from './capacity-model.js';
import { addDays, CHECKIN_TYPE, checkinsByDate } from './readiness-model.js';

export const INSIGHT_WINDOW_DAYS = 42;
const MIN_LOW_DAYS = 5;
const MIN_HITS = 3;
const MIN_GAP = 0.25; // low-day rate must beat the other-day rate by 25 points

const TAKEAWAY = /\b(burger|cheeseburger|maccas|mcdonald'?s|kfc|hungry jack'?s|pizza|takeaway|take-away|uber ?eats|doordash|menulog|fries|chips|kebab|fried chicken|nuggets|drive[- ]?thru)\b/i;

const pct = n => `${Math.round(n * 100)}%`;
const text = e => `${e?.record?.title ?? ''} ${e?.record?.notes ?? ''} ${e?.body ?? ''}`;

/** Days in [from, to]. */
function range(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Low days: Adam's own bottom third, and below his median (so a flat month has none). */
function splitDays(cap, dates) {
  const computed = dates.map(d => ({ d, row: cap.get(d) })).filter(x => x.row && !x.row.forecast);
  const sorted = [...computed].sort((a, b) => a.row.pct - b.row.pct);
  const cut = sorted[Math.floor(sorted.length / 3)]?.row.pct ?? 0;
  const median = sorted[Math.floor(sorted.length / 2)]?.row.pct ?? 0;
  const low = computed.filter(x => x.row.pct <= cut && x.row.pct < median).map(x => x.d);
  const other = computed.filter(x => !low.includes(x.d)).map(x => x.d);
  return { low, other, computed: computed.map(x => x.d) };
}

function rate(days, test) {
  if (!days.length) return 0;
  return days.filter(test).length / days.length;
}

/* -------------------------------------------------------------- individual finders */

function foodOnLowDays({ byDate, low, other }) {
  if (low.length < MIN_LOW_DAYS || other.length < MIN_LOW_DAYS) return null;
  const meals = d => (byDate.get(d) ?? []).filter(e => e.record.type === 'meal');
  const features = [
    { key: 'takeaway', label: 'a takeaway or fast-food meal', test: d => meals(d).some(e => TAKEAWAY.test(text(e))) },
    { key: 'late', label: 'eating after 9 pm', test: d => meals(d).some(e => /^(2[1-3]):/.test(String(e.record.time ?? ''))) },
    { key: 'high_fat', label: 'a meal over 35 g of fat', test: d => meals(d).some(e => Number(e.record.fat_g) > 35) }
  ];
  // The day before a low day matters too (what fed into it), but keep it simple and honest:
  // compare same-day patterns only, and only days with any meal logged.
  const logged = d => meals(d).length > 0;
  const lowLogged = low.filter(logged);
  const otherLogged = other.filter(logged);
  if (lowLogged.length < MIN_LOW_DAYS || otherLogged.length < MIN_LOW_DAYS) return null;
  let best = null;
  for (const f of features) {
    const hits = lowLogged.filter(f.test).length;
    const lowRate = hits / lowLogged.length;
    const otherRate = rate(otherLogged, f.test);
    if (hits >= MIN_HITS && lowRate - otherRate >= MIN_GAP && (!best || lowRate - otherRate > best.gap)) {
      best = { f, hits, lowRate, otherRate, gap: lowRate - otherRate };
    }
  }
  if (!best) return null;
  return {
    id: `food:${best.f.key}`,
    agents: ['brisket'],
    topic: 'what you eat on your lower-energy days',
    finding: `On ${best.hits} of your ${lowLogged.length} lower-capacity days in the last six weeks there was ${best.f.label} — about ${pct(best.lowRate)}, compared with ${pct(best.otherRate)} on your other days. That’s a pattern, not a verdict: it could be low energy leading to easier food as much as the other way round.`,
    evidence: { low_days: lowLogged.length, hits: best.hits, low_rate: best.lowRate, other_rate: best.otherRate }
  };
}

function poorSleepRun({ byDate, checkins, cap, today }) {
  const recent = range(addDays(today, -6), today);
  const poor = d => {
    const a = checkins.get(d)?.answers?.sleep;
    if (a === 'poor' || a === 'still_poor' || a === 'worse') return true;
    const rec = (byDate.get(d) ?? []).find(e => e.record.type === 'sleep')?.record;
    return Boolean(rec && ((Number.isFinite(rec.duration_h) && rec.duration_h < 6) || (Number.isFinite(rec.quality) && rec.quality <= 4)));
  };
  const nights = recent.filter(poor);
  if (nights.length < MIN_HITS) return null;
  const poorPct = nights.map(d => cap.get(d)?.pct).filter(Number.isFinite);
  const restPct = recent.filter(d => !poor(d)).map(d => cap.get(d)?.pct).filter(Number.isFinite);
  const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length;
  const gap = restPct.length ? Math.round(mean(restPct) - mean(poorPct)) : null;
  return {
    id: 'sleep:run',
    agents: ['sara'],
    topic: 'your sleep this week',
    finding: `${nights.length} of the last 7 nights were poor or short${gap != null && gap >= 5 ? `, and capacity on those days ran about ${gap} points lower than the others` : ''}. Worth a look at what’s going on around bedtime — I can help if you want.`,
    evidence: { poor_nights: nights.length, gap }
  };
}

function lowMoodRun({ byDate, checkins, today }) {
  const recent = range(addDays(today, -6), today);
  const low = d => {
    const answer = checkins.get(d)?.answers?.mood;
    if (answer === 'low') return true;
    return (byDate.get(d) ?? []).some(e => e.record.type === 'diary' && ((Number.isFinite(e.record.mood_score) && e.record.mood_score <= 4) || e.record.mood === 'low' || e.record.mood === 'bad'));
  };
  const days = recent.filter(low);
  if (days.length < MIN_HITS) return null;
  return {
    id: 'mood:run',
    agents: ['penelope', 'vera'],
    topic: 'how your mood has been tracking this week',
    finding: `Mood has been low on ${days.length} of the last 7 days. No conclusions — just something I noticed, if you want to look at it together.`,
    evidence: { low_days: days.length }
  };
}

function trainingRecovery({ byDate, cap, computed, checkins, today }) {
  const strenuous = d => (byDate.get(d) ?? []).some(e => e.record.type === 'workout' && e.record.status === 'completed' && e.record.session_kind !== 'walk' && e.record.session_kind !== 'mobility');
  const afterTraining = computed.filter(d => strenuous(addDays(d, -1)));
  const afterRest = computed.filter(d => !strenuous(addDays(d, -1)));
  const sore = range(addDays(today, -13), today).filter(d => ['soreness', 'both'].includes(checkins.get(d)?.answers?.lingering)).length;
  if (afterTraining.length >= 4 && afterRest.length >= 4) {
    const mean = xs => xs.reduce((s, d) => s + cap.get(d).pct, 0) / xs.length;
    const gap = Math.round(mean(afterRest) - mean(afterTraining));
    if (gap >= 8) {
      return {
        id: 'training:recovery',
        agents: ['chadwick'],
        topic: 'how you’re recovering from training',
        finding: `The day after a hard session your capacity has averaged about ${gap} points lower than after a rest day (${afterTraining.length} sessions in six weeks)${sore >= 2 ? `, and you’ve reported lingering soreness ${sore} times in the last fortnight` : ''}. We could space the heavy days differently.`,
        evidence: { after_training: afterTraining.length, gap, sore }
      };
    }
  }
  if (sore >= MIN_HITS) {
    return {
      id: 'training:soreness',
      agents: ['chadwick'],
      topic: 'soreness after training',
      finding: `You’ve reported lingering soreness ${sore} times in the last fortnight. Might be worth adjusting volume or recovery days.`,
      evidence: { sore }
    };
  }
  return null;
}

function weeklyCapacity({ cap, today }) {
  const week = range(addDays(today, -6), today).map(d => cap.get(d)).filter(r => r && !r.forecast);
  const prior = range(addDays(today, -13), addDays(today, -7)).map(d => cap.get(d)).filter(r => r && !r.forecast);
  if (week.length < 4 || prior.length < 4) return null;
  const mean = xs => Math.round(xs.reduce((s, r) => s + r.pct, 0) / xs.length);
  const now = mean(week);
  const before = mean(prior);
  if (Math.abs(now - before) < 8 && now >= 60) return null;
  const dir = now < before ? 'down' : 'up';
  return {
    id: `week:${dir}`,
    agents: ['hammond'],
    topic: 'how your capacity has tracked this week',
    finding: `Capacity averaged ${now} this week, ${dir} from ${before} the week before. ${now < 65 ? 'Worth checking the plan asks for what this week can actually carry.' : 'There may be room for something you’ve been putting off.'}`,
    evidence: { week: now, prior: before }
  };
}

/**
 * All current insights from calendar-shaped events (Life logs + check-ins + sessions,
 * classes, meetings — the same evidence capacityForDates gets everywhere else).
 */
export function findInsights({ events, today, isHoliday = () => false }) {
  const list = (events ?? []).filter(e => e?.record);
  const byDate = new Map();
  for (const e of list) {
    if (!byDate.has(e.record.date)) byDate.set(e.record.date, []);
    byDate.get(e.record.date).push(e);
  }
  const from = addDays(today, -(INSIGHT_WINDOW_DAYS - 1));
  const dates = range(from, today);
  const cap = capacityForDates(list, dates, { today, isHoliday });
  const checkins = checkinsByDate(list.filter(e => e.record.type === CHECKIN_TYPE));
  const { low, other, computed } = splitDays(cap, dates);
  const ctx = { byDate, cap, low, other, computed, checkins, today };
  return [foodOnLowDays(ctx), poorSleepRun(ctx), lowMoodRun(ctx), trainingRecovery(ctx), weeklyCapacity(ctx)].filter(Boolean);
}
