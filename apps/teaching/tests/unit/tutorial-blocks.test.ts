import { describe, it, expect } from 'vitest';
import { createBlock } from '@/blocks/create-block';
import { renderBlock } from '@/blocks/render';
import { listPublishBlockIssues } from '@/schemas/publish-block-issues';
import { BlockSchema } from '@/schemas/block';

describe('tutorial blocks', () => {
  it('creates valid empty blocks', () => {
    expect(BlockSchema.parse(createBlock('with_teacher', 'w1')).block_type).toBe('with_teacher');
    const faded = BlockSchema.parse(createBlock('faded_example', 'f1'));
    expect(faded.block_type === 'faded_example' && faded.content.parts.map((p) => p.label)).toEqual(['Technique', 'Where', 'Effect']);
  });

  it('renders With teacher to students without the talking points', () => {
    const block = { ...createBlock('with_teacher', 'w1'), content: { talking_points: ['Secret'] } } as Parameters<typeof renderBlock>[0];
    const el = renderBlock(block, 'student', { lessonId: 'l1', pageBlocks: [] });
    expect(el.textContent).toContain('Your teacher will join you here');
    expect(el.textContent).not.toContain('Secret');
    expect(renderBlock(block, 'teacher', { lessonId: 'l1', pageBlocks: [] }).textContent).toContain('Secret');
  });

  it('shows a worked step in full and a faded step with inputs', () => {
    const base = createBlock('faded_example', 'f1') as Extract<Parameters<typeof renderBlock>[0], { block_type: 'faded_example' }>;
    const full = { ...base, content: { ...base.content, extract: 'Text', parts: base.content.parts.map((p) => ({ ...p, answer: `${p.label} answer` })), blanks: [] } };
    const el = renderBlock(full, 'student', { lessonId: 'l1', pageBlocks: [] });
    expect(el.textContent).toContain('Effect answer');
    expect(el.querySelectorAll('textarea')).toHaveLength(0);
    const faded = { ...full, content: { ...full.content, blanks: [2] } };
    const el2 = renderBlock(faded, 'student', { lessonId: 'l1', pageBlocks: [] });
    expect(el2.querySelectorAll('textarea')).toHaveLength(1);
    expect(el2.textContent).not.toContain('Effect answer');
  });

  it('flags an empty faded example and empty talking points are fine', () => {
    const issues = listPublishBlockIssues([createBlock('faded_example', 'f1'), createBlock('with_teacher', 'w1')]);
    expect(issues.map((i) => i.blockId)).toEqual(['f1']);
  });
});
