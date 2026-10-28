import type { AiProposal } from '@/ai/proposals';
import type { SearchPack } from '@/ai/search-pack';
import { validateProposalAgainstSearchPack } from '@/ai/search-pack-validation';
import { publishBlockIssues } from '@/schemas/lesson';
import type { Block } from '@/schemas/block';
import { RETIRED_BLOCK_TYPES } from '@/blocks/create-block';
import { visitBlocks } from '@/blocks/walk-blocks';

/** Toolkit cards are sleeves now: Ann attaches them to a block instead of inserting a card. */
function retiredInsertIssue(blocks: Block[]): string | null {
  let found: string | null = null;
  visitBlocks(blocks, (block) => {
    if (!found && RETIRED_BLOCK_TYPES.has(block.block_type)) found = block.block_type;
  });
  return found ? `${found} is retired: attach a sleeve lens (sleeve:<item id>) to a question instead.` : null;
}


export function publishIssueForProposal(proposal: AiProposal): string | null {
  switch (proposal.kind) {
    case 'replace_block':
      return publishBlockIssues([proposal.block]);
    case 'replace_section':
      return publishBlockIssues([proposal.section]);
    case 'replace_lesson':
      return publishBlockIssues(proposal.blocks);
    case 'insert_blocks':
      return retiredInsertIssue(proposal.blocks) ?? publishBlockIssues(proposal.blocks);
    case 'replace_blocks':
      return publishBlockIssues(proposal.blocks);
    default:
      return null;
  }
}

export function validateMutatingProposal(
  proposal: AiProposal,
  pack: SearchPack
): { ok: true } | { ok: false; error: string } {
  const packResult = validateProposalAgainstSearchPack(proposal, pack);
  if (!packResult.ok) {
    const references = packResult.violations
      .map(({ path, value }) => `${path}=${value}`)
      .join(', ');
    return { ok: false, error: `Media not in search pack: ${references}` };
  }
  const publishIssue = publishIssueForProposal(proposal);
  if (publishIssue) return { ok: false, error: publishIssue };
  return { ok: true };
}
