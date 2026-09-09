const LEADING = [
  /^(hey|please|can you|could you|tell me)\s+/i,
  /^(what|where|which|who|when|how)\s+/i,
  /^(do i|did i|have i|is there|are there|have you|got)\s+/i,
  /^(already)\s+/i,
  /^(have|got|any|anything|something|notes?|material|stuff)\s+/i,
  /^(a|any)\s+notes?\s+/i,
  /^(on|about|regarding|re|for|in)\s+/i,
];

const TRAILING = /\s+(in the archive|in my (?:notes|archive)|please|thanks)\s*$/i;

/** Existence / coverage checks — one quick retrieve, not multi-round deep research. */
const ARCHIVE_LOOKUP =
  /^(?:hey|please|can you|could you|tell me)\s+/i;

const ARCHIVE_LOOKUP_CORE =
  /^(?:do i (?:already )?have (?:a |any )?notes? (?:on|about|for)\b|do i have anything (?:on|about|for)\b|what do i (?:already )?have (?:on|about|for)\b|is there (?:a |any )?notes? (?:on|about|for)\b|have i (?:already )?(?:got|written|filed|noted)\b|any notes? (?:on|about|for)\b|have i got anything (?:on|about)\b)/i;

/** Strip "what do I have on …" so retrieval searches the topic, not the question. */
export function topicQuery(raw: string): string {
  let next = raw.trim();
  if (!next) return "";
  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of LEADING) {
      const stripped = next.replace(pattern, "");
      if (stripped !== next) {
        next = stripped;
        changed = true;
      }
    }
  }
  next = next.replace(TRAILING, "").replace(/[?!.,;:]+$/g, "").replace(/\s+/g, " ").trim();
  return next || raw.trim();
}

/** True for "do I already have a note on X?" — map to Scope the archive / quick kernel. */
export function isArchiveLookupQuery(raw: string): boolean {
  let next = raw.trim().replace(/\s+/g, " ");
  if (!next) return false;
  next = next.replace(ARCHIVE_LOOKUP, "");
  return ARCHIVE_LOOKUP_CORE.test(next);
}
