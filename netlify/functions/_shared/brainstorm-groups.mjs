/**
 * Groups brainstorm answers by theme with one short Claude call. Claude gets
 * the question and the answers on the board, by opaque id, and nothing else:
 * no symbols, no lesson, no held or removed answers.
 */
import { completeMessage } from './anthropic-client.mjs';

const MODEL = 'claude-haiku-4-5';
const MAX_GROUPS = 6;
const MAX_NAME = 40;

const SYSTEM = `You sort a class's brainstorm answers into themes for a teacher to discuss.
Reply with JSON only: {"groups":[{"name":"...","ids":["..."]}]}.
Use 2 to 6 groups. Names are 1 to 4 plain words in sentence case, describing the idea, never judging it.
Put every id in exactly one group. Use only ids you were given.`;

/** Strict reading of the reply. Unknown or repeated ids are dropped; anything left over goes in "Other". */
export function parseGroups(raw, ids) {
  const text = String(raw ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('bad_json');
  }
  if (!Array.isArray(parsed?.groups)) throw new Error('bad_shape');
  const known = new Set(ids);
  const placed = new Set();
  const groups = [];
  for (const g of parsed.groups) {
    if (groups.length >= MAX_GROUPS) break;
    const name = typeof g?.name === 'string' ? g.name.trim().slice(0, MAX_NAME) : '';
    if (!name || !Array.isArray(g.ids)) continue;
    const answer_ids = g.ids.filter((id) => known.has(id) && !placed.has(id));
    answer_ids.forEach((id) => placed.add(id));
    if (answer_ids.length) groups.push({ id: `g${groups.length + 1}`, name, answer_ids });
  }
  if (!groups.length) throw new Error('no_groups');
  const left = ids.filter((id) => !placed.has(id));
  if (left.length) groups.push({ id: `g${groups.length + 1}`, name: 'Other', answer_ids: left });
  return groups;
}

export async function groupAnswers({ question, answers, apiKey, fetchImpl = fetch, model }) {
  const reply = await completeMessage({
    apiKey,
    fetchImpl,
    model: model || MODEL,
    maxTokens: 2000,
    system: SYSTEM,
    messages: [{ role: 'user', content: JSON.stringify({ question, answers }) }]
  });
  return parseGroups(reply, answers.map((a) => a.id));
}
