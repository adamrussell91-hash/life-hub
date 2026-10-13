import { BlockSchema, type Block } from '@/schemas/block';
import { blockRevision, canonical, contextSnapshot, findAlchemyBlock, protectedContentUnchanged } from '../../../../packages/alchemy/revisions.js';
export { blockRevision, canonical, contextSnapshot, findAlchemyBlock };
export type AlchemyEntity = {title:string;blocks?:Block[];unit_id?:string;[key:string]:unknown};
export type AlchemyProposal = {blockId:string;original:string;contextRevision:string;rationale:string;replacement:Block;sources:Array<{id:string;title:string;excerpt:string}>};
export type AlchemyResult = {proposals:AlchemyProposal[];assessed:string[];contextRevision:string;mode:string};

export function applyAlchemyProposal<T extends AlchemyEntity>(entity:T, proposal:Pick<AlchemyProposal,'blockId'|'original'|'replacement'>):T {
  const original=findAlchemyBlock(entity.blocks||[],proposal.blockId);
  if(!original || blockRevision(original)!==proposal.original)throw new Error('This block changed. Ask Ann to check it again.');
  const parsed=BlockSchema.safeParse(proposal.replacement);
  if(!parsed.success || parsed.data.id!==original.id || parsed.data.block_type!==original.block_type || !protectedContentUnchanged(original.content,parsed.data.content))throw new Error('This suggestion cannot safely replace the block.');
  const next=structuredClone(entity);
  const target=findAlchemyBlock(next.blocks||[],proposal.blockId)!;
  target.content=parsed.data.content; // Only content; preserve current metadata and visibility.
  return next;
}
