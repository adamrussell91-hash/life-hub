import { el } from '@/blocks/peer-feedback-ui';
import { skillPath } from '@/progress/skill-path';
import { placeName } from '@/progress/story-text';
import type { SkillRow } from '@/progress/types';
import { loadOwnSkills, type OwnSkills } from '@/skills/rungs-api';
import '@/progress/progress.css';

/**
 * Before a student records: where they sit on each Speaking skill from their
 * returned work, and the move that takes them to the next rung. Their own rows
 * only. Nothing shows until a teacher has placed them on a speaking rung.
 */

export function speakingWhere(rows: readonly SkillRow[]): HTMLElement | null {
  if (!rows.length) return null;
  const box = el('section', 'voice-where');
  box.append(el('h4', 'voice-where__title', 'Your speaking so far'));
  for (const r of rows) {
    const row = el('div', 'voice-where__row');
    row.append(el('p', 'voice-where__name', r.name), skillPath(r));
    if (r.next_move && r.next_rung) {
      const next = el('p', 'voice-where__next');
      next.append(el('b', undefined, `To reach ${placeName(r.next_rung)}: `), r.next_move);
      row.append(next);
    }
    box.append(row);
  }
  return box;
}

/** Fetches the student's speaking rows once. Resolves to none for a device with no initials, or on any error. */
export function speakingRowsLoader(classId: string | undefined, call: (classId: string) => Promise<OwnSkills> = (id) => loadOwnSkills(id, 'speaking')): Promise<SkillRow[]> {
  if (!classId) return Promise.resolve([]);
  return call(classId).then(
    (r) => (r.need === 'initials' ? [] : (r.skills ?? []).flatMap((g) => g.rows)),
    () => []
  );
}
