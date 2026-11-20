import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountLabPlayer } from '@/lab/player';
import type { LabClient, LabStatus } from '@/lab/api';
import { NOTE_GATE, factsStrip, labFacts, notesPanel } from '@/lab/notes';
import { setResult } from '@/lab/model';
import { labExplainBlock, publicLab, seedLab, type LabSettings, type LabStep } from '@/lab/schema';
import type { PublishedLesson } from '@/schemas/published-lesson';

// Invented labs and an invented student, KT.
const STANZA = 'I meant to tell you\nbut the words, I think,\nwere somewhere else.';
const PASSIVE: LabSettings = {
  ...seedLab('class1'), question: 'Does the passive voice shrink the blame?', same: 'The events and their order.', options: ['Active', 'Passive'],
  texts: ['The company dumped waste.', 'Waste was dumped.'], judge_question: 'How much is the company to blame?'
};
const STORM: LabSettings = {
  ...seedLab('class1', 'students'), question: 'Which sense makes a storm feel most real?', same: 'The moment the storm hits the house.',
  options: ['Sight', 'Sound', 'Touch'], task: 'The storm hits the house.', judge_question: 'Which one feels most real?'
};
const HESITANT: LabSettings = {
  ...seedLab('class1', 'pairs'), question: 'What makes this speaker sound hesitant?', claim: 'The line breaks create the hesitation.', control: STANZA,
  judge_question: 'How hesitant does the speaker sound?', trait: 'hesitant', pairs: [{ id: 'p1', students: ['st_01', 'st_02'] }]
};
const STEPS: Record<LabSettings['level'], LabStep[]> = {
  supplied: ['Question', 'Predict', 'Test', 'Result', 'Explain'],
  students: ['Question', 'Predict', 'Make', 'Test', 'Result', 'Explain'],
  pairs: ['Question', 'Design', 'Predict', 'Test', 'Result', 'Name it', 'Explain']
};
const RESULT = setResult({ judge: 'rate', options: 2, picks: [], ratings: [[8, 8, 7], [5, 5, 6]], predictions: [2, 4], readers: 6, threshold: 1 });
const FOUND: NonNullable<LabStatus['findings']> = {
  control: { mean: 6.5, n: 8, ratings: [5, 6, 6, 6, 7, 7, 7, 8] }, threshold: 1,
  trials: [
    { desc: ['cut "I think,"'], shift: -1.8, n: 5, verdict: -1, thin: false, mine: true },
    { desc: ['broke line 2 after "the"'], shift: 2.1, n: 4, verdict: 1, thin: false, mine: false }
  ],
  mine: { desc: ['cut "I think,"'], shift: -1.8, n: 5, verdict: -1, thin: false, mine: true, edit: { cut: [8, 9] }, ratings: [4, 4, 5, 5, 6], mean: 4.7, pred: -1, held: true }
};
type Me = NonNullable<LabStatus['me']>;
const TRIAL = { edit: { cut: [8, 9] }, ready: true, pred: null, feature: null, trial: true };

function statusFor(settings: LabSettings, step: LabStep, over: Partial<LabStatus> = {}, me: Partial<Me> = {}): LabStatus {
  const steps = STEPS[settings.level];
  const at = steps.indexOf(step);
  return {
    identity: { need: null, initials: 'KT' },
    round: { session: 'a'.repeat(32), step: at, step_name: step, steps, revealed: false, finished: false },
    me: { pred: null, reason: '', notes: {}, done: {}, ...(settings.level === 'students' ? { writing: ['a', 'b', ''] } : {}), ...me },
    pair: null, control: settings.level === 'pairs' ? STANZA : null, reading: null, results: null, findings: null, ...over
  };
}

const flush = async () => { for (let i = 0; i < 4; i += 1) await new Promise((r) => setTimeout(r, 0)); };

function mount(settings: LabSettings, first: LabStatus) {
  let current = first;
  /** A saved note comes back on the student's record, as the server sends it. */
  const noted = (step: string, text: string): LabStatus => {
    current = { ...current, me: { ...current.me!, notes: { ...current.me!.notes, ...(text ? { [step]: text } : {}) } } };
    return current;
  };
  const same = () => Promise.resolve(current);
  const client: LabClient = {
    status: vi.fn(same), claim: vi.fn(same), bench: vi.fn(same), rate: vi.fn(same), pick: vi.fn(same), explain: vi.fn(same),
    note: vi.fn((step: LabStep, text: string) => Promise.resolve(noted(step, text))),
    predict: vi.fn((_pred: number, _reason: string, note?: string) => Promise.resolve(noted('Predict', note ?? ''))),
    write: vi.fn((_option: number, _text: string, note?: string) => Promise.resolve(noted('Make', note ?? ''))),
    ready: vi.fn((_on: boolean, note?: string) => Promise.resolve(noted('Design', note ?? ''))),
    pairPredict: vi.fn((_pred: number, note?: string) => Promise.resolve(noted('Predict', note ?? ''))),
    feature: vi.fn((_feature: number, note?: string) => Promise.resolve(noted('Name it', note ?? '')))
  };
  const lesson = {
    lesson_id: 'lab1', title: 'Lab', unit_id: 'unit1', published_at: '2026-11-19T00:00:00.000Z', schema_version: 1, pedagogical_mode: 'lab',
    lab: publicLab(settings), blocks: [labExplainBlock(settings, '2026-11-19T00:00:00.000Z')]
  } as unknown as PublishedLesson;
  const host = document.createElement('div');
  document.body.append(host);
  mountLabPlayer(host, { lesson, classId: 'class1', client, handIn: async () => true, renderHero: () => undefined, pollMs: 60_000 });
  const box = () => host.querySelector('.lab-note textarea') as HTMLTextAreaElement | null;
  const press = (label: string) => ([...host.querySelectorAll('button')].find((b) => b.textContent === label) as HTMLButtonElement).click();
  const type = (words: string) => {
    box()!.value = words;
    box()!.dispatchEvent(new Event('input'));
  };
  const gate = () => host.querySelector('.lab-note em')?.textContent ?? '';
  return { host, client, box, press, type, gate, text: () => host.textContent ?? '' };
}

afterEach(() => { document.body.replaceChildren(); localStorage.clear(); });

/**
 * Every step that asks for a note, at every level: the status that puts the
 * student in front of the step's main button, what the student does before
 * pressing it, the button, and the call it makes once the note has words.
 */
type Case = {
  name: string;
  settings: LabSettings;
  step: LabStep;
  over?: Partial<LabStatus>;
  me?: Partial<Me>;
  before?: (host: HTMLElement) => void;
  button: string;
  sent: (client: LabClient) => unknown;
  prompt: string;
};
const pick = (label: string) => (host: HTMLElement) => ([...host.querySelectorAll('button')].find((b) => b.textContent === label) as HTMLButtonElement).click();
const fill = (words: string) => (host: HTMLElement) => {
  const area = host.querySelector('textarea.lab-prose') as HTMLTextAreaElement;
  area.value = words;
  area.dispatchEvent(new Event('input'));
};
const CASES: Case[] = [
  { name: 'supplied Question', settings: PASSIVE, step: 'Question', button: 'Save note', sent: (c) => c.note, prompt: 'Where do you hear it? Quote it.' },
  { name: 'supplied Predict', settings: PASSIVE, step: 'Predict', before: pick('Passive'), button: 'Lock it in', sent: (c) => c.predict, prompt: 'Because…' },
  { name: 'supplied Test', settings: PASSIVE, step: 'Test', over: { reading: { index: 1, total: 1, item: null } }, button: 'Save note', sent: (c) => c.note, prompt: 'Which version sounded most different? What had changed in it?' },
  { name: 'supplied Result', settings: PASSIVE, step: 'Result', over: { results: RESULT }, button: 'Save note', sent: (c) => c.note, prompt: 'What do the dots show? Look at the spread and the overlap.' },
  { name: 'students Make', settings: STORM, step: 'Make', before: fill('Cold air presses on my skin.'), button: 'Finish', sent: (c) => c.write, prompt: 'Which version was hardest to write? Why?' },
  { name: 'students Test', settings: STORM, step: 'Test', over: { reading: { index: 6, total: 6, item: null } }, button: 'Save note', sent: (c) => c.note, prompt: 'Which version sounded most different? What had changed in it?' },
  { name: 'pairs Question', settings: HESITANT, step: 'Question', over: { pair: { ...TRIAL, ready: false, trial: false, edit: {} } }, button: 'Save note', sent: (c) => c.note, prompt: 'Where do you hear it? Quote it.' },
  { name: 'pairs Design', settings: HESITANT, step: 'Design', over: { pair: { ...TRIAL, ready: false } }, button: 'Put it on the bench', sent: (c) => c.ready, prompt: 'Why this change? What is it doing in the original?' },
  { name: 'pairs Predict', settings: HESITANT, step: 'Predict', over: { pair: TRIAL }, before: pick('Less hesitant'), button: 'Lock it in', sent: (c) => c.pairPredict, prompt: 'Because…' },
  { name: 'pairs Test', settings: HESITANT, step: 'Test', over: { pair: TRIAL, reading: { index: 6, total: 6, item: null } }, button: 'Save note', sent: (c) => c.note, prompt: 'Which version sounded most different? What had changed in it?' },
  { name: 'pairs Result', settings: HESITANT, step: 'Result', over: { pair: { ...TRIAL, pred: -1 }, findings: FOUND }, button: 'Save note', sent: (c) => c.note, prompt: 'What do the dots show? Look at the spread and the overlap.' },
  { name: 'pairs Name it', settings: HESITANT, step: 'Name it', over: { pair: { ...TRIAL, pred: -1 }, findings: FOUND }, before: pick('Hedging (modality)'), button: 'Done', sent: (c) => c.feature, prompt: 'What does this feature do to the voice of the speaker?' }
];

describe('lab notes on: every step has its note box and waits for the note', () => {
  for (const c of CASES) {
    it(`${c.name}: the button waits for the note, then sends it`, async () => {
      const { host, client, box, press, type, gate } = mount({ ...c.settings, notes_on: true }, statusFor(c.settings, c.step, c.over, c.me));
      await flush();
      expect(box(), 'the dashed note box').not.toBeNull();
      expect(host.querySelector('.lab-note span')?.textContent).toBe('Lab note');
      expect(box()!.placeholder).toBe(c.prompt);
      c.before?.(host);
      expect(gate()).toBe('');
      press(c.button);
      await flush();
      expect(c.sent(client)).not.toHaveBeenCalled();
      expect(gate()).toBe(NOTE_GATE);
      expect(document.activeElement).toBe(box());
      type('A short note.');
      expect(gate()).toBe('');
      press(c.button);
      await flush();
      const call = (c.sent(client) as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(call[call.length - 1]).toBe('A short note.');
      if (c.button === 'Save note') {
        // The note is shown back, and the student waits.
        expect(host.querySelector('.lab-said')?.textContent).toBe('A short note.');
        expect(box()).toBeNull();
      }
    });
  }
});

describe('lab notes off: nothing renders and nothing blocks', () => {
  for (const c of CASES) {
    it(`${c.name}: no note box`, async () => {
      const { host, client, box, press } = mount({ ...c.settings, notes_on: false }, statusFor(c.settings, c.step, c.over, c.me));
      await flush();
      expect(box()).toBeNull();
      expect(host.querySelector('.lab-notes')).toBeNull();
      expect(host.querySelector('.lab-said')).toBeNull();
      if (c.button === 'Save note') {
        expect([...host.querySelectorAll('button')].some((b) => b.textContent === 'Save note')).toBe(false);
        return;
      }
      c.before?.(host);
      press(c.button);
      await flush();
      expect(c.sent(client)).toHaveBeenCalledTimes(1);
    });
  }
});

describe('lab notes: prompts, the pair, the strip and the panel', () => {
  it('uses the teacher’s prompt for a step, and the usual one where theirs is blank', async () => {
    const settings = { ...HESITANT, notes_on: true, note_prompts: { Question: 'Which line sounds least sure?', Design: '  ' } };
    const q = mount(settings, statusFor(settings, 'Question'));
    await flush();
    expect(q.box()!.placeholder).toBe('Which line sounds least sure?');
    const d = mount(settings, statusFor(settings, 'Design', { pair: { ...TRIAL, ready: false } }));
    await flush();
    expect(d.box()!.placeholder).toBe('Why this change? What is it doing in the original?');
  });

  it('a partner whose pair has already acted still writes their own note', async () => {
    const settings = { ...HESITANT, notes_on: true };
    const { host, client, box, press, type } = mount(settings, statusFor(settings, 'Predict', { pair: { ...TRIAL, pred: -1 } }));
    await flush();
    expect(host.querySelector('h2')?.textContent).toBe('Locked in: less hesitant');
    expect(box()).not.toBeNull();
    type('Because the doubt is in those words.');
    press('Save note');
    await flush();
    expect(client.note).toHaveBeenCalledWith('Predict', 'Because the doubt is in those words.');
    expect(host.querySelector('.lab-said')?.textContent).toBe('Because the doubt is in those words.');
    expect(host.textContent).toContain('Waiting for your teacher.');
  });

  it('what is typed in a note box is kept when the screen is drawn again', async () => {
    const settings = { ...HESITANT, notes_on: true };
    const { host, box, type } = mount(settings, statusFor(settings, 'Design', { pair: { ...TRIAL, ready: false } }));
    await flush();
    const first = box();
    type('The hedge is');
    // Tapping a word redraws the bench, and the note box with it.
    (host.querySelector('button.lab-tok') as HTMLButtonElement).click();
    expect(box()).not.toBe(first);
    expect(box()!.value).toBe('The hedge is');
  });

  it('the strip above the card keeps the facts as they happen', async () => {
    const lab = publicLab({ ...HESITANT, notes_on: true });
    const base = statusFor(HESITANT, 'Design');
    expect(factsStrip(lab, { ...base, pair: { ...TRIAL, ready: false } })).toBeNull();
    expect(labFacts(lab, { ...base, pair: TRIAL })).toEqual(['Cut "I think,"']);
    expect(labFacts(lab, { ...base, pair: { ...TRIAL, pred: -1 } })).toEqual(['Cut "I think,"', 'Predicted less hesitant']);
    expect(labFacts(lab, { ...base, pair: { ...TRIAL, pred: -1, feature: 1 }, findings: FOUND })).toEqual(['Cut "I think,"', 'Predicted less hesitant', 'Shift −1.8', 'Hedging (modality)']);
    const strip = factsStrip(lab, { ...base, pair: { ...TRIAL, pred: -1 }, findings: FOUND })!;
    expect(strip.textContent).toBe('Lab notesCut "I think," · Predicted less hesitant · Shift −1.8');
    // Off: no strip, whatever has happened.
    expect(factsStrip(publicLab({ ...HESITANT, notes_on: false }), { ...base, pair: { ...TRIAL, pred: -1 }, findings: FOUND })).toBeNull();
    // The supplied levels keep the prediction and the winner.
    const passive = publicLab({ ...PASSIVE, notes_on: true });
    expect(labFacts(passive, statusFor(PASSIVE, 'Result', { results: RESULT }, { pred: 1 }))).toEqual(['Predicted passive', 'Active scored highest']);
    // It sits between the step strip and the card.
    const settings = { ...HESITANT, notes_on: true };
    const { host } = mount(settings, statusFor(settings, 'Predict', { pair: { ...TRIAL, pred: -1 } }));
    await flush();
    expect([...host.querySelector('.lab__body')!.children].map((n) => n.className)).toEqual(['lab-strip', 'lab-notes', 'lab-card']);
  });

  it('the panel above the Explain box lists the notes in step order', async () => {
    const notes = { 'Name it': 'It lets the speaker back away.', Question: '"I think," in line 2.', Result: 'The dots sit lower.', Design: 'The hedge is the doubt.', Predict: '' };
    const lab = publicLab({ ...HESITANT, notes_on: true });
    const me = { pred: null, reason: '', notes, done: {} };
    const panel = notesPanel({ lab, me }, STEPS.pairs)!;
    expect(panel.querySelector('.lab-label')?.textContent).toBe('Your lab notes');
    expect([...panel.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
      'Question"I think," in line 2.', 'DesignThe hedge is the doubt.', 'ResultThe dots sit lower.', 'Name itIt lets the speaker back away.'
    ]);
    expect(notesPanel({ lab: publicLab({ ...HESITANT, notes_on: false }), me }, STEPS.pairs)).toBeNull();
    expect(notesPanel({ lab, me: { ...me, notes: {} } }, STEPS.pairs)).toBeNull();

    // On the Explain screen it sits above the answer box, under the claim and the key numbers.
    const settings = { ...HESITANT, notes_on: true };
    const { host, text } = mount(settings, statusFor(settings, 'Explain', { pair: { ...TRIAL, pred: -1, feature: 1 }, findings: FOUND }, { notes }));
    await flush();
    expect(text()).toContain('Claim: The line breaks create the hesitation.');
    expect(text()).toContain('Your trial: cut "I think,", shift −1.8.');
    expect(text()).toContain('Biggest shift in the class: broke line 2 after "the", +2.1.');
    const order = [...host.querySelector('.lab-card')!.children].map((n) => n.className);
    expect(order.indexOf('lab-pane lab-notes-panel')).toBeGreaterThan(-1);
    expect(order.indexOf('lab-pane lab-notes-panel')).toBeLessThan(order.indexOf('lab-explain'));
  });
});

describe('Name it, on a student’s device', () => {
  it('the pair picks its feature from the lab’s list and presses Done', async () => {
    const settings = { ...HESITANT, notes_on: false };
    const { host, client, press } = mount(settings, statusFor(settings, 'Name it', { pair: { ...TRIAL, pred: -1 }, findings: FOUND }));
    await flush();
    expect(host.querySelector('h2')?.textContent).toBe('Name what you changed');
    expect(host.textContent).toContain('Your change: cut "I think,".');
    expect([...host.querySelectorAll('.lab-chip')].map((c) => c.textContent)).toEqual(['Line break (enjambment)', 'Hedging (modality)', 'Sentence type', 'Punctuation (caesura)', 'Repetition', 'Word choice (connotation)']);
    const done = host.querySelector('[data-act="named"]') as HTMLButtonElement;
    expect(done.disabled).toBe(true);
    press('Hedging (modality)');
    expect(done.disabled).toBe(false);
    done.click();
    await flush();
    expect(client.feature).toHaveBeenCalledWith(1, '');
  });

  it('once named it shows the feature and its level, and a pair with no trial reads on', async () => {
    const settings = { ...HESITANT, notes_on: false };
    const named = mount(settings, statusFor(settings, 'Name it', { pair: { ...TRIAL, pred: -1, feature: 1 }, findings: FOUND }));
    await flush();
    expect(named.host.querySelector('h2')?.textContent).toBe('Hedging (modality)');
    expect(named.text()).toContain('Sentence level');
    expect(named.text()).toContain('Waiting for your teacher.');
    const none = mount(settings, statusFor(settings, 'Name it', { pair: { edit: {}, ready: false, pred: null, feature: null, trial: false }, findings: { ...FOUND, mine: null } }));
    await flush();
    expect(none.host.querySelector('h2')?.textContent).toBe('You are a reader this round');
    expect(none.host.querySelector('.lab-chip')).toBeNull();
  });
});

describe('the trait words predictions and verdicts', () => {
  it('with a trait: less hesitant, about as hesitant, more hesitant', async () => {
    const settings = { ...HESITANT, notes_on: false };
    const predict = mount(settings, statusFor(settings, 'Predict', { pair: TRIAL }));
    await flush();
    expect(predict.host.querySelector('h2')?.textContent).toBe('If we cut "I think,", the speaker will sound…');
    expect([...predict.host.querySelectorAll('.lab-chip')].map((c) => c.textContent)).toEqual(['Less hesitant', 'About as hesitant', 'More hesitant']);
    const result = mount(settings, statusFor(settings, 'Result', { pair: { ...TRIAL, pred: -1 }, findings: FOUND }));
    await flush();
    expect(result.host.querySelector('h2')?.textContent).toBe('Your change made the speaker sound less hesitant. As you predicted.');
    const missed = mount(settings, statusFor(settings, 'Result', { pair: { ...TRIAL, pred: 1 }, findings: { ...FOUND, mine: { ...FOUND.mine!, pred: 1, held: false } } }));
    await flush();
    expect(missed.host.querySelector('h2')?.textContent).toBe('Your change made the speaker sound less hesitant. You predicted more hesitant.');
  });

  it('with no trait the wording stays general', async () => {
    const settings = { ...HESITANT, notes_on: false, trait: '' };
    const predict = mount(settings, statusFor(settings, 'Predict', { pair: TRIAL }));
    await flush();
    expect(predict.host.querySelector('h2')?.textContent).toBe('If we cut "I think,", readers will rate it…');
    expect([...predict.host.querySelectorAll('.lab-chip')].map((c) => c.textContent)).toEqual(['Lower', 'About the same', 'Higher']);
  });
});
