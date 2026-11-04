// apps/teaching/tests/unit/sprint-idea-kind.test.ts
import { describe, it, expect } from 'vitest';
import { sketchGuide, CANTEEN_SCENARIO, UNDERSTAND_GUIDE, LATER_GUIDE } from '@/sprint/guidance';
import { whatYouWrite } from '@/sprint/phase-sketch';
import { newSprintSettings } from '@/sprint/defaults';
import { publicSprint } from '@/sprint/model';
import { IdeaKindSchema, SprintSettingsSchema } from '@/sprint/schema';

const kind = IdeaKindSchema.parse({
  one: 'a kind of test question, with one sample',
  many: 'kinds of test question',
  judge: 'our focus and the criteria',
  examples: { rapid: ['Ask them to defend the opposite view.'] }
});

describe('what one idea is', () => {
  it('uses the teacher’s words and example for a step that has one', () => {
    const g = sketchGuide('rapid', kind);
    expect(g.doThis).toContain('kinds of test question');
    expect(g.example).toEqual(['Ask them to defend the opposite view.']);
    expect(g.scenario).not.toBe(CANTEEN_SCENARIO);
  });

  it('labels the canteen as made up wherever the Kit has no example', () => {
    expect(sketchGuide('develop', kind).scenario).toBe(CANTEEN_SCENARIO);
    expect(sketchGuide('rapid').scenario).toBe(CANTEEN_SCENARIO);
    expect(UNDERSTAND_GUIDE.say.scenario).toBe(CANTEEN_SCENARIO);
    expect(LATER_GUIDE.read).toHaveProperty('scenario', CANTEEN_SCENARIO);
  });

  it('shows what to write before the timer, and nothing until it is filled in', () => {
    const box = whatYouWrite(kind)!;
    expect(box.textContent).toContain('a kind of test question');
    expect(box.textContent).toContain('Ask them to defend the opposite view.');
    expect(box.textContent).toContain('our focus and the criteria');
    expect(whatYouWrite(undefined)).toBeNull();
    expect(whatYouWrite(IdeaKindSchema.parse({}))).toBeNull();
  });

  it('reaches students, and older Kits without it still load', () => {
    const s = newSprintSettings('c1');
    s.idea_kind = kind;
    expect(publicSprint(s).idea_kind).toEqual(kind);
    const old = newSprintSettings('c1') as Partial<typeof s>;
    delete old.idea_kind;
    expect(SprintSettingsSchema.safeParse(old).success).toBe(true);
    expect(publicSprint(old as typeof s).idea_kind).toBeUndefined();
  });
});
