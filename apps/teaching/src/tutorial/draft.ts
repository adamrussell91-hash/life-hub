import { apiPost } from '@/api/client';
import { tutorialSkeleton } from './model';
import type { TutorialGroup } from './schema';

/**
 * Creates a tutorial lesson from the planned groups. Ann doesn't draft it: the
 * skeleton carries each group's notes as a teacher note at the top of its tab,
 * and the teacher builds from there.
 */

export type TutorialDeps = {
  createLesson: (body: Record<string, unknown>) => Promise<{ id: string }>;
};
export const httpTutorialDeps: TutorialDeps = {
  createLesson: (body) => apiPost<{ id: string }>('/api/lessons', body)
};

export type StartTutorialInput = { unitId: string; afterLessonId: string; classId: string; tag: string; tagLabel: string; groups: TutorialGroup[] };

/** Creates the tutorial straight after its quiz, with its skeleton. Returns the lesson id. */
export async function startTutorial(input: StartTutorialInput, deps: TutorialDeps = httpTutorialDeps): Promise<string> {
  let n = 0;
  const stamp = Date.now().toString(36);
  const lesson = await deps.createLesson({
    title: `Tutorial: ${input.tagLabel}`,
    unit_id: input.unitId,
    pedagogical_mode: 'tutorial',
    after_lesson_id: input.afterLessonId,
    blocks: tutorialSkeleton(input.groups, () => `tut-${stamp}-${++n}`),
    tutorial: { class_id: input.classId, tag: input.tag, source_lesson_id: input.afterLessonId, groups: input.groups }
  });
  return lesson.id;
}
