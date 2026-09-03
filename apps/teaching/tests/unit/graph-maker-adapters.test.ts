import { describe, expect, it } from 'vitest';
import {
  conceptMapContentToEngineState,
  engineStateToConceptMapContent,
  engineStateToMindMapContent,
  mindMapContentToEngineState
} from '@/blocks/graph-maker/content-adapters';
import { createBlock } from '@/blocks/create-block';

describe('graph-maker content adapters', () => {
  it('round-trips mind map block content', () => {
    const block = createBlock('mind_map', 'm1');
    if (block.block_type !== 'mind_map') throw new Error('expected mind_map');

    const engine = mindMapContentToEngineState(block.content);
    const back = engineStateToMindMapContent(engine);

    expect(back.nodes).toHaveLength(block.content.nodes.length);
    expect(back.nodes.map((node) => node.label).sort()).toEqual(
      block.content.nodes.map((node) => node.label).sort()
    );
    expect(back.nodes.find((node) => node.parent_id == null)?.label).toBe('Centre');
  });

  it('round-trips concept map block content with positions', () => {
    const block = createBlock('concept_map', 'cm1');
    if (block.block_type !== 'concept_map') throw new Error('expected concept_map');

    const engine = conceptMapContentToEngineState(block.content);
    expect(engine.edges).toHaveLength(1);
    expect(engine.edges[0]?.label).toBe('relates to');

    const back = engineStateToConceptMapContent(engine);
    expect(back.nodes).toHaveLength(2);
    expect(back.edges[0]?.label).toBe('relates to');
    expect(back.nodes.every((node) => typeof node.x === 'number')).toBe(true);
  });
});
