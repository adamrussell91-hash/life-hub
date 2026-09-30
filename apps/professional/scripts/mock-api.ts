/**
 * In-memory mock of umbrella endpoints Professional needs for local Vite
 * development: session, entities search/overview, and Communications.
 * Synthetic fixtures only — no production data, no AI providers.
 * When a sibling life-hub-data checkout is present, Notion communications.json
 * is merged into Comms/Meetings lists the same way production Functions do.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import seedData from '../fixtures/seed.json' with { type: 'json' };

const MOCK_DIR = path.dirname(fileURLToPath(import.meta.url));
const NOTION_COMMS_CANDIDATES = [
  path.resolve(MOCK_DIR, '../../../../life-hub-data/data/professional/communications.json'),
  '/agent/repos/life-hub-data/data/professional/communications.json'
];

type NotionListCaches = {
  communications: CommunicationRecord[];
  meetings: Record<string, unknown>[];
};

let notionListCaches: NotionListCaches | null | undefined;

async function loadNotionListCaches(): Promise<NotionListCaches | null> {
  if (notionListCaches !== undefined) return notionListCaches;
  const filePath = NOTION_COMMS_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!filePath) {
    notionListCaches = null;
    return null;
  }
  try {
    const {
      projectNotionCommunicationListRecord,
      projectNotionMeetingListRecord
    } = await import('../../../netlify/functions/_shared/schedule-projection.mjs');
    const rows = JSON.parse(readFileSync(filePath, 'utf8')) as unknown[];
    if (!Array.isArray(rows)) {
      notionListCaches = null;
      return null;
    }
    const now = () => Date.now();
    notionListCaches = {
      communications: rows
        .map((row) => projectNotionCommunicationListRecord(row))
        .filter(Boolean) as CommunicationRecord[],
      meetings: rows
        .map((row) => projectNotionMeetingListRecord(row, { now }))
        .filter(Boolean) as Record<string, unknown>[]
    };
    return notionListCaches;
  } catch {
    notionListCaches = null;
    return null;
  }
}

const LOCAL_PASSPHRASE = 'professional-hub-local';
/** Local-only: Blob copies the Duplicates sheet has merged this session. */
const mockDedupeDone = new Set<string>();

interface PersonRecord {
  id: string;
  kind: 'person';
  display_name: string;
  sort_name: string | null;
  aliases: string[];
  lifecycle_status: string;
  is_self: boolean;
  [key: string]: unknown;
}

interface OrganisationRecord {
  id: string;
  kind: 'organisation';
  display_name: string;
  legal_name: string | null;
  aliases: string[];
  lifecycle_status: string;
  [key: string]: unknown;
}

interface RelationshipSeed {
  id: string;
  source_ref: string;
  target_ref: string;
  relationship_type: string;
  inverse_label: string;
  context_key: string | null;
  status: string;
  temporal_mode: string;
  valid_from: string | null;
  valid_to: string | null;
  occurred_at: string | null;
  role?: string | null;
  metadata?: Record<string, unknown>;
}

interface CommunicationRecord {
  schema_version: number;
  id: string;
  direction: 'outbound' | 'inbound';
  channel: string;
  occurred_at: string;
  subject: string;
  summary: string;
  status: 'completed' | 'received';
  created_at: string;
  updated_at: string;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  time_zone?: string | null;
  incomplete_links?: {
    operation_id: string;
    status: string;
    completed_link_ids: string[];
    failed_intent_ids: string[];
    pending_intent_ids: string[];
  } | null;
  follow_up_operation?: {
    operation_id: string;
    status: string;
    task_id: string | null;
    title: string;
    completed_intent_ids: string[];
    completed_link_ids: string[];
    failed_intent_ids: string[];
    failed_relationships: Array<{
      intent_id: string;
      relationship_type: string;
      target_ref: string;
      error_code?: string;
    }>;
    pending_intent_ids: string[];
  } | null;
}

function refFor(record: PersonRecord | OrganisationRecord): string {
  return `shared:${record.kind}:${record.id}`;
}

function displayLabel(record: PersonRecord | OrganisationRecord): string {
  return record.display_name;
}

function matchRank(query: string, label: string, sortName: string | null): number | null {
  const q = query.trim().toLowerCase();
  const candidates = [label.toLowerCase(), sortName?.toLowerCase() ?? ''].filter(Boolean);
  if (candidates.some((c) => c.startsWith(q))) return 0;
  if (candidates.some((c) => c.split(/\s+/).some((token) => token.startsWith(q)))) return 1;
  return null;
}

function toSearchResult(record: PersonRecord | OrganisationRecord, rank: number) {
  return {
    rank,
    ref: refFor(record),
    kind: record.kind,
    display_label: displayLabel(record),
    supporting_label: record.kind === 'person' && (record as PersonRecord).is_self ? 'self' : null,
    href: null,
    lifecycle_status: record.lifecycle_status,
    visibility: 'operator'
  };
}

function endpointFor(record: PersonRecord | OrganisationRecord | CommunicationRecord) {
  if ('direction' in record) {
    const subject = typeof record.subject === 'string' ? record.subject.trim() : '';
    return {
      ref: `professional:communication:${record.id}`,
      kind: 'communication',
      display_label: subject || `${record.direction} ${record.channel}`,
      supporting_label: `${record.direction} ${record.channel}`,
      href: `/professional/#/communication/${encodeURIComponent(record.id)}`,
      lifecycle_status: record.status,
      visibility: 'operator'
    };
  }
  return {
    ref: refFor(record),
    kind: record.kind,
    display_label: displayLabel(record),
    supporting_label: record.kind === 'person' && (record as PersonRecord).is_self ? 'self' : null,
    href: null,
    lifecycle_status: record.lifecycle_status,
    visibility: 'operator'
  };
}

function effectiveDate(link: RelationshipSeed): string | null {
  return link.occurred_at ?? link.valid_from ?? null;
}

function timelineKind(link: RelationshipSeed): 'point' | 'period' | 'change' {
  if (link.temporal_mode === 'point') return 'point';
  if (link.temporal_mode === 'period') return 'period';
  return 'change';
}

function timelineLabel(
  link: RelationshipSeed,
  endpoint: { display_label: string },
  direction: 'outgoing' | 'incoming'
): string {
  if (direction === 'outgoing') return `${link.relationship_type} ${endpoint.display_label}`.trim();
  return `${link.inverse_label} ${endpoint.display_label}`.trim();
}

export function createMockApi() {
  const people = new Map<string, PersonRecord>(
    (seedData.people as PersonRecord[]).map((p) => [p.id, { ...p }])
  );
  const organisations = new Map<string, OrganisationRecord>(
    (seedData.organisations as OrganisationRecord[]).map((o) => [o.id, { ...o }])
  );
  const relationships = [...(seedData.relationships as RelationshipSeed[])];
  const observations = new Map<string, Record<string, unknown>>();
  const communications = new Map<string, CommunicationRecord>(
    ((seedData as { communications?: CommunicationRecord[] }).communications ?? []).map((comm) => [
      comm.id,
      { ...comm }
    ])
  );
  const followUpOperations = new Map<string, NonNullable<CommunicationRecord['follow_up_operation']>>();
  const meetings = new Map<string, Record<string, unknown>>(
    ((seedData as { meetings?: Record<string, unknown>[] }).meetings ?? []).map((meeting) => [
      String(meeting.id),
      { ...meeting }
    ])
  );
  const events = new Map<string, Record<string, unknown>>(
    ((seedData as { events?: Record<string, unknown>[] }).events ?? []).map((event) => [
      String(event.id),
      { ...event }
    ])
  );
  const applications = new Map<string, Record<string, unknown>>();
  const threads = new Map<string, Record<string, unknown>>();
  const pdGroups = new Map<string, Record<string, unknown>>();
  const knowledgePages = new Map<string, Record<string, unknown>>();
  const ledgerItems = new Map<string, Record<string, unknown>>();
  const achievements = new Map<string, Record<string, unknown>>();
  const futures = new Map<string, Record<string, unknown>>();
  const stones = new Map<string, Record<string, unknown>>();
  const scanProposals = new Map<string, Record<string, unknown>>();
  const careerMoves = new Map<string, Record<string, unknown>>();
  let scanState: { last_run_at: string | null; last_success_week: string | null } = {
    last_run_at: null,
    last_success_week: null
  };

  function nextSundayLabel(from = new Date()): string {
    const d = new Date(from);
    const day = d.getUTCDay();
    const add = day === 0 ? 7 : 7 - day;
    d.setUTCDate(d.getUTCDate() + add);
    return d.toLocaleDateString('en-AU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC'
    });
  }

  function scanPanelPayload() {
    const proposals = [...scanProposals.values()].filter((p) => p.status === 'pending');
    return {
      proposals,
      scan_state: scanState,
      pending_count: proposals.length,
      next_scan_label: nextSundayLabel()
    };
  }

  let authenticated = false;

  function json(status: number, body: unknown) {
    return { status, body };
  }

  function findByRef(ref: string): PersonRecord | OrganisationRecord | CommunicationRecord | null {
    const parts = ref.split(':');
    if (parts.length !== 3) return null;
    const [ns, kind, id] = parts;
    if (ns === 'shared' && kind === 'person') return people.get(id!) ?? null;
    if (ns === 'shared' && kind === 'organisation') return organisations.get(id!) ?? null;
    if (ns === 'professional' && kind === 'communication') return communications.get(id!) ?? null;
    return null;
  }

  function buildOverview(ref: string) {
    const entity = findByRef(ref);
    if (!entity || !('kind' in entity)) return null;

    const entries = relationships
      .filter((link) => link.source_ref === ref || link.target_ref === ref)
      .map((link) => {
        const direction: 'outgoing' | 'incoming' = link.source_ref === ref ? 'outgoing' : 'incoming';
        const otherRef = direction === 'outgoing' ? link.target_ref : link.source_ref;
        const other = findByRef(otherRef);
        const endpoint = other
          ? endpointFor(other as PersonRecord | OrganisationRecord | CommunicationRecord)
          : {
              ref: otherRef,
              kind: 'person',
              display_label: 'Unknown',
              supporting_label: null,
              href: null,
              lifecycle_status: null,
              visibility: 'operator'
            };
        return { link, endpoint, direction };
      });

    const current_relationships = entries.filter((entry) => entry.link.status === 'current');
    const historical_relationships = entries.filter((entry) => entry.link.status === 'ended');

    const timeline = entries
      .map((entry) => ({
        id: entry.link.id,
        kind: timelineKind(entry.link),
        date: effectiveDate(entry.link),
        end_date: entry.link.valid_to,
        label: timelineLabel(entry.link, entry.endpoint, entry.direction),
        context_key: entry.link.context_key,
        source_ref: entry.link.source_ref,
        href: entry.endpoint.href ?? null,
        context_href: null
      }))
      .sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });

    const linked_records = {
      tasks: [] as unknown[],
      communications: [] as unknown[],
      meetings: [] as unknown[],
      events: [] as unknown[],
      applications: [] as unknown[],
      organisations: [] as unknown[],
      people: [] as unknown[]
    };
    const seen = new Set<string>();
    for (const entry of entries) {
      if (seen.has(entry.endpoint.ref)) continue;
      seen.add(entry.endpoint.ref);
      if (entry.endpoint.kind === 'organisation') linked_records.organisations.push(entry.endpoint);
      else if (entry.endpoint.kind === 'person') linked_records.people.push(entry.endpoint);
      else if (entry.endpoint.kind === 'communication') linked_records.communications.push(entry.endpoint);
      else if (entry.endpoint.kind === 'task') linked_records.tasks.push(entry.endpoint);
      else if (entry.endpoint.kind === 'meeting') linked_records.meetings.push(entry.endpoint);
      else if (entry.endpoint.kind === 'event') linked_records.events.push(entry.endpoint);
      else if (entry.endpoint.kind === 'application') linked_records.applications.push(entry.endpoint);
    }

    return {
      entity: { ref, ...entity },
      current_relationships,
      historical_relationships,
      timeline,
      linked_records
    };
  }

  async function handle(method: string, urlPath: string, body?: unknown) {
    const url = new URL(urlPath, 'http://local.test');
    const path = url.pathname;

    if (path === '/api/session' && method === 'GET') {
      if (!authenticated) {
        return json(401, {
          ok: false,
          error: { code: 'unauthenticated', message: 'Please sign in to continue.' }
        });
      }
      return json(200, {
        ok: true,
        data: { authenticated: true, expiresAt: Date.now() + 12 * 3600_000 }
      });
    }
    if (path === '/api/auth' && method === 'POST') {
      const passphrase = (body as { passphrase?: string })?.passphrase;
      if (typeof passphrase === 'string' && passphrase.trim() === LOCAL_PASSPHRASE) {
        authenticated = true;
        return json(200, {
          ok: true,
          data: { authenticated: true, expiresAt: Date.now() + 12 * 3600_000 }
        });
      }
      return json(401, {
        ok: false,
        error: { code: 'invalid_credentials', message: 'That passphrase was not accepted.' }
      });
    }
    if (path === '/api/logout' && method === 'POST') {
      authenticated = false;
      return json(200, { ok: true, data: { loggedOut: true } });
    }

    if (!authenticated) {
      return json(401, {
        ok: false,
        error: { code: 'unauthenticated', message: 'Please sign in to continue.' }
      });
    }

    if (path === '/api/entities/search' && method === 'GET') {
      const query = (url.searchParams.get('q') ?? '').trim();
      if (query.length < 2) {
        return json(400, {
          ok: false,
          error: { code: 'invalid_query_length', message: 'q must be at least 2 characters.' }
        });
      }
      const includeArchived = url.searchParams.get('include_archived') === 'true';
      const kinds = new Set((url.searchParams.get('kinds') ?? 'person,organisation,task').split(','));
      const results: Array<ReturnType<typeof toSearchResult>> = [];
      if (kinds.has('person')) {
        for (const person of people.values()) {
          if (!includeArchived && person.lifecycle_status === 'archived') continue;
          if (['deleted', 'deidentified'].includes(person.lifecycle_status)) continue;
          const rank = matchRank(query, person.display_name, person.sort_name);
          if (rank !== null) results.push(toSearchResult(person, rank));
        }
      }
      if (kinds.has('organisation')) {
        for (const organisation of organisations.values()) {
          if (!includeArchived && organisation.lifecycle_status === 'archived') continue;
          if (organisation.lifecycle_status === 'deleted') continue;
          const rank = matchRank(query, organisation.display_name, null);
          if (rank !== null) results.push(toSearchResult(organisation, rank));
        }
      }
      results.sort((a, b) => a.rank - b.rank || a.display_label.localeCompare(b.display_label));
      const capped = results.slice(0, 20);
      const groups = { person: [] as unknown[], organisation: [] as unknown[], task: [] as unknown[] };
      for (const { rank: _rank, ...result } of capped) {
        (groups as Record<string, unknown[]>)[result.kind]!.push(result);
      }
      return json(200, { ok: true, data: { groups } });
    }

    if (path === '/api/entities/overview' && method === 'GET') {
      const ref = url.searchParams.get('ref');
      if (!ref) {
        return json(400, { ok: false, error: { code: 'missing_ref', message: 'ref query param required.' } });
      }
      const overview = buildOverview(ref);
      if (!overview) {
        return json(404, { ok: false, error: { code: 'entity_not_found', message: 'Entity not found.' } });
      }
      return json(200, { ok: true, data: overview });
    }

    if (path === '/api/people/directory' && method === 'GET') {
      const rows = [...people.values()]
        .filter((p) => !p.is_self && !['deleted', 'deidentified'].includes(p.lifecycle_status))
        .map((p) => {
          // Mirror production cleaner so polluted seed names don't break local chrome.
          const displayName = String(p.display_name ?? '').replace(/^p\//i, '').trim() || p.display_name;
          const parts = displayName.trim().split(/\s+/);
          const initials =
            parts.length <= 1
              ? (parts[0] ?? '?').slice(0, 2).toUpperCase()
              : `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
          return {
            id: p.id,
            ref: `shared:person:${p.id}`,
            display_name: displayName,
            initials,
            role_line: 'No relationship on record',
            relationship_roles: [],
            organisation: null,
            organisations: [],
            warmth: 18,
            warmth_band: 'cold' as const,
            relationship_state: 'active',
            relationship_reasons: [],
            open_item_count: 0,
            you_owe_count: 0,
            they_owe_count: 0,
            pending_proposal_count: 0,
            next_label: null,
            created_at: String(p.created_at ?? '2020-01-01T00:00:00.000Z'),
            updated_at: String(p.updated_at ?? '2020-01-01T00:00:00.000Z')
          };
        });
      // Match production hermit-name collapse for local chrome checks.
      const byName = new Map<string, (typeof rows)[number]>();
      for (const row of rows) {
        const key = row.display_name.toLowerCase().trim();
        if (!byName.has(key)) byName.set(key, row);
      }
      const peopleRows = [...byName.values()].sort((a, b) =>
        a.display_name.localeCompare(b.display_name, undefined, { sensitivity: 'base' })
      );
      return json(200, {
        ok: true,
        data: {
          people: peopleRows,
          // Synthetic student so the Students view has something locally.
          students: [
            {
              ...(peopleRows[0] ?? {}),
              id: 'person_00000000-0000-4000-8000-000000000501',
              ref: 'shared:person:person_00000000-0000-4000-8000-000000000501',
              display_name: 'Sample Student',
              initials: 'SS',
              role_line: 'Student',
              person_type: 'student'
            }
          ],
          organisations: [...organisations.values()].map((o) => ({
            ref: `shared:organisation:${o.id}`,
            id: o.id,
            display_name: o.display_name,
            logo_key: (o as { logo_key?: string | null }).logo_key ?? null,
            monogram: o.display_name.slice(0, 3).toUpperCase(),
            current: true
          })),
          counts: { people: peopleRows.length, organisations: organisations.size }
        }
      });
    }

    if (path === '/api/people/link-proposals' && method === 'GET') {
      return json(200, { ok: true, data: { proposals: [], count: 0 } });
    }

    if (path === '/api/people/self' && method === 'GET') {
      const self = [...people.values()].find((p) => p.is_self) ?? null;
      return json(200, {
        ok: true,
        data: {
          self: self
            ? { ref: `shared:person:${self.id}`, display_name: self.display_name }
            : null
        }
      });
    }

    if (path === '/api/people/link-proposals' && method === 'POST') {
      return json(200, { ok: true, data: { created: 0, skipped: 0, proposals: [], proposal: null } });
    }

    if (path === '/api/people/ledger' && method === 'GET') {
      const sourceRefsParam = url.searchParams.get('source_refs');
      if (sourceRefsParam) {
        const refs = sourceRefsParam.split(',').map((ref) => ref.trim()).filter(Boolean);
        const items = [...ledgerItems.values()].filter((item) => refs.includes(String(item.comm_ref)));
        return json(200, { ok: true, data: { items } });
      }
      const personRef = url.searchParams.get('person_ref');
      const openForPerson = [...ledgerItems.values()].filter(
        (item) => item.person_ref === personRef && item.status === 'open'
      );
      return json(200, {
        ok: true,
        data: {
          you_owe: openForPerson.filter((item) => item.direction === 'you_owe'),
          they_owe: openForPerson.filter((item) => item.direction === 'they_owe'),
          you_owe_count: openForPerson.filter((item) => item.direction === 'you_owe').length,
          they_owe_count: openForPerson.filter((item) => item.direction === 'they_owe').length,
          open_item_count: openForPerson.length
        }
      });
    }

    if (path === '/api/people/ledger' && method === 'POST') {
      const input = body as {
        action?: string;
        id?: string;
        person_ref?: string;
        direction?: 'you_owe' | 'they_owe';
        text?: string;
        comm_ref?: string;
        due?: string | null;
        author?: string;
        status?: string;
        task_ref?: string | null;
        checked_in_ref?: string | null;
      } | null;
      const action = input?.action;
      if (action === 'create') {
        // Mirrors the real repository's dedupe key so retyping the same »promise
        // during a debounced autosave does not spawn duplicate ledger items.
        const sourceKey = [input?.person_ref, input?.direction, input?.text?.trim(), input?.comm_ref]
          .map((part) => String(part ?? ''))
          .join('::');
        const existingBySource = [...ledgerItems.values()].find((entry) => entry.source_key === sourceKey);
        if (existingBySource) {
          return json(200, { ok: true, data: { item: existingBySource, created: false } });
        }
        const timestamp = new Date().toISOString();
        const item = {
          id: `ledger_${randomUUID()}`,
          person_ref: input?.person_ref ?? null,
          direction: input?.direction ?? 'you_owe',
          text: input?.text ?? '',
          task_ref: null,
          comm_ref: input?.comm_ref ?? null,
          due: input?.due ?? null,
          checked_in_ref: null,
          status: 'open',
          author: input?.author ?? 'adam',
          source_key: sourceKey,
          created_at: timestamp,
          updated_at: timestamp
        };
        ledgerItems.set(item.id, item);
        return json(200, { ok: true, data: { item, created: true } });
      }
      if (action === 'patch') {
        const id = input?.id;
        const existing = id ? ledgerItems.get(id) : null;
        if (!existing) return json(404, { ok: false, error: { code: 'ledger_item_not_found', message: 'Ledger item not found.' } });
        const { action: _action, id: _id, ...patch } = input ?? {};
        const updated = { ...existing, ...patch, updated_at: new Date().toISOString() };
        ledgerItems.set(id!, updated);
        return json(200, { ok: true, data: { item: updated } });
      }
      return json(200, { ok: true, data: { created: [], count: 0, note: 'Clare found nothing new to add.' } });
    }

    if (path === '/api/people/remember' && method === 'GET') {
      return json(200, { ok: true, data: { facts: [], count: 0 } });
    }

    if (path === '/api/people/remember' && method === 'POST') {
      const action = (body as { action?: string } | null)?.action;
      if (action === 'run' || action === 'ann_scan') {
        return json(200, {
          ok: true,
          data: { created: [], count: 0, facts: [], note: "Ann hasn't found anything yet." }
        });
      }
      return json(200, { ok: true, data: { fact: null } });
    }

    if (path === '/api/people/ask' && method === 'POST') {
      const question = String((body as { question?: string } | null)?.question ?? '').trim();
      if (/\?$/.test(question) || /^(who|whom|whose|which|what|where|how many|do i know|anyone|anybody)\b/i.test(question)) {
        const first = [...people.values()].find((p) => !p.is_self);
        const peopleOut = first
          ? [
              {
                id: first.id,
                ref: `shared:person:${first.id}`,
                display_name: first.display_name,
                reason: 'Mock match for Ask demo',
                source: 'mock'
              }
            ]
          : [];
        return json(200, {
          ok: true,
          data: {
            mode: 'ask',
            answer: peopleOut.length
              ? `${peopleOut[0].display_name} — ${peopleOut[0].reason}.`
              : "I don't know enough about who knows that yet.",
            people: peopleOut,
            filter: null,
            source: 'mock'
          }
        });
      }
      return json(200, {
        ok: true,
        data: { mode: 'search', answer: null, people: [], filter: { q: question }, source: 'name_search' }
      });
    }

    if (path === '/api/people/today' && method === 'GET') {
      const dayKey = '2026-09-28';
      const personRef = url.searchParams.get('person_ref');
      const displayName = url.searchParams.get('display_name') || 'Henry';
      const first = displayName.split(/\s+/)[0] || 'them';
      const hasMeet = url.searchParams.get('has_meet_item') === '1';
      const slots = [
        {
          id: 'meeting:briefing',
          kind: 'meeting',
          title: 'Staff briefing',
          start_minutes: 490,
          end_minutes: 520,
          start_label: '8:10am',
          people: [{ ref: null, display_name: 'Fr Ross' }]
        },
        {
          id: 'lesson:p3',
          kind: 'lesson',
          title: 'Year 9 History',
          start_minutes: 680,
          end_minutes: 720,
          start_label: '11:20am',
          people: []
        },
        {
          id: 'free:785',
          kind: 'free',
          title: 'Free',
          start_minutes: 785,
          end_minutes: 860,
          start_label: '1:05pm',
          people: personRef ? [{ ref: personRef, display_name: displayName }] : [],
          suggested: Boolean(personRef && hasMeet),
          suggestion_note:
            personRef && hasMeet ? `You usually meet ${first} after lunch` : null
        },
        {
          id: 'meeting:halt',
          kind: 'meeting',
          title: 'HALT committee',
          start_minutes: 930,
          end_minutes: 990,
          start_label: '3:30pm',
          people: [{ ref: null, display_name: 'Emma' }]
        }
      ];
      return json(200, {
        ok: true,
        data: {
          day_key: dayKey,
          slots,
          suggestion:
            personRef && hasMeet
              ? {
                  slot_id: 'free:785',
                  note: `You usually meet ${first} after lunch`,
                  person_ref: personRef
                }
              : null
        }
      });
    }

    if (path === '/api/people/coordination' && method === 'POST') {
      return json(200, {
        ok: true,
        data: {
          clare: { inference: { created: 0 }, ledger_items_created: 0, people_touched: [] },
          remember: { skipped: true },
          hammond_cooling_flags: [],
          links_require_confirm: true
        }
      });
    }

    if (path === '/api/people/brief' && method === 'GET') {
      const id = url.searchParams.get('id');
      const person = id ? people.get(id) : null;
      if (!person) {
        return json(404, { ok: false, error: { code: 'entity_not_found', message: 'Person not found.' } });
      }
      return json(200, {
        ok: true,
        data: {
          header: {
            person: { ref: `shared:person:${person.id}`, display_name: person.display_name, href: null },
            role: null,
            organisation: null,
            next_interaction: null
          },
          who_they_are: '',
          open_loops: [],
          current_shared_work: [],
          mutual_connections: []
        }
      });
    }

    if (path === '/api/organisations/directory' && method === 'GET') {
      // Optional Fix 01 real-data overlay (local screenshots only; path via env).
      const fix01Path = process.env.ORGS_FIX01_DIRECTORY_JSON;
      if (fix01Path) {
        try {
          const { readFileSync } = await import('node:fs');
          const body = JSON.parse(readFileSync(fix01Path, 'utf8'));
          if (body?.data?.organisations) return json(200, body);
        } catch {
          /* fall through to synthetic directory */
        }
      }
      const self =
        [...people.values()].find((p) => p.is_self) ?? [...people.values()][0] ?? null;
      const selfRef = self ? `shared:person:${self.id}` : null;
      const orgs = [...organisations.values()].map((org) => {
        const ref = `shared:organisation:${org.id}`;
        const orgRels = relationships.filter(
          (r) => r.source_ref === ref || r.target_ref === ref
        );
        const chips: Array<{
          kind: string;
          label: string;
          detail: string;
          filterBucket: string;
        }> = [];
        const peopleMap = new Map<
          string,
          {
            id: string;
            display_name: string;
            warmth_band: 'warm' | 'cooling' | 'cold';
            warmth: number;
            first_link_at: string | null;
          }
        >();

        for (const rel of orgRels) {
          const type =
            rel.relationship_type === 'works_at' ? 'employee_at' : rel.relationship_type;
          const personRef =
            rel.source_ref.startsWith('shared:person:')
              ? rel.source_ref
              : rel.target_ref.startsWith('shared:person:')
                ? rel.target_ref
                : null;
          const personId = personRef?.split(':')[2] ?? null;
          const person = personId ? people.get(personId) : null;
          const current = rel.status === 'current' || !rel.valid_to;

          if (person && personId) {
            if (!peopleMap.has(personId)) {
              peopleMap.set(personId, {
                id: personId,
                display_name: person.display_name,
                warmth_band: current ? 'warm' : 'cold',
                warmth: current ? 72 : 18,
                first_link_at: rel.valid_from
              });
            }
          }

          if (selfRef && personRef === selfRef) {
            if (type === 'employee_at') {
              chips.push({
                kind: current ? 'workplace' : 'workplace_former',
                label: 'Workplace',
                detail: current ? '2023–now' : '2018–21',
                filterBucket: 'work'
              });
            }
            if (type === 'studied_at') {
              chips.push({
                kind: 'studied',
                label: 'Studied',
                detail: '2018–21',
                filterBucket: 'study'
              });
            }
            if (type === 'placement_at') {
              chips.push({
                kind: 'placement',
                label: 'Placement',
                detail: '2020',
                filterBucket: 'study'
              });
            }
            if (type === 'member_of') {
              chips.push({
                kind: 'member',
                label: 'Member',
                detail: 'since 2022',
                filterBucket: 'bodies'
              });
            }
          }
        }

        // Mirror production deriveOrganisationChips dedupe (kind:label).
        const seenChip = new Set<string>();
        const dedupedChips = chips.filter((c) => {
          const key = `${c.kind}:${c.label}`;
          if (seenChip.has(key)) return false;
          seenChip.add(key);
          return true;
        });
        chips.length = 0;
        chips.push(...dedupedChips);

        const peopleList = [...peopleMap.values()];
        const warmth_spread = {
          warm: peopleList.filter((p) => p.warmth_band === 'warm').length,
          cooling: peopleList.filter((p) => p.warmth_band === 'cooling').length,
          cold: peopleList.filter((p) => p.warmth_band === 'cold').length,
          total: peopleList.length
        };
        const undated_people_count = peopleList.filter((p) => !p.first_link_at).length;
        const datedPeople = peopleList
          .filter((p) => p.first_link_at)
          .sort((a, b) => String(a.first_link_at).localeCompare(String(b.first_link_at)));
        const arc_points = datedPeople.map((p) => ({
          id: p.id,
          at: p.first_link_at as string
        }));
        const you_started_at =
          self && peopleList.find((p) => p.id === self.id)?.first_link_at
            ? peopleList.find((p) => p.id === self.id)!.first_link_at
            : null;
        const otherDated = datedPeople.filter((p) => p.id !== self?.id);
        const first_touch_kind =
          otherDated.length > 0 ? 'first_contact' : you_started_at ? 'you_started' : null;
        const first_touch_at =
          first_touch_kind === 'you_started'
            ? you_started_at
            : datedPeople[0]?.first_link_at ?? null;

        const monogram = org.display_name
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 3)
          .map((w) => w[0])
          .join('')
          .toUpperCase();

        return {
          id: org.id,
          ref,
          display_name: org.display_name,
          legal_name: org.legal_name,
          logo_key: (org as { logo_key?: string | null }).logo_key ?? null,
          monogram: monogram || 'ORG',
          chips,
          people_count: peopleList.length,
          people: peopleList,
          undated_people_count,
          warmth_spread,
          arc_points,
          is_current_workplace: chips.some((c) => c.kind === 'workplace'),
          first_touch_at,
          first_touch_kind,
          you_started_at,
          last_activity_at: org.updated_at ?? new Date().toISOString(),
          timeline_lanes: chips
            .filter((c) => c.kind === 'workplace' || c.kind === 'studied')
            .map((c, i) => ({
              id: `lane_${i}`,
              kind: c.kind === 'workplace' ? 'work_study' : 'work_study',
              label: c.label,
              start: '2023-01-15T00:00:00.000Z',
              end: c.kind === 'studied' ? '2021-12-15T00:00:00.000Z' : null
            })),
          created_at: (org.created_at as string) ?? '2020-01-01T00:00:00.000Z',
          updated_at: (org.updated_at as string) ?? '2025-01-01T00:00:00.000Z'
        };
      });

      const peopleIds = new Set(orgs.flatMap((o) => o.people.map((p) => p.id)));
      return json(200, {
        ok: true,
        data: {
          organisations: orgs,
          counts: { organisations: orgs.length, people: peopleIds.size }
        }
      });
    }

    if (path === '/api/organisations/crest' && method === 'GET') {
      return json(200, { ok: true, data: { url: null, logo_key: null } });
    }

    // --- Org structure / opportunities / Ann read (Part B) ---
    type MockRow = Record<string, unknown> & { id: string };
    type MockStructure = {
      units: MockRow[];
      positions: MockRow[];
      links: MockRow[];
      layout: Record<string, { x: number; y: number }>;
    };
    const mockStructures = (globalThis as { __orgStructure?: Map<string, MockStructure> }).__orgStructure
      ?? ((globalThis as { __orgStructure?: Map<string, MockStructure> }).__orgStructure = new Map());
    const mockStructure = (orgId: string): MockStructure => {
      let current = mockStructures.get(orgId);
      if (!current) {
        current = { units: [], positions: [], links: [], layout: {} };
        mockStructures.set(orgId, current);
      }
      return current;
    };
    // Mirrors the production derive (holders, explicit lines, members) so the
    // chart editor behaves locally the way it does against real Blobs.
    const mockStructurePayload = (orgId: string) => {
      const organisation_ref = orgId ? `shared:organisation:${orgId}` : null;
      const current = mockStructure(orgId);
      const units = current.units.filter((u) => u.lifecycle_status === 'active');
      const positions = current.positions.filter((p) => p.lifecycle_status === 'active');
      const live = current.links.filter((l) => l.status === 'current');
      const personName = (ref: unknown) => {
        const id = String(ref ?? '').replace(/^shared:person:/, '');
        return people.get(id)?.display_name ?? null;
      };
      const nodes: Array<Record<string, unknown>> = [
        ...units.map((u) => ({ id: `shared:unit:${u.id}`, kind: 'unit', ref: `shared:unit:${u.id}`, name: u.name, unit_kind: u.unit_kind, order: u.order, organisation_ref })),
        ...positions.map((p) => {
          const ref = `shared:position:${p.id}`;
          const holds = live.find((l) => l.relationship_type === 'holds_position' && l.target_ref === ref);
          return {
            id: ref,
            kind: 'position',
            ref,
            title: p.title,
            unit_ref: p.unit_ref,
            is_head: p.is_head,
            organisation_ref,
            holder: holds
              ? { person_ref: holds.source_ref, display_name: personName(holds.source_ref), role: holds.role ?? null, warmth_band: null }
              : null
          };
        })
      ];
      const nodeRefs = new Set(nodes.map((n) => n.ref));
      const edges = live
        .filter((l) => ['reports_to', 'works_with', 'shares_authority_with'].includes(String(l.relationship_type)))
        .filter((l) => nodeRefs.has(l.source_ref as string) && nodeRefs.has(l.target_ref as string))
        .map((l) => ({ id: l.id, source: l.source_ref, target: l.target_ref, kind: l.relationship_type, flag: 'explicit' }));
      const members_by_unit: Record<string, unknown[]> = {};
      const memberships_by_person: Record<string, unknown[]> = {};
      const memberIds = new Set<string>();
      for (const l of live) {
        if (l.relationship_type === 'member_of_unit') {
          (members_by_unit[l.target_ref as string] ??= []).push({ person_ref: l.source_ref, role: l.role ?? null, link_id: l.id });
          (memberships_by_person[l.source_ref as string] ??= []).push({ unit_ref: l.target_ref, role: l.role ?? null, link_id: l.id });
        }
        if (l.relationship_type === 'member_of_unit' || l.relationship_type === 'holds_position') {
          memberIds.add(String(l.source_ref).replace(/^shared:person:/, ''));
        }
      }
      return {
        organisation_ref,
        units,
        positions,
        links: current.links,
        layout: current.layout,
        graph: {
          organisation_ref,
          nodes,
          edges,
          members_by_unit,
          memberships_by_person,
          member_person_ids: [...memberIds],
          member_count: memberIds.size,
          cycles: []
        }
      };
    };
    // Profile ⇄ chart (mirrors netlify/_shared/person-workplace.mjs +
    // org-structure.mjs syncHolderFromProfile) so the local demo behaves
    // like production: a job title puts the person on the chart and back.
    const mockDismissed = (globalThis as { __orgDismissed?: Set<string> }).__orgDismissed
      ?? ((globalThis as { __orgDismissed?: Set<string> }).__orgDismissed = new Set());
    const sameTitle = (a: unknown, b: unknown) =>
      String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
    const isWorkplace = (l: RelationshipSeed) =>
      l.relationship_type === 'employee_at' || l.relationship_type === 'member_of';
    const mockSyncHolder = (orgId: string, personRef: string, title: string, respectDismissed: boolean) => {
      const key = `${orgId}|${personRef}|${title.trim().toLowerCase()}`;
      if (respectDismissed && mockDismissed.has(key)) return;
      mockDismissed.delete(key);
      const current = mockStructure(orgId);
      const active = current.positions.filter((p) => p.lifecycle_status === 'active');
      const holds = current.links.filter(
        (l) =>
          l.status === 'current' &&
          l.relationship_type === 'holds_position' &&
          l.source_ref === personRef &&
          active.some((p) => `shared:position:${p.id}` === l.target_ref)
      );
      const heldPositions = holds.map((h) => active.find((p) => `shared:position:${p.id}` === h.target_ref)!);
      if (heldPositions.some((p) => sameTitle(p.title, title))) return;
      if (heldPositions.length === 1) {
        heldPositions[0]!.title = title;
        return;
      }
      if (heldPositions.length > 1) return;
      const heldRefs = new Set(
        current.links.filter((l) => l.status === 'current' && l.relationship_type === 'holds_position').map((l) => l.target_ref)
      );
      let position = active.find((p) => sameTitle(p.title, title) && !heldRefs.has(`shared:position:${p.id}`));
      const now = new Date().toISOString();
      if (!position) {
        position = {
          id: `position_${randomUUID()}`,
          kind: 'position',
          title,
          organisation_ref: `shared:organisation:${orgId}`,
          unit_ref: null,
          is_head: false,
          lifecycle_status: 'active',
          created_at: now,
          updated_at: now
        };
        current.positions.push(position);
      }
      current.links.push({
        id: `ul_mock_${randomUUID().slice(0, 8)}`,
        relationship_type: 'holds_position',
        source_ref: personRef,
        target_ref: `shared:position:${position.id}`,
        role: null,
        status: 'current',
        temporal_mode: 'period',
        valid_from: now,
        valid_to: null,
        metadata: {},
        context_ref: `shared:organisation:${orgId}`
      });
    };
    const mockSetWorkplace = (
      input: { person_ref: string; organisation_ref: string | null; job_title: string | null; replace_organisation_ref?: string | null },
      syncChart: boolean
    ) => {
      const now = new Date().toISOString();
      const title = input.job_title?.trim() || null;
      const mine = relationships.filter((l) => l.source_ref === input.person_ref && isWorkplace(l) && l.status === 'current');
      if (input.replace_organisation_ref && input.replace_organisation_ref !== input.organisation_ref) {
        for (const l of mine.filter((x) => x.target_ref === input.replace_organisation_ref)) {
          l.status = 'ended';
          l.valid_to = now;
        }
        if (syncChart) {
          const oldId = input.replace_organisation_ref.replace(/^shared:organisation:/, '');
          for (const l of mockStructure(oldId).links) {
            if (l.status === 'current' && l.relationship_type === 'holds_position' && l.source_ref === input.person_ref) {
              l.status = 'ended';
              l.valid_to = now;
            }
          }
        }
      }
      if (!input.organisation_ref) return;
      const here = mine.find((l) => l.target_ref === input.organisation_ref);
      if (here) here.role = title;
      else {
        relationships.push({
          id: `ul_${randomUUID().slice(0, 12)}`,
          source_ref: input.person_ref,
          target_ref: input.organisation_ref,
          relationship_type: 'employee_at',
          inverse_label: 'employs',
          context_key: null,
          status: 'current',
          temporal_mode: 'period',
          valid_from: now,
          valid_to: null,
          occurred_at: null,
          role: title,
          metadata: {}
        });
      }
      if (syncChart && title) {
        mockSyncHolder(input.organisation_ref.replace(/^shared:organisation:/, ''), input.person_ref, title, false);
      }
    };
    const mockPeopleHere = (orgId: string) => {
      const orgRef = `shared:organisation:${orgId}`;
      const onChart = new Set(
        mockStructure(orgId)
          .links.filter((l) => l.status === 'current' && l.relationship_type === 'holds_position')
          .map((l) => l.source_ref)
      );
      const seen = new Set<string>();
      return relationships
        .filter((l) => l.target_ref === orgRef && isWorkplace(l) && l.status === 'current')
        .filter((l) => (seen.has(l.source_ref) ? false : (seen.add(l.source_ref), true)))
        .map((l) => ({
          person_ref: l.source_ref,
          display_name: people.get(l.source_ref.replace(/^shared:person:/, ''))?.display_name ?? 'Someone',
          job_title: l.role?.trim() || null,
          link_id: l.id,
          relationship_type: l.relationship_type,
          on_chart: onChart.has(l.source_ref)
        }));
    };
    const opportunitiesStore = (globalThis as { __opportunities?: Map<string, unknown> }).__opportunities
      ?? ((globalThis as { __opportunities?: Map<string, unknown> }).__opportunities = new Map());
    const orgReads = (globalThis as { __orgReads?: Map<string, unknown> }).__orgReads
      ?? ((globalThis as { __orgReads?: Map<string, unknown> }).__orgReads = new Map());

    if (path === '/api/org-structure' && method === 'GET') {
      const orgId = url.searchParams.get('organisation_id') || url.searchParams.get('id') || '';
      for (const p of mockPeopleHere(orgId)) {
        if (p.job_title) mockSyncHolder(orgId, p.person_ref, p.job_title, true);
      }
      return json(200, { ok: true, data: { ...mockStructurePayload(orgId), people_here: mockPeopleHere(orgId) } });
    }

    if (path === '/api/people/workplace' && method === 'POST') {
      const input = body as Parameters<typeof mockSetWorkplace>[0];
      if (!input?.person_ref) {
        return json(400, { ok: false, error: { code: 'invalid_person_ref', message: 'person_ref must be a person.' } });
      }
      mockSetWorkplace(input, true);
      return json(200, { ok: true, data: { workplace: null, released_organisation_ref: input.replace_organisation_ref ?? null } });
    }

    if (path === '/api/org-structure' && method === 'PATCH') {
      const kind = url.searchParams.get('kind');
      const payload = (body ?? {}) as Record<string, unknown>;
      if (kind === 'layout') {
        const orgId = url.searchParams.get('organisation_id') || '';
        const current = mockStructure(orgId);
        current.layout = { ...current.layout, ...((payload.layout as Record<string, { x: number; y: number }>) ?? {}) };
        return json(200, { ok: true, data: { layout: current.layout } });
      }
      const entityId = url.searchParams.get('entity_id') || '';
      for (const current of mockStructures.values()) {
        const list = kind === 'unit' ? current.units : current.positions;
        const record = list.find((r: MockRow) => r.id === entityId);
        if (record) {
          Object.assign(record, payload, { updated_at: new Date().toISOString() });
          if (kind === 'position' && typeof payload.title === 'string') {
            for (const l of current.links) {
              if (l.status === 'current' && l.relationship_type === 'holds_position' && l.target_ref === `shared:position:${record.id}`) {
                mockSetWorkplace(
                  { person_ref: String(l.source_ref), organisation_ref: String(record.organisation_ref), job_title: payload.title },
                  false
                );
              }
            }
          }
          return json(200, { ok: true, data: { [kind === 'unit' ? 'unit' : 'position']: record } });
        }
      }
      return json(404, { ok: false, error: { code: 'not_found', message: 'Not found.' } });
    }

    if (path === '/api/org-structure' && method === 'POST') {
      const payload = (body ?? {}) as Record<string, unknown>;
      const action = url.searchParams.get('action') || (payload.action as string | undefined) || 'create_unit';
      const orgRef = typeof payload.organisation_ref === 'string' ? payload.organisation_ref : '';
      const orgId = orgRef.replace(/^shared:organisation:/, '');
      const current = mockStructure(orgId);
      const now = new Date().toISOString();

      if (action === 'create_unit') {
        const unit = {
          schema_version: 1,
          id: `unit_${randomUUID()}`,
          kind: 'unit',
          name: String(payload.name || '').trim(),
          organisation_ref: orgRef,
          unit_kind: (payload.unit_kind as string) || 'other',
          order: Number(payload.order) || current.units.length,
          lifecycle_status: 'active',
          created_at: now,
          updated_at: now
        };
        current.units.push(unit);
        return json(201, { ok: true, data: { unit } });
      }
      if (action === 'create_position') {
        const title = String(payload.title || '').trim();
        if (!title) return json(400, { ok: false, error: { code: 'title_required', message: 'title is required.' } });
        const position = {
          schema_version: 1,
          id: `position_${randomUUID()}`,
          kind: 'position',
          title,
          organisation_ref: orgRef,
          unit_ref: (payload.unit_ref as string | null) ?? null,
          is_head: Boolean(payload.is_head),
          lifecycle_status: 'active',
          created_at: now,
          updated_at: now
        };
        current.positions.push(position);
        return json(201, { ok: true, data: { position } });
      }
      if (action === 'create_link') {
        const link = {
          id: `ul_mock_${randomUUID().slice(0, 8)}`,
          relationship_type: payload.relationship_type,
          source_ref: payload.source_ref,
          target_ref: payload.target_ref,
          role: (payload.role as string | null) ?? null,
          status: 'current',
          temporal_mode: payload.relationship_type === 'answers_to' ? 'timeless' : 'period',
          valid_from: (payload.valid_from as string | null) ?? now,
          valid_to: null,
          metadata: (payload.metadata as Record<string, unknown>) ?? {},
          context_ref: orgRef
        };
        current.links.push(link);
        if (link.relationship_type === 'holds_position') {
          const position = current.positions.find((p) => `shared:position:${p.id}` === link.target_ref);
          if (position) {
            mockSetWorkplace(
              { person_ref: String(link.source_ref), organisation_ref: orgRef, job_title: String(position.title) },
              false
            );
          }
        }
        return json(201, { ok: true, data: { link, created: true } });
      }
      if (action === 'end_link') {
        const link = current.links.find((l) => l.id === payload.link_id);
        if (!link) return json(404, { ok: false, error: { code: 'structure_link_not_found', message: 'Not found.' } });
        if (link.relationship_type === 'holds_position') {
          const position = current.positions.find((p) => `shared:position:${p.id}` === link.target_ref);
          if (position) mockDismissed.add(`${orgId}|${link.source_ref}|${String(position.title).trim().toLowerCase()}`);
        }
        link.status = 'ended';
        link.valid_to = now;
        return json(200, { ok: true, data: { link } });
      }
      if (action === 'archive_position') {
        const position = current.positions.find((p) => p.id === payload.position_id);
        if (!position) return json(404, { ok: false, error: { code: 'position_not_found', message: 'Not found.' } });
        const ref = `shared:position:${position.id}`;
        const ended: string[] = [];
        for (const link of current.links) {
          if (link.status !== 'current' || (link.source_ref !== ref && link.target_ref !== ref)) continue;
          if (link.relationship_type === 'holds_position') {
            mockDismissed.add(`${orgId}|${link.source_ref}|${String(position.title).trim().toLowerCase()}`);
          }
          link.status = 'ended';
          link.valid_to = now;
          ended.push(String(link.id));
        }
        position.lifecycle_status = 'archived';
        return json(200, { ok: true, data: { position, ended_link_ids: ended } });
      }
      return json(400, { ok: false, error: { code: 'invalid_action', message: 'Unsupported action.' } });
    }

    if (path === '/api/opportunities' && method === 'GET') {
      const orgRef = url.searchParams.get('organisation_ref');
      let list = [...opportunitiesStore.values()] as Array<Record<string, unknown>>;
      if (orgRef) list = list.filter((o) => o.organisation_ref === orgRef);
      return json(200, { ok: true, data: { opportunities: list } });
    }

    if (path === '/api/opportunities' && method === 'POST') {
      const action = url.searchParams.get('action');
      if (action === 'add_to_applications' || action === 'add_to_events') {
        const id = url.searchParams.get('id') || '';
        const existing = opportunitiesStore.get(id) as Record<string, unknown> | undefined;
        if (!existing) {
          return json(404, { ok: false, error: { code: 'not_found', message: 'Opportunity not found.' } });
        }
        existing.status = action === 'add_to_applications' ? 'applied' : 'interested';
        existing.updated_at = new Date().toISOString();
        opportunitiesStore.set(id, existing);
        if (action === 'add_to_applications') {
          return json(200, {
            ok: true,
            data: {
              opportunity: existing,
              application_intent: { position_title: existing.title },
              application: { id: `application_${randomUUID()}`, title: existing.title },
              created: true
            }
          });
        }
        return json(200, {
          ok: true,
          data: {
            opportunity: existing,
            event: { id: `event_${randomUUID()}`, title: existing.title },
            created: true
          }
        });
      }
      const id = `opportunity_${randomUUID()}`;
      const now = new Date().toISOString();
      const record = {
        id,
        organisation_ref: (body as { organisation_ref?: string }).organisation_ref,
        kind: (body as { kind?: string }).kind || 'other',
        title: String((body as { title?: string }).title || '').trim(),
        summary: (body as { summary?: string | null }).summary ?? null,
        closes_on: (body as { closes_on?: string | null }).closes_on ?? null,
        closes_precision: (body as { closes_precision?: string }).closes_precision || 'none',
        url: (body as { url?: string | null }).url ?? null,
        sources: [],
        found_by: (body as { found_by?: string }).found_by || 'adam',
        status: 'open',
        created_at: now,
        updated_at: now
      };
      opportunitiesStore.set(id, record);
      return json(201, { ok: true, data: { opportunity: record, created: true } });
    }

    if (path === '/api/org-bridges' && method === 'POST') {
      const orgA = (body as { orgA?: { people?: Array<{ id: string; display_name?: string; warmth_band?: string }> } })
        ?.orgA;
      const orgB = (body as { orgB?: { people?: Array<{ id: string; display_name?: string; warmth_band?: string }> } })
        ?.orgB;
      const rels =
        (
          body as {
            professionalRelationships?: Array<{ source_id: string; target_id: string }>;
          }
        ).professionalRelationships || [];
      const warmth =
        (body as { warmthByPerson?: Record<string, string> }).warmthByPerson || {};
      const names =
        (body as { displayNames?: Record<string, string> }).displayNames || {};
      const bridges: Array<Record<string, unknown>> = [];
      let hidden = 0;
      let n = 1;
      for (const rel of rels) {
        const nearBand = warmth[rel.source_id] || 'cold';
        const farBand = warmth[rel.target_id] || 'cold';
        if (nearBand === 'warm' && (farBand === 'cold' || !farBand)) {
          bridges.push({
            kind: 'know_each_other',
            person_a_id: rel.source_id,
            person_b_id: rel.target_id,
            number: n++,
            rule: 1,
            reason: `${names[rel.source_id] || 'Someone'} is your warmest way into ${
              (orgB as { name?: string } | undefined)?.name || 'the other organisation'
            }, toward ${names[rel.target_id] || 'someone'}.`
          });
        } else {
          hidden += 1;
        }
      }
      // moved: same id in both orgs
      const aIds = new Set((orgA?.people || []).map((p) => p.id));
      for (const p of orgB?.people || []) {
        if (!aIds.has(p.id)) continue;
        if ((warmth[p.id] || 'cold') === 'cold') {
          bridges.push({
            kind: 'moved',
            person_a_id: p.id,
            person_b_id: p.id,
            number: n++,
            rule: 3,
            reason: `Your move links cold former colleagues around an upcoming event.`
          });
        } else {
          hidden += 1;
        }
      }
      return json(200, {
        ok: true,
        data: {
          bridges,
          hidden_count: hidden,
          hidden_label: hidden ? `${hidden} more hidden` : null
        }
      });
    }

    if (path === '/api/opportunities' && method === 'PATCH') {
      const id = url.searchParams.get('id') || '';
      const existing = opportunitiesStore.get(id) as Record<string, unknown> | undefined;
      if (!existing) {
        return json(404, { ok: false, error: { code: 'not_found', message: 'Opportunity not found.' } });
      }
      const action = url.searchParams.get('action');
      if (action === 'dismiss') existing.status = 'dismissed';
      Object.assign(existing, body || {});
      existing.updated_at = new Date().toISOString();
      opportunitiesStore.set(id, existing);
      return json(200, { ok: true, data: { opportunity: existing } });
    }

    if (path === '/api/organisation-read' && method === 'GET') {
      const orgRef = url.searchParams.get('organisation_ref') || '';
      const read = orgReads.get(orgRef) || {
        organisation_ref: orgRef,
        summary: '',
        threads: [],
        generated_at: null,
        updated_at: null,
        status: 'empty',
        error: null
      };
      return json(200, { ok: true, data: { read } });
    }

    if (path === '/api/organisation-read' && method === 'POST') {
      const orgRef = (body as { organisation_ref?: string })?.organisation_ref || '';
      const now = new Date().toISOString();
      const read = {
        organisation_ref: orgRef,
        summary:
          'A working map of how this organisation runs for you, based on the structure and links on file.',
        threads: [
          {
            key: 'your_lines',
            text: 'Your memberships set the lines Ann tracks.',
            sources: [],
            author: 'ann'
          }
        ],
        generated_at: now,
        updated_at: now,
        status: 'ready',
        error: null
      };
      orgReads.set(orgRef, read);
      return json(200, {
        ok: true,
        data: { read, created: true, request_preview: { has_structure: true, membership_count: 0 } }
      });
    }

    if (path === '/api/entities' && method === 'PATCH') {
      const ref = url.searchParams.get('ref');
      const action = url.searchParams.get('action') ?? 'update';
      const record = ref ? findByRef(ref) : null;
      if (!ref || !record || !('kind' in record)) {
        return json(404, { ok: false, error: { code: 'entity_not_found', message: 'Entity not found.' } });
      }
      if (action !== 'update') {
        return json(400, { ok: false, error: { code: 'invalid_action', message: 'Unsupported action.' } });
      }
      const input = (body ?? {}) as {
        display_name?: unknown;
        sort_name?: unknown;
        aliases?: unknown;
        professional_profile?: {
          summary?: unknown;
          linkedin_url?: unknown;
          current_workplace?: unknown;
        };
      };
      if (typeof input.display_name === 'string') {
        const displayName = input.display_name.trim();
        if (!displayName) {
          return json(400, {
            ok: false,
            error: { code: 'display_name_required', message: 'display_name cannot be empty.' }
          });
        }
        record.display_name = displayName;
      }
      if (record.kind === 'person' && input.sort_name !== undefined) {
        record.sort_name = typeof input.sort_name === 'string' && input.sort_name.trim() ? input.sort_name : null;
      }
      if (Array.isArray(input.aliases)) {
        record.aliases = input.aliases.filter((value): value is string => typeof value === 'string' && value.trim() !== '');
      }
      if (record.kind === 'person' && input.professional_profile && typeof input.professional_profile === 'object') {
        const pp = input.professional_profile;
        type MockProfile = {
          source?: { system: string; page_url: string | null; properties: Record<string, string> };
          summary?: string | null;
          contact?: { email: string | null; phone: string | null; linkedin_url: string | null };
          last_contacted?: string | null;
          current_workplace?: string[];
          references?: Record<string, unknown>;
          body_markdown?: string | null;
        };
        const existing =
          record.professional_profile && typeof record.professional_profile === 'object'
            ? (record.professional_profile as MockProfile)
            : null;
        record.professional_profile = {
          schema_version: 1,
          source: existing?.source ?? { system: 'hub', page_url: null, properties: {} },
          summary:
            pp.summary !== undefined
              ? typeof pp.summary === 'string'
                ? pp.summary.trim() || null
                : null
              : (existing?.summary ?? null),
          contact: {
            email: existing?.contact?.email ?? null,
            phone: existing?.contact?.phone ?? null,
            linkedin_url:
              pp.linkedin_url !== undefined
                ? typeof pp.linkedin_url === 'string' && pp.linkedin_url.trim()
                  ? pp.linkedin_url.trim()
                  : null
                : (existing?.contact?.linkedin_url ?? null)
          },
          last_contacted: existing?.last_contacted ?? null,
          current_workplace:
            pp.current_workplace !== undefined
              ? typeof pp.current_workplace === 'string'
                ? pp.current_workplace.trim()
                  ? [pp.current_workplace.trim()]
                  : []
                : Array.isArray(pp.current_workplace)
                  ? pp.current_workplace.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
                  : []
              : (existing?.current_workplace ?? []),
          references: existing?.references ?? {},
          body_markdown: existing?.body_markdown ?? null
        };
      }
      record.updated_at = new Date().toISOString();
      return json(200, { ok: true, data: { ref: refFor(record), ...record } });
    }

    if (path === '/api/entities/admin' && method === 'POST') {
      const input = (body ?? {}) as { action?: string; confirm_ids?: string[] };
      const p = (n: number, name: string) => ({
        id: `person_00000000-0000-4000-8000-00000000090${n}`,
        ref: `shared:person:person_00000000-0000-4000-8000-00000000090${n}`,
        name
      });
      const ready = [
        { kind: 'copy', remove: p(1, 'Rohan'), into: [p(2, 'Rohan Arianayagam')], student: true, links: 2, blocked: null },
        { kind: 'combined', remove: p(3, 'Joseph Histon, Thierry King'), into: [p(4, 'Joseph Histon'), p(5, 'Thierry King')], student: true, links: 1, blocked: null }
      ].filter((a) => !mockDedupeDone.has(a.remove.id));
      if (input.action === 'plan_people_dedupe') {
        return json(200, {
          ok: true,
          data: {
            ready,
            kept: [{ kind: 'copy', remove: p(6, 'Max Ziazaras'), into: [p(7, 'Max Ziaziaris')], student: true, links: 0, blocked: 'has_promises' }],
            unresolved: [{ kind: 'combined', remove: p(8, 'Hector and Hugo Standen'), names: ['Hector Standen', 'Hugo Standen'], missing: ['Hector Standen', 'Hugo Standen'], links: 0 }]
          }
        });
      }
      if (input.action === 'apply_people_dedupe') {
        const ids = new Set(input.confirm_ids ?? []);
        const done = ready.filter((a) => ids.has(a.remove.id)).map((a) => ({ ...a, moved: a.links }));
        for (const a of done) mockDedupeDone.add(a.remove.id);
        return json(200, { ok: true, data: { done, failed: [], skipped: [], remaining: [] } });
      }
    }

    if (path === '/api/entities' && method === 'POST') {
      const input = body as { kind?: string; display_name?: string };
      for (const key of ['actor', 'workflow', 'allowed_visibility', 'allowed_entity_kinds']) {
        if (input && Object.prototype.hasOwnProperty.call(input, key)) {
          return json(400, {
            ok: false,
            error: { code: 'access_field_not_accepted', message: `Field "${key}" is not accepted.` }
          });
        }
      }
      if (input?.kind !== 'person' && input?.kind !== 'organisation') {
        return json(400, {
          ok: false,
          error: { code: 'unsupported_entity_kind', message: 'kind must be "person" or "organisation".' }
        });
      }
      const displayName = typeof input.display_name === 'string' ? input.display_name.trim() : '';
      if (!displayName) {
        return json(400, {
          ok: false,
          error: { code: 'display_name_required', message: 'display_name is required.' }
        });
      }
      const now = new Date().toISOString();
      if (input.kind === 'person') {
        const id = `person_${randomUUID()}`;
        const record: PersonRecord = {
          schema_version: 1,
          id,
          kind: 'person',
          display_name: displayName,
          sort_name: null,
          aliases: [],
          lifecycle_status: 'active',
          is_self: false,
          retention_reason: null,
          retention_review_at: null,
          created_at: now,
          updated_at: now
        };
        people.set(id, record);
        return json(201, { ok: true, data: { ref: refFor(record), ...record } });
      }
      const id = `organisation_${randomUUID()}`;
      const record: OrganisationRecord = {
        schema_version: 1,
        id,
        kind: 'organisation',
        display_name: displayName,
        legal_name: null,
        aliases: [],
        lifecycle_status: 'active',
        retention_reason: null,
        retention_review_at: null,
        created_at: now,
        updated_at: now
      };
      organisations.set(id, record);
      return json(201, { ok: true, data: { ref: refFor(record), ...record } });
    }

    if (path === '/api/observations' && method === 'GET') {
      const aboutRef = url.searchParams.get('about_ref');
      if (!aboutRef) {
        return json(400, { ok: false, error: { code: 'missing_about_ref', message: 'about_ref query param required.' } });
      }
      const list = [...observations.values()]
        .filter((o) => o.about_ref === aboutRef)
        .sort((a, b) => Date.parse(b.occurred_at as string) - Date.parse(a.occurred_at as string));
      return json(200, { ok: true, data: { observations: list } });
    }

    if (path === '/api/observations' && method === 'POST') {
      const input = body as {
        about_ref?: string;
        text?: string;
        occurred_at?: string;
        source?: string;
        linked_ref?: string | null;
      };
      const text = typeof input?.text === 'string' ? input.text.trim() : '';
      if (!input?.about_ref || !text || !input?.occurred_at) {
        return json(400, { ok: false, error: { code: 'invalid_input', message: 'Invalid observation.' } });
      }
      const now = new Date().toISOString();
      const record = {
        schema_version: 1,
        id: `observation_${randomUUID()}`,
        about_ref: input.about_ref,
        text,
        occurred_at: input.occurred_at,
        source: input.source ?? 'manual',
        linked_ref: input.linked_ref ?? null,
        created_at: now,
        updated_at: now
      };
      observations.set(record.id, record);
      return json(201, { ok: true, data: { observation: record, created: true } });
    }

    if (path === '/api/communications' && method === 'GET') {
      const id = url.searchParams.get('id');
      if (id) {
        const communication = communications.get(id);
        if (!communication) {
          return json(404, {
            ok: false,
            error: { code: 'communication_not_found', message: 'Communication not found.' }
          });
        }
        const followUp = followUpOperations.get(communication.id);
        return json(200, {
          ok: true,
          data: {
            communication: followUp ? { ...communication, follow_up_operation: followUp } : communication
          }
        });
      }
      const notion = await loadNotionListCaches();
      const byId = new Map<string, CommunicationRecord>();
      for (const row of notion?.communications ?? []) byId.set(row.id, row);
      for (const row of communications.values()) byId.set(row.id, row);
      const list = [...byId.values()].sort((a, b) => {
        const delta = Date.parse(b.occurred_at) - Date.parse(a.occurred_at);
        return delta !== 0 ? delta : a.id < b.id ? 1 : -1;
      });
      return json(200, { ok: true, data: { communications: list } });
    }

    if (path === '/api/communications' && method === 'POST') {
      const action = url.searchParams.get('action');
      if (action === 'retry-links') {
        const id = url.searchParams.get('id');
        const communication = id ? communications.get(id) : null;
        if (!communication) {
          return json(404, {
            ok: false,
            error: { code: 'communication_not_found', message: 'Communication not found.' }
          });
        }
        communication.incomplete_links = null;
        communications.set(communication.id, communication);
        return json(200, { ok: true, data: { communication, links: [], retried: true } });
      }

      if (action === 'create-follow-up' || action === 'retry-follow-up') {
        const id = url.searchParams.get('id');
        const communication = id ? communications.get(id) : null;
        if (!communication) {
          return json(404, {
            ok: false,
            error: { code: 'communication_not_found', message: 'Communication not found.' }
          });
        }
        const input = (body ?? {}) as { title?: string; force_incomplete?: boolean };
        let operation = followUpOperations.get(communication.id) ?? null;
        const createdTask = !operation?.task_id;
        if (!operation) {
          operation = {
            operation_id: `cop_follow_${communication.id.slice(-12)}`,
            status: 'in_progress',
            task_id: `task_follow_${communication.id.slice(-8)}`,
            title: typeof input.title === 'string' && input.title.trim()
              ? input.title.trim()
              : `Follow up: ${communication.subject || communication.channel}`,
            completed_intent_ids: [],
            completed_link_ids: [],
            failed_intent_ids: [],
            failed_relationships: [],
            pending_intent_ids: [`follow_up:professional:communication:${communication.id}`]
          };
        }
        if (input.force_incomplete || (body as { simulate_incomplete?: boolean })?.simulate_incomplete) {
          operation = {
            ...operation,
            status: 'incomplete',
            failed_intent_ids: ['contact:shared:person:mock'],
            failed_relationships: [
              {
                intent_id: 'contact:shared:person:mock',
                relationship_type: 'contact',
                target_ref: 'shared:person:mock'
              }
            ],
            pending_intent_ids: ['contact:shared:person:mock'],
            completed_intent_ids: [`follow_up:professional:communication:${communication.id}`],
            completed_link_ids: ['ul_follow_mock']
          };
          followUpOperations.set(communication.id, operation);
          return json(
            503,
            {
              ok: false,
              error: {
                code: 'follow_up_operation_incomplete',
                message: 'Follow-up Task relationships could not be completed.',
                retryable: true
              },
              data: {
                communication_id: communication.id,
                operation_id: operation.operation_id,
                task_id: operation.task_id,
                completed_link_ids: operation.completed_link_ids,
                failed_intent_ids: operation.failed_intent_ids
              }
            });
        }
        operation = {
          ...operation,
          status: 'committed',
          failed_intent_ids: [],
          failed_relationships: [],
          pending_intent_ids: [],
          completed_intent_ids: [
            `follow_up:professional:communication:${communication.id}`,
            'contact:shared:person:mock'
          ],
          completed_link_ids: ['ul_follow_mock', 'ul_contact_mock']
        };
        followUpOperations.set(communication.id, operation);
        const payload = {
          communication: { ...communication, follow_up_operation: operation },
          follow_up_operation: operation,
          task_id: operation.task_id,
          created_task: createdTask,
          incomplete: false
        };
        return json(action === 'create-follow-up' ? 201 : 200, { ok: true, data: payload });
      }

      const input = body as {
        direction?: string;
        channel?: string;
        occurred_at?: string;
        subject?: string;
        summary?: string;
        links?: Array<{ target_ref: string; relationship_type: string; occurred_at?: string }>;
        force_incomplete?: boolean;
      };
      if (input?.direction !== 'outbound' && input?.direction !== 'inbound') {
        return json(400, { ok: false, error: { code: 'invalid_direction', message: 'Invalid direction.' } });
      }
      const now = new Date().toISOString();
      const id = `communication_${randomUUID()}`;
      const communication: CommunicationRecord = {
        schema_version: 1,
        id,
        direction: input.direction,
        channel: input.channel ?? 'email',
        occurred_at: input.occurred_at ?? now,
        subject: (input.subject ?? '').trim(),
        summary: (input.summary ?? '').trim(),
        status: input.direction === 'outbound' ? 'completed' : 'received',
        created_at: now,
        updated_at: now
      };

      // Stored record never copies orchestration links / target IDs.
      const stored = { ...communication };
      communications.set(id, stored);

      const sourceRef = `professional:communication:${id}`;
      for (const link of input.links ?? []) {
        relationships.push({
          id: `link_${randomUUID()}`,
          source_ref: sourceRef,
          target_ref: link.target_ref,
          relationship_type: link.relationship_type,
          inverse_label:
            link.relationship_type === 'recipient' ? 'received_communication' : link.relationship_type,
          context_key: null,
          status: 'current',
          temporal_mode: link.relationship_type === 'follows_from' ? 'timeless' : 'point',
          valid_from: null,
          valid_to: null,
          occurred_at: link.occurred_at ?? communication.occurred_at
        });
      }

      if (input.force_incomplete) {
        const operationId = `cop_${'a'.repeat(32)}`;
        stored.incomplete_links = {
          operation_id: operationId,
          status: 'repair_needed',
          completed_link_ids: [],
          failed_intent_ids: ['intent_000_mock'],
          pending_intent_ids: ['intent_000_mock']
        };
        return json(503, {
          ok: false,
          error: {
            code: 'communication_links_incomplete',
            message: 'One or more Communication links could not be completed.',
            retryable: true
          },
          data: {
            communication_id: id,
            operation_id: operationId,
            completed_link_ids: [],
            failed_intent_ids: ['intent_000_mock']
          }
        });
      }

      return json(201, { ok: true, data: { communication: stored, links: [], created: true } });
    }

    if (path === '/api/communications' && method === 'PATCH') {
      const id = url.searchParams.get('id');
      const communication = id ? communications.get(id) : null;
      if (!communication) {
        return json(404, {
          ok: false,
          error: { code: 'communication_not_found', message: 'Communication not found.' }
        });
      }
      const patch = body as { subject?: string; summary?: string };
      if (typeof patch.subject === 'string') communication.subject = patch.subject.trim();
      if (typeof patch.summary === 'string') communication.summary = patch.summary.trim();
      communication.updated_at = new Date().toISOString();
      communications.set(communication.id, communication);
      return json(200, { ok: true, data: { communication } });
    }

    if (path === '/api/meetings' && method === 'GET') {
      const id = url.searchParams.get('id');
      if (id) {
        const meeting = meetings.get(id);
        if (!meeting) {
          return json(404, { ok: false, error: { code: 'meeting_not_found', message: 'Meeting not found.' } });
        }
        return json(200, { ok: true, data: { meeting } });
      }
      const notion = await loadNotionListCaches();
      const byId = new Map<string, Record<string, unknown>>();
      for (const row of notion?.meetings ?? []) byId.set(String(row.id), row);
      for (const row of meetings.values()) byId.set(String(row.id), row);
      return json(200, {
        ok: true,
        data: {
          meetings: [...byId.values()].sort(
            (a, b) => Date.parse(String(b.scheduled_start)) - Date.parse(String(a.scheduled_start))
          )
        }
      });
    }

    if (path === '/api/meetings' && method === 'POST') {
      const action = url.searchParams.get('action');
      const id = url.searchParams.get('id');
      if (action === 'retry-links' && id) {
        const meeting = meetings.get(id);
        if (!meeting) {
          return json(404, { ok: false, error: { code: 'meeting_not_found', message: 'Meeting not found.' } });
        }
        meeting.incomplete_links = null;
        return json(200, { ok: true, data: { meeting, links: [], retried: true } });
      }
      if (action && id && meetings.has(id)) {
        const meeting = meetings.get(id)!;
        if (action === 'reschedule') {
          const input = body as {
            scheduled_start: string;
            scheduled_end: string;
            time_zone: string;
            reason?: string | null;
          };
          const history = Array.isArray(meeting.occurrence_history)
            ? [...(meeting.occurrence_history as unknown[])]
            : [];
          history.push({
            scheduled_start: meeting.scheduled_start,
            scheduled_end: meeting.scheduled_end,
            time_zone: meeting.time_zone,
            changed_at: new Date().toISOString(),
            ...(input.reason ? { reason: input.reason } : {})
          });
          Object.assign(meeting, {
            scheduled_start: input.scheduled_start,
            scheduled_end: input.scheduled_end,
            time_zone: input.time_zone,
            state: 'rescheduled',
            occurrence_history: history,
            updated_at: new Date().toISOString()
          });
          return json(200, { ok: true, data: { meeting } });
        }
        const stateMap: Record<string, string> = {
          complete: 'completed',
          cancel: 'cancelled',
          'no-show': 'no_show'
        };
        if (stateMap[action]) {
          meeting.state = stateMap[action];
          meeting.updated_at = new Date().toISOString();
          return json(200, { ok: true, data: { meeting } });
        }
      }
      const input = body as {
        title?: string;
        scheduled_start?: string;
        scheduled_end?: string;
        time_zone?: string;
        location_text?: string | null;
        agenda?: string | null;
        notes?: string | null;
        links?: Array<{ target_ref: string; relationship_type: string; role?: string | null; occurred_at?: string }>;
      };
      const now = new Date().toISOString();
      const meetingId = `meeting_${randomUUID()}`;
      const meeting = {
        schema_version: 1,
        id: meetingId,
        title: (input.title ?? '').trim() || 'Untitled',
        scheduled_start: input.scheduled_start ?? now,
        scheduled_end: input.scheduled_end ?? now,
        time_zone: input.time_zone ?? 'Australia/Sydney',
        location_text: input.location_text ?? null,
        agenda: input.agenda ?? null,
        notes: input.notes ?? null,
        state: 'scheduled',
        occurrence_history: [],
        purpose: null as string | null,
        blocks: [] as unknown[],
        decisions: [] as unknown[],
        created_at: now,
        updated_at: now,
        incomplete_links: null as null
      };
      meetings.set(meetingId, meeting);
      const sourceRef = `professional:meeting:${meetingId}`;
      for (const link of input.links ?? []) {
        relationships.push({
          id: `link_${randomUUID()}`,
          source_ref: sourceRef,
          target_ref: link.target_ref,
          relationship_type: link.relationship_type,
          inverse_label: link.relationship_type === 'attendee' ? 'attends' : link.relationship_type,
          context_key: null,
          status: 'current',
          temporal_mode: link.relationship_type === 'attendee' ? 'point' : 'timeless',
          valid_from: null,
          valid_to: null,
          occurred_at: link.occurred_at ?? meeting.scheduled_start
        });
      }
      return json(201, { ok: true, data: { meeting, links: [], created: true } });
    }

    if (path === '/api/meetings' && method === 'PATCH') {
      const id = url.searchParams.get('id');
      const meeting = id ? meetings.get(id) : null;
      if (!meeting) {
        return json(404, { ok: false, error: { code: 'meeting_not_found', message: 'Meeting not found.' } });
      }
      const patch = body as Record<string, unknown>;
      for (const key of ['title', 'location_text', 'agenda', 'notes', 'purpose', 'blocks', 'decisions']) {
        if (patch[key] !== undefined) meeting[key] = patch[key];
      }
      meeting.updated_at = new Date().toISOString();
      return json(200, { ok: true, data: { meeting } });
    }

    if (path === '/api/threads' && method === 'GET') {
      const id = url.searchParams.get('id');
      if (id) {
        const thread = threads.get(id);
        if (!thread) {
          return json(404, { ok: false, error: { code: 'thread_not_found', message: 'Thread not found.' } });
        }
        return json(200, { ok: true, data: { thread } });
      }
      return json(200, { ok: true, data: { threads: [...threads.values()] } });
    }

    if (path === '/api/threads' && method === 'POST') {
      const input = (body ?? {}) as { kind?: string; title?: string; purpose_tag?: string | null; goals?: unknown[] };
      const now = new Date().toISOString();
      const id = `thread_${crypto.randomUUID()}`;
      const thread = {
        schema_version: 1,
        id,
        kind: input.kind === 'case' ? 'case' : 'general',
        title: typeof input.title === 'string' ? input.title.trim() : 'Thread',
        purpose_tag: typeof input.purpose_tag === 'string' ? input.purpose_tag.trim().toLowerCase() || null : null,
        goals: Array.isArray(input.goals) ? input.goals : [],
        status: 'open',
        created_at: now,
        updated_at: now
      };
      threads.set(id, thread);
      return json(200, { ok: true, data: { thread } });
    }

    if (path === '/api/threads' && method === 'PATCH') {
      const id = url.searchParams.get('id');
      const thread = id ? threads.get(id) : null;
      if (!thread) {
        return json(404, { ok: false, error: { code: 'thread_not_found', message: 'Thread not found.' } });
      }
      const patch = (body ?? {}) as Record<string, unknown>;
      for (const key of ['kind', 'title', 'purpose_tag', 'goals', 'status']) {
        if (patch[key] !== undefined) thread[key] = patch[key];
      }
      thread.updated_at = new Date().toISOString();
      return json(200, { ok: true, data: { thread } });
    }

    if (path === '/api/events' && method === 'GET') {
      const id = url.searchParams.get('id');
      if (id) {
        const event = events.get(id);
        if (!event) {
          return json(404, { ok: false, error: { code: 'event_not_found', message: 'Event not found.' } });
        }
        return json(200, { ok: true, data: { event } });
      }
      return json(200, {
        ok: true,
        data: {
          events: [...events.values()].sort(
            (a, b) => Date.parse(String(a.start)) - Date.parse(String(b.start))
          )
        }
      });
    }

    if (path === '/api/events' && method === 'POST') {
      const action = url.searchParams.get('action');
      const id = url.searchParams.get('id');
      if (action === 'retry-links' && id) {
        const event = events.get(id);
        if (!event) {
          return json(404, { ok: false, error: { code: 'event_not_found', message: 'Event not found.' } });
        }
        event.incomplete_links = null;
        return json(200, { ok: true, data: { event, links: [], retried: true } });
      }
      if (action && id && events.has(id)) {
        const event = events.get(id)!;
        if (action === 'reschedule') {
          const input = body as { start: string; end: string; time_zone: string; all_day?: boolean };
          Object.assign(event, {
            start: input.start,
            end: input.end,
            time_zone: input.time_zone,
            all_day: input.all_day ?? false,
            occurrence_state: 'rescheduled',
            updated_at: new Date().toISOString()
          });
          return json(200, { ok: true, data: { event } });
        }
        if (action === 'complete' || action === 'cancel') {
          event.occurrence_state = action === 'complete' ? 'completed' : 'cancelled';
          event.updated_at = new Date().toISOString();
          return json(200, { ok: true, data: { event } });
        }
      }
      const input = body as {
        title?: string;
        event_type?: string;
        start?: string;
        end?: string;
        time_zone?: string;
        all_day?: boolean;
        location_text?: string | null;
        accreditation_category?: string | null;
        priority_area?: string | null;
        hours?: number | null;
        attendance_state?: string | null;
        certificate?: unknown;
        links?: Array<{ target_ref: string; relationship_type: string }>;
      };
      const now = new Date().toISOString();
      const eventId = `event_${randomUUID()}`;
      const event = {
        schema_version: 1,
        id: eventId,
        title: (input.title ?? '').trim() || 'Untitled',
        event_type: input.event_type ?? 'professional_development',
        start: input.start ?? now,
        end: input.end ?? now,
        time_zone: input.time_zone ?? 'Australia/Sydney',
        all_day: Boolean(input.all_day),
        occurrence_state: 'scheduled',
        location_text: input.location_text ?? null,
        accreditation_category: input.accreditation_category ?? null,
        priority_area: input.priority_area ?? null,
        hours: input.hours ?? null,
        attendance_state: input.attendance_state ?? null,
        certificate: input.certificate ?? null,
        talks: [] as unknown[],
        blocks: [] as unknown[],
        created_at: now,
        updated_at: now,
        incomplete_links: null as null
      };
      events.set(eventId, event);
      const sourceRef = `professional:event:${eventId}`;
      for (const link of input.links ?? []) {
        relationships.push({
          id: `link_${randomUUID()}`,
          source_ref: sourceRef,
          target_ref: link.target_ref,
          relationship_type: link.relationship_type,
          inverse_label: link.relationship_type,
          context_key: null,
          status: 'current',
          temporal_mode: 'timeless',
          valid_from: null,
          valid_to: null,
          occurred_at: null
        });
      }
      return json(201, { ok: true, data: { event, links: [], created: true } });
    }

    if (path === '/api/events' && method === 'PATCH') {
      const id = url.searchParams.get('id');
      const event = id ? events.get(id) : null;
      if (!event) {
        return json(404, { ok: false, error: { code: 'event_not_found', message: 'Event not found.' } });
      }
      const patch = body as Record<string, unknown>;
      for (const key of Object.keys(patch)) {
        if (
          [
            'title',
            'location_text',
            'accreditation_category',
            'priority_area',
            'hours',
            'attendance_state',
            'certificate',
            'all_day',
            'start',
            'end',
            'time_zone',
            'event_type',
            'talks',
            'blocks'
          ].includes(key)
        ) {
          event[key] = patch[key];
        }
      }
      event.updated_at = new Date().toISOString();
      return json(200, { ok: true, data: { event } });
    }

    if (path === '/api/schedule-projections' && method === 'GET') {
      const projections = [
        ...[...meetings.values()].map((meeting) => ({
          projection_id: `proj_meeting_${String(meeting.id).slice(-12)}`,
          source_ref: `professional:meeting:${meeting.id}`,
          kind: 'meeting',
          title: meeting.title,
          start: meeting.scheduled_start,
          end: meeting.scheduled_end,
          time_zone: meeting.time_zone,
          all_day: false,
          status: meeting.state,
          href: `/professional/#/meeting/${meeting.id}`
        })),
        ...[...events.values()].map((event) => ({
          projection_id: `proj_event_${String(event.id).slice(-12)}`,
          source_ref: `professional:event:${event.id}`,
          kind: 'event',
          title: event.title,
          start: event.start,
          end: event.end,
          time_zone: event.time_zone,
          all_day: Boolean(event.all_day),
          status: event.occurrence_state,
          event_type: typeof event.event_type === 'string' ? event.event_type : null,
          href: `/professional/#/event/${event.id}`
        })),
        ...[...communications.values()].map((comm) => {
          const start = comm.scheduled_start ?? comm.occurred_at;
          const pin = !comm.scheduled_start || !comm.scheduled_end;
          return {
            projection_id: `proj_comm_${String(comm.id).slice(-12)}`,
            source_ref: `professional:communication:${comm.id}`,
            kind: 'communication',
            title: comm.subject || String(comm.channel || 'comm').replace(/_/g, ' '),
            start,
            end: pin ? start : comm.scheduled_end,
            time_zone: comm.time_zone || 'Australia/Sydney',
            all_day: false,
            status: comm.status,
            channel: comm.channel,
            pin,
            href: `/professional/#/communication/${comm.id}`
          };
        })
      ];
      return json(200, { ok: true, data: { projections, promises: [] } });
    }

    // Local seed so Home Tideline can paint the Hammond tray (Apply / Review / Dismiss).
    if (path === '/api/calendar-ghosts' && method === 'GET') {
      const today = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Australia/Sydney',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());
      const id = 'ghost_mock_block_1';
      return json(200, {
        ghosts: [
          {
            id,
            agent: 'hammond',
            kind: 'protect_block',
            label: 'Protect marking block',
            meta: 'Tue 16:00–18:00 · clears a collision',
            date: today,
            start: '16:00',
            end: '18:00',
            title: 'Protect marking block',
            chip: {
              id,
              title: 'Protect marking block',
              date: today,
              start: '16:00',
              end: '18:00',
              kind: 'professional',
              meta: 'Hammond · proposal',
              ghost: true
            }
          }
        ]
      });
    }

    if (path === '/api/calendar-ghosts' && method === 'POST') {
      return json(200, { ok: true, receipt: 'Dismissed. Nothing written.' });
    }

    // Soft-empty hub calendar sources so local Home does not paint fail banners.
    if (path.startsWith('/api/repo/manifest') && method === 'GET') {
      return json(200, {
        ok: true,
        data: {
          commitSha: 'a'.repeat(40),
          treeSha: 'b'.repeat(40),
          manifestId: 'local-mock',
          from: url.searchParams.get('from'),
          to: url.searchParams.get('to'),
          files: []
        }
      });
    }

    if (path === '/api/repo/files' && method === 'POST') {
      return json(200, { ok: true, data: { commitSha: 'a'.repeat(40), files: [] } });
    }

    if (
      method === 'GET' &&
      [
        '/api/curriculum',
        '/api/tasks',
        '/api/work-blocks',
        '/api/planning-profile',
        '/api/workflow-state',
        '/api/hub-prefs',
        '/api/knowledge'
      ].some((prefix) => path.startsWith(prefix))
    ) {
      return json(200, {
        ok: true,
        data: {
          years: [],
          subjects: [],
          units: [],
          lessons: [],
          classes: [],
          scheduled_lessons: [],
          tasks: [],
          work_blocks: [],
          school_terms: [],
          pages: []
        }
      });
    }

    if (path === '/api/applications' && method === 'GET') {
      const id = url.searchParams.get('id');
      if (id) {
        const application = applications.get(id);
        if (!application) {
          return json(404, {
            ok: false,
            error: { code: 'application_not_found', message: 'Application not found.' }
          });
        }
        return json(200, { ok: true, data: { application } });
      }
      return json(200, {
        ok: true,
        data: {
          applications: [...applications.values()].sort(
            (a, b) => Date.parse(String(b.updated_at)) - Date.parse(String(a.updated_at))
          )
        }
      });
    }

    if (path === '/api/applications' && method === 'POST') {
      const action = url.searchParams.get('action');
      const id = url.searchParams.get('id');
      if (action === 'retry-links' && id) {
        const application = applications.get(id);
        if (!application) {
          return json(404, {
            ok: false,
            error: { code: 'application_not_found', message: 'Application not found.' }
          });
        }
        application.incomplete_links = null;
        return json(200, { ok: true, data: { application, links: [], retried: true } });
      }
      if (action === 'transition' && id && applications.has(id)) {
        const application = applications.get(id)!;
        const next = (body as { pipeline_status?: string })?.pipeline_status;
        if (!next) {
          return json(400, {
            ok: false,
            error: { code: 'invalid_pipeline_status', message: 'pipeline_status is not permitted.' }
          });
        }
        application.pipeline_status = next;
        application.updated_at = new Date().toISOString();
        return json(200, { ok: true, data: { application } });
      }
      if (action === 'link-task' && id && applications.has(id)) {
        const application = applications.get(id)!;
        const input = body as { title?: string; task_id?: string; relationship_type?: string };
        const operation = {
          operation_id: `ptl_${randomUUID().slice(0, 8)}`,
          status: 'committed',
          task_id: input.task_id ?? `task_${randomUUID().slice(0, 8)}`,
          title: input.title ?? 'Application action',
          relationship_type: 'application_action',
          completed_intent_ids: [] as string[],
          completed_link_ids: [] as string[],
          failed_intent_ids: [] as string[],
          pending_intent_ids: [] as string[]
        };
        application.application_action_operation = operation;
        application.updated_at = new Date().toISOString();
        return json(200, { ok: true, data: { application, operation } });
      }
      if (action === 'retry-task-link' && id && applications.has(id)) {
        const application = applications.get(id)!;
        const operation = application.application_action_operation as
          | Record<string, unknown>
          | undefined;
        if (operation) {
          operation.status = 'committed';
          application.application_action_operation = operation;
        }
        return json(200, {
          ok: true,
          data: { application, operation: application.application_action_operation }
        });
      }
      const input = body as {
        position_title?: string;
        advertisement?: Record<string, unknown>;
        closing_date?: string | null;
        documents?: unknown[];
        selection_criteria?: unknown[];
        interview_rounds?: unknown[];
        links?: Array<{ target_ref: string; relationship_type: string; role?: string | null }>;
      };
      const now = new Date().toISOString();
      const applicationId = `application_${randomUUID()}`;
      const application = {
        schema_version: 1,
        id: applicationId,
        position_title: (input.position_title ?? '').trim() || 'Untitled',
        advertisement: {
          title: (input.advertisement?.title as string | null | undefined) ?? null,
          url: (input.advertisement?.url as string | null | undefined) ?? null,
          source: (input.advertisement?.source as string | null | undefined) ?? null,
          summary: (input.advertisement?.summary as string | null | undefined) ?? null,
          captured_at: (input.advertisement?.captured_at as string | null | undefined) ?? null
        },
        closing_date: input.closing_date ?? null,
        pipeline_status: 'drafting',
        documents: Array.isArray(input.documents) ? input.documents : [],
        selection_criteria: Array.isArray(input.selection_criteria) ? input.selection_criteria : [],
        interview_rounds: Array.isArray(input.interview_rounds) ? input.interview_rounds : [],
        outcome: { status: 'none', date: null, offer_details: null, reason: null },
        reflection: null,
        created_at: now,
        updated_at: now,
        incomplete_links: null as null
      };
      applications.set(applicationId, application);
      const sourceRef = `professional:application:${applicationId}`;
      for (const link of input.links ?? []) {
        relationships.push({
          id: `link_${randomUUID()}`,
          source_ref: sourceRef,
          target_ref: link.target_ref,
          relationship_type: link.relationship_type,
          inverse_label: link.relationship_type,
          context_key: null,
          status: 'current',
          temporal_mode: 'timeless',
          valid_from: null,
          valid_to: null,
          occurred_at: null
        });
      }
      return json(201, { ok: true, data: { application, links: [], created: true } });
    }

    if (path === '/api/applications' && method === 'PATCH') {
      const id = url.searchParams.get('id');
      const application = id ? applications.get(id) : null;
      if (!application) {
        return json(404, {
          ok: false,
          error: { code: 'application_not_found', message: 'Application not found.' }
        });
      }
      const patch = body as Record<string, unknown>;
      for (const key of [
        'position_title',
        'advertisement',
        'closing_date',
        'documents',
        'selection_criteria',
        'interview_rounds',
        'outcome',
        'reflection'
      ]) {
        if (patch[key] !== undefined) {
          if (key === 'documents' && Array.isArray(patch.documents)) {
            application.documents = (patch.documents as Array<Record<string, unknown>>).map((doc) => ({
              ...doc,
              id: typeof doc.id === 'string' ? doc.id : `adoc_${randomUUID()}`
            }));
          } else if (key === 'selection_criteria' && Array.isArray(patch.selection_criteria)) {
            application.selection_criteria = (
              patch.selection_criteria as Array<Record<string, unknown>>
            ).map((entry) => ({
              ...entry,
              id: typeof entry.id === 'string' ? entry.id : `acrit_${randomUUID()}`
            }));
          } else if (key === 'interview_rounds' && Array.isArray(patch.interview_rounds)) {
            application.interview_rounds = (
              patch.interview_rounds as Array<Record<string, unknown>>
            ).map((entry) => ({
              ...entry,
              id: typeof entry.id === 'string' ? entry.id : `aint_${randomUUID()}`
            }));
          } else if (key === 'advertisement' && patch.advertisement && typeof patch.advertisement === 'object') {
            application.advertisement = {
              ...(application.advertisement as Record<string, unknown>),
              ...(patch.advertisement as Record<string, unknown>)
            };
          } else if (key === 'outcome' && patch.outcome && typeof patch.outcome === 'object') {
            application.outcome = {
              ...(application.outcome as Record<string, unknown>),
              ...(patch.outcome as Record<string, unknown>)
            };
          } else {
            application[key] = patch[key];
          }
        }
      }
      application.updated_at = new Date().toISOString();
      return json(200, { ok: true, data: { application } });
    }

    if (path === '/api/career' && method === 'GET') {
      const appItems = [...applications.values()].map((record) => ({
        ref: `professional:application:${record.id}`,
        id: record.id,
        position_title: record.position_title,
        pipeline_status: record.pipeline_status,
        closing_date: record.closing_date ?? null,
        updated_at: record.updated_at,
        href: `/professional/#/career/application/${record.id}`
      }));
      const pdItems = [...events.values()]
        .filter((event) => event.event_type === 'professional_development')
        .map((event) => ({
          ref: `professional:event:${event.id}`,
          id: event.id,
          title: event.title,
          event_type: event.event_type,
          start: event.start,
          end: event.end,
          occurrence_state: event.occurrence_state,
          href: `/professional/#/event/${event.id}`
        }));
      const pendingScan = [...scanProposals.values()].filter((p) => p.status === 'pending');
      // Seeded from life-hub-data relationships.json (Adam / derived:person:adam-russell)
      // so local Career river shows the real past role band during development.
      const employmentItems = [
        {
          ref: 'shared:organisation:org_kooringal',
          kind: 'organisation',
          display_label: 'Kooringal High School',
          role: 'English Teacher',
          valid_from: '2012-12-02',
          valid_to: '2014-12-19',
          link_status: 'ended'
        },
        {
          ref: 'shared:organisation:org_xavier',
          kind: 'organisation',
          display_label: 'Xavier High School',
          role: 'English/HSIE Teacher',
          valid_from: '2015-01-26',
          valid_to: '2018-10-01',
          link_status: 'ended'
        },
        {
          ref: 'shared:organisation:org_all_areas',
          kind: 'organisation',
          display_label: 'All Areas Education',
          role: 'Senior Education Project Officer',
          valid_from: '2018-10-01',
          valid_to: '2019-05-03',
          link_status: 'ended'
        },
        {
          ref: 'shared:organisation:org_st_josephs',
          kind: 'organisation',
          display_label: "St Joseph's High School",
          role: 'HSIE and Business Studies Teacher',
          valid_from: '2019-05-01',
          valid_to: '2019-12-31',
          link_status: 'ended'
        },
        {
          ref: 'shared:organisation:org_st_pius',
          kind: 'organisation',
          display_label: 'St Pius X High School',
          role: 'English Teacher',
          valid_from: '2021-01-25',
          valid_to: '2024-08-16',
          link_status: 'ended'
        },
        {
          ref: 'shared:organisation:org_st_pius',
          kind: 'organisation',
          display_label: 'St Pius X High School',
          role: 'Psychology Teacher',
          valid_from: '2023-01-23',
          valid_to: '2024-08-16',
          link_status: 'ended'
        },
        {
          ref: 'shared:organisation:org_mcauley',
          kind: 'organisation',
          display_label: 'Catherine McAuley Catholic College',
          role: 'English Teacher',
          valid_from: '2024-08-19',
          valid_to: '2024-12-20',
          link_status: 'ended'
        },
        {
          ref: 'shared:organisation:org_aloysius',
          kind: 'organisation',
          display_label: "St Aloysius' College",
          role: 'Gifted Education Teacher',
          valid_from: '2025-01-22',
          valid_to: null,
          link_status: 'current'
        },
        {
          ref: 'shared:organisation:org_aloysius',
          kind: 'organisation',
          display_label: "St Aloysius' College",
          role: 'Leader of Learning Enrichment',
          valid_from: '2025-01-22',
          valid_to: null,
          link_status: 'current'
        },
        {
          ref: 'shared:organisation:org_aloysius',
          kind: 'organisation',
          display_label: "St Aloysius' College",
          role: 'Curriculum Leader',
          valid_from: '2024-01-01',
          valid_to: '2024-12-20',
          link_status: 'ended'
        },
        {
          ref: 'shared:organisation:org_aloysius',
          kind: 'organisation',
          display_label: "St Aloysius' College",
          role: 'Professional Learning Coordinator',
          valid_from: '2024-08-19',
          valid_to: '2024-12-20',
          link_status: 'ended'
        }
      ];
      return json(200, {
        ok: true,
        data: {
          applications: { status: 'ok', items: appItems },
          employment: { status: 'ok', items: employmentItems },
          employment_items: employmentItems,
          professional_development: { status: 'ok', items: pdItems },
          people: { status: 'ok', items: [] },
          organisations: { status: 'ok', items: [] },
          deferred: ['publication', 'presentation'],
          achievements: [...achievements.values()],
          futures: [...futures.values()],
          stones: [...stones.values()],
          supports_future: [],
          answers_criterion: [],
          stone_for: [],
          stone_actions: [],
          scan: {
            pending_count: pendingScan.length,
            last_run_at: scanState.last_run_at
          }
        }
      });
    }

    if (path === '/api/career-scan' && method === 'GET') {
      return json(200, { ok: true, data: scanPanelPayload() });
    }

    if (path === '/api/career-scan' && method === 'POST') {
      const action = url.searchParams.get('action') || 'run-now';
      if (action === 'run-now') {
        scanState = {
          last_run_at: new Date().toISOString(),
          last_success_week: scanState.last_success_week
        };
        return json(200, {
          ok: true,
          data: {
            skipped: false,
            sources: 0,
            saved: 0,
            spotted_future: null,
            ...scanPanelPayload()
          }
        });
      }
      if (action === 'bin') {
        const id = typeof (body as { id?: string })?.id === 'string' ? (body as { id: string }).id : null;
        if (!id || !scanProposals.has(id)) {
          return json(404, { ok: false, error: { code: 'not_found', message: 'Proposal not found.' } });
        }
        const proposal = { ...scanProposals.get(id)!, status: 'binned' };
        scanProposals.set(id, proposal);
        return json(200, { ok: true, data: { proposal } });
      }
      if (action === 'keep') {
        const id = typeof (body as { id?: string })?.id === 'string' ? (body as { id: string }).id : null;
        if (!id || !scanProposals.has(id)) {
          return json(404, { ok: false, error: { code: 'not_found', message: 'Proposal not found.' } });
        }
        const proposal = scanProposals.get(id)!;
        const achievementId = `ach_${randomUUID().slice(0, 8)}`;
        const nowIso = new Date().toISOString();
        const achievement = {
          id: achievementId,
          title: typeof (body as { title?: string })?.title === 'string'
            ? (body as { title: string }).title
            : String(proposal.title ?? 'Kept skill'),
          occurred_on: proposal.occurred_on ?? nowIso.slice(0, 10),
          date_precision: proposal.date_precision ?? 'day',
          skills: proposal.skills ?? [],
          apst: proposal.apst ?? [],
          source_refs: proposal.source_refs ?? [],
          created_at: nowIso,
          updated_at: nowIso
        };
        achievements.set(achievementId, achievement);
        scanProposals.set(id, { ...proposal, status: 'kept' });
        return json(200, { ok: true, data: { achievement, proposal: scanProposals.get(id) } });
      }
      if (action === 'edit') {
        return json(200, { ok: true, data: { ok: true, note: 'Edit in place on the card, then Keep.' } });
      }
      return json(400, { ok: false, error: { code: 'unknown_action', message: 'Unknown scan action.' } });
    }

    if (path === '/api/career-achievements' && method === 'GET') {
      return json(200, { ok: true, data: { achievements: [...achievements.values()] } });
    }

    if (path === '/api/career-achievements' && method === 'POST') {
      const input = body as { title?: string };
      const id = `ach_${randomUUID().slice(0, 8)}`;
      const nowIso = new Date().toISOString();
      const achievement = {
        id,
        title: typeof input.title === 'string' && input.title.trim() ? input.title.trim() : 'Untitled',
        occurred_on: nowIso.slice(0, 10),
        date_precision: 'day',
        skills: [],
        apst: [],
        source_refs: [],
        created_at: nowIso,
        updated_at: nowIso
      };
      achievements.set(id, achievement);
      return json(201, { ok: true, data: { achievement } });
    }

    if (path === '/api/career-futures' && method === 'GET') {
      return json(200, { ok: true, data: { futures: [...futures.values()] } });
    }

    if (path === '/api/career-futures' && method === 'POST') {
      const action = url.searchParams.get('action');
      const input = body as { title?: string; where?: string; criteria?: unknown[] };
      if (action === 'draft') {
        return json(200, {
          ok: true,
          data: {
            draft: {
              title: typeof input.title === 'string' ? input.title : 'Draft future',
              where: typeof input.where === 'string' ? input.where : null,
              criteria: Array.isArray(input.criteria) ? input.criteria : []
            }
          }
        });
      }
      const id = `fut_${randomUUID().slice(0, 8)}`;
      const nowIso = new Date().toISOString();
      const future = {
        id,
        title: typeof input.title === 'string' && input.title.trim() ? input.title.trim() : 'Untitled future',
        where: typeof input.where === 'string' ? input.where : null,
        status: 'active',
        criteria: Array.isArray(input.criteria) ? input.criteria : [],
        colour_slot: futures.size % 6,
        created_at: nowIso,
        updated_at: nowIso
      };
      futures.set(id, future);
      return json(201, { ok: true, data: { future } });
    }

    if (path === '/api/career-futures' && method === 'PATCH') {
      const id = url.searchParams.get('id');
      if (!id || !futures.has(id)) {
        return json(404, { ok: false, error: { code: 'not_found', message: 'Future not found.' } });
      }
      const patch = (body ?? {}) as Record<string, unknown>;
      const future = { ...futures.get(id)!, ...patch, id, updated_at: new Date().toISOString() };
      futures.set(id, future);
      return json(200, { ok: true, data: { future } });
    }

    if (path === '/api/career-stones' && method === 'GET') {
      return json(200, { ok: true, data: { stones: [...stones.values()] } });
    }

    if (path === '/api/career-stones' && method === 'POST') {
      const input = body as { title?: string; future_id?: string };
      const id = `stone_${randomUUID().slice(0, 8)}`;
      const nowIso = new Date().toISOString();
      const stone = {
        id,
        title: typeof input.title === 'string' && input.title.trim() ? input.title.trim() : 'Untitled stone',
        future_id: typeof input.future_id === 'string' ? input.future_id : null,
        status: 'open',
        created_at: nowIso,
        updated_at: nowIso
      };
      stones.set(id, stone);
      return json(201, { ok: true, data: { stone } });
    }

    if (path === '/api/career-stones' && method === 'PATCH') {
      const id = url.searchParams.get('id');
      if (!id || !stones.has(id)) {
        return json(404, { ok: false, error: { code: 'not_found', message: 'Stone not found.' } });
      }
      const patch = (body ?? {}) as Record<string, unknown>;
      const stone = { ...stones.get(id)!, ...patch, id, updated_at: new Date().toISOString() };
      stones.set(id, stone);
      return json(200, { ok: true, data: { stone } });
    }

    if (path === '/api/career-moves' && method === 'GET') {
      return json(200, { ok: true, data: { moves: [...careerMoves.values()] } });
    }

    if (path === '/api/tasks' && method === 'POST') {
      const input = body as { title?: string };
      const id = `task_${randomUUID().slice(0, 8)}`;
      const task = {
        id,
        title: typeof input.title === 'string' ? input.title : 'Untitled',
        status: 'open',
        domain: 'work',
        priority: 'normal',
        kind: 'task'
      };
      // Task JSON never stores Communication or Person IDs.
      return json(201, { ok: true, data: task });
    }

    if (path === '/api/pd-groups' && method === 'GET') {
      const id = url.searchParams.get('id');
      if (id) {
        const group = pdGroups.get(id);
        if (!group) {
          return json(404, { ok: false, error: { code: 'pd_group_not_found', message: 'PD group not found.' } });
        }
        return json(200, { ok: true, data: { group } });
      }
      return json(200, { ok: true, data: { groups: [...pdGroups.values()] } });
    }

    if (path === '/api/pd-groups' && method === 'POST') {
      const input = (body ?? {}) as { shape?: string; title?: string; provider?: string | null };
      const now = new Date().toISOString();
      const id = `pd_group_${randomUUID()}`;
      const group = {
        schema_version: 1,
        id,
        shape: input.shape === 'program' ? 'program' : 'series',
        title: typeof input.title === 'string' ? input.title.trim() || 'PD group' : 'PD group',
        provider: typeof input.provider === 'string' ? input.provider : null,
        created_at: now,
        updated_at: now
      };
      pdGroups.set(id, group);
      return json(201, { ok: true, data: { group } });
    }

    if (path === '/api/pd-groups' && method === 'PATCH') {
      const id = url.searchParams.get('id');
      const group = id ? pdGroups.get(id) : null;
      if (!group) {
        return json(404, { ok: false, error: { code: 'pd_group_not_found', message: 'PD group not found.' } });
      }
      const patch = (body ?? {}) as Record<string, unknown>;
      for (const key of ['shape', 'title', 'provider']) {
        if (patch[key] !== undefined) group[key] = patch[key];
      }
      group.updated_at = new Date().toISOString();
      return json(200, { ok: true, data: { group } });
    }

    if (path === '/api/knowledge/pages' && method === 'POST') {
      const input = (body ?? {}) as { title?: string; body?: string; area?: string; tags?: string[] };
      const now = new Date().toISOString();
      const id = `page_${randomUUID()}`;
      const page = {
        id,
        title: typeof input.title === 'string' ? input.title.trim() || 'Untitled note' : 'Untitled note',
        body: typeof input.body === 'string' ? input.body : '',
        area: input.area ?? 'notes',
        tags: Array.isArray(input.tags) ? input.tags : [],
        created_at: now,
        updated_at: now
      };
      knowledgePages.set(id, page);
      return json(201, { ok: true, data: page });
    }

    if (path === '/api/universal-links' && method === 'POST') {
      const input = body as {
        source_ref?: string;
        target_ref?: string;
        relationship_type?: string;
        role?: string | null;
        valid_from?: string | null;
        metadata?: Record<string, unknown>;
      };
      for (const key of ['actor', 'workflow', 'allowed_visibility', 'allowed_entity_kinds']) {
        if (input && Object.prototype.hasOwnProperty.call(input, key)) {
          return json(400, {
            ok: false,
            error: { code: 'access_field_not_accepted', message: `Field "${key}" is not accepted.` }
          });
        }
      }
      if (!input?.source_ref || !input?.target_ref || !input?.relationship_type) {
        return json(400, { ok: false, error: { code: 'invalid_input', message: 'Invalid link.' } });
      }
      const existing = relationships.find(
        (link) =>
          link.source_ref === input.source_ref &&
          link.target_ref === input.target_ref &&
          link.relationship_type === input.relationship_type &&
          link.status === 'current'
      );
      if (existing) {
        if (input.role !== undefined) existing.role = input.role;
        return json(200, {
          ok: true,
          data: {
            link: {
              id: existing.id,
              source_ref: existing.source_ref,
              target_ref: existing.target_ref,
              relationship_type: existing.relationship_type,
              status: existing.status,
              role: existing.role ?? null
            },
            created: false
          }
        });
      }
      const id = `ul_${Buffer.from(`${input.source_ref}|${input.target_ref}|${input.relationship_type}`)
        .toString('hex')
        .slice(0, 24)}`;
      relationships.push({
        id,
        source_ref: input.source_ref,
        target_ref: input.target_ref,
        relationship_type: input.relationship_type,
        inverse_label: input.relationship_type,
        context_key: null,
        status: 'current',
        temporal_mode: 'timeless',
        valid_from: input.valid_from ?? null,
        valid_to: null,
        occurred_at: null,
        role: input.role ?? null,
        ...(input.metadata ? { metadata: input.metadata } : {})
      });
      return json(201, {
        ok: true,
        data: {
          link: {
            id,
            source_ref: input.source_ref,
            target_ref: input.target_ref,
            relationship_type: input.relationship_type,
            status: 'current',
            role: input.role ?? null,
            ...(input.metadata ? { metadata: input.metadata } : {})
          },
          created: true
        }
      });
    }

    if (path === '/api/universal-links' && method === 'GET') {
      const entityRef = url.searchParams.get('entity_ref');
      if (!entityRef) {
        return json(400, { ok: false, error: { code: 'missing_selector', message: 'selector required' } });
      }
      const outgoing = relationships
        .filter((link) => link.source_ref === entityRef && link.status === 'current')
        .map((link) => ({
          link,
          endpoint: findByRef(link.target_ref)
            ? endpointFor(findByRef(link.target_ref) as PersonRecord | OrganisationRecord | CommunicationRecord)
            : {
                ref: link.target_ref,
                kind: 'unknown',
                display_label: link.target_ref,
                supporting_label: null,
                href: null,
                lifecycle_status: null,
                visibility: 'operator'
              }
        }));
      const incoming = relationships
        .filter((link) => link.target_ref === entityRef && link.status === 'current')
        .map((link) => ({
          link,
          endpoint: findByRef(link.source_ref)
            ? endpointFor(findByRef(link.source_ref) as PersonRecord | OrganisationRecord | CommunicationRecord)
            : {
                ref: link.source_ref,
                kind: 'unknown',
                display_label: link.source_ref,
                supporting_label: null,
                href: null,
                lifecycle_status: null,
                visibility: 'operator'
              }
        }));
      return json(200, { ok: true, data: { outgoing, incoming } });
    }

    if (path === '/api/universal-links' && method === 'PATCH') {
      const id = url.searchParams.get('id');
      const action = url.searchParams.get('action') ?? '';
      const link = relationships.find((r) => r.id === id);
      if (!id || !link) {
        return json(404, { ok: false, error: { code: 'link_not_found', message: 'Link not found.' } });
      }
      const input = (body ?? {}) as {
        role?: string | null;
        changed_at?: string;
        valid_to?: string | null;
        reason?: string;
      };
      if (action === 'end' || action === 'suppress') {
        link.status = 'ended';
        link.valid_to = input.valid_to ?? new Date().toISOString();
        return json(200, { ok: true, data: { link } });
      }
      if (action === 'change_role') {
        const ended = { ...link, status: 'ended', valid_to: input.changed_at ?? new Date().toISOString() };
        link.status = 'ended';
        link.valid_to = ended.valid_to;
        const created: RelationshipSeed = {
          ...link,
          id: `${link.id}_role_${Date.now().toString(36)}`,
          status: 'current',
          role: input.role ?? null,
          valid_from: input.changed_at ?? new Date().toISOString(),
          valid_to: null
        };
        relationships.push(created);
        return json(200, { ok: true, data: { ended, created } });
      }
      return json(400, { ok: false, error: { code: 'invalid_action', message: 'Unsupported action.' } });
    }

    return json(404, { ok: false, error: { code: 'not_found', message: 'Unknown route.' } });
  }

  return {
    handle,
    async handleNodeRequest(
      req: { method?: string; url?: string; on: Function },
      res: { statusCode: number; setHeader: Function; end: Function }
    ) {
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve) => {
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => resolve());
      });
      let body: unknown;
      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw) {
        try {
          body = JSON.parse(raw);
        } catch {
          body = undefined;
        }
      }
      const result = await handle(req.method ?? 'GET', req.url ?? '/', body);
      res.statusCode = result.status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result.body));
    }
  };
}
