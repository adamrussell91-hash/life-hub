import type { Block } from '@/schemas/block';
import { visitBlocks } from '@/blocks/walk-blocks';

/**
 * Focus view cuts the published lesson into steps, shown one at a time on the
 * board. The teacher controls the cut through how the lesson is built:
 *
 * - a heading starts a new step, and everything after it up to the next
 *   heading belongs to that step;
 * - a section is a step of its own;
 * - a step holds one main block (an activity, a toolkit block, an image, a
 *   chart, a column row...). A second main block starts a new step, taking
 *   the text that leads into it along;
 * - a column row is one block, so its columns always stay together.
 *
 * Text, quotes, callouts, dividers and the like are supporting blocks: they
 * ride along with the main block they sit beside.
 *
 * Blocks before the first heading or section make an opening step. The
 * lesson hero (title, outcomes, cover) is always step one and is added by the
 * view, not here.
 */
export type FocusStep = {
  /** Short label for the progress strip and the lesson map. */
  label: string;
  blocks: Block[];
};

const LABEL_MAX = 28;

/** Blocks that frame or introduce a main block rather than stand on their own. */
const SUPPORTING = new Set<Block['block_type']>([
  'heading',
  'rich_text',
  'callout',
  'teacher_note',
  'quote',
  'definition',
  'code',
  'divider',
  'spacer',
  'outcomes',
  'countdown'
]);

export const isMainBlock = (block: Block): boolean => !SUPPORTING.has(block.block_type);

function plain(text: string): string {
  return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function shortLabel(text: string, fallback: string): string {
  const clean = plain(text);
  if (!clean) return fallback;
  return clean.length > LABEL_MAX ? `${clean.slice(0, LABEL_MAX - 1).trimEnd()}…` : clean;
}

/** A step that starts at a main block, with no heading, is named after the block. */
function mainLabel(block: Block, n: number): string {
  if (!isMainBlock(block)) return `Part ${n}`;
  const name = block.block_type.replace(/_/g, ' ');
  return name[0]!.toUpperCase() + name.slice(1);
}

export function focusSteps(blocks: readonly Block[]): FocusStep[] {
  const steps: FocusStep[] = [];
  let open: FocusStep | null = null;

  for (const block of blocks) {
    if (block.block_type === 'section') {
      steps.push({ label: shortLabel(block.content.title, `Part ${steps.length + 1}`), blocks: [block] });
      open = null;
      continue;
    }
    if (block.block_type === 'heading') {
      open = { label: shortLabel(block.content.text, `Part ${steps.length + 1}`), blocks: [block] };
      steps.push(open);
      continue;
    }
    if (open && isMainBlock(block)) {
      // One main block per step: the next one starts afresh, taking its lead-in text with it.
      const last = open.blocks.reduce((at, b, i) => (isMainBlock(b) ? i : at), -1);
      if (last >= 0) {
        const leadIn = open.blocks.splice(last + 1);
        open = { label: mainLabel(block, steps.length + 1), blocks: leadIn };
        steps.push(open);
      }
    }
    if (!open) {
      open = { label: steps.length ? mainLabel(block, steps.length + 1) : 'Opening', blocks: [] };
      steps.push(open);
    }
    open.blocks.push(block);
  }
  return steps;
}

/** Every hinge question in a step, however deeply it sits in sections or columns. */
export function stepHingeIds(step: FocusStep): string[] {
  const ids: string[] = [];
  visitBlocks(step.blocks, (block) => {
    if (block.block_type === 'hinge_question') ids.push(block.id);
  });
  return ids;
}
