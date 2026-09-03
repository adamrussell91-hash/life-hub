import { findBlockById } from '@/blocks/find-block';
import type { AiScope } from '@/ai/proposals';
import type { Block } from '@/schemas/block';

export type ResolvedSelection = { selectedBlockId: string | null; scope: AiScope };

/**
 * `selected_block_id` is a hint about what the teacher is looking at, and the
 * canvas can be ahead of the saved draft — a block added seconds ago is not in
 * storage yet. Rejecting the request in that case makes the agent look broken
 * for the most ordinary action there is: add a block, then ask for content.
 * An unresolvable hint drops to lesson scope so the agent still answers.
 */
export function resolveSelection(
  blocks: Block[],
  selectedBlockId: string | null | undefined,
  scope: AiScope
): ResolvedSelection {
  const requested = typeof selectedBlockId === 'string' ? selectedBlockId.trim() : '';
  if (!requested) return { selectedBlockId: null, scope: scope === 'lesson' ? scope : 'lesson' };
  if (!findBlockById(blocks, requested)) return { selectedBlockId: null, scope: 'lesson' };
  return { selectedBlockId: requested, scope };
}
