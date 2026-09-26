/**
 * People redesign — one model for directory row signals and the person pane (V4).
 * Phases 1–4: warmth score, ledger counts, pending proposals.
 */

import type { EntityOverview, PersonBrief, RelationshipLink } from '@/domain/types';
import type { RelationshipState } from '@/domain/relationship-state';
import {
  touchpointsFromOverview,
  warmthFor,
  type WarmthBand
} from '@/domain/warmth-score';

export type { WarmthBand };

export interface PersonModelChip {
  kind: 'relationship' | 'organisation' | 'warmth' | 'proposal';
  label: string;
  orgMonogram?: string | null;
  proposalId?: string;
  title?: string;
}

export interface PersonModelLedgerItem {
  id: string;
  direction: 'you_owe' | 'they_owe';
  text: string;
  sourceLabel: string;
  href: string | null;
  derived?: boolean;
  author?: string;
  status?: string;
}

export interface PersonModelProposal {
  id: string;
  chip_label: string;
  reason: string;
  status: string;
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
  warmthFeedNote: string;
  relationshipState: RelationshipState;
  relationshipReasons: string[];
  openItemCount: number;
  youOweCount: number;
  theyOweCount: number;
  pendingProposalCount: number;
  ledgerYouOwe: PersonModelLedgerItem[];
  ledgerTheyOwe: PersonModelLedgerItem[];
  proposals: PersonModelProposal[];
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

export interface BuildPersonModelInput {
  overview: EntityOverview;
  brief?: PersonBrief | null;
  ledger?: {
    you_owe?: PersonModelLedgerItem[];
    they_owe?: PersonModelLedgerItem[];
    you_owe_count?: number;
    they_owe_count?: number;
    open_item_count?: number;
  } | null;
  proposals?: PersonModelProposal[] | null;
  now?: string;
}

export function buildPersonModel(input: BuildPersonModelInput): PersonModel {
  const { overview, brief = null, ledger = null, proposals = null } = input;
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

  const touchpoints = touchpointsFromOverview({
    timeline: overview.timeline ?? [],
    linkedRecords: overview.linked_records as Parameters<typeof touchpointsFromOverview>[0]['linkedRecords'],
    relationships: all
  });

  const warmthResult = warmthFor({
    touchpoints,
    relationships: all as unknown as Parameters<typeof warmthFor>[0]['relationships'],
    personCreatedAt: entity.created_at,
    now: input.now
  });

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
  // D1: band word only; number lives in tooltip (title).
  const bandWord =
    warmthResult.band === 'warm' ? 'Warming' : warmthResult.band === 'cooling' ? 'Cooling' : 'Cold';
  chips.push({
    kind: 'warmth',
    label: bandWord,
    title: `${warmthResult.warmth} · ${warmthResult.feedNote}`
  });

  const pendingProposals = (proposals ?? []).filter((p) => p.status === 'pending');
  for (const p of pendingProposals) {
    chips.push({
      kind: 'proposal',
      label: p.chip_label,
      proposalId: p.id
    });
  }

  const roleLine =
    chips.find((c) => c.kind === 'relationship')?.label ??
    (primaryOrg
      ? `${isCurrent(primaryOrg.link) ? 'At' : 'Formerly'} ${primaryOrg.endpoint.display_label}`
      : 'No relationship on record');

  let ledgerYouOwe: PersonModelLedgerItem[];
  let ledgerTheyOwe: PersonModelLedgerItem[];

  if (ledger) {
    ledgerYouOwe = (ledger.you_owe ?? []).map((item) => ({
      id: item.id,
      direction: 'you_owe' as const,
      text: item.text,
      sourceLabel: item.sourceLabel ?? (item as { source_label?: string }).source_label ?? 'task',
      href: item.href ?? null,
      derived: item.derived,
      author: item.author,
      status: item.status
    }));
    ledgerTheyOwe = (ledger.they_owe ?? []).map((item) => ({
      id: item.id,
      direction: 'they_owe' as const,
      text: item.text,
      sourceLabel: item.sourceLabel ?? (item as { source_label?: string }).source_label ?? 'task',
      href: item.href ?? null,
      derived: item.derived,
      author: item.author,
      status: item.status
    }));
  } else {
    ledgerYouOwe = (brief?.open_loops ?? []).map((loop) => ({
      id: loop.ref,
      direction: 'you_owe' as const,
      text: loop.label,
      sourceLabel: 'task',
      href: loop.href,
      derived: true
    }));
    ledgerTheyOwe = [];
  }

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

  const youOweCount = ledger?.you_owe_count ?? ledgerYouOwe.length;
  const theyOweCount = ledger?.they_owe_count ?? ledgerTheyOwe.length;
  const openItemCount = ledger?.open_item_count ?? youOweCount + theyOweCount + pendingProposals.length;

  return {
    id: entity.id,
    ref: entity.ref,
    displayName: entity.display_name,
    initials: monogram(entity.display_name),
    roleLine,
    chips,
    warmth: warmthResult.warmth,
    warmthBand: warmthResult.band,
    warmthFeedNote: warmthResult.feedNote,
    relationshipState: warmthResult.state as RelationshipState,
    relationshipReasons: warmthResult.reasons,
    openItemCount,
    youOweCount,
    theyOweCount,
    pendingProposalCount: pendingProposals.length,
    ledgerYouOwe,
    ledgerTheyOwe,
    proposals: pendingProposals,
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
