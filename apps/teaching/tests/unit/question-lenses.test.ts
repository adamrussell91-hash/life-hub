import { beforeEach, describe, expect, it } from 'vitest';
import { createBlock } from '@/blocks/create-block';
import { withLens } from '@/blocks/lenses/attachments';
import { BECAUSE_BUT_SO_ID, BECAUSE_BUT_SO_LENS } from '@/blocks/lenses/because-but-so';
import { createLensEditor } from '@/blocks/lenses/lens-editor';
import { guessQuestionLevel, QUESTION_LEVELS_ID, QUESTION_LEVELS_LENS } from '@/blocks/lenses/question-levels';
import { steppedLens } from '@/blocks/lenses/registry';
import type { LensLevel } from '@/blocks/lenses/types';
import { renderBlock } from '@/blocks/render';
import type { Block } from '@/schemas/block';

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
const base = { focus: 'sacrifice', mode: 'notes' as const };
beforeEach(() => { document.body.replaceChildren(); localStorage.clear(); });

describe('4 Levels of Questions', () => {
  const ids = (level: LensLevel) => QUESTION_LEVELS_LENS.steps(base, { level, block: questionBlock() }).map((s) => s.id);
  it('climbs Beginner, Detective, Judge, Inventor, with a look back at Extend', () => {
    expect(ids('support')).toEqual(['beginner', 'detective', 'judge', 'inventor']);
    expect(ids('core')).toEqual(['beginner', 'detective', 'judge', 'inventor']);
    expect(ids('extend')).toEqual(['beginner', 'detective', 'judge', 'inventor', 'look_back']);
  });
  it('gives the stems at Core and plain questions at Support', () => {
    const core = QUESTION_LEVELS_LENS.steps(base, { level: 'core', block: questionBlock() });
    expect(core[0]!.prompt).toBe('Ask a Beginner question about sacrifice, then answer it.');
    expect(core[3]!.support).toContain('What if…?');
    const support = QUESTION_LEVELS_LENS.steps(base, { level: 'support', block: questionBlock() });
    expect(support[2]!.prompt).toBe('Do you think this was right or fair? Why?');
  });
  it('ends with a frame, then a challenge at Extend, each with a Hunger Games example', () => {
    const write = (level: LensLevel) => QUESTION_LEVELS_LENS.writeItDown(base, { level, block: questionBlock() });
    expect(write('core').frame).toContain('The key question is ___');
    expect(write('extend').challenge).toContain('climbs the ladder');
    for (const level of ['support', 'core', 'extend'] as const) expect(write(level).example).toMatch(/Katniss/);
  });
  it('guesses a question’s level from its opening words', () => {
    expect(guessQuestionLevel('Who is Haymitch?')).toBe('beginner');
    expect(guessQuestionLevel('Why does Katniss volunteer?')).toBe('detective');
    expect(guessQuestionLevel('Do you think the Games are fair?')).toBe('judge');
    expect(guessQuestionLevel('What if Prim had gone?')).toBe('inventor');
  });
});

describe('Because, But, So', () => {
  it('starts from a claim, then because, but and so', () => {
    expect(BECAUSE_BUT_SO_LENS.steps(base, { level: 'core', block: questionBlock() }).map((s) => s.id))
      .toEqual(['claim', 'because', 'but', 'so']);
  });
  it('uses the teacher’s step text and examples over the built-in ones', () => {
    const ctx = { level: 'core' as const, block: questionBlock() };
    const edited = BECAUSE_BUT_SO_LENS.setStepText({ ...base, examples: { core: 'Our model' } }, ctx, 'but', 'prompt', 'What pulls against it?');
    expect(BECAUSE_BUT_SO_LENS.steps(edited, ctx)[2]!.prompt).toBe('What pulls against it?');
    expect(BECAUSE_BUT_SO_LENS.writeItDown(edited, ctx).example).toBe('Our model');
    expect(BECAUSE_BUT_SO_LENS.writeItDown(base, { ...ctx, level: 'extend' }).challenge).toContain('although');
  });
});

describe('in the picker and on a block', () => {
  it('both lenses are registry entries in their own picker groups', () => {
    expect(steppedLens(QUESTION_LEVELS_ID)!.group).toBe('Questioning');
    expect(steppedLens(BECAUSE_BUT_SO_ID)!.group).toBe('Writing');
  });
  it('adds from the picker and saves only the shared settings', () => {
    let block: Block = questionBlock();
    const editor = createLensEditor({ getBlock: () => block, onChange: (next) => { block = next; } });
    document.body.append(editor);
    click(editor, 'Add lens…');
    click(editor, 'Because, But, SoClaim → because → but → so → write it');
    expect(editor.querySelector('.lens-example-preview')!.textContent).toContain('Katniss volunteers because');
    click(editor, 'Add lens');
    expect(block.lenses).toEqual([{ id: 'because_but_so', config: {
      focus: 'sacrifice', level: 'core', student_level: true, mode: 'notes'
    } }]);
  });
  it('walks students through the steps to Write it down', () => {
    const view = renderBlock(withLens(questionBlock(), QUESTION_LEVELS_ID, { focus: 'sacrifice' }), 'student', { lessonId: 'lesson' });
    document.body.append(view);
    view.querySelector<HTMLButtonElement>('.kaplan-chip')!.click();
    expect([...view.querySelectorAll('.kaplan-progress__step')].map((s) => s.textContent)).toEqual([
      '1. Beginner: get the facts', '2. Detective: find the cause', '3. Judge: make a call',
      '4. Inventor: imagine it differently', '5. Write it down'
    ]);
  });
});
