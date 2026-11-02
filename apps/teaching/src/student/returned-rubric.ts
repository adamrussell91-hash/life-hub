import { el } from '@/quiz/dom';
import { placeName } from '@/progress/story-text';
import type { Place } from '@/progress/types';
import './returned-rubric.css';

/**
 * What a student reads of a returned rubric: where each skill sits, the
 * knowledge they used, and their next step. The server has already left out
 * pass checks, missed pieces and any AI read.
 */

export type ReturnedRubric = {
  skills?: { ref: string; name: string; rung: string }[];
  pieces_used?: { id: string; text: string | null }[];
  next_step?: string | null;
};

/** Null when there's nothing to say. */
export function returnedRubric(rubric: ReturnedRubric | null | undefined): HTMLElement | null {
  const skills = rubric?.skills ?? [];
  const pieces = (rubric?.pieces_used ?? []).filter((p) => p.text);
  const next = rubric?.next_step?.trim() ?? '';
  if (!skills.length && !pieces.length && !next) return null;
  const box = el('section', 'rr');
  if (next) {
    box.append(el('h3', 'rr-title', 'Your next step'), el('p', 'rr-next', next));
  }
  if (skills.length) {
    box.append(el('h3', 'rr-title', 'Your skills in this work'));
    const list = el('ul', 'rr-list');
    for (const s of skills) {
      const row = el('li', 'rr-skill');
      row.append(el('span', undefined, s.name), el('b', 'rr-rung', placeName(s.rung as Place)));
      list.append(row);
    }
    box.append(list);
  }
  if (pieces.length) {
    box.append(el('h3', 'rr-title', 'Knowledge you used'));
    const list = el('ul', 'rr-list');
    for (const p of pieces) list.append(el('li', 'rr-piece', p.text!));
    box.append(list);
  }
  return box;
}
