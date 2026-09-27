/**
 * Pure miniworld model — every on-page count comes from `buildWorldModel`.
 * (BUILD-PLAN Phase 2 / V4)
 */

import type {
  HabitatType,
  NetworkEcologyBridgePerson,
  NetworkEcologyCluster,
  NetworkEcologyLink,
  NetworkEcologyNode,
  NetworkEcologyUpcomingEvent,
  NetworkEcologyWorld
} from '@/domain/types';

export const PLACE_MEANINGS: Record<string, string> = {
  forest: 'A close-knit group you\'ve known for years, where most people know each other.',
  reef: 'Lots of different roles and organisations overlapping and mixing.',
  savannah: 'A big, spread-out network where people know you but not really each other.',
  wetland: 'A temporary gathering that swells around an event, then recedes.',
  island: 'A small specialist group, mostly talking to itself, with few routes out.',
  sandbank: 'A new community that has only just started forming.',
  'open-sea': 'People who don\'t belong to any community yet.',
  mangrove: 'People who belong to both communities and link them.',
  stepping: 'Links between two communities, but nobody who belongs to both.'
};

export const HABITAT_LABELS: Record<HabitatType, string> = {
  forest: 'Forest',
  reef: 'Coral Reef',
  savannah: 'Savannah',
  wetland: 'Wetland',
  island: 'Island',
  sandbank: 'Sandbank'
};

const QUIET_DAYS = 365;
const DAY_MS = 86_400_000;
const ORG_LINK = new Set(['employee_at', 'member_of']);

export interface WorldApi extends NetworkEcologyWorld {
  links: NetworkEcologyLink[];
  timeline: Record<string, { clusters: NetworkEcologyCluster[]; bridge_people: NetworkEcologyBridgePerson[] }>;
  upcoming_events: NetworkEcologyUpcomingEvent[];
}

export interface CommunityStats {
  memberCount: number;
  density: number;
  avgYears: number;
  orgCount: number;
  bridgeCount: number;
  quietCount: number;
  internalLinks: number;
  outboundLinks: number;
}

export interface Community {
  id: string;
  kind: 'organisation' | 'event';
  label: string;
  habitat: HabitatType;
  memberRefs: string[];
  since: number | null;
  eventDate: string | null;
  meaning: string;
  why: string;
  stats: CommunityStats;
}

export interface PersonState {
  ref: string;
  displayName: string;
  isSelf: boolean;
  homeIds: string[];
  startYear: number | null;
  /** Absent before Now when startYear is null. */
  present: boolean;
  quiet: boolean;
  isNew: boolean;
  lastContacted: string | null;
  lastContactUnknown: boolean;
}

export interface Ecotone {
  key: string;
  a: string;
  b: string;
  people: string[];
  emerging: boolean;
}

export interface SteppingStone {
  key: string;
  a: string;
  b: string;
  linkCount: number;
}

export interface Landmark {
  ref: string;
  displayName: string;
  /** Org with exactly one known person → buoy next to that drifter. */
  kind: 'buoy' | 'organisation';
  personRef?: string;
}

export interface OpenSea {
  people: string[];
  buoys: Landmark[];
}

export interface Insight {
  id: string;
  text: string;
  focus: { kind: 'community' | 'person' | 'ecotone' | 'open-sea'; id: string };
  colorKey: string;
}

export interface WorldModel {
  year: number;
  isNow: boolean;
  communities: Community[];
  people: PersonState[];
  ecotones: Ecotone[];
  steppingStones: SteppingStone[];
  landmarks: Landmark[];
  openSea: OpenSea;
  upcomingEvents: NetworkEcologyUpcomingEvent[];
  insights: Insight[];
  bridgePeople: NetworkEcologyBridgePerson[];
  notes: {
    noStartDateCount: number;
    dormancyOnlyAtNow: boolean;
    lastContactUnknownCount: number;
  };
  keyCounts: Record<string, number>;
}

function yearOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).getUTCFullYear();
}

function personStartYear(ref: string, links: NetworkEcologyLink[]): number | null {
  let earliest: number | null = null;
  for (const link of links) {
    if (link.source_ref !== ref && link.target_ref !== ref) continue;
    const y = yearOf(link.valid_from);
    if (y == null) continue;
    if (earliest == null || y < earliest) earliest = y;
  }
  return earliest;
}

function isQuiet(lastContacted: string | null, today: Date, isNow: boolean): boolean {
  if (!isNow) return false;
  if (!lastContacted) return false; // null = not quiet; counted as unknown separately
  const ms = Date.parse(lastContacted);
  if (!Number.isFinite(ms)) return false;
  return today.getTime() - ms > QUIET_DAYS * DAY_MS;
}

function linkActiveInYear(link: NetworkEcologyLink, year: number, isNow: boolean, today: Date): boolean {
  const cutoff = isNow ? today.getTime() : Date.UTC(year, 11, 31, 23, 59, 59, 999);
  const fromMs = link.valid_from ? Date.parse(link.valid_from) : NaN;
  if (Number.isFinite(fromMs) && fromMs > cutoff) return false;
  const toMs = link.valid_to ? Date.parse(link.valid_to) : NaN;
  if (Number.isFinite(toMs) && toMs < cutoff) return false;
  return true;
}

function densityAmong(memberRefs: string[], links: NetworkEcologyLink[]): { density: number; internal: number } {
  const set = new Set(memberRefs);
  const n = memberRefs.length;
  const pairs = (n * (n - 1)) / 2;
  let internal = 0;
  const seen = new Set<string>();
  for (const link of links) {
    if (link.relationship_type !== 'professional_relationship') continue;
    if (!set.has(link.source_ref) || !set.has(link.target_ref)) continue;
    const key = [link.source_ref, link.target_ref].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    internal += 1;
  }
  return { density: pairs > 0 ? internal / pairs : 0, internal };
}

function whySentence(community: {
  habitat: HabitatType;
  label: string;
  eventDate: string | null;
}, stats: CommunityStats): string {
  const d = stats.density.toFixed(2);
  switch (community.habitat) {
    case 'forest':
      return `Dense and long-standing: ${stats.internalLinks} links among ${stats.memberCount} people (density ${d}), known for ${stats.avgYears.toFixed(1)} years on average.`;
    case 'reef':
      return stats.orgCount <= 1
        ? `Overlapping roles: ${stats.memberCount} people, with ${stats.internalLinks} links between them and ${stats.bridgeCount} shared with other communities.`
        : `Overlapping roles: ${stats.memberCount} people across ${stats.orgCount} organisations, with ${stats.internalLinks} links between them and ${stats.bridgeCount} shared with other communities.`;
    case 'savannah':
      return stats.orgCount <= 1
        ? `Broad but spread out: ${stats.memberCount} people, and only ${stats.internalLinks} links between them (density ${d}).`
        : `Broad but spread out: ${stats.memberCount} people across ${stats.orgCount} organisations, and only ${stats.internalLinks} links between them (density ${d}).`;
    case 'wetland':
      return community.eventDate
        ? `Gathers around an event on ${community.eventDate}. ${stats.memberCount} people come together, then recede.`
        : `A temporary gathering of ${stats.memberCount} people that swells around an event, then recedes.`;
    case 'island':
      return `Specialised and self-contained: ${stats.internalLinks} links inside, ${stats.outboundLinks === 1 ? 'one route' : `${stats.outboundLinks} routes`} out.`;
    case 'sandbank':
      return `A new community of ${stats.memberCount} people that has only just started forming.`;
    default:
      return PLACE_MEANINGS.savannah;
  }
}

function clustersForYear(api: WorldApi, year: number, isNow: boolean): NetworkEcologyCluster[] {
  if (isNow) return api.clusters ?? [];
  const entry = api.timeline?.[String(year)];
  return entry?.clusters ?? [];
}

function bridgeForYear(api: WorldApi, year: number, isNow: boolean): NetworkEcologyBridgePerson[] {
  if (isNow) return api.bridge_people ?? [];
  return api.timeline?.[String(year)]?.bridge_people ?? [];
}

/**
 * Build the single source of truth for the miniworld UI.
 * @param year — calendar year, or pass the current year with `isNow: true` via today's year
 * @param today — evaluation date for quiet / Now
 * @param options.isNow — when true, people with no start date are present; dormancy applies
 */
export function buildWorldModel(
  api: WorldApi,
  year: number,
  today: Date = new Date(),
  options: { isNow?: boolean } = {}
): WorldModel {
  const isNow = options.isNow ?? year === today.getUTCFullYear();
  const links = api.links ?? [];
  const nodes = api.nodes ?? [];
  const personNodes = nodes.filter((n) => n.kind === 'person');
  const orgNodes = nodes.filter((n) => n.kind === 'organisation');
  const clusters = clustersForYear(api, year, isNow);
  const bridgePeople = bridgeForYear(api, year, isNow);

  const yearLinks = links.filter((l) => linkActiveInYear(l, year, isNow, today));

  const membershipByPerson = new Map<string, string[]>();
  for (const cluster of clusters) {
    if (!cluster.habitat) continue;
    for (const ref of cluster.member_refs) {
      if (!membershipByPerson.has(ref)) membershipByPerson.set(ref, []);
      membershipByPerson.get(ref)!.push(cluster.id);
    }
  }

  const people: PersonState[] = personNodes.map((node) => {
    const start = personStartYear(node.ref, links);
    const present = start != null ? start <= year : isNow;
    const lastContacted = node.last_contacted ?? null;
    const quiet = present && isQuiet(lastContacted, today, isNow);
    const isNew = present && start != null && start === year;
    return {
      ref: node.ref,
      displayName: node.display_name,
      isSelf: node.is_self === true,
      homeIds: present ? (membershipByPerson.get(node.ref) ?? []) : [],
      startYear: start,
      present,
      quiet,
      isNew,
      lastContacted,
      lastContactUnknown: lastContacted == null
    };
  });

  const presentPeople = people.filter((p) => p.present);
  const presentByRef = new Map(presentPeople.map((p) => [p.ref, p]));

  const communities: Community[] = clusters
    .filter((c) => c.habitat && c.member_refs.some((r) => presentByRef.has(r)))
    .map((cluster) => {
      const habitat = cluster.habitat as HabitatType;
      const memberRefs = cluster.member_refs.filter((r) => presentByRef.has(r));
      const { density, internal } = densityAmong(memberRefs, yearLinks);
      const quietCount = memberRefs.filter((r) => presentByRef.get(r)?.quiet).length;
      const bridgeCount = memberRefs.filter((r) => (membershipByPerson.get(r)?.length ?? 0) > 1).length;
      const memberSet = new Set(memberRefs);
      let outbound = 0;
      for (const link of yearLinks) {
        if (link.relationship_type !== 'professional_relationship') continue;
        const aIn = memberSet.has(link.source_ref);
        const bIn = memberSet.has(link.target_ref);
        if (aIn !== bIn) outbound += 1;
      }
      // Distinct orgs referenced by members via org links this year.
      const orgs = new Set<string>();
      for (const link of yearLinks) {
        if (!ORG_LINK.has(link.relationship_type)) continue;
        if (memberSet.has(link.source_ref)) orgs.add(link.target_ref);
        if (memberSet.has(link.target_ref)) orgs.add(link.source_ref);
      }
      let avgYears = 0;
      if (memberRefs.length) {
        avgYears =
          memberRefs.reduce((sum, ref) => {
            const start = presentByRef.get(ref)?.startYear;
            return sum + (start != null ? Math.max(0, year - start) : 0);
          }, 0) / memberRefs.length;
      }
      const stats: CommunityStats = {
        memberCount: memberRefs.length,
        density,
        avgYears,
        // An organisation cluster is one place; don't count side-memberships
        // as extra orgs in the why-text (D5).
        orgCount: cluster.kind === 'organisation' ? 1 : Math.max(1, orgs.size),
        bridgeCount,
        quietCount,
        internalLinks: internal,
        outboundLinks: outbound
      };
      const base = {
        habitat,
        label: cluster.label,
        eventDate: cluster.event_date ?? null
      };
      return {
        id: cluster.id,
        kind: cluster.kind,
        label: cluster.label,
        habitat,
        memberRefs,
        since: cluster.since ?? null,
        eventDate: cluster.event_date ?? null,
        meaning: PLACE_MEANINGS[habitat] ?? PLACE_MEANINGS.savannah,
        why: whySentence(base, stats),
        stats
      };
    })
    .sort((a, b) => b.stats.memberCount - a.stats.memberCount || a.label.localeCompare(b.label));

  // Ecotones: people in 2+ communities.
  const ecoMap = new Map<string, Ecotone>();
  for (const person of presentPeople) {
    if (person.homeIds.length < 2) continue;
    const homes = [...person.homeIds].sort();
    for (let i = 0; i < homes.length; i += 1) {
      for (let j = i + 1; j < homes.length; j += 1) {
        const key = `${homes[i]}|${homes[j]}`;
        if (!ecoMap.has(key)) {
          ecoMap.set(key, { key, a: homes[i], b: homes[j], people: [], emerging: false });
        }
        ecoMap.get(key)!.people.push(person.ref);
      }
    }
  }
  // Emerging: count rose in last 2 years (compare to year-2 timeline if present).
  const priorYear = year - 2;
  const priorClusters = api.timeline?.[String(priorYear)]?.clusters ?? [];
  const priorMembership = new Map<string, string[]>();
  for (const c of priorClusters) {
    for (const ref of c.member_refs) {
      if (!priorMembership.has(ref)) priorMembership.set(ref, []);
      priorMembership.get(ref)!.push(c.id);
    }
  }
  const priorEco = new Map<string, number>();
  for (const [ref, homes] of priorMembership) {
    if (homes.length < 2) continue;
    const sorted = [...homes].sort();
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        const key = `${sorted[i]}|${sorted[j]}`;
        priorEco.set(key, (priorEco.get(key) ?? 0) + 1);
      }
    }
  }
  for (const eco of ecoMap.values()) {
    eco.emerging = eco.people.length > (priorEco.get(eco.key) ?? 0);
    eco.people.sort();
  }
  const ecotones = [...ecoMap.values()].sort((a, b) => b.people.length - a.people.length);

  // Stepping stones: cross links, no shared membership.
  const communityIds = new Set(communities.map((c) => c.id));
  const personCommunity = membershipByPerson;
  const stepMap = new Map<string, SteppingStone>();
  for (const link of yearLinks) {
    if (link.relationship_type !== 'professional_relationship') continue;
    const aHomes = (personCommunity.get(link.source_ref) ?? []).filter((id) => communityIds.has(id));
    const bHomes = (personCommunity.get(link.target_ref) ?? []).filter((id) => communityIds.has(id));
    if (!aHomes.length || !bHomes.length) continue;
    for (const a of aHomes) {
      for (const b of bHomes) {
        if (a === b) continue;
        const shared = ecotones.some((e) => e.key === [a, b].sort().join('|'));
        if (shared) continue;
        const key = [a, b].sort().join('|');
        if (!stepMap.has(key)) {
          const [x, y] = key.split('|');
          stepMap.set(key, { key, a: x, b: y, linkCount: 0 });
        }
        stepMap.get(key)!.linkCount += 1;
      }
    }
  }
  const steppingStones = [...stepMap.values()];

  // Open sea: present people with zero communities.
  const inCommunity = new Set(communities.flatMap((c) => c.memberRefs));
  const openSeaPeople = presentPeople.filter((p) => !inCommunity.has(p.ref)).map((p) => p.ref);

  // Buoys: organisation with exactly one known person (via current org link), that person in open sea.
  const orgMemberCount = new Map<string, string[]>();
  for (const link of yearLinks) {
    if (!ORG_LINK.has(link.relationship_type)) continue;
    const personRef = personNodes.some((n) => n.ref === link.source_ref) ? link.source_ref : link.target_ref;
    const orgRef = personRef === link.source_ref ? link.target_ref : link.source_ref;
    if (!orgNodes.some((n) => n.ref === orgRef)) continue;
    if (!orgMemberCount.has(orgRef)) orgMemberCount.set(orgRef, []);
    const list = orgMemberCount.get(orgRef)!;
    if (!list.includes(personRef)) list.push(personRef);
  }
  const buoys: Landmark[] = [];
  for (const [orgRef, members] of orgMemberCount) {
    if (members.length !== 1) continue;
    const personRef = members[0];
    if (!openSeaPeople.includes(personRef)) continue;
    const org = orgNodes.find((n) => n.ref === orgRef);
    if (!org) continue;
    buoys.push({
      ref: orgRef,
      displayName: org.display_name,
      kind: 'buoy',
      personRef
    });
  }

  const landmarks: Landmark[] = orgNodes
    .filter((n) => communityIds.has(n.ref) || buoys.some((b) => b.ref === n.ref))
    .map((n) => {
      const buoy = buoys.find((b) => b.ref === n.ref);
      return buoy ?? { ref: n.ref, displayName: n.display_name, kind: 'organisation' as const };
    });

  const noStartDateCount = people.filter((p) => p.startYear == null).length;
  const lastContactUnknownCount = people.filter((p) => p.lastContactUnknown).length;

  const keyCounts: Record<string, number> = {
    forest: 0,
    reef: 0,
    savannah: 0,
    wetland: 0,
    island: 0,
    sandbank: 0,
    'open-sea': openSeaPeople.length,
    mangrove: ecotones.length,
    stepping: steppingStones.length,
    active: presentPeople.filter((p) => !p.quiet).length,
    quiet: presentPeople.filter((p) => p.quiet).length,
    bridge: presentPeople.filter((p) => p.homeIds.length > 1).length,
    new: presentPeople.filter((p) => p.isNew).length,
    landmark: landmarks.length,
    'last-contact-unknown': lastContactUnknownCount
  };
  for (const c of communities) {
    keyCounts[c.habitat] = (keyCounts[c.habitat] ?? 0) + 1;
  }

  const insights = buildInsights({
    communities,
    people: presentPeople,
    ecotones,
    openSeaPeople,
    year,
    isNow
  });

  return {
    year,
    isNow,
    communities,
    people,
    ecotones,
    steppingStones,
    landmarks,
    openSea: { people: openSeaPeople, buoys },
    upcomingEvents: isNow ? (api.upcoming_events ?? []) : [],
    insights,
    bridgePeople,
    notes: {
      noStartDateCount,
      dormancyOnlyAtNow: !isNow,
      lastContactUnknownCount
    },
    keyCounts
  };
}

function buildInsights(input: {
  communities: Community[];
  people: PersonState[];
  ecotones: Ecotone[];
  openSeaPeople: string[];
  year: number;
  isNow: boolean;
}): Insight[] {
  const insights: Insight[] = [];
  const { communities, people, ecotones, openSeaPeople, year, isNow } = input;

  const largest = communities[0];
  if (largest) {
    insights.push({
      id: 'largest',
      text: `${largest.label} is your largest community right now — ${largest.stats.memberCount} people on a ${HABITAT_LABELS[largest.habitat].toLowerCase()}.`,
      focus: { kind: 'community', id: largest.id },
      colorKey: largest.habitat
    });
  }

  const topEco = ecotones[0];
  if (topEco) {
    const a = communities.find((c) => c.id === topEco.a);
    const b = communities.find((c) => c.id === topEco.b);
    if (a && b) {
      insights.push({
        id: 'ecotone',
        text: `${topEco.people.length} ${topEco.people.length === 1 ? 'person bridges' : 'people bridge'} ${a.label} and ${b.label}.`,
        focus: { kind: 'ecotone', id: topEco.key },
        colorKey: 'mangrove'
      });
    }
  }

  const emerging = ecotones.find((e) => e.emerging);
  if (emerging) {
    const a = communities.find((c) => c.id === emerging.a);
    const b = communities.find((c) => c.id === emerging.b);
    if (a && b) {
      insights.push({
        id: 'emerging',
        text: `An emerging ecotone between ${a.label} and ${b.label} — more people belong to both than two years ago.`,
        focus: { kind: 'ecotone', id: emerging.key },
        colorKey: 'mangrove'
      });
    }
  }

  const sandbank = communities.find((c) => c.habitat === 'sandbank');
  if (sandbank) {
    insights.push({
      id: 'sandbank',
      text: `${sandbank.label} is a sandbank — a new community of ${sandbank.stats.memberCount} that has only just started forming.`,
      focus: { kind: 'community', id: sandbank.id },
      colorKey: 'sandbank'
    });
  }

  if (openSeaPeople.length > 0) {
    insights.push({
      id: 'open-sea',
      text: `${openSeaPeople.length} ${openSeaPeople.length === 1 ? 'person drifts' : 'people drift'} in the open sea — not yet linked to a community.`,
      focus: { kind: 'open-sea', id: 'open-sea' },
      colorKey: 'open-sea'
    });
  }

  if (isNow) {
    const quiet = people.filter((p) => p.quiet).length;
    if (quiet > 0) {
      insights.push({
        id: 'quiet',
        text: `${quiet} ${quiet === 1 ? 'person has' : 'people have'} been quiet for over a year. Turn on Dormancy to see them asleep in their shells.`,
        focus: { kind: 'community', id: largest?.id ?? '' },
        colorKey: 'quiet'
      });
    }
  } else {
    insights.push({
      id: 'history',
      text: `You are looking at ${year}. Communities come from the timeline for that year; dormancy only shows at Now.`,
      focus: { kind: 'community', id: largest?.id ?? '' },
      colorKey: 'savannah'
    });
  }

  return insights.filter((i) => i.focus.id || i.id === 'open-sea' || i.id === 'history');
}

/** Normalize a world API payload (fills defaults for older shapes). */
export function asWorldApi(raw: NetworkEcologyWorld): WorldApi {
  return {
    ...raw,
    links: raw.links ?? [],
    timeline: raw.timeline ?? {},
    upcoming_events: raw.upcoming_events ?? []
  };
}

export function nodeByRef(api: WorldApi, ref: string): NetworkEcologyNode | undefined {
  return api.nodes.find((n) => n.ref === ref);
}
