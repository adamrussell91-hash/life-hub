/**
 * People redesign Phase 1 — one model for directory row signals and the
 * person pane (failure register V4).
 */

import type { EntityOverview, PersonBrief, RelationshipLink } from '@/domain/types';
import { classifyRelationshipState, type RelationshipState } from '@/domain/relationship-state';

export type WarmthBand = 'warm' | 'cooling' | 'cold';

export interface PersonModelChip {
  kind: 'relationship' | 'organisation' | 'warmth';
  label: string;
  orgMonogram?: string | null;
}

export interface PersonModelLedgerItem {
  id: string;
  direction: 'you_owe' | 'they_owe';
  text: string;
  sourceLabel: string;
  href: string | null;
}

export interface PersonModelArcPoint {
  id: string;
  at: string;
  label: string;
  kind: string;
}

export interface PersonModel {
  id: string;
  ref: string;
  displayName: string;
  initials: string;
  roleLine: string;
  chips: PersonModelChip[];
  warmth: number;
  warmthBand: WarmthBand;
  relationshipState: RelationshipState;
  relationshipReasons: string[];
  openItemCount: number;
  youOweCount: number;
  theyOweCount: number;
  ledgerYouOwe: PersonModelLedgerItem[];
  ledgerTheyOwe: PersonModelLedgerItem[];
  next: { title: string; detail: string; href: string | null } | null;
  arcPoints: PersonModelArcPoint[];
  organisation: {
    ref: string;
    displayName: string;
    monogram: string;
    current: boolean;
  } | null;
}

const ROLE_LABELS: Record<string, string> = {
  colleague: 'Colleague',
  former_colleague: 'Former colleague',
  mentor: 'Mentor',
  mentee: 'Mentee',
  academic_contact: 'Academic contact',
  research_collaborator: 'Research collaborator',
  recruiter: 'Recruiter',
  referee: 'Referee',
  conference_contact: 'Conference contact',
  introduction: 'Introduction',
  other: 'Other'
};

function monogram(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

function orgMonogram(name: string): string {
  const words = name
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

function isCurrent(link: RelationshipLink): boolean {
  return link.status === 'current' || (!link.valid_to && link.status !== 'ended' && link.status !== 'archived');
}

function effectiveDate(link: RelationshipLink): string | null {
  return link.occurred_at ?? link.valid_from ?? null;
}

function stateToWarmth(state: RelationshipState): { warmth: number; band: WarmthBand } {
  if (state === 'active' || state === 'reactivated') return { warmth: 70, band: 'warm' };
  if (state === 'cooling') return { warmth: 40, band: 'cooling' };
  if (state === 'new') return { warmth: 55, band: 'warm' };
  return { warmth: 15, band: 'cold' };
}

export interface BuildPersonModelInput {
  overview: EntityOverview;
  brief?: PersonBrief | null;
  now?: string;
}

export function buildPersonModel(input: BuildPersonModelInput): PersonModel {
  const { overview, brief = null } = input;
  const entity = overview.entity;
  if (entity.kind !== 'person') {
    throw new Error('buildPersonModel requires a person overview');
  }

  const current = overview.current_relationships ?? [];
  const historical = overview.historical_relationships ?? [];
  const all = [...current, ...historical];

  const pro = all.filter((e) => e.link.relationship_type === 'professional_relationship');
  const orgs = all.filter(
    (e) =>
      (e.link.relationship_type === 'employee_at' || e.link.relationship_type === 'member_of') &&
      e.endpoint.kind === 'organisation'
  );

  const proDates = pro
    .map((e) => effectiveDate(e.link))
    .filter((d): d is string => Boolean(d))
    .sort((a, b) => Date.parse(b) - Date.parse(a));

  const state = classifyRelationshipState({
    lastMeaningfulInteraction: proDates[0] ?? null,
    previousMeaningfulInteraction: proDates[1] ?? null,
    upcomingInteraction: brief?.header.next_interaction?.start ?? null,
    activeSharedContexts:
      pro.filter((e) => isCurrent(e.link)).length + orgs.filter((e) => isCurrent(e.link)).length,
    personCreatedAt: entity.created_at,
    now: input.now
  });
  const { warmth, band } = stateToWarmth(state.state);

  const chips: PersonModelChip[] = [];
  for (const entry of pro.filter((e) => isCurrent(e.link))) {
    const role = entry.link.role ?? 'other';
    const humanRaw = entry.link.metadata?.human_label;
    const human = typeof humanRaw === 'string' && humanRaw.trim() ? humanRaw.trim() : null;
    const base = human || ROLE_LABELS[role] || role;
    const label =
      role === 'mentor' || role === 'mentee'
        ? role === 'mentee'
          ? `Your mentee${human ? ` · ${human}` : ''}`
          : `Your mentor${human ? ` · ${human}` : ''}`
        : base;
    chips.push({ kind: 'relationship', label });
  }
  const primaryOrg = orgs.find((e) => isCurrent(e.link)) ?? orgs[0] ?? null;
  if (primaryOrg) {
    const name = primaryOrg.endpoint.display_label;
    chips.push({
      kind: 'organisation',
      label: `${isCurrent(primaryOrg.link) ? 'Colleague' : 'Former'} · ${name}`,
      orgMonogram: orgMonogram(name)
    });
  }
  chips.push({
    kind: 'warmth',
    label: `${band === 'warm' ? 'Warming' : band === 'cooling' ? 'Cooling' : 'Cold'} · ${warmth}`
  });

  const roleLine =
    chips.find((c) => c.kind === 'relationship')?.label ??
    (primaryOrg
      ? `${isCurrent(primaryOrg.link) ? 'At' : 'Formerly'} ${primaryOrg.endpoint.display_label}`
      : 'No relationship on record');

  const ledgerYouOwe: PersonModelLedgerItem[] = (brief?.open_loops ?? []).map((loop) => ({
    id: loop.ref,
    direction: 'you_owe' as const,
    text: loop.label,
    sourceLabel: 'task',
    href: loop.href
  }));

  const next = brief?.header.next_interaction
    ? {
        title: brief.header.next_interaction.title,
        detail: brief.header.next_interaction.start,
        href: brief.header.next_interaction.href
      }
    : null;

  const arcPoints: PersonModelArcPoint[] = (overview.timeline ?? [])
    .filter((item) => item.date)
    .map((item) => ({
      id: item.id,
      at: item.date!,
      label: item.label,
      kind: item.kind
    }))
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  return {
    id: entity.id,
    ref: entity.ref,
    displayName: entity.display_name,
    initials: monogram(entity.display_name),
    roleLine,
    chips,
    warmth,
    warmthBand: band,
    relationshipState: state.state,
    relationshipReasons: state.reasons,
    openItemCount: ledgerYouOwe.length,
    youOweCount: ledgerYouOwe.length,
    theyOweCount: 0,
    ledgerYouOwe,
    ledgerTheyOwe: [],
    next,
    arcPoints,
    organisation: primaryOrg
      ? {
          ref: primaryOrg.endpoint.ref,
          displayName: primaryOrg.endpoint.display_label,
          monogram: orgMonogram(primaryOrg.endpoint.display_label),
          current: isCurrent(primaryOrg.link)
        }
      : null
  };
}
