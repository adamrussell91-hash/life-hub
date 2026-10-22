import { describe, it, expect, vi } from 'vitest';
import { BlockSchema } from '@/schemas/block';
import { createBlock, BLOCK_GROUPS, HOMEPAGE_BLOCK_GROUPS, UNIT_PLAN_BLOCK_GROUPS } from '@/blocks/create-block';
import { createBlockEditor } from '@/blocks/editors';
import { renderBlock } from '@/blocks/render';
import { blockRegistry } from '@/blocks/registry';
import { hingeIssue, nextStep, type HingeBlock } from '@/blocks/hinge-question/shared';
import { openBoard } from '@/blocks/hinge-question/board';
import { filterBlocksForStudent } from '@/blocks/visibility';

const finished = (): HingeBlock => {
  const block = createBlock('hinge_question', 'hq1') as HingeBlock;
  const options = block.content.options.map((o, i) => ({ ...o, text: ['Gravity', 'Magnetism', 'Air pressure', 'Nothing'][i]! }));
  return { ...block, content: { ...block.content, prompt: 'Which force keeps the Moon in orbit?', options, correct_id: options[0]!.id } };
};

describe('Hinge question block', () => {
  it('is a lesson-only Learning block with four empty answers that round-trips through the schema', () => {
    const block = createBlock('hinge_question', 'hq1');
    const parsed = BlockSchema.parse(block);
    if (parsed.block_type !== 'hinge_question') throw new Error('Expected hinge_question');
    expect(parsed.content).toMatchObject({ prompt: '', correct_id: '', seconds: 60, move_on: 80, reteach: 50 });
    expect(parsed.content.options).toHaveLength(4);
    expect(BLOCK_GROUPS.find((g) => g.label === 'Learning')?.types).toContain('hinge_question');
    expect(HOMEPAGE_BLOCK_GROUPS.flatMap((g) => g.types)).not.toContain('hinge_question');
    expect(UNIT_PLAN_BLOCK_GROUPS.flatMap((g) => g.types)).not.toContain('hinge_question');
    expect(blockRegistry.hinge_question).toBeDefined();
    expect(() => BlockSchema.parse({ ...block, content: { ...parsed.content, seconds: 45 } })).toThrow();
  });

  it('publish checks name what is missing', () => {
    const block = finished();
    expect(hingeIssue(block.content)).toBeNull();
    expect(hingeIssue({ ...block.content, prompt: ' ' })).toBe('Write the hinge question');
    expect(hingeIssue({ ...block.content, correct_id: '' })).toBe('Mark the right answer');
    expect(hingeIssue({ ...block.content, options: [{ ...block.content.options[0]!, text: '' }, ...block.content.options.slice(1)] })).toMatch(/Fill in every answer/);
    expect(hingeIssue({ ...block.content, reteach: 80 })).toMatch(/below the move-on mark/);
  });

  it('the next step follows the teacher’s marks', () => {
    expect(nextStep(80, 80, 50).kind).toBe('move_on');
    expect(nextStep(79, 80, 50).kind).toBe('split');
    expect(nextStep(50, 80, 50).kind).toBe('split');
    expect(nextStep(49, 80, 50).kind).toBe('reteach');
  });

  it('the editor marks the right answer, takes misconception notes for wrong ones and adds answers', () => {
    const changed = vi.fn();
    const editor = createBlockEditor(createBlock('hinge_question', 'hq1'), changed);
    const prompt = editor.querySelector('textarea')!;
    prompt.value = 'Which force keeps the Moon in orbit?';
    prompt.dispatchEvent(new Event('input'));
    // The main answers; the back-up question has its own list further down.
    const main = editor.querySelector<HTMLFieldSetElement>('.hq-editor__options')!;
    const radios = [...main.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    radios[0]!.checked = true;
    radios[0]!.dispatchEvent(new Event('change'));
    // The right answer loses its note field; the other three keep theirs.
    const notes = [...main.querySelectorAll<HTMLInputElement>('.hq-editor__note')];
    expect(notes).toHaveLength(3);
    notes[0]!.value = 'Any pull at a distance is magnetic';
    notes[0]!.dispatchEvent(new Event('input'));
    [...main.querySelectorAll('button')].find((b) => b.textContent === 'Add an answer')!.click();
    const content = changed.mock.calls.at(-1)![0].content;
    expect(content.prompt).toBe('Which force keeps the Moon in orbit?');
    expect(content.correct_id).toBe(content.options[0].id);
    expect(content.options[1].misconception).toBe('Any pull at a distance is magnetic');
    expect(content.options).toHaveLength(5);
    expect(content.backup).toBeUndefined();
    expect([...main.querySelectorAll('button')].some((b) => b.textContent === 'Add an answer')).toBe(false);
  });

  it('the editor takes an optional back-up question, saved as the teacher’s own', () => {
    const changed = vi.fn();
    const editor = createBlockEditor(finished(), changed);
    const backup = editor.querySelector<HTMLDetailsElement>('.hq-editor__backup')!;
    expect(backup.open).toBe(false);
    const prompt = backup.querySelector('textarea')!;
    prompt.value = 'Which force keeps a satellite circling the Earth?';
    prompt.dispatchEvent(new Event('input'));
    const texts = [...backup.querySelectorAll<HTMLInputElement>('.hq-editor__text')];
    expect(texts).toHaveLength(4);
    texts[0]!.value = 'Gravity';
    texts[0]!.dispatchEvent(new Event('input'));
    const radio = backup.querySelector<HTMLInputElement>('input[type="radio"]')!;
    radio.checked = true;
    radio.dispatchEvent(new Event('change'));
    const content = changed.mock.calls.at(-1)![0].content;
    expect(content.backup).toMatchObject({ prompt: 'Which force keeps a satellite circling the Earth?', source: 'teacher' });
    expect(content.backup.options[0].text).toBe('Gravity');
    expect(content.backup.correct_id).toBe(content.backup.options[0].id);
    expect(BlockSchema.parse({ ...finished(), content }).block_type).toBe('hinge_question');
  });

  it('publish strips the back-up question from the student copy', () => {
    const block = finished();
    const withBackup = { ...block, content: { ...block.content, backup: { prompt: 'Secret', options: block.content.options, correct_id: block.content.correct_id, source: 'ann' as const } } };
    const [student] = filterBlocksForStudent([withBackup]);
    expect(JSON.stringify(student)).not.toContain('Secret');
  });

  it('print lists the answers with no right answer marked', () => {
    const printed = renderBlock(finished(), 'print');
    expect(printed.textContent).toContain('Which force keeps the Moon in orbit?');
    expect(printed.querySelectorAll('.hq-print__option')).toHaveLength(4);
    expect(printed.textContent).not.toMatch(/Right/);
    expect(printed.querySelector('button')).toBeNull();
  });

  it('the board hides the spread until reveal and never shows misconceptions', () => {
    const view = {
      prompt: 'Which force keeps the Moon in orbit?',
      options: [{ id: 'a', text: 'Gravity' }, { id: 'b', text: 'Magnetism' }],
      open: true, closes_at: null, revealed: false, correct_id: 'a', answered: 4, picks: { a: 3, b: 1 }
    };
    const onClose = vi.fn();
    const board = openBoard(view, onClose);
    const overlay = document.querySelector('.hq-board')!;
    expect(overlay.textContent).toContain('4 answered');
    expect(overlay.querySelector('.hq-bar')).toBeNull();
    expect(overlay.textContent).not.toContain('Right answer');
    board.update({ ...view, open: false, revealed: true });
    expect(overlay.textContent).toContain('75%');
    expect(overlay.querySelector('[data-right="true"]')!.textContent).toContain('Gravity');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.querySelector('.hq-board')).toBeNull();
    expect(onClose).toHaveBeenCalled();
  });
});
