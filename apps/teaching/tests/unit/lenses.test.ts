import { beforeEach, describe, expect, it } from 'vitest';
import { createBlock } from '@/blocks/create-block';
import { createBlockEditor } from '@/blocks/editors';
import { withKaplanQualifier } from '@/blocks/kaplan';
import { withLens } from '@/blocks/lenses/attachments';
import { createLensEditor } from '@/blocks/lenses/lens-editor';
import { storageKey } from '@/blocks/learning-activity';
import { renderBlock } from '@/blocks/render';
import type { Block } from '@/schemas/block';
import type { KaplanQualifier } from '@/schemas/kaplan';

const qualifier: KaplanQualifier = { lens: 'patterns', focus: 'power', mode: 'notes' };
const click = (root: ParentNode, text: string): void => {
  const button = [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text);
  expect(button, text).toBeTruthy();
  button!.click();
};
function questionBlock(): Block {
  const block = createBlock('question_set', 'qset');
  if (block.block_type !== 'question_set') throw Error('wrong block');
  block.content.questions[0]!.prompt = 'How does the composer represent power?';
  return block;
}
beforeEach(() => { document.body.replaceChildren(); localStorage.clear(); });

describe('Write it down', () => {
  it('ends every stepped lens in writing: notes, frame, checklist and a handover', () => {
    const view = renderBlock(withKaplanQualifier(questionBlock(), qualifier), 'student', { lessonId: 'lesson' });
    document.body.append(view);
    view.querySelector<HTMLButtonElement>('.kaplan-chip')!.click();
    const notes = view.querySelector<HTMLTextAreaElement>('.kaplan-notes')!;
    notes.value = 'The crown and the empty throne'; notes.dispatchEvent(new Event('input'));
    click(view, 'Next step'); click(view, 'Next step'); click(view, 'Next step');
    expect(view.querySelector('.kaplan-workspace__step-title')!.textContent).toBe('Write it down');
    expect(view.querySelector('.lens-found')!.textContent).toContain('The crown and the empty throne');
    expect(view.querySelector('.lens-frame')!.textContent).toContain('Both ___ and ___');
    expect(view.querySelector<HTMLTextAreaElement>('.lens-answer')!.value).toContain('Both ___ and ___');
    expect(view.querySelectorAll('.lens-checklist li')).toHaveLength(3);
    expect(view.querySelector('.lens-handover')!.textContent).toContain('won’t keep your answer');
    const answer = view.querySelector<HTMLTextAreaElement>('.lens-answer')!;
    answer.value = 'My finished sentence'; answer.dispatchEvent(new Event('input'));
    click(view, 'I’ve written it down');
    expect(view.querySelector<HTMLElement>('.kaplan-workspace')!.hidden).toBe(true);
    expect(view.querySelector('.kaplan-chip')!.classList.contains('kaplan-chip--done')).toBe(true);
    const again = renderBlock(withKaplanQualifier(questionBlock(), qualifier), 'student', { lessonId: 'lesson' });
    again.querySelector<HTMLButtonElement>('.kaplan-chip')!.click();
    expect(again.querySelector<HTMLTextAreaElement>('.lens-answer')!.value).toBe('My finished sentence');
  });
  it('gives discussion groups the frame without any typing', () => {
    const view = renderBlock(withKaplanQualifier(questionBlock(), { ...qualifier, mode: 'discussion' }), 'student');
    view.querySelector<HTMLButtonElement>('.kaplan-chip')!.click();
    click(view, '4. Write it down');
    expect(view.querySelector('textarea')).toBeNull();
    expect(view.querySelector('.lens-frame')).toBeTruthy();
    expect([...view.querySelectorAll('button')].some((b) => b.textContent === 'Copy')).toBe(false);
  });
  it('prints the frame, checklist and ruled lines after the steps', () => {
    const view = renderBlock(withKaplanQualifier(questionBlock(), qualifier), 'print');
    expect(view.querySelectorAll('.kaplan-qualifiers--print ol > li')).toHaveLength(3);
    expect(view.querySelector('.lens-write--print .lens-frame')).toBeTruthy();
    expect(view.querySelectorAll('.lens-lines__line').length).toBeGreaterThan(0);
  });
  it('restores Kaplan notes saved in the earlier three-item format', () => {
    const block = withKaplanQualifier(questionBlock(), qualifier);
    localStorage.setItem(`${storageKey('lesson', block.id)}.kaplan.patterns`, JSON.stringify({ step: 1, notes: ['a', 'b', 'c'] }));
    const view = renderBlock(block, 'student', { lessonId: 'lesson' });
    view.querySelector<HTMLButtonElement>('.kaplan-chip')!.click();
    expect(view.querySelector<HTMLTextAreaElement>('.kaplan-notes')!.value).toBe('b');
  });
});

describe('Add lens picker', () => {
  it('offers every framework from one menu item, grouped, with Discern under Judgement', () => {
    let block: Block = questionBlock();
    const editor = createLensEditor({ getBlock: () => block, onChange: (next) => { block = next; } });
    document.body.append(editor);
    const items = [...editor.querySelectorAll('.page-options__item')].map((item) => item.textContent);
    expect(items).toEqual(['Add lens…']);
    click(editor, 'Add lens…');
    expect([...editor.querySelectorAll('.kaplan-lens-group')].map((h) => h.textContent)).toEqual(['Kaplan', 'Literature', 'Judgement']);
    click(editor, 'DiscernInitial answer → against → for → step back');
    expect(editor.querySelector<HTMLElement>('.discern-setup')!.hidden).toBe(false);
  });
  it('hides the menu once every lens is attached', () => {
    let block: Block = questionBlock();
    for (const lens of ['patterns', 'multiple_perspectives', 'ethics'] as const) block = withKaplanQualifier(block, { ...qualifier, lens });
    block = withLens(block, 'windows_mirrors', { focus: '' });
    block = { ...block, discern: { mode: 'own', who: '', focus: '', source: '', initial: { type: 'write', preset: 'agree', options: [] } } };
    const editor = createLensEditor({ getBlock: () => block, onChange: (next) => { block = next; } });
    expect(editor.querySelector<HTMLElement>('.kaplan-author__options')!.hidden).toBe(true);
    expect(editor.querySelectorAll('.kaplan-chip, .discern-chip')).toHaveLength(5);
  });
});

describe('peer feedback', () => {
  it('carries the lens bar and keeps a lens when its own fields are edited', () => {
    const peer = createBlock('peer_feedback', 'peer');
    let block: Block = withKaplanQualifier(peer, qualifier);
    const editor = createBlockEditor(block, (next) => { block = next; }, () => block);
    document.body.append(editor);
    expect(editor.querySelector('.kaplan-author .kaplan-chip')).toBeTruthy();
    const prompt = editor.querySelector<HTMLTextAreaElement>('textarea')!;
    prompt.value = 'Write your thesis'; prompt.dispatchEvent(new Event('input'));
    expect(block.qualifiers).toEqual([qualifier]);
  });
});
