/**
 * In-memory mock of umbrella endpoints Professional needs for local Vite
 * development: session, entities search/overview, and Communications.
 * Synthetic fixtures only — no production data, no AI providers.
 */
import { randomUUID } from 'node:crypto';
import seedData from '../fixtures/seed.json' with { type: 'json' };

const LOCAL_PASSPHRASE = 'professional-hub-local';

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
  const communications = new Map<string, CommunicationRecord>();
  const followUpOperations = new Map<string, NonNullable<CommunicationRecord['follow_up_operation']>>();
  const meetings = new Map<string, Record<string, unknown>>();
  const events = new Map<string, Record<string, unknown>>();

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
        href: entry.endpoint.href ?? null
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
      const list = [...communications.values()].sort((a, b) => {
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
      return json(200, {
        ok: true,
        data: {
          meetings: [...meetings.values()].sort(
            (a, b) => Date.parse(String(a.scheduled_start)) - Date.parse(String(b.scheduled_start))
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
      for (const key of ['title', 'location_text', 'agenda', 'notes']) {
        if (patch[key] !== undefined) meeting[key] = patch[key];
      }
      meeting.updated_at = new Date().toISOString();
      return json(200, { ok: true, data: { meeting } });
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
        hours: input.hours ?? null,
        attendance_state: input.attendance_state ?? null,
        certificate: input.certificate ?? null,
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
            'hours',
            'attendance_state',
            'certificate',
            'all_day'
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
          href: `/professional/#/event/${event.id}`
        }))
      ];
      return json(200, { ok: true, data: { projections } });
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

    if (path === '/api/universal-links' && method === 'POST') {
      const input = body as {
        source_ref?: string;
        target_ref?: string;
        relationship_type?: string;
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
        return json(200, {
          ok: true,
          data: {
            link: {
              id: existing.id,
              source_ref: existing.source_ref,
              target_ref: existing.target_ref,
              relationship_type: existing.relationship_type,
              status: existing.status
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
        valid_from: null,
        valid_to: null,
        occurred_at: null
      });
      return json(201, {
        ok: true,
        data: {
          link: {
            id,
            source_ref: input.source_ref,
            target_ref: input.target_ref,
            relationship_type: input.relationship_type,
            status: 'current'
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
