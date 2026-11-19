import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountLabBoard } from '@/lab/board';
import type { LabBoard, LabTeacherApi } from '@/lab/api';
import { setResult } from '@/lab/model';
import { seedLab, type LabSettings } from '@/lab/schema';
import type { Lesson } from '@/schemas/lesson';

// An invented lab for an invented class of 17.
const SETTINGS: LabSettings = {
  ...seedLab('class1'), question: 'Does the passive voice shrink the blame?', same: 'The events and their order.', options: ['Active', 'Passive'],
  texts: ['The company dumped waste.', 'Waste was dumped.'], judge_question: 'How much is the company to blame?', debrief: 'Ask who is missing.'
};
const STEPS = ['Question', 'Predict', 'Test', 'Result', 'Explain'] as const;
const SESSION = 'a'.repeat(32);
const RESULT = setResult({ judge: 'rate', options: 2, picks: [], ratings: [[8, 8, 7], [5, 5, 6]], predictions: [2, 4], readers: 6, threshold: 1 });
const at = (step: number, over: Partial<LabBoard> = {}, revealed = false): LabBoard => ({
  round: { session: SESSION, step, step_name: STEPS[step] ?? null, steps: [...STEPS], revealed, finished: step >= STEPS.length },
  level: 'supplied', judge: 'rate', counts: { here: 16, done: 0, total: 17 }, predictions: null, results: null, texts: null, debrief: null, ...over
});
const flush = async () => { for (let i = 0; i < 4; i += 1) await new Promise((r) => setTimeout(r, 0)); };

function mount(first: LabBoard) {
  let current = first;
  const reply = (next: LabBoard) => { current = next; return Promise.resolve(next); };
  const api: LabTeacherApi = {
    endpoint: '/api/lessons/lab1/lab',
    board: vi.fn(() => Promise.resolve(current)),
    start: vi.fn(() => reply(at(0))),
    next: vi.fn((_session: string, step: number) => reply(at(step))),
    reveal: vi.fn((_session: string, on: boolean) => reply(at(1, { counts: { here: 16, done: 16, total: 17 }, predictions: on ? [11, 5] : null }, on))),
    end: vi.fn(() => reply({ ...at(0), round: null })),
    rounds: vi.fn(async () => ({ rounds: [] })),
    resume: vi.fn(() => reply(at(1))),
    release: vi.fn(() => Promise.resolve(current)),
    remove: vi.fn(() => Promise.resolve(current)),
    student: vi.fn(async () => ({ student_id: 'st_01', record: null, items: [] }))
  };
  const lesson = { id: 'lab1', lab: SETTINGS, blocks: [] } as unknown as Lesson;
  const board = mountLabBoard({ api, getLesson: () => lesson, pollMs: 60_000 });
  document.body.append(board.root);
  const act = (name: string) => (board.root.querySelector(`[data-act="${name}"]`) as HTMLButtonElement);
  return { board, api, act, text: () => board.root.textContent ?? '', set: (next: LabBoard) => { current = next; } };
}

afterEach(() => document.body.replaceChildren());

describe('the lab board', () => {
  it('offers Start the lab before a round, and starts one', async () => {
    const { board, api, act, text } = mount({ ...at(0), round: null });
    await board.refresh();
    expect(text()).toContain('Run this lab');
    expect(text()).toContain('Past rounds');
    act('start').click();
    await flush();
    expect(api.start).toHaveBeenCalledTimes(1);
    expect(board.root.querySelector('.lab-strip')?.textContent).toContain('Question · 1 of 5');
    expect(board.root.querySelector('h2')?.textContent).toBe('Does the passive voice shrink the blame?');
    expect(text()).toContain('16 students here');
  });

  it('Next names the step it moves to and posts that step', async () => {
    const { board, api, act } = mount(at(0));
    await board.refresh();
    expect(act('next').textContent).toBe('Next: Predict');
    act('next').click();
    await flush();
    expect(api.next).toHaveBeenCalledWith(SESSION, 1);
    expect(act('next').textContent).toBe('Next: Test');
    act('next').click();
    await flush();
    expect(api.next).toHaveBeenLastCalledWith(SESSION, 2);
    expect(board.root.querySelector('h2')?.textContent).toBe('Readers are rating');
  });

  it('predictions stay hidden until Reveal, which toggles the chart', async () => {
    const { board, api, act, text } = mount(at(1, { counts: { here: 16, done: 9, total: 17 } }));
    await board.refresh();
    expect(text()).toContain('Predictions stay hidden until you reveal them.');
    expect(text()).toContain('9 of 16 locked in');
    expect(board.root.querySelector('.lab-meter')?.getAttribute('aria-valuenow')).toBe('9');
    expect(board.root.querySelector('.lab-bars')).toBeNull();
    expect(act('reveal').textContent).toBe('Reveal predictions');
    act('reveal').click();
    await flush();
    expect(api.reveal).toHaveBeenCalledWith(SESSION, true);
    expect(board.root.querySelector('h2')?.textContent).toBe('What we predict');
    expect([...board.root.querySelectorAll('.lab-bar')].map((r) => r.textContent)).toEqual(['Active11', 'Passive5']);
    expect(board.root.querySelector('.lab-bar.is-top')?.textContent).toBe('Active11');
    expect(act('reveal').textContent).toBe('Hide predictions');
    act('reveal').click();
    await flush();
    expect(api.reveal).toHaveBeenLastCalledWith(SESSION, false);
    expect(board.root.querySelector('.lab-bars')).toBeNull();
  });

  it('Test shows progress only', async () => {
    const { board, text } = mount(at(2, { counts: { here: 16, done: 7, total: 17 } }));
    await board.refresh();
    expect(text()).toContain('How much is the company to blame?');
    expect(text()).toContain('7 of 16 ratings in');
    expect(board.root.querySelector('.lab-bars')).toBeNull();
    expect(text()).not.toContain('dumped');
  });

  it('Result shows the headline and bars, and both versions on request', async () => {
    const { board, act, text } = mount(at(3, { results: RESULT, predictions: [2, 4], texts: SETTINGS.texts ?? null }));
    await board.refresh();
    expect(board.root.querySelector('h2')?.textContent).toBe('The active version scored highest. Most of us predicted passive.');
    expect([...board.root.querySelectorAll('.lab-bar')].map((r) => r.textContent)).toEqual(['Active7.7', 'Passive5.3']);
    expect(text()).toContain('Ahead by 2.4. That counts as a win.');
    expect(text()).toContain('Average out of 10, from 6 readers');
    expect(board.root.querySelectorAll('.lab-piece')).toHaveLength(0);
    act('versions').click();
    expect([...board.root.querySelectorAll('.lab-piece')].map((p) => p.textContent)).toEqual(['ActiveThe company dumped waste.', 'PassiveWaste was dumped.']);
    act('versions').click();
    expect(board.root.querySelectorAll('.lab-piece')).toHaveLength(0);
  });

  it('Explain counts hand-ins and shows the debrief notes; the last Next finishes the lab', async () => {
    const { board, api, act, text } = mount(at(4, { results: RESULT, texts: SETTINGS.texts ?? null, explained: 5, debrief: 'Ask who is missing.' }));
    await board.refresh();
    expect(board.root.querySelector('h2')?.textContent).toBe('Why did the active version score highest?');
    expect(text()).toContain('5 of 16 handed in');
    expect(text()).toContain('Your notes: Ask who is missing.');
    expect(act('next').textContent).toBe('Finish the lab');
    act('next').click();
    await flush();
    expect(api.next).toHaveBeenCalledWith(SESSION, 5);
  });

  it('a finished lab shows the finding and Run it again', async () => {
    const { board, api, act, text } = mount(at(5, { results: RESULT, explained: 12, debrief: 'Ask who is missing.' }));
    await board.refresh();
    expect(text()).toContain('What the lab found');
    expect(text()).toContain('The active version scored highest.');
    expect(text()).toContain('12 of 16 explanations handed in.');
    act('again').click();
    await flush();
    expect(api.start).toHaveBeenCalledTimes(1);
  });

  it('a step that is not built yet still lets the teacher move on', async () => {
    const steps = ['Question', 'Predict', 'Make', 'Test', 'Result', 'Explain'] as const;
    const b = at(2, { level: 'students', judge: 'pick' });
    b.round = { ...b.round!, steps: [...steps], step_name: 'Make' };
    const { board, act, text } = mount(b);
    await board.refresh();
    expect(text()).toContain('This step is not built yet.');
    expect(act('next').textContent).toBe('Next: Test');
  });

  it('a poll with nothing new leaves the stage as it is', async () => {
    const { board } = mount(at(0));
    await board.refresh();
    const stage = board.root.querySelector('.lab-card--stage');
    await board.refresh();
    expect(board.root.querySelector('.lab-card--stage')).toBe(stage);
  });
});
