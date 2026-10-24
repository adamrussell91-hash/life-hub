import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBlock } from '@/blocks/create-block';
import type { Block } from '@/schemas/block';
import { mountBlockCanvas } from '@/teacher/lesson-canvas/mount-page';
import { ROW_REVEAL_EVENT } from '@/teacher/lesson-canvas/quiz-deck';
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
});
