export type ThreadCandidate = {
  id: string;
  status: 'open' | 'closed';
  purpose_tag: string | null;
  personRefs: string[];
  lastAt: string | null;
};

const WINDOW_MS = 90 * 86_400_000;

/**
 * Spec §3: a record joins a thread by itself when exactly one open thread shares
 * its purpose tag and at least one person, and was active in the last 90 days.
 * Otherwise the matches are offered for Adam to pick.
 */
export function pickThreadForComm(
  comm: { personRefs: string[]; purposeTag: string | null; at: string },
  threads: ThreadCandidate[]
): { join: string | null; candidates: string[] } {
  if (!comm.purposeTag) return { join: null, candidates: [] };
  const at = Date.parse(comm.at);
  const people = new Set(comm.personRefs);
  const matches = threads.filter(
    (thread) =>
      thread.status === 'open' &&
      thread.purpose_tag === comm.purposeTag &&
      thread.personRefs.some((ref) => people.has(ref)) &&
      thread.lastAt !== null &&
      Math.abs(at - Date.parse(thread.lastAt)) <= WINDOW_MS
  );
  const candidates = matches.map((thread) => thread.id);
  return { join: candidates.length === 1 ? candidates[0]! : null, candidates };
}
