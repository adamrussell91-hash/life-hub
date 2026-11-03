import { beforeEach, describe, expect, it } from 'vitest';
import { BlockSchema, type Block } from '@/schemas/block';
import { cloneBlockWithNewIds, createBlock } from '@/blocks/create-block';
import { renderAnnotationBlock } from '@/blocks/render';
import { createExemplarEditor, exemplarPieces, exemplarPrompt, type Exemplar } from '@/blocks/annotation-exemplar';
import { filterBlocksForStudent } from '@/blocks/visibility';

type Annotation = Extract<Block, { block_type: 'annotation' }>;

const line = (id: string, text: string) => ({ id, text });
function exemplarBlock(exemplar?: Partial<Exemplar>): Annotation {
  const base = createBlock('annotation', 'ex1') as Annotation;
  return {
    ...base,
    content: {
      ...base.content,
      title: 'Topic sentences',
      text: {
        kind: 'prose',
        stanzas: [
          { id: 'st_a', lines: [line('l1', 'The storm in the novel mirrors the family breaking apart.')] },
          { id: 'st_b', lines: [line('l2', 'There is a storm in chapter three.')] }
        ]
      },
      exemplar: exemplar ? ({ kind: 'compare', labels: [], hide_labels: false, questions: [], ...exemplar } as Exemplar) : undefined
    }
  };
}

beforeEach(() => document.body.replaceChildren());

describe('exemplar schema and pieces', () => {
  it('round-trips through the block schema', () => {
    const block = exemplarBlock({ kind: 'counter', split_at: 'st_b', hide_labels: true, focus: 'a metaphor', questions: [{ id: 'q1', kind: 'why', text: 'Why is this one the example?' }] });
    const parsed = BlockSchema.parse(block) as Annotation;
    expect(parsed.content.exemplar).toMatchObject({ kind: 'counter', split_at: 'st_b', hide_labels: true });
  });
  it('splits two-piece kinds at the chosen stanza with default labels', () => {
    const pieces = exemplarPieces(exemplarBlock({ split_at: 'st_b' }).content)!;
    expect(pieces.map((p) => [p.label, p.stanzaIds])).toEqual([['Stronger', ['st_a']], ['Nearly there', ['st_b']]]);
  });
  it('keeps the whole text as one piece without a usable split', () => {
    expect(exemplarPieces(exemplarBlock({}).content)).toHaveLength(1);
    expect(exemplarPieces(exemplarBlock({ split_at: 'st_a' }).content)).toHaveLength(1);
    expect(exemplarPieces(exemplarBlock({ kind: 'single', split_at: 'st_b' }).content)).toHaveLength(1);
    expect(exemplarPieces(exemplarBlock().content)).toBeNull();
  });
  it('asks "Which one…?" only while labels are hidden', () => {
    const ex = (patch: Partial<Exemplar>) => ({ kind: 'counter', labels: [], hide_labels: true, questions: [], ...patch }) as Exemplar;
    expect(exemplarPrompt(ex({ focus: 'a metaphor' }))).toBe('Which one is an example of a metaphor?');
    expect(exemplarPrompt(ex({ kind: 'compare', focus: 'an arguable claim' }))).toBe('Which one shows an arguable claim better?');
    expect(exemplarPrompt(ex({ hide_labels: false, focus: 'a metaphor' }))).toBe('Example and counterexample: a metaphor');
  });
  it('keeps the split on a duplicate', () => {
    let n = 0;
    const copy = cloneBlockWithNewIds(exemplarBlock({ split_at: 'st_b' }), () => `id_${++n}`) as Annotation;
    expect(copy.content.exemplar!.split_at).toBe(copy.content.text.stanzas[1]!.id);
  });
  it('reaches students, since they read it', () => {
    const [student] = filterBlocksForStudent([exemplarBlock({ split_at: 'st_b' })]) as Annotation[];
    expect(student!.content.exemplar?.kind).toBe('compare');
  });
});

describe('the exemplar view', () => {
  it('sets two pieces side by side with their labels and questions', () => {
    const view = renderAnnotationBlock(exemplarBlock({ split_at: 'st_b', questions: [{ id: 'q1', kind: 'what', text: 'What does the stronger one do?' }] }), 'student');
    const pieces = view.querySelectorAll('.block-annotation__stanzas--pieces > .block-annotation__piece');
    expect(pieces).toHaveLength(2);
    expect(pieces[0]!.querySelector('.block-annotation__piece-name')!.textContent).toBe('Stronger');
    expect(pieces[1]!.querySelector('[data-stanza-id="st_b"]')).toBeTruthy();
    expect(view.querySelector('.block-annotation')?.dataset.exemplarRevealed ?? (view as HTMLElement).dataset.exemplarRevealed).toBe('true');
    expect(view.textContent).toContain('What does the stronger one do?');
    expect(view.textContent).toContain('Answer in your book.');
  });
  it('hides the labels as A and B until Reveal', () => {
    const view = renderAnnotationBlock(exemplarBlock({ kind: 'counter', split_at: 'st_b', hide_labels: true, focus: 'a metaphor', questions: [{ id: 'q1', kind: 'why', text: 'Why?' }] }), 'student');
    const root = (view.matches('.block-annotation') ? view : view.querySelector('.block-annotation')) as HTMLElement;
    expect(root.dataset.exemplarRevealed).toBe('false');
    expect(view.querySelector('.block-annotation__exemplar-prompt')!.textContent).toBe('Which one is an example of a metaphor?');
    expect(view.querySelector('.block-annotation__piece-placeholder')!.textContent).toBe('A');
    view.querySelector<HTMLButtonElement>('.block-annotation__exemplar-reveal')!.click();
    expect(root.dataset.exemplarRevealed).toBe('true');
    expect(view.querySelector('.block-annotation__exemplar-reveal')).toBeNull();
  });
  it('prints the pieces and questions with nothing to press', () => {
    const view = renderAnnotationBlock(exemplarBlock({ split_at: 'st_b', hide_labels: true, questions: [{ id: 'q1', kind: 'how', text: 'How would you fix B?' }] }), 'print');
    expect(view.querySelectorAll('.block-annotation__piece')).toHaveLength(2);
    expect(view.querySelector('.block-annotation__exemplar-reveal')).toBeNull();
    expect(view.querySelector('.block-annotation__exemplar--print')!.textContent).toContain('How would you fix B?');
  });
  it('leaves an ordinary annotation alone', () => {
    const view = renderAnnotationBlock(exemplarBlock(), 'student');
    expect(view.querySelector('.block-annotation__exemplar')).toBeNull();
    expect(view.querySelector('.block-annotation__piece')).toBeNull();
  });
});

describe('the exemplar editor', () => {
  it('turns an annotation into a hidden comparison with a question, then back', () => {
    let block = exemplarBlock();
    const editor = createExemplarEditor(() => block, (next) => { block = next; });
    document.body.append(editor);
    const kind = editor.querySelector<HTMLSelectElement>('.block-editor__exemplar-kind')!;
    kind.value = 'counter';
    kind.dispatchEvent(new Event('change'));
    expect(block.content.exemplar?.kind).toBe('counter');
    const split = editor.querySelector<HTMLSelectElement>('.block-editor__exemplar-split')!;
    expect([...split.options].map((o) => o.value)).toEqual(['', 'st_b']);
    split.value = 'st_b';
    split.dispatchEvent(new Event('change'));
    const hide = editor.querySelector<HTMLInputElement>('.block-editor__exemplar-hide')!;
    hide.checked = true;
    hide.dispatchEvent(new Event('change'));
    editor.querySelector<HTMLButtonElement>('.block-editor__exemplar-qadd')!.click();
    const text = editor.querySelector<HTMLInputElement>('.block-editor__exemplar-qtext')!;
    text.value = 'What makes A the example?';
    text.dispatchEvent(new Event('change'));
    expect(block.content.exemplar).toMatchObject({ kind: 'counter', split_at: 'st_b', hide_labels: true, questions: [{ kind: 'what', text: 'What makes A the example?' }] });
    expect(BlockSchema.safeParse(block).success).toBe(true);
    const again = editor.querySelector<HTMLSelectElement>('.block-editor__exemplar-kind')!;
    again.value = '';
    again.dispatchEvent(new Event('change'));
    expect(block.content.exemplar).toBeUndefined();
  });
});
