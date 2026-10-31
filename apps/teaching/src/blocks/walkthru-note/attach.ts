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

/** The block with this WalkThru on it, or with none when `id` is null. */
export function withTechnique<T extends Block>(block: T, id: string | null): T {
  const { walkthru: _old, ...settings } = (block.settings ?? {}) as Record<string, unknown>;
  return { ...block, settings: id ? { ...settings, walkthru: id } : settings };
}
