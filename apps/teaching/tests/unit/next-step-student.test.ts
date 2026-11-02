import { describe, expect, it, vi } from 'vitest';
import { chooseStep, mountNextStep, readStepPick, splitSentences, stepsLoader, type StepItem, type StepSkills } from '@/student/next-step';

const entry = (tag: string) => ({ lines: [0, 1, 2, 3, 4].map((i) => `${tag} line ${i}.`), edited: [false, false, false, false, false], source: 'x' });
const item: StepItem = { skills: ['writing.thesis', 'analysis.evidence'], next_steps: { ts: entry('TS'), ev: entry('EV') } };
const code = (id: string, hits: number) => ({ id, code: id.toUpperCase(), colour: 'lilac', hits });

describe('chooseStep', () => {
  it('takes the code with most hits, at the student’s rung', () => {
    const skills: StepSkills = { 'writing.thesis': { rung: 'skilled', codes: [code('ts', 2)] }, 'analysis.evidence': { rung: 'below', codes: [code('ev', 3)] } };
    expect(chooseStep(item, skills)).toEqual({ code_id: 'ev', code: 'EV', colour: 'lilac', line: 'EV line 0.' });
  });

  it('keeps the first skill on a tie', () => {
    const skills: StepSkills = { 'writing.thesis': { rung: 'excellent', codes: [code('ts', 2)] }, 'analysis.evidence': { rung: 'below', codes: [code('ev', 2)] } };
    expect(chooseStep(item, skills)?.line).toBe('TS line 4.');
  });

  it('moves past a code the bank lacks to the next one on that skill', () => {
    const skills: StepSkills = { 'writing.thesis': { rung: 'capable', codes: [code('x', 4), code('ts', 2)] } };
    expect(chooseStep(item, skills)).toMatchObject({ code_id: 'ts', line: 'TS line 1.' });
  });

  it('gives the Capable line when the skill has no rung yet', () => {
    expect(chooseStep(item, { 'writing.thesis': { rung: null, codes: [code('ts', 1)] } })?.line).toBe('TS line 1.');
  });

  it('has no step when the bank lacks the code, the box is untagged, or there is no claim', () => {
    expect(chooseStep(item, { 'writing.thesis': { rung: 'capable', codes: [code('ar', 4)] } })).toBeNull();
    expect(chooseStep({ next_steps: item.next_steps }, { 'writing.thesis': { rung: 'capable', codes: [code('ts', 1)] } })).toBeNull();
    expect(chooseStep(item, { 'writing.thesis': { rung: 'capable', codes: [] } })).toBeNull();
    expect(chooseStep(item, null)).toBeNull();
  });
});

describe('splitSentences', () => {
  it('keeps each sentence’s offsets in the answer', () => {
    const text = 'The river narrows.  Each summer it is “quieter.” Does the town notice?\nIt does';
    const out = splitSentences(text);
    expect(out.map((s) => s.text)).toEqual(['The river narrows.', 'Each summer it is “quieter.”', 'Does the town notice?', 'It does']);
    for (const s of out) expect(text.slice(s.start, s.end)).toBe(s.text);
  });

  it('gives nothing for blank text', () => {
    expect(splitSentences('   \n ')).toEqual([]);
  });
});

describe('readStepPick', () => {
  it('reads a stored part, a quiz pick, and refuses junk', () => {
    expect(readStepPick({ pick: JSON.stringify({ code_id: 'ts', line: 'L', start: 0, end: 4 }) })).toEqual({ code_id: 'ts', line: 'L', start: 0, end: 4 });
    expect(readStepPick({ code_id: 'ts', line: 'L', skipped: true })).toEqual({ code_id: 'ts', line: 'L', skipped: true });
    expect(readStepPick({ pick: '{nope' })).toBeNull();
    expect(readStepPick({})).toBeNull();
  });
});

describe('stepsLoader', () => {
  it('asks once and fixes each box’s step', async () => {
    const ask = vi.fn(async () => ({ need: null, skills: { 'writing.thesis': { rung: 'capable', codes: [code('ts', 1)] } } as StepSkills }));
    const stepFor = stepsLoader('c1', 'l1', ask);
    const a = await stepFor(item, 'b.q1');
    const b = await stepFor(item, 'b.q2');
    expect(a?.line).toBe('TS line 1.');
    expect(b?.line).toBe('TS line 1.');
    expect(ask).toHaveBeenCalledTimes(1);
    expect(await stepFor({ skills: ['writing.thesis'] }, 'b.q3')).toBeNull();
  });
});

function box(text: string): HTMLTextAreaElement {
  const host = document.createElement('div');
  const input = document.createElement('textarea');
  input.value = text;
  host.append(input);
  document.body.append(host);
  return input;
}
const flush = () => new Promise((r) => setTimeout(r, 0));
const buttonNamed = (root: ParentNode, name: string) => [...root.querySelectorAll('button')].find((b) => b.textContent === name) as HTMLButtonElement;

describe('mountNextStep', () => {
  const step = { code_id: 'ts', code: 'TS', colour: 'lilac', line: 'Open with your idea.' };

  it('Done, tap a sentence, Save: the tick and the pick', async () => {
    const input = box('One idea. Two reasons.');
    const onPick = vi.fn();
    mountNextStep({ input, step: Promise.resolve(step), onPick });
    await flush();
    const host = input.parentElement as HTMLElement;
    expect(host.querySelector('.ns-line')?.textContent).toContain('Next step: Open with your idea.');
    buttonNamed(host, 'Done').click();
    expect(host.querySelector('.ns-prompt')?.textContent).toContain('Where did you take this step?');
    expect(buttonNamed(host, 'Save').disabled).toBe(true);
    (host.querySelectorAll<HTMLButtonElement>('button.ns-sent')[1] as HTMLButtonElement).click();
    buttonNamed(host, 'Save').click();
    await flush();
    expect(onPick).toHaveBeenCalledWith({ code_id: 'ts', line: 'Open with your idea.', start: 10, end: 22 });
    expect(host.querySelector('.ns-tick')?.textContent).toBe('Step taken.');
    expect(host.querySelector('.ns-sent--on')?.textContent).toBe('TSTwo reasons.');
    (host.querySelector('.ns-read') as HTMLElement).click();
    expect(input.hidden).toBe(false);
  });

  it('a box with no step: Done shows the answer and Saved', async () => {
    const input = box('Just writing.');
    const onPick = vi.fn();
    mountNextStep({ input, step: null, onPick });
    const host = input.parentElement as HTMLElement;
    expect((host.querySelector('.ns-line') as HTMLElement).hidden).toBe(true);
    buttonNamed(host, 'Done').click();
    expect(input.hidden).toBe(true);
    expect(host.querySelector('.ns-tick')?.textContent).toBe('Saved');
    expect(onPick).not.toHaveBeenCalled();
  });

  it('opens a reloaded box with its pick showing', async () => {
    const input = box('One idea. Two reasons.');
    mountNextStep({ input, step: Promise.resolve(step), pick: { code_id: 'ts', line: 'Open with your idea.', start: 0, end: 9 }, onPick: vi.fn() });
    await flush();
    const host = input.parentElement as HTMLElement;
    expect(input.hidden).toBe(true);
    expect(host.querySelector('.ns-sent--on')?.textContent).toBe('TSOne idea.');
  });
});
