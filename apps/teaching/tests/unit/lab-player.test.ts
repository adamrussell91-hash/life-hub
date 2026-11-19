import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountLabPlayer } from '@/lab/player';
import type { LabClient, LabStatus } from '@/lab/api';
import { setResult } from '@/lab/model';
import { labExplainBlock, publicLab, seedLab, type LabSettings } from '@/lab/schema';
import type { PublishedLesson } from '@/schemas/published-lesson';

// An invented lab and an invented student, KT.
const SETTINGS: LabSettings = {
  ...seedLab('class1'), question: 'Does the passive voice shrink the blame?', why: 'Your essay will claim that voice shapes blame.',
  same: 'The events and their order.', options: ['Active', 'Passive'], texts: ['The company dumped waste.', 'Waste was dumped.'],
  judge_question: 'How much is the company to blame?', debrief: 'Teacher only.'
};
const STEPS = ['Question', 'Predict', 'Test', 'Result', 'Explain'] as const;
const lessonFor = (settings: LabSettings = SETTINGS): PublishedLesson => ({
  lesson_id: 'lab1', title: 'Passive voice lab', unit_id: 'unit1', published_at: '2026-11-19T00:00:00.000Z', schema_version: 1, pedagogical_mode: 'lab',
  lab: publicLab(settings), blocks: [labExplainBlock(settings, '2026-11-19T00:00:00.000Z')]
} as unknown as PublishedLesson);

const at = (step: number, over: Partial<LabStatus> = {}, me: Partial<NonNullable<LabStatus['me']>> = {}): LabStatus => ({
  identity: { need: null, initials: 'KT' },
  round: { session: 'a'.repeat(32), step, step_name: STEPS[step] ?? null, steps: [...STEPS], revealed: false, finished: step >= STEPS.length },
  me: { pred: null, reason: '', notes: {}, done: {}, ...me },
  pair: null, reading: null, results: null, ...over
});
const RESULT = setResult({ judge: 'rate', options: 2, picks: [], ratings: [[8, 8, 7], [5, 5, 6]], predictions: [2, 4], readers: 6, threshold: 1 });

const flush = async () => { for (let i = 0; i < 4; i += 1) await new Promise((r) => setTimeout(r, 0)); };

function mount(first: LabStatus, settings: LabSettings = SETTINGS) {
  let current = first;
  const reply = (next: LabStatus) => { current = next; return Promise.resolve(next); };
  const client: LabClient = {
    status: vi.fn(() => Promise.resolve(current)),
    claim: vi.fn(() => reply(at(0))),
    predict: vi.fn((pred: number, reason: string) => reply(at(1, {}, { pred, reason, done: { Predict: true } }))),
    note: vi.fn(() => Promise.resolve(current)),
    write: vi.fn(() => Promise.resolve(current)),
    bench: vi.fn(() => Promise.resolve(current)),
    ready: vi.fn(() => Promise.resolve(current)),
    pairPredict: vi.fn(() => Promise.resolve(current)),
    rate: vi.fn(() => reply(at(2, { reading: { index: 1, total: 1, item: null } }, { done: { Test: true } }))),
    pick: vi.fn(() => reply(at(2, { reading: { index: 1, total: 1, item: null } }, { done: { Test: true } }))),
    explain: vi.fn(() => reply(at(4, { results: RESULT }, { pred: 1, done: { Explain: true } })))
  };
  const host = document.createElement('div');
  document.body.append(host);
  const handIn = vi.fn(async () => true);
  const player = mountLabPlayer(host, { lesson: lessonFor(settings), classId: 'class1', client, handIn, renderHero: () => undefined, pollMs: 60_000 });
  const set = (next: LabStatus) => { current = next; };
  const text = () => host.textContent ?? '';
  const click = (label: string) => ([...host.querySelectorAll('button')].find((b) => b.textContent === label) as HTMLButtonElement).click();
  return { host, client, player, set, text, click, handIn };
}

afterEach(() => { document.body.replaceChildren(); localStorage.clear(); });

describe('the lab player', () => {
  it('asks for initials, then joins', async () => {
    const { host, text, client } = mount({ identity: { need: 'initials', initials: null }, round: null, me: null, pair: null, reading: null, results: null });
    await flush();
    expect(text()).toContain('Type your initials to join the lab.');
    (host.querySelector('.lab-claim input') as HTMLInputElement).value = 'KT';
    (host.querySelector('.lab-claim') as HTMLFormElement).dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(client.claim).toHaveBeenCalledWith('KT');
    expect(text()).toContain('Does the passive voice shrink the blame?');
  });

  it('waits for the teacher before the round starts, and says who it is for', async () => {
    const waitingFor = mount({ identity: { need: null, initials: 'KT' }, round: null, me: null, pair: null, reading: null, results: null });
    await flush();
    expect(waitingFor.text()).toContain('Your teacher will start the lab soon.');
    const other = mount({ identity: { need: null, initials: 'UW' }, not_for_you: true, round: null, me: null, pair: null, reading: null, results: null });
    await flush();
    expect(other.text()).toContain('This lab is for another class.');
  });

  it('Question shows the question, what is the same, what changed and why', async () => {
    const { host, text } = mount(at(0));
    await flush();
    expect(host.querySelector('.lab-strip')?.textContent).toContain('Question · 1 of 5');
    expect(host.querySelectorAll('.lab-dots i')).toHaveLength(5);
    expect(host.querySelector('h2')?.textContent).toBe('Does the passive voice shrink the blame?');
    expect([...host.querySelectorAll('.lab-facts .lab-chip')].map((c) => c.textContent)).toEqual(['Active', 'Passive']);
    expect(text()).toContain('The events and their order.');
    expect(text()).toContain('Why we are testing it: Your essay will claim that voice shapes blame.');
    expect(text()).toContain('You will read one version and rate it.');
    expect(text()).toContain('Waiting for your teacher.');
    // Teacher-only lines never reach the page.
    expect(text()).not.toContain('Teacher only.');
    expect(text()).not.toContain('dumped');
  });

  it('Predict locks a choice and a reason, then waits', async () => {
    const { host, client, click, text } = mount(at(1));
    await flush();
    const lock = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Lock it in') as HTMLButtonElement;
    expect(lock.disabled).toBe(true);
    click('Passive');
    expect(lock.disabled).toBe(false);
    const reason = host.querySelector('textarea') as HTMLTextAreaElement;
    reason.value = 'nobody is named';
    reason.dispatchEvent(new Event('input'));
    lock.click();
    await flush();
    expect(client.predict).toHaveBeenCalledWith(1, 'nobody is named');
    expect(host.querySelector('h2')?.textContent).toBe('Locked in: passive');
    expect(text()).toContain('Because nobody is named');
    expect(text()).toContain('Waiting for your teacher.');
  });

  it('a poll that changes nothing leaves a half-made prediction alone', async () => {
    const { host, player, click } = mount(at(1));
    await flush();
    click('Active');
    const before = host.querySelector('.lab-card');
    await player.refresh();
    expect(host.querySelector('.lab-card')).toBe(before);
    expect(host.querySelector('.lab-chip.is-on')?.textContent).toBe('Active');
  });

  it('Test shows one text to rate on a line, sends it, then waits', async () => {
    const { host, client, click, text } = mount(at(2, { reading: { index: 0, total: 1, item: { kind: 'text', text: 'Waste was dumped.' } } }));
    await flush();
    expect(host.querySelector('h2')?.textContent).toBe('How much is the company to blame?');
    expect(host.querySelector('.lab-piece')?.textContent).toBe('Waste was dumped.');
    expect([...host.querySelectorAll('.lab-ends span')].map((s) => s.textContent)).toEqual(['A little', 'Completely']);
    // Nothing on the screen says which version this is.
    expect(text()).not.toContain('Passive');
    const range = host.querySelector('input[type="range"]') as HTMLInputElement;
    expect(range.value).toBe('5');
    range.value = '4';
    range.dispatchEvent(new Event('input'));
    click('Send');
    await flush();
    expect(client.rate).toHaveBeenCalledWith(0, 4);
    expect(host.querySelector('h2')?.textContent).toBe('Rating sent');
    expect(text()).toContain('Waiting for your teacher.');
  });

  it('Test with pick one shows every version unlabelled and sends the position tapped', async () => {
    const picked = { ...SETTINGS, judge: 'pick' as const, threshold: 2, ends: undefined };
    const { host, client } = mount(at(2, { reading: { index: 0, total: 1, item: { kind: 'set', pieces: ['Waste was dumped.', 'The company dumped waste.'] } } }), picked);
    await flush();
    const pieces = [...host.querySelectorAll('button.lab-piece')] as HTMLButtonElement[];
    expect(pieces.map((p) => p.textContent)).toEqual(['AWaste was dumped.', 'BThe company dumped waste.']);
    pieces[1]!.click();
    await flush();
    expect(client.pick).toHaveBeenCalledWith(0, 1);
    expect(host.querySelector('h2')?.textContent).toBe('Choice sent');
  });

  it('Result shows the headline, the bars, and what this reader had', async () => {
    const { host, text } = mount(at(3, { results: RESULT }, { pred: 1, read: [{ version: 1, value: 4 }] }));
    await flush();
    expect(host.querySelector('h2')?.textContent).toBe('The active version scored highest. You predicted passive.');
    const rows = [...host.querySelectorAll('.lab-bar')];
    expect(rows.map((r) => r.textContent)).toEqual(['Active7.7', 'Passive5.3']);
    expect(rows[0]!.classList.contains('is-top')).toBe(true);
    expect((rows[0]!.querySelector('i') as HTMLElement).dataset.w).toBe('77');
    expect(text()).toContain('Average out of 10, from 6 readers.');
    expect(text()).toContain('Ahead by 2.4. That counts as a win.');
    expect(text()).toContain('You read the passive version and gave it 4.');
  });

  it('a result too close to call says so and tops no bar', async () => {
    const close = setResult({ judge: 'rate', options: 2, picks: [], ratings: [[6, 6], [6, 5]], predictions: [1, 1], readers: 4, threshold: 1 });
    const { host, text } = mount(at(3, { results: close }, { pred: 0 }));
    await flush();
    expect(host.querySelector('h2')?.textContent).toBe('Too close to call. You predicted active.');
    expect(host.querySelector('.lab-bar.is-top')).toBeNull();
    expect(text()).toContain('A win needs 1 or more.');
  });

  it('Explain renders the lesson’s written-question block and hands it in', async () => {
    const { host, client, click, text, handIn } = mount(at(4, { results: RESULT }, { pred: 1 }));
    await flush();
    expect(host.querySelector('h2')?.textContent).toBe('Why did the active version score highest?');
    expect(text()).toContain('Active 7.7, Passive 5.3 out of 10, on average.');
    expect(host.querySelector('.lab-explain [data-block-id="lab_explain"], .lab-explain .block')).not.toBeNull();
    const box = host.querySelector('.lab-explain textarea') as HTMLTextAreaElement;
    expect(box).not.toBeNull();
    box.value = 'With the company as the subject there is nowhere else to look.';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    click('Hand in');
    await flush();
    expect(handIn).toHaveBeenCalledTimes(1);
    expect(client.explain).toHaveBeenCalledTimes(1);
    expect(host.querySelector('h2')?.textContent).toBe('Handed in');
    // The answer is still there to change.
    expect((host.querySelector('.lab-explain textarea') as HTMLTextAreaElement).value).toBe('With the company as the subject there is nowhere else to look.');
  });

  it('a step that is not built yet shows a plain card, and the finish shows the end', async () => {
    const pairs = { ...seedLab('class1', 'pairs'), question: 'What makes this speaker sound hesitant?', claim: 'The line breaks create the hesitation.', control: 'One line\nand another', judge_question: 'How hesitant does the speaker sound?' };
    const steps = ['Question', 'Design', 'Predict', 'Test', 'Result', 'Name it', 'Explain'] as const;
    const status = at(5);
    status.round = { ...status.round!, steps: [...steps], step_name: 'Name it', finished: false };
    const naming = mount(status, pairs);
    await flush();
    expect(naming.host.querySelector('h2')?.textContent).toBe('Name it');
    expect(naming.text()).toContain('This step is not built yet.');
    const done = mount(at(5));
    await flush();
    expect(done.host.querySelector('h2')?.textContent).toBe('Lab finished');
  });

  it('moves with the class when the teacher goes to the next step', async () => {
    const { host, player, set } = mount(at(0));
    await flush();
    set(at(1));
    await player.refresh();
    expect(host.querySelector('.lab-strip')?.textContent).toContain('Predict · 2 of 5');
    expect(host.querySelector('h2')?.textContent).toBe('Which version will score highest?');
  });
});

// ---------------------------------------------------------------------------
// Students write it
// ---------------------------------------------------------------------------

const STORM: LabSettings = {
  ...seedLab('class1', 'students'), question: 'Which sense makes a storm feel most real?', same: 'The moment the storm hits the house.',
  options: ['Sight', 'Sound', 'Touch'], task: 'The storm hits the house.', judge_question: 'Which one feels most real?'
};
const STORM_STEPS = ['Question', 'Predict', 'Make', 'Test', 'Result', 'Explain'] as const;
const storm = (step: number, over: Partial<LabStatus> = {}, me: Partial<NonNullable<LabStatus['me']>> = {}): LabStatus => {
  const status = at(step, over, { writing: ['', '', ''], ...me });
  status.round = { ...status.round!, steps: [...STORM_STEPS], step_name: STORM_STEPS[step] ?? null, finished: step >= STORM_STEPS.length };
  return status;
};

describe('the lab player, students write it', () => {
  it('Make moves through the options one box at a time and saves each version', async () => {
    const { host, client, click, text } = mount(storm(2), STORM);
    const saved = ['', '', ''];
    (client.write as ReturnType<typeof vi.fn>).mockImplementation((option: number, words: string) => {
      saved[option] = words;
      return Promise.resolve(storm(2, {}, { writing: [...saved], done: { Make: saved.every(Boolean) } }));
    });
    await flush();
    expect(host.querySelector('h2')?.textContent).toBe('The storm hits the house. Lean on sight.');
    expect(host.querySelector('h2 .lab-var')?.textContent).toBe('sight');
    expect(text()).toContain('Version 1 of 3.');
    // An empty box stays put.
    click('Next: sound');
    await flush();
    expect(client.write).not.toHaveBeenCalled();
    const type = (words: string) => {
      const box = host.querySelector('textarea') as HTMLTextAreaElement;
      box.value = words;
      box.dispatchEvent(new Event('input'));
    };
    type('The sky goes the colour of a bruise.');
    click('Next: sound');
    await flush();
    expect(client.write).toHaveBeenLastCalledWith(0, 'The sky goes the colour of a bruise.');
    expect(host.querySelector('h2')?.textContent).toBe('The storm hits the house. Lean on sound.');
    expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('');
    type('The gutters choke and spit.');
    click('Next: touch');
    await flush();
    expect(text()).toContain('Version 3 of 3.');
    type('The air presses on my skin.');
    click('Finish');
    await flush();
    expect(client.write).toHaveBeenLastCalledWith(2, 'The air presses on my skin.');
    expect(host.querySelector('h2')?.textContent).toBe('Three versions written');
    expect(text()).toContain('Waiting for your teacher.');
    // A version can still be changed while Make is open.
    click('Change a version');
    expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('The sky goes the colour of a bruise.');
  });

  it('Make keeps the words and the box when a save fails', async () => {
    const { host, client, click, text } = mount(storm(2), STORM);
    (client.write as ReturnType<typeof vi.fn>).mockImplementation(() => Promise.reject(new Error('The save didn’t go through.')));
    await flush();
    const box = host.querySelector('textarea') as HTMLTextAreaElement;
    box.value = 'Rain comes sideways.';
    box.dispatchEvent(new Event('input'));
    click('Next: sound');
    await flush();
    expect(text()).toContain('Version 1 of 3.');
    expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Rain comes sideways.');
    expect(host.querySelector('.lab-err')?.textContent).not.toBe('');
  });

  it('Test shows one writer’s versions unlabelled, and a pick advances to the next writer', async () => {
    const first = { kind: 'set' as const, pieces: ['A crack splits the afternoon.', 'The door handle is cold and slick.', 'Lightning turns the kitchen white.'] };
    const second = { kind: 'set' as const, pieces: ['Leaves spin past the window.', 'Rain drums the tin.', 'The wall leans into my shoulder.'] };
    const { host, client, text } = mount(storm(3, { reading: { index: 0, total: 6, item: first } }), STORM);
    (client.pick as ReturnType<typeof vi.fn>).mockImplementation(() => Promise.resolve(storm(3, { reading: { index: 1, total: 6, item: second } })));
    await flush();
    expect(host.querySelector('h2')?.textContent).toBe('Which one feels most real?');
    expect(text()).toContain('Writer 1 of 6. Tap one.');
    for (const label of ['Sight', 'Sound', 'Touch']) expect(text()).not.toContain(label);
    const pieces = [...host.querySelectorAll('button.lab-piece')] as HTMLButtonElement[];
    expect(pieces.map((p) => p.textContent?.charAt(0))).toEqual(['A', 'B', 'C']);
    pieces[2]!.click();
    await flush();
    expect(client.pick).toHaveBeenCalledWith(0, 2);
    expect(text()).toContain('Writer 2 of 6. Tap one.');
    expect(host.querySelector('button.lab-piece')?.textContent).toBe('ALeaves spin past the window.');
  });

  it('Test ends with the writers read, and Result says how the student’s own writing went', async () => {
    const read = mount(storm(3, { reading: { index: 6, total: 6, item: null } }), STORM);
    await flush();
    expect(read.host.querySelector('h2')?.textContent).toBe('Six writers read');
    const results = setResult({ judge: 'pick', options: 3, picks: [20, 46, 30], ratings: [], predictions: [9, 5, 3], readers: 16, threshold: 8 });
    const { host, text } = mount(storm(4, { results }, { pred: 0, own: { chosen: [1, 1, 4], readers: 6 } }), STORM);
    await flush();
    expect(host.querySelector('h2')?.textContent).toBe('Sound won. You predicted sight.');
    expect([...host.querySelectorAll('.lab-bar')].map((r) => r.textContent)).toEqual(['Sound46', 'Touch30', 'Sight20']);
    expect(text()).toContain('96 choices from 16 readers.');
    expect(text()).toContain('Your writing: 4 of your 6 readers chose your touch version.');
    expect(text()).toContain('Your other versions: Sight 1, Sound 1.');
  });
});

// ---------------------------------------------------------------------------
// Pairs design it
// ---------------------------------------------------------------------------

const STANZA = 'I meant to tell you\nbut the words, I think,\nwere somewhere else.';
const HESITANT: LabSettings = {
  ...seedLab('class1', 'pairs'), question: 'What makes this speaker sound hesitant?', claim: 'The line breaks create the hesitation.',
  why: 'Your essay will claim that form creates meaning.', control: STANZA, judge_question: 'How hesitant does the speaker sound?', notes_on: false,
  pairs: [{ id: 'p1', students: ['st_01', 'st_02'] }], debrief: 'Teacher only.'
};
const PAIR_STEPS = ['Question', 'Design', 'Predict', 'Test', 'Result', 'Name it', 'Explain'] as const;
type Pair = NonNullable<LabStatus['pair']>;
const NO_PAIR: Pair = { edit: {}, ready: false, pred: null, feature: null, trial: false };
const pairs = (step: number, pair: Partial<Pair> | null = {}, over: Partial<LabStatus> = {}): LabStatus => {
  const status = at(step, { control: STANZA, findings: null, pair: pair ? { ...NO_PAIR, ...pair } : null, ...over });
  status.round = { ...status.round!, steps: [...PAIR_STEPS], step_name: PAIR_STEPS[step] ?? null, finished: step >= PAIR_STEPS.length };
  return status;
};
const FOUND: NonNullable<LabStatus['findings']> = {
  control: { mean: 6.5, n: 8, ratings: [5, 6, 6, 6, 7, 7, 7, 8] }, threshold: 1,
  trials: [
    { desc: ['cut "I think,"'], shift: -1.8, n: 5, verdict: -1, thin: false, mine: true },
    { desc: ['joined lines 1 and 2'], shift: -0.4, n: 5, verdict: 0, thin: false, mine: false },
    { desc: ['broke line 2 after "the"'], shift: 2.1, n: 4, verdict: 1, thin: false, mine: false }
  ],
  mine: { desc: ['cut "I think,"'], shift: -1.8, n: 5, verdict: -1, thin: false, mine: true, edit: { cut: [8, 9] }, ratings: [4, 4, 5, 5, 6], mean: 4.7, pred: -1, held: true }
};

describe('the lab player, pairs design it', () => {
  it('Question shows the claim, the why and the control with numbered lines', async () => {
    const { host, text } = mount(pairs(0), HESITANT);
    await flush();
    expect(host.querySelector('h2')?.textContent).toBe('What makes this speaker sound hesitant?');
    expect(text()).toContain('Claim to test: The line breaks create the hesitation.');
    expect(text()).toContain('Why we are testing it: Your essay will claim that form creates meaning.');
    expect([...host.querySelectorAll('.lab-poem li')].map((li) => li.textContent)).toEqual(STANZA.split('\n'));
    expect(text()).not.toContain('Teacher only.');
  });

  it('Design: a tool saves the pair’s edit, and Put it on the bench sends it', async () => {
    const { host, client, text } = mount(pairs(1), HESITANT);
    (client.bench as ReturnType<typeof vi.fn>).mockImplementation((edit) => Promise.resolve(pairs(1, { edit, trial: true })));
    (client.ready as ReturnType<typeof vi.fn>).mockImplementation((on: boolean) => Promise.resolve(pairs(1, { edit: { cut: [9] }, trial: true, ready: on })));
    await flush();
    expect(host.querySelector('h2')?.textContent).toBe('Change one thing');
    const ready = () => host.querySelector('[data-act="ready"]') as HTMLButtonElement;
    expect(ready().disabled).toBe(true);
    ([...host.querySelectorAll('button.lab-tok')].find((b) => b.textContent === 'think,') as HTMLButtonElement).click();
    (host.querySelector('[data-tool="cut"]') as HTMLButtonElement).click();
    // The change shows straight away, before the save is back.
    expect(host.querySelector('.lab-change')?.textContent).toBe('One change: cut "think,".');
    await flush();
    expect(client.bench).toHaveBeenLastCalledWith({ cut: [9] });
    expect(host.querySelector('.lab-tok.is-sel')?.textContent).toBe('think,');
    ready().click();
    await flush();
    expect(client.ready).toHaveBeenCalledWith(true);
    expect(host.querySelector('h2')?.textContent).toBe('On the bench');
    expect(host.querySelector('.lab-pane.is-live .is-cut')?.textContent).toBe('think,');
    expect(text()).toContain('Your change: cut "think,".');
    expect(text()).toContain('Waiting for your teacher.');
    (host.querySelector('[data-act="unready"]') as HTMLButtonElement).click();
    await flush();
    expect(client.ready).toHaveBeenLastCalledWith(false);
    expect(host.querySelector('h2')?.textContent).toBe('Change one thing');
  });

  it('Design: a partner’s save arrives with the next check', async () => {
    const { host, player, set } = mount(pairs(1), HESITANT);
    await flush();
    set(pairs(1, { edit: { join: [4] }, trial: true }));
    await player.refresh();
    expect(host.querySelector('.lab-change')?.textContent).toBe('One change: joined lines 1 and 2.');
  });

  it('Predict: the pair says what its change will do, once', async () => {
    const { host, client, click, text } = mount(pairs(2, { edit: { cut: [8, 9] }, trial: true, ready: true }), HESITANT);
    (client.pairPredict as ReturnType<typeof vi.fn>).mockImplementation((pred) => Promise.resolve(pairs(2, { edit: { cut: [8, 9] }, trial: true, ready: true, pred })));
    await flush();
    expect(host.querySelector('h2')?.textContent).toBe('If we cut "I think,", readers will rate it…');
    expect(text()).toContain('Readers answer: How hesitant does the speaker sound?');
    expect([...host.querySelectorAll('.lab-chip')].map((c) => c.textContent)).toEqual(['Lower', 'About the same', 'Higher']);
    const lock = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Lock it in') as HTMLButtonElement;
    expect(lock.disabled).toBe(true);
    click('Lower');
    lock.click();
    await flush();
    expect(client.pairPredict).toHaveBeenCalledWith(-1);
    expect(host.querySelector('h2')?.textContent).toBe('Locked in: lower');
  });

  it('a pair that kept the original reads this round, at Design’s end and at Predict', async () => {
    const kept = mount(pairs(2, { trial: false }), HESITANT);
    await flush();
    expect(kept.host.querySelector('h2')?.textContent).toBe('You are a reader this round');
    expect(kept.text()).toContain('Your pair kept the original');
    const alone = mount(pairs(1, null), HESITANT);
    await flush();
    expect(alone.host.querySelector('h2')?.textContent).toBe('You are a reader in this lab');
  });

  it('Test: each version is lines to rate, unmarked, and the next one follows', async () => {
    const lines = ['I meant to tell you but the words, I think,', 'were somewhere else.'];
    const { host, client, click, text } = mount(pairs(3, { edit: { cut: [9] }, trial: true }, { reading: { index: 0, total: 6, item: { kind: 'lines', lines } } }), HESITANT);
    (client.rate as ReturnType<typeof vi.fn>).mockImplementation(() => Promise.resolve(pairs(3, { edit: { cut: [9] }, trial: true }, { reading: { index: 1, total: 6, item: { kind: 'lines', lines: STANZA.split('\n') } } })));
    await flush();
    expect(host.querySelector('h2')?.textContent).toBe('How hesitant does the speaker sound?');
    expect([...host.querySelectorAll('.lab-poem li')].map((li) => li.textContent)).toEqual(lines);
    expect(host.querySelector('.lab-tok.is-cut, .lab-tok.is-changed, .lab-mk')).toBeNull();
    expect([...host.querySelectorAll('.lab-ends span')].map((s) => s.textContent)).toEqual(['Not at all', 'Completely']);
    expect(text()).toContain('Version 1 of 6. Some are changed and some are the original.');
    const range = host.querySelector('input[type="range"]') as HTMLInputElement;
    range.value = '8';
    range.dispatchEvent(new Event('input'));
    click('Send');
    await flush();
    expect(client.rate).toHaveBeenCalledWith(0, 8);
    expect(text()).toContain('Version 2 of 6.');
    expect((host.querySelector('input[type="range"]') as HTMLInputElement).value).toBe('5');
    const done = mount(pairs(3, {}, { reading: { index: 6, total: 6, item: null } }), HESITANT);
    await flush();
    expect(done.host.querySelector('h2')?.textContent).toBe('Six versions rated');
  });

  it('Result: the control’s dots above the pair’s own, the shift, and whether the prediction held', async () => {
    const { host, text } = mount(pairs(4, { edit: { cut: [8, 9] }, trial: true, pred: -1 }, { findings: FOUND }), HESITANT);
    await flush();
    expect(host.querySelector('h2')?.textContent).toBe('Your change moved the rating lower. As you predicted.');
    const readings = [...host.querySelectorAll('.lab-reading')];
    expect(readings.map((r) => r.querySelector('b')?.textContent)).toEqual(['Control', 'Your version']);
    expect(readings.map((r) => r.querySelectorAll('circle').length)).toEqual([8, 5]);
    expect(readings[0]!.classList.contains('is-control')).toBe(true);
    expect(text()).toContain('Shift −1.8. A shift of 1 point or more counts as a change.');
    const missed = mount(pairs(4, { edit: { cut: [8, 9] }, trial: true, pred: 1 }, { findings: { ...FOUND, mine: { ...FOUND.mine!, shift: 0.2, verdict: 0, pred: 1, held: false } } }), HESITANT);
    await flush();
    expect(missed.host.querySelector('h2')?.textContent).toBe('Your change made no clear difference. You predicted higher.');
  });

  it('Result for a pair with no trial is what the class found', async () => {
    const { host, text } = mount(pairs(4, { trial: false }, { findings: { ...FOUND, mine: null, trials: FOUND.trials.map((t) => ({ ...t, mine: false })) } }), HESITANT);
    await flush();
    expect(host.querySelector('h2')?.textContent).toBe('What the class found');
    expect(host.querySelectorAll('.lab-find').length).toBe(3);
    expect(host.querySelector('button.lab-find')).toBeNull();
    expect(text()).toContain('Each row is one pair’s change.');
  });

  it('Explain shows the claim, the pair’s shift and the biggest shift in the class above the answer box', async () => {
    const { host, client, click, text, handIn } = mount(pairs(6, { edit: { cut: [8, 9] }, trial: true, pred: -1 }, { findings: FOUND }), HESITANT);
    (client.explain as ReturnType<typeof vi.fn>).mockImplementation(() => Promise.resolve(pairs(6, { edit: { cut: [8, 9] }, trial: true, pred: -1 }, { findings: FOUND, me: { pred: null, reason: '', notes: {}, done: { Explain: true } } })));
    await flush();
    expect(host.querySelector('h2')?.textContent).toBe('Does the evidence support the claim?');
    expect(text()).toContain('Claim: The line breaks create the hesitation.');
    expect(text()).toContain('Your trial: cut "I think,", shift −1.8. Biggest shift in the class: broke line 2 after "the", +2.1.');
    expect(host.querySelector('.lab-explain textarea')).not.toBeNull();
    click('Hand in');
    await flush();
    expect(handIn).toHaveBeenCalledTimes(1);
    expect(client.explain).toHaveBeenCalledTimes(1);
    expect(host.querySelector('h2')?.textContent).toBe('Handed in');
  });
});

