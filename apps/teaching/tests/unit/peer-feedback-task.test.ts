import { describe, it, expect } from 'vitest';
import { parseTask, taskCard, verbMeaning } from '@/blocks/peer-feedback-task';

const prompt = `Locate one paradox or anomaly within the poem. Describe it, highlighting from the distinction activity above how it is paradox/anomaly (internal/external).
Explain how the poet uses this inconsistency to invite responders to consider an everyday scene in a new light (think about defamiliarisation here.)
One paragraph with at least one QTE/A.`;

describe('peer feedback task card', () => {
  it('chunks the prompt into one step per command word, with cues and success criteria pulled out', () => {
    const task = parseTask(prompt);
    expect(task.steps.map((s) => s.verb)).toEqual(['Locate', 'Describe', 'Explain']);
    expect(task.steps[1]!.text).toContain('(internal/external).');
    expect(task.steps[1]!.hint).toBeNull();
    expect(task.steps[2]!.text).toBe('Explain how the poet uses this inconsistency to invite responders to consider an everyday scene in a new light');
    expect(task.steps[2]!.hint).toBe('Think about defamiliarisation');
    expect(task.criteria).toEqual(['One paragraph', 'At least one QTE/A']);
  });

  it('keeps sentences together when the next one does not open with a command word', () => {
    const task = parseTask('Explain the turn in the poem. It happens late.');
    expect(task.steps).toHaveLength(1);
    expect(task.steps[0]!.text).toBe('Explain the turn in the poem. It happens late.');
  });

  it('leaves a plain prompt as a single unnumbered-verb step', () => {
    const task = parseTask('What is your strongest argument?');
    expect(task.steps).toEqual([{ verb: null, text: 'What is your strongest argument?', hint: null }]);
    expect(task.criteria).toEqual([]);
  });

  it('a command word chip opens what the word asks for', () => {
    expect(verbMeaning('Explain')).toMatch(/how and why/);
    const card = taskCard(prompt);
    const chip = card.querySelector<HTMLButtonElement>('.pf-verb')!;
    const define = card.querySelector<HTMLElement>('.pf-task__define')!;
    expect(chip.textContent).toBe('Locate');
    expect(define.hidden).toBe(true);
    chip.click();
    expect(define.hidden).toBe(false);
    expect(chip.getAttribute('aria-expanded')).toBe('true');
    expect(card.querySelectorAll('.pf-task__step')).toHaveLength(3);
    expect(card.querySelectorAll('.pf-criteria__item')).toHaveLength(2);
    expect(card.querySelectorAll('.pf-task__num')).toHaveLength(3);
  });

  it('a one-step prompt is not numbered', () => {
    const card = taskCard("Watson's poetry offers a qualified solution. What is it?");
    expect(card.querySelectorAll('.pf-task__step')).toHaveLength(1);
    expect(card.querySelector('.pf-task__num')).toBeNull();
  });
});
