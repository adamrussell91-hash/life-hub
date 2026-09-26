// apps/tasks/tests/unit/goals-a11y-polish.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('G-41…G-44 goals polish', () => {
  const css = readFileSync(resolve(__dirname, '../../src/styles/goals.css'), 'utf8');

  it('has reduced-motion instant overrides', () => {
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
    expect(css).toMatch(/animation:\s*none/);
  });

  it('enforces phone touch targets and year-list / sheet layouts', () => {
    expect(css).toMatch(/max-width:\s*719px/);
    expect(css).toMatch(/min-height:\s*2\.75rem/);
    expect(css).toMatch(/runway--year-list|runway-phone__card/);
  });

  it('covers empty-state hooks used by first-run surfaces', () => {
    expect(css).toMatch(/\.goals-empty/);
    expect(css).toMatch(/\.runway__empty-lane/);
  });
});
