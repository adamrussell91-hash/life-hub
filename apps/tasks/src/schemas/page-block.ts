import { z } from 'zod';
import { BlockSchema, type Block } from './block';

export type { Block as PageBlock };
export type PageBlockType = Block['block_type'];

/**
 * The calendar PR shipped a six-block stub whose records omit `visibility`
 * and stored quote copy on `content.text`. Accept those rows so existing
 * task/project pages keep loading after the real Teaching Hub schema lands.
 */
function migrateStubPageBlock(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const block = { ...(value as Record<string, unknown>) };
  if (block.visibility == null) block.visibility = 'student_teacher';
  if (block.layout == null) block.layout = {};
  if (block.print == null) block.print = {};
  if (block.settings == null) block.settings = {};
  if (block.block_type === 'quote' && block.content && typeof block.content === 'object') {
    const content = { ...(block.content as Record<string, unknown>) };
    if (typeof content.quote !== 'string' && typeof content.text === 'string') {
      content.quote = content.text;
      delete content.text;
    }
    block.content = content;
  }
  return block;
}

export const PageBlockSchema = z.preprocess(migrateStubPageBlock, BlockSchema);
