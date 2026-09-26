/**
 * One model for crest tile, header, chips, warmth spread, and arc (V4).
 */

import type { WarmthBand } from './warmth-score';
import type { ArcPoint } from './relationship-arc';

export type RelationshipChipKind =
  | 'workplace'
  | 'workplace_former'
  | 'studied'
  | 'placement'
  | 'member'
  | 'accreditation'
  | 'event_venue'
  | 'pd_provider'
  | 'you_presented'
  | 'applied'
  | 'prospect';

export interface RelationshipChip {
  kind: RelationshipChipKind;
  label: string;
  detail: string;
  /** Filter bucket for crest-wall segments. */
  filterBucket: 'work' | 'study' | 'events' | 'bodies' | 'prospects';
}

export interface WarmthSpread {
  warm: number;
  cooling: number;
  cold: number;
  total: number;
}

export interface OrganisationTimelineLane {
  id: string;
  kind: 'work_study' | 'events' | 'roles';
  label: string;
  start: string;
  end: string | null;
}

export interface OrganisationPeopleStep {
  at: string;
  count: number;
  personId: string;
}

export interface OrganisationModel {
  id: string;
  ref: string;
  displayName: string;
  legalName: string | null;
  monogram: string;
  logoKey: string | null;
  chips: RelationshipChip[];
  peopleCount: number;
  peopleIds: string[];
  warmthSpread: WarmthSpread;
  /** Mini arc on shared 2019→now scale (tile). */
  arcPoints: ArcPoint[];
  /** Current workplace tile spans two columns. */
  isCurrentWorkplace: boolean;
  firstTouchAt: string | null;
  lastActivityAt: string | null;
  timelineLanes: OrganisationTimelineLane[];
  peopleSteps: OrganisationPeopleStep[];
  metaLine: string;
}

export interface OrganisationModelInput {
  id: string;
  ref: string;
  displayName: string;
  legalName?: string | null;
  logoKey?: string | null;
  chips: RelationshipChip[];
  people: Array<{ id: string; warmthBand: WarmthBand; firstLinkAt: string | null }>;
  arcPoints?: ArcPoint[];
  timelineLanes?: OrganisationTimelineLane[];
  firstTouchAt?: string | null;
  lastActivityAt?: string | null;
  now?: string;
}

const ARC_DOMAIN_START = '2019-01-01T00:00:00.000Z';

export function orgMonogram(name: string): string {
  const words = String(name || '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 'ORG';
  if (words.length === 1) return words[0]!.slice(0, 3).toUpperCase();
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export function buildWarmthSpread(
  people: Array<{ warmthBand: WarmthBand }>
): WarmthSpread {
  const spread: WarmthSpread = { warm: 0, cooling: 0, cold: 0, total: people.length };
  for (const p of people) {
    if (p.warmthBand === 'warm') spread.warm += 1;
    else if (p.warmthBand === 'cooling') spread.cooling += 1;
    else spread.cold += 1;
  }
  return spread;
}

/** Cumulative people known, stepping at each person's first-link date. */
export function buildPeopleSteps(
  people: Array<{ id: string; firstLinkAt: string | null }>
): OrganisationPeopleStep[] {
  const dated = people
    .map((p) => ({ id: p.id, at: p.firstLinkAt }))
    .filter((p): p is { id: string; at: string } => Boolean(p.at))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const steps: OrganisationPeopleStep[] = [];
  const seen = new Set<string>();
  for (const p of dated) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    steps.push({ at: p.at, count: seen.size, personId: p.id });
  }
  return steps;
}

export function formatYearSpan(from: string | null, to: string | null, nowIso: string): string {
  const startY = from ? yearLabel(from) : null;
  if (!startY) return '';
  if (!to) return `${startY}–now`;
  const endMs = Date.parse(to);
  const nowMs = Date.parse(nowIso);
  if (Number.isFinite(endMs) && endMs > nowMs) return `${startY}–now`;
  return `${startY}–${yearLabel(to)}`;
}

/** Month-only → "Oct 2026"; day → dd/mm/yy via caller; year abbreviate. */
export function yearLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getUTCFullYear();
  const short = String(y).slice(2);
  return short;
}

export function formatMonthYear(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function buildOrganisationModel(input: OrganisationModelInput): OrganisationModel {
  const now = input.now ?? new Date().toISOString();
  const peopleIds = [...new Set(input.people.map((p) => p.id))];
  const dedupedPeople = peopleIds.map((id) => {
    const matches = input.people.filter((p) => p.id === id);
    const first = matches.reduce<string | null>((earliest, p) => {
      if (!p.firstLinkAt) return earliest;
      if (!earliest) return p.firstLinkAt;
      return Date.parse(p.firstLinkAt) < Date.parse(earliest) ? p.firstLinkAt : earliest;
    }, null);
    // Prefer warmest band if multiple memberships
    const bandOrder: WarmthBand[] = ['warm', 'cooling', 'cold'];
    const warmthBand =
      bandOrder.find((b) => matches.some((m) => m.warmthBand === b)) ?? 'cold';
    return { id, warmthBand, firstLinkAt: first };
  });

  const warmthSpread = buildWarmthSpread(dedupedPeople);
  const peopleSteps = buildPeopleSteps(dedupedPeople);
  const isCurrentWorkplace = input.chips.some((c) => c.kind === 'workplace');

  const arcPoints =
    input.arcPoints ??
    peopleSteps
      .filter((s) => Date.parse(s.at) >= Date.parse(ARC_DOMAIN_START))
      .map((s) => ({ id: s.personId, at: s.at, label: String(s.count) }));

  const firstTouchAt =
    input.firstTouchAt ??
    peopleSteps[0]?.at ??
    null;
  const lastActivityAt = input.lastActivityAt ?? now;

  const peopleWord = dedupedPeople.length === 1 ? 'person' : 'people';
  const metaLine = `${dedupedPeople.length} ${peopleWord}${
    firstTouchAt ? ` · first ${formatMonthYear(firstTouchAt)}` : ''
  }`;

  return {
    id: input.id,
    ref: input.ref,
    displayName: input.displayName,
    legalName: input.legalName ?? null,
    monogram: orgMonogram(input.displayName),
    logoKey: input.logoKey ?? null,
    chips: input.chips,
    peopleCount: dedupedPeople.length,
    peopleIds,
    warmthSpread,
    arcPoints,
    isCurrentWorkplace,
    firstTouchAt,
    lastActivityAt,
    timelineLanes: input.timelineLanes ?? [],
    peopleSteps,
    metaLine
  };
}

/** Chip kind → crest-wall filter bucket. */
export function chipMatchesFilter(
  chips: RelationshipChip[],
  filter: import('./organisations-query').OrgsFilter
): boolean {
  if (filter === 'all') return true;
  return chips.some((c) => c.filterBucket === filter);
}
