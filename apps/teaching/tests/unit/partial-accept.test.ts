import { describe, expect, it } from 'vitest';
import type { Block } from '@/schemas/block';
import type { AiProposal } from '@/ai/proposals';
import { filterProposal, listPartialAcceptUnits } from '@/ai/partial-accept';

const timestamps = {
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z'
};

const base = {
  type: 'block' as const,
  variant: 'medium',
  visibility: 'student_teacher' as const,
  layout: {},
  print: {},
  settings: {},
  ...timestamps,
  schema_version: 1 as const
};

function heading(id: string, text: string): Block {
  return { ...base, id, block_type: 'heading', variant: 'section', content: { text } };
}

function questionSet(): Block {
  return {
    ...base,
    id: 'qs1',
    block_type: 'question_set',
    content: {
      title: 'Check-in',
      questions: [
        { id: 'q1', prompt: 'One', kind: 'short_answer' },
        { id: 'q2', prompt: 'Two', kind: 'short_answer' },
        { id: 'q3', prompt: 'Three', kind: 'short_answer' },
        { id: 'q4', prompt: 'Four', kind: 'short_answer' },
        { id: 'q5', prompt: 'Five', kind: 'short_answer' }
      ]
    }
  };
}

describe('listPartialAcceptUnits', () => {
  it('lists questions on replace_block question_set', () => {
    const units = listPartialAcceptUnits({
      kind: 'replace_block',
      block_id: 'qs1',
      block: questionSet()
    });
    expect(units.map((u) => u.key)).toEqual([
      'questions:q1',
      'questions:q2',
      'questions:q3',
      'questions:q4',
      'questions:q5'
    ]);
  });

  it('lists title and root blocks on replace_lesson', () => {
    const units = listPartialAcceptUnits({
      kind: 'replace_lesson',
      title: 'Built lesson',
      blocks: [heading('h1', 'A'), heading('h2', 'B')]
    });
    expect(units.map((u) => u.key)).toEqual(['title', 'block:0', 'block:1']);
  });

  it('returns no units for reorder_blocks and review_only', () => {
    expect(
      listPartialAcceptUnits({
        kind: 'reorder_blocks',
        parent: { kind: 'root' },
        ordered_ids: ['a', 'b']
      })
    ).toEqual([]);
    expect(listPartialAcceptUnits({ kind: 'review_only', summary: 'Looks fine' })).toEqual([]);
  });

  it('returns no units for a single rich_text replace_block', () => {
    const block: Block = {
      ...base,
      id: 'rt1',
      block_type: 'rich_text',
      content: { html: '<p>Hi</p>' }
    };
    expect(listPartialAcceptUnits({ kind: 'replace_block', block_id: 'rt1', block })).toEqual([]);
  });
});

describe('filterProposal', () => {
  it('keeps questions 1, 2 and 5', () => {
    const proposal: AiProposal = {
      kind: 'replace_block',
      block_id: 'qs1',
      block: questionSet()
    };
    const result = filterProposal(proposal, new Set(['questions:q1', 'questions:q2', 'questions:q5']));
    expect(result.ok).toBe(true);
    if (!result.ok || result.proposal.kind !== 'replace_block') throw new Error('expected replace_block');
    const qs = result.proposal.block;
    if (qs.block_type !== 'question_set') throw new Error('expected question_set');
    expect(qs.content.questions.map((q) => q.id)).toEqual(['q1', 'q2', 'q5']);
  });

  it('applies the full proposal when every unit is selected', () => {
    const proposal: AiProposal = {
      kind: 'insert_blocks',
      position: 'below',
      blocks: [heading('h1', 'A'), heading('h2', 'B')]
    };
    const keys = new Set(listPartialAcceptUnits(proposal).map((u) => u.key));
    const result = filterProposal(proposal, keys);
    expect(result.ok).toBe(true);
    if (!result.ok || result.proposal.kind !== 'insert_blocks') throw new Error('expected insert');
    expect(result.proposal.blocks.map((b) => b.id)).toEqual(['h1', 'h2']);
  });

  it('drops the middle insert block', () => {
    const proposal: AiProposal = {
      kind: 'insert_blocks',
      position: 'below',
      anchor_block_id: 'a',
      blocks: [heading('h1', 'A'), heading('h2', 'B'), heading('h3', 'C')]
    };
    const result = filterProposal(proposal, new Set(['block:0', 'block:2']));
    expect(result.ok).toBe(true);
    if (!result.ok || result.proposal.kind !== 'insert_blocks') throw new Error('expected insert');
    expect(result.proposal.blocks.map((b) => b.id)).toEqual(['h1', 'h3']);
  });

  it('omits title on replace_lesson when unchecked', () => {
    const proposal: AiProposal = {
      kind: 'replace_lesson',
      title: 'Built lesson',
      blocks: [heading('h1', 'A')]
    };
    const result = filterProposal(proposal, new Set(['block:0']));
    expect(result.ok).toBe(true);
    if (!result.ok || result.proposal.kind !== 'replace_lesson') throw new Error('expected replace_lesson');
    expect(result.proposal.title).toBeUndefined();
    expect(result.proposal.blocks).toHaveLength(1);
  });

  it('keeps only checked delete ids', () => {
    const result = filterProposal(
      { kind: 'delete_blocks', ids: ['a', 'b', 'c'] },
      new Set(['delete:a', 'delete:c'])
    );
    expect(result.ok).toBe(true);
    if (!result.ok || result.proposal.kind !== 'delete_blocks') throw new Error('expected delete');
    expect(result.proposal.ids).toEqual(['a', 'c']);
  });

  it('fails gallery below min 2', () => {
    const block: Block = {
      ...base,
      id: 'g1',
      block_type: 'gallery',
      variant: 'large',
      content: {
        layout: 'grid',
        items: [
          { id: 'i1', url: 'https://example.com/a.jpg', alt_text: 'A' },
          { id: 'i2', url: 'https://example.com/b.jpg', alt_text: 'B' },
          { id: 'i3', url: 'https://example.com/c.jpg', alt_text: 'C' }
        ]
      }
    };
    const result = filterProposal(
      { kind: 'replace_block', block_id: 'g1', block },
      new Set(['gallery:i1'])
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected fail');
    expect(result.message).toMatch(/2/);
  });

  it('fails flashcards with zero cards', () => {
    const block: Block = {
      ...base,
      id: 'f1',
      block_type: 'flashcards',
      content: {
        cards: [
          { id: 'c1', front: 'A', back: 'a' },
          { id: 'c2', front: 'B', back: 'b' }
        ]
      }
    };
    const result = filterProposal({ kind: 'replace_block', block_id: 'f1', block }, new Set());
    expect(result.ok).toBe(false);
  });

  it('fails when nothing remains to apply', () => {
    const result = filterProposal(
      {
        kind: 'insert_blocks',
        position: 'below',
        blocks: [heading('h1', 'A'), heading('h2', 'B')]
      },
      new Set()
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected fail');
    expect(result.message).toMatch(/at least one/i);
  });
});
