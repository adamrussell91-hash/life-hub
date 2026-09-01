import { isCalendarDate } from '../../../apps/life/js/core/time.js';
import { buildCanonicalPath } from './chat-schema.mjs';

export function getMindSessionSchema() {
  return {
    name: 'get_mind_session',
    description: 'Read one Vera mind_session record from Life Hub data for a calendar date (YYYY-MM-DD). Use before answering whether a session logged, or when Adam asks what was saved. Returns frontmatter fields and body when found.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Session date YYYY-MM-DD (use today when Adam means "today").' }
      },
      required: ['date']
    }
  };
}

export function searchMindRecordsSchema() {
  return {
    name: 'search_mind_records',
    description: 'Search Life Hub mind data (Vera sessions and Penelope diary metadata) by keyword. Use when Adam asks about a past theme, pattern, or whether something was discussed before — not for external facts (use web_search for those).',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search text; words are ANDed.' },
        record_types: {
          type: 'array',
          items: { type: 'string', enum: ['mind_session', 'diary'] },
          description: 'Defaults to both mind_session and diary.'
        },
        limit: { type: 'number', description: 'Max results (default 8, max 20).' }
      },
      required: ['query']
    }
  };
}

export function expectedMindSessionPath(date) {
  return buildCanonicalPath({ type: 'mind_session', date, slug: 'session' });
}

export function formatMindSessionToolResult(event, { date } = {}) {
  if (!event?.record || event.record.type !== 'mind_session') {
    return {
      ok: true,
      found: false,
      date,
      expected_path: date ? expectedMindSessionPath(date) : undefined
    };
  }
  const r = event.record;
  return {
    ok: true,
    found: true,
    path: event.path ?? expectedMindSessionPath(r.date),
    date: r.date,
    id: r.id,
    time: r.time,
    session_type: r.session_type,
    theme: r.theme,
    title: r.title,
    themes: r.themes,
    pattern_tags: r.pattern_tags,
    insight: r.insight,
    observation: r.observation,
    closing_question: r.closing_question,
    cross_agent_note: r.cross_agent_note,
    mood_at_open: r.mood_at_open,
    mood_at_close: r.mood_at_close,
    body: typeof event.body === 'string' && event.body.trim() ? event.body.trim() : undefined
  };
}

export function getMindSessionFromEvents(events, date) {
  if (!isCalendarDate(date)) {
    return { ok: false, error: 'invalid_date' };
  }
  const event = (events ?? []).find(
    e => e?.record?.type === 'mind_session' && e.record.date === date
  );
  return formatMindSessionToolResult(event, { date });
}

function normalizeTypes(recordTypes) {
  const allowed = new Set(['mind_session', 'diary']);
  const list = Array.isArray(recordTypes) && recordTypes.length
    ? recordTypes.filter(type => allowed.has(type))
    : ['mind_session', 'diary'];
  return list.length ? list : ['mind_session', 'diary'];
}

function searchHaystack(event) {
  const r = event?.record ?? {};
  const parts = [
    r.type,
    r.date,
    r.theme,
    r.title,
    r.insight,
    r.observation,
    r.closing_question,
    r.cross_agent_note,
    r.session_type,
    Array.isArray(r.themes) ? r.themes.join(' ') : '',
    Array.isArray(r.pattern_tags) ? r.pattern_tags.join(' ') : '',
    Array.isArray(r.tags) ? r.tags.join(' ') : '',
    r.mood,
    r.system_note,
    r.highlights,
    r.challenges
  ];
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function queryTokens(query) {
  return String(query ?? '')
    .toLowerCase()
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length >= 2);
}

export function searchMindRecords(events, { query, record_types, limit = 8 } = {}) {
  const tokens = queryTokens(query);
  if (!tokens.length) {
    return { ok: false, error: 'empty_query' };
  }
  const types = normalizeTypes(record_types);
  const cap = Math.min(Math.max(Number(limit) || 8, 1), 20);
  const hits = (events ?? [])
    .filter(e => e?.record && types.includes(e.record.type))
    .map(event => {
      const haystack = searchHaystack(event);
      const matched = tokens.filter(token => haystack.includes(token));
      return { event, score: matched.length };
    })
    .filter(row => row.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.event.record.date ?? '').localeCompare(a.event.record.date ?? '');
    })
    .slice(0, cap)
    .map(({ event, score }) => {
      const r = event.record;
      if (r.type === 'mind_session') {
        return {
          type: 'mind_session',
          date: r.date,
          path: event.path,
          score,
          theme: r.theme,
          insight: r.insight,
          closing_question: r.closing_question
        };
      }
      return {
        type: 'diary',
        date: r.date,
        path: event.path,
        score,
        mood: r.mood,
        tags: r.tags,
        system_note: r.system_note
      };
    });
  return { ok: true, query, count: hits.length, results: hits };
}

export async function resolveMindSessionEvent({
  date,
  events,
  tree,
  readBlob,
  parseDocument
}) {
  const inMemory = (events ?? []).find(
    e => e?.record?.type === 'mind_session' && e.record.date === date
  );
  if (inMemory) return inMemory;

  const path = expectedMindSessionPath(date);
  const entry = (tree ?? []).find(item => item?.type === 'blob' && item.path === path);
  if (!entry?.sha || typeof readBlob !== 'function' || typeof parseDocument !== 'function') {
    return null;
  }
  try {
    const content = await readBlob(entry.sha);
    if (typeof content !== 'string' || !content.trim()) return null;
    return parseDocument(content, path);
  } catch {
    return null;
  }
}

export async function getMindSession({
  date,
  events,
  tree,
  readBlob,
  parseDocument
}) {
  if (!isCalendarDate(date)) {
    return { ok: false, error: 'invalid_date' };
  }
  const event = await resolveMindSessionEvent({
    date,
    events,
    tree,
    readBlob,
    parseDocument
  });
  return formatMindSessionToolResult(event, { date });
}
