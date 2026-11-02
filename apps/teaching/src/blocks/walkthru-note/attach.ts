import type { Block } from '@/schemas/block';
import { techniqueById } from '../../../../../packages/walkthrus/catalogue.mjs';

/**
 * The WalkThru a teacher chose for a block, kept in its settings. Nothing attaches on its own.
 * The field is teacher-only: the student feed and Display drop it (see visibility.ts).
 */
export function attachedTechniques(block: Pick<Block, 'settings'>): string[] {
  const id = (block.settings as Record<string, unknown> | undefined)?.walkthru;
  return typeof id === 'string' && techniqueById(id)?.kind === 'technique' ? [id] : [];
}

/** The WalkThru a Voice block's oracy type is built on, offered first in the picker. */
const ORACY_TECHNIQUES = {
  speech: 'w2-oracy-public-speaking',
  debate: 'w1-oracy-debating',
  presentation: 'w2-oracy-presentations',
  recite: 'w2-oracy-recitation-and-performance'
} as const;

/** The technique to offer for this block, or null. An offer only: the teacher still has to pick it. */
export function suggestedTechnique(block: Block): string | null {
  if (block.block_type !== 'audio' || !block.content.oracy) return null;
  const id = ORACY_TECHNIQUES[block.content.oracy];
  return techniqueById(id) ? id : null;
}

/** The block with this WalkThru on it, or with none when `id` is null. */
export function withTechnique<T extends Block>(block: T, id: string | null): T {
  const { walkthru: _old, ...settings } = (block.settings ?? {}) as Record<string, unknown>;
  return { ...block, settings: id ? { ...settings, walkthru: id } : settings };
}
