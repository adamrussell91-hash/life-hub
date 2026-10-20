import { BlockSchema, type Block } from '@/schemas/block';
import { findAlchemyBlock, type AlchemyEntity } from './block-revision';
import { applyPatchToEntity, PatchError, editableFields } from '../../../../packages/alchemy/patches.js';
import type { AgentProposal } from './agent-client';

export { PatchError };

const validateBlock = (block: unknown) => { const parsed = BlockSchema.safeParse(block); return parsed.success ? parsed.data : null; };

/** The field's current text on the page; null when the block or field is gone. */
export function liveField(entity: AlchemyEntity, p: Pick<AgentProposal, 'blockId' | 'path'>): string | null {
  const block = findAlchemyBlock((entity.blocks ?? []) as Block[], p.blockId);
  return block ? new Map(editableFields(block)).get(p.path) ?? null : null;
}

/** The page with one suggestion applied. Throws PatchError when it no longer fits. */
export function withProposal(entity: AlchemyEntity, p: AgentProposal): AlchemyEntity {
  return applyPatchToEntity(entity as never, { blockId: p.blockId, path: p.path, oldStr: p.oldStr, newStr: p.newStr }, validateBlock as never);
}

/** The page with one applied suggestion taken back out; unchanged when newer edits got there first. */
export function withoutProposal(entity: AlchemyEntity, p: AgentProposal): AlchemyEntity {
  try { return applyPatchToEntity(entity as never, { blockId: p.blockId, path: p.path, oldStr: p.newStr, newStr: p.oldStr }, validateBlock as never); }
  catch { return entity; }
}

/** True when the suggestion's words are still on the page exactly once. */
export function stillFits(entity: AlchemyEntity, p: AgentProposal): boolean {
  try { withProposal(entity, p); return true; } catch (e) { if (e instanceof PatchError) return false; throw e; }
}
