// Tiny shared helpers for Confirm-first agent propose builders / write executors.

/** Collapse whitespace, trim, and clamp length. Non-strings → ''. */
export function clean(value, max = 200) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** Parse a propose-action write.content JSON object, or null. */
export function parseWriteBody(write) {
  try {
    const parsed = JSON.parse(write?.content);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeError(code, detail) {
  return { ok: false, error: code, ...(detail ? { detail } : {}) };
}

/** Resolve a display name for an entity ref; falls back to the ref. */
export async function nameFromRef(ref, nameForRef) {
  if (typeof nameForRef !== 'function') return ref;
  try {
    return (await nameForRef(ref)) || ref;
  } catch {
    return ref;
  }
}

/** Standard Confirm proposal envelope. */
export function makeProposal(intent, writes, {
  reads = [],
  surfaces = ['confirm_card', 'governance_log']
} = {}) {
  return { intent, reads, writes, surfaces };
}
