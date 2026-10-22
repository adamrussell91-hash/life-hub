import { describe, it, expect } from 'vitest';
import { createBlock } from '@/blocks/create-block';
import type { Block } from '@/schemas/block';
import { focusSteps, shortLabel, stepHingeIds } from '@/teacher/focus/steps';

const heading = (id: string, text: string): Block => {
  const b = createBlock('heading', id);
  return { ...b, content: { text } } as Block;
};
const text = (id: string): Block => createBlock('rich_text', id);
const section = (id: string, title: string, blocks: Block[] = []): Block => {
  const b = createBlock('section', id);
  return { ...b, content: { ...(b.content as object), title, blocks } } as Block;
};

describe('focusSteps', () => {
  it('starts a step at each heading and keeps what follows with it', () => {
    const steps = focusSteps([heading('h1', 'Do now'), text('t1'), text('t2'), heading('h2', 'The speech'), text('t3')]);
    expect(steps.map((s) => s.label)).toEqual(['Do now', 'The speech']);
    expect(steps[0]!.blocks.map((b) => b.id)).toEqual(['h1', 't1', 't2']);
    expect(steps[1]!.blocks.map((b) => b.id)).toEqual(['h2', 't3']);
  });

  it('makes each section a step of its own and starts fresh after it', () => {
    const steps = focusSteps([heading('h1', 'Do now'), text('t1'), section('s1', 'Take a side'), text('t2')]);
    expect(steps.map((s) => s.blocks.map((b) => b.id))).toEqual([['h1', 't1'], ['s1'], ['t2']]);
    expect(steps[1]!.label).toBe('Take a side');
    expect(steps[2]!.label).toBe('Part 3');
  });

  it('gathers blocks before the first heading into an opening step', () => {
    const steps = focusSteps([text('t1'), text('t2'), heading('h1', 'Main')]);
    expect(steps[0]).toMatchObject({ label: 'Opening' });
    expect(steps[0]!.blocks).toHaveLength(2);
  });

  it('keeps a column row whole, since it is a single block', () => {
    const cols = createBlock('columns', 'c1');
    const steps = focusSteps([heading('h1', 'Side by side'), cols]);
    expect(steps).toHaveLength(1);
    expect(steps[0]!.blocks.map((b) => b.id)).toEqual(['h1', 'c1']);
  });

  it('returns no steps for an empty lesson', () => {
    expect(focusSteps([])).toEqual([]);
  });

  it('finds hinge questions inside sections', () => {
    const hinge = createBlock('hinge_question', 'hq1');
    const steps = focusSteps([section('s1', 'Check', [hinge as never])]);
    expect(stepHingeIds(steps[0]!)).toEqual(['hq1']);
  });
});

describe('shortLabel', () => {
  it('strips markup, trims long text and falls back when empty', () => {
    expect(shortLabel('<b>Fear</b>  and hope', 'x')).toBe('Fear and hope');
    expect(shortLabel('A very long heading that goes on and on forever', 'x')).toMatch(/…$/);
    expect(shortLabel('   ', 'Part 2')).toBe('Part 2');
  });
});
