import { describe, it, expect, vi } from 'vitest';
import { BlockSchema } from '@/schemas/block';
import {
  createQuoteEditor,
  renderAccordionBlock,
  renderCodeBlock,
  renderDefinitionBlock,
  renderDividerBlock,
  renderQuestionSetBlock,
  renderQuoteBlock,
  renderTableBlock
} from '@/blocks/registry';
import type { Block } from '@/schemas/block';

const timestamps = {
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
};

const baseBlock = {
  id: 'block_001',
  type: 'block' as const,
  variant: 'medium',
  visibility: 'student_teacher' as const,
  layout: {},
  print: {},
  settings: {},
  ...timestamps,
  schema_version: 1 as const
};

describe('new block schemas', () => {
  it('parses quote, table, accordion, and question_set', () => {
    expect(
      BlockSchema.parse({
        ...baseBlock,
        block_type: 'quote',
        content: { quote: 'Memory is a kind of fiction.', attribution: 'Teacher' }
      }).block_type
    ).toBe('quote');

    expect(
      BlockSchema.parse({
        ...baseBlock,
        id: 't1',
        block_type: 'table',
        content: { headers: ['Term', 'Meaning'], rows: [['Ukiyo', 'Floating world']] }
      }).block_type
    ).toBe('table');

    expect(
      BlockSchema.parse({
        ...baseBlock,
        id: 'a1',
        block_type: 'accordion',
        content: { items: [{ title: 'Hint', body: 'Look again.' }] }
      }).block_type
    ).toBe('accordion');

    expect(
      BlockSchema.parse({
        ...baseBlock,
        id: 'q1',
        block_type: 'question_set',
        content: {
          title: 'Check-in',
          questions: [
            { id: 'q_a', prompt: 'What stands out?', kind: 'short_answer' },
            {
              id: 'q_b',
              prompt: 'Choose one',
              kind: 'multiple_choice',
              options: ['A', 'B']
            }
          ]
        }
      }).block_type
    ).toBe('question_set');
  });
});

describe('new block renderers', () => {
  it('renderQuoteBlock produces a blockquote', () => {
    const block = {
      ...baseBlock,
      block_type: 'quote' as const,
      content: { quote: 'Stillness.', attribution: 'Ono' }
    };
    const el = renderQuoteBlock(block, 'student');
    expect(el.querySelector('blockquote')?.textContent).toBe('Stillness.');
    expect(el.querySelector('figcaption')?.textContent).toContain('Ono');
  });

  it('renderDividerBlock produces hr', () => {
    const block = {
      ...baseBlock,
      block_type: 'divider' as const,
      content: {}
    };
    const el = renderDividerBlock(block, 'student');
    expect(el.querySelector('hr')).not.toBeNull();
  });

  it('renderDefinitionBlock produces dl/dt/dd', () => {
    const block = {
      ...baseBlock,
      block_type: 'definition' as const,
      content: { term: 'Mizu', definition: 'Water' }
    };
    const el = renderDefinitionBlock(block, 'student');
    expect(el.querySelector('dl')).not.toBeNull();
    expect(el.querySelector('dt')?.textContent).toBe('Mizu');
    expect(el.querySelector('dd')?.textContent).toBe('Water');
  });

  it('renderCodeBlock produces pre/code with textContent safety', () => {
    const block = {
      ...baseBlock,
      block_type: 'code' as const,
      content: { code: '<script>alert(1)</script>', language: 'html' }
    };
    const el = renderCodeBlock(block, 'student');
    expect(el.querySelector('pre code')?.textContent).toBe('<script>alert(1)</script>');
    expect(el.querySelector('script')).toBeNull();
  });

  it('renderAccordionBlock uses details/summary and textContent body', () => {
    const block = {
      ...baseBlock,
      block_type: 'accordion' as const,
      content: { items: [{ title: 'Open', body: '<b>safe</b>' }] }
    };
    const el = renderAccordionBlock(block, 'student');
    expect(el.querySelector('details')).not.toBeNull();
    expect(el.querySelector('summary')?.textContent).toBe('Open');
    expect(el.querySelector('.block-accordion__body')?.textContent).toBe('<b>safe</b>');
    expect(el.querySelector('.block-accordion__body')?.innerHTML).toBe('&lt;b&gt;safe&lt;/b&gt;');
  });

  it('renderTableBlock produces semantic table', () => {
    const block = {
      ...baseBlock,
      block_type: 'table' as const,
      content: { headers: ['A', 'B'], rows: [['1', '2']] }
    };
    const el = renderTableBlock(block, 'student');
    expect(el.querySelector('table thead th')?.textContent).toBe('A');
    expect(el.querySelector('table tbody td')?.textContent).toBe('1');
  });

  it('renderQuestionSetBlock lists prompts and MC options', () => {
    const block = {
      ...baseBlock,
      block_type: 'question_set' as const,
      content: {
        questions: [
          { id: 'q1', prompt: 'Explain', kind: 'short_answer' as const },
          {
            id: 'q2',
            prompt: 'Pick',
            kind: 'multiple_choice' as const,
            options: ['One', 'Two']
          }
        ]
      }
    };
    const el = renderQuestionSetBlock(block, 'student');
    expect(el.querySelector('ol')).not.toBeNull();
    expect(el.textContent).toContain('Explain');
    expect(el.querySelectorAll('.block-question-set__options li')).toHaveLength(2);
  });
});

describe('createQuoteEditor', () => {
  it('emitChange reads live field values', () => {
    const block: Extract<Block, { block_type: 'quote' }> = {
      ...baseBlock,
      block_type: 'quote',
      content: { quote: 'Start' }
    };
    const onChange = vi.fn();
    const editor = createQuoteEditor(block, onChange);

    const quote = editor.querySelector<HTMLTextAreaElement>('.block-editor__quote-text')!;
    const attribution = editor.querySelector<HTMLInputElement>('.block-editor__quote-attribution')!;

    quote.value = 'Updated quote';
    quote.dispatchEvent(new Event('input', { bubbles: true }));

    attribution.value = 'Author';
    attribution.dispatchEvent(new Event('input', { bubbles: true }));

    expect(onChange).toHaveBeenLastCalledWith({
      ...block,
      content: { quote: 'Updated quote', attribution: 'Author' }
    });
  });
});
