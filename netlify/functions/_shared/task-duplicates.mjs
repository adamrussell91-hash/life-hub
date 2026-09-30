/**
 * Duplicate detection for agent task capture (create_task).
 *
 * Two strengths:
 * - 'same_title': exact or near-exact wording of an open task → never create it again.
 * - 'same_person': different wording but the same named person (e.g. "Reply to Joseph" vs
 *   "Joseph Histon — Notes from meeting"). Could be genuine separate work (two James Blair
 *   tasks), so it is never blocked — it must go to a Confirm card flagged for Adam.
 */

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'about', 'into', 'reply', 'email']);

function titleTokens(title) {
  return String(title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => (word.length > 2 || /^\d+$/.test(word)) && !STOP.has(word));
}

function tokenOverlap(a, b) {
  const left = new Set(titleTokens(a));
  const right = new Set(titleTokens(b));
  // Fuzzy matching needs at least two meaningful words a side; short titles must match exactly.
  if (left.size < 2 || right.size < 2) return 0;
  let hit = 0;
  for (const word of left) if (right.has(word)) hit += 1;
  return hit / Math.max(left.size, right.size);
}

// Capitalised words that are ordinary task vocabulary, not people.
const NOT_NAMES = new Set([
  'reply', 'respond', 'email', 'call', 'text', 'send', 'mark', 'marking', 'feedback', 'notes',
  'meeting', 'mod', 'module', 'mock', 'exam', 'essay', 'english', 'advanced', 'standard',
  'year', 'term', 'week', 'common', 'introduction', 'intro', 'practise', 'practice', 'revised',
  'draft', 'check', 'book', 'buy', 'pay', 'follow', 'up', 'to', 'the', 'and', 'for', 'with',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'today', 'tomorrow'
]);

export function personNames(title) {
  const names = new Set();
  for (const raw of String(title ?? '').split(/[^A-Za-z'’-]+/)) {
    if (!/^[A-Z][a-z'’-]{2,}$/.test(raw)) continue;
    const word = raw.toLowerCase();
    if (!NOT_NAMES.has(word)) names.add(word);
  }
  return names;
}

export function findTaskTwin(title, candidates = []) {
  const wanted = String(title ?? '').trim().toLowerCase();
  if (!wanted) return null;
  for (const task of candidates) {
    const other = String(task?.title ?? '').trim();
    if (!other) continue;
    if (other.toLowerCase() === wanted || tokenOverlap(title, other) >= 0.8) {
      return { task, match: 'same_title' };
    }
  }
  const names = personNames(title);
  if (!names.size) return null;
  for (const task of candidates) {
    const other = personNames(task?.title);
    for (const name of names) {
      if (other.has(name)) return { task, match: 'same_person' };
    }
  }
  return null;
}
