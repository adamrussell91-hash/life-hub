import { NEW_BLOCK_LABEL } from '@/blocks/create-block';
import type { AiProposal } from '@/ai/proposals';
import { BlockSchema, type Block } from '@/schemas/block';

export type PartialAcceptUnit = {
  key: string;
  label: string;
  group?: string;
};

export type FilterProposalResult =
  | { ok: true; proposal: AiProposal }
  | { ok: false; message: string };

function truncate(value: string, max = 48): string {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function blockLabel(block: Block): string {
  if (block.block_type === 'heading') return truncate(block.content.text) || 'Heading';
  if (block.block_type === 'question_set') return truncate(block.content.title ?? '') || 'Question set';
  if (block.block_type === 'self_check') return truncate(block.content.title ?? '') || 'Self check';
  return NEW_BLOCK_LABEL[block.block_type] ?? block.block_type;
}

function collectionItems(block: Block, prefix: string, group?: string): PartialAcceptUnit[] {
  const p = prefix ? `${prefix}.` : '';
  switch (block.block_type) {
    case 'question_set':
      return block.content.questions.map((question, index) => ({
        key: `${p}questions:${question.id}`,
        label: `Q${index + 1}: ${truncate(question.prompt) || 'Question'}`,
        group
      }));
    case 'flashcards':
      return block.content.cards.map((card, index) => ({
        key: `${p}cards:${card.id}`,
        label: `Card ${index + 1}: ${truncate(card.front) || 'Card'}`,
        group
      }));
    case 'timeline':
      return block.content.events.map((event, index) => ({
        key: `${p}events:${event.id}`,
        label: `${event.when || `Event ${index + 1}`}: ${truncate(event.label)}`,
        group
      }));
    case 'gallery':
      return block.content.items.map((item, index) => ({
        key: `${p}gallery:${item.id}`,
        label: `Image ${index + 1}: ${truncate(item.alt_text || item.caption || 'Image')}`,
        group
      }));
    case 'accordion':
      return block.content.items.map((item, index) => ({
        key: `${p}accordion:${index}`,
        label: `Item ${index + 1}: ${truncate(item.title) || 'Item'}`,
        group
      }));
    case 'self_check':
      return (block.content.items ?? []).map((item, index) => ({
        key: `${p}self_check:${item.id}`,
        label: `Check ${index + 1}: ${truncate(item.label) || 'Item'}`,
        group
      }));
    default:
      return [];
  }
}

function listRootBlocks(blocks: Block[], keyPrefix: 'block' | 'child'): PartialAcceptUnit[] {
  const units: PartialAcceptUnit[] = [];
  blocks.forEach((block, index) => {
    const key = `${keyPrefix}:${index}`;
    const label = blockLabel(block);
    units.push({ key, label });
    units.push(...collectionItems(block, key, label));
  });
  return units;
}

export function listPartialAcceptUnits(proposal: AiProposal): PartialAcceptUnit[] {
  switch (proposal.kind) {
    case 'review_only':
    case 'reorder_blocks':
      return [];
    case 'replace_block':
      return collectionItems(proposal.block, '');
    case 'insert_blocks':
      return listRootBlocks(proposal.blocks, 'block');
    case 'replace_lesson': {
      const units: PartialAcceptUnit[] = [];
      if (proposal.title !== undefined) {
        units.push({ key: 'title', label: `Title: ${truncate(proposal.title)}` });
      }
      if (proposal.cover !== undefined) {
        units.push({ key: 'cover', label: 'Cover image' });
      }
      units.push(...listRootBlocks(proposal.blocks, 'block'));
      return units;
    }
    case 'replace_section': {
      if (proposal.section.block_type !== 'section') return [];
      return listRootBlocks(proposal.section.content.blocks as Block[], 'child');
    }
    case 'delete_blocks':
      return proposal.ids.map((id) => ({ key: `delete:${id}`, label: `Delete ${id}` }));
  }
}

function filterCollection(
  block: Block,
  keys: Set<string>,
  prefix: string
): { ok: true; block: Block } | { ok: false; message: string } {
  const p = prefix ? `${prefix}.` : '';
  let next: Block = block;

  if (block.block_type === 'question_set') {
    next = {
      ...block,
      content: {
        ...block.content,
        questions: block.content.questions.filter((question) => keys.has(`${p}questions:${question.id}`))
      }
    };
  } else if (block.block_type === 'flashcards') {
    next = {
      ...block,
      content: {
        ...block.content,
        cards: block.content.cards.filter((card) => keys.has(`${p}cards:${card.id}`))
      }
    };
  } else if (block.block_type === 'timeline') {
    next = {
      ...block,
      content: {
        ...block.content,
        events: block.content.events.filter((event) => keys.has(`${p}events:${event.id}`))
      }
    };
  } else if (block.block_type === 'gallery') {
    next = {
      ...block,
      content: {
        ...block.content,
        items: block.content.items.filter((item) => keys.has(`${p}gallery:${item.id}`))
      }
    };
  } else if (block.block_type === 'accordion') {
    next = {
      ...block,
      content: {
        ...block.content,
        items: block.content.items.filter((_, index) => keys.has(`${p}accordion:${index}`))
      }
    };
  } else if (block.block_type === 'self_check') {
    next = {
      ...block,
      content: {
        ...block.content,
        items: (block.content.items ?? []).filter((item) => keys.has(`${p}self_check:${item.id}`))
      }
    };
  }

  if (next.block_type === 'question_set' && next.content.questions.length < 1) {
    return { ok: false, message: 'Keep at least 1 question' };
  }
  if (next.block_type === 'accordion' && next.content.items.length < 1) {
    return { ok: false, message: 'Keep at least 1 accordion item' };
  }

  const parsed = BlockSchema.safeParse(next);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]?.message ?? 'Selection is not valid';
    return { ok: false, message: issue };
  }
  return { ok: true, block: parsed.data };
}

function filterBlockList(
  blocks: Block[],
  keys: Set<string>,
  keyPrefix: 'block' | 'child'
): { ok: true; blocks: Block[] } | { ok: false; message: string } {
  const kept: Block[] = [];
  for (let index = 0; index < blocks.length; index += 1) {
    const key = `${keyPrefix}:${index}`;
    if (!keys.has(key)) continue;
    const filtered = filterCollection(blocks[index]!, keys, key);
    if (!filtered.ok) return filtered;
    kept.push(filtered.block);
  }
  return { ok: true, blocks: kept };
}

export function filterProposal(proposal: AiProposal, selectedKeys: Set<string>): FilterProposalResult {
  if (proposal.kind === 'review_only' || proposal.kind === 'reorder_blocks') {
    return { ok: true, proposal };
  }

  if (proposal.kind === 'replace_block') {
    if (collectionItems(proposal.block, '').length === 0) {
      return { ok: true, proposal };
    }
    const filtered = filterCollection(proposal.block, selectedKeys, '');
    if (!filtered.ok) return filtered;
    return { ok: true, proposal: { ...proposal, block: filtered.block } };
  }

  if (proposal.kind === 'insert_blocks') {
    const filtered = filterBlockList(proposal.blocks, selectedKeys, 'block');
    if (!filtered.ok) return filtered;
    if (filtered.blocks.length === 0) {
      return { ok: false, message: 'Select at least one change' };
    }
    return { ok: true, proposal: { ...proposal, blocks: filtered.blocks } };
  }

  if (proposal.kind === 'replace_lesson') {
    const filtered = filterBlockList(proposal.blocks, selectedKeys, 'block');
    if (!filtered.ok) return filtered;
    const next: Extract<AiProposal, { kind: 'replace_lesson' }> = {
      kind: 'replace_lesson',
      blocks: filtered.blocks
    };
    if (selectedKeys.has('title') && proposal.title !== undefined) next.title = proposal.title;
    if (selectedKeys.has('cover') && proposal.cover !== undefined) next.cover = proposal.cover;
    if (next.blocks.length === 0 && next.title === undefined && next.cover === undefined) {
      return { ok: false, message: 'Select at least one change' };
    }
    return { ok: true, proposal: next };
  }

  if (proposal.kind === 'replace_section') {
    if (proposal.section.block_type !== 'section') {
      return { ok: false, message: 'Not a section' };
    }
    const filtered = filterBlockList(proposal.section.content.blocks as Block[], selectedKeys, 'child');
    if (!filtered.ok) return filtered;
    return {
      ok: true,
      proposal: {
        ...proposal,
        section: {
          ...proposal.section,
          content: {
            ...proposal.section.content,
            blocks: filtered.blocks as typeof proposal.section.content.blocks
          }
        }
      }
    };
  }

  if (proposal.kind === 'delete_blocks') {
    const ids = proposal.ids.filter((id) => selectedKeys.has(`delete:${id}`));
    if (ids.length === 0) {
      return { ok: false, message: 'Select at least one change' };
    }
    return { ok: true, proposal: { ...proposal, ids } };
  }

  const _exhaustive: never = proposal;
  return { ok: false, message: 'Unknown proposal' };
}
