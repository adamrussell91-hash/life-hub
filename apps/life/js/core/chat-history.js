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

/**
 * Keep a contiguous recent suffix that fits the char budget.
 * Walking oldest-first drops the last plan once earlier lectures fill the cap.
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
    valid.push({ role: entry.role, content: entry.content.trim() });
  }

  const windowed = valid.slice(-maxMessages);
  const kept = [];
  let total = 0;
  for (let i = windowed.length - 1; i >= 0; i -= 1) {
    const content = truncateHistoryEntry(windowed[i].content, maxEntryChars);
    if (total + content.length > maxTotalChars) break;
    total += content.length;
    kept.unshift({ role: windowed[i].role, content });
  }
  return kept;
}
