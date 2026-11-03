import { describe, it, expect } from 'vitest';
import { BlockSchema, type Block } from '@/schemas/block';
import { createBlock } from '@/blocks/create-block';
import { cloneBlocksWithNewIds } from '@/blocks/clone-blocks';
import { insertCompositionRoot } from '@/blocks/composition-insert';
import { renderBlock } from '@/blocks/render';
import { createBlockEditor } from '@/blocks/editors';
import { resolveReturnLine, returnSources, type ContinuumBlock } from '@/blocks/continuum-line/shared';

type Section = Extract<Block, { block_type: 'section' }>;

function line(id: string, patch: Partial<ContinuumBlock['content']> = {}): ContinuumBlock {
  const b = createBlock('continuum_line', id) as ContinuumBlock;
  return { ...b, content: { ...b.content, statements: [{ id: `${id}_s1`, text: 'The bridge will hold the load.', snap: false }], ...patch } };
}
function section(id: string, blocks: Block[]): Section {
  const s = createBlock('section', id) as Section;
  return { ...s, content: { ...s.content, title: id, blocks: blocks as Section['content']['blocks'] } };
}

describe('Continuum line: predict mode and return lines', () => {
  it('schema keeps mode, answers and returns_to optional, so existing lines are unchanged', () => {
    const plain = BlockSchema.parse(createBlock('continuum_line', 'a'));
    if (plain.block_type !== 'continuum_line') throw new Error('expected continuum');
    expect(plain.content.mode).toBeUndefined();
    expect(plain.content.returns_to).toBeUndefined();
    const predict = BlockSchema.parse(line('b', { mode: 'predict', statements: [{ id: 's', text: 'x', snap: false, answer: 0.25 }] }));
    if (predict.block_type !== 'continuum_line') throw new Error('expected continuum');
    expect(predict.content.statements[0]!.answer).toBe(0.25);
    expect(() => BlockSchema.parse(line('c', { statements: [{ id: 's', text: 'x', snap: false, answer: 1.5 }] }))).toThrow();
  });

  it('a return line takes the earlier line’s content but keeps its own id, pace and re-place', () => {
    const source = line('src', { mode: 'predict', stimulus: { kind: 'video', text: '', url: 'https://example.com/v.mp4', alt_text: '' } });
    const back = line('back', { statements: [], pace: 'self', replace: false, returns_to: 'src' });
    const page = [section('m', [source]), section('e', [back])];
    const resolved = resolveReturnLine(back, page);
    if (resolved === 'missing') throw new Error('expected resolved');
    expect(resolved.id).toBe('back');
    expect(resolved.content.statements).toEqual(source.content.statements);
    expect(resolved.content.stimulus.kind).toBe('video');
    expect(resolved.content.mode).toBe('predict');
    expect(resolved.content.pace).toBe('self');
    expect(resolved.content.replace).toBe(false);
    expect(resolveReturnLine(back, [section('e', [back])])).toBe('missing');
    expect(resolveReturnLine(line('loop', { returns_to: 'loop' }), [line('loop', { returns_to: 'loop' })])).toBe('missing');
    expect(resolveReturnLine(back, undefined)).toBe(back);
  });

  it('only first lines can be returned to', () => {
    const a = line('a');
    const b = line('b', { returns_to: 'a' });
    const page = [section('s', [a, b]), line('c')];
    expect(returnSources(page, 'c').map((x) => x.id)).toEqual(['a']);
    expect(returnSources(page, 'b').map((x) => x.id)).toEqual(['a', 'c']);
  });

  it('copying a lesson or composition moves returns_to to the copied source', () => {
    let n = 0;
    const nextId = () => `new${++n}`;
    const page = [section('m', [line('src')]), section('e', [line('back', { returns_to: 'src' })])];
    const copy = cloneBlocksWithNewIds(page, nextId);
    const [m, e] = copy as Section[];
    const src = m!.content.blocks[0] as ContinuumBlock;
    const back = e!.content.blocks[0] as ContinuumBlock;
    expect(src.id).not.toBe('src');
    expect(back.content.returns_to).toBe(src.id);

    const root = section('kit', [line('src2'), line('back2', { returns_to: 'src2' })]);
    const inserted = insertCompositionRoot(root, nextId);
    const [s2, b2] = inserted.content.blocks as ContinuumBlock[];
    expect(b2!.content.returns_to).toBe(s2!.id);

    const outside = insertCompositionRoot(section('kit2', [line('b3', { returns_to: 'elsewhere' })]), nextId);
    expect((outside.content.blocks[0] as ContinuumBlock).content.returns_to).toBeUndefined();
  });

  it('a return line whose source has gone says so to the teacher', () => {
    const back = line('back', { returns_to: 'gone' });
    const view = renderBlock(back, 'teacher', { lessonId: 'L1', pageBlocks: [back] });
    expect(view.textContent).toContain('isn’t in the lesson');
  });

  it('the editor offers predict answers and a Returns to picker', () => {
    const source = line('src');
    const target = line('back');
    let latest: Block = target;
    const ed = createBlockEditor(target, (b) => (latest = b), undefined, { getLessonBlocks: () => [source, target] });
    const pick = ed.querySelector<HTMLSelectElement>('select');
    expect(pick).toBeTruthy();
    expect([...pick!.options].map((o) => o.value)).toEqual(['', 'src']);
    pick!.value = 'src';
    pick!.dispatchEvent(new Event('change'));
    expect((latest as ContinuumBlock).content.returns_to).toBe('src');

    const ed2 = createBlockEditor(source, (b) => (latest = b), undefined, { getLessonBlocks: () => [source] });
    const predictChip = [...ed2.querySelectorAll<HTMLButtonElement>('button.cl-chip')].find((b) => b.dataset.value === 'predict');
    predictChip!.click();
    expect((latest as ContinuumBlock).content.mode).toBe('predict');
    const slider = ed2.querySelector<HTMLInputElement>('.cl-editor__answer input[type="range"]');
    expect(slider).toBeTruthy();
    slider!.value = '80';
    slider!.dispatchEvent(new Event('input'));
    expect((latest as ContinuumBlock).content.statements[0]!.answer).toBeCloseTo(0.8);
  });
});
