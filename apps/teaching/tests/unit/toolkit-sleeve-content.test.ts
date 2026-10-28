import { describe, expect, it } from 'vitest';
import { TOOLKIT_SKILLS, TOOLKIT_TOOLS, TOOLKIT_VALUES } from '../../src/toolkit/library';
import { SKILL_SLEEVES } from '../../src/toolkit/sleeves/skills';
import { TOOL_SLEEVES } from '../../src/toolkit/sleeves/tools';
import { SLEEVE_LEVELS, type SleeveContent, type SleeveText } from '../../src/toolkit/sleeves';
import { VALUE_SLEEVES } from '../../src/toolkit/sleeves/values';

const DEFICIT = /\b(without|not|never|rather than|don't|no)\b/i;
const META_OPENER = /^(this (essay|response) will|the question assumes|in this response)/i;

const ALL: SleeveContent[] = [...VALUE_SLEEVES, ...TOOL_SLEEVES, ...SKILL_SLEEVES];
const LIBRARY_IDS = [...TOOLKIT_VALUES, ...TOOLKIT_TOOLS, ...TOOLKIT_SKILLS].map((item) => item.id);

function strings(t: SleeveText): string[] {
  return [t.see, t.weaker, t.stronger, t.do, ...t.starters, ...t.checks];
}

describe('toolkit sleeve content', () => {
  it('has exactly one sleeve per library item, in library order per file', () => {
    expect(ALL.map((s) => s.id).sort()).toEqual([...LIBRARY_IDS].sort());
    expect(VALUE_SLEEVES.map((s) => s.id)).toEqual(TOOLKIT_VALUES.map((i) => i.id));
    expect(TOOL_SLEEVES.map((s) => s.id)).toEqual(TOOLKIT_TOOLS.map((i) => i.id));
    expect(SKILL_SLEEVES.map((s) => s.id)).toEqual(TOOLKIT_SKILLS.map((i) => i.id));
  });

  for (const sleeve of ALL) {
    describe(sleeve.id, () => {
      it('has a short goal', () => {
        expect(sleeve.goal.trim()).toBe(sleeve.goal);
        expect(sleeve.goal.length).toBeGreaterThan(0);
        expect(sleeve.goal.length).toBeLessThanOrEqual(70);
        expect(sleeve.goal).not.toMatch(DEFICIT);
      });

      for (const level of SLEEVE_LEVELS) {
        it(`${level} level is complete and clean`, () => {
          const t = sleeve[level];
          expect(t).toBeTruthy();
          expect(t.starters.length).toBeGreaterThanOrEqual(2);
          expect(t.starters.length).toBeLessThanOrEqual(3);
          expect(t.checks.length).toBe(3);
          for (const s of strings(t)) {
            expect(s.length).toBeGreaterThan(0);
            expect(s.trim()).toBe(s);
          }
          for (const s of [t.see, t.weaker, t.stronger, t.do, ...t.checks]) expect(s).not.toMatch(DEFICIT);
          for (const s of [t.weaker, t.stronger]) expect(s).not.toMatch(META_OPENER);
          expect(t.do.split(/\s+/).length).toBeLessThanOrEqual(22);
          for (const c of t.checks) expect(c.split(/\s+/).length).toBeLessThanOrEqual(12);
          for (const s of t.starters) expect(s).not.toMatch(/\.$/);
        });
      }
    });
  }
});
