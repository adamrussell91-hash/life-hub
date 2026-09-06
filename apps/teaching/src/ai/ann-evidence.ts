/**
 * Teaching-surface contract for Ann evidence packs.
 * Production `/api/ai/chat` (and any Ann Teaching runner) must assemble the
 * pack server-side — preferably via netlify `_shared/ann-teaching-surface.mjs`
 * — then pass `evidencePackBlock` into `buildAiSystemPrompt`.
 */
export function assertAnnEvidenceWired(input: {
  agentName?: string;
  evidencePackBlock?: string | null;
}): void {
  const name = String(input.agentName ?? '').toLowerCase();
  const isAnn = name === 'ann' || name.includes('ann');
  if (!isAnn) return;
  if (!String(input.evidencePackBlock ?? '').trim()) {
    throw new Error(
      'Ann Teaching turns require a server-assembled evidencePackBlock (Teaching store retrieval).'
    );
  }
}
