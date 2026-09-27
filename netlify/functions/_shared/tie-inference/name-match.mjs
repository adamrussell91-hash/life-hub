/**
 * Name / alias matching for tie inference — same rules as link-inference-rules
 * (`nameMatches`, min 3 characters after normalize).
 */

export function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string} haystack
 * @param {{ display_name?: string, aliases?: string[] }} person
 */
export function nameMatches(haystack, person) {
  const hay = normalizeName(haystack);
  if (!hay) return false;
  const names = [person.display_name, ...(person.aliases ?? [])]
    .map(normalizeName)
    .filter((n) => n.length >= 3);
  return names.some((n) => hay.includes(n));
}

/**
 * Resolve roster people named in text. Ambiguous names (match >1 person) are
 * ignored, not guessed. Returns { matched: Person[], ambiguous: string[] }.
 *
 * @param {string} text
 * @param {Array<{ ref: string, display_name: string, aliases?: string[] }>} roster
 */
export function resolveNamedPeople(text, roster) {
  const hay = normalizeName(text);
  if (!hay || !Array.isArray(roster)) return { matched: [], ambiguous: [] };

  /** @type {Map<string, { person: object, name: string }[]>} */
  const byName = new Map();
  for (const person of roster) {
    const names = [person.display_name, ...(person.aliases ?? [])]
      .map(normalizeName)
      .filter((n) => n.length >= 3);
    for (const name of names) {
      if (!hay.includes(name)) continue;
      const list = byName.get(name) ?? [];
      list.push({ person, name });
      byName.set(name, list);
    }
  }

  const matched = [];
  const ambiguous = [];
  const seenRefs = new Set();
  for (const [name, hits] of byName) {
    const uniquePeople = [...new Map(hits.map((h) => [h.person.ref, h.person])).values()];
    if (uniquePeople.length > 1) {
      ambiguous.push(name);
      continue;
    }
    const person = uniquePeople[0];
    if (seenRefs.has(person.ref)) continue;
    seenRefs.add(person.ref);
    matched.push(person);
  }
  return { matched, ambiguous };
}

/**
 * True when both display names appear in the same sentence of text.
 */
export function sameSentenceNames(text, personA, personB) {
  const raw = String(text || '');
  if (!raw) return false;
  // Don't treat initials like "Ollie P." as sentence boundaries.
  const sentences = raw.split(/(?<=[.!?])\s+(?=[A-Z])/);
  for (const sentence of sentences) {
    if (nameMatches(sentence, personA) && nameMatches(sentence, personB)) return true;
  }
  if (!/[.!?]/.test(raw) && nameMatches(raw, personA) && nameMatches(raw, personB)) return true;
  return false;
}

/**
 * Centre a ≤ maxChars excerpt on where either person name appears.
 */
export function excerptAroundNames(text, people, maxChars = 400) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  if (raw.length <= maxChars) return raw;
  let best = 0;
  for (const person of people ?? []) {
    const names = [person.display_name, ...(person.aliases ?? [])]
      .map(normalizeName)
      .filter((n) => n.length >= 3);
    const lower = normalizeName(raw);
    for (const name of names) {
      const idx = lower.indexOf(name);
      if (idx >= 0) {
        best = Math.max(best, Math.floor((idx / Math.max(lower.length, 1)) * raw.length));
      }
    }
  }
  const half = Math.floor(maxChars / 2);
  let start = Math.max(0, best - half);
  let end = Math.min(raw.length, start + maxChars);
  start = Math.max(0, end - maxChars);
  let slice = raw.slice(start, end);
  if (start > 0) slice = `…${slice}`;
  if (end < raw.length) slice = `${slice}…`;
  return slice;
}

/**
 * Replace roster-excluded display names in text with "[student]" for Claude.
 */
export function redactExcludedNames(text, excludedPeople) {
  let out = String(text || '');
  for (const person of excludedPeople ?? []) {
    const names = [person.display_name, ...(person.aliases ?? [])].filter(
      (n) => typeof n === 'string' && n.trim().length >= 3
    );
    for (const name of names) {
      const re = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      out = out.replace(re, '[student]');
    }
  }
  return out;
}
