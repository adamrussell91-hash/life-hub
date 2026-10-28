import type { Block } from '@/schemas/block';
import { createBlock } from '@/blocks/create-block';
import { techniqueById } from '../../../../../packages/walkthrus/catalogue.mjs';

/**
 * A lesson with a WalkThru note for the technique on it: the one already there, or a new teacher-only
 * note appended. Used when the pattern monitor sends Adam to a class's next lesson (`?walkthru=<id>`).
 * Returns the same lesson object when nothing needed adding.
 */
export function withWalkthruNote<T extends { blocks: Block[] }>(lesson: T, techniqueId: string, blockId: string): T {
  const entry = techniqueById(techniqueId);
  if (!entry || entry.kind !== 'technique') return lesson;
  const has = lesson.blocks.some((b) => b.block_type === 'teacher_note' && (b.content as { walkthru?: { id?: string } }).walkthru?.id === techniqueId);
  if (has) return lesson;
  const note = {
    ...createBlock('teacher_note', blockId),
    content: { title: entry.name, html: '', walkthru: { set: entry.set, id: entry.id, jots: {} } }
  } as Block;
  return { ...lesson, blocks: [...lesson.blocks, note] };
}
