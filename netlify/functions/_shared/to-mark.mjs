/**
 * What is waiting for feedback, across every class: each Markbook task linked
 * to a lesson block, with how many students handed in and how many are still
 * to be returned. Oldest waiting first.
 */
import { piecesAction } from './piece-feedback.mjs';
import { readBook } from './markbook.mjs';
import { loadRoster } from './class-claims.mjs';
import { listBlobKeys } from './blobs-list.mjs';
import { CLASS_PREFIX } from './teaching-blobs.mjs';

export const LATE_DAYS = 7;

async function listClassIds(store) {
  const keys = await listBlobKeys(store, CLASS_PREFIX);
  return keys.map((key) => key.slice(CLASS_PREFIX.length)).filter((id) => id && !id.includes('/'));
}

export async function toMarkQueue(store, deps = {}) {
  const now = deps.now ? deps.now() : Date.now();
  const tasks = [];
  for (const classId of await listClassIds(store)) {
    const roster = await loadRoster(store, classId);
    if (!roster?.students.length || (roster.cls.status && roster.cls.status !== 'active')) continue;
    const { book } = await readBook(store, classId);
    for (const column of book.columns.filter((c) => c.kind === 'assessment' && c.piece)) {
      const { students } = await piecesAction(store, classId, { action: 'list', column_id: column.id });
      const waiting = students.filter((s) => s.status === 'waiting' || s.status === 'marking');
      const handed = students.filter((s) => s.handed_in_at);
      if (!handed.length) continue;
      const oldest_at = waiting.map((s) => s.handed_in_at).sort()[0] ?? null;
      tasks.push({
        class_id: classId, class_title: roster.cls.display_name || roster.cls.title || 'Class', column_id: column.id, title: column.title, lesson_id: column.piece.lesson_id, block_id: column.piece.block_id,
        waiting: waiting.length, handed_in: handed.length, roster: students.length, oldest_at,
        late: Boolean(oldest_at) && now - Date.parse(oldest_at) >= LATE_DAYS * 86400000
      });
    }
  }
  tasks.sort((a, b) => (b.waiting > 0) - (a.waiting > 0) || String(a.oldest_at).localeCompare(String(b.oldest_at)));
  return { tasks };
}
