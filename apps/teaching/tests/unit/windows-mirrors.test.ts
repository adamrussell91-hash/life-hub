import { beforeEach, describe, expect, it } from 'vitest';
import { cloneBlockWithNewIds, createBlock } from '@/blocks/create-block';
import { withLens, withoutLens } from '@/blocks/lenses/attachments';
import { createLensEditor } from '@/blocks/lenses/lens-editor';
import { WINDOWS_MIRRORS, WINDOWS_MIRRORS_ID } from '@/blocks/lenses/windows-mirrors';
import { renderBlock } from '@/blocks/render';
import { BlockSchema, type Block } from '@/schemas/block';
import { LessonSchema } from '@/schemas/lesson';
import { toPublishedLesson } from '@/schemas/published-lesson';
import type { LensLevel } from '@/blocks/lenses/types';

const ISO = '2026-01-01T00:00:00.000Z';
const click = (root: ParentNode, text: string): void => {
  const button = [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text);
  expect(button, text).toBeTruthy();
  button!.click();
};
function questionBlock(): Block {
  const block = createBlock('question_set', 'qset');
  if (block.block_type !== 'question_set') throw Error('wrong block');
  block.content.questions[0]!.prompt = 'How does the novel explore sacrifice through Katniss?';
  return block;
}
const attach = (config: Record<string, unknown>, block: Block = questionBlock()) => withLens(block, WINDOWS_MIRRORS_ID, config);
const stepIds = (config: Record<string, unknown>, level: LensLevel, choice?: string, block: Block = questionBlock()) =>
  WINDOWS_MIRRORS.steps({ focus: '', mode: 'notes', ...config }, { level, choice, block }).map((s) => s.id);
beforeEach(() => { document.body.replaceChildren(); localStorage.clear(); });

describe('Windows & Mirrors paths', () => {
  it('walks each Answer with setting through its own steps at every level', () => {
    for (const level of ['support', 'core'] as const) {
      expect(stepIds({ answer_with: 'window' }, level)).toEqual(['moment', 'window']);
      expect(stepIds({ answer_with: 'mirror' }, level)).toEqual(['moment', 'mirror']);
      expect(stepIds({ answer_with: 'both' }, level)).toEqual(['moment', 'window', 'mirror']);
    }
    expect(stepIds({ answer_with: 'window' }, 'extend')).toEqual(['moment', 'window', 'closer']);
    expect(stepIds({ answer_with: 'both' }, 'extend')).toEqual(['moment', 'window', 'mirror', 'tension']);
    expect(stepIds({ answer_with: 'choice' }, 'core')).toEqual(['choose']);
    expect(stepIds({ answer_with: 'choice' }, 'core', 'mirror')).toEqual(['choose', 'moment', 'mirror']);
  });
  it('fills the focus into core prompts and keeps Support in plain language', () => {
    const core = WINDOWS_MIRRORS.steps({ focus: 'sacrifice', mode: 'notes', answer_with: 'window' }, { level: 'core', block: questionBlock() });
    expect(core[0]!.prompt).toContain('shows sacrifice');
    const support = WINDOWS_MIRRORS.steps({ focus: 'sacrifice', mode: 'notes', answer_with: 'window' }, { level: 'support', block: questionBlock() });
    expect(support[1]!.prompt).toBe('What is life like for people in this story? How is it different from your life?');
  });
  it('gives a frame at Support and Core, a challenge at Extend, and a Hunger Games example for each', () => {
    const write = (level: LensLevel, answer_with = 'both') =>
      WINDOWS_MIRRORS.writeItDown({ focus: '', mode: 'notes', answer_with }, { level, block: questionBlock() });
    expect(write('support').frame).toBe('___ shows ___, and it makes us think about ___.');
    expect(write('core').frame).toContain('reveals how ___ while forcing us to reflect on ___');
    expect(write('extend').frame).toBeUndefined();
    expect(write('extend').challenge).toContain('tension');
    for (const level of ['support', 'core', 'extend'] as const) {
      for (const path of ['window', 'mirror', 'both']) expect(write(level, path).example).toMatch(/Katniss|Collins/);
    }
    expect(write('core', 'mirror').checklist).toContain('Uses a mirror verb');
  });
  it('uses the teacher’s own example over the built-in one', () => {
    const write = WINDOWS_MIRRORS.writeItDown(
      { focus: '', mode: 'notes', examples: { core: 'Our own model' } }, { level: 'core', block: questionBlock() });
    expect(write.example).toBe('Our own model');
  });
});

describe('student view', () => {
  it('lets students choose their lens, then follows that path to Write it down', () => {
    const view = renderBlock(attach({ answer_with: 'choice' }), 'student', { lessonId: 'lesson' });
    document.body.append(view);
    view.querySelector<HTMLButtonElement>('.kaplan-chip')!.click();
    const next = () => [...view.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Next step')!;
    expect(next().disabled).toBe(true);
    const progress = () => [...view.querySelectorAll<HTMLButtonElement>('.kaplan-progress__step')];
    expect(progress()).toHaveLength(5);
    expect(progress()[1]!.disabled).toBe(true);
    view.querySelector<HTMLButtonElement>('.kaplan-lens-choice')!.click();
    expect(progress()[1]!.disabled).toBe(false);
    expect(next().disabled).toBe(false);
    expect([...view.querySelectorAll('.kaplan-progress__step')].map((s) => s.textContent))
      .toEqual(['1. Choose your lens', '2. Pick your moment', '3. Look outward', '4. Write it down']);
  });
  it('switches level from the lens, keeping notes for steps both levels share', () => {
    const view = renderBlock(attach({ answer_with: 'window' }), 'student', { lessonId: 'lesson' });
    document.body.append(view);
    view.querySelector<HTMLButtonElement>('.kaplan-chip')!.click();
    const notes = view.querySelector<HTMLTextAreaElement>('.kaplan-notes')!;
    notes.value = 'The reaping'; notes.dispatchEvent(new Event('input'));
    click(view, 'Stretch');
    expect(view.querySelectorAll('.kaplan-progress__step')).toHaveLength(4);
    expect(view.querySelector<HTMLTextAreaElement>('.kaplan-notes')!.value).toBe('The reaping');
    click(view, 'More help');
    expect(view.querySelector('.kaplan-workspace__prompt')!.textContent).toContain('Pick one part of the text');
    expect(view.querySelector<HTMLDetailsElement>('.kaplan-support')!.open).toBe(true);
  });
  it('hides the level switch when the teacher turns it off', () => {
    const view = renderBlock(attach({ student_level: false, level: 'support' }), 'student');
    view.querySelector<HTMLButtonElement>('.kaplan-chip')!.click();
    expect(view.querySelector('.lens-levels')).toBeNull();
    expect(view.querySelector('.kaplan-workspace__prompt')!.textContent).toContain('Pick one part of the text');
  });
  it('prints the teacher’s level, with Both for student’s choice', () => {
    const view = renderBlock(attach({ answer_with: 'choice', level: 'extend' }), 'print');
    const titles = [...view.querySelectorAll('.kaplan-qualifiers--print ol > li > strong')].map((s) => s.textContent);
    expect(titles).toEqual(['Choose your lens. ', 'Pick your moment. ', 'Look outward. ', 'Look inward. ', 'Find the tension. ']);
    expect(view.querySelector('.lens-challenge')).toBeTruthy();
  });
});

describe('on peer feedback', () => {
  it('asks the reviewer to find the window and mirror in a classmate’s writing', () => {
    const peer = createBlock('peer_feedback', 'peer');
    expect(stepIds({ answer_with: 'both' }, 'core', undefined, peer)).toEqual(['find_window', 'find_mirror']);
    expect(stepIds({ answer_with: 'mirror' }, 'extend', undefined, peer)).toEqual(['find_mirror', 'weigh']);
    const write = WINDOWS_MIRRORS.writeItDown({ focus: '', mode: 'notes', answer_with: 'both' }, { level: 'core', block: peer });
    expect(write.frame).toBe('Your window is ___. Your mirror is ___. To sharpen it, ___.');
  });
});

describe('setup and saving', () => {
  it('adds from the picker with Answer with and a level, and saves only what changed', () => {
    let block: Block = questionBlock();
    const editor = createLensEditor({ getBlock: () => block, onChange: (next) => { block = next; } });
    document.body.append(editor);
    click(editor, 'Add lens…');
    click(editor, 'Windows & MirrorsFind a moment → look outward, inward or both → write it');
    expect(editor.querySelector('.lens-example-preview')!.textContent).toContain('Collins reveals how the Capitol rules through fear');
    click(editor, 'Mirror');
    click(editor, 'Support');
    expect(editor.querySelector('.lens-example-preview')!.textContent).toContain('how far we would go to protect someone we love');
    click(editor, 'Add lens');
    expect(block.lenses).toEqual([{ id: 'windows_mirrors', config: {
      focus: 'sacrifice', answer_with: 'mirror', level: 'support', student_level: true, mode: 'notes'
    } }]);
  });
  it('round trips through saving, publishing and cloning, and keeps unknown lenses', () => {
    let block = attach({ focus: 'sacrifice', answer_with: 'window' });
    block = withLens(block, 'from_the_future', { anything: 1 });
    const lesson = LessonSchema.parse({
      id: 'lesson', type: 'lesson', title: 'Sacrifice', slug: 'sacrifice', status: 'active',
      created_at: ISO, updated_at: ISO, schema_version: 1, unit_id: 'unit', sequence: 1, blocks: [block]
    });
    const saved = LessonSchema.parse(JSON.parse(JSON.stringify(lesson)));
    expect(toPublishedLesson(saved, ISO).blocks[0]!.lenses).toEqual(block.lenses);
    expect(cloneBlockWithNewIds(saved.blocks[0]!, () => 'new-id').lenses).toEqual(block.lenses);
    const view = renderBlock(saved.blocks[0]!, 'student');
    expect(view.querySelectorAll('.kaplan-chip')).toHaveLength(1);
    expect(withoutLens(withoutLens(block, 'from_the_future'), WINDOWS_MIRRORS_ID).lenses).toBeUndefined();
  });
  it('rejects the same lens twice on one block', () => {
    const block = attach({});
    expect(BlockSchema.safeParse({ ...block, lenses: [...block.lenses!, ...block.lenses!] }).success).toBe(false);
  });
});
