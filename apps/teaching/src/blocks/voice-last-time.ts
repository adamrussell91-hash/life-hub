import { apiPost } from '@/api/client';
import { el } from '@/blocks/peer-feedback-ui';
import { focusStep, type FeedbackCode } from '@/blocks/feedback-codes';
import { deviceToken } from '@/quiz/dom';
import type { SkillRow } from '@/progress/types';
import { doThisBox, type NextStep } from '@/student/next-step';

/**
 * Before a new viva: one bold "Do this" line from the student's returned
 * vivas, the same as a writing box, and a "This time I'll work on" tick
 * under the dot points that the teacher sees when marking.
 */

export type PatternMark = 'need' | 'strength' | null;
export type VivaHistory = {
  count: number;
  last: {
    lesson_id: string;
    title: string;
    date: string;
    comment: string;
    next_step: string | null;
    tags: Array<{ code_id: string; positive: boolean }>;
  } | null;
  pattern: Array<{ code_id: string; marks: PatternMark[] }>;
  codes?: FeedbackCode[];
};
export type VoiceStart = { rows: SkillRow[]; vivas: VivaHistory | null };

type OwnStart = { need: 'initials' | null; skills?: Array<{ rows: SkillRow[] }>; vivas?: VivaHistory };

/**
 * One call for everything a Voice block shows before recording: the Speaking
 * rows, and for a viva the student's last viva and pattern. Resolves to
 * nothing for a device with no initials, or on any error.
 */
export function voiceStartLoader(
  classId: string | undefined,
  lessonId: string,
  wants: { speaking: boolean; vivas: boolean },
  call: (classId: string, body: Record<string, unknown>) => Promise<OwnStart> = (id, body) =>
    apiPost<OwnStart>(`/api/published/profile/${encodeURIComponent(id)}`, { ...body, class_token: deviceToken(`class:${id}`) })
): Promise<VoiceStart> {
  const none: VoiceStart = { rows: [], vivas: null };
  if (!classId || (!wants.speaking && !wants.vivas)) return Promise.resolve(none);
  return call(classId, { action: 'skills', strand: 'speaking', ...(wants.vivas ? { vivas: true, lesson_id: lessonId } : {}) }).then(
    (r) => {
      if (r.need === 'initials') return none;
      return { rows: wants.speaking ? (r.skills ?? []).flatMap((g) => g.rows) : [], vivas: wants.vivas && r.vivas?.last ? r.vivas : null };
    },
    () => none
  );
}

const STEP_COLOURS = new Set(['blue', 'sage', 'peach', 'gold', 'lilac']);

/**
 * The one thing a viva block tells the student to do, the same rule as a
 * writing box: the teacher's own next step from the last viva first; else, of
 * the codes flagged in the last viva, the one flagged in most of the recent
 * ones; else, with nothing flagged last time, a code gone from the last two
 * ("keep doing this"). Null with no viva back.
 */
export function vivaStep(history: VivaHistory | null, href?: string): NextStep | null {
  const last = history?.last;
  if (!history || !last) return null;
  const codes = history.codes ?? [];
  const link = href ? { href } : {};
  const n = history.pattern[0]?.marks.length || 1;
  if (last.next_step?.trim()) return { code_id: '', code: '', colour: 'peach', line: last.next_step.trim(), why: { kind: 'do', hits: 0, of: n, unit: 'viva', ...link } };
  const needs = (marks: readonly PatternMark[]) => marks.filter((m) => m === 'need').length;
  const needHits = (id: string) => needs(history.pattern.find((r) => r.code_id === id)?.marks ?? ['need']);
  const stepFor = (id: string) => focusStep([{ code_id: id, positive: false }], codes);
  const flagged = [...new Set(last.tags.filter((t) => !t.positive).map((t) => t.code_id))].filter((id) => stepFor(id));
  const count = (id: string) => last.tags.filter((t) => t.code_id === id && !t.positive).length;
  const make = (id: string, kind: 'do' | 'keep', hits: number): NextStep => {
    const found = stepFor(id)!;
    return { code_id: id, code: found.code.code, colour: STEP_COLOURS.has(found.code.colour) ? found.code.colour : 'peach', line: found.line, why: { kind, hits, of: n, unit: 'viva', ...link } };
  };
  if (flagged.length) {
    const id = flagged.sort((a, b) => needHits(b) - needHits(a) || count(b) - count(a))[0]!;
    return make(id, 'do', needHits(id));
  }
  if (n < 3) return null;
  const gone = history.pattern.filter((r) => r.marks.slice(0, -2).includes('need') && !r.marks.slice(-2).includes('need') && stepFor(r.code_id));
  if (!gone.length) return null;
  const row = gone.sort((a, b) => needs(b.marks) - needs(a.marks))[0]!;
  return make(row.code_id, 'keep', needs(row.marks));
}

/** The Do this line above a viva's dot points, matching the writing boxes. Null with no viva back. */
export function vivaDoThis(history: VivaHistory | null, classId: string | undefined): HTMLElement | null {
  const step = vivaStep(history, classId ? `/s/classes/${encodeURIComponent(classId)}/profile?tab=returned` : undefined);
  return step ? doThisBox(step) : null;
}

/** "This time I'll work on…" under the dot points: a tick the student owns, sent with their take. */
export function goalTick(line: string, ticked: boolean, onChange: (ticked: boolean) => void, id: string): HTMLElement {
  const wrap = el('label', 'voice-goal');
  const box = el('input', 'voice-goal__box');
  box.type = 'checkbox';
  box.id = `voice-goal-${id}`;
  box.checked = ticked;
  box.addEventListener('change', () => onChange(box.checked));
  const text = el('span', 'voice-goal__text');
  text.append(el('b', undefined, 'This time I’ll work on: '), line, el('span', 'voice-goal__hint block-secondary', ' Tick it and your teacher sees it when marking.'));
  wrap.append(box, text);
  return wrap;
}
