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

// Task 4 of Plan 4 adds these emblems and deletes this set.
const PENDING = new Set([
  'causal_map', 'perspective_shift', 'radial_tree', 'force_field', 'from_to', 'intent_statement',
  'problem_reduction', 'analogical_reasoning', 'solution_tree', 'lotus_blossom', 'duncker'
]);

describe('tool emblems', () => {
  it('every tool has an emblem in book colours with no ids', async () => {
    const { toolEmblem } = await import('../../../../packages/problem-solver/glyphs');
    const { TOOLS } = await import('../../../../packages/problem-solver/tools/index.mjs');
    for (const id of Object.keys(TOOLS) as Array<keyof typeof TOOLS>) {
      if (PENDING.has(id)) continue;
      const emblem = toolEmblem(id);
      expect(emblem.className).toBe('ps-emblem');
      expect(emblem.getAttribute('aria-hidden')).toBe('true');
      expect(emblem.querySelector('svg')!.getAttribute('viewBox')).toBe('0 0 100 100');
      expect(emblem.querySelector('[id]')).toBeNull();
    }
  });
});
