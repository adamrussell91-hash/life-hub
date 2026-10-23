import { describe, it, expect, vi } from 'vitest';
import { quizProposalIssues } from '@/ai/quiz-proposal';
import { checkProposalCall } from '@/ai/job-runner';
import { applyProposalToLesson } from '@/ai/apply-proposal';
import { BLOCK_BUILD_RECIPES } from '@/ai/block-recipes';
import { buildAiLessonContext } from '@/ai/context';
import { emptySearchPack } from '@/ai/search-pack';
import { startTutorial } from '@/tutorial/draft';
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

  it('shows Ann the groups without students, unsure marks, evidence, notes or class', () => {
    const withGroups = { ...lesson, tutorial: { class_id: 'class_secret', tag: 'tech:cyclical', source_lesson_id: 'quiz1', groups: [{ ...groups[0]!, notes: 'Private plan' }, groups[1]!] } } as Lesson;
    const context = buildAiLessonContext({ agentName: 'Ann', protocol: '', scope: 'lesson', selectedBlockId: null, searchPack: emptySearchPack(''), lesson: withGroups, fullLesson: true });
    expect(context).toContain('## Lesson JSON');
    expect(context).toContain('Re-tells the plot');
    expect(context).toContain('tech:cyclical');
    for (const hidden of ['st_ann', 'st_cy', 'st_ed', 'goes back to the start', 'flashback”', 'class_secret', 'Private plan', '"evidence"', '"unsure"', '"students"']) {
      expect(context).not.toContain(hidden);
    }
  });

  it('keeps a tab’s or exit check’s markers when a redraft drops them', () => {
    const built = lessonOf([heading, tab([]), exit([])]);
    const bare = (id: string, blocks: unknown[]) => ({ id, ...meta, block_type: 'section', content: { title: 'Redrafted', blocks } });
    // The quiz check counts the dropped-marker exit as an exit check too.
    const proposal = { kind: 'replace_blocks', blocks: [bare('tA', [heading]), bare('eA', [mc('q1')])] } as never;
    expect(quizProposalIssues(proposal, built)).toEqual([]);
    const applied = applyProposalToLesson(built, proposal, () => 'n1');
    if (!applied.ok) throw new Error('not applied');
    const [, t, e] = applied.lesson.blocks as Block[];
    expect(t!.block_type === 'section' && [t.content.tutorial_group, t.content.tutorial_exit]).toEqual(['ga', undefined]);
    expect(e!.block_type === 'section' && [e.content.tutorial_group, e.content.tutorial_exit]).toEqual(['ga', true]);
    const viaSection = applyProposalToLesson(built, { kind: 'replace_section', section_id: 'eA', section: bare('eA', [mc('q1')]) } as never, () => 'n2');
    const e2 = viaSection.ok ? (viaSection.lesson.blocks as Block[])[2]! : null;
    expect(e2?.block_type === 'section' && e2.content.tutorial_exit).toBe(true);
  });

  it('tells Ann what goes in A second look and how blanks count', () => {
    expect(BLOCK_BUILD_RECIPES).toContain('A second look');
    expect(BLOCK_BUILD_RECIPES).toContain('re-explanation');
    expect(BLOCK_BUILD_RECIPES).toContain('0-based');
  });

  it('creates the lesson with its skeleton and starts no Ann job', async () => {
    const createLesson = vi.fn(async (_b: Record<string, unknown>) => ({ id: 'tut1' }));
    const id = await startTutorial({ unitId: 'u1', afterLessonId: 'quiz1', classId: 'class1', tag: 'tech:cyclical', tagLabel: 'Cyclical structure', groups: groups.slice(0, 1) }, { createLesson });
    expect(id).toBe('tut1');
    expect(createLesson).toHaveBeenCalledTimes(1);
    const body = createLesson.mock.calls[0]![0];
    expect(body).toMatchObject({ title: 'Tutorial: Cyclical structure', pedagogical_mode: 'tutorial', unit_id: 'u1', after_lesson_id: 'quiz1', tutorial: { class_id: 'class1', tag: 'tech:cyclical', source_lesson_id: 'quiz1' } });
    expect((body.blocks as unknown[]).length).toBe(3);
    expect(BlockSchema.array().safeParse(body.blocks).success).toBe(true);
    // No notes: the tab is the goal heading and With teacher only.
    const tabBlocks = ((body.blocks as Block[])[1] as Extract<Block, { block_type: 'section' }>).content.blocks as Block[];
    expect(tabBlocks.map((b) => b.block_type)).toEqual(['heading', 'with_teacher']);
  });

  it('puts a group’s notes at the top of its tab as a teacher-only note', () => {
    let n = 0;
    const blocks = tutorialSkeleton([{ ...groups[0]!, notes: 'Start with the clock poem.\n\nUse <b>two</b> extracts.' }, groups[1]!], () => `s${++n}`);
    expect(BlockSchema.array().safeParse(blocks).success).toBe(true);
    const tabA = (blocks[1] as Extract<Block, { block_type: 'section' }>).content.blocks as Block[];
    const note = tabA[0]!;
    expect(note.block_type).toBe('teacher_note');
    expect(note.visibility).toBe('teacher_only');
    expect(note.block_type === 'teacher_note' && note.content.html).toBe('<p>Start with the clock poem.</p><p>Use &lt;b&gt;two&lt;/b&gt; extracts.</p>');
    const tabB = (blocks[3] as Extract<Block, { block_type: 'section' }>).content.blocks as Block[];
    expect(tabB.some((b) => b.block_type === 'teacher_note')).toBe(false);
  });
});
