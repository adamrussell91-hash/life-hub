import { afterEach, describe, it, expect } from 'vitest';
import { kitValue, pickKitOption } from './kit-filter';
import { BlockSchema, QuestionItemSchema, type Block } from '@/schemas/block';
import { createTabsEditor } from '@/blocks/layout-editors';
import { renderTabsBlock, renderQuestionSetBlock } from '@/blocks/render';
import { filterBlocksForStudent } from '@/blocks/visibility';
import { sanitizeBlocksDeep } from '@/blocks/sanitize-blocks';

afterEach(() => document.body.replaceChildren());

const base = {
  type: 'block' as const,
  variant: 'medium',
  visibility: 'student_teacher' as const,
  layout: {},
  print: {},
  settings: {},
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  schema_version: 1 as const
};
const rich = (id: string, html: string) => ({ ...base, id, block_type: 'rich_text' as const, content: { html } });
const tabsBlock = (style?: 'tabs' | 'folds') =>
  ({
    ...base,
    id: 'tb',
    block_type: 'tabs',
    content: {
      ...(style ? { style } : {}),
      tabs: [
        { id: 'a', label: 'Alpha', blocks: [rich('r1', '<p>first body</p>')] },
        { id: 'b', label: 'Beta', blocks: [rich('r2', '<p>second body</p>')] }
      ]
    }
  }) as Block;
const qset = (model_answer?: string) =>
  ({
    ...base,
    id: 'qs',
    block_type: 'question_set',
    content: {
      questions: [{ id: 'q1', prompt: 'Why?', kind: 'short_answer', ...(model_answer ? { model_answer } : {}) }]
    }
  }) as Block;

describe('schema', () => {
  it('accepts style and model_answer', () => {
    expect(BlockSchema.parse(tabsBlock('folds'))).toMatchObject({ content: { style: 'folds' } });
    expect(() => BlockSchema.parse(tabsBlock())).not.toThrow();
    expect(QuestionItemSchema.parse({ id: 'q', prompt: 'p', kind: 'short_answer', model_answer: 'm' }).model_answer).toBe('m');
  });
});

describe('tabs as folds', () => {
  it('renders details and builds each body on first open', () => {
    const el = renderTabsBlock(tabsBlock('folds') as never, 'student', {});
    document.body.append(el);
    const folds = el.querySelectorAll('details.block-tabs__fold');
    expect(folds.length).toBe(2);
    expect(folds[0]!.querySelector('summary')!.textContent).toBe('Alpha');
    expect(el.textContent).not.toContain('first body');
    const first = folds[0] as HTMLDetailsElement;
    first.open = true;
    first.dispatchEvent(new Event('toggle'));
    expect(el.textContent).toContain('first body');
    expect(el.textContent).not.toContain('second body');
    const built = first.querySelector('.block-tabs__fold-body')!.firstElementChild;
    first.open = false;
    first.dispatchEvent(new Event('toggle'));
    first.open = true;
    first.dispatchEvent(new Event('toggle'));
    expect(first.querySelector('.block-tabs__fold-body')!.firstElementChild).toBe(built);
  });

  it('keeps tabs when style is absent and sequential panels in print', () => {
    expect(renderTabsBlock(tabsBlock() as never, 'student', {}).querySelector('[role="tablist"]')).not.toBeNull();
    const print = renderTabsBlock(tabsBlock('folds') as never, 'print', {});
    expect(print.querySelectorAll('.block-tabs__print-panel').length).toBe(2);
  });

  it('the Show as pill sets style and student filter and sanitize keep it', () => {
    let latest = tabsBlock() as Extract<Block, { block_type: 'tabs' }>;
    const editor = createTabsEditor(latest, (next) => { latest = next; }, () => latest);
    document.body.append(editor);
    pickKitOption(editor.querySelector('.block-editor__tabs-style'), 'folds');
    expect(latest.content.style).toBe('folds');
    expect(kitValue(editor.querySelector('.block-editor__tabs-style'))).toBe('folds');
    expect((filterBlocksForStudent([latest as Block]) as never[])).toHaveLength(1);
    const kept = filterBlocksForStudent([latest as Block])[0] as Extract<Block, { block_type: 'tabs' }>;
    expect(kept.content.style).toBe('folds');
    expect((sanitizeBlocksDeep([latest as Block])[0] as typeof latest).content.style).toBe('folds');
  });
});

describe('question model answer', () => {
  it('is hidden for students until the button is pressed', () => {
    const el = renderQuestionSetBlock(qset('The model') as never, 'student', {});
    document.body.append(el);
    const model = el.querySelector<HTMLElement>('.block-question-set__model')!;
    expect(model.hidden).toBe(true);
    const btn = el.querySelector<HTMLButtonElement>('.block-question-set__model-btn')!;
    expect(btn.textContent).toBe('Check against the model');
    btn.click();
    expect(model.hidden).toBe(false);
    expect(model.textContent).toBe('The model');
  });

  it('shows in teacher mode, hides on Display, and is left out of print', () => {
    const teacher = renderQuestionSetBlock(qset('The model') as never, 'teacher', {});
    expect(teacher.querySelector('.block-question-set__model-note')!.textContent).toContain('The model');
    expect(teacher.querySelector('.block-question-set__model-btn')).toBeNull();
    const display = renderQuestionSetBlock(qset('The model') as never, 'teacher', { display: true });
    expect(display.querySelector('.block-question-set__model-note')).toBeNull();
    expect(display.querySelector<HTMLElement>('.block-question-set__model')!.hidden).toBe(true);
    expect(display.querySelector('.block-question-set__model-btn')).not.toBeNull();
    const print = renderQuestionSetBlock(qset('The model') as never, 'print', {});
    expect(print.textContent).not.toContain('The model');
  });

  it('survives the student publish filter', () => {
    const kept = filterBlocksForStudent([qset('The model')])[0] as Extract<Block, { block_type: 'question_set' }>;
    expect(kept.content.questions[0]!.model_answer).toBe('The model');
  });
});
