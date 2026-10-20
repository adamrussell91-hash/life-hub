// netlify/functions/_shared/problem-solver/coach.mjs
import { completeMessage } from '../anthropic-client.mjs';
import { addEdge, canEdge, canPlace, checkNode, nextSlots, placeNode } from '../../../../packages/problem-solver/machine.mjs';
import { parseSlot } from '../../../../packages/problem-solver/slots.mjs';
import { extractJson, validateCoachTurn } from './coach-schema.mjs';
import { buildCoachPrompt, repairPrompt, rewritePrompt } from './prompts.mjs';
import { toolsForPlanStep } from '../../../../packages/problem-solver/steps.mjs';
import { TOOLS, toolsForBookStep } from '../../../../packages/problem-solver/tools/index.mjs';
import { activeRun, reopenProblem, waitingForReview } from './session.mjs';

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
  if (!session.steps?.[session.phase] || !run) return { value };
  if (!value.node) return { value: value.verdict === 'accept' && value.edges.length ? { ...value, edges: existingEdges(run, value.edges) } : value };
  const slot = fitSlot(run, value.node.slot);
  if (!canPlace(run, slot)) return { error: `Slot ${value.node.slot} is not open for ${run.tool}. Open slots: ${nextSlots(run).join(', ') || 'none'}.` };
  const rename = (name) => (name === value.node.slot ? slot : name);
  const node = { ...value.node, slot };
  if (node.tag != null && !TOOLS[run.tool]?.nodeTags?.[parseSlot(slot)?.name]) delete node.tag;
  const renamedEdges = value.edges.map((e) => ({ ...e, from: rename(e.from), to: rename(e.to) }));
  const problem = checkNode(run, node, renamedEdges);
  if (problem) return { error: problem };
  if (value.verdict !== 'accept' && value.verdict !== 'challenge') return { value: { ...value, node, edges: [] } };
  return { value: { ...value, node, edges: allowedEdges(run, node, renamedEdges), proposeTasks: value.proposeTasks.map((p) => ({ ...p, slot: rename(p.slot) })) } };
}

/** Links between nodes already placed (slot form) that the tool allows, applied in order. */
function existingEdges(run, proposed) {
  let current = run;
  const edges = [];
  for (const edge of proposed) {
    const from = current.nodes.find((n) => n.slot === edge.from)?.id ?? null;
    const to = current.nodes.find((n) => n.slot === edge.to)?.id ?? null;
    if (!canEdge(current, from, to, edge.kind)) continue;
    current = addEdge(current, { from, to, kind: edge.kind });
    edges.push(edge);
  }
  return edges;
}

/** The proposed links (slot form) the tool allows once the candidate node is placed. */
function allowedEdges(run, node, proposed) {
  let placed = placeNode(run, { id: '__candidate__', slot: node.slot, text: node.text, state: 'accepted' });
  const edges = [];
  for (const edge of proposed) {
    const from = placed.nodes.find((n) => n.slot === edge.from)?.id ?? null;
    const to = placed.nodes.find((n) => n.slot === edge.to)?.id ?? null;
    if (!canEdge(placed, from, to, edge.kind)) continue;
    placed = addEdge(placed, { from, to, kind: edge.kind });
    edges.push(edge);
  }
  return edges;
}

/**
 * The session as the reopen gate should see it: this turn's accepted node added to the active
 * run, so a reply that names the first governing assumption and suggests a reopen keeps both.
 * Only the slot matters to the gate; the node itself is placed later by applyCoachTurn.
 */
function withAcceptedNode(session, turn) {
  const run = activeRun(session);
  if (!run || turn.verdict !== 'accept' || !turn.node?.slot) return session;
  const step = session.steps[session.phase];
  const runs = step.runs.map((item) => (item.id === run.id ? { ...item, nodes: [...item.nodes, { id: '__candidate__', slot: turn.node.slot, text: turn.node.text, state: 'accepted' }] } : item));
  return { ...session, steps: { ...session.steps, [session.phase]: { ...step, runs } } };
}

function parse(session, text) {
  const result = validateCoachTurn(extractJson(text));
  if (!result.ok) return result;
  if (session.runner?.mode === 'boundary' || session.phase === 'finished') return { ok: true, value: { ...result.value, suggestion: null, proposeTasks: [], proposeReview: null } };
  // In frame a suggestion only means something on the turn that sets the model (the frame
  // completes and the first step opens); otherwise accepting it would be refused.
  if (session.phase === 'frame' && (!result.value.model || result.value.suggestion?.kind === 'next_step')) {
    result.value = { ...result.value, suggestion: null };
  }
  const suggested = result.value.suggestion;
  if (suggested && (suggested.kind === 'next_tool' || suggested.kind === 'switch_tool')) {
    const allowed = session.phase === 'frame' || !session.model ? toolsForBookStep('define') : toolsForPlanStep(session.model.id, session.phase);
    if (!allowed.includes(suggested.tool)) return { ok: false, error: `Tool ${suggested.tool} is not available in this step. Available: ${allowed.join(', ') || 'none, so do not suggest a tool'}.` };
  }
  // A reopen the session would refuse (judged with this turn's accepted node in place) is dropped.
  // While Improve waits every suggestion goes: tool ones here, and applyCoachTurn drops the rest,
  // next_step included. Either way the turn survives.
  if (waitingForReview(session) && result.value.suggestion && result.value.suggestion.kind !== 'next_step') result.value = { ...result.value, suggestion: null };
  const fitted = fitToRun(session, result.value);
  if (fitted.error) return { ok: false, error: fitted.error };
  const value = fitted.value;
  if (value.suggestion?.kind === 'reopen_step' && reopenProblem(withAcceptedNode(session, value), value.suggestion.step)) return { ok: true, value: { ...value, suggestion: null } };
  return { ok: true, value };
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

/** Production model: one non-streaming call; every system layer is its own cached block. */
export function anthropicModel(env, fetchImpl = fetch) {
  return async ({ system, user, maxTokens }) => {
    if (!env.ANTHROPIC_API_KEY) throw Object.assign(new Error('The coach needs ANTHROPIC_API_KEY.'), { code: 'provider_unavailable', status: 503 });
    const layers = (Array.isArray(system) ? system : [system]).filter(Boolean);
    return completeMessage({
      apiKey: env.ANTHROPIC_API_KEY,
      fetchImpl,
      maxTokens,
      system: layers.map((text) => ({ type: 'text', text, cache_control: { type: 'ephemeral' } })),
      messages: [{ role: 'user', content: user }]
    });
  };
}
