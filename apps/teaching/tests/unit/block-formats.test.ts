import { beforeEach, describe, expect, it } from 'vitest';
import { createBlock } from '@/blocks/create-block';
import { createBlockEditor } from '@/blocks/editors';
import { blockFormat, formatsFor, withFormat } from '@/blocks/formats/registry';
import { renderBlock } from '@/blocks/render';
import { BlockSchema, type Block } from '@/schemas/block';
import { pickKitOption } from './kit-filter';

type QuestionSet = Extract<Block, { block_type: 'question_set' }>;
function questionSet(format?: QuestionSet['content']['format']): QuestionSet {
  const block = createBlock('question_set', 'qset') as QuestionSet;
  block.content.questions[0]!.prompt = 'How does your text explore sacrifice?';
  return format ? withFormat(block, format) : block;
}
const pickFormat = (editor: HTMLElement, value: string) =>
  pickKitOption(editor.querySelector('.block-editor__format-choice'), value);
beforeEach(() => { document.body.replaceChildren(); localStorage.clear(); });

describe('Format registry', () => {
  it('reads saved question sets as standard and leaves their content alone', () => {
    const block = questionSet();
    const parsed = BlockSchema.parse(JSON.parse(JSON.stringify(block))) as QuestionSet;
    expect(parsed.content.format).toBeUndefined();
    expect(blockFormat(parsed)).toBe('standard');
    expect(formatsFor('question_set').map((f) => f.id)).toEqual(['standard', 'human_experience_table', 'anchor_bridge']);
  });
  it('treats peer feedback’s comments and annotate modes as its formats', () => {
    const peer = createBlock('peer_feedback', 'peer');
    expect(blockFormat(peer)).toBe('comments');
    expect(blockFormat(withFormat(peer, 'annotate'))).toBe('annotate');
  });
});

describe('question set editor', () => {
  it('switches format from the Format control, keeping prompts and table settings', () => {
    let block: Block = questionSet();
    const editor = createBlockEditor(block, (next) => { block = next; }, () => block);
    document.body.append(editor);
    const settings = editor.querySelector<HTMLElement>('.block-editor__table-settings')!;
    expect(settings.hidden).toBe(true);
    pickFormat(editor, 'human_experience_table');
    expect((block as QuestionSet).content.format).toBe('human_experience_table');
    expect(settings.hidden).toBe(false);
    const prompt = editor.querySelector<HTMLTextAreaElement>('.block-editor__question-prompt')!;
    prompt.value = 'Complete the table for your novel'; prompt.dispatchEvent(new Event('input'));
    expect((block as QuestionSet).content.format).toBe('human_experience_table');
    expect((block as QuestionSet).content.questions[0]!.prompt).toBe('Complete the table for your novel');
  });
});

describe('Human experience table', () => {
  it('shows the instruction, a greyed example row, the chosen number of rows and Write it down', () => {
    const block = questionSet('human_experience_table');
    block.content.table = { rows: 4, example: true };
    const view = renderBlock(block, 'student', { lessonId: 'lesson' });
    document.body.append(view);
    expect(view.querySelector('.block-question-set__instruction')!.textContent).toBe('How does your text explore sacrifice?');
    expect(view.querySelector('.block-question-set__example')!.textContent).toContain('Sacrifice');
    expect(view.querySelectorAll('tbody tr')).toHaveLength(5);
    const pick = view.querySelector<HTMLButtonElement>('.block-question-set__lens-pick')!;
    pick.click();
    expect(pick.getAttribute('aria-pressed')).toBe('true');
    expect(view.querySelector('.block-question-set__handover')!.textContent).toContain('won’t keep your answer');
    const cell = view.querySelector<HTMLTextAreaElement>('tbody tr:not(.block-question-set__example) textarea')!;
    cell.value = 'Survival'; cell.dispatchEvent(new Event('input'));
    const again = renderBlock(block, 'student', { lessonId: 'lesson' });
    expect(again.querySelector<HTMLTextAreaElement>('tbody tr:not(.block-question-set__example) textarea')!.value).toBe('Survival');
  });
  it('hides the example row when asked and prints empty boxes', () => {
    const block = questionSet('human_experience_table');
    block.content.table = { rows: 3, example: false };
    const print = renderBlock(block, 'print');
    expect(print.querySelector('.block-question-set__example')).toBeNull();
    expect(print.querySelector('textarea')).toBeNull();
    expect(print.querySelectorAll('tbody tr')).toHaveLength(3);
  });
});

describe('Anchor & bridge', () => {
  it('gives each question three labelled boxes, the response frame and Write it down', () => {
    const view = renderBlock(questionSet('anchor_bridge'), 'teacher');
    const labels = [...view.querySelectorAll('.block-question-set__part .block-eyebrow')].map((l) => l.textContent);
    expect(labels).toEqual(['Anchor', 'Human experience', 'Bridge']);
    expect(view.querySelector<HTMLTextAreaElement>('.block-question-set__final')!.value).toContain('This reveals that ___');
    expect(localStorage.length).toBe(0);
  });
});

describe('peer feedback format', () => {
  it('switches between feedback boxes and notes on the text from the Format control', () => {
    let block: Block = createBlock('peer_feedback', 'peer');
    const editor = createBlockEditor(block, (next) => { block = next; }, () => block);
    document.body.append(editor);
    expect(editor.querySelector('.block-editor__format-hint')!.textContent).toContain('one classmate');
    pickFormat(editor, 'annotate');
    expect(blockFormat(block)).toBe('annotate');
    expect(editor.querySelector('.block-editor__format-hint')!.textContent).toContain('two classmates');
  });
});
