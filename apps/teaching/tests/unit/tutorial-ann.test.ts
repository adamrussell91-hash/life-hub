import { describe, it, expect, vi } from 'vitest';
import { quizProposalIssues } from '@/ai/quiz-proposal';
import { checkProposalCall } from '@/ai/job-runner';
import { applyProposalToLesson } from '@/ai/apply-proposal';
import { BLOCK_BUILD_RECIPES } from '@/ai/block-recipes';
import { buildAiLessonContext } from '@/ai/context';
import { FollowUpStartError } from '@/evidence/follow-up';
import { AiJobConflictError } from '@/ai/jobs-client';
import { emptySearchPack } from '@/ai/search-pack';
import { draftBrief, startTutorial, TutorialStartError } from '@/tutorial/draft';
import { tutorialSkeleton } from '@/tutorial/model';
import { BlockSchema, type Block } from '@/schemas/block';
import type { Lesson } from '@/schemas/lesson';
import type { TutorialGroup } from '@/tutorial/schema';

const NOW = '2026-10-23T00:00:00.000Z';
const meta = { type: 'block', variant: 'medium', visibility: 'student_teacher', created_at: NOW, updated_at: NOW, schema_version: 1 };
const mc = (id: string) => ({
  id,
  ...meta,
  block_type: 'quiz_question',
  content: { question: { id, kind: 'multiple_choice', prompt: 'Which?', marks: 1, options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correct: ['a'] } }
});
const exit = (blocks: unknown[]) => ({ id: 'eA', ...meta, block_type: 'section', content: { title: 'Exit', tutorial_group: 'ga', tutorial_exit: true, blocks } });
const tab = (blocks: unknown[]) => ({ id: 'tA', ...meta, block_type: 'section', content: { title: 'Re-tells', tutorial_group: 'ga', blocks } });
const heading = { id: 'h1', ...meta, variant: 'section', block_type: 'heading', content: { text: 'Demo' } };

const lessonOf = (blocks: unknown[] = []) =>
  ({
    id: 'tut1',
    type: 'lesson',
    title: 'Tutorial: Cyclical structure',
    slug: 'tutorial',
    status: 'active',
    unit_id: 'u1',
    sequence: 1,
    pedagogical_mode: 'tutorial',
    blocks,
    created_at: NOW,
    updated_at: NOW,
    schema_version: 1
  }) as unknown as Lesson;
const lesson = lessonOf();

const longQuote = `Said “it goes back to the start” ${'and then more words '.repeat(20)}`;
const groups: TutorialGroup[] = [
  {
    id: 'ga',
    name: 'Re-tells',
    why: 'Re-tells the plot',
    goal: 'Today: the effect',
    gap_type: 'knowledge',
    students: ['st_ann', 'st_cy'],
    unsure: ['st_cy'],
    evidence: [
      { student: 'st_ann', quote: longQuote },
      { student: 'st_cy', quote: 'Picked “flashback”' }
    ]
  },
  { id: 'gb', name: 'Mixes up', why: 'Calls it a flashback', goal: 'Today: telling the two apart', gap_type: 'mix_up', students: ['st_ed'], evidence: [] }
];

describe('Ann in a tutorial', () => {
  it('allows quiz questions in an exit check section and nowhere else', () => {
    expect(quizProposalIssues({ kind: 'replace_section', section_id: 'eA', section: exit([mc('q1')]) } as never, lesson)).toEqual([]);
    const loose = quizProposalIssues({ kind: 'insert_blocks', position: 'below', blocks: [mc('q2')] } as never, lesson);
    expect(loose.join(' ')).toContain('exit check');
    const inTab = quizProposalIssues({ kind: 'replace_section', section_id: 'tA', section: tab([mc('q3')]) } as never, lesson);
    expect(inTab.join(' ')).toContain('exit check');
  });

  it('allows a question replaced or inserted inside an existing exit check', () => {
    const built = lessonOf([heading, exit([mc('q1')])]);
    expect(quizProposalIssues({ kind: 'replace_block', block_id: 'q1', block: mc('q1') } as never, built)).toEqual([]);
    expect(quizProposalIssues({ kind: 'insert_blocks', anchor_block_id: 'q1', position: 'below', blocks: [mc('q4')] } as never, built)).toEqual([]);
    expect(quizProposalIssues({ kind: 'insert_blocks', anchor_block_id: 'h1', position: 'below', blocks: [mc('q5')] } as never, built).join(' ')).toContain('exit check');
  });

  it('never lets set_mode turn a tutorial into a quiz', () => {
    const issues = quizProposalIssues({ kind: 'insert_blocks', position: 'below', blocks: [mc('q2')], set_mode: 'quiz' } as never, lesson);
    expect(issues.join(' ')).toContain('set_mode');
    const applied = applyProposalToLesson(lessonOf([heading]), { kind: 'insert_blocks', anchor_block_id: 'h1', position: 'below', blocks: [heading as never], set_mode: 'quiz' }, () => 'n1');
    expect(applied.ok && applied.lesson.pedagogical_mode).toBe('tutorial');
  });

  it('passes a full replace_section of an exit check through the job runner check', () => {
    const built = lessonOf(tutorialSkeleton(groups.slice(0, 1), (() => { let n = 0; return () => `s${++n}`; })()));
    const exitId = (built.blocks as Block[]).find((b) => b.block_type === 'section' && b.content.tutorial_exit)!.id;
    const section = { ...exit([mc('q1'), mc('q2')]), id: exitId };
    const result = checkProposalCall('propose_replace_section', { section_id: exitId, section }, built);
    expect(typeof result).not.toBe('string');
  });

  it('teaches Ann the tutorial recipe', () => {
    for (const word of ['faded_example', 'with_teacher', 'tutorial_exit', 'contrast pair', 'No hinge_question']) expect(BLOCK_BUILD_RECIPES).toContain(word);
    expect(buildAiLessonContext({ agentName: 'Ann', protocol: '', scope: 'lesson', selectedBlockId: null, searchPack: emptySearchPack(''), lesson })).toContain('Lesson type: tutorial');
  });

  it('briefs Ann per group with section ids and no names', () => {
    const brief = draftBrief({ tagLabel: 'Cyclical structure', groups, sections: { common: 'h1', tabs: { ga: 'tA', gb: 'tB' }, exits: { ga: 'eA', gb: 'eB' } } });
    for (const id of ['tA', 'eA', 'tB', 'eB', 'h1']) expect(brief).toContain(id);
    expect(brief).toContain('Re-tells the plot');
    expect(brief).toContain('faded_example');
    expect(brief).toContain('contrast pair');
    for (const id of ['st_ann', 'st_cy', 'st_ed']) expect(brief).not.toContain(id);
    expect(brief).not.toContain(longQuote.trim());
    const quoteLine = brief.split('\n').find((l) => l.includes('goes back to the start'))!;
    expect(quoteLine.length).toBeLessThanOrEqual(2 + 160);
  });

  it('creates the lesson with its skeleton, then starts Ann', async () => {
    const createLesson = vi.fn(async (_b: Record<string, unknown>) => ({ id: 'tut1' }));
    const startJob = vi.fn(async () => ({}) as never);
    const id = await startTutorial({ unitId: 'u1', afterLessonId: 'quiz1', classId: 'class1', tag: 'tech:cyclical', tagLabel: 'Cyclical structure', groups: groups.slice(0, 1) }, { createLesson, startJob });
    expect(id).toBe('tut1');
    const body = createLesson.mock.calls[0]![0];
    expect(body).toMatchObject({ pedagogical_mode: 'tutorial', unit_id: 'u1', after_lesson_id: 'quiz1', tutorial: { class_id: 'class1', tag: 'tech:cyclical', source_lesson_id: 'quiz1' } });
    expect((body.blocks as unknown[]).length).toBe(3);
    expect(BlockSchema.array().safeParse(body.blocks).success).toBe(true);
    expect(startJob).toHaveBeenCalledWith(expect.objectContaining({ lesson_id: 'tut1', agent: 'ann', scope: 'lesson' }));
    const message = (startJob.mock.calls[0] as unknown as [{ message: string }])[0].message;
    expect(message).not.toContain('st_ann');
  });

  it('a job already running counts as started', async () => {
    const createLesson = vi.fn(async () => ({ id: 'tut1' }));
    const startJob = vi.fn(async () => {
      throw new AiJobConflictError('job1', 'working');
    });
    await expect(startTutorial({ unitId: 'u1', afterLessonId: 'quiz1', classId: 'class1', tag: 't', tagLabel: 'T', groups }, { createLesson, startJob })).resolves.toBe('tut1');
  });

  it('keeps the lesson id and brief when Ann fails to start, so the sheet can retry', async () => {
    const createLesson = vi.fn(async () => ({ id: 'tut9' }));
    const startJob = vi.fn(async () => {
      throw new Error('Out of budget');
    });
    const err = await startTutorial({ unitId: 'u1', afterLessonId: 'quiz1', classId: 'class1', tag: 't', tagLabel: 'T', groups }, { createLesson, startJob }).catch((e) => e);
    expect(err).toBeInstanceOf(TutorialStartError);
    expect(err).toBeInstanceOf(FollowUpStartError);
    expect(err.lessonId).toBe('tut9');
    expect(err.message).toBe('Out of budget');
    expect(err.brief).toContain('reteaches T');
    expect(err.brief).not.toContain('st_ann');
  });
});
