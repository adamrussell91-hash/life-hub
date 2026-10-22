import { createTask, createUniversalLink } from '@/api/universal-links';
import { patchLedger } from '@/api/ledger';
import type { LedgerItem } from '@/domain/types';

/**
 * Turn an "I owe" action into a Task that points back to where it was said.
 * The `tagged_with` link is what shows the task in the meeting or
 * communication's Connections card, and the meeting chip on the task in Tasks.
 */
export async function makeActionTask(item: LedgerItem, sourceRef: string): Promise<LedgerItem> {
  const task = await createTask({ title: item.text });
  const taskRef = `tasks:task:${task.id}`;
  await createUniversalLink({ source_ref: taskRef, target_ref: sourceRef, relationship_type: 'tagged_with' });
  return (await patchLedger(item.id, { task_ref: taskRef })).item;
}
