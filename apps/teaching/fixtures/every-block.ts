import { createBlock, NEW_BLOCK_TYPES, type NewBlockType } from '@/blocks/create-block';
import { BlockSchema, type Block } from '@/schemas/block';

/**
 * One block of every lesson block type: createBlock defaults with every empty
 * author text field filled, so a render shows every field an author can type.
 * Used by the block text baseline (unit) and the block anatomy page (browser).
 */

const TEXT_KEYS = new Set([
  'title', 'label', 'prompt', 'question', 'body', 'text', 'term', 'definition', 'front', 'back',
  'description', 'when', 'eyebrow', 'quote', 'attribution', 'source', 'reference', 'note', 'caption',
  'answer', 'guide', 'focus', 'task', 'example', 'teacher_note', 'concept', 'weak', 'strong',
  'strength_prompt', 'suggestion_prompt', 'alt_text', 'subtitle', 'summary', 'name'
]);
const HTML_KEYS = new Set(['html']);
/** Optional author fields that defaults leave out entirely. */
const OPTIONAL: Partial<Record<NewBlockType, Record<string, string>>> = {
  callout: { title: 'Callout title' },
  quote: { attribution: 'Quote attribution', source: 'Quote source', reference: 'Quote reference' },
  card_stack: { title: 'Card stack title' },
  collection: { title: 'Collection title' },
  countdown: { title: 'Countdown title', note: 'Countdown note' }
};

function fill(value: unknown, key: string, path: string): unknown {
  if (typeof value === 'string') {
    if (value !== '') return value;
    if (HTML_KEYS.has(key)) return `<p>${path} filler text for reading.</p>`;
    if (TEXT_KEYS.has(key)) return `${path} filler`;
    return value;
  }
  if (Array.isArray(value)) return value.map((item, i) => fill(item, key, `${path}.${i}`));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, fill(v, k, `${path}.${k}`)])
    );
  }
  return value;
}

export function everyBlockFixture(type: NewBlockType): Block {
  const base = createBlock(type, `every_${type}`);
  const content = { ...(fill(base.content, 'content', type) as Record<string, unknown>), ...(OPTIONAL[type] ?? {}) };
  if (type === 'rich_text') content.html = '<p>Tides rise and fall twice a day because the Moon pulls the ocean towards it.</p>';
  const filled = { ...base, content } as Block;
  // Keep the filled block only if it is still a valid stored block.
  return BlockSchema.safeParse(filled).success ? filled : base;
}

export function everyBlockFixtures(): Block[] {
  return NEW_BLOCK_TYPES.map(everyBlockFixture);
}
