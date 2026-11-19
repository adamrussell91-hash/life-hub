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
    const students = { ...seedLab('class1', 'students'), question: 'Which sense makes a storm feel most real?', options: ['Sight', 'Sound'], task: 'Two sentences.', judge_question: 'Which feels most real?' };
    const steps = ['Question', 'Predict', 'Make', 'Test', 'Result', 'Explain'] as const;
    const status = at(2);
    status.round = { ...status.round!, steps: [...steps], step_name: 'Make' };
    const make = mount(status, students);
    await flush();
    expect(make.host.querySelector('h2')?.textContent).toBe('Make');
    expect(make.text()).toContain('This step is not built yet.');
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
