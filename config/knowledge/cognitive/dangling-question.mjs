export function dropTrailingQuestion(text) {
  const m = String(text || "").match(/(?:^|[\n.!])\s*[^\n.!?][^?\n.!]*\?\s*$/u);
  if (!m) return text;
  const kept = text.slice(0, m.index + (/^[.!]/.test(m[0]) ? 1 : 0)).trim();
  return kept || text;
}

// Cancel has no reply box, so every trailing question has to go. A turn that is only a question becomes empty.
export function stripDanglingQuestions(text) {
  let next = String(text || "").trim();
  for (let i = 0; i < 8 && next; i++) {
    const m = next.match(/(?:^|[\n.!])\s*[^\n.!?][^?\n.!]*\?\s*$/u);
    if (!m) break;
    const kept = next.slice(0, m.index + (/^[.!]/.test(m[0]) ? 1 : 0)).trim();
    if (kept === next) break;
    next = kept;
  }
  return next;
}
