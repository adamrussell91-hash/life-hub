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

describe('tool emblems', () => {
  it('every toolkit tool has an emblem in book colours with no ids', async () => {
    const { toolEmblem } = await import('../../../../packages/problem-solver/glyphs');
    const { TOOLS } = await import('../../../../packages/problem-solver/tools/index.mjs');
    // Decision Maker's models (dm_), Gear Shifter's techniques (gt_), the Rules Book's rules (rb_)
    // and the Change Book's models (ch_) carry their own emblems in their own packages.
    for (const id of (Object.keys(TOOLS) as Array<keyof typeof TOOLS>).filter((key) => !/^(dm|gt|rb|ch)_/.test(String(key)))) {
      const emblem = toolEmblem(id);
      expect(emblem.className).toBe('ps-emblem');
      expect(emblem.getAttribute('aria-hidden')).toBe('true');
      expect(emblem.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 100 100');
      expect(emblem.querySelector('[id]')).toBeNull();
    }
  });
});
