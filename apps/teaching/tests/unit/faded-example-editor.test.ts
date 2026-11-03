// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Block } from '@/schemas/block';
import { createFadedExampleEditor } from '@/blocks/faded-example-editor';
import type { FadedExampleBlock } from '@/blocks/faded-example';
import { fadedContent } from '@/schemas/faded';
import { listPublishBlockIssues } from '@/schemas/publish-block-issues';

type Content = Record<string, unknown>;

const oldShape: Content = {
  prompt: 'What does the writer do?',
  extract: 'The sea was a grey wall.',
  parts: [
    { label: 'Technique', answer: 'Metaphor' },
    { label: 'Where', answer: 'grey wall' },
    { label: 'Effect', answer: 'Feels closed in' }
  ],
  blanks: [2]
};

function make(content: Content): FadedExampleBlock {
  return { id: 'f1', type: 'block', block_type: 'faded_example', variant: 'medium', visibility: 'both', content } as unknown as FadedExampleBlock;
}

function mount(content: Content) {
  let current = make(content);
  const root = createFadedExampleEditor(current, (b) => { current = b; }, () => current);
  document.body.append(root);
  return { root, get: () => current, content: () => fadedContent(current) };
}

const newShape = (extra: Content = {}): Content => ({
  prompt: 'Q',
  part_labels: ['What', 'How', 'Why'],
  steps: [
    { id: 'a', extract: 'One', answers: ['a1', 'a2', 'a3'], blanks: [], question: { prompt: 'Why?', choices: ['x', 'y', 'z'], correct: 2 } },
    { id: 'b', extract: 'Two', answers: ['b1', 'b2', 'b3'], blanks: [2] }
  ],
  criteria: { What: ['w'], How: ['h'], Why: ['y'] },
  ...extra
});

const click = (root: HTMLElement, text: string) => {
  const b = [...root.querySelectorAll('button')].find((x) => x.textContent === text || x.getAttribute('aria-label') === text);
  if (!b) throw new Error(`no button ${text}`);
  b.click();
};
const type = (input: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
};
const partInput = (root: HTMLElement, i: number) =>
  [...root.querySelectorAll<HTMLInputElement>('.block-editor__faded-part input')][i]!;

describe('faded example editor', () => {
  it('adding a step sets suggested blanks and a fresh id', () => {
    const m = mount(newShape());
    click(m.root, 'Add step');
    const steps = m.content().steps;
    expect(steps).toHaveLength(3);
    expect(steps[2]!.blanks).toEqual([1, 2]);
    expect(steps[2]!.id).toMatch(/^f1_s/);
    expect(new Set(steps.map((s) => s.id)).size).toBe(3);
    expect(steps[2]!.question).toBeUndefined();
  });

  it('the first added step on a converted block gives step one the block id', () => {
    const m = mount(oldShape);
    expect(m.content().steps[0]!.id).toBeUndefined();
    click(m.root, 'Add step');
    const steps = m.content().steps;
    expect(steps[0]!.id).toBe('f1');
    expect(steps[1]!.id).not.toBe('f1');
    expect(steps[1]!.blanks).toEqual([2]);
  });

  it('removing a part corrects blanks, answers and criteria', () => {
    const m = mount(newShape());
    click(m.root, 'Remove part 2');
    const c = m.content();
    expect(c.part_labels).toEqual(['What', 'Why']);
    expect(c.steps.map((s) => s.answers)).toEqual([['a1', 'a3'], ['b1', 'b3']]);
    expect(c.steps[1]!.blanks).toEqual([1]);
    expect(c.criteria).toEqual({ What: ['w'], Why: ['y'] });
  });

  it('renaming a part moves its criteria and refuses duplicates', () => {
    const m = mount(newShape());
    type(partInput(m.root, 1), 'Method');
    expect(m.content().part_labels).toEqual(['What', 'Method', 'Why']);
    expect(m.content().criteria).toEqual({ What: ['w'], Method: ['h'], Why: ['y'] });
    const dup = partInput(m.root, 2);
    type(dup, 'What');
    expect(dup.getAttribute('aria-invalid')).toBe('true');
    expect(m.content().part_labels).toEqual(['What', 'Method', 'Why']);
    type(dup, '  ');
    expect(m.content().part_labels).toEqual(['What', 'Method', 'Why']);
  });

  it('shows a warning, then clears it when fixed', () => {
    const m = mount(newShape({ steps: [{ id: 'a', extract: 'One', answers: ['1', '2', '3'], blanks: [] }] }));
    const live = m.root.querySelector('[aria-live="polite"]')!;
    expect(live.textContent).toContain('One step does not fade');
    click(m.root, 'Add step');
    expect(live.textContent).not.toContain('One step does not fade');
  });

  it('keeps open panels and typing focus across a rebuild', () => {
    const m = mount(newShape());
    const second = m.root.querySelectorAll('details.block-editor__faded-step')[1]!;
    second.open = true;
    second.dispatchEvent(new Event('toggle'));
    const extract = m.root.querySelector<HTMLTextAreaElement>('details textarea')!;
    type(extract, 'Changed');
    expect(m.root.querySelector('details.block-editor__faded-step textarea')).toBe(extract);
    click(m.root, 'Add step');
    const panels = m.root.querySelectorAll('details.block-editor__faded-step');
    expect(panels[0]!.open).toBe(true);
    expect(panels[1]!.open).toBe(true);
  });

  it('criteria ignore blank lines and cap at four', () => {
    const m = mount(newShape());
    const box = [...m.root.querySelectorAll<HTMLTextAreaElement>('.block-editor__faded-criteria textarea')][0]!;
    type(box, 'a\n\n b \nc\nd\ne\n');
    expect(m.content().criteria.What).toEqual(['a', 'b', 'c', 'd']);
    expect(box.value).toBe('a\n\n b \nc\nd\ne\n');
  });

  it('toggling blank swaps the question fields and fixes choices', () => {
    const m = mount(newShape());
    const second = () => m.root.querySelectorAll('details.block-editor__faded-step')[1]!;
    expect(second().querySelector('fieldset')).toBeNull();
    const boxes = () => second().querySelectorAll<HTMLInputElement>('input[type=checkbox]');
    boxes()[2]!.checked = false;
    boxes()[2]!.dispatchEvent(new Event('change', { bubbles: true }));
    expect(m.content().steps[1]!.blanks).toEqual([]);
    expect(m.content().steps[1]!.question).toEqual({ prompt: '', choices: ['', ''], correct: 0 });
    boxes()[0]!.checked = true;
    boxes()[0]!.dispatchEvent(new Event('change', { bubbles: true }));
    expect(m.content().steps[1]!.question).toBeUndefined();
    // removing a choice below the correct one corrects it
    const first = m.root.querySelectorAll('details.block-editor__faded-step')[0]!;
    [...first.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Remove choice 1')!.click();
    expect(m.content().steps[0]!.question).toMatchObject({ choices: ['y', 'z'], correct: 1 });
  });
});

describe('publish checks for faded examples', () => {
  const block = (content: Content) => ({ ...make(content), created_at: 'x', updated_at: 'x' }) as unknown as Block;

  it('blocks a blank part with no criteria', () => {
    const issues = listPublishBlockIssues([block(newShape({ criteria: { What: ['w'], How: ['h'] } }))]);
    expect(issues).toHaveLength(1);
  });

  it('does not block on warnings alone', () => {
    const issues = listPublishBlockIssues([
      block(newShape({ steps: [{ id: 'a', extract: 'One', answers: ['1', '2', '3'], blanks: [2] }] }))
    ]);
    expect(issues).toHaveLength(0);
  });
});
