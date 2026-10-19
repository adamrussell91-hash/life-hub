// packages/problem-solver/machine.mjs
import { TOOLS } from './tools/index.mjs';

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
