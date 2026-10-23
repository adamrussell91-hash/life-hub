import { apiPost } from '@/api/client';
import { startAiJob, type StartAiJobPayload, type StartAiJobResult } from '@/ai/jobs-client';
import { openOverlay } from '@/markbook/overlay';
import { button, el, labelled } from '@/quiz/dom';
import { FOLLOW_UP } from './constants';
import { mixUps } from './patterns';
import type { Evidence } from './types';
import { mixUpText } from './views/parts';

/** The job API refuses messages longer than this. */
const BRIEF_MAX = 8000;

export type BriefInput = {
  tag: string;
  students: string[];
  evidence: Evidence[];
  label: (tag: string) => string;
  codeLabel: (id: string) => string;
  sourceTitle: string;
  count: number;
};

/**
 * What Ann is told: the tag, the mistakes these students made on it, how many
 * questions. No names or initials leave the app. "Go ahead" skips Ann's own
 * plan step, because the teacher has just confirmed this one.
 */
export function annBrief(input: BriefInput): string {
  const group = new Set(input.students);
  const kind = input.tag.slice(0, input.tag.indexOf(':')) as Parameters<typeof mixUps>[1];
  const mine = input.evidence.filter((e) => (group.size ? group.has(e.student) : true) && e.tags.includes(input.tag));
  const mistakes = mixUps(mine, kind)
    .filter((m) => m.tag === input.tag || !m.tag)
    .slice(0, 6)
    .map((m) => `- ${mixUpText(m, input.label, input.codeLabel)} (${m.count} ${m.count === 1 ? 'student' : 'students'})`);
  const name = input.label(input.tag);
  const brief = [
    'Go ahead and build without a plan: the teacher has already confirmed this follow-up.',
    `Build a short follow-up quiz of ${input.count} questions on ${name}.`,
    `It follows up the quiz "${input.sourceTitle}".`,
    mistakes.length ? `The students who will sit it made these mistakes:\n${mistakes.join('\n')}` : `These students scored low on ${name}.`,
    'Aim each question at one of those mistakes. Where two techniques were mixed up, make students choose between them, or find the right one in a short passage. Use quote_technique or spot_technique for techniques, and multiple choice otherwise.',
    'Keep each question to a single technique or idea, so the results show exactly what each student knows.'
  ].join('\n\n');
  return brief.length > BRIEF_MAX ? brief.slice(0, BRIEF_MAX) : brief;
}

export type FollowUpRequest = { sourceLessonId: string; unitId: string; flagId: string | null; title: string; students: string[]; brief: string };
export type FollowUpDeps = {
  createLesson: (body: Record<string, unknown>) => Promise<{ id: string }>;
  startJob: (payload: StartAiJobPayload) => Promise<StartAiJobResult>;
};

export const httpFollowUpDeps: FollowUpDeps = {
  createLesson: (body) => apiPost<{ id: string }>('/api/lessons', body),
  startJob: (payload) => startAiJob(payload)
};

/** Creates the follow-up lesson straight after the original, then starts Ann on it. Returns the new lesson id. */
export async function startFollowUp(req: FollowUpRequest, deps: FollowUpDeps = httpFollowUpDeps): Promise<string> {
  const lesson = await deps.createLesson({
    title: req.title,
    unit_id: req.unitId,
    pedagogical_mode: 'quiz',
    after_lesson_id: req.sourceLessonId,
    quiz: { for_students: req.students, follow_up_of: req.sourceLessonId, ...(req.flagId ? { follow_up_flag: req.flagId } : {}), confidence: true }
  });
  await deps.startJob({ lesson_id: lesson.id, agent: 'ann', scope: 'lesson', message: req.brief });
  return lesson.id;
}

export type PlanSheetOptions = {
  sourceLessonId: string;
  sourceTitle: string;
  unitId: string;
  flagId: string | null;
  tag: string;
  students: Array<{ id: string; name: string; initials: string }>;
  /** Ticked to start with. */
  chosen: string[];
  evidence: Evidence[];
  label: (tag: string) => string;
  codeLabel: (id: string) => string;
  onDone: (lessonId: string) => void;
  deps?: FollowUpDeps;
};

/** The plan to confirm before Ann runs: tags, students, size, what Ann sees, the cost. */
export function openFollowUpPlan(o: PlanSheetOptions): HTMLElement {
  const sheet = el('div', 'mb-sheet ev-plan');
  const heading = el('h3', 'mb-form__title', `Follow-up quiz: ${o.label(o.tag)}`);
  heading.id = `ev-plan-${Math.random().toString(36).slice(2, 8)}`;
  const picked = new Set(o.chosen);
  const list = el('fieldset', 'ev-plan__students');
  list.append(el('legend', 'mb-form__label', 'Who sits it'));
  for (const s of o.students) {
    const row = el('label', 'ev-plan__student');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = picked.has(s.id);
    box.addEventListener('change', () => (box.checked ? picked.add(s.id) : picked.delete(s.id)));
    row.append(box, ` ${s.initials} · ${s.name}`);
    list.append(row);
  }
  const count = el('input', 'mb-form__input');
  count.type = 'number';
  count.min = String(FOLLOW_UP.min);
  count.max = String(FOLLOW_UP.max);
  count.value = String(FOLLOW_UP.defaultCount);
  const size = (): number => Math.min(FOLLOW_UP.max, Math.max(FOLLOW_UP.min, Math.round(Number(count.value)) || FOLLOW_UP.defaultCount));
  const preview = el('pre', 'ev-plan__brief');
  const brief = (): string =>
    annBrief({ tag: o.tag, students: [...picked], evidence: o.evidence, label: o.label, codeLabel: o.codeLabel, sourceTitle: o.sourceTitle, count: size() });
  const refresh = (): void => {
    preview.textContent = brief();
  };
  refresh();
  count.addEventListener('input', refresh);
  list.addEventListener('change', refresh);
  const error = el('p', 'mb-form__error');
  error.setAttribute('role', 'alert');
  const opened = { close: () => {} };
  let running = false;
  const draft = button('Draft', 'primary', async function () {
    if (running) return;
    if (!picked.size && o.students.length) {
      error.textContent = 'Tick at least one student.';
      return;
    }
    running = true;
    this.disabled = true;
    error.textContent = '';
    try {
      const id = await startFollowUp(
        { sourceLessonId: o.sourceLessonId, unitId: o.unitId, flagId: o.flagId, title: `Follow-up: ${o.label(o.tag)}`, students: [...picked], brief: brief() },
        o.deps
      );
      opened.close();
      o.onDone(id);
    } catch (e) {
      error.textContent = e instanceof Error && e.message ? e.message : 'Couldn’t start the follow-up. Try again.';
      running = false;
      this.disabled = false;
    }
  });
  const cancel = button('Cancel', 'secondary', () => opened.close());
  const actions = el('div', 'mb-form__actions');
  actions.append(cancel, draft);
  sheet.append(
    heading,
    el('p', 'mb__empty', `Ann drafts a new lesson after “${o.sourceTitle}”, only for the students ticked. You review it before publishing.`),
    list,
    labelled('Questions', count),
    el('h4', 'mb-form__label', 'What Ann is told (no names)'),
    preview,
    el('p', 'mb__empty', `Cost: ${FOLLOW_UP.cost}, based on past Ann quiz builds.`),
    error,
    actions
  );
  const handle = openOverlay(sheet, { labelledBy: heading.id });
  opened.close = handle.close;
  return sheet;
}
