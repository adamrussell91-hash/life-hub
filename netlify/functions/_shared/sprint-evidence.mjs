/**
 * Challenge-sprint evidence adapters + computeSprintState.
 * One function feeds prompt, Home card, nudge, and reviews (brief §4 / V4).
 */
import { addCalendarDays, isCalendarDate } from '../../../apps/life/js/core/time.js';

export const SPRINT_ROSTER = Object.freeze({
  hammond: 'Hammond',
  clare: 'Clare',
  brisket: 'Brisket',
  chadwick: 'Chadwick',
  sara: 'Sara',
  hyaluronica: 'Hyaluronica',
  penelope: 'Penelope',
  vera: 'Vera',
  ann: 'Ann',
  clementine: 'Clementine'
});

/** Agents whose chat entrypoint receives sprint context once Phase A is wired. */
export const SPRINT_AWARE_AGENTS = Object.freeze(Object.keys(SPRINT_ROSTER));

export const EVIDENCE_SOURCES = Object.freeze([
  'nutrition.meals_logged',
  'nutrition.protein_target_met',
  'nutrition.kcal_within_target',
  'fitness.workout_completed',
  'body.measurements.waist',
  'body.measurements.hips',
  'body.weight',
  'mind.diary_entry',
  'self_report'
]);

const MS_DAY = 86400000;

export function daysBetween(start, end) {
  if (!isCalendarDate(start) || !isCalendarDate(end)) return null;
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / MS_DAY);
}

export function sprintLengthDays(sprint) {
  const n = daysBetween(sprint?.start_date, sprint?.end_date);
  return n == null ? null : n + 1;
}

/** Cadence defaults by length (brief §3.1). Overrides win when present. */
export function defaultCadenceForLength(lengthDays) {
  const n = Number(lengthDays);
  if (!Number.isFinite(n) || n <= 0) {
    return { daily_check: true, daily_nudge_time: '19:30', weekly_review_day: 'sun', midpoint_review: false, final_review: true };
  }
  if (n <= 21) {
    return {
      daily_check: true,
      daily_nudge_time: '19:30',
      weekly_review_day: 'sun',
      midpoint_review: n < 10,
      final_review: true
    };
  }
  if (n <= 90) {
    return {
      daily_check: false,
      daily_nudge_time: '19:30',
      weekly_review_day: 'sun',
      midpoint_review: false,
      final_review: true
    };
  }
  return {
    daily_check: false,
    daily_nudge_time: '19:30',
    weekly_review_day: 'fortnightly',
    midpoint_review: false,
    final_review: true
  };
}

export function resolveCadence(sprint) {
  const defaults = defaultCadenceForLength(sprintLengthDays(sprint));
  const raw = sprint?.cadence && typeof sprint.cadence === 'object' ? sprint.cadence : {};
  return {
    daily_check: raw.daily_check ?? defaults.daily_check,
    daily_nudge_time: raw.daily_nudge_time ?? defaults.daily_nudge_time,
    weekly_review_day: raw.weekly_review_day ?? defaults.weekly_review_day,
    midpoint_review: raw.midpoint_review ?? defaults.midpoint_review,
    final_review: raw.final_review ?? defaults.final_review
  };
}

function mealsOnDate(records, date) {
  return (records ?? []).filter(r => r?.type === 'meal' && r.date === date);
}

function dayProtein(records, date) {
  return mealsOnDate(records, date).reduce((sum, m) => sum + (Number(m.protein_g) || 0), 0);
}

function dayKcal(records, date) {
  return mealsOnDate(records, date).reduce((sum, m) => sum + (Number(m.calories) || 0), 0);
}

function tapeOnDate(records, date, field) {
  const rows = (records ?? []).filter(r => r?.type === 'measurements' && r.date === date);
  for (const row of rows) {
    const v = row?.[field] ?? row?.fields?.[field];
    if (v != null && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

function weightOnDate(records, date) {
  const rows = (records ?? []).filter(r => (r?.type === 'weight' || r?.type === 'composition') && r.date === date);
  for (const row of rows) {
    const v = row?.weight_kg ?? row?.weight ?? row?.fields?.weight_kg;
    if (v != null && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

/**
 * Adapter registry. Each returns { status, value?, detail }.
 * status: met | missed | no_evidence | unavailable
 */
export const EVIDENCE_ADAPTERS = Object.freeze({
  'nutrition.meals_logged'(records, date, params = {}) {
    try {
      const meals = mealsOnDate(records, date);
      if (!meals.length) return { status: 'no_evidence', value: 0, detail: 'no meals' };
      const min = Number(params.min) > 0 ? Number(params.min) : 1;
      const n = meals.length;
      return n >= min
        ? { status: 'met', value: n, detail: `${n} meals` }
        : { status: 'missed', value: n, detail: `${n}<${min} meals` };
    } catch (err) {
      return { status: 'unavailable', detail: String(err?.message || err) };
    }
  },
  'nutrition.protein_target_met'(records, date, params = {}) {
    try {
      const meals = mealsOnDate(records, date);
      if (!meals.length) return { status: 'no_evidence', detail: 'no meals' };
      const target = Number(params.target ?? params.protein_g);
      if (!Number.isFinite(target) || target <= 0) {
        return { status: 'unavailable', detail: 'protein target missing' };
      }
      const protein = dayProtein(records, date);
      return protein >= target
        ? { status: 'met', value: protein, detail: `${protein}/${target}g` }
        : { status: 'missed', value: protein, detail: `${protein}/${target}g` };
    } catch (err) {
      return { status: 'unavailable', detail: String(err?.message || err) };
    }
  },
  'nutrition.kcal_within_target'(records, date, params = {}) {
    try {
      const meals = mealsOnDate(records, date);
      if (!meals.length) return { status: 'no_evidence', detail: 'no meals' };
      const target = Number(params.target ?? params.calories);
      if (!Number.isFinite(target) || target <= 0) {
        return { status: 'unavailable', detail: 'kcal target missing' };
      }
      const kcal = dayKcal(records, date);
      const tol = Number(params.tolerance) >= 0 ? Number(params.tolerance) : target * 0.1;
      return Math.abs(kcal - target) <= tol
        ? { status: 'met', value: kcal, detail: `${kcal}/${target}` }
        : { status: 'missed', value: kcal, detail: `${kcal}/${target}` };
    } catch (err) {
      return { status: 'unavailable', detail: String(err?.message || err) };
    }
  },
  'fitness.workout_completed'(records, date) {
    try {
      const hits = (records ?? []).filter(
        r => r?.type === 'workout' && r.date === date && r.status === 'completed'
      );
      if (!hits.length) {
        const any = (records ?? []).some(r => r?.type === 'workout' && r.date === date);
        return any
          ? { status: 'missed', detail: 'workout not completed' }
          : { status: 'no_evidence', detail: 'no workout' };
      }
      return { status: 'met', value: hits.length, detail: `${hits.length} completed` };
    } catch (err) {
      return { status: 'unavailable', detail: String(err?.message || err) };
    }
  },
  'body.measurements.waist'(records, date) {
    try {
      const v = tapeOnDate(records, date, 'waist');
      return v == null
        ? { status: 'no_evidence', detail: 'no waist' }
        : { status: 'met', value: v, detail: `${v} cm` };
    } catch (err) {
      return { status: 'unavailable', detail: String(err?.message || err) };
    }
  },
  'body.measurements.hips'(records, date) {
    try {
      const v = tapeOnDate(records, date, 'hips');
      return v == null
        ? { status: 'no_evidence', detail: 'no hips' }
        : { status: 'met', value: v, detail: `${v} cm` };
    } catch (err) {
      return { status: 'unavailable', detail: String(err?.message || err) };
    }
  },
  'body.weight'(records, date) {
    try {
      const v = weightOnDate(records, date);
      return v == null
        ? { status: 'no_evidence', detail: 'no weight' }
        : { status: 'met', value: v, detail: `${v} kg` };
    } catch (err) {
      return { status: 'unavailable', detail: String(err?.message || err) };
    }
  },
  'mind.diary_entry'(records, date) {
    try {
      const hits = (records ?? []).filter(r => r?.type === 'diary' && r.date === date);
      return hits.length
        ? { status: 'met', value: hits.length, detail: 'diary logged' }
        : { status: 'no_evidence', detail: 'no diary' };
    } catch (err) {
      return { status: 'unavailable', detail: String(err?.message || err) };
    }
  },
  self_report(records, date, params = {}, ctx = {}) {
    try {
      const checkins = ctx.checkins ?? [];
      const hit = checkins.find(c => c?.date === date);
      if (!hit) return { status: 'no_evidence', detail: 'no check-in' };
      const lane = params.lane_agent ? hit.lanes?.[params.lane_agent] : null;
      if (params.lane_agent && !lane) return { status: 'no_evidence', detail: 'lane silent' };
      return { status: 'met', detail: lane?.note || hit.kind || 'check-in' };
    } catch (err) {
      return { status: 'unavailable', detail: String(err?.message || err) };
    }
  }
});

export function runEvidenceAdapter(sourceId, records, date, params = {}, ctx = {}) {
  const adapter = EVIDENCE_ADAPTERS[sourceId];
  if (!adapter) return { status: 'unavailable', detail: `unknown source ${sourceId}` };
  try {
    return adapter(records, date, params, ctx);
  } catch (err) {
    return { status: 'unavailable', detail: String(err?.message || err) };
  }
}

function dateRange(start, end) {
  if (!isCalendarDate(start) || !isCalendarDate(end)) return [];
  const out = [];
  let cur = start;
  while (cur <= end) {
    out.push(cur);
    cur = addCalendarDays(cur, 1);
  }
  return out;
}

function laneMeasureResult(measure, records, date, sprint) {
  const source = measure?.evidence?.source || 'self_report';
  const params = { ...(measure?.evidence || {}), lane_agent: measure._laneAgent };
  delete params.source;
  return runEvidenceAdapter(source, records, date, params, { checkins: sprint?.checkins ?? [] });
}

function summarizeLane(lane, sprint, records, today, daysSoFar) {
  const measures = Array.isArray(lane?.lead_measures) ? lane.lead_measures : [];
  const perDay = [];
  let metDays = 0;
  let evidenceDays = 0;
  let consecutiveMiss = 0;
  let consecutiveNoEvidence = 0;
  let unavailable = false;
  const measureSummaries = [];

  for (const measure of measures) {
    let met = 0;
    let judged = 0;
    for (const date of daysSoFar) {
      const result = laneMeasureResult({ ...measure, _laneAgent: lane.agent }, records, date, sprint);
      if (result.status === 'unavailable') {
        unavailable = true;
        continue;
      }
      if (result.status === 'no_evidence') continue;
      judged += 1;
      if (result.status === 'met') met += 1;
    }
    const todayResult = laneMeasureResult({ ...measure, _laneAgent: lane.agent }, records, today, sprint);
    measureSummaries.push({
      id: measure.id,
      label: measure.label || measure.id,
      met,
      judged,
      today: todayResult
    });
  }

  for (const date of daysSoFar) {
    if (!measures.length) {
      const self = runEvidenceAdapter('self_report', records, date, { lane_agent: lane.agent }, { checkins: sprint?.checkins ?? [] });
      perDay.push(self);
      if (self.status === 'unavailable') unavailable = true;
      else if (self.status === 'no_evidence') {
        consecutiveNoEvidence += 1;
        consecutiveMiss = 0;
      } else if (self.status === 'met') {
        evidenceDays += 1;
        metDays += 1;
        consecutiveMiss = 0;
        consecutiveNoEvidence = 0;
      } else {
        evidenceDays += 1;
        consecutiveMiss += 1;
        consecutiveNoEvidence = 0;
      }
      continue;
    }
    const results = measures.map(m => laneMeasureResult({ ...m, _laneAgent: lane.agent }, records, date, sprint));
    if (results.every(r => r.status === 'unavailable')) {
      unavailable = true;
      perDay.push({ status: 'unavailable' });
      continue;
    }
    const actionable = results.filter(r => r.status !== 'unavailable' && r.status !== 'no_evidence');
    if (!actionable.length) {
      consecutiveNoEvidence += 1;
      consecutiveMiss = 0;
      perDay.push({ status: 'no_evidence' });
      continue;
    }
    evidenceDays += 1;
    consecutiveNoEvidence = 0;
    const dayMet = actionable.every(r => r.status === 'met');
    if (dayMet) {
      metDays += 1;
      consecutiveMiss = 0;
      perDay.push({ status: 'met' });
    } else {
      consecutiveMiss += 1;
      perDay.push({ status: 'missed' });
    }
  }

  let status = 'on_track';
  if (unavailable && evidenceDays === 0 && metDays === 0) status = 'unavailable';
  else if (consecutiveNoEvidence >= 2) status = 'no_evidence';
  else if (consecutiveMiss >= 2) status = 'stalled';
  else if (evidenceDays > 0 && metDays / evidenceDays < 0.7) status = 'stalled';
  else if (evidenceDays === 0 && daysSoFar.length >= 2) status = 'no_evidence';

  return {
    agent: lane.agent,
    role: lane.role || '',
    status,
    metDays,
    evidenceDays,
    measureSummaries,
    todayEvidence: measures.length
      ? measures.map(m => ({
        id: m.id,
        label: m.label || m.id,
        ...laneMeasureResult({ ...m, _laneAgent: lane.agent }, records, today, sprint)
      }))
      : [runEvidenceAdapter('self_report', records, today, { lane_agent: lane.agent }, { checkins: sprint?.checkins ?? [] })]
  };
}

function headlineSeries(sprint, records) {
  const headline = sprint?.headline;
  if (!headline?.metric?.source) return { label: headline?.label || null, readings: [], latest: null, baseline: null, delta: null };
  const source = headline.metric.source;
  const field = source.endsWith('.waist') ? 'waist' : source.endsWith('.hips') ? 'hips' : source === 'body.weight' ? 'weight' : null;
  const readings = [];
  const start = sprint.start_date;
  const end = sprint.end_date;
  for (const date of dateRange(start, end)) {
    let value = null;
    if (field === 'waist' || field === 'hips') value = tapeOnDate(records, date, field);
    else if (field === 'weight') value = weightOnDate(records, date);
    else {
      const r = runEvidenceAdapter(source, records, date, headline.metric);
      if (r.status === 'met' && r.value != null) value = r.value;
    }
    if (value != null) readings.push({ date, value });
  }
  const baselineExplicit = headline.metric.baseline;
  const baseline = baselineExplicit != null && Number.isFinite(Number(baselineExplicit))
    ? Number(baselineExplicit)
    : readings[0]?.value ?? null;
  const latest = readings.length ? readings[readings.length - 1] : null;
  const delta = latest && baseline != null ? latest.value - baseline : null;
  const secondary = Array.isArray(headline.secondary)
    ? headline.secondary.map(sec => {
      const secSource = sec?.source || '';
      const secField = secSource.endsWith('.hips') ? 'hips' : secSource.endsWith('.waist') ? 'waist' : null;
      const secReadings = [];
      for (const date of dateRange(start, end)) {
        const v = secField ? tapeOnDate(records, date, secField) : null;
        if (v != null) secReadings.push({ date, value: v });
      }
      return {
        label: sec.label,
        unit: sec.unit,
        readings: secReadings,
        latest: secReadings.length ? secReadings[secReadings.length - 1] : null,
        baseline: secReadings[0]?.value ?? null
      };
    })
    : [];
  return {
    label: headline.label || headline.metric.label,
    metricLabel: headline.metric.label,
    unit: headline.metric.unit || '',
    direction: headline.metric.direction || 'down',
    readings,
    latest,
    baseline,
    delta,
    secondary
  };
}

/**
 * Pure computed sprint state — single source for prompt / card / nudge / reviews.
 */
export function computeSprintState(sprint, records, today) {
  if (!sprint || typeof sprint !== 'object') {
    return { ok: false, reason: 'missing sprint' };
  }
  const start = sprint.start_date;
  const end = sprint.end_date;
  const length = sprintLengthDays(sprint);
  const dayIndex = daysBetween(start, today);
  const dayN = dayIndex == null ? null : dayIndex + 1;
  const cadence = resolveCadence(sprint);
  const endedAwaitingReview = Boolean(
    isCalendarDate(end) && isCalendarDate(today) && today > end && sprint.status !== 'closed'
  );
  const open = sprint.status === 'open' || (!sprint.status && !endedAwaitingReview);
  const daysSoFar = dateRange(start, today <= end ? today : end).filter(d => d <= today);
  const lanes = (Array.isArray(sprint.lanes) ? sprint.lanes : []).map(lane =>
    summarizeLane(lane, sprint, records, today, daysSoFar)
  );
  const checkins = Array.isArray(sprint.checkins) ? sprint.checkins : [];
  const todayCheckin = checkins.find(c => c?.date === today && (c.kind === 'daily' || !c.kind)) || null;
  const lanesWithEvidenceToday = lanes.filter(l =>
    (l.todayEvidence || []).some(e => e.status === 'met' || e.status === 'missed')
  ).length;

  return {
    ok: true,
    id: sprint.id,
    title: sprint.title,
    kind: sprint.kind || (Array.isArray(sprint.lanes) && sprint.lanes.length ? 'sprint' : 'challenge'),
    lead_agent: sprint.lead_agent || 'hammond',
    status: endedAwaitingReview ? 'ended_awaiting_review' : (sprint.status || 'open'),
    open: open && !endedAwaitingReview,
    ended_awaiting_review: endedAwaitingReview,
    start_date: start,
    end_date: end,
    length_days: length,
    day_n: dayN,
    day_label: dayN != null && length != null ? `day ${dayN} of ${length}` : null,
    cadence,
    headline: headlineSeries(sprint, records),
    lanes,
    checkin_done_today: Boolean(todayCheckin),
    today_checkin: todayCheckin,
    lanes_with_evidence_today: lanesWithEvidenceToday,
    lane_count: lanes.length,
    checkins
  };
}

export function isOpenSprint(sprint, today) {
  if (!sprint || sprint.status === 'closed') return false;
  if (sprint.kind !== 'sprint' && !(Array.isArray(sprint.lanes) && sprint.lanes.length)) return false;
  if (!isCalendarDate(sprint.end_date) || !isCalendarDate(today)) return sprint.status === 'open';
  return sprint.status === 'open' || today <= addCalendarDays(sprint.end_date, 7);
}

export function listActiveSprints(challenges, today) {
  return (challenges ?? [])
    .filter(c => isOpenSprint(c, today) || (c?.kind === 'sprint' && c.status !== 'closed'))
    .filter(c => {
      const state = computeSprintState(c, [], today);
      return state.open || state.ended_awaiting_review;
    });
}

export function validateLaneAgent(slug) {
  if (typeof slug !== 'string' || !slug.trim()) return { ok: false, reason: 'lane agent is required' };
  const id = slug.trim().toLowerCase();
  if (!(id in SPRINT_ROSTER)) {
    return { ok: false, reason: `Unknown agent "${slug}" — not on the sprint roster` };
  }
  if (!SPRINT_AWARE_AGENTS.includes(id)) {
    return { ok: false, reason: `Agent "${slug}" has no sprint-aware chat entrypoint` };
  }
  return { ok: true, slug: id };
}

export function validateEvidenceSource(source) {
  if (source === 'self_report') return { ok: true };
  if (EVIDENCE_SOURCES.includes(source) || source in EVIDENCE_ADAPTERS) return { ok: true };
  return { ok: false, reason: `Unknown evidence source "${source}"` };
}

export function nudgeHourFromTime(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? ''));
  if (!m) return null;
  return Number(m[1]) + Number(m[2]) / 60;
}

/**
 * Pure: sprint daily nudge candidates (no AI). Priority over nice-to-haves is
 * applied by the caller when merging with day-sense.
 */
export function decideSprintNudges({ sprints, records, today, nowHour, log }) {
  const out = [];
  const unsent = (key) => !log?.sent?.[key];
  for (const sprint of sprints ?? []) {
    const state = computeSprintState(sprint, records ?? [], today);
    if (!state.ok) continue;
    if (state.ended_awaiting_review && unsent(`sprint-final-${state.id}`)) {
      out.push({
        key: `sprint-final-${state.id}`,
        title: state.title,
        body: `Ended — final review for ${state.title}`,
        url: `/#/chat/hammond?protocol=sprint-final&sprint=${encodeURIComponent(state.id)}`,
        priority: 1
      });
      continue;
    }
    if (!state.open || !state.cadence.daily_check) continue;
    if (state.checkin_done_today) continue;
    const nudgeAt = nudgeHourFromTime(state.cadence.daily_nudge_time) ?? 19.5;
    if (nowHour < nudgeAt || nowHour >= nudgeAt + 1) continue;
    const key = `sprint-daily-${state.id}-${today}`;
    if (!unsent(key)) continue;
    const dayLabel = state.day_label || 'sprint';
    out.push({
      key,
      title: state.title,
      body: `Blitz ${dayLabel} · ${state.lanes_with_evidence_today} of ${state.lane_count} lanes have evidence · 60-second check-in`,
      url: `/#/chat/hammond?protocol=sprint-checkin&sprint=${encodeURIComponent(state.id)}`,
      priority: 1
    });
  }
  return out;
}
