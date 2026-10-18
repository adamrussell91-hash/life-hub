import { describe, it, expect, vi } from 'vitest';
import { BlockSchema } from '@/schemas/block';
import { createBlock, BLOCK_GROUPS, HOMEPAGE_BLOCK_GROUPS, UNIT_PLAN_BLOCK_GROUPS } from '@/blocks/create-block';
import { createBlockEditor } from '@/blocks/editors';
import { renderBlock } from '@/blocks/render';
import { blockRegistry } from '@/blocks/registry';
import { cloudWords } from '@/blocks/brainstorm/cloud';
import { mountBoard } from '@/blocks/brainstorm/board';

describe('Brainstorm block', () => {
  it('is an insertable lesson block with safe defaults that round-trips through the schema', () => {
    const block = createBlock('brainstorm', 'bs1');
    const parsed = BlockSchema.parse(block);
    if (parsed.block_type !== 'brainstorm') throw new Error('Expected brainstorm');
    expect(parsed.content).toEqual({ question: '', safety: 'approve', per_student: 3, max_length: 140, layout: 'grid' });
    expect(BLOCK_GROUPS.find((g) => g.label === 'Learning')?.types).toContain('brainstorm');
    expect(HOMEPAGE_BLOCK_GROUPS.flatMap((g) => g.types)).not.toContain('brainstorm');
    expect(UNIT_PLAN_BLOCK_GROUPS.flatMap((g) => g.types)).not.toContain('brainstorm');
    expect(blockRegistry.brainstorm).toBeDefined();
    expect(() => BlockSchema.parse({ ...block, content: { ...parsed.content, per_student: 2 } })).toThrow();
  });

  it('the editor saves the question and settings, and print shows the question with lines', () => {
    const block = createBlock('brainstorm', 'bs1');
    const changed = vi.fn();
    const editor = createBlockEditor(block, changed);
    const question = editor.querySelector('textarea')!;
    question.value = 'What does the storm tell us?';
    question.dispatchEvent(new Event('input'));
    expect(changed.mock.calls.at(-1)![0].content.question).toBe('What does the storm tell us?');
    const [safety, perStudent] = [...editor.querySelectorAll('select')];
    safety!.value = '1';
    safety!.dispatchEvent(new Event('change'));
    perStudent!.value = '3';
    perStudent!.dispatchEvent(new Event('change'));
    const updated = changed.mock.calls.at(-1)![0];
    expect(updated.content).toMatchObject({ question: 'What does the storm tell us?', safety: 'instant', per_student: 0 });
    const printed = renderBlock(updated, 'print');
    expect(printed.textContent).toContain('What does the storm tell us?');
    expect(printed.querySelector('button')).toBeNull();
  });

  it('word cloud keeps short answers as phrases and counts the words of long ones', () => {
    expect(cloudWords(['Guilt', 'guilt!', 'Chaos', 'The storm shows his mind is breaking apart'])).toEqual([
      { text: 'Guilt', count: 2 },
      { text: 'apart', count: 1 },
      { text: 'breaking', count: 1 },
      { text: 'Chaos', count: 1 },
      { text: 'mind', count: 1 },
      { text: 'shows', count: 1 },
      { text: 'storm', count: 1 }
    ]);
  });

  it('the board orbits shapes before reveal and shows cards, groups and removal after', () => {
    const remove = vi.fn();
    const board = mountBoard({ remove, move: vi.fn(), rename: vi.fn() });
    document.body.append(board.root);
    const answers = [
      { id: '0-0.0', text: 'Guilt', symbol: '0-0' },
      { id: '1-2.0', text: 'Chaos', symbol: '1-2' }
    ];
    const view = { question: 'Why the storm?', revealed: false, layout: 'grid' as const, answers, symbolsOnCards: true, groups: null };
    board.update(view);
    expect(board.root.querySelectorAll('.bs-orbit__item')).toHaveLength(2);
    expect(board.root.textContent).not.toContain('Guilt');
    board.update({ ...view, revealed: true });
    expect([...board.root.querySelectorAll('.bs-card__text')].map((n) => n.textContent)).toEqual(['Guilt', 'Chaos']);
    expect(board.root.querySelectorAll('.bs-card .pf-token')).toHaveLength(2);
    board.root.querySelector<HTMLButtonElement>('.bs-card__remove')!.click();
    expect(remove).toHaveBeenCalledWith('0-0.0');
    board.update({ ...view, revealed: true, symbolsOnCards: false, layout: 'groups', groups: [{ id: 'g1', name: 'Feelings', answer_ids: ['0-0.0'] }] });
    expect(board.root.querySelectorAll('.bs-card .pf-token')).toHaveLength(0);
    const groups = [...board.root.querySelectorAll('.bs-group')];
    expect(groups.map((g) => g.querySelector<HTMLInputElement>('.bs-group__name')?.value ?? g.querySelector('h4')?.textContent)).toEqual(['Feelings', 'New']);
    board.update({ ...view, revealed: false });
    expect(board.root.querySelectorAll('.bs-orbit__item')).toHaveLength(2);
    board.root.remove();
  });

  it('a student board before reveal shows neutral dots, never symbols or text', () => {
    const board = mountBoard();
    board.update({ question: 'Q', revealed: false, layout: 'grid', answers: [], count: 3, symbolsOnCards: false, groups: null });
    expect(board.root.querySelectorAll('.bs-dot')).toHaveLength(3);
    expect(board.root.querySelector('.pf-token')).toBeNull();
    expect(board.root.querySelector('.bs-card__remove')).toBeNull();
  });
});
