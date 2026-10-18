// netlify/functions/_shared/problem-solver/coach.mjs
import { completeMessage } from '../anthropic-client.mjs';
import { addEdge, canEdge, canPlace, nextSlots, placeNode } from '../../../../packages/problem-solver/machine.mjs';
import { parseSlot } from '../../../../packages/problem-solver/slots.mjs';
import { extractJson, validateCoachTurn } from './coach-schema.mjs';
import { buildCoachPrompt, repairPrompt, rewritePrompt } from './prompts.mjs';
import { activeRun } from './session.mjs';

const WORD_LIMIT = 60;
const REWRITE_OVER = 70;

export function wordCount(text) {
  return String(text ?? '').trim().split(/\s+/).filter(Boolean).length;
}

/** Trim to whole sentences within `limit` words, keeping a final question if there is one. */
export function fitWords(text, limit = WORD_LIMIT) {
  const sentences = String(text ?? '').trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()) ?? [];
  const question = sentences.at(-1)?.endsWith('?') ? sentences.pop() : null;
  const budget = limit - wordCount(question);
  const kept = [];
  for (const sentence of sentences) {
    if (wordCount([...kept, sentence].join(' ')) > budget) break;
    kept.push(sentence);
  }
  const out = [...kept, question].filter(Boolean).join(' ');
  return wordCount(out) <= limit ? out : out.split(/\s+/).slice(0, limit).join(' ');
}

/** A bare slot name (`effect`) takes its next open index (`effect:1`). */
function fitSlot(run, slot) {
  if (canPlace(run, slot) || parseSlot(slot)?.index != null) return slot;
  return nextSlots(run).find((open) => parseSlot(open)?.name === slot) ?? slot;
}

/** Fit the node to its open slot and keep only the links the tool allows; the turn survives a bad link. */
function fitToRun(session, value) {
  const run = activeRun(session);
  if (session.phase !== 'define' || !run || !value.node) return { value };
  const slot = fitSlot(run, value.node.slot);
  if (!canPlace(run, slot)) return { error: `Slot ${value.node.slot} is not open for ${run.tool}. Open slots: ${nextSlots(run).join(', ') || 'none'}.` };
  const rename = (name) => (name === value.node.slot ? slot : name);
  const node = { ...value.node, slot };
  if (value.verdict !== 'accept') return { value: { ...value, node, edges: [] } };
  let placed = placeNode(run, { id: '__candidate__', slot, text: node.text, state: 'accepted' });
  const edges = [];
  for (const edge of value.edges.map((e) => ({ ...e, from: rename(e.from), to: rename(e.to) }))) {
    const from = placed.nodes.find((n) => n.slot === edge.from)?.id ?? null;
    const to = placed.nodes.find((n) => n.slot === edge.to)?.id ?? null;
    if (!canEdge(placed, from, to, edge.kind)) continue;
    placed = addEdge(placed, { from, to, kind: edge.kind });
    edges.push(edge);
  }
  return { value: { ...value, node, edges } };
}

function parse(session, text) {
  const result = validateCoachTurn(extractJson(text));
  if (!result.ok) return result;
  const fitted = fitToRun(session, result.value);
  return fitted.error ? { ok: false, error: fitted.error } : { ok: true, value: fitted.value };
}

export function createModelCoach(model) {
  return async function modelCoach(session) {
    const prompt = buildCoachPrompt(session);
    const first = await model({ ...prompt, maxTokens: 900 });
    let result = parse(session, first);
    if (!result.ok) result = parse(session, await model({ ...repairPrompt(prompt, first, result.error), maxTokens: 900 }));
    if (!result.ok) throw Object.assign(new Error('Coach lost the thread, try again.'), { code: 'coach_lost_thread', status: 502 });
    let message = result.value.message;
    if (wordCount(message) > REWRITE_OVER) {
      try { message = String(await model({ ...rewritePrompt(message), maxTokens: 300 })).trim() || message; } catch { /* trim below */ }
    }
    return { ...result.value, message: wordCount(message) > WORD_LIMIT ? fitWords(message) : message };
  };
}

/** Production model: one non-streaming call with the rubric cached. */
export function anthropicModel(env, fetchImpl = fetch) {
  return async ({ system, user, maxTokens }) => {
    if (!env.ANTHROPIC_API_KEY) throw Object.assign(new Error('The coach needs ANTHROPIC_API_KEY.'), { code: 'provider_unavailable', status: 503 });
    return completeMessage({
      apiKey: env.ANTHROPIC_API_KEY,
      fetchImpl,
      maxTokens,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }]
    });
  };
}
