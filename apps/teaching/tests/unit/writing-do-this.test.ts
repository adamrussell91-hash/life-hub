import { describe, expect, it, vi } from 'vitest';
import { mountNextStep, stepForBox, stepsLoader, whyLine, type Directive, type StepItem } from '@/student/next-step';

const entry = (tag: string) => ({ lines: [0, 1, 2, 3, 4].map((i) => `${tag} box line ${i}.`), edited: [false, false, false, false, false], source: 'x' });
const banked: StepItem = { skills: ['writing.thesis'], next_steps: { as: entry('AS') } };
const plain: StepItem = {};
const doIt: Directive = { kind: 'do', code_id: 'as', code: 'AS', colour: 'peach', line: 'After your quote, say what it makes the reader feel.', hits: 4, of: 4, item: 'w:l4:b1' };
const keep: Directive = { kind: 'keep', code_id: 'ts', code: 'TS', colour: 'blue', line: 'Open with a claim someone could argue with.', hits: 2, of: 4, item: 'w:l2:b1' };
const skills = { 'writing.thesis': { rung: 'skilled', codes: [] } };

describe('the step a box shows', () => {
  it('a plain box gets the directive from recent writing', () => {
    expect(stepForBox(plain, { skills: {}, directive: doIt }, '/r')).toEqual({ code_id: 'as', code: 'AS', colour: 'peach', line: doIt.line, why: { kind: 'do', hits: 4, of: 4, href: '/r' } });
  });
  it('a banked box says the directive in its own wording, at the student’s rung', () => {
    expect(stepForBox(banked, { skills, directive: doIt })?.line).toBe('AS box line 2.');
  });
  it('with no directive, the bank step as before; nothing at all gives nothing', () => {
    const loaded = { skills: { 'writing.thesis': { rung: null, codes: [{ id: 'as', code: 'AS', colour: 'lilac', hits: 1 }] } }, directive: null };
    expect(stepForBox(banked, loaded)).toMatchObject({ code_id: 'as', line: 'AS box line 1.' });
    expect(stepForBox(banked, loaded)?.why).toBeUndefined();
    expect(stepForBox(plain, { skills: {}, directive: null })).toBeNull();
    expect(stepForBox(plain, null)).toBeNull();
  });
});

describe('why line', () => {
  const step = (d: Directive, href?: string) => stepForBox(plain, { skills: {}, directive: d }, href)!;
  it('says how often it was flagged, and links to last time', () => {
    const why = whyLine(step(doIt, '/s/classes/c1/profile?tab=returned'))!;
    expect(why.textContent).toBe('AS flagged in your last 4 pieces · See last time');
    expect(why.querySelector('a')!.getAttribute('href')).toBe('/s/classes/c1/profile?tab=returned');
    expect(whyLine(step({ ...doIt, hits: 2 }))!.textContent).toBe('AS flagged in 2 of your last 4 pieces');
    expect(whyLine(step({ ...doIt, hits: 1, of: 1 }))!.textContent).toBe('AS flagged in your last piece');
  });
  it('a fixed code says how long it has been gone', () => {
    expect(whyLine(step(keep))!.textContent).toBe('TS not flagged in your last 2 pieces');
  });
});

describe('the box', () => {
  const box = (text: string) => {
    const host = document.createElement('div');
    const input = document.createElement('textarea');
    input.value = text;
    host.append(input);
    document.body.append(host);
    return input;
  };
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('shows Do this, bold, with the arrow', async () => {
    const input = box('');
    mountNextStep({ input, step: Promise.resolve(stepForBox(plain, { skills: {}, directive: doIt })), onPick: vi.fn() });
    await flush();
    const line = input.parentElement!.querySelector('.ns-line')!;
    expect(line.querySelector('.ns-line__label')!.textContent).toBe('Do this');
    expect(line.querySelector('.ns-line__text')!.textContent).toBe(doIt.line);
    expect(line.querySelector('.ns-line__arrow svg')).not.toBeNull();
  });

  it('Keep doing this is green and Done goes straight to saved, no sentence to find', async () => {
    const input = box('One idea. Two reasons.');
    const onPick = vi.fn();
    mountNextStep({ input, step: Promise.resolve(stepForBox(plain, { skills: {}, directive: keep })), onPick });
    await flush();
    const host = input.parentElement!;
    expect(host.querySelector('.ns-line--keep .ns-line__label')!.textContent).toBe('Keep doing this');
    [...host.querySelectorAll('button')].find((b) => b.textContent === 'Done')!.click();
    expect(host.querySelector<HTMLElement>('.ns-prompt')!.hidden).toBe(true);
    expect(host.querySelector('.ns-tick')!.textContent).toContain('Saved');
    expect(onPick).not.toHaveBeenCalled();
  });
});

describe('stepsLoader', () => {
  it('gives every box the directive, bank or not, from one ask', async () => {
    const call = vi.fn(async () => ({ need: null, skills: {}, directive: doIt }));
    const stepFor = stepsLoader('c1', 'l1', call);
    expect((await stepFor(plain, 'a'))?.why?.href).toBe('/s/classes/c1/profile?tab=returned');
    expect((await stepFor(banked, 'b'))?.line).toBe('AS box line 1.');
    expect(call).toHaveBeenCalledTimes(1);
  });
});
