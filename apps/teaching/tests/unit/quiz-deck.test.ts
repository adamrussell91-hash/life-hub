import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBlock } from '@/blocks/create-block';
import { renderBlock } from '@/blocks/render';
import type { Block } from '@/schemas/block';
import { mountBlockCanvas } from '@/teacher/lesson-canvas/mount-page';
import { ROW_REVEAL_EVENT } from '@/blocks/quiz-deck';
import { clickBlockMenuAction } from './helpers/block-edit';

const visibleQuiz = (host: HTMLElement) =>
  Array.from(host.querySelectorAll<HTMLElement>('.lesson-page__block[data-block-type="quiz_question"]'))
    .filter((row) => !row.hidden)
    .map((row) => row.dataset.blockId);

const button = (host: HTMLElement, label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;

describe('quiz question deck', () => {
  let host: HTMLElement;
  let blocks: Block[];

  beforeEach(() => {
    localStorage.clear();
    host = document.createElement('div');
    document.body.append(host);
    blocks = [createBlock('heading', 'h1'), ...['q1', 'q2', 'q3'].map((id) => createBlock('quiz_question', id)), createBlock('heading', 'h2')];
  });

  afterEach(() => {
    host.remove();
  });

  const mount = () => mountBlockCanvas(host, { blocks, onChange: vi.fn(), idFactory: () => 'new_x' });

  it('shows a run of questions one card at a time and leaves other blocks alone', () => {
    mount();
    expect(host.querySelectorAll('.qz-deck')).toHaveLength(1);
    expect(visibleQuiz(host)).toEqual(['q1']);
    expect(host.querySelector('.qz-deck__count')?.textContent).toBe('Question 1 of 3');
    expect(host.querySelector('.lesson-page__block[data-block-id="h2"]')?.closest('.qz-deck')).toBeNull();
    expect(button(host, 'Previous question').disabled).toBe(true);
  });

  it('moves with the arrows, the strip and the keyboard', () => {
    mount();
    button(host, 'Next question').click();
    expect(visibleQuiz(host)).toEqual(['q2']);
    host.querySelectorAll<HTMLButtonElement>('.qz-deck__strip .qz-dot')[2]!.click();
    expect(visibleQuiz(host)).toEqual(['q3']);
    expect(button(host, 'Next question').disabled).toBe(true);
    host.querySelector('.qz-deck__bar')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(visibleQuiz(host)).toEqual(['q2']);
  });

  it('stays on the card being edited across re-renders', () => {
    mount();
    button(host, 'Next question').click();
    clickBlockMenuAction(host, '.lesson-page__block[data-block-id="q2"]', 'edit');
    expect(visibleQuiz(host)).toEqual(['q2']);
    expect(host.querySelector('.lesson-page__block[data-block-id="q2"]')?.classList.contains('lesson-page__block--selected')).toBe(true);
  });

  it('flips to a list and back, kept on the device', () => {
    mount();
    button(host, 'Show the questions as a list').click();
    expect(host.querySelector('.qz-deck')).toBeNull();
    expect(visibleQuiz(host)).toEqual(['q1', 'q2', 'q3']);
    host.remove();
    host = document.createElement('div');
    document.body.append(host);
    mount();
    expect(host.querySelector('.qz-deck')).toBeNull();
    button(host, 'Show the questions as cards').click();
    expect(visibleQuiz(host)).toEqual(['q1']);
  });

  it('turns to a card Ann wants on screen and marks her suggestions on the strip', async () => {
    mount();
    const row = (id: string) => host.querySelector<HTMLElement>(`.lesson-page__block[data-block-id="${id}"]`)!;
    const card = document.createElement('article');
    row('q3').append(card);
    card.dispatchEvent(new CustomEvent(ROW_REVEAL_EVENT, { bubbles: true }));
    expect(visibleQuiz(host)).toEqual(['q3']);

    row('q2').classList.add('ann-target');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const dots = host.querySelectorAll<HTMLElement>('.qz-deck__strip .qz-dot');
    expect(dots[1]!.dataset.ann).toBe('true');
    expect(dots[0]!.dataset.ann).toBeUndefined();
  });

  it('keeps a single question as a plain block', () => {
    blocks = [createBlock('quiz_question', 'q1')];
    mount();
    expect(host.querySelector('.qz-deck')).toBeNull();
  });

  it('decks the questions inside a section for the teacher, and leaves print and students alone', () => {
    const section = createBlock('section', 's1');
    if (section.block_type !== 'section') throw new Error('section');
    section.content.blocks = ['q1', 'q2', 'q3'].map((id) => createBlock('quiz_question', id));
    const teacher = renderBlock(section, 'teacher');
    host.append(teacher);
    expect(teacher.querySelectorAll('.qz-deck')).toHaveLength(1);
    expect(visibleQuiz(host)).toEqual([]);
    const shown = () => Array.from(teacher.querySelectorAll<HTMLElement>('.qz-deck__card')).filter((c) => !c.hidden).length;
    expect(shown()).toBe(1);
    button(host, 'Next question').click();
    expect(teacher.querySelector('.qz-deck__count')?.textContent).toBe('Question 2 of 3');
    button(host, 'Show the questions as a list').click();
    expect(teacher.querySelector('.qz-deck')).toBeNull();
    expect(teacher.querySelectorAll('[hidden]')).toHaveLength(0);
    button(host, 'Show the questions as cards').click();
    expect(teacher.querySelector('.qz-deck__count')?.textContent).toBe('Question 2 of 3');

    expect(renderBlock(section, 'print').querySelector('.qz-deck')).toBeNull();
    expect(renderBlock(section, 'student').querySelector('.qz-deck')).toBeNull();
  });
});

describe('quiz deck for a student answering in place', () => {
  const quiz = (id: string) => ({ id, type: 'block', block_type: 'quiz_question', content: { question: { id, kind: 'true_false', prompt: `Prompt ${id}`, marks: 1 } } }) as unknown as Block;
  const section = (blocks: Block[]) => ({ id: 's1', type: 'block', block_type: 'section', content: { title: 'Part', blocks } }) as unknown as Block;
  // A deck remembers its last card by block id, so each test has its own ids.
  let run = 0;
  const shown = (host: HTMLElement) =>
    Array.from(host.querySelectorAll<HTMLElement>('.qz-deck__card'))
      .filter((card) => !card.hidden)
      .map((card) => card.querySelector<HTMLElement>('[data-slot]')?.dataset.slot);

  const mount = (ctx: { quizSlot?: (id: string) => HTMLElement }) => {
    run += 1;
    const host = document.createElement('div');
    host.append(renderBlock(section(['q1', 'q2', 'q3'].map((id) => quiz(`${id}-${run}`))), 'student', ctx));
    return host;
  };
  const slotted = () => {
    const slots = new Map<string, HTMLElement>();
    const quizSlot = (id: string) => {
      const short = id.split('-')[0]!;
      const slot = document.createElement('div');
      slot.dataset.slot = short;
      slots.set(short, slot);
      return slot;
    };
    return { slots, host: mount({ quizSlot }) };
  };

  it('turns a nested run into one card at a time, with no List switch', () => {
    localStorage.setItem('teaching_quiz_deck_list_v1', '1');
    const { host } = slotted();
    expect(shown(host)).toEqual(['q1']);
    expect(host.querySelector('.qz-deck__mode')).toBeNull();
    localStorage.clear();
  });

  it('never flags a student copy as not ready, though it holds no answers', () => {
    const { host } = slotted();
    expect(host.querySelector('.qz-dot[data-warn]')).toBeNull();
  });

  it('leaves the list alone where questions are not answered in place', () => {
    expect(mount({}).querySelector('.qz-deck')).toBeNull();
  });

  it('moves with Back and Next under the card, each hiding at its end', () => {
    const { host } = slotted();
    const [back, next] = Array.from(host.querySelectorAll<HTMLButtonElement>('.qz-deck__foot button'));
    expect(back!.hidden).toBe(true);
    next!.click();
    next!.click();
    expect(shown(host)).toEqual(['q3']);
    expect(next!.hidden).toBe(true);
    back!.click();
    expect(shown(host)).toEqual(['q2']);
  });

  it('turns to a slot asked for from outside the deck', () => {
    const { host, slots } = slotted();
    slots.get('q3')!.dispatchEvent(new CustomEvent(ROW_REVEAL_EVENT, { bubbles: true }));
    expect(shown(host)).toEqual(['q3']);
  });

  it('marks answered questions on the strip', async () => {
    const { host, slots } = slotted();
    slots.get('q2')!.dataset.quizAnswered = 'true';
    await new Promise((resolve) => setTimeout(resolve, 0));
    const dots = host.querySelectorAll<HTMLElement>('.qz-deck__strip .qz-dot');
    expect(dots[0]!.dataset.state).toBe('now');
    expect(dots[1]!.dataset.state).toBe('done');
    expect(dots[2]!.dataset.state).toBeUndefined();
  });

  it('a sideways swipe moves it, a tap or a swipe from a text box does not', () => {
    const { host, slots } = slotted();
    const track = host.querySelector<HTMLElement>('.qz-deck__track')!;
    const swipe = (target: HTMLElement, dx: number) => {
      const fire = (type: string, x: number) => target.dispatchEvent(Object.assign(new Event(type, { bubbles: true }), { pointerType: 'touch', clientX: x, clientY: 100 }));
      fire('pointerdown', 200);
      fire('pointerup', 200 + dx);
    };
    swipe(track, 5);
    expect(shown(host)).toEqual(['q1']);
    swipe(track, -100);
    expect(shown(host)).toEqual(['q2']);
    const box = document.createElement('textarea');
    slots.get('q2')!.append(box);
    swipe(box, -100);
    expect(shown(host)).toEqual(['q2']);
  });
});
