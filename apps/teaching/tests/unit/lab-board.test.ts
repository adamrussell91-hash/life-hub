import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountLabBoard } from '@/lab/board';
import type { LabAfter, LabBoard, LabTeacherApi } from '@/lab/api';
import type { LabMarkbook } from '@/lab/after';
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
/** The class's markbook, already holding the lab's column. */
const COLUMN = { id: 'labcolumn001', kind: 'assessment', title: 'Lab: Explanation', date: '2026-11-19', weight: 0, criteria: [], piece: { lesson_id: 'lab1', block_id: 'lab_explain' } };
const MARKBOOK = { load: vi.fn(async () => ({ markbook: { columns: [COLUMN] } })), saveColumn: vi.fn() } as unknown as LabMarkbook;
const AFTER: LabAfter = {
  session: SESSION, class_id: 'class1',
  students: [
    { student_id: 'st_01', initials: 'KT', pred: 0, pair: null, notes: 0, handed_in_at: '2026-11-19T02:00:00.000Z', explanation: 'With the company as the subject there is nowhere else to look.' },
    { student_id: 'st_02', initials: 'RV', pred: 1, pair: null, notes: 0, handed_in_at: null, explanation: '' }
  ]
};

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
    student: vi.fn(async () => ({ student_id: 'st_01', record: null, items: [] })),
    after: vi.fn(async () => AFTER)
  };
  const lesson = { id: 'lab1', title: 'Passive voice lab', lab: SETTINGS, blocks: [] } as unknown as Lesson;
  const board = mountLabBoard({ api, getLesson: () => lesson, markbook: MARKBOOK, pollMs: 60_000 });
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
    await flush();
    expect(board.root.querySelector('.lab-strip b')?.textContent).toBe('After class');
    expect(text()).toContain('What the lab found');
    expect(text()).toContain('The active version scored highest.');
    expect(text()).toContain('1 of 2 handed in.');
    expect(api.after).toHaveBeenCalledWith(SESSION);
    act('again').click();
    await flush();
    expect(api.start).toHaveBeenCalledTimes(1);
  });

  it('a step with no stage of its own still lets the teacher move on', async () => {
    // Make belongs to Students write it; a supplied lab has no stage for it.
    const steps = ['Question', 'Predict', 'Make', 'Test', 'Result', 'Explain'] as const;
    const b = at(2);
    b.round = { ...b.round!, steps: [...steps], step_name: 'Make', finished: false };
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

// ---------------------------------------------------------------------------
// Students write it
// ---------------------------------------------------------------------------

describe('the lab board, students write it', () => {
  const STORM: LabSettings = {
    ...seedLab('class1', 'students'), question: 'Which sense makes a storm feel most real?', same: 'The moment the storm hits the house.',
    options: ['Sight', 'Sound', 'Touch'], task: 'Write the moment the storm hits the house', judge_question: 'Which one feels most real?'
  };
  const STORM_STEPS = ['Question', 'Predict', 'Make', 'Test', 'Result', 'Explain'] as const;
  const storm = (step: number, over: Partial<LabBoard> = {}): LabBoard => ({
    ...at(step), round: { session: SESSION, step, step_name: STORM_STEPS[step] ?? null, steps: [...STORM_STEPS], revealed: false, finished: false },
    level: 'students', judge: 'pick', held: [], best: null, ...over
  });
  const HELD = [{ owner: 'a'.repeat(24), initials: 'JM', pieces: [{ label: 'Sight', text: 'The sky goes dark.', flagged: false }, { label: 'Sound', text: 'A rude line.', flagged: true }] }];
  function mountStorm(first: LabBoard) {
    const mounted = mount(first);
    const lesson = { id: 'lab1', lab: STORM, blocks: [] } as unknown as Lesson;
    const board = mountLabBoard({ api: mounted.api, getLesson: () => lesson, markbook: MARKBOOK, pollMs: 60_000 });
    document.body.replaceChildren(board.root);
    return { ...mounted, board, act: (name: string) => board.root.querySelector(`[data-act="${name}"]`) as HTMLButtonElement, text: () => board.root.textContent ?? '' };
  }

  it('Make shows the task, the options and how many have finished', async () => {
    const { board, text } = mountStorm(storm(2, { counts: { here: 16, done: 5, total: 17 } }));
    await board.refresh();
    expect(board.root.querySelector('h2')?.textContent).toBe('Write the moment the storm hits the house');
    expect([...board.root.querySelectorAll('.lab-board__inner .lab-chip')].map((c) => c.textContent)).toEqual(['Sight', 'Sound', 'Touch']);
    expect(text()).toContain('5 of 16 finished');
  });

  it('lists held writing with initials, and Release and Remove send the owner', async () => {
    const { board, api, act, text } = mountStorm(storm(2, { held: HELD }));
    (api.release as ReturnType<typeof vi.fn>).mockImplementation(() => Promise.resolve(storm(2)));
    await board.refresh();
    expect(board.root.querySelector('.lab-held h2')?.textContent).toBe('1 piece held for you');
    expect(text()).toContain('JM');
    expect(board.root.querySelector('.lab-held .is-flagged')?.textContent).toBe('Sound · flaggedA rude line.');
    act('release').click();
    await flush();
    expect(api.release).toHaveBeenCalledWith('a'.repeat(24));
    expect(board.root.querySelector('.lab-held')).toBeNull();
    const again = mountStorm(storm(2, { held: HELD }));
    await again.board.refresh();
    again.act('remove').click();
    await flush();
    expect(again.api.remove).toHaveBeenCalledWith('a'.repeat(24));
  });

  it('Result shows the bars, then the most chosen piece with no name on it', async () => {
    const results = setResult({ judge: 'pick', options: 3, picks: [20, 46, 30], ratings: [], predictions: [9, 5, 3], readers: 16, threshold: 8 });
    const best = { text: 'The gutters choke and spit.', option: 1, chosen: 6, readers: 6 };
    const { board, act, text } = mountStorm(storm(4, { results, predictions: [9, 5, 3], best }));
    await board.refresh();
    expect(board.root.querySelector('h2')?.textContent).toBe('Sound won. Most of us predicted sight.');
    expect(text()).not.toContain('The gutters choke and spit.');
    expect(act('best').textContent).toBe('Show the most chosen piece');
    act('best').click();
    expect(board.root.querySelector('.lab-board__inner .lab-piece')?.textContent).toBe('Most chosen: 6 of 6 readersThe gutters choke and spit.');
    expect(act('best').textContent).toBe('Hide');
  });
});

// ---------------------------------------------------------------------------
// Pairs design it
// ---------------------------------------------------------------------------

describe('the lab board, pairs design it', () => {
  const STANZA = 'I meant to tell you\nbut the words, I think,\nwere somewhere else.';
  const HESITANT: LabSettings = {
    ...seedLab('class1', 'pairs'), question: 'What makes this speaker sound hesitant?', claim: 'The line breaks create the hesitation.', control: STANZA,
    judge_question: 'How hesitant does the speaker sound?', pairs: [{ id: 'p1', students: ['st_01', 'st_02'] }, { id: 'p2', students: ['st_03', 'st_04'] }], debrief: 'The hedges do more.'
  };
  const PAIR_STEPS = ['Question', 'Design', 'Predict', 'Test', 'Result', 'Name it', 'Explain'] as const;
  const COUNTS = { total: 8, changed: 7, ready: 5, predicted: 3 };
  const pairsAt = (step: number, over: Partial<LabBoard> = {}, revealed = false): LabBoard => ({
    ...at(step), round: { session: SESSION, step, step_name: PAIR_STEPS[step] ?? null, steps: [...PAIR_STEPS], revealed, finished: step >= PAIR_STEPS.length },
    level: 'pairs', judge: 'rate', held: [], best: null, pairs: COUNTS, findings: null, ...over
  });
  const trial = (pair: string, number: number, desc: string, edit: object, shift: number, n: number, pred: -1 | 0 | 1) => ({
    id: pair, pair, number, initials: ['KT', 'RV'], desc: [desc], edit, ratings: Array.from({ length: n }, () => 5), mean: 5, n, shift,
    verdict: (shift <= -1 ? -1 : shift >= 1 ? 1 : 0) as -1 | 0 | 1, pred, held: false, thin: n < 4, feature: null
  });
  const FOUND = {
    control: { mean: 6.5, n: 8, ratings: [5, 6, 6, 6, 7, 7, 7, 8] }, threshold: 1,
    trials: [trial('p1', 1, 'cut "I think,"', { cut: [8, 9] }, -1.8, 5, -1), trial('p2', 2, 'joined lines 1 and 2', { join: [4] }, -0.4, 5, 0), trial('p3', 3, 'broke line 2 after "the"', { brk: [6] }, 2.1, 3, 1)]
  };
  function mountPairs(first: LabBoard) {
    const mounted = mount(first);
    const lesson = { id: 'lab1', lab: HESITANT, blocks: [] } as unknown as Lesson;
    const board = mountLabBoard({ api: mounted.api, getLesson: () => lesson, markbook: MARKBOOK, pollMs: 60_000 });
    document.body.replaceChildren(board.root);
    return { ...mounted, board, act: (name: string) => board.root.querySelector(`[data-act="${name}"]`) as HTMLButtonElement, text: () => board.root.textContent ?? '' };
  }

  it('Name it regroups the trials by level of language under a headline, and counts the pairs that have named', async () => {
    const levels = [{ level: 'Sentence' as const, trials: 3, meanAbsShift: 1.9 }, { level: 'Form' as const, trials: 2, meanAbsShift: 0.7 }, { level: 'Word' as const, trials: 0, meanAbsShift: 0 }];
    const { board, text, act } = mountPairs(pairsAt(5, { findings: FOUND, levels, pairs: { ...COUNTS, named: 5 } }));
    await board.refresh();
    expect(board.root.querySelector('.lab-board__inner h2')?.textContent).toBe('The sentence level moved readers most');
    expect([...board.root.querySelectorAll('.lab-levels .lab-bar')].map((r) => r.textContent)).toEqual(['Sentence 3 trials1.9', 'Form 2 trials0.7', 'Word 0 trials0.0']);
    expect(text()).toContain('A trial with fewer than four readers is left out.');
    expect(text()).toContain('5 of 7 pairs named');
    expect(act('next').textContent).toBe('Next: Explain');
    // Nothing a classmate could trace: the level bars carry no initials.
    expect(board.root.querySelector('.lab-levels')?.textContent).not.toContain('KT');
  });

  it('a trait words the board’s predictions and the findings chart’s ends', async () => {
    const lesson = { id: 'lab1', lab: { ...HESITANT, trait: 'hesitant' }, blocks: [] } as unknown as Lesson;
    const mounted = mount(pairsAt(2, { predictions: [3, 1, 2] }, true));
    const board = mountLabBoard({ api: mounted.api, getLesson: () => lesson, markbook: MARKBOOK, pollMs: 60_000 });
    document.body.replaceChildren(board.root);
    await board.refresh();
    expect([...board.root.querySelectorAll('.lab-bar span:first-child')].map((n) => n.textContent)).toEqual(['Less hesitant', 'More hesitant', 'About as hesitant']);
    mounted.api.board = vi.fn(() => Promise.resolve(pairsAt(4, { findings: FOUND, predictions: [1, 1, 1] })));
    await board.refresh();
    expect([...board.root.querySelectorAll('.lab-finds__axis div span')].map((n) => n.textContent)).toEqual(['Less hesitant', 'More']);
  });

  it('Question and Design show the control, and Design counts the pairs on the bench', async () => {
    const question = mountPairs(pairsAt(0));
    await question.board.refresh();
    expect(question.text()).toContain('Claim to test: The line breaks create the hesitation.');
    expect([...question.board.root.querySelectorAll('.lab-poem li')].map((li) => li.textContent)).toEqual(STANZA.split('\n'));
    expect(question.text()).toContain('16 students here, in 8 pairs');
    const design = mountPairs(pairsAt(1));
    await design.board.refresh();
    expect(design.board.root.querySelector('h2')?.textContent).toBe('Change one thing in the text');
    expect(design.text()).toContain('5 of 8 pairs on the bench');
    expect(design.act('next').textContent).toBe('Next: Predict');
  });

  it('Predict keeps the pairs’ predictions hidden until Reveal', async () => {
    const { board, api, act, text } = mountPairs(pairsAt(2));
    (api.reveal as ReturnType<typeof vi.fn>).mockImplementation((_s: string, on: boolean) => Promise.resolve(pairsAt(2, { predictions: on ? [4, 1, 2] : null }, on)));
    await board.refresh();
    expect(text()).toContain('3 of 7 pairs locked in');
    expect(board.root.querySelector('.lab-bars')).toBeNull();
    act('reveal').click();
    await flush();
    expect(board.root.querySelector('h2')?.textContent).toBe('What the pairs predict');
    expect([...board.root.querySelectorAll('.lab-bar')].map((r) => r.textContent)).toEqual(['Lower4', 'Higher2', 'About the same1']);
  });

  it('Test shows progress only', async () => {
    const { board, text } = mountPairs(pairsAt(3, { counts: { here: 16, done: 6, total: 17 } }));
    await board.refresh();
    expect(text()).toContain('Each reader gets up to six versions with the changes unmarked.');
    expect(text()).toContain('6 of 16 readers finished');
    expect(board.root.querySelector('.lab-finds')).toBeNull();
  });

  it('Result is the findings chart; a row opens that pair’s marked version beside its dots and the control’s', async () => {
    const { board, text } = mountPairs(pairsAt(4, { findings: FOUND, predictions: [1, 1, 1] }));
    await board.refresh();
    // The headline is the biggest shift among trials with enough readers.
    expect(board.root.querySelector('h2')?.textContent).toBe('Biggest shift: cut "I think,"');
    const rows = () => [...board.root.querySelectorAll('button.lab-find')] as HTMLButtonElement[];
    expect(rows().map((r) => r.querySelector('.lab-find__value')?.textContent)).toEqual(['−1.8', '−0.4', '+2.1']);
    expect(rows().map((r) => r.classList.contains('is-pale'))).toEqual([false, true, true]);
    expect(text()).toContain('Control average 6.5 from 8 ratings. Tap a row to see its readings.');
    expect(board.root.querySelector('.lab-find-detail')).toBeNull();
    rows()[0]!.click();
    const detail = board.root.querySelector('.lab-find-detail')!;
    expect(detail.querySelector('.lab-label')?.textContent).toBe('Pair 1: cut "I think,"');
    expect([...detail.querySelectorAll('.lab-tok.is-cut')].map((t) => t.textContent)).toEqual(['I', 'think,']);
    expect([...detail.querySelectorAll('.lab-reading')].map((r) => [r.querySelector('b')?.textContent, r.querySelectorAll('circle').length])).toEqual([['Control', 8], ['This version', 5]]);
    // The same row again closes it.
    rows()[0]!.click();
    expect(board.root.querySelector('.lab-find-detail')).toBeNull();
  });

  it('Explain shows the claim, the findings and the debrief; a held word is listed for the teacher', async () => {
    const held = [{ owner: 'pair.p3', initials: 'BN, CD', pieces: [{ label: 'Their change', text: 'Changed "somewhere" to "rude"', flagged: true }] }];
    const { board, api, act, text } = mountPairs(pairsAt(6, { findings: FOUND, debrief: 'The hedges do more.', explained: 9, held }));
    await board.refresh();
    expect(board.root.querySelector('h2')?.textContent).toBe('Does the evidence support the claim?');
    expect(text()).toContain('Claim: The line breaks create the hesitation.');
    expect(board.root.querySelectorAll('.lab-find').length).toBe(3);
    expect(text()).toContain('Your notes: The hedges do more.');
    expect(text()).toContain('9 of 16 handed in');
    expect(board.root.querySelector('.lab-held')?.textContent).toContain('BN, CD');
    act('release').click();
    await flush();
    expect(api.release).toHaveBeenCalledWith('pair.p3');
  });
});

