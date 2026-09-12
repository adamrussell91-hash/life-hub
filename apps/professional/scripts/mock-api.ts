/**
 * Small in-memory mock of the umbrella endpoints Professional needs, so the
 * Vite dev server works without production secrets or real data:
 * session check, sign in/out, entity search, entity overview. Nothing else
 * — no Communication storage or API, per Slice 4 scope.
 */
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

function endpointFor(record: PersonRecord | OrganisationRecord) {
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

function timelineLabel(link: RelationshipSeed, endpoint: { display_label: string }, direction: 'outgoing' | 'incoming'): string {
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
  const relationships = seedData.relationships as RelationshipSeed[];

  let authenticated = false;

  function json(status: number, body: unknown) {
    return { status, body };
  }

  function findByRef(ref: string): PersonRecord | OrganisationRecord | null {
    const parts = ref.split(':');
    if (parts.length !== 3 || parts[0] !== 'shared') return null;
    const [, kind, id] = parts;
    if (kind === 'person') return people.get(id!) ?? null;
    if (kind === 'organisation') return organisations.get(id!) ?? null;
    return null;
  }

  function buildOverview(ref: string) {
    const entity = findByRef(ref);
    if (!entity) return null;

    const entries = relationships
      .filter((link) => link.source_ref === ref || link.target_ref === ref)
      .map((link) => {
        const direction: 'outgoing' | 'incoming' = link.source_ref === ref ? 'outgoing' : 'incoming';
        const otherRef = direction === 'outgoing' ? link.target_ref : link.source_ref;
        const other = findByRef(otherRef);
        const endpoint = other ? endpointFor(other) : { ref: otherRef, kind: 'person', display_label: 'Unknown', supporting_label: null, href: null, lifecycle_status: null, visibility: 'operator' };
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
        href: null
      }))
      .sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });

    const linked_records = { tasks: [] as unknown[], communications: [] as unknown[], organisations: [] as unknown[], people: [] as unknown[] };
    for (const entry of entries) {
      if (entry.endpoint.kind === 'organisation') linked_records.organisations.push(entry.endpoint);
      else if (entry.endpoint.kind === 'person') linked_records.people.push(entry.endpoint);
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
        return json(401, { ok: false, error: { code: 'unauthenticated', message: 'Please sign in to continue.' } });
      }
      return json(200, { ok: true, data: { authenticated: true, expiresAt: Date.now() + 12 * 3600_000 } });
    }
    if (path === '/api/auth' && method === 'POST') {
      const passphrase = (body as { passphrase?: string })?.passphrase;
      if (typeof passphrase === 'string' && passphrase.trim() === LOCAL_PASSPHRASE) {
        authenticated = true;
        return json(200, { ok: true, data: { authenticated: true, expiresAt: Date.now() + 12 * 3600_000 } });
      }
      return json(401, { ok: false, error: { code: 'invalid_credentials', message: 'That passphrase was not accepted.' } });
    }
    if (path === '/api/logout' && method === 'POST') {
      authenticated = false;
      return json(200, { ok: true, data: { loggedOut: true } });
    }

    if (!authenticated) {
      return json(401, { ok: false, error: { code: 'unauthenticated', message: 'Please sign in to continue.' } });
    }

    if (path === '/api/entities/search' && method === 'GET') {
      const query = (url.searchParams.get('q') ?? '').trim();
      if (query.length < 2) {
        return json(400, { ok: false, error: { code: 'invalid_query_length', message: 'q must be at least 2 characters.' } });
      }
      const kinds = new Set((url.searchParams.get('kinds') ?? 'person,organisation,task').split(','));
      const results: Array<ReturnType<typeof toSearchResult>> = [];
      if (kinds.has('person')) {
        for (const person of people.values()) {
          const rank = matchRank(query, person.display_name, person.sort_name);
          if (rank !== null) results.push(toSearchResult(person, rank));
        }
      }
      if (kinds.has('organisation')) {
        for (const organisation of organisations.values()) {
          const rank = matchRank(query, organisation.display_name, null);
          if (rank !== null) results.push(toSearchResult(organisation, rank));
        }
      }
      results.sort((a, b) => a.rank - b.rank || a.display_label.localeCompare(b.display_label));
      const groups = { person: [] as unknown[], organisation: [] as unknown[], task: [] as unknown[] };
      for (const { rank: _rank, ...result } of results) {
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
