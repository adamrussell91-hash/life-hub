import { describe, expect, it } from 'vitest';
import { HOMEPAGE_BLOCK_GROUPS, LESSON_BLOCK_GROUPS, SECTION_CHILD_TYPES, UNIT_PLAN_BLOCK_GROUPS, pageBlockTypes } from '@/blocks/create-block';

describe('layouts offer only what their page offers', () => {
  it('a lesson section has no unit map or definition', () => {
    const lesson = pageBlockTypes(LESSON_BLOCK_GROUPS);
    const offered = SECTION_CHILD_TYPES.filter((t) => lesson.has(t));
    expect(offered).not.toContain('curriculum_lines');
    expect(offered).not.toContain('definition');
    expect(offered).toContain('quiz_question');
  });

  it('a homepage section has no live lesson activities', () => {
    const homepage = pageBlockTypes(HOMEPAGE_BLOCK_GROUPS);
    for (const t of ['quiz_question', 'brainstorm', 'hinge_question', 'done', 'peer_feedback']) expect(homepage.has(t)).toBe(false);
    expect(homepage.has('question_set')).toBe(true);
  });

  it('a unit plan keeps its map', () => {
    expect(pageBlockTypes(UNIT_PLAN_BLOCK_GROUPS).has('curriculum_lines')).toBe(true);
  });
});
