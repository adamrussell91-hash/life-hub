const STANCES = new Set(['supports', 'complicates', 'extends', 'related']);
const STATUSES = new Set(['running', 'done', 'error', 'cancelled']);

const LEADING = [
  /^(hey|please|can you|could you|tell me)\s+/i,
  /^(what|where|which|who|when|how)\s+/i,
  /^(do i|did i|have i|is there|are there|have you|got)\s+/i,
  /^(have|got|any|anything|something|notes?|material|stuff)\s+/i,
  /^(on|about|regarding|re|for|in)\s+/i
];
const TRAILING = /\s+(in the archive|in my (?:notes|archive)|please|thanks)\s*$/i;
const STOP = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'is', 'it', 'of', 'on', 'or', 'that', 'the', 'to', 'with']);

export function topicQuery(raw) {
  let next = String(raw ?? '').trim();
  if (!next) return '';
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of LEADING) {
      const stripped = next.replace(pattern, '');
      if (stripped !== next) {
        next = stripped;
        changed = true;
      }
    }
  }
  next = next.replace(TRAILING, '').replace(/[?!.,;:]+$/g, '').replace(/\s+/g, ' ').trim();
  return next || String(raw ?? '').trim();
}

function tokenize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s&-]/g, ' ')
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length > 1 && !STOP.has(token));
}

function termFrequency(tokens) {
  const counts = new Map();
  for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
}

export function lexicalRetrieve(docs, query, k = 8) {
  const queryTokens = tokenize(query);
  if (!queryTokens.length) return [];
  const queryTf = termFrequency(queryTokens);
  const querySet = new Set(queryTokens);
  return docs
    .map(doc => {
      const titleTf = termFrequency(tokenize(doc.title));
      const tagTf = termFrequency(tokenize((doc.tags ?? []).join(' ')));
      const bodyTf = termFrequency(tokenize(doc.excerpt));
      let score = 0;
      for (const token of querySet) {
        const q = queryTf.get(token) ?? 0;
        score += (titleTf.get(token) ?? 0) * 4 * q;
        score += (tagTf.get(token) ?? 0) * 3 * q;
        score += (bodyTf.get(token) ?? 0) * 1.2 * q;
      }
      const hay = `${doc.title} ${doc.excerpt}`.toLowerCase();
      if (query.trim().length > 3 && hay.includes(query.trim().toLowerCase())) score += 6;
      return { ...doc, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, k);
}

export function parseResearchResult(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (typeof raw.query !== 'string' || !Array.isArray(raw.findings) || !STATUSES.has(raw.status)) return null;
  const findings = raw.findings.filter(item =>
    item &&
    typeof item === 'object' &&
    typeof item.pageId === 'string' &&
    typeof item.title === 'string' &&
    STANCES.has(item.stance)
  );
  return {
    query: raw.query,
    round: Number.isInteger(raw.round) && raw.round >= 0 ? raw.round : 0,
    status: raw.status,
    findings,
    gaps: Array.isArray(raw.gaps) ? raw.gaps.filter(item => typeof item === 'string') : [],
    followUpQueries: Array.isArray(raw.followUpQueries)
      ? raw.followUpQueries.filter(item => typeof item === 'string')
      : [],
    ...(typeof raw.error === 'string' ? { error: raw.error } : {})
  };
}

export function docsFromManifest(entries, tags) {
  return (Array.isArray(entries) ? entries : [])
    .filter(entry => !tags?.length || tags.every(tag => (entry.tags ?? []).includes(tag)))
    .map(entry => ({
      id: entry.id,
      title: entry.title,
      excerpt: entry.excerpt,
      tags: entry.tags,
      area: entry.area
    }));
}

export function researchFromDocs({ query, docs, k = 16 }) {
  const needle = topicQuery(query) || String(query ?? '').trim();
  const hits = lexicalRetrieve(docs, needle, k);
  return {
    query: needle,
    round: 1,
    status: 'done',
    findings: hits.map(hit => ({
      pageId: hit.id,
      title: hit.title,
      sourceUrl: '',
      excerpt: hit.excerpt,
      stance: 'related',
      analysis: 'Live archive match — cite this page; do not invent another.',
      tags: hit.tags
    })),
    gaps: hits.length ? [] : [`Nothing in the live archive matched “${needle}”.`],
    followUpQueries: []
  };
}

export function coverageFromResearch(input) {
  const findings = Array.isArray(input?.findings) ? input.findings : [];
  const gaps = Array.isArray(input?.gaps) ? input.gaps : [];
  const distinctSources = new Set(findings.map(item => item.pageId)).size;
  const gapCount = gaps.length;
  return {
    distinctSources,
    gapCount,
    thin: distinctSources < 3 || gapCount > distinctSources,
    sourceTypeKnown: findings.filter(item => item.sourceType && item.sourceType !== 'unknown').length,
    methodKnown: findings.filter(item => Boolean(item.method?.trim())).length,
    mappedClaims: findings.filter(item => item.claimRelationship === 'direct' || item.claimRelationship === 'indirect').length
  };
}
