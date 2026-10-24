// apps/teaching/tests/unit/sprint-defaults.test.ts
import { describe, it, expect } from 'vitest';
import { newSprintSettings, newSprintBlocks, PHASE_MOVES, phaseIntention, phaseMove, seedSprint, toolFrames } from '@/sprint/defaults';
import { SprintSettingsSchema } from '@/sprint/schema';
import { BlockSchema } from '@/schemas/block';

let n = 0;
const id = () => `b${++n}`;

describe('sprint defaults', () => {
  it('makes valid settings with 3 ideas, the checklist and reflection defaults', () => {
    const s = SprintSettingsSchema.parse(newSprintSettings('class1'));
    expect(s.phases.map((p) => p.where)).toEqual(['class', 'home', 'class', 'home', 'class']);
    expect(s.phases[0]!.ideas).toBe(3);
    expect(s.phases[1]!.ideas).toBe(3);
    expect(s.idea_guide.checklist).toHaveLength(5);
    expect(s.reflection_criteria[0]!.text).toBe('Explains what the test showed and what to change next');
    expect(s.reflection_prompts).toHaveLength(2);
  });

  it('seeds one section per phase, each starting with its Thinking move', () => {
    const blocks = newSprintBlocks(id).map((b) => BlockSchema.parse(b));
    const phases = blocks.filter((b) => b.block_type === 'section' && b.content.sprint_phase).map((b) => b.block_type === 'section' && b.content.sprint_phase);
    expect(phases).toEqual(['understand', 'sketch', 'decide', 'prototype', 'test']);
    const sketch = blocks.find((b) => b.block_type === 'section' && b.content.sprint_phase === 'sketch');
    const first = sketch?.block_type === 'section' ? sketch.content.blocks[0] : undefined;
    expect(first?.block_type).toBe('thinking_move');
    expect(first?.block_type === 'thinking_move' && first.content.value).toBe('value:breadth');
    const understand = blocks.find((b) => b.block_type === 'section' && b.content.sprint_phase === 'understand');
    expect(understand?.block_type === 'section' && understand.content.blocks.map((b) => b.block_type)).toEqual(['thinking_move', 'question_quadrant']);
  });

  it('reads the move, its intention and the tool frames from a phase section', () => {
    const blocks = newSprintBlocks(id);
    const move = phaseMove(blocks, 'decide');
    expect(move).toMatchObject({ skill: PHASE_MOVES.decide.skill, value: 'value:relevance' });
    expect(phaseIntention(move)).toMatch(/^We will think by applying/);
    expect(toolFrames(phaseMove(blocks, 'sketch'))).toEqual(['What if ___?', 'For example, ___.']);
    expect(phaseMove([], 'decide')).toBeNull();
  });

  it('seeds the Kit once and never adds a second set of phase sections', () => {
    const seeded = seedSprint({ blocks: [] as never[] }, 'class1', id);
    expect(seeded.blocks).toHaveLength(5);
    expect(seedSprint(seeded, 'class1', id)).toBe(seeded);
    const kitLost = seedSprint({ blocks: seeded.blocks }, 'class1', id);
    expect(kitLost.sprint?.class_id).toBe('class1');
    expect(kitLost.blocks).toHaveLength(5);
  });
});
