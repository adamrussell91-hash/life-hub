/**
 * What students get: a draft recording stays with the teacher, and tray notes
 * no event used are dropped. Keep in step with the plain JS copy in
 * netlify/functions/_shared/teaching-student.mjs (stripExplainerForStudent).
 */
import type { ExplainerBlock } from '@/schemas/block';

export function stripExplainerForStudent<B extends Pick<ExplainerBlock, 'content'>>(block: B): B {
  const content = block.content;
  const recording = content.recording && content.recording.status !== 'draft' ? content.recording : undefined;
  const used = new Set<string>();
  for (const ev of recording?.events ?? []) if (ev.kind === 'note' && ev.tray_id) used.add(ev.tray_id);
  const { recording: _rec, ...rest } = content;
  return {
    ...block,
    content: {
      ...rest,
      tray: (content.tray ?? []).filter((note) => used.has(note.id)),
      ...(recording ? { recording } : {})
    }
  };
}
