// Sara's analyst: deterministic calculations over Life Hub's own records.
//
// Every function here is pure: events in, a plain object out. Sara interprets the
// numbers; she never has to do arithmetic or guess a trend from search hits.
// Nothing here diagnoses. Associations are reported with their sample size and the
// caller is told when the data is too thin to say anything.

import { daysBetween, isCalendarDate } from '../../../apps/life/js/core/time.js';

const DAY = 86400000;

// ---------- small helpers ----------

const round = (value, places = 1) => {
  if (!Number.isFinite(value)) return null;
  const f = 10 ** places;
  return Math.round(value * f) / f;
};

const byDateAsc = (a, b) => `${a.date}T${a.time ?? '00:00'}`.localeCompare(`${b.date}T${b.time ?? '00:00'}`);

const recordOf = event => event?.record ?? event ?? {};

function medicalRecords(events) {
  return (events ?? [])
    .map(event => ({ event, record: recordOf(event) }))
    .filter(({ record }) => record.type === 'medical' && isCalendarDate(record.date))
    .map(({ event, record }) => ({ ...record, path: event.path ?? record.path ?? null, notes_body: event.body ?? '' }))
    .sort(byDateAsc);
}

function bloodsRecords(events) {
  return (events ?? [])
    .map(event => ({ event, record: recordOf(event) }))
    .filter(({ record }) => record.type === 'bloods' && isCalendarDate(record.date) && Array.isArray(record.markers))
    .map(({ event, record }) => ({ ...record, path: event.path ?? record.path ?? null }))
    .sort(byDateAsc);
}

export function isPlanned(visit, today) {
  return visit.status === 'planned' || visit.status === 'to_book' || visit.date > today;
}

// ---------- blood markers ----------

const MARKER_GROUPS = {
  liver: ['Liver Function'],
  iron: ['Iron Studies'],
  inflammation: ['Inflammation Markers'],
  fbc: ['Full Blood Count'],
  'blood count': ['Full Blood Count'],
  lipids: ['Lipid Studies'],
  cholesterol: ['Lipid Studies'],
  vitamins: ['Vitamins & Nutrients'],
  electrolytes: ['Biochemistry/Electrolytes'],
  kidney: ['Biochemistry/Electrolytes'],
  thyroid: ['Thyroid'],
  glucose: ['Glucose/Diabetes'],
  diabetes: ['Glucose/Diabetes']
};

const norm = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function markerMatches(marker, query) {
  const q = norm(query);
  if (!q) return false;
  const groups = MARKER_GROUPS[q];
  if (groups?.includes(marker.category)) return true;
  return norm(marker.key) === q || norm(marker.label) === q
    || norm(marker.label).includes(q) || norm(marker.category) === q;
}

function slopePerMonth(points) {
  if (points.length < 3) return null;
  const t0 = Date.parse(`${points[0].date}T00:00:00Z`);
  const xs = points.map(p => (Date.parse(`${p.date}T00:00:00Z`) - t0) / DAY);
  if (xs[xs.length - 1] < 30) return null;
  const ys = points.map(p => p.value);
  const n = points.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const num = xs.reduce((sum, x, i) => sum + (x - mx) * (ys[i] - my), 0);
  const den = xs.reduce((sum, x) => sum + (x - mx) ** 2, 0);
  return den ? round((num / den) * 30.4, 2) : null;
}

function distanceOutsideRange(value, low, high) {
  if (high != null && value > high) return value - high;
  if (low != null && value < low) return low - value;
  return 0;
}

function describeMarker(points, meta, today) {
  const latest = points[points.length - 1];
  const previous = points.length > 1 ? points[points.length - 2] : null;
  const first = points[0];
  const { ref_low: low = null, ref_high: high = null } = meta;
  const position = high != null && latest.value > high ? 'above' : low != null && latest.value < low ? 'below' : 'within';
  const outNow = distanceOutsideRange(latest.value, low, high);
  const outPrev = previous ? distanceOutsideRange(previous.value, low, high) : null;
  let direction = 'single_point';
  if (previous) {
    if (outNow === 0 && outPrev === 0) direction = 'in_range';
    else if (outNow > outPrev) direction = 'moving_away_from_range';
    else if (outNow < outPrev) direction = 'moving_toward_range';
    else direction = 'steady';
  }
  const gap = daysBetween(latest.date, today);
  return {
    key: meta.key,
    label: meta.label,
    category: meta.category,
    unit: meta.unit ?? null,
    ref_low: low,
    ref_high: high,
    points: points.map(p => ({ date: p.date, value: p.value, status: p.status ?? null })),
    count: points.length,
    latest: { date: latest.date, value: latest.value, status: latest.status ?? null },
    previous: previous ? { date: previous.date, value: previous.value, status: previous.status ?? null } : null,
    delta_vs_previous: previous ? round(latest.value - previous.value, 2) : null,
    pct_vs_previous: previous && previous.value ? round(((latest.value - previous.value) / previous.value) * 100, 1) : null,
    delta_vs_first: points.length > 1 ? round(latest.value - first.value, 2) : null,
    per_month: slopePerMonth(points),
    range_position: position,
    direction_vs_range: direction,
    days_since_last: gap,
    abnormal_and_unrepeated: position !== 'within' && gap != null && gap > 56
  };
}

/**
 * Every dated value of a marker (or group such as "liver") with change and direction.
 * Direction is judged against the reference range, not just up/down: GGT falling
 * but still high is "moving toward range", not "better".
 */
export function markerTrend(events, { query, today, from = null, to = null } = {}) {
  if (!norm(query)) return { ok: false, error: 'empty_query' };
  if (!isCalendarDate(today)) return { ok: false, error: 'invalid_date' };
  const collections = bloodsRecords(events).filter(r => (!from || r.date >= from) && (!to || r.date <= to));
  const byKey = new Map();
  for (const collection of collections) {
    for (const marker of collection.markers) {
      if (!markerMatches(marker, query) || !Number.isFinite(Number(marker.value))) continue;
      if (!byKey.has(marker.key)) byKey.set(marker.key, { meta: marker, points: [] });
      const entry = byKey.get(marker.key);
      entry.meta = marker; // latest metadata (range can change between labs)
      entry.points.push({ date: collection.date, value: Number(marker.value), status: marker.status });
    }
  }
  const markers = [...byKey.values()].map(({ meta, points }) => describeMarker(points, meta, today));
  return {
    ok: true,
    store: 'life_hub_bloods',
    query,
    collections_considered: collections.length,
    count: markers.length,
    found: markers.length > 0,
    markers,
    how_to_read: 'direction_vs_range compares distance outside the reference range between the last two tests. '
      + 'A falling value that is still above range is moving_toward_range, not normal. '
      + 'per_month is a straight-line slope and only given with 3+ points over 30+ days.'
  };
}

/** Two collections compared marker by marker (default: the latest two). */
export function compareBloods(events, { date_a = null, date_b = null, today } = {}) {
  const collections = bloodsRecords(events);
  if (collections.length < 2) {
    return { ok: true, found: false, reason: 'need_two_collections', collections: collections.length };
  }
  const pick = date => (date ? collections.find(c => c.date === date) : null);
  let after = pick(date_b) ?? collections[collections.length - 1];
  let before = pick(date_a) ?? collections[collections.indexOf(after) - 1] ?? null;
  if (!before) return { ok: true, found: false, reason: 'no_earlier_collection' };
  if (before.date > after.date) [before, after] = [after, before];

  const prior = new Map(before.markers.map(m => [m.key, m]));
  const newly_abnormal = [];
  const normalised = [];
  const still_abnormal = [];
  const moves = [];
  for (const marker of after.markers) {
    const earlier = prior.get(marker.key);
    if (!earlier || !Number.isFinite(Number(marker.value)) || !Number.isFinite(Number(earlier.value))) continue;
    const delta = round(Number(marker.value) - Number(earlier.value), 2);
    const pct = Number(earlier.value) ? round((delta / Number(earlier.value)) * 100, 1) : null;
    const row = {
      key: marker.key, label: marker.label, unit: marker.unit ?? null,
      before: Number(earlier.value), after: Number(marker.value), delta, pct,
      before_status: earlier.status ?? null, after_status: marker.status ?? null,
      ref_low: marker.ref_low ?? null, ref_high: marker.ref_high ?? null
    };
    const wasBad = earlier.status && earlier.status !== 'Normal';
    const isBad = marker.status && marker.status !== 'Normal';
    if (!wasBad && isBad) newly_abnormal.push(row);
    else if (wasBad && !isBad) normalised.push(row);
    else if (wasBad && isBad) still_abnormal.push(row);
    moves.push(row);
  }
  moves.sort((a, b) => Math.abs(b.pct ?? 0) - Math.abs(a.pct ?? 0));
  return {
    ok: true,
    found: true,
    before_date: before.date,
    after_date: after.date,
    days_between: daysBetween(before.date, after.date),
    markers_compared: moves.length,
    newly_abnormal,
    normalised,
    still_abnormal,
    biggest_moves: moves.slice(0, 6),
    all: moves,
    today: today ?? null
  };
}

// ---------- treatment (Stelara cycle) ----------

const STELARA_RE = /stelara|ustekinumab/i;
const STEROID_RE = /prednisolone|prednisone|entocort|budesonide|steroid/i;
const DEFAULT_STELARA_CADENCE = 56;

function doseKind(visit, index) {
  if (/induction|infusion/i.test(visit.title ?? '')) return 'induction';
  return index === 0 ? 'first' : 'maintenance';
}

/**
 * Stelara dose history and where today sits in the cycle. Cycle day 0 is dose day.
 * A dose is any non-planned Stelara visit on or before today; planned/future ones
 * feed `planned_next`.
 */
export function treatmentTimeline(events, { today } = {}) {
  if (!isCalendarDate(today)) return { ok: false, error: 'invalid_date' };
  const visits = medicalRecords(events);
  const stelara = visits.filter(v => STELARA_RE.test(`${v.title ?? ''} ${v.notes_body ?? ''}`) && v.record_type !== 'Symptom');
  const doses = stelara.filter(v => !isPlanned(v, today))
    .map((v, i) => ({ id: v.id, date: v.date, title: v.title, kind: doseKind(v, i), cadence_days: v.cadence_days ?? null }));
  const planned = stelara.filter(v => isPlanned(v, today) && v.date >= today).sort(byDateAsc);
  const last = doses[doses.length - 1] ?? null;
  const cadence = [...doses].reverse().find(d => d.cadence_days)?.cadence_days ?? planned[0]?.cadence_days ?? DEFAULT_STELARA_CADENCE;

  const steroids = visits.filter(v => STEROID_RE.test(`${v.title ?? ''} ${v.notes_body ?? ''}`) && v.record_type !== 'Symptom')
    .map(v => ({ id: v.id, date: v.date, title: v.title, planned: isPlanned(v, today) }));

  let cycle = null;
  if (last) {
    const dueDate = new Date(Date.parse(`${last.date}T00:00:00Z`) + cadence * DAY).toISOString().slice(0, 10);
    const sinceLast = daysBetween(last.date, today);
    cycle = {
      last_dose_date: last.date,
      days_since_last_dose: sinceLast,
      cycle_day: sinceLast,
      cadence_days: cadence,
      next_due: dueDate,
      days_until_next: daysBetween(today, dueDate),
      overdue: today > dueDate,
      days_overdue: today > dueDate ? daysBetween(dueDate, today) : 0,
      planned_next: planned[0] ? { id: planned[0].id, date: planned[0].date, status: planned[0].status ?? null } : null
    };
  }
  return {
    ok: true,
    store: 'life_hub_medical_overview',
    stelara: { found: doses.length > 0, dose_count: doses.length, doses, cycle },
    steroids,
    how_to_read: 'cycle_day is days since the last logged Stelara dose (0 = dose day). '
      + 'A dose only counts if it is logged and not planned; if the next dose is overdue per cadence, say the log may be missing it rather than assuming it was skipped.'
  };
}

/** Day-of-cycle for any date, using the dose most recently on or before it. */
export function cycleDayFor(date, doses) {
  const prior = (doses ?? []).filter(d => d.date <= date).pop();
  return prior ? daysBetween(prior.date, date) : null;
}

// ---------- symptoms ----------

const POST_DOSE_WINDOW_DAYS = 3;

export function symptomTimeline(events, { today, diary = [], from = null, to = null } = {}) {
  if (!isCalendarDate(today)) return { ok: false, error: 'invalid_date' };
  const visits = medicalRecords(events);
  const { stelara } = treatmentTimeline(events, { today });
  const doses = stelara.doses;
  const inRange = d => (!from || d >= from) && (!to || d <= to);

  const symptomVisits = visits.filter(v => (v.record_type === 'Symptom' || v.lane === 'symptom' || v.episode?.id) && inRange(v.date));
  const episodes = new Map();
  for (const v of symptomVisits) {
    const key = v.episode?.id ?? `single-${v.id}`;
    if (!episodes.has(key)) {
      episodes.set(key, {
        id: v.episode?.id ?? null,
        title: v.episode?.title ?? v.title,
        status: v.episode?.status ?? 'active',
        started: v.episode?.started ?? v.date,
        resolved: v.episode?.resolved ?? null,
        entries: []
      });
    }
    episodes.get(key).entries.push({
      id: v.id, date: v.date, title: v.title,
      note: String(v.notes_body ?? '').slice(0, 160),
      cycle_day: cycleDayFor(v.date, doses)
    });
  }
  const list = [...episodes.values()].map(ep => {
    ep.entries.sort(byDateAsc);
    const end = ep.resolved ?? today;
    return {
      ...ep,
      entry_count: ep.entries.length,
      duration_days: ep.started ? daysBetween(ep.started, end) + 1 : null,
      onset_cycle_day: cycleDayFor(ep.started, doses)
    };
  }).sort((a, b) => b.started.localeCompare(a.started));

  const diarySymptomDays = (diary ?? [])
    .map(e => recordOf(e))
    .filter(r => r.type === 'diary' && Array.isArray(r.symptoms) && r.symptoms.length && inRange(r.date))
    .map(r => ({ date: r.date, symptoms: r.symptoms, cycle_day: cycleDayFor(r.date, doses) }));

  // Onset days only: how many episodes began within 3 days of a dose, against what chance predicts.
  const onsets = list.filter(ep => ep.onset_cycle_day != null);
  const nearDose = onsets.filter(ep => ep.onset_cycle_day <= POST_DOSE_WINDOW_DAYS).length;
  const cadence = stelara.cycle?.cadence_days ?? DEFAULT_STELARA_CADENCE;
  const expectedShare = round(((POST_DOSE_WINDOW_DAYS + 1) / cadence) * 100, 0);
  return {
    ok: true,
    store: 'life_hub_medical_overview',
    episode_count: list.length,
    episodes: list,
    diary_symptom_days: diarySymptomDays,
    post_dose_pattern: {
      window_days: POST_DOSE_WINDOW_DAYS,
      episodes_with_known_cycle_day: onsets.length,
      onset_within_window: nearDose,
      share_pct: onsets.length ? round((nearDose / onsets.length) * 100, 0) : null,
      expected_share_if_unrelated_pct: expectedShare,
      enough_to_infer: onsets.length >= 5,
      caution: onsets.length >= 5
        ? 'Association only. Compare share_pct with expected_share_if_unrelated_pct; a clinician judges cause.'
        : `Only ${onsets.length} episode(s) with a known cycle day — too few to call a pattern. Describe what happened and when; do not infer a link to the injection.`
    }
  };
}

// ---------- open loops ----------

const ORDERED_RE = /\b(ordered|referred|referral|to book|book (?:a|an|in)|repeat (?:bloods|test)|retest)\b/i;

export function openLoops(events, { today } = {}) {
  if (!isCalendarDate(today)) return { ok: false, error: 'invalid_date' };
  const visits = medicalRecords(events);
  const blood = bloodsRecords(events);
  const loops = [];

  for (const v of visits) {
    if (v.status === 'to_book') {
      loops.push({ kind: 'to_book', id: v.id, title: v.title, target: v.date_precision === 'day' ? v.date : (v.date_precision ?? 'undated'), note: 'Ordered or planned but not booked.' });
    }
  }

  for (const v of visits) {
    if (v.follow_up_date && v.follow_up_date <= today) {
      const happened = visits.some(o => o.id !== v.id && o.date >= v.follow_up_date && o.date <= today && !isPlanned(o, today));
      if (!happened) loops.push({ kind: 'follow_up_overdue', id: v.id, title: v.title, due: v.follow_up_date, days_overdue: daysBetween(v.follow_up_date, today) });
    }
  }

  const latest = blood[blood.length - 1];
  if (latest) {
    for (const marker of latest.markers) {
      if (marker.status && marker.status !== 'Normal') {
        const gap = daysBetween(latest.date, today);
        if (gap > 56) loops.push({ kind: 'abnormal_not_repeated', key: marker.key, label: marker.label, value: marker.value, status: marker.status, last_test: latest.date, days_since: gap });
      }
    }
  }

  const { stelara } = treatmentTimeline(events, { today });
  if (stelara.cycle) {
    const c = stelara.cycle;
    if (c.overdue) loops.push({ kind: 'stelara_overdue', next_due: c.next_due, days_overdue: c.days_overdue, note: 'No dose logged since; the log may be missing it.' });
    else if (c.days_until_next <= 14 && !c.planned_next) loops.push({ kind: 'stelara_due_soon_unplanned', next_due: c.next_due, days_until: c.days_until_next });
  }

  const upcoming = visits
    .filter(v => v.date >= today && v.date <= new Date(Date.parse(`${today}T00:00:00Z`) + 30 * DAY).toISOString().slice(0, 10) && v.status !== 'to_book')
    .map(v => ({ id: v.id, title: v.title, date: v.date, time: v.time && v.time !== '00:00' ? v.time : null, status: v.status ?? null, days_until: daysBetween(today, v.date) }));

  const mentioned = visits
    .filter(v => !isPlanned(v, today) && v.date >= new Date(Date.parse(`${today}T00:00:00Z`) - 90 * DAY).toISOString().slice(0, 10))
    .filter(v => ORDERED_RE.test(v.notes_body ?? ''))
    .map(v => ({ id: v.id, title: v.title, date: v.date, snippet: (String(v.notes_body).match(new RegExp(`.{0,40}${ORDERED_RE.source}.{0,60}`, 'i')) ?? [''])[0].trim() }));

  return {
    ok: true,
    store: 'life_hub_medical_overview',
    count: loops.length,
    loops,
    upcoming_30_days: upcoming,
    mentioned_in_notes: mentioned,
    how_to_read: 'mentioned_in_notes are phrases in recent visit notes (ordered/referred/retest). They are not confirmed loops: check whether a record exists before telling Adam something is outstanding.'
  };
}

// ---------- cross-domain signals ----------

function avg(values) {
  const nums = values.filter(v => Number.isFinite(v));
  return nums.length ? round(nums.reduce((a, b) => a + b, 0) / nums.length, 1) : null;
}

function inWindow(record, from, to) {
  return record.date >= from && record.date <= to;
}

function windowSummary({ meals, workouts, diary, weights }, from, to) {
  const m = meals.filter(r => inWindow(r, from, to));
  const mealDays = new Set(m.map(r => r.date));
  const proteinByDay = [...mealDays].map(d => m.filter(r => r.date === d).reduce((s, r) => s + (Number(r.protein_g) || 0), 0));
  const calciumByDay = [...mealDays].map(d => m.filter(r => r.date === d).reduce((s, r) => s + (Number(r.calcium_mg) || 0), 0));
  const fibreByDay = [...mealDays].map(d => m.filter(r => r.date === d).reduce((s, r) => s + (Number(r.fibre_g) || 0), 0));
  const w = workouts.filter(r => inWindow(r, from, to) && r.status === 'completed');
  const painSessions = w.filter(r => Array.isArray(r.pain_flags) && r.pain_flags.length);
  const d = diary.filter(r => inWindow(r, from, to));
  const scores = d.map(r => Number(r.mood_score)).filter(Number.isFinite);
  const energyLow = d.filter(r => r.energy === 'low').length;
  const wt = weights.filter(r => inWindow(r, from, to)).sort(byDateAsc);
  return {
    from, to,
    nutrition: { days_logged: mealDays.size, avg_daily_protein_g: avg(proteinByDay), avg_daily_calcium_mg: avg(calciumByDay), avg_daily_fibre_g: avg(fibreByDay) },
    training: { sessions: w.length, sessions_with_pain: painSessions.length, pain_regions: [...new Set(painSessions.flatMap(r => r.pain_flags.map(f => f.region).filter(Boolean)))] },
    mood: { entries: d.length, avg_mood_score: avg(scores), low_energy_days: energyLow, symptom_mentions: d.flatMap(r => r.symptoms ?? []) },
    weight: { readings: wt.length, first_kg: wt[0]?.weight_kg ?? null, last_kg: wt[wt.length - 1]?.weight_kg ?? null, change_kg: wt.length > 1 ? round(wt[wt.length - 1].weight_kg - wt[0].weight_kg, 1) : null }
  };
}

const shiftDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

const MIN_NUTRITION_DAYS = 7;
const MIN_MOOD_ENTRIES = 5;

/**
 * Describe the lead-up to events (blood collections, symptom onsets) and compare a window
 * with the one before it. Never states a cause; says when there is too little to compare.
 */
export function crossSignals({ today, from = null, to = null, anchors = [], meals = [], workouts = [], diary = [], weights = [] } = {}) {
  if (!isCalendarDate(today)) return { ok: false, error: 'invalid_date' };
  const end = to && isCalendarDate(to) ? to : today;
  const start = from && isCalendarDate(from) ? from : shiftDays(end, -27);
  const span = daysBetween(start, end) + 1;
  const data = {
    meals: meals.map(recordOf).filter(r => r.type === 'meal'),
    workouts: workouts.map(recordOf).filter(r => r.type === 'workout'),
    diary: diary.map(recordOf).filter(r => r.type === 'diary'),
    weights: weights.map(recordOf).filter(r => typeof r.weight_kg === 'number')
  };
  const current = windowSummary(data, start, end);
  const priorFrom = shiftDays(start, -span);
  const prior = windowSummary(data, priorFrom, shiftDays(start, -1));

  const lookbacks = anchors.filter(isCalendarDate).slice(0, 5).map(date => ({
    anchor: date,
    lookback_days: 14,
    ...windowSummary(data, shiftDays(date, -14), shiftDays(date, -1))
  }));

  const enough = {
    nutrition: current.nutrition.days_logged >= MIN_NUTRITION_DAYS,
    mood: current.mood.entries >= MIN_MOOD_ENTRIES,
    training: current.training.sessions >= 3,
    weight: current.weight.readings >= 2
  };
  const gaps = Object.entries(enough).filter(([, ok]) => !ok).map(([domain]) => domain);
  return {
    ok: true,
    window: { from: start, to: end, days: span },
    current,
    prior,
    anchors: lookbacks,
    enough_data: enough,
    data_gaps: gaps,
    caution: gaps.length === Object.keys(enough).length
      ? 'No domain has enough logged days to compare. Say what is missing; do not infer.'
      : 'These are descriptive comparisons, not causes. Name the gaps in data_gaps before drawing any link.'
  };
}

// ---------- appointment brief ----------

function questionsFor({ abnormal, activeEpisodes, cycle, loops, visit }) {
  const questions = [];
  for (const m of abnormal) {
    if (m.direction_vs_range === 'moving_away_from_range') {
      questions.push(`${m.label} is ${m.latest.value}${m.unit ? ` ${m.unit}` : ''}, up from ${m.previous.value} on ${m.previous.date} (reference ${m.ref_high != null ? `up to ${m.ref_high}` : m.ref_low != null ? `from ${m.ref_low}` : 'n/a'}). What could explain the rise, and what should we do next or repeat, and when?`);
    } else if (m.direction_vs_range === 'moving_toward_range') {
      questions.push(`${m.label} has come down to ${m.latest.value} but is still outside range. Is this the trend you expected, and when should it be repeated?`);
    } else {
      questions.push(`${m.label} is ${m.latest.value} (${m.range_position} range). Does it need follow-up or a repeat test?`);
    }
  }
  for (const ep of activeEpisodes) {
    questions.push(`I have had ${String(ep.title).toLowerCase()} since ${ep.started}. Is it worth investigating, and what should I watch for?`);
  }
  if (cycle?.overdue) questions.push('My next Stelara dose looks overdue on my records. Can we confirm the date?');
  for (const loop of loops.filter(l => l.kind === 'to_book')) {
    questions.push(`${loop.title} is on my list but not booked. Who books it, and what should I do beforehand?`);
  }
  if (!questions.length) questions.push(`Anything you want me to track before my next review after "${visit.title}"?`);
  return questions;
}

/**
 * Everything Sara needs to brief a visit, computed from the visit's own date (not today).
 * Questions are generated from the numbers; Sara refines the wording and priority.
 */
export function appointmentBrief(events, { visit_id = null, date = null, today } = {}) {
  if (!isCalendarDate(today)) return { ok: false, error: 'invalid_date' };
  const visits = medicalRecords(events);
  const visit = visit_id
    ? visits.find(v => v.id === visit_id)
    : visits.find(v => v.date === date) ?? null;
  if (!visit) return { ok: true, found: false, reason: visit_id ? 'unknown_visit_id' : 'no_visit_on_date' };

  const asOf = visit.date;
  const blood = bloodsRecords(events).filter(b => b.date <= asOf);
  const latest = blood[blood.length - 1] ?? null;
  const abnormal = latest
    ? latest.markers.filter(m => m.status && m.status !== 'Normal')
      .map(m => markerTrend(events, { query: m.key, today: asOf }).markers.find(t => t.key === m.key))
      .filter(Boolean)
    : [];

  const previousVisits = visits.filter(v => v.date < asOf && !isPlanned(v, today) && v.record_type !== 'Symptom');
  const sameClinician = visit.provider ? previousVisits.filter(v => v.provider === visit.provider).slice(-3) : [];
  const lastAny = previousVisits[previousVisits.length - 1] ?? null;
  const sinceDate = lastAny?.date ?? shiftDays(asOf, -90);

  const symptoms = symptomTimeline(events, { today: asOf, from: sinceDate });
  const activeEpisodes = symptoms.episodes.filter(e => e.status !== 'resolved');
  const treatment = treatmentTimeline(events, { today: asOf });
  const loops = openLoops(events, { today: asOf });
  const related = loops.loops.filter(l => l.kind === 'to_book' || l.kind === 'abnormal_not_repeated' || l.kind === 'follow_up_overdue');

  const gaps = [];
  if (!latest) gaps.push('No bloods on record.');
  else if (daysBetween(latest.date, asOf) > 90) gaps.push(`Latest bloods are ${daysBetween(latest.date, asOf)} days old at this visit.`);
  if (!visit.provider) gaps.push('No clinician recorded on this visit.');
  if (!treatment.stelara.found) gaps.push('No Stelara doses logged.');

  return {
    ok: true,
    found: true,
    store: 'life_hub_medical_overview',
    as_of: asOf,
    visit: {
      id: visit.id, title: visit.title, date: visit.date,
      time: visit.time && visit.time !== '00:00' ? visit.time : null,
      duration_min: visit.duration_min ?? null,
      provider: visit.provider ?? null, location: visit.location ?? null,
      status: visit.status ?? null, notes: String(visit.notes_body ?? '').slice(0, 400)
    },
    history_with_clinician: sameClinician.map(v => ({ id: v.id, date: v.date, title: v.title })),
    last_visit_before: lastAny ? { id: lastAny.id, date: lastAny.date, title: lastAny.title } : null,
    results: { collection_date: latest?.date ?? null, abnormal },
    symptoms_since_last_visit: { since: sinceDate, episodes: symptoms.episodes, active: activeEpisodes },
    treatment: treatment.stelara.cycle ? { stelara: treatment.stelara.cycle } : { stelara: null },
    open_loops: related,
    questions_to_ask: questionsFor({ abnormal, activeEpisodes, cycle: treatment.stelara.cycle, loops: related, visit }),
    data_gaps: gaps
  };
}
