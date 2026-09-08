/** Shared chat-history budget for the client send path and /api/chat. */

export const HISTORY_WINDOW_MS = 45 * 60 * 1000;
export const MAX_HISTORY_MESSAGES = 30;
export const MAX_HISTORY_ENTRY_CHARS = 4000;
export const MAX_HISTORY_TOTAL_CHARS = 12000;

const ELLIPSIS = '\n…\n';

/**
 * Head-only slice used to drop the numbered plan at the end of a long
 * Chadwick message. Keep a short lead-in and the tail, where the sets live.
 */
export function truncateHistoryEntry(text, max = MAX_HISTORY_ENTRY_CHARS) {
  if (typeof text !== 'string' || text.length <= max) return text;
  const head = Math.min(480, Math.floor(max * 0.22));
  const tail = max - head - ELLIPSIS.length;
  if (tail < 240) return text.slice(0, max);
  return `${text.slice(0, head)}${ELLIPSIS}${text.slice(-tail)}`;
}

function compactVisualEvidence(value) {
  if (!Array.isArray(value) || !value.length) return undefined;
  // Lazy import avoided — keep this file dependency-free for browser+server.
  // chat.mjs / controller normalize via hub-visual-evidence before persist.
  const items = [];
  for (const raw of value.slice(0, 4)) {
    if (!raw || typeof raw !== 'object') continue;
    const attachmentId = typeof raw.attachmentId === 'string' ? raw.attachmentId.trim() : '';
    if (!attachmentId) continue;
    const item = { attachmentId };
    for (const key of [
      'name', 'mime', 'evidenceType', 'transcribedText', 'documentType',
      'tableNotes', 'chartNotes', 'sceneNotes', 'strength'
    ]) {
      if (typeof raw[key] === 'string' && raw[key].trim()) {
        item[key] = raw[key].trim().slice(0, key === 'transcribedText' ? 1200 : 400);
      }
    }
    if (raw.structuredFields && typeof raw.structuredFields === 'object') {
      item.structuredFields = raw.structuredFields;
    }
    for (const key of ['entities', 'objects', 'dates', 'uncertainties', 'agentCues']) {
      if (Array.isArray(raw[key])) {
        item[key] = raw[key].filter((v) => typeof v === 'string').slice(0, 12);
      }
    }
    if (Array.isArray(raw.numbers)) item.numbers = raw.numbers.slice(0, 20);
    if (Array.isArray(raw.claims)) {
      const claims = [];
      for (const claim of raw.claims.slice(0, 40)) {
        if (!claim || typeof claim !== 'object') continue;
        const kind = typeof claim.kind === 'string' ? claim.kind.trim().slice(0, 64) : '';
        const source = claim.source === 'direct_visual'
          || claim.source === 'model_inference'
          || claim.source === 'external_or_personal'
          ? claim.source
          : null;
        if (!kind || !source) continue;
        const row = { kind, source };
        if (typeof claim.label === 'string' && claim.label.trim()) {
          row.label = claim.label.trim().slice(0, 80);
        }
        if (
          typeof claim.value === 'string'
          || typeof claim.value === 'number'
          || claim.value === null
        ) {
          row.value = typeof claim.value === 'string'
            ? claim.value.trim().slice(0, 200)
            : claim.value;
        }
        if (typeof claim.unit === 'string' && claim.unit.trim()) {
          row.unit = claim.unit.trim().slice(0, 32);
        }
        if (typeof claim.text === 'string' && claim.text.trim()) {
          row.text = claim.text.trim().slice(0, 400);
        }
        if (typeof claim.confidence === 'string' && claim.confidence.trim()) {
          row.confidence = claim.confidence.trim().slice(0, 64);
        }
        if (typeof claim.uncertainty === 'string' && claim.uncertainty.trim()) {
          row.uncertainty = claim.uncertainty.trim().slice(0, 200);
        }
        claims.push(row);
      }
      if (claims.length) item.claims = claims;
    }
    items.push(item);
  }
  return items.length ? items : undefined;
}

/**
 * Keep a contiguous recent suffix that fits the char budget.
 * Walking oldest-first drops the last plan once earlier lectures fill the cap.
 * Preserves compact visualEvidence on user turns (never base64).
 */
export function keepNewestHistory(entries, {
  maxMessages = MAX_HISTORY_MESSAGES,
  maxEntryChars = MAX_HISTORY_ENTRY_CHARS,
  maxTotalChars = MAX_HISTORY_TOTAL_CHARS
} = {}) {
  const valid = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.role !== 'user' && entry.role !== 'assistant') continue;
    if (typeof entry.content !== 'string' || entry.content.trim() === '') continue;
    const row = { role: entry.role, content: entry.content.trim() };
    const visualEvidence = compactVisualEvidence(entry.visualEvidence);
    if (visualEvidence) row.visualEvidence = visualEvidence;
    valid.push(row);
  }

  const windowed = valid.slice(-maxMessages);
  const kept = [];
  let total = 0;
  for (let i = windowed.length - 1; i >= 0; i -= 1) {
    const content = truncateHistoryEntry(windowed[i].content, maxEntryChars);
    const evidence = windowed[i].visualEvidence;
    const evidenceTax = evidence ? Math.min(800, JSON.stringify(evidence).length) : 0;
    if (total + content.length + evidenceTax > maxTotalChars) break;
    total += content.length + evidenceTax;
    const row = { role: windowed[i].role, content };
    if (evidence) row.visualEvidence = evidence;
    kept.unshift(row);
  }
  return kept;
}
