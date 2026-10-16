// apps/tasks/tests/unit/problem-solver-glyphs.test.ts
import { describe, expect, it } from 'vitest';
import { skillChip, skillGlyph } from '../../../../packages/problem-solver/glyphs';

describe('skill glyphs', () => {
  it('renders an svg with a unique mask id per copy', () => {
    const a = skillGlyph('critical_thinking');
    const b = skillGlyph('critical_thinking');
    const idA = a.querySelector('mask')!.id;
    const idB = b.querySelector('mask')!.id;
    expect(idA).not.toBe(idB);
    expect(a.querySelector('g')!.getAttribute('mask')).toBe(`url(#${idA})`);
  });

  it('chip carries the skill name and missing state', () => {
    const chip = skillChip('metacognition', { missing: true });
    expect(chip.textContent).toContain('Metacognition');
    expect(chip.classList.contains('ps-skill--missing')).toBe(true);
  });

  it('unknown skill returns an empty span', () => {
    expect(skillGlyph('nope').childElementCount).toBe(0);
  });
});
