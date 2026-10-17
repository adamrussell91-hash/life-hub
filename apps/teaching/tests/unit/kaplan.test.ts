import { beforeEach, describe, expect, it } from 'vitest';
import { createBlock, cloneBlockWithNewIds } from '@/blocks/create-block';
import { createBlockEditor } from '@/blocks/editors';
import { createKaplanEditor } from '@/blocks/kaplan-editor';
import { kaplanSteps, suggestKaplanFocus, withKaplanQualifier, withoutKaplanQualifier } from '@/blocks/kaplan';
import { renderBlock } from '@/blocks/render';
import { BlockSchema, type Block } from '@/schemas/block';
import { LessonSchema } from '@/schemas/lesson';
import { toPublishedLesson } from '@/schemas/published-lesson';
import { KaplanQualifierSchema, type KaplanQualifier } from '@/schemas/kaplan';
import { mountBlockCanvas } from '@/teacher/lesson-canvas/mount-page';
import { clickBlockMenuAction, enterBlockEdit } from './helpers/block-edit';

const ISO = '2026-01-01T00:00:00.000Z';
const qualifier: KaplanQualifier = { lens: 'multiple_perspectives', focus: 'reconciliation', mode: 'notes' };
const click = (root: ParentNode, text: string): void => {
  const button = [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text);
  expect(button, text).toBeTruthy();
  button!.click();
};
function questionBlock(): Extract<Block, { block_type: 'question_set' }> {
  const block = createBlock('question_set', 'qset');
  if (block.block_type !== 'question_set') throw Error('wrong block');
  block.content.questions[0]!.prompt = 'How does the poet explore reconciliation through visual imagery?';
  return block;
}
function lesson(block: Block) {
  return LessonSchema.parse({
    id: 'lesson', type: 'lesson', title: 'Reconciliation', slug: 'reconciliation', status: 'active',
    created_at: ISO, updated_at: ISO, schema_version: 1, unit_id: 'unit', sequence: 1, blocks: [block]
  });
}
beforeEach(() => { document.body.replaceChildren(); localStorage.clear(); });

describe('Kaplan attachments and saved lessons', () => {
  it('does not change legacy blocks and never creates a new block type', () => {
    const block = questionBlock();
    expect(BlockSchema.parse(block).qualifiers).toBeUndefined();
    const attached = withKaplanQualifier(block, qualifier);
    expect(attached.id).toBe(block.id);
    expect(attached.block_type).toBe('question_set');
    expect(attached.content).toEqual(block.content);
    expect(suggestKaplanFocus(block)).toBe('reconciliation');
  });
  it('roundtrips qualifiers and supports through saving, publishing and cloning', () => {
    const custom = { ...qualifier, prompts: ['First', '', 'Third'] as [string, string, string], supports: ['', null, 'A hint'] as [string, null, string] };
    const saved = LessonSchema.parse(JSON.parse(JSON.stringify(lesson(withKaplanQualifier(questionBlock(), custom)))));
    expect(toPublishedLesson(saved, ISO).blocks[0]!.qualifiers).toEqual([custom]);
    expect(cloneBlockWithNewIds(saved.blocks[0]!, () => 'new-id').qualifiers).toEqual([custom]);
    expect(kaplanSteps(custom)[0].support).toBe('');
    expect(kaplanSteps(custom)[1].support).not.toBe('');
  });
  it('retains a qualifier in a nested column through publication', () => {
    const columns = createBlock('columns', 'columns');
    if (columns.block_type !== 'columns') throw Error('wrong type');
    columns.content.columns[0]!.blocks.push(withKaplanQualifier(questionBlock(), qualifier));
    const published = toPublishedLesson(lesson(columns), ISO);
    const nested = published.blocks[0]!;
    if (nested.block_type !== 'columns') throw Error('wrong type');
    expect(nested.content.columns[0]!.blocks.at(-1)!.qualifiers).toEqual([qualifier]);
  });
  it('removes only the selected qualifier and deletion persists through save and publish', () => {
    let block: Block = withKaplanQualifier(questionBlock(), qualifier);
    block = withKaplanQualifier(block, { ...qualifier, lens: 'ethics' });
    block = withoutKaplanQualifier(block, 'multiple_perspectives');
    expect(block.qualifiers?.map((q) => q.lens)).toEqual(['ethics']);
    block = withoutKaplanQualifier(block, 'ethics');
    const published = toPublishedLesson(LessonSchema.parse(JSON.parse(JSON.stringify(lesson(block)))), ISO);
    expect(published.blocks[0]!.qualifiers).toBeUndefined();
    expect(published.blocks[0]!.content).toEqual(questionBlock().content);
  });
  it('validates unique lenses, lengths and supported values', () => {
    expect(BlockSchema.safeParse({ ...questionBlock(), qualifiers: [qualifier, qualifier] }).success).toBe(false);
    expect(KaplanQualifierSchema.safeParse({ ...qualifier, lens: 'invented' }).success).toBe(false);
    expect(KaplanQualifierSchema.safeParse({ ...qualifier, focus: 'x'.repeat(201) }).success).toBe(false);
  });
});

describe('guided authoring', () => {
  it('duplicates the current attachment state rather than the stale block captured by the toolbar', () => {
    let blocks: Block[] = [questionBlock()];
    const host = document.createElement('div');
    document.body.append(host);
    let id = 0;
    mountBlockCanvas(host, { blocks, onChange: (next) => { blocks = next; }, idFactory: () => `copy_${++id}` });
    enterBlockEdit(host);
    click(host, 'Add Kaplan qualifier');
    click(host, 'PatternsTwo details → a relationship → an explanation');
    click(host, 'Add qualifier');
    clickBlockMenuAction(host, '.lesson-page__block', 'duplicate');
    expect(blocks[1]!.qualifiers?.[0]?.lens).toBe('patterns');
    expect(blocks[1]!.id).not.toBe(blocks[0]!.id);
  });
  it('adds a ready-made qualifier from block options without extra preparation', () => {
    let block: Block = questionBlock();
    const editor = createKaplanEditor({ getBlock: () => block, onChange: (next) => { block = next; } });
    document.body.append(editor);
    expect(editor.querySelector('[aria-label="Block options"]')).toBeTruthy();
    click(editor, 'Add Kaplan qualifier');
    click(editor, 'Multiple PerspectivesOne detail → two readings → a judgement');
    expect(editor.querySelector<HTMLInputElement>('input')!.value).toBe('reconciliation');
    click(editor, 'Add qualifier');
    expect(block.qualifiers).toEqual([qualifier]);
    expect(editor.querySelector('.kaplan-chip svg')).toBeTruthy();
  });
  it('reviews one instruction at a time, saves a custom hint and allows its removal', () => {
    let block: Block = withKaplanQualifier(questionBlock(), qualifier);
    const editor = createKaplanEditor({ getBlock: () => block, onChange: (next) => { block = next; } });
    document.body.append(editor);
    editor.querySelector<HTMLButtonElement>('.kaplan-chip')!.click();
    click(editor, 'Review the three steps');
    const textareas = editor.querySelectorAll<HTMLTextAreaElement>('textarea');
    textareas[0]!.value = 'Choose one visual image.';
    textareas[0]!.dispatchEvent(new Event('input'));
    textareas[1]!.value = '';
    textareas[1]!.dispatchEvent(new Event('input'));
    click(editor, 'Next step');
    click(editor, 'Next step');
    click(editor, 'Save qualifier');
    expect(kaplanSteps(block.qualifiers![0]!)[0]).toMatchObject({ prompt: 'Choose one visual image.', support: '' });
  });
  it('does not resurrect a removed attachment when the question is edited in the same editor', () => {
    let block: Block = withKaplanQualifier(questionBlock(), qualifier);
    const editor = createBlockEditor(block, (next) => { block = next; }, () => block);
    document.body.append(editor);
    click(editor, 'Remove Multiple Perspectives qualifier');
    const prompt = editor.querySelector<HTMLTextAreaElement>('.block-editor__question-prompt')!;
    prompt.value = 'A revised question';
    prompt.dispatchEvent(new Event('input'));
    expect(block.qualifiers).toBeUndefined();
    expect((block.content as { questions: { prompt: string }[] }).questions[0]!.prompt).toBe('A revised question');
    expect(editor.querySelector('.kaplan-chip')).toBeNull();
  });
  it('cancels draft edits without changing the attachment or original activity', () => {
    let block: Block = withKaplanQualifier(questionBlock(), qualifier);
    const original = structuredClone(block);
    const editor = createKaplanEditor({ getBlock: () => block, onChange: (next) => { block = next; } });
    editor.querySelector<HTMLButtonElement>('.kaplan-chip')!.click();
    const focus = editor.querySelector<HTMLInputElement>('input')!;
    focus.value = 'changed'; focus.dispatchEvent(new Event('input'));
    click(editor, 'Cancel');
    expect(block).toEqual(original);
  });
});

describe('student and print views', () => {
  it('starts subtly collapsed, shows symbols, and preserves notes when moving between three steps', () => {
    const block = withKaplanQualifier(questionBlock(), qualifier);
    let view = renderBlock(block, 'student', { lessonId: 'lesson' });
    document.body.append(view);
    expect(view.querySelector<HTMLElement>('.kaplan-workspace')!.hidden).toBe(true);
    expect(view.querySelector('.kaplan-chip svg')).toBeTruthy();
    view.querySelector<HTMLButtonElement>('.kaplan-chip')!.click();
    expect(view.querySelectorAll('textarea')).toHaveLength(1);
    const notes = view.querySelector<HTMLTextAreaElement>('.kaplan-notes')!;
    notes.value = 'My visual image'; notes.dispatchEvent(new Event('input'));
    click(view, 'Next step');
    expect(view.querySelector('.kaplan-workspace__step-title')!.textContent).toBe('Consider two readings');
    click(view, 'Back');
    expect(view.querySelector<HTMLTextAreaElement>('.kaplan-notes')!.value).toBe('My visual image');
    view = renderBlock(block, 'student', { lessonId: 'lesson' });
    view.querySelector<HTMLButtonElement>('.kaplan-chip')!.click();
    expect(view.querySelector<HTMLTextAreaElement>('.kaplan-notes')!.value).toBe('My visual image');
  });
  it('does not mix notes across lessons or save teacher preview notes', () => {
    const block = withKaplanQualifier(questionBlock(), qualifier);
    for (const mode of ['teacher', 'student'] as const) {
      const view = renderBlock(block, mode, { lessonId: 'one' });
      view.querySelector<HTMLButtonElement>('.kaplan-chip')!.click();
      const notes = view.querySelector<HTMLTextAreaElement>('.kaplan-notes')!;
      notes.value = mode; notes.dispatchEvent(new Event('input'));
      if (mode === 'teacher') expect(localStorage.length).toBe(0);
    }
    const other = renderBlock(block, 'student', { lessonId: 'two' });
    other.querySelector<HTMLButtonElement>('.kaplan-chip')!.click();
    expect(other.querySelector<HTMLTextAreaElement>('.kaplan-notes')!.value).toBe('');
  });
  it('offers discussion without text boxes and reveals optional support only on demand', () => {
    const view = renderBlock(withKaplanQualifier(questionBlock(), { ...qualifier, mode: 'discussion' }), 'student');
    view.querySelector<HTMLButtonElement>('.kaplan-chip')!.click();
    expect(view.querySelector('textarea')).toBeNull();
    expect(view.querySelector<HTMLDetailsElement>('.kaplan-support')!.open).toBe(false);
    click(view, 'Next step'); click(view, 'Next step'); click(view, 'Return to the activity');
    expect(view.querySelector<HTMLElement>('.kaplan-workspace')!.hidden).toBe(true);
  });
  it('prints all three steps, keeps the original question and escapes teacher supplied text', () => {
    const malicious = { ...qualifier, focus: '<img src=x onerror=alert(1)>' };
    const view = renderBlock(withKaplanQualifier(questionBlock(), malicious), 'print');
    expect(view.querySelectorAll('.kaplan-qualifiers--print ol li')).toHaveLength(3);
    expect(view.textContent).toContain('How does the poet');
    expect(view.textContent).toContain(malicious.focus);
    expect(view.querySelector('img')).toBeNull();
    expect(view.querySelector('.kaplan-chip')).toBeNull();
  });
});
