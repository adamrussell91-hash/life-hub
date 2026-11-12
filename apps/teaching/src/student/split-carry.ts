import type { PublishedLesson } from '@/schemas/published-lesson';

const ROOT = 'teaching-hub.activity.';

/** Every block id in the lesson, inside sections, columns and tabs too. */
function blockIds(blocks: unknown, out = new Set<string>(), depth = 0): Set<string> {
  if (!Array.isArray(blocks) || depth > 8) return out;
  for (const b of blocks as Array<{ id?: unknown; content?: Record<string, unknown> }>) {
    if (!b || typeof b !== 'object') continue;
    if (typeof b.id === 'string') out.add(b.id);
    const c = b.content ?? {};
    blockIds(c.blocks, out, depth + 1);
    for (const key of ['columns', 'tabs'] as const) {
      const list = c[key];
      if (Array.isArray(list)) for (const x of list) blockIds((x as { blocks?: unknown })?.blocks, out, depth + 1);
    }
  }
  return out;
}

/**
 * A lesson split out of another keeps the same block ids, but a student's answers sit on
 * their device under the old lesson's id. Copy them across, once, so the boxes aren't empty.
 * Never overwrites anything already saved for this lesson, and leaves the old copy alone.
 * Returns how many saved states were carried.
 */
export function carrySplitWork(lesson: Pick<PublishedLesson, 'lesson_id' | 'blocks' | 'split_from'>): number {
  const from = lesson.split_from;
  if (!from || from === lesson.lesson_id) return 0;
  let carried = 0;
  try {
    const ids = blockIds(lesson.blocks);
    const prefix = `${ROOT}${from}.`;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    for (const key of keys) {
      const rest = key.slice(prefix.length);
      const dot = rest.indexOf('.');
      const blockId = dot < 0 ? rest : rest.slice(0, dot);
      // Block ids can hold dots in older lessons: try the longest id that matches.
      const id = ids.has(blockId) ? blockId : [...ids].find((x) => rest === x || rest.startsWith(`${x}.`));
      if (!id) continue;
      const target = `${ROOT}${lesson.lesson_id}.${rest}`;
      if (localStorage.getItem(target) !== null) continue;
      const value = localStorage.getItem(key);
      if (value === null) continue;
      localStorage.setItem(target, value);
      carried++;
    }
  } catch {
    // No storage on this device (private mode, blocked): nothing to carry.
  }
  return carried;
}
