// packages/problem-solver/machine.mjs
import { TOOLS } from './tools/index.mjs';
import { parseSlot } from './slots.mjs';

/** @param {string} id */
export function toolDef(id) {
  const def = TOOLS[id];
  if (!def) throw new Error(`Unknown tool: ${id}`);
  return def;
}

/** @param {string} tool @param {string} id */
export function newRun(tool, id) {
  toolDef(tool);
  return { id, tool, status: 'active', nodes: [], edges: [], ...(tool === 'gap_radar' ? { radar: { snapshots: [] } } : {}) };
}

export function nextSlots(run) {
  return run.status === 'active' ? toolDef(run.tool).nextSlots(run) : [];
}

export function canPlace(run, slot) {
  return nextSlots(run).includes(slot);
}

function illegal(message) {
  return Object.assign(new Error(message), { code: 'illegal_slot' });
}

/** Returns a new run with the node appended. Throws `illegal_slot` when the slot is not open. */
export function placeNode(run, node) {
  if (!canPlace(run, node.slot)) throw illegal(`Slot ${node.slot} is not open. Open slots: ${nextSlots(run).join(', ') || 'none'}.`);
  return { ...run, nodes: [...run.nodes, node] };
}

export function canEdge(run, from, to, kind) {
  const def = toolDef(run.tool);
  if (!def.edgeKinds.includes(kind) || from === to) return false;
  const ids = new Set(run.nodes.map((node) => node.id));
  if (!ids.has(from) || !ids.has(to)) return false;
  if (run.edges.some((edge) => edge.from === from && edge.to === to && edge.kind === kind)) return false;
  return typeof def.canEdge === 'function' ? def.canEdge(run, from, to, kind) : true;
}

export function addEdge(run, edge) {
  if (!canEdge(run, edge.from, edge.to, edge.kind)) throw illegal(`Link ${edge.from} → ${edge.to} (${edge.kind}) is not allowed.`);
  return { ...run, edges: [...run.edges, edge] };
}

export function isComplete(run) {
  return toolDef(run.tool).complete(run);
}

function invalidScores(message) {
  return Object.assign(new Error(message), { code: 'invalid_scores' });
}

/**
 * Returns a new run with a timestamped score snapshot appended under the tool's
 * `scoreKey` (default `scores`). Throws `invalid_scores` with the tool's message.
 */
export function applyScores(run, payload, at) {
  const def = toolDef(run.tool);
  if (typeof def.validateScores !== 'function') throw invalidScores(`${def.name} takes no scores.`);
  const data = typeof def.pickScores === 'function' ? def.pickScores(payload) : { ...payload };
  const problem = def.validateScores(run, data);
  if (problem) throw invalidScores(problem);
  const key = def.scoreKey ?? 'scores';
  const prior = run[key]?.snapshots ?? [];
  return { ...run, [key]: { ...(run[key] ?? {}), snapshots: [...prior, { at, ...structuredClone(data) }] } };
}

/**
 * Checks a proposed node against its tool before it is placed:
 * a tag from the tool's list where the slot needs one (and none elsewhere),
 * then the tool's `requiredLinks` (a link of the named kind that `canEdge` allows), then its own `validateNode(run, node, edges)`. `edges` are the proposed
 * links in slot form ({ from, to, kind } with slot names). Returns an error
 * message for the coach to repair, or null.
 */
export function checkNode(run, node, edges = []) {
  const def = toolDef(run.tool);
  const name = parseSlot(node.slot)?.name;
  const tags = def.nodeTags?.[name];
  if (tags && !tags.includes(node.tag)) return `Slot ${name} needs a tag: one of ${tags.join(', ')}.`;
  if (!tags && node.tag != null) return `Slot ${name} takes no tag.`;
  const required = def.requiredLinks?.[name];
  if (required && !hasRequiredLink(run, node, edges, required.kind)) return required.message;
  return typeof def.validateNode === 'function' ? def.validateNode(run, node, edges) : null;
}

/** True when a proposed link of `kind` touching the candidate node would be allowed once it is placed. */
function hasRequiredLink(run, node, edges, kind) {
  const candidate = { ...run, nodes: [...run.nodes, { id: '__candidate__', slot: node.slot, text: node.text, state: 'accepted' }] };
  const idOf = (slot) => candidate.nodes.find((item) => item.slot === slot)?.id ?? null;
  return edges.some((edge) => {
    if (edge.kind !== kind) return false;
    const from = idOf(edge.from);
    const to = idOf(edge.to);
    return (from === '__candidate__' || to === '__candidate__') && canEdge(candidate, from, to, kind);
  });
}

/** True when the tool lets this placed node become a real task (its `taskSlots` test passes). */
export function canPropose(run, node) {
  const test = toolDef(run.tool).taskSlots?.[parseSlot(node.slot)?.name];
  return typeof test === 'function' ? Boolean(test(node, run)) : false;
}

/**
 * Why the tool refuses to accept this node, or null. Only accepted (and kept) nodes are checked,
 * so the coach can still challenge with the person's words on the table (the 5 Cs name rules).
 */
export function acceptProblem(run, node) {
  const test = toolDef(run.tool).strictNode;
  return typeof test === 'function' ? test(run, node) ?? null : null;
}
