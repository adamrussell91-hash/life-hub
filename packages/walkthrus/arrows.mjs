// packages/walkthrus/arrows.mjs
// The arrows Adam draws between techniques. Typed, with an optional short label (required for
// the free kind). The book's own cross-references come from the catalogue and are not stored.
import { isTechniqueId } from './catalogue.mjs';

export const ARROW_TYPES = Object.freeze(['leads_to', 'pairs_with', 'free']);
export const MAX_ARROWS = 300;
export const MAX_LABEL = 40;

const ID = /^[A-Za-z0-9_-]{1,40}$/;

/** The valid arrows from whatever was sent, deduplicated, in a stable order. */
export function normalizeArrows(value) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(value) ? value : []) {
    if (!raw || typeof raw !== 'object') continue;
    if (!ID.test(raw.id ?? '') || !isTechniqueId(raw.from) || !isTechniqueId(raw.to) || raw.from === raw.to) continue;
    if (!ARROW_TYPES.includes(raw.type)) continue;
    const label = typeof raw.label === 'string' ? raw.label.trim().slice(0, MAX_LABEL) : '';
    if (raw.type === 'free' && !label) continue;
    const twin = raw.type === 'pairs_with' ? [raw.from, raw.to].sort().join('|') : `${raw.from}|${raw.to}`;
    const key = `${raw.type}:${twin}`;
    if (seen.has(raw.id) || seen.has(key)) continue;
    seen.add(raw.id);
    seen.add(key);
    out.push({ id: raw.id, from: raw.from, to: raw.to, type: raw.type, ...(label ? { label } : {}) });
    if (out.length >= MAX_ARROWS) break;
  }
  return out;
}

export const newArrowId = () => `ar_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
