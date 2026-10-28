import { describe, expect, it } from 'vitest';
import { STEPPED_LENSES, steppedLens } from '@/blocks/lenses/registry';
import { PLANNING_FIELDS } from '@/blocks/walkthru-note/planning';
import { techniqueById } from '../../../../packages/walkthrus/catalogue.mjs';

const FRAMEWORKS = ['fw_rosenshine', 'fw_willingham', 'fw_marge', 'fw_wiliam', 'fw_berger'];

describe('framework lenses', () => {
  it('registers the five frameworks once each, in the Frameworks group', () => {
    for (const id of FRAMEWORKS) expect(steppedLens(id)?.group).toBe('Frameworks');
    expect(new Set(STEPPED_LENSES.map((l) => l.id)).size).toBe(STEPPED_LENSES.length);
  });

  it('every lens writes steps and a write-it-down at every level, and names its source as a framework chapter', () => {
    for (const id of FRAMEWORKS) {
      const lens = steppedLens(id)!;
      expect(lens.path).toMatch(/framework chapter/);
      for (const level of ['support', 'core', 'extend'] as const) {
        const config = lens.create({ block_type: 'rich_text' } as never);
        const steps = lens.steps(config, { level, block: {} as never });
        expect(steps.length).toBeGreaterThanOrEqual(4);
        for (const step of steps) {
          expect(step.title).toBeTruthy();
          expect(step.prompt).toBeTruthy();
          expect(step.prompt.length).toBeLessThan(260);
        }
        const out = lens.writeItDown(config, { level, block: {} as never });
        expect(out.checklist.length).toBeGreaterThan(0);
        expect(out.example).toBeTruthy();
      }
    }
  });
});

describe('unit planning prompts', () => {
  it('every field points at a real technique', () => {
    expect(PLANNING_FIELDS.length).toBe(10);
    for (const field of PLANNING_FIELDS) expect(techniqueById(field.technique)).toBeTruthy();
  });
});
