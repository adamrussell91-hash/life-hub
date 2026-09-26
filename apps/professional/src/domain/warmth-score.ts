/**
 * People redesign Phase 3 — warmth score.
 * KEEP IN SYNC with `netlify/functions/_shared/warmth-score.mjs`.
 */

export const TOUCH_WEIGHTS = {
  meeting: 1.0,
  event: 1.0,
  communication_live: 0.9,
  communication_message: 0.6,
  task_completed: 0.5,
  observation: 0.3,
  link_created: 0.2
} as const;

export const HALF_LIFE_DAYS = {
  inner: 10,
  current: 30,
  former: 90,
  wider: 180
} as const;

export type ClosenessTier = keyof typeof HALF_LIFE_DAYS;
export type WarmthBand = 'warm' | 'cooling' | 'cold';
export type WarmthState = 'new' | 'reactivated' | 'active' | 'cooling' | 'dormant';

export const WARMTH_BAND_WARM = 60;
export const WARMTH_BAND_COOLING = 30;
export const NEW_CONNECTION_DAYS = 14;
export const REACTIVATED_LOOKBACK_DAYS = 90;

const DAY_MS = 86_400_000;

function daysBetween(earlierMs: number, laterMs: number): number {
  return (laterMs - earlierMs) / DAY_MS;
}

export interface ClosenessFlags {
  isMentorOrMentee?: boolean;
  isLeaderAtCurrentWorkplace?: boolean;
  isActiveProjectCollaborator?: boolean;
  isCurrentColleagueOrMember?: boolean;
  isFormerColleagueOrEmployer?: boolean;
}

export function closenessTier(links: ClosenessFlags = {}): ClosenessTier {
  if (links.isMentorOrMentee || links.isLeaderAtCurrentWorkplace || links.isActiveProjectCollaborator) {
    return 'inner';
  }
  if (links.isCurrentColleagueOrMember) return 'current';
  if (links.isFormerColleagueOrEmployer) return 'former';
  return 'wider';
}

export function closenessFromRelationships(
  relationships: Array<{ link?: Record<string, unknown> } | Record<string, unknown>> = []
): ClosenessFlags {
  let isMentorOrMentee = false;
  let isLeaderAtCurrentWorkplace = false;
  let isActiveProjectCollaborator = false;
  let isCurrentColleagueOrMember = false;
  let isFormerColleagueOrEmployer = false;

  for (const entry of relationships) {
    const link = ((entry as { link?: Record<string, unknown> }).link ?? entry) as Record<string, unknown>;
    const role = String(link.role ?? '').toLowerCase();
    const type = String(link.relationship_type ?? '');
    const current =
      link.status === 'current' || (!link.valid_to && link.status !== 'ended' && link.status !== 'archived');

    if (type === 'professional_relationship') {
      if (current && (role === 'mentor' || role === 'mentee')) isMentorOrMentee = true;
      if (current && (role === 'colleague' || role === 'research_collaborator')) {
        isCurrentColleagueOrMember = true;
      }
      if (role === 'former_colleague') isFormerColleagueOrEmployer = true;
      const human = String((link.metadata as { human_label?: string } | undefined)?.human_label ?? '');
      if (current && /leader|rector|principal|head/.test(role + human)) {
        isLeaderAtCurrentWorkplace = true;
      }
    }
    if ((type === 'employee_at' || type === 'member_of') && current) isCurrentColleagueOrMember = true;
    if ((type === 'employee_at' || type === 'member_of') && !current) isFormerColleagueOrEmployer = true;
    if (type === 'collaborator' && current) isActiveProjectCollaborator = true;
  }

  return {
    isMentorOrMentee,
    isLeaderAtCurrentWorkplace,
    isActiveProjectCollaborator,
    isCurrentColleagueOrMember,
    isFormerColleagueOrEmployer
  };
}

export interface Touchpoint {
  type: string;
  at: string;
}

export function computeWarmthScore(
  touchpoints: Touchpoint[],
  tier: ClosenessTier = 'wider',
  nowIso?: string
): number {
  const nowMs = Date.parse(nowIso ?? new Date().toISOString());
  const halfLife = HALF_LIFE_DAYS[tier] ?? HALF_LIFE_DAYS.wider;
  let touchValue = 0;

  for (const tp of touchpoints ?? []) {
    const weight = TOUCH_WEIGHTS[tp.type as keyof typeof TOUCH_WEIGHTS] ?? 0;
    if (!weight || !tp.at) continue;
    const atMs = Date.parse(tp.at);
    if (!Number.isFinite(atMs)) continue;
    const ageDays = Math.max(0, daysBetween(atMs, nowMs));
    touchValue += weight * Math.pow(0.5, ageDays / halfLife);
  }

  const warmth = Math.round(100 * (1 - Math.exp(-touchValue / 1.5)));
  return Math.max(0, Math.min(100, warmth));
}

export function warmthBand(score: number): WarmthBand {
  if (score >= WARMTH_BAND_WARM) return 'warm';
  if (score >= WARMTH_BAND_COOLING) return 'cooling';
  return 'cold';
}

export interface WarmthForResult {
  warmth: number;
  band: WarmthBand;
  state: WarmthState;
  tier: ClosenessTier;
  reasons: string[];
  feedNote: string;
}

export function warmthFor(input: {
  touchpoints?: Touchpoint[];
  relationships?: Array<{ link?: Record<string, unknown> } | Record<string, unknown>>;
  personCreatedAt?: string;
  previousColdAt?: string | null;
  now?: string;
}): WarmthForResult {
  const nowIso = input.now ?? new Date().toISOString();
  const flags = closenessFromRelationships(input.relationships ?? []);
  const tier = closenessTier(flags);
  const warmth = computeWarmthScore(input.touchpoints ?? [], tier, nowIso);
  const band = warmthBand(warmth);
  const reasons: string[] = [];

  const createdMs = input.personCreatedAt ? Date.parse(input.personCreatedAt) : null;
  const nowMs = Date.parse(nowIso);
  const daysSinceCreated =
    createdMs !== null && Number.isFinite(createdMs) ? daysBetween(createdMs, nowMs) : null;

  let state: WarmthState;
  if (daysSinceCreated !== null && daysSinceCreated <= NEW_CONNECTION_DAYS && warmth < WARMTH_BAND_WARM) {
    state = 'new';
    reasons.push(
      `Connected ${Math.round(daysSinceCreated)} day${Math.round(daysSinceCreated) === 1 ? '' : 's'} ago.`
    );
  } else if (
    band === 'warm' &&
    input.previousColdAt &&
    daysBetween(Date.parse(input.previousColdAt), nowMs) <= REACTIVATED_LOOKBACK_DAYS
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

export function touchpointsFromOverview(input: {
  timeline?: Array<{ date?: string | null; kind?: string; label?: string }>;
  linkedRecords?: {
    meetings?: Array<{ occurred_at?: string; start?: string; date?: string }>;
    events?: Array<{ occurred_at?: string; start?: string; date?: string }>;
    tasks?: Array<{
      lifecycle_status?: string;
      status?: string;
      completed_at?: string;
      updated_at?: string;
      date?: string;
    }>;
  };
  relationships?: Array<{ link?: { occurred_at?: string | null; valid_from?: string | null; created_at?: string } }>;
}): Touchpoint[] {
  const points: Touchpoint[] = [];

  for (const item of input.timeline ?? []) {
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

  for (const meeting of input.linkedRecords?.meetings ?? []) {
    const at = meeting.occurred_at ?? meeting.start ?? meeting.date;
    if (at) points.push({ type: 'meeting', at });
  }
  for (const event of input.linkedRecords?.events ?? []) {
    const at = event.occurred_at ?? event.start ?? event.date;
    if (at) points.push({ type: 'event', at });
  }
  for (const task of input.linkedRecords?.tasks ?? []) {
    if (task.lifecycle_status === 'done' || task.status === 'done') {
      const at = task.completed_at ?? task.updated_at ?? task.date;
      if (at) points.push({ type: 'task_completed', at });
    }
  }
  for (const entry of input.relationships ?? []) {
    const at = entry.link?.occurred_at ?? entry.link?.valid_from ?? entry.link?.created_at;
    if (at) points.push({ type: 'link_created', at });
  }

  return points;
}
