/**
 * Follow-up Task orchestration for Communication detail.
 *
 * Creates the Task once, then writes Universal Links for:
 * - follow_up → Communication
 * - contact → every current recipient Person (read from Universal Links)
 *
 * Task JSON never receives Person, Communication, or Universal Link IDs.
 * Retry resumes the saved Task and only missing link intents.
 */

/**
 * @param {Array<{ link: { status: string, relationship_type: string, target_ref: string } }>} outgoing
 * @returns {string[]}
 */
export function recipientPersonRefsFromLinks(outgoing) {
  const refs = [];
  const seen = new Set();
  for (const entry of outgoing) {
    const link = entry.link;
    if (link.status !== 'current') continue;
    if (link.relationship_type !== 'recipient') continue;
    if (!link.target_ref.startsWith('shared:person:')) continue;
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

/**
 * Create or retry a follow-up Task for a Communication.
 * Passing `prior` with a task_id never creates another Task.
 *
 * @param {{
 *   createTask: (input: { title: string }) => Promise<{ id: string, title?: string }>,
 *   listLinksForEntity: (entityRef: string) => Promise<{ outgoing: Array<{ link: object }> }>,
 *   createLink: (input: { source_ref: string, target_ref: string, relationship_type: string }) => Promise<{ link: { id: string }, created: boolean }>
 * }} deps
 * @param {{
 *   communicationId: string,
 *   title: string,
 *   prior?: object | null
 * }} input
 */
export async function createOrRetryFollowUpTask(deps, input) {
  const commRef = `professional:communication:${input.communicationId}`;
  let taskId = input.prior?.task_id ?? null;
  let createdTask = false;
  let intents = input.prior?.intents ?? null;
  const completedIntents = new Set(input.prior?.completed_intent_ids ?? []);
  const completedLinkIds = new Set(input.prior?.completed_link_ids ?? []);

  if (!taskId) {
    const task = await deps.createTask({ title: input.title });
    taskId = task.id;
    createdTask = true;
  }

  if (!intents) {
    const { outgoing } = await deps.listLinksForEntity(commRef);
    const recipients = recipientPersonRefsFromLinks(outgoing);
    intents = buildFollowUpIntents({
      communicationRef: commRef,
      recipientPersonRefs: recipients
    });
  }

  const sourceRef = `tasks:task:${taskId}`;
  const failed = [];

  for (const intent of intents) {
    if (completedIntents.has(intent.intent_id)) continue;
    try {
      const result = await deps.createLink({
        source_ref: sourceRef,
        target_ref: intent.target_ref,
        relationship_type: intent.relationship_type
      });
      completedIntents.add(intent.intent_id);
      completedLinkIds.add(result.link.id);
    } catch {
      failed.push(intent);
    }
  }

  const state = {
    task_id: taskId,
    title: input.title,
    communication_id: input.communicationId,
    communication_ref: commRef,
    intents,
    completed_intent_ids: [...completedIntents],
    completed_link_ids: [...completedLinkIds],
    failed_intent_ids: failed.map((intent) => intent.intent_id),
    failed_relationships: failed.map((intent) => ({
      intent_id: intent.intent_id,
      relationship_type: intent.relationship_type,
      target_ref: intent.target_ref
    }))
  };

  return {
    incomplete: failed.length > 0,
    state,
    created_task: createdTask
  };
}
