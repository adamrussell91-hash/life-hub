import type { Block } from '@/schemas/block';
import { mapBlockById } from '../block-pulse';
import { visitBlocks } from '../walk-blocks';
import { canAddSleeve, sleeveById } from './registry';
import { SLEEVE_PREFIX } from './sleeve-lens';
import type { SleeveLens } from './types';

/** The canvas listens for this to move an old toolkit card onto the block below it. */
export const SLEEVE_CONVERT_EVENT = 'sleeve-convert';
export type SleeveConvertDetail = { blockId: string };
export const NO_SLEEVE_TARGET = 'Add a question below this card first.';

const OLD_CARDS = new Set(['toolkit_skill', 'toolkit_tool', 'toolkit_value']);
/** Reading and media blocks are passed over: a sleeve belongs on something students do. */
const PASSIVE = new Set(['rich_text', 'text', 'callout', 'quote', 'image', 'video', 'embed', 'file', 'gallery']);

/** The sleeve an old toolkit card turns into, when that item has sleeve text. */
export function sleeveForCard(block: Block): SleeveLens | undefined {
  if (!OLD_CARDS.has(block.block_type)) return undefined;
  const item = (block.content as { item?: unknown }).item;
  return typeof item === 'string' ? sleeveById(`${SLEEVE_PREFIX}${item}`) : undefined;
}

function findCard(blocks: Block[], cardId: string): Block | undefined {
  let found: Block | undefined;
  visitBlocks(blocks, (block) => { if (block.id === cardId) found = block; });
  return found;
}

/**
 * The first block after the card, in page order, that can wear this sleeve
 * and still has room for it. Blocks inside later sections, columns and tabs count.
 */
export function sleeveTarget(blocks: Block[], cardId: string): Block | null {
  const card = findCard(blocks, cardId);
  const lens = card ? sleeveForCard(card) : undefined;
  if (!lens) return null;
  let passed = false;
  let target: Block | null = null;
  visitBlocks(blocks, (block) => {
    if (target) return;
    if (block.id === cardId) { passed = true; return; }
    if (!passed || PASSIVE.has(block.block_type) || !lens.canAttach(block)) return;
    // A block already wearing this sleeve is the target too: the card just goes.
    if (lens.read(block) || canAddSleeve(block)) target = block;
  });
  return target;
}

/** Attaches the card's sleeve, at its defaults, to the target. The card itself stays until the teacher confirms. */
export function attachCardSleeve(blocks: Block[], cardId: string): { blocks: Block[]; target: Block; lens: SleeveLens } | null {
  const card = findCard(blocks, cardId);
  const lens = card ? sleeveForCard(card) : undefined;
  const target = sleeveTarget(blocks, cardId);
  if (!lens || !target) return null;
  const next = lens.read(target) ? blocks : mapBlockById(blocks, target.id, (block) => lens.write(block, lens.create()));
  return { blocks: next, target, lens };
}
