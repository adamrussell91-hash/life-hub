import { assembleClementinePrompt } from './knowledge-prompts.mjs';
import { listKnowledgePages } from './knowledge-data.mjs';

const STOP = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'is', 'it',
  'of', 'on', 'or', 'that', 'the', 'to', 'with'
]);

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

export function buildAlchemistPrompt({ voice, job, lessonText, retrieved }) {
  const sources = retrieved
    .map((item, index) => `[${index + 1}] "${item.title}" (id: ${item.pageId})\n${item.excerpt}`)
    .join('\n\n');
  return assembleClementinePrompt({
    voice,
    job,
    surface: 'This turn is the Alchemist rail: the school–archive bridge. Paste-lesson in, archive out. Write summary and whyNonObvious in your own voice — not as a generic tool. Return only a JSON array. Do not break JSON to make a joke. Do not run draft-review protocols on this turn.',
    payload: `Lesson:
${lessonText}

Candidate archive excerpts:
${sources}

For each genuinely non-obvious connection, return only a JSON array of objects with icon (one of the Icons of Depth and Complexity), summary, sourcePageId, sourcePageTitle, sourceExcerpt, and whyNonObvious. Only cite sources above.`
  });
}

export function parseConnectionsJson(raw) {
  const trimmed = String(raw ?? '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf('[');
  const end = candidate.lastIndexOf(']');
  if (start < 0 || end < start) return [];
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(item =>
      item &&
      typeof item === 'object' &&
      typeof item.sourcePageId === 'string' &&
      typeof item.summary === 'string'
    );
  } catch {
    return [];
  }
}

function retrievalOnlyConnections(retrieved) {
  return retrieved.map(item => ({
    icon: 'Multiple Perspectives',
    summary: `Related archive note: ${item.title}`,
    sourcePageId: item.pageId,
    sourcePageTitle: item.title,
    sourceExcerpt: item.excerpt,
    whyNonObvious:
      'Lexical retrieval only — Anthropic synthesis unavailable. Review the source and decide whether the link is non-obvious.'
  }));
}

export async function runAlchemist({
  lessonText,
  env,
  voice,
  job,
  fetchImpl = fetch,
  complete
}) {
  const text = String(lessonText ?? '').trim();
  if (!text) {
    throw Object.assign(new Error('lessonText is required'), { status: 400, code: 'validation_error' });
  }
  const manifest = await listKnowledgePages({ env, fetchImpl });
  const retrieved = lexicalRetrieve(
    manifest.map(entry => ({
      pageId: entry.id,
      id: entry.id,
      title: entry.title,
      excerpt: entry.excerpt,
      tags: entry.tags,
      area: entry.area
    })),
    text,
    8
  ).map(item => ({
    pageId: item.pageId ?? item.id,
    title: item.title,
    excerpt: item.excerpt
  }));
  if (!retrieved.length) return { connections: [], mode: 'empty', retrieved: [] };
  const apiKey = typeof env?.ANTHROPIC_API_KEY === 'string' ? env.ANTHROPIC_API_KEY : '';
  if (!apiKey) return { connections: retrievalOnlyConnections(retrieved), mode: 'retrieval', retrieved };
  const prompt = buildAlchemistPrompt({ voice, job, lessonText: text, retrieved });
  const raw = complete
    ? await complete(prompt)
    : await completeWithAnthropic(prompt, apiKey, fetchImpl);
  return { connections: parseConnectionsJson(raw), mode: 'synthesis', retrieved };
}

async function completeWithAnthropic(prompt, apiKey, fetchImpl) {
  const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!response.ok) throw new Error(`Anthropic error ${response.status}`);
  const payload = await response.json();
  return payload.content?.find(block => block.type === 'text')?.text ?? '[]';
}

export function alchemistSecret(env) {
  const secret = env?.ALCHEMIST_SHARED_SECRET;
  return typeof secret === 'string' && secret.length > 0 ? secret : '';
}
