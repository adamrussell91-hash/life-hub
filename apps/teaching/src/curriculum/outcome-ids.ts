/** Page attachments: prefer canonical IDs, fall back to legacy lesson code strings. */
export function attachedOutcomeIds(record: {
  outcome_ids?: string[];
  syllabus_outcomes?: string[];
}): string[] {
  if (record.outcome_ids && record.outcome_ids.length > 0) return [...record.outcome_ids];
  if (record.syllabus_outcomes && record.syllabus_outcomes.length > 0) {
    return [...record.syllabus_outcomes];
  }
  return [];
}

export function uniqueOutcomeIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
