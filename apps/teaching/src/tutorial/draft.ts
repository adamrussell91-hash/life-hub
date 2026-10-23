import { apiPost } from '@/api/client';
import { startAiJob } from '@/ai/jobs-client';
import { FollowUpStartError, startAnn, type FollowUpDeps } from '@/evidence/follow-up';
import { tutorialParts, tutorialSkeleton } from './model';
import type { TutorialGroup } from './schema';

/** The job API refuses messages longer than this. */
const BRIEF_MAX = 8000;
/** Evidence quotes are student answer text: keep each one short. */
const QUOTE_MAX = 160;
const QUOTES_PER_GROUP = 6;

export type DraftSections = { common: string; tabs: Record<string, string>; exits: Record<string, string> };

const clip = (text: string): string => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > QUOTE_MAX ? `${flat.slice(0, QUOTE_MAX - 1).trimEnd()}…` : flat;
};

/**
 * What Ann is told: each group's reason and goal, its evidence lines and which
 * section to fill. No student names or ids leave the app.
 */
export function draftBrief(input: { tagLabel: string; groups: readonly TutorialGroup[]; sections: DraftSections }): string {
  const build = (quotes: number): string => {
    const parts = [
      'Go ahead and build without a plan: the teacher has already confirmed this tutorial.',
      `This tutorial reteaches ${input.tagLabel} to small groups. Fill each group's tab and exit check below with propose_replace_section, one proposal per section, keeping each section's id, title, tutorial_group and tutorial_exit.`,
      `Common: a short teacher demo of ${input.tagLabel} on one extract, with tap-to-reveal steps. Add it with propose_insert_blocks below the heading ${input.sections.common}.`
    ];
    for (const g of input.groups) {
      const lines = g.evidence
        .slice(0, quotes)
        .map((e) => clip(e.quote))
        .filter(Boolean)
        .map((q) => `- ${q}`)
        .join('\n');
      parts.push(
        [
          `Group tab section ${input.sections.tabs[g.id] ?? '(missing)'} and exit check section ${input.sections.exits[g.id] ?? '(missing)'}.`,
          `Reason: ${g.why}`,
          `Goal shown to students: ${g.goal}`,
          `Gap type: ${g.gap_type === 'mix_up' ? 'mix_up: start with a contrast pair' : 'knowledge: start with a fully worked faded_example'}`,
          lines ? `What these students wrote or chose:\n${lines}` : ''
        ]
          .filter(Boolean)
          .join('\n')
      );
    }
    parts.push('Follow the tutorial recipe: faded_example steps, a with_teacher block, You do, and 2–3 exit check questions per group. No hinge_question in a tab.');
    return parts.join('\n\n');
  };
  let quotes = QUOTES_PER_GROUP;
  let brief = build(quotes);
  while (brief.length > BRIEF_MAX && quotes > 0) brief = build(--quotes);
  return brief.length > BRIEF_MAX ? brief.slice(0, BRIEF_MAX) : brief;
}

export type TutorialDeps = FollowUpDeps;
export const httpTutorialDeps: TutorialDeps = {
  createLesson: (body) => apiPost<{ id: string }>('/api/lessons', body),
  startJob: (payload) => startAiJob(payload)
};

/** The tutorial exists but Ann did not start. Carries the brief too, so "Try Ann again" resends the same one. */
export class TutorialStartError extends FollowUpStartError {
  readonly brief: string;
  constructor(lessonId: string, message: string, brief: string) {
    super(lessonId, message);
    this.name = 'TutorialStartError';
    this.brief = brief;
  }
}

export type StartTutorialInput = { unitId: string; afterLessonId: string; classId: string; tag: string; tagLabel: string; groups: TutorialGroup[] };

/** Creates the tutorial straight after its quiz, with a skeleton Ann fills, then starts Ann. Returns the lesson id. */
export async function startTutorial(input: StartTutorialInput, deps: TutorialDeps = httpTutorialDeps): Promise<string> {
  let n = 0;
  const stamp = Date.now().toString(36);
  const blocks = tutorialSkeleton(input.groups, () => `tut-${stamp}-${++n}`);
  const lesson = await deps.createLesson({
    title: `Tutorial: ${input.tagLabel}`,
    unit_id: input.unitId,
    pedagogical_mode: 'tutorial',
    after_lesson_id: input.afterLessonId,
    blocks,
    tutorial: { class_id: input.classId, tag: input.tag, source_lesson_id: input.afterLessonId, groups: input.groups }
  });
  const parts = tutorialParts(blocks);
  const sections: DraftSections = {
    common: parts.common[0]!.id,
    tabs: Object.fromEntries([...parts.tabs].map(([g, s]) => [g, s.id])),
    exits: Object.fromEntries([...parts.exits].map(([g, s]) => [g, s.id]))
  };
  const brief = draftBrief({ tagLabel: input.tagLabel, groups: input.groups, sections });
  try {
    await startAnn(lesson.id, brief, deps);
  } catch (e) {
    if (e instanceof FollowUpStartError) throw new TutorialStartError(e.lessonId, e.message, brief);
    throw e;
  }
  return lesson.id;
}
