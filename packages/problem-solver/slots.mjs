// packages/problem-solver/slots.mjs
/** @param {unknown} slot @returns {{ name: string, index: number | null } | null} */
export function parseSlot(slot) {
  const match = /^([a-z_]+)(?::([1-9]\d*))?$/.exec(String(slot ?? ''));
  return match ? { name: match[1], index: match[2] ? Number(match[2]) : null } : null;
}

/** @param {{ nodes: { slot: string }[] }} run @param {string} name */
export function countSlots(run, name) {
  return run.nodes.filter((node) => parseSlot(node.slot)?.name === name).length;
}

/** @param {{ nodes: { slot: string }[] }} run @param {string} name */
export function hasSlot(run, name) {
  return countSlots(run, name) > 0;
}

/** Next indexed slot (`cause:3`) or null when `max` is reached. */
export function nextIndexed(run, name, max) {
  const count = countSlots(run, name);
  return count < max ? `${name}:${count + 1}` : null;
}

/** Drop nulls from a slot list. */
export function open(...slots) {
  return slots.filter(Boolean);
}
