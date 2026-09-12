/**
 * Pure helpers for Communication → follow-up Task relationship intents.
 * Shared by the Professional client helper and the durable server journal.
 */

/**
 * @param {Array<{ link?: { status?: string, relationship_type?: string, target_ref?: string }, status?: string, relationship_type?: string, target_ref?: string }>} outgoing
 * @returns {string[]}
 */
export function recipientPersonRefsFromLinks(outgoing) {
  const refs = [];
  const seen = new Set();
  for (const entry of outgoing ?? []) {
    const link = entry?.link ?? entry;
    if (!link || typeof link !== 'object') continue;
    if (link.status !== 'current') continue;
    if (link.relationship_type !== 'recipient') continue;
    if (typeof link.target_ref !== 'string' || !link.target_ref.startsWith('shared:person:')) {
      continue;
    }
    if (seen.has(link.target_ref)) continue;
    seen.add(link.target_ref);
    refs.push(link.target_ref);
  }
  return refs;
}

/**
 * @param {{ communicationRef: string, recipientPersonRefs: string[] }} input
 */
export function buildFollowUpIntents(input) {
  /** @type {Array<{ intent_id: string, relationship_type: 'follow_up' | 'contact', target_ref: string }>} */
  const intents = [
    {
      intent_id: `follow_up:${input.communicationRef}`,
      relationship_type: 'follow_up',
      target_ref: input.communicationRef
    }
  ];
  for (const personRef of input.recipientPersonRefs) {
    intents.push({
      intent_id: `contact:${personRef}`,
      relationship_type: 'contact',
      target_ref: personRef
    });
  }
  return intents;
}
