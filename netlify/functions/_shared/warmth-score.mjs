/**
 * People redesign Phase 3 — warmth score (0–100).
 *
 * KEEP IN SYNC with `apps/professional/src/domain/warmth-score.ts`.
 *
 * touch_value = Σ weight(type) · 0.5 ^ (age_days / half_life)
 * warmth      = round(100 · (1 − e^(−touch_value / 1.5)))
 *
 * Bands: ≥ 60 warm · 30–59 cooling · < 30 cold.
 * New = connected in last 14 days. Reactivated = warm now after cold within 90 days.
 */

export const TOUCH_WEIGHTS = Object.freeze({
  meeting: 1.0,
  event: 1.0,
  communication_live: 0.9,
  communication_message: 0.6,
  task_completed: 0.5,
  observation: 0.3,
  link_created: 0.2
});

export const HALF_LIFE_DAYS = Object.freeze({
  inner: 10,
  current: 30,
  former: 90,
  wider: 180
});

export const WARMTH_BAND_WARM = 60;
export const WARMTH_BAND_COOLING = 30;
export const NEW_CONNECTION_DAYS = 14;
export const REACTIVATED_LOOKBACK_DAYS = 90;

const DAY_MS = 86_400_000;

function daysBetween(earlierMs, laterMs) {
  return (laterMs - earlierMs) / DAY_MS;
}

/**
 * Tightest applicable tier (BUILD-PLAN Phase 3).
 * @param {{
 *   isMentorOrMentee?: boolean,
 *   isLeaderAtCurrentWorkplace?: boolean,
 *   isActiveProjectCollaborator?: boolean,
 *   isCurrentColleagueOrMember?: boolean,
 *   isFormerColleagueOrEmployer?: boolean
 * }} links
 */
export function closenessTier(links = {}) {
  if (
    links.isMentorOrMentee ||
    links.isLeaderAtCurrentWorkplace ||
    links.isActiveProjectCollaborator
  ) {
    return 'inner';
  }
  if (links.isCurrentColleagueOrMember) return 'current';
  if (links.isFormerColleagueOrEmployer) return 'former';
  return 'wider';
}

/**
 * Infer closeness flags from relationship entries (person overview style).
 */
export function closenessFromRelationships(relationships = []) {
  let isMentorOrMentee = false;
  let isLeaderAtCurrentWorkplace = false;
  let isActiveProjectCollaborator = false;
  let isCurrentColleagueOrMember = false;
  let isFormerColleagueOrEmployer = false;

  for (const entry of relationships) {
    const link = entry.link ?? entry;
    const role = (link.role ?? '').toLowerCase();
    const type = link.relationship_type;
    const current =
      link.status === 'current' || (!link.valid_to && link.status !== 'ended' && link.status !== 'archived');

    if (type === 'professional_relationship') {
      if (current && (role === 'mentor' || role === 'mentee')) isMentorOrMentee = true;
      if (current && (role === 'colleague' || role === 'research_collaborator')) {
        isCurrentColleagueOrMember = true;
      }
      if ((!current || role === 'former_colleague') && role === 'former_colleague') {
        isFormerColleagueOrEmployer = true;
      }
      if (current && /leader|rector|principal|head/.test(role + (link.metadata?.human_label ?? ''))) {
        isLeaderAtCurrentWorkplace = true;
      }
    }
    if ((type === 'employee_at' || type === 'member_of') && current) {
      isCurrentColleagueOrMember = true;
    }
    if ((type === 'employee_at' || type === 'member_of') && !current) {
      isFormerColleagueOrEmployer = true;
    }
    if (type === 'collaborator' && current) {
      isActiveProjectCollaborator = true;
    }
  }

  return {
    isMentorOrMentee,
    isLeaderAtCurrentWorkplace,
    isActiveProjectCollaborator,
    isCurrentColleagueOrMember,
    isFormerColleagueOrEmployer
  };
}

/**
 * @param {Array<{ type: string, at: string }>} touchpoints
 * @param {string} tier — inner|current|former|wider
 * @param {string} [nowIso]
 */
export function computeWarmthScore(touchpoints, tier = 'wider', nowIso) {
  const nowMs = Date.parse(nowIso ?? new Date().toISOString());
  const halfLife = HALF_LIFE_DAYS[tier] ?? HALF_LIFE_DAYS.wider;
  let touchValue = 0;

  for (const tp of touchpoints ?? []) {
    const weight = TOUCH_WEIGHTS[tp.type] ?? 0;
    if (!weight || !tp.at) continue;
    const atMs = Date.parse(tp.at);
    if (!Number.isFinite(atMs)) continue;
    const ageDays = Math.max(0, daysBetween(atMs, nowMs));
    touchValue += weight * Math.pow(0.5, ageDays / halfLife);
  }

  const warmth = Math.round(100 * (1 - Math.exp(-touchValue / 1.5)));
  return Math.max(0, Math.min(100, warmth));
}

export function warmthBand(score) {
  if (score >= WARMTH_BAND_WARM) return 'warm';
  if (score >= WARMTH_BAND_COOLING) return 'cooling';
  return 'cold';
}

/**
 * Derive relationship-state band word from warmth score + connection history.
 * Extends relationship-state so ring / row / sort / state share one number (V4).
 *
 * @returns {{
 *   warmth: number,
 *   band: 'warm'|'cooling'|'cold',
 *   state: 'new'|'reactivated'|'active'|'cooling'|'dormant',
 *   tier: string,
 *   reasons: string[],
 *   feedNote: string
 * }}
 */
export function warmthFor({
  touchpoints = [],
  relationships = [],
  personCreatedAt,
  previousColdAt = null,
  now
} = {}) {
  const nowIso = now ?? new Date().toISOString();
  const flags = closenessFromRelationships(relationships);
  const tier = closenessTier(flags);
  const warmth = computeWarmthScore(touchpoints, tier, nowIso);
  const band = warmthBand(warmth);
  const reasons = [];

  const createdMs = personCreatedAt ? Date.parse(personCreatedAt) : null;
  const nowMs = Date.parse(nowIso);
  const daysSinceCreated =
    createdMs !== null && Number.isFinite(createdMs) ? daysBetween(createdMs, nowMs) : null;

  let state;
  if (daysSinceCreated !== null && daysSinceCreated <= NEW_CONNECTION_DAYS && warmth < WARMTH_BAND_WARM) {
    state = 'new';
    reasons.push(`Connected ${Math.round(daysSinceCreated)} day${Math.round(daysSinceCreated) === 1 ? '' : 's'} ago.`);
  } else if (
    band === 'warm' &&
    previousColdAt &&
    daysBetween(Date.parse(previousColdAt), nowMs) <= REACTIVATED_LOOKBACK_DAYS
  ) {
    state = 'reactivated';
    reasons.push('Warm again after a cold stretch.');
  } else if (band === 'warm') {
    state = 'active';
    reasons.push(`Warmth ${warmth} (${tier} half-life ${HALF_LIFE_DAYS[tier]}d).`);
  } else if (band === 'cooling') {
    state = 'cooling';
    reasons.push(`Warmth ${warmth} — cooling.`);
  } else {
    state = 'dormant';
    reasons.push(`Warmth ${warmth} — cold.`);
  }

  return {
    warmth,
    band,
    state,
    tier,
    reasons,
    feedNote: 'Based on meetings, tasks and notes'
  };
}

/**
 * Build touchpoints from overview-shaped data (meetings, events, tasks, observations, links).
 * Communications feed lands later — until then this reduced set is honest (D1).
 */
export function touchpointsFromOverview({
  timeline = [],
  linkedRecords = {},
  relationships = []
} = {}) {
  const points = [];

  for (const item of timeline) {
    if (!item.date) continue;
    let type = 'link_created';
    const kind = String(item.kind || '').toLowerCase();
    const label = String(item.label || '').toLowerCase();
    if (kind.includes('meeting') || label.includes('meeting')) type = 'meeting';
    else if (kind.includes('event') || label.includes('event')) type = 'event';
    else if (kind.includes('task') || label.includes('completed')) type = 'task_completed';
    else if (kind.includes('observation') || kind.includes('note')) type = 'observation';
    points.push({ type, at: item.date });
  }

  for (const meeting of linkedRecords.meetings ?? []) {
    const at = meeting.occurred_at ?? meeting.start ?? meeting.date;
    if (at) points.push({ type: 'meeting', at });
  }
  for (const event of linkedRecords.events ?? []) {
    const at = event.occurred_at ?? event.start ?? event.date;
    if (at) points.push({ type: 'event', at });
  }
  for (const task of linkedRecords.tasks ?? []) {
    if (task.lifecycle_status === 'done' || task.status === 'done') {
      const at = task.completed_at ?? task.updated_at ?? task.date;
      if (at) points.push({ type: 'task_completed', at });
    }
  }
  for (const entry of relationships) {
    const at = entry.link?.occurred_at ?? entry.link?.valid_from ?? entry.link?.created_at;
    if (at) points.push({ type: 'link_created', at });
  }

  return points;
}
