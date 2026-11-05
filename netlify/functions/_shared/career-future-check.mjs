/**
 * Ann reads Adam's record against one future's criteria and suggests an answer
 * per line. Nothing is stored here: a suggestion counts once Adam confirms it.
 * There is no offline fallback, because a guessed answer is worse than none.
 */

import { extractJson } from './career-future-draft.mjs';
import { futureCheckPrompt } from './career-prompts.mjs';
import { MET_EVIDENCE_MAX, MET_STATUSES } from './career-schema.mjs';
import { readPrivateFileBytes } from './private-data-file.mjs';

const MODEL = 'claude-sonnet-5';
const TIMEOUT_MS = 20000;
const CENTRAL_NODE_PATH = 'central-node.md';

function checkError(status, code, message) {
  return Object.assign(new Error(message), { status, code });
}

/** Keeps only known lines; anything unclear stays unanswered. */
export function parseFutureCheck(raw, criteria) {
  let parsed;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed?.suggestions)) return null;
  const known = new Set(criteria.map((c) => c.id));
  const seen = new Set();
  const suggestions = [];
  for (const item of parsed.suggestions) {
    if (!known.has(item?.criterion_id) || seen.has(item.criterion_id)) continue;
    seen.add(item.criterion_id);
    suggestions.push({
      criterion_id: item.criterion_id,
      status: MET_STATUSES.has(item.status) ? item.status : 'unknown',
      evidence: typeof item.evidence === 'string' ? item.evidence.trim().slice(0, MET_EVIDENCE_MAX) : ''
    });
  }
  return suggestions;
}

async function readCentralNode(env, fetchImpl) {
  try {
    const bytes = await readPrivateFileBytes(CENTRAL_NODE_PATH, { env, fetchImpl, label: 'Central Node' });
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

export async function checkFutureWithAnn({ future, cards = [], roles = [], env, apiKey, fetchImpl = fetch } = {}) {
  if (!future?.criteria?.length) throw checkError(400, 'no_criteria', 'Add what the role asks for first.');
  if (!apiKey) throw checkError(503, 'ann_unavailable', 'Ann can’t be reached from here. Mark the lines yourself for now.');

  const centralNode = await readCentralNode(env, fetchImpl);
  const content = futureCheckPrompt({ title: future.title, criteria: future.criteria, cards, roles, centralNode });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let response;
  try {
    response = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 2000, messages: [{ role: 'user', content }] }),
      signal: ctrl.signal
    });
  } catch {
    throw checkError(502, 'ann_unavailable', 'Ann took too long. Try again.');
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw checkError(502, 'ann_unavailable', 'Ann couldn’t check this. Try again.');
  const json = await response.json();
  const text = Array.isArray(json?.content) ? json.content.map((p) => p?.text ?? '').join('') : '';
  const suggestions = parseFutureCheck(text, future.criteria);
  if (!suggestions) throw checkError(502, 'ann_unreadable', 'Ann’s answer didn’t come through. Try again.');
  return { suggestions, read_central_node: centralNode != null, usage: json?.usage ?? null };
}
