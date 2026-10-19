// packages/problem-solver/tools/hierarchy.mjs
import { parseSlot } from '../slots.mjs';

const nameOf = (run, id) => parseSlot(run.nodes.find((node) => node.id === id)?.slot)?.name;

/** The parent link for a child node, or undefined. */
export function parentEdge(run, id) {
  return run.edges.find((edge) => edge.kind === 'parent' && edge.from === id);
}

/** A child may take one parent: the root or another child node. */
export function canParent(run, from, to, rootName, childName) {
  return nameOf(run, from) === childName && [rootName, childName].includes(nameOf(run, to)) && !parentEdge(run, from);
}

/**
 * Level of every node: the root is 1; a child with no parent link hangs from the root (2);
 * otherwise one more than its parent. Parents are always placed first, so there are no cycles.
 */
export function levels(run, rootName, childName) {
  const out = new Map();
  const root = run.nodes.find((node) => parseSlot(node.slot)?.name === rootName);
  if (root) out.set(root.id, 1);
  for (const node of run.nodes) {
    if (parseSlot(node.slot)?.name !== childName) continue;
    const parent = parentEdge(run, node.id)?.to;
    out.set(node.id, (parent && out.get(parent) ? out.get(parent) : 1) + 1);
  }
  return out;
}

/** Child ids per parent id (root included), in placement order. */
export function childrenOf(run, rootName, childName) {
  const root = run.nodes.find((node) => parseSlot(node.slot)?.name === rootName);
  const map = new Map();
  for (const node of run.nodes) {
    if (parseSlot(node.slot)?.name !== childName) continue;
    const parent = parentEdge(run, node.id)?.to ?? root?.id ?? null;
    if (!map.has(parent)) map.set(parent, []);
    map.get(parent).push(node.id);
  }
  return map;
}
