/**
 * Follow-up Task orchestration helpers.
 *
 * Intent builders live in the shared Netlify module used by durable server
 * journals. The client helper remains for unit tests; the Communication
 * screen uses server create-follow-up / retry-follow-up actions.
 */

export {
  buildFollowUpIntents,
  recipientPersonRefsFromLinks
} from '../../../../netlify/functions/_shared/follow-up-intents.mjs';

import {
  buildFollowUpIntents,
  recipientPersonRefsFromLinks
} from '../../../../netlify/functions/_shared/follow-up-intents.mjs';

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
