import type { Block } from '../schemas/block';

export type BlockType = Block['block_type'];
export type BlockOf<T extends BlockType> = Extract<Block, { block_type: T }>;

const DEFAULT_VARIANT: Partial<Record<BlockType, string>> = {
  image: 'large',
  video: 'large',
  embed: 'large',
  table: 'large',
  html_app: 'large'
};

export function makeBlock<T extends BlockType>(
  blockType: T,
  id: string,
  content: BlockOf<T>['content'],
  now: string,
  variant?: string
): BlockOf<T> {
  return {
    id,
    type: 'block',
    block_type: blockType,
    variant: variant ?? DEFAULT_VARIANT[blockType] ?? 'medium',
    visibility: 'student_teacher',
    content,
    layout: {},
    print: {},
    settings: {},
    created_at: now,
    updated_at: now,
    schema_version: 1
  } as unknown as BlockOf<T>;
}

/** Stable block ids from Notion ids, so a re-import produces the same ids. */
export class BlockIds {
  private used = new Map<string, number>();

  from(notionId: string): string {
    const base = `blk_${notionId.replace(/-/g, '')}`;
    const count = (this.used.get(base) ?? 0) + 1;
    this.used.set(base, count);
    return count === 1 ? base : `${base}_${count}`;
  }
}

export function compactId(notionId: string): string {
  return notionId.replace(/-/g, '').toLowerCase();
}
