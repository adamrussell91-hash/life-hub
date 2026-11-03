import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderFadedExample, fadedModeText, FADED_EVENT, type FadedExampleBlock } from '@/blocks/faded-example';
import { checkAttempt } from '@/blocks/faded-attempt';
import { LECTURE_ANSWERED } from '@/lecture/answered';
import { isGate, takesSidePath } from '@/lecture/scenes';

const GOOD = 'The road keeps bending back on itself again';
const GOOD2 = 'That bending makes the traveller feel quite lost';

type Step = FadedExampleBlock['content']['steps'][number];
const mkBlock = (id: string, steps: Step[], extra: Partial<FadedExampleBlock['content']> = {}): FadedExampleBlock =>
  ({
    id, type: 'block', block_type: 'faded_example', variant: 'medium', visibility: 'student_teacher',
    content: {
      prompt: 'Name the effect.',
      part_labels: ['Technique', 'Effect'],
      steps,
      criteria: { Technique: ['Names the device'], Effect: ['Says what it shows', 'Quotes the extract'] },
      ...extra
    }
  }) as FadedExampleBlock;
const step = (id: string, blanks: number[], more: Partial<Step> = {}): Step => ({
  id, extract: `Extract ${id}`, answers: [`Tech ${id}`, `Model effect ${id}`], blanks, ...more
});
const worked = step('w', [], { question: { prompt: 'Why does it work?', choices: ['Wrong one', 'Right one'], correct: 1 } });
const writing = mkBlock('f1', [step('s1', [1])]);

const cleanups: Array<() => void> = [];
function listen(type: string, fn: (d: unknown) => void): void {
  const h = (e: Event) => fn((e as CustomEvent).detail);
  document.body.addEventListener(type, h);
  cleanups.push(() => document.body.removeEventListener(type, h));
}
afterEach(() => {
  cleanups.splice(0).forEach((c) => c());
  document.body.innerHTML = '';
  localStorage.clear();
});

const mount = (b: FadedExampleBlock, opts = {}) => {
  const el = renderFadedExample(b, 'student', opts);
  document.body.append(el);
  return el;
};
const click = (el: Element | null) => (el as HTMLButtonElement).click();
const write = (root: HTMLElement, ...texts: string[]) =>
  root.querySelectorAll<HTMLTextAreaElement>('textarea').forEach((t, i) => {
    t.value = texts[i] ?? texts[0]!;
    t.dispatchEvent(new Event('input'));
  });
const toTick = (root: HTMLElement, ...texts: string[]) => {
  write(root, ...(texts.length ? texts : [GOOD]));
  click(root.querySelector('.block-faded__check'));
};
const tickAll = (root: HTMLElement) =>
  root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((b) => {
    b.checked = true;
    b.dispatchEvent(new Event('change'));
  });

describe('checkAttempt', () => {
  it('sorts short, odd and real attempts', () => {
    expect(checkAttempt(['one two three four'])).toBe('short');
    expect(checkAttempt(['mmmmmmm one two three four'])).toBe('odd');
    expect(checkAttempt([GOOD])).toBe('ok');
  });
});

describe('fadedModeText', () => {
  it('names what the student does', () => {
    const labels = ['What', 'How', 'Why'];
    expect(fadedModeText(step('a', []), labels)).toBe('Worked example');
    expect(fadedModeText(step('a', [2]), labels)).toBe('You write the why');
    expect(fadedModeText(step('a', [1, 2]), labels)).toBe('You write the how and why');
    expect(fadedModeText(step('a', [0, 1, 2]), labels)).toBe('You write all 3 parts');
  });
});

describe('worked step', () => {
  it('retries a wrong choice and shows next on the right one', () => {
    const root = mount(mkBlock('f', [worked, step('s', [1])]));
    expect(root.querySelector('.block-faded__next')).toBeNull();
    const choices = () => [...root.querySelectorAll<HTMLButtonElement>('.block-faded__choice')];
    click(choices()[0]!);
    expect(root.querySelector('.block-faded__nudge')?.textContent).toBe('Look again and choose another.');
    expect(root.querySelector('.block-faded__next')).toBeNull();
    click(choices()[1]!);
    expect(root.querySelector('.block-faded__nudge')?.textContent).toBe('Yes.');
    expect(root.querySelector('.block-faded__next')).not.toBeNull();
  });

  it('shows next at once when there is no question', () => {
    const root = mount(mkBlock('f', [step('w', []), step('s', [1])]));
    expect(root.querySelector('.block-faded__next')).not.toBeNull();
  });
});

describe('writing step', () => {
  it('keeps a short attempt in write', () => {
    const root = mount(writing);
    toTick(root, 'too few words');
    expect(root.querySelector('.block-faded__nudge')?.textContent).toBe('Write a full sentence in each box, then check it.');
    expect(root.querySelector('fieldset')).toBeNull();
    expect(root.querySelector<HTMLTextAreaElement>('textarea')!.readOnly).toBe(false);
  });

  it('asks about an odd attempt once, then lets the second press through', () => {
    const root = mount(writing);
    toTick(root, 'mmmmmmm is what I really wanted to say');
    expect(root.querySelector('.block-faded__nudge')?.textContent).toBe('Is that what you meant to write?');
    expect(root.querySelector('fieldset')).toBeNull();
    click(root.querySelector('.block-faded__check'));
    expect(root.querySelector('fieldset')).not.toBeNull();
  });

  it('keeps the model out of the DOM until the model stage', () => {
    const root = mount(writing);
    expect(root.textContent).not.toContain('Model effect s1');
    toTick(root);
    expect(root.textContent).not.toContain('Model effect s1');
    expect(root.textContent).toContain('Tech s1');
    click(root.querySelector('.block-faded__model-btn'));
    expect(root.textContent).toContain('Model effect s1');
  });

  it('Improve keeps the text and re-Check clears the ticks', () => {
    const root = mount(writing);
    toTick(root);
    expect(root.querySelector('.block-faded__improve')?.className).toContain('btn--primary');
    tickAll(root);
    expect(root.querySelector('.block-faded__model-btn')?.className).toContain('btn--primary');
    click(root.querySelector('.block-faded__improve'));
    const area = root.querySelector<HTMLTextAreaElement>('textarea')!;
    expect(area.value).toBe(GOOD);
    expect(area.readOnly).toBe(false);
    click(root.querySelector('.block-faded__check'));
    expect([...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].every((b) => !b.checked)).toBe(true);
  });
});

describe('sequence', () => {
  const three = mkBlock('f3', [step('a', [1]), step('b', [1]), step('c', [0, 1])]);

  it('disables later steps for students and opens them when unlocked', () => {
    const rail = () => [...document.querySelectorAll<HTMLButtonElement>('.block-faded-rail__mark')];
    mount(three);
    expect(rail().map((b) => b.disabled)).toEqual([false, true, true]);
    expect(rail()[0]!.getAttribute('aria-current')).toBe('step');
    document.body.innerHTML = '';
    mount(three, { unlocked: true });
    expect(rail().every((b) => !b.disabled)).toBe(true);
  });

  it('fires FADED_EVENT per writing step and LECTURE_ANSWERED once', () => {
    const faded = vi.fn();
    const answered = vi.fn();
    listen(FADED_EVENT, faded);
    listen(LECTURE_ANSWERED, answered);
    const root = mount(three);
    toTick(root);
    tickAll(root);
    click(root.querySelector('.block-faded__model-btn'));
    expect(faded).toHaveBeenCalledWith({ blockId: 'f3', stepKey: 'a', parts: { 1: GOOD }, rating: 'right' });
    expect(answered).not.toHaveBeenCalled();
    click(root.querySelector('.block-faded__next'));
    toTick(root, GOOD2);
    click(root.querySelector('.block-faded__model-btn'));
    expect(faded).toHaveBeenLastCalledWith({ blockId: 'f3', stepKey: 'b', parts: { 1: GOOD2 }, rating: 'wrong' });
    expect(answered).not.toHaveBeenCalled();
    click(root.querySelector('.block-faded__next'));
    toTick(root, GOOD, GOOD2);
    click(root.querySelector('.block-faded__model-btn'));
    expect(faded).toHaveBeenCalledTimes(3);
    expect(answered).toHaveBeenCalledTimes(1);
    expect(root.querySelector('.block-faded__finish-head')?.textContent).toBe('You wrote the whole answer yourself');
  });

  it('restores the saved stage without firing events', () => {
    const first = mount(three);
    toTick(first);
    first.remove();
    const faded = vi.fn();
    const answered = vi.fn();
    listen(FADED_EVENT, faded);
    listen(LECTURE_ANSWERED, answered);
    const again = mount(three);
    expect(again.querySelector('fieldset')).not.toBeNull();
    expect(again.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe(GOOD);
    click(again.querySelector('.block-faded__model-btn'));
    expect(faded).toHaveBeenCalledTimes(1);
    again.remove();
    const done = mount(three);
    expect(done.querySelector('.block-faded-rail__mark--on')?.textContent).toContain('2');
    click(done.querySelector('.block-faded-rail__mark'));
    expect(done.textContent).toContain('Model effect a');
    expect(faded).toHaveBeenCalledTimes(1);
    expect(answered).not.toHaveBeenCalled();
  });
});

describe('old saved shape and converted blocks', () => {
  const old = { id: 'old1', type: 'block', block_type: 'faded_example', variant: 'medium', visibility: 'student_teacher',
    content: { prompt: 'p', extract: 'e', parts: [{ label: 'Technique', answer: 'Cyclical' }, { label: 'Effect', answer: 'Lonely' }], blanks: [1] } } as unknown as FadedExampleBlock;

  it('renders with no rail and keys storage by the block id; old saved work restores at the model', () => {
    localStorage.setItem('teaching-hub.activity.local.old1', JSON.stringify({ parts: { 1: 'It feels sad' }, rating: 'right' }));
    const faded = vi.fn();
    listen(FADED_EVENT, faded);
    const root = mount(old);
    expect(root.querySelector('.block-faded-rail')).toBeNull();
    expect(root.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('It feels sad');
    expect(root.textContent).toContain('Lonely');
    expect([...root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].every((b) => b.checked)).toBe(true);
    expect(faded).not.toHaveBeenCalled();
  });

  it('writes new work under the block id', () => {
    const root = mount(old);
    toTick(root);
    expect(JSON.parse(localStorage.getItem('teaching-hub.activity.local.old1')!).stage).toBe('tick');
  });
});

describe('teacher and print', () => {
  it('teacher sees every answer, the correct choice and criteria; print leaves blanks empty', () => {
    const b = mkBlock('f', [worked, step('s', [1])]);
    const teacher = renderFadedExample(b, 'teacher');
    expect(teacher.textContent).toContain('Model effect s');
    expect(teacher.textContent).toContain('Student writes');
    expect(teacher.textContent).toContain('Says what it shows');
    expect(teacher.querySelector('.block-faded__choices .block-faded__model')?.textContent).toBe('Right one');
    const print = renderFadedExample(b, 'print');
    expect(print.textContent).not.toContain('Model effect s');
    expect(print.querySelector('.block-faded__check')).toBeNull();
  });
});

describe('gate', () => {
  it('is a gate when it has a writing step and takes a side path', () => {
    expect(isGate(writing)).toBe(true);
    expect(isGate(mkBlock('f', [step('w', [])]))).toBe(false);
    expect(isGate(mkBlock('f', [step('s', [1])], { gate: false }))).toBe(false);
    expect(takesSidePath(writing)).toBe(true);
  });
});
