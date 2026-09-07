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
    r.mood_score,
    r.energy,
    r.notes,
    r.system_note,
    r.highlights,
    r.challenges,
    typeof event?.body === 'string' ? event.body : ''
  ];
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function queryTokens(query) {
  return String(query ?? '')
    .toLowerCase()
    .split(/\s+/)
    .map(token => token.trim().replace(/[^a-z0-9_]+/g, ''))
    .filter(token => token.length >= 2);
}

const SEARCH_STOP = new Set([
  'have', 'has', 'had', 'what', 'when', 'where', 'which', 'this', 'that', 'with', 'from',
  'about', 'like', 'before', 'after', 'often', 'please', 'across', 'there', 'their',
  'would', 'could', 'should', 'does', 'did', 'the', 'and', 'for', 'are', 'was', 'were',
  'been', 'being', 'into', 'your', 'mine', 'just', 'very', 'much', 'more', 'some',
  'than', 'then', 'them', 'they', 'will', 'can', 'how', 'why', 'who', 'whom',
  'repeatedly', 'discuss', 'discussed', 'already', 'still', 'again', 'only', 'also'
]);

const FEEL_STEMS = new Set(['feel', 'felt', 'feeling', 'feelings']);

function focusMeaningfulTokens(tokens) {
  const focused = [];
  const seen = new Set();
  for (const token of tokens) {
    if (SEARCH_STOP.has(token)) continue;
    if (token.length < 2) continue;
    // Collapse feel/felt/feeling/feelings to one required token group.
    const key = FEEL_STEMS.has(token) ? '__feel__' : token;
    if (seen.has(key)) continue;
    seen.add(key);
    focused.push(token);
  }
  return focused;
}

function tokenMatchesHaystack(haystack, token) {
  if (haystack.includes(token)) return true;
  if (FEEL_STEMS.has(token)) {
    for (const stem of FEEL_STEMS) {
      if (haystack.includes(stem)) return true;
    }
  }
  return false;
}

function formatHit(event, score, matchedTokenCount, queryTokenCount, matchKind) {
  const r = event.record;
  const base = {
    score,
    matched_token_count: matchedTokenCount,
    query_token_count: queryTokenCount,
    match_kind: matchKind,
    path: event.path,
    id: r.id ?? null
  };
  if (r.type === 'mind_session' || r.type === 'session') {
    return {
      ...base,
      type: r.type === 'session' ? 'session' : 'mind_session',
      date: r.date,
      theme: r.theme,
      themes: r.themes,
      title: r.title,
      insight: r.insight,
      notes: typeof r.notes === 'string' ? r.notes.slice(0, 240) : undefined,
      closing_question: r.closing_question
    };
  }
  return {
    ...base,
    type: 'diary',
    date: r.date,
    mood: r.mood,
    tags: r.tags,
    notes: typeof r.notes === 'string' ? r.notes.slice(0, 240) : undefined,
    system_note: r.system_note
  };
}

export function searchMindRecords(events, { query, record_types, limit = 8 } = {}) {
  const rawTokens = queryTokens(query);
  if (!rawTokens.length) {
    return { ok: false, error: 'empty_query' };
  }
  let tokens = focusMeaningfulTokens(rawTokens);
  if (!tokens.length) tokens = rawTokens.filter(token => token.length >= 3).slice(0, 5);
  if (!tokens.length) {
    return { ok: false, error: 'empty_query' };
  }
  const types = normalizeTypes(record_types);
  // Accept both mind_session and session labels for session search.
  const expandedTypes = types.includes('mind_session')
    ? [...new Set([...types, 'session'])]
    : types;
  const cap = Math.min(Math.max(Number(limit) || 8, 1), 20);
  const scored = (events ?? [])
    .filter(e => e?.record && expandedTypes.includes(e.record.type))
    .map(event => {
      const haystack = searchHaystack(event);
      const matched = tokens.filter(token => tokenMatchesHaystack(haystack, token));
      return { event, matched, score: matched.length };
    })
    .filter(row => row.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (b.event.record.date ?? '').localeCompare(a.event.record.date ?? '');
    });

  const full = scored.filter(row => row.score === tokens.length);
  const partial = scored.filter(row => row.score > 0 && row.score < tokens.length);
  const results = full.slice(0, cap).map(({ event, score, matched }) =>
    formatHit(event, score, matched.length, tokens.length, 'full')
  );
  const partial_results = partial.slice(0, Math.min(cap, 8)).map(({ event, score, matched }) =>
    formatHit(event, score, matched.length, tokens.length, 'partial')
  );

  return {
    ok: true,
    query,
    focused_tokens: tokens,
    query_token_count: tokens.length,
    count: results.length,
    partial_count: partial_results.length,
    results,
    partial_results,
    how_to_read:
      'results are full AND matches of focused query tokens. '
      + 'partial_results matched some tokens only and are context, not supported matches.'
  };
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
