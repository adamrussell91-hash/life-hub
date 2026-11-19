import { afterEach, describe, expect, it, vi } from 'vitest';
import { afterClass, classFinding, ensureLabColumn, explanationList, labColumn, markPath, predictionsHeld, type LabMarkbook } from '@/lab/after';
import { mountLabBoard } from '@/lab/board';
import { labRecordAside, labRecordNodes } from '@/lab/mark-record';
import type { LabAfter, LabBoard, LabRecordLab, LabStudentRecord, LabTeacherApi } from '@/lab/api';
import { setResult } from '@/lab/model';
import { publicLab, seedLab, type LabSettings } from '@/lab/schema';
import { AssessmentColumnSchema, type AssessmentColumn } from '@/markbook/schema';
import type { Lesson } from '@/schemas/lesson';

// Invented labs for an invented class.
const PASSIVE: LabSettings = {
  ...seedLab('class1'), question: 'Does the passive voice shrink the blame?', same: 'The events and their order.', options: ['Active', 'Passive'],
  texts: ['The company dumped waste.', 'Waste was dumped.'], judge_question: 'How much is the company to blame?', debrief: 'Ask who is missing.'
};
const STORM: LabSettings = {
  ...seedLab('class1', 'students'), question: 'Which sense makes a storm feel most real?', same: 'The moment the storm hits.', options: ['Sight', 'Sound', 'Touch'],
  task: 'The storm hits the house.', judge_question: 'Which one feels most real?'
};
const HESITANT: LabSettings = {
  ...seedLab('class1', 'pairs'), question: 'What makes this speaker sound hesitant?', claim: 'The line breaks create the hesitation.',
  control: 'I meant to tell you\nbut the words, I think,\nwere somewhere else.', judge_question: 'How hesitant does the speaker sound?', trait: 'hesitant',
  pairs: [{ id: 'p1', students: ['st_01', 'st_02'] }, { id: 'p2', students: ['st_03', 'st_04'] }], debrief: 'The hedges do more.'
};
const SESSION = 'a'.repeat(32);
const RATED = setResult({ judge: 'rate', options: 2, picks: [], ratings: [[8, 8, 7], [5, 5, 6]], predictions: [11, 5], readers: 16, threshold: 1 });
const PICKED = setResult({ judge: 'pick', options: 3, picks: [20, 46, 30], ratings: [], predictions: [9, 5, 3], readers: 16, threshold: 8 });
const CLOSE = setResult({ judge: 'pick', options: 3, picks: [30, 34, 32], ratings: [], predictions: [9, 5, 3], readers: 16, threshold: 8 });
const trial = (pair: string, number: number, desc: string, shift: number, n: number, pred: -1 | 0 | 1, held: boolean, feature: number | null = null) => ({
  id: pair, pair, number, initials: ['KT', 'RV'], desc: [desc], edit: {}, ratings: Array.from({ length: n }, () => 5), mean: 5, n, shift,
  verdict: (shift <= -1 ? -1 : shift >= 1 ? 1 : 0) as -1 | 0 | 1, pred, held, thin: n < 4, feature
});
const FOUND = {
  control: { mean: 6.5, n: 8, ratings: [5, 6, 6, 6, 7, 7, 7, 8] }, threshold: 1,
  trials: [trial('p1', 1, 'cut "I think,"', -1.8, 5, -1, true, 1), trial('p2', 2, 'joined lines 1 and 2', -0.4, 5, -1, false, 0), trial('p3', 3, 'broke line 2 after "the"', 2.1, 3, 1, true)]
};
const LEVELS = [{ level: 'Sentence' as const, trials: 1, meanAbsShift: 1.8 }, { level: 'Form' as const, trials: 1, meanAbsShift: 0.4 }, { level: 'Word' as const, trials: 0, meanAbsShift: 0 }];
const board = (over: Partial<LabBoard> = {}): LabBoard => ({
  round: { session: SESSION, step: 5, step_name: null, steps: ['Question', 'Predict', 'Test', 'Result', 'Explain'], revealed: false, finished: true },
  level: 'supplied', judge: 'rate', counts: { here: 16, done: 0, total: 17 }, predictions: null, results: null, texts: null, debrief: null, ...over
});
const AFTER: LabAfter = {
  session: SESSION, class_id: 'class1',
  students: [
    { student_id: 'st_02', initials: 'RV', pred: 1, pair: null, notes: 0, handed_in_at: null, explanation: '' },
    { student_id: 'st_01', initials: 'KT', pred: 0, pair: null, notes: 0, handed_in_at: '2026-11-19T02:00:00.000Z', explanation: 'With the company as the subject there is nowhere else to look.' }
  ]
};
const lessonOf = (lab: LabSettings) => ({ id: 'lab1', title: 'Passive voice lab', lab, blocks: [] }) as unknown as Lesson;
const flush = async () => { for (let i = 0; i < 6; i += 1) await new Promise((r) => setTimeout(r, 0)); };

/** A class's markbook that keeps the columns it is given. */
function fakeMarkbook(columns: AssessmentColumn[] = []) {
  const book = {
    load: vi.fn(async () => ({ markbook: { columns: [...columns] } })),
    saveColumn: vi.fn(async (_classId: string, column: AssessmentColumn) => {
      columns.push(column);
      return { columns };
    })
  };
  return { book: book as unknown as LabMarkbook, load: book.load, saveColumn: book.saveColumn, columns };
}

afterEach(() => document.body.replaceChildren());

describe('the markbook column for a lab’s explanations', () => {
  it('is one assessment column linked to the lesson’s lab_explain block, and a valid one', () => {
    const column = labColumn({ id: 'lab1', title: 'Passive voice lab' }, 'abcdefgh1234', '2026-11-19');
    expect(column).toMatchObject({ kind: 'assessment', title: 'Passive voice lab: Explanation', weight: 0, piece: { lesson_id: 'lab1', block_id: 'lab_explain' } });
    expect(AssessmentColumnSchema.safeParse(column).success).toBe(true);
  });

  it('is created once: a second call, and two calls at once, find the same column', async () => {
    const { book, saveColumn, columns } = fakeMarkbook();
    const [a, b] = await Promise.all([ensureLabColumn(lessonOf(PASSIVE), book), ensureLabColumn(lessonOf(PASSIVE), book)]);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-z0-9]{12}$/);
    expect(saveColumn).toHaveBeenCalledTimes(1);
    expect(saveColumn.mock.calls[0]![0]).toBe('class1');
    expect(columns[0]!.piece).toEqual({ lesson_id: 'lab1', block_id: 'lab_explain' });
    expect(await ensureLabColumn(lessonOf(PASSIVE), book)).toBe(a);
    expect(saveColumn).toHaveBeenCalledTimes(1);
  });

  it('leaves another lesson’s column alone and makes its own', async () => {
    const other = labColumn({ id: 'lab9', title: 'Another lab' }, 'othercolumn1');
    const { book, saveColumn, columns } = fakeMarkbook([other]);
    const id = await ensureLabColumn(lessonOf(PASSIVE), book);
    expect(id).not.toBe('othercolumn1');
    expect(saveColumn).toHaveBeenCalledTimes(1);
    expect(columns.map((c) => c.piece?.lesson_id)).toEqual(['lab9', 'lab1']);
  });

  it('needs the lab’s class', async () => {
    await expect(ensureLabColumn(lessonOf({ ...PASSIVE, class_id: '' }), fakeMarkbook().book)).rejects.toThrow('Choose the class this lab is for.');
  });
});

describe('what the lab found, in words', () => {
  it('You supply it: the winner and the averages', () => {
    const lab = publicLab(PASSIVE);
    expect(classFinding(lab, { results: RATED })).toBe('The active version scored highest. Most of us predicted it. Active 7.7, Passive 5.3 out of 10, on average.');
    expect(predictionsHeld(lab, { results: RATED })).toBe('11 held, 5 overturned.');
    expect(classFinding(lab, { results: null })).toBe('No readings came in, so there is no finding yet.');
  });

  it('Students write it: the choices, and a lead under the threshold holds nobody’s prediction', () => {
    const lab = publicLab(STORM);
    expect(classFinding(lab, { results: PICKED })).toBe('Sound won. Most of us predicted sight. Sound 46, Touch 30, Sight 20 of 96 choices.');
    expect(predictionsHeld(lab, { results: PICKED })).toBe('5 held, 12 overturned.');
    expect(classFinding(lab, { results: CLOSE })).toContain('Too close to call.');
    expect(predictionsHeld(lab, { results: CLOSE })).toBe('Too close to call, so none of the 17 predictions counts as held.');
  });

  it('Pairs design it: the biggest shift among trials with enough readers, and how many pairs predicted their result', () => {
    const lab = publicLab(HESITANT);
    expect(classFinding(lab, { findings: FOUND })).toBe('Cut "I think," moved readers most: −1.8. 1 of 3 trials shifted the rating by 1 point or more.');
    expect(predictionsHeld(lab, { findings: FOUND })).toBe('2 of 3 pairs predicted their result.');
    expect(classFinding(lab, { findings: { ...FOUND, trials: [] } })).toBe('Every pair kept the original, so there are no trials to compare.');
  });
});

describe('the After class page', () => {
  const page = (lab: LabSettings, b: LabBoard, after: LabAfter | null = AFTER, columnId: string | null = 'labcolumn001') => {
    const onAgain = vi.fn();
    const host = document.createElement('div');
    host.append(...afterClass({ lab: publicLab(lab), board: b, after, columnId, onAgain, rounds: document.createElement('details') }));
    document.body.append(host);
    return { host, onAgain, text: () => host.textContent ?? '', rows: () => [...host.querySelectorAll('.lab-row dt')].map((dt) => dt.textContent) };
  };

  it('a supplied lab: the finding with its bars, the predictions, the debrief, and Run it again', () => {
    const { host, rows, text, onAgain } = page(PASSIVE, board({ results: RATED, debrief: 'Ask who is missing.' }));
    expect(rows()).toEqual(['Class finding', 'Predictions', 'Lab notes', 'My debrief notes']);
    expect([...host.querySelectorAll('.lab-bar')].map((r) => r.textContent)).toEqual(['Active7.7', 'Passive5.3']);
    expect(text()).toContain('11 held, 5 overturned.');
    expect(text()).toContain('Off for this lab.');
    (host.querySelector('[data-act="again"]') as HTMLButtonElement).click();
    expect(onAgain).toHaveBeenCalledTimes(1);
  });

  it('a pairs lab adds the claim, the findings chart and the level comparison', () => {
    const { host, rows, text } = page(HESITANT, board({ level: 'pairs', findings: FOUND, levels: LEVELS }));
    expect(rows()).toEqual(['Claim tested', 'Class finding', 'Predictions', 'Level of language', 'Lab notes']);
    expect(host.querySelectorAll('.lab-find').length).toBe(3);
    expect([...host.querySelectorAll('.lab-finds__axis div span')].map((n) => n.textContent)).toEqual(['Less hesitant', 'More']);
    expect(text()).toContain('The sentence level moved readers most.');
    expect([...host.querySelectorAll('.lab-levels .lab-bar')].map((r) => r.textContent)).toEqual(['Sentence 1 trial1.8', 'Form 1 trial0.4', 'Word 0 trials0.0']);
    expect(text()).toContain('Kept at every step.');
  });

  it('lists the explanations, handed-in first, each with a Mark link to that student’s piece', () => {
    const { host, text } = page(PASSIVE, board({ results: RATED }));
    const rows = [...host.querySelectorAll('.lab-after__row')] as HTMLElement[];
    expect(rows.map((r) => r.dataset.student)).toEqual(['st_01', 'st_02']);
    expect(text()).toContain('1 of 2 handed in.');
    expect(rows[0]!.textContent).toContain('KTPredicted active, held');
    expect(rows[0]!.textContent).toContain('With the company as the subject there is nowhere else to look.');
    const mark = rows[0]!.querySelector('a') as HTMLAnchorElement;
    expect(mark.textContent).toBe('Mark');
    expect(mark.getAttribute('href')).toBe('/mark/class1/labcolumn001?student=st_01');
    expect(markPath('class 1', 'col', 'st 1')).toBe('/mark/class%201/col?student=st%201');
    expect(rows[1]!.textContent).toContain('RVPredicted passive');
    expect(rows[1]!.textContent).toContain('Not handed in yet.');
    expect(rows[1]!.querySelector('a')).toBeNull();
  });

  it('a pairs lab’s rows carry the pair’s prediction and trial, and count the lab notes', () => {
    const after: LabAfter = {
      session: SESSION, class_id: 'class1',
      students: [
        { student_id: 'st_01', initials: 'KT', pred: -1, pair: 1, notes: 6, handed_in_at: '2026-11-19T02:00:00.000Z', explanation: 'The hedge carries it.' },
        { student_id: 'st_16', initials: 'PQ', pred: null, pair: 8, notes: 1, handed_in_at: null, explanation: '' }
      ]
    };
    const list = explanationList({ lab: publicLab(HESITANT), board: board({ level: 'pairs', findings: FOUND }), after, columnId: 'labcolumn001' });
    const rows = [...list.querySelectorAll('.lab-after__row')].map((r) => r.querySelector('.lab-after__who')!.textContent);
    expect(rows).toEqual([
      'KTPredicted less hesitant, heldPair 1: cut "I think,", shift −1.86 lab notes',
      'PQNo predictionPair 8: kept the original1 lab note'
    ]);
  });

  it('says so while the list loads, when nobody joined, and when the column could not be made', () => {
    const lab = publicLab(PASSIVE);
    expect(explanationList({ lab, board: board(), after: null, columnId: null }).textContent).toContain('Loading the explanations…');
    expect(explanationList({ lab, board: board(), after: { ...AFTER, students: [] }, columnId: 'c' }).textContent).toContain('Nobody joined this round.');
    const stuck = explanationList({ lab, board: board({ results: RATED }), after: AFTER, columnId: null, columnProblem: 'The markbook column for the explanations didn’t save, so hand-in is closed for now.' });
    expect(stuck.querySelector('[role="alert"]')?.textContent).toContain('hand-in is closed for now');
    expect(stuck.querySelector('a')).toBeNull();
  });
});

describe('the board makes the column when a round starts, and again after class', () => {
  function mountBoard(first: LabBoard, columns: AssessmentColumn[] = []) {
    let current = first;
    const order: string[] = [];
    const { book, load, saveColumn } = fakeMarkbook(columns);
    saveColumn.mockImplementation(async (_classId: string, column: AssessmentColumn) => {
      order.push('column');
      columns.push(column);
      return { columns };
    });
    const started = board({ round: { ...board().round!, session: 'b'.repeat(32), step: 0, step_name: 'Question', finished: false } });
    const api = {
      endpoint: '/api/lessons/lab1/lab',
      board: vi.fn(() => Promise.resolve(current)),
      start: vi.fn(() => { order.push('start'); current = started; return Promise.resolve(started); }),
      rounds: vi.fn(async () => ({ rounds: [] })),
      after: vi.fn(async () => AFTER)
    } as unknown as LabTeacherApi;
    const view = mountLabBoard({ api, getLesson: () => lessonOf(PASSIVE), markbook: book, pollMs: 60_000 });
    document.body.append(view.root);
    return { view, api, order, load, saveColumn, columns, act: (name: string) => view.root.querySelector(`[data-act="${name}"]`) as HTMLButtonElement };
  }

  it('Start the lab saves the column before the round opens, so hand-in is ready at Explain', async () => {
    const { view, act, order, columns } = mountBoard({ ...board(), round: null });
    await view.refresh();
    act('start').click();
    await flush();
    expect(order).toEqual(['column', 'start']);
    expect(columns[0]!.piece).toEqual({ lesson_id: 'lab1', block_id: 'lab_explain' });
  });

  it('After class finds the column that is there, links each explanation to it, and Run it again starts fresh without a second column', async () => {
    const had = labColumn({ id: 'lab1', title: 'Passive voice lab' }, 'labcolumn001');
    const { view, act, api, saveColumn, order } = mountBoard(board({ results: RATED }), [had]);
    await view.refresh();
    await flush();
    expect(api.after).toHaveBeenCalledWith(SESSION);
    expect(view.root.querySelector('.lab-after__row a')?.getAttribute('href')).toBe('/mark/class1/labcolumn001?student=st_01');
    act('again').click();
    await flush();
    expect(saveColumn).not.toHaveBeenCalled();
    expect(order).toEqual(['start']);
    expect(view.root.querySelector('.lab-strip')?.textContent).toContain('Question · 1 of 5');
  });

  it('a markbook that can’t be reached still lets the round start, and says hand-in is closed', async () => {
    const { view, act, api, load } = mountBoard(board({ results: RATED }));
    load.mockRejectedValue(new Error('offline'));
    await view.refresh();
    await flush();
    expect(view.root.querySelector('.lab-after [role="alert"]')?.textContent).toContain('hand-in is closed for now');
    act('again').click();
    await flush();
    expect(api.start).toHaveBeenCalledTimes(1);
  });
});

describe('beside the explanation in marking', () => {
  const LAB: LabRecordLab = { level: 'pairs', judge: 'rate', notes_on: true, steps: ['Question', 'Design', 'Predict', 'Test', 'Result', 'Name it', 'Explain'], options: [], features: HESITANT.features ?? [], trait: 'hesitant' };
  const record = (over: Partial<LabStudentRecord> = {}): LabStudentRecord => ({
    student_id: 'st_01', lab: LAB, items: [],
    record: { pred: null, reason: '', done: {}, notes: { Result: 'The dots sit lower.', Question: '"I think," in line 2.' } },
    pair: { id: 'p1', students: ['st_01', 'st_02'], record: { edit: { cut: [8, 9] }, ready: true, pred: -1, feature: 1, trial: true }, change: ['cut "I think,"'] },
    trial: { ...FOUND.trials[0]!, initials: undefined } as unknown as LabStudentRecord['trial'],
    ...over
  });
  const words = (data: LabStudentRecord) => labRecordNodes(data).map((n) => n.textContent);

  it('shows the pair’s prediction, the trial, the feature named and the notes in step order', () => {
    expect(words(record())).toEqual([
      'From the lab',
      'Their pair predicted: less hesitant.',
      'Their trial: Cut "I think,". Shift −1.8 from 5 readers, as predicted.',
      'Named: Hedging (modality) (Sentence level)',
      'Lab notesQuestion"I think," in line 2.ResultThe dots sit lower.'
    ]);
  });

  it('shows nothing when lab notes are off and there is no trial, and the trial alone when notes are off', () => {
    const off = { ...LAB, notes_on: false };
    expect(words(record({ lab: off, trial: null }))).toEqual([]);
    expect(words(record({ lab: off }))).toEqual(['From the lab', 'Their pair predicted: less hesitant.', 'Their trial: Cut "I think,". Shift −1.8 from 5 readers, as predicted.', 'Named: Hedging (modality) (Sentence level)']);
    // Notes on with nothing written, and no trial: still nothing.
    expect(words(record({ trial: null, record: { pred: null, reason: '', done: {}, notes: {} } }))).toEqual([]);
    expect(words({ student_id: 'st_01', record: null, items: [] })).toEqual([]);
  });

  it('a supplied lab with notes on shows the student’s own prediction and reason', () => {
    const lab: LabRecordLab = { ...LAB, level: 'supplied', steps: ['Question', 'Predict', 'Test', 'Result', 'Explain'], options: ['Active', 'Passive'], features: [], trait: '' };
    expect(words({ student_id: 'st_01', lab, items: [], pair: null, trial: null, record: { pred: 1, reason: 'nobody is named', done: {}, notes: { Predict: 'Because nobody is named.' } } })).toEqual([
      'From the lab', 'Predicted: Passive, because nobody is named', 'Lab notesPredictBecause nobody is named.'
    ]);
  });

  it('the panel fills once the record is back, and stays empty when it can’t be read', async () => {
    const load = vi.fn(async () => record());
    const box = labRecordAside('lab1', 'st_01', load);
    expect(box.childElementCount).toBe(0);
    await flush();
    expect(load).toHaveBeenCalledWith('lab1', 'st_01');
    expect(box.textContent).toContain('Their trial: Cut "I think,".');
    const none = labRecordAside('lab1', 'st_01', async () => { throw new Error('offline'); });
    await flush();
    expect(none.childElementCount).toBe(0);
  });
});
