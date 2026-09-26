/**
 * Draft a future from an ad / description via Ann. Falls back to a heuristic
 * when Anthropic is unbound so the sheet still works offline.
 */

import { generateFutureCriterionId } from './career-schema.mjs';
import { futureDraftPrompt } from './career-prompts.mjs';

const MODEL = 'claude-sonnet-5';
const TIMEOUT_MS = 20000;

function extractJson(raw) {
  const trimmed = String(raw ?? '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start >= 0 && end > start) return candidate.slice(start, end + 1);
  return candidate;
}

function heuristicDraft(title, description) {
  const text = String(description || '').trim();
  const lines = text
    .split(/\n+/)
    .map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter((l) => l.length > 12 && l.length <= 500)
    .slice(0, 8);
  const criteria = (lines.length ? lines : [
    'Demonstrated leadership of teaching and learning practice',
    'Evidence of improving student outcomes for high-potential learners',
    'Capacity to lead policy, programs and staff development',
    'Strong stakeholder communication with families and leaders',
    'Alignment with professional standards and school priorities'
  ]).map((line, index) => ({
    id: generateFutureCriterionId(),
    text: line.slice(0, 500),
    order: index,
    source: lines.length ? 'ad' : 'ann'
  }));
  const whereMatch = text.match(/\b(?:at|with)\s+([A-Z][\w'’\-]+(?:\s+[A-Z][\w'’\-]+){0,5})/);
  return {
    title: (title || 'New future').trim().slice(0, 200),
    where: whereMatch ? whereMatch[1].slice(0, 200) : null,
    aliases: title ? [title.trim().slice(0, 60)] : [],
    criteria,
    fallback: true
  };
}

export function parseFutureDraft(raw, { title } = {}) {
  try {
    const parsed = JSON.parse(extractJson(raw));
    if (!parsed || typeof parsed !== 'object') return null;
    const draftTitle =
      typeof parsed.title === 'string' && parsed.title.trim()
        ? parsed.title.trim().slice(0, 200)
        : (title || '').trim().slice(0, 200);
    if (!draftTitle) return null;
    const where =
      parsed.where === null || parsed.where === undefined
        ? null
        : String(parsed.where).trim().slice(0, 200) || null;
    const aliases = Array.isArray(parsed.aliases)
      ? parsed.aliases
          .filter((a) => typeof a === 'string' && a.trim())
          .map((a) => a.trim().slice(0, 60))
          .slice(0, 8)
      : [];
    const criteria = Array.isArray(parsed.criteria)
      ? parsed.criteria
          .filter((c) => c && typeof c.text === 'string' && c.text.trim())
          .slice(0, 20)
          .map((c, index) => ({
            id: generateFutureCriterionId(),
            text: c.text.trim().slice(0, 500),
            order: index,
            source: c.source === 'ad' || c.source === 'ann' || c.source === 'adam' ? c.source : 'ann'
          }))
      : [];
    if (criteria.length < 3) return null;
    return { title: draftTitle, where, aliases, criteria, fallback: false };
  } catch {
    return null;
  }
}

export async function draftFutureFromAnn({
  title,
  description,
  apiKey,
  fetchImpl = fetch
} = {}) {
  const fallback = () => heuristicDraft(title, description);
  if (!apiKey) return fallback();

  const body = {
    model: MODEL,
    max_tokens: 1200,
    messages: [
      {
        role: 'user',
        content: futureDraftPrompt({ title, description })
      }
    ]
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    if (!response.ok) return fallback();
    const json = await response.json();
    const text = Array.isArray(json?.content)
      ? json.content.map((p) => p?.text ?? '').join('')
      : '';
    return parseFutureDraft(text, { title }) ?? fallback();
  } catch {
    return fallback();
  } finally {
    clearTimeout(timer);
  }
}
