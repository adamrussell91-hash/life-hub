import { isCalendarDate } from '../../../apps/life/js/core/time.js';

const MEDICAL_PATH =
  /^data\/body\/(?<year>\d{4})\/(?<month>\d{2})\/(?<date>\d{4}-\d{2}-\d{2})-medical-[a-z0-9-]+\.md$/;
const BLOODS_PATH =
  /^data\/body\/(?<year>\d{4})\/(?<month>\d{2})\/(?<date>\d{4}-\d{2}-\d{2})-bloods(?:-[a-z0-9-]+)?\.md$/;

const DEFAULT_SEARCH_LIMIT = 8;
const MAX_SEARCH_LIMIT = 20;
const DEFAULT_LOAD_LIMIT = 400;

export function searchMedicalRecordsSchema() {
  return {
    name: 'search_medical_records',
    description:
      'Search Life Hub Medical Overview visits by keyword (provider, title, location, notes, cost, insurance). Use whenever Adam asks about past medical history, a clinician (e.g. Kate Semple), a visit, cost, address, or insurance — Medical Overview is the store, not Notion. Words are ANDed.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search text; words are ANDed.' },
        limit: { type: 'number', description: 'Max results (default 8, max 20).' }
      },
      required: ['query']
    }
  };
}

export function briefMedicalAppointmentSchema() {
  return {
    name: 'brief_medical_appointment',
    description:
      'Read Medical Overview visits for a calendar date (YYYY-MM-DD), plus any bloods joined on that date. Use for appointment briefs or when Adam asks what happened / was logged on a specific day.',
    input_schema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Visit date YYYY-MM-DD (use today when Adam means "today").'
        }
      },
      required: ['date']
    }
  };
}

export function selectMedicalEntries(tree, { limit = DEFAULT_LOAD_LIMIT } = {}) {
  if (!Array.isArray(tree)) return [];
  const cap = Math.min(Math.max(Number(limit) || DEFAULT_LOAD_LIMIT, 1), 1000);
  return tree
    .filter(entry => {
      if (!entry || entry.type !== 'blob' || typeof entry.path !== 'string') return false;
      return MEDICAL_PATH.test(entry.path);
    })
    .sort((a, b) => b.path.localeCompare(a.path))
    .slice(0, cap);
}

export function selectBloodsEntries(tree, { limit = 200 } = {}) {
  if (!Array.isArray(tree)) return [];
  const cap = Math.min(Math.max(Number(limit) || 200, 1), 500);
  return tree
    .filter(entry => {
      if (!entry || entry.type !== 'blob' || typeof entry.path !== 'string') return false;
      return BLOODS_PATH.test(entry.path);
    })
    .sort((a, b) => b.path.localeCompare(a.path))
    .slice(0, cap);
}

function queryTokens(query) {
  return String(query ?? '')
    .toLowerCase()
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length >= 2);
}

function visitHaystack(event) {
  const r = event?.record ?? {};
  const episode = r.episode && typeof r.episode === 'object' ? r.episode : null;
  const parts = [
    r.type,
    r.date,
    r.date_end,
    r.title,
    r.record_type,
    r.lane,
    r.provider,
    r.location,
    r.location_kind,
    r.follow_up_date,
    r.cost_aud != null ? String(r.cost_aud) : '',
    r.insurance_status,
    episode?.id,
    episode?.title,
    typeof event.body === 'string' ? event.body : '',
    typeof r.notes === 'string' ? r.notes : ''
  ];
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function formatVisitSummary(event, { score } = {}) {
  const r = event?.record ?? {};
  const summary = {
    type: 'medical',
    date: r.date,
    path: event.path,
    title: r.title,
    record_type: r.record_type,
    lane: r.lane,
    provider: r.provider ?? null,
    location: r.location ?? null,
    location_kind: r.location_kind ?? null,
    cost_aud: r.cost_aud ?? null,
    insurance_status: r.insurance_status ?? null,
    follow_up_date: r.follow_up_date ?? null,
    episode: r.episode ?? null
  };
  if (score != null) summary.score = score;
  const body = typeof event.body === 'string' && event.body.trim() ? event.body.trim() : '';
  if (body) summary.notes_excerpt = body.length > 280 ? `${body.slice(0, 277)}…` : body;
  return summary;
}

function formatVisitDetail(event) {
  const summary = formatVisitSummary(event);
  const body = typeof event.body === 'string' && event.body.trim() ? event.body.trim() : undefined;
  return {
    ...summary,
    notes: body,
    notes_excerpt: undefined
  };
}

function formatBloodsSummary(event) {
  const r = event?.record ?? {};
  return {
    type: 'bloods',
    date: r.date,
    path: event.path,
    markers: r.markers ?? r.panels ?? undefined,
    notes: typeof event.body === 'string' && event.body.trim() ? event.body.trim() : undefined
  };
}

export function searchMedicalRecords(events, { query, limit = DEFAULT_SEARCH_LIMIT } = {}) {
  const tokens = queryTokens(query);
  if (!tokens.length) {
    return { ok: false, error: 'empty_query' };
  }
  const cap = Math.min(Math.max(Number(limit) || DEFAULT_SEARCH_LIMIT, 1), MAX_SEARCH_LIMIT);
  const hits = (events ?? [])
    .filter(e => e?.record?.type === 'medical')
    .map(event => {
      const haystack = visitHaystack(event);
      const matched = tokens.filter(token => haystack.includes(token));
      return { event, score: matched.length };
    })
    .filter(row => row.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.event.record.date ?? '').localeCompare(a.event.record.date ?? '');
    })
    .slice(0, cap)
    .map(({ event, score }) => formatVisitSummary(event, { score }));

  return {
    ok: true,
    store: 'life_hub_medical_overview',
    query,
    count: hits.length,
    results: hits
  };
}

export function briefMedicalAppointment(events, { date } = {}) {
  if (!isCalendarDate(date)) {
    return { ok: false, error: 'invalid_date' };
  }
  const visits = (events ?? [])
    .filter(e => e?.record?.type === 'medical' && e.record.date === date)
    .sort((a, b) => (a.record.time ?? '').localeCompare(b.record.time ?? ''))
    .map(formatVisitDetail);
  const bloods = (events ?? [])
    .filter(e => e?.record?.type === 'bloods' && e.record.date === date)
    .map(formatBloodsSummary);

  return {
    ok: true,
    store: 'life_hub_medical_overview',
    date,
    found: visits.length > 0,
    visit_count: visits.length,
    visits,
    bloods
  };
}

export async function resolveMedicalVisitsForDate({
  date,
  events,
  tree,
  readBlob,
  parseDocument
}) {
  if (!isCalendarDate(date)) return [];
  const inMemory = (events ?? []).filter(
    e => e?.record?.type === 'medical' && e.record.date === date
  );
  if (inMemory.length) return inMemory;

  if (!Array.isArray(tree) || typeof readBlob !== 'function' || typeof parseDocument !== 'function') {
    return [];
  }
  const prefix = `data/body/${date.slice(0, 4)}/${date.slice(5, 7)}/${date}-medical-`;
  const matches = tree.filter(
    entry => entry?.type === 'blob' && typeof entry.path === 'string' && entry.path.startsWith(prefix)
  );
  const resolved = [];
  for (const entry of matches) {
    try {
      const content = await readBlob(entry.sha);
      if (typeof content !== 'string' || !content.trim()) continue;
      const parsed = parseDocument(content, entry.path);
      if (parsed?.record?.type === 'medical') resolved.push(parsed);
    } catch {
      // Skip unreadable blobs; brief still returns whatever else loaded.
    }
  }
  return resolved;
}

export async function briefMedicalAppointmentWithFallback({
  date,
  events,
  tree,
  readBlob,
  parseDocument
}) {
  if (!isCalendarDate(date)) {
    return { ok: false, error: 'invalid_date' };
  }
  const fromMemory = briefMedicalAppointment(events, { date });
  if (fromMemory.found) return fromMemory;

  const resolved = await resolveMedicalVisitsForDate({
    date,
    events,
    tree,
    readBlob,
    parseDocument
  });
  if (!resolved.length) return fromMemory;

  const merged = [...(events ?? []), ...resolved];
  return briefMedicalAppointment(merged, { date });
}
