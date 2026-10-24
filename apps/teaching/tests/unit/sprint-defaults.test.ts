// apps/teaching/tests/unit/sprint-defaults.test.ts
import { describe, it, expect } from 'vitest';
import { newSprintSettings, newSprintBlocks, phaseIntention, phaseMove, seedSprint, toolFrames } from '@/sprint/defaults';
import { createBlock } from '@/blocks/create-block';
import { moveContent } from '@/toolkit/content';
import type { Block } from '@/schemas/block';
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

  it('seeds one empty section per phase, for the teacher to build', () => {
    const blocks = newSprintBlocks(id).map((b) => BlockSchema.parse(b));
    const phases = blocks.filter((b) => b.block_type === 'section' && b.content.sprint_phase).map((b) => b.block_type === 'section' && b.content.sprint_phase);
    expect(phases).toEqual(['understand', 'sketch', 'decide', 'prototype', 'test']);
    expect(blocks.every((b) => b.block_type === 'section' && b.content.blocks.length === 0)).toBe(true);
  });

  it('reads a move the teacher added, its intention and the tool frames, and nothing when there is none', () => {
    const withMove = (key: 'decide' | 'sketch', skill: string, tools: string[], value: string): Block[] =>
      newSprintBlocks(id).map((b) => (b.block_type === 'section' && b.content.sprint_phase === key
        ? { ...b, content: { ...b.content, blocks: [{ ...createBlock('thinking_move', 'm1'), content: moveContent(skill, tools, value, 'm1') } as Block] } }
        : b));
    const move = phaseMove(withMove('decide', 'skill:apply', ['tool:criteria', 'tool:reasons'], 'value:relevance'), 'decide');
    expect(move).toMatchObject({ skill: 'skill:apply', value: 'value:relevance' });
    expect(phaseIntention(move)).toMatch(/^We will think by applying/);
    expect(toolFrames(phaseMove(withMove('sketch', 'skill:apply', ['tool:suggestion', 'tool:example'], 'value:breadth'), 'sketch'))).toEqual(['What if ___?', 'For example, ___.']);
    expect(phaseMove(newSprintBlocks(id), 'decide')).toBeNull();
    expect(phaseIntention(null)).toBe('');
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
