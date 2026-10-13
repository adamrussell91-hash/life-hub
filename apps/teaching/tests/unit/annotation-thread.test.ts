import { describe, expect, it } from 'vitest';
import { BlockSchema } from '@/schemas/block';
import {
  arcLanes,
  foldRows,
  lineNumbers,
  threadStops,
  threadsOf
} from '@/blocks/annotation-thread';
import type { AnnotationBlock } from '@/schemas/block';

function poemBlock(): AnnotationBlock {
  const stamp = '2026-10-13T00:00:00.000Z';
  return {
    id: 'block_thread',
    type: 'block',
    block_type: 'annotation',
    variant: 'medium',
    visibility: 'student_teacher',
    layout: {},
    print: {},
    settings: {},
    created_at: stamp,
    updated_at: stamp,
    schema_version: 1,
    content: {
      text: {
        kind: 'verse',
        stanzas: [
          {
            id: 'stanza_1',
            lines: [
              { id: 'line_1', text: 'One alpha' },
              { id: 'line_2', text: 'Two beta' },
              { id: 'line_3', text: 'Three gamma' },
              { id: 'line_4', text: 'Four delta' },
              { id: 'line_5', text: 'Five epsilon' }
            ]
          },
          {
            id: 'stanza_2',
            lines: [
              { id: 'line_6', text: 'Six zeta' },
              { id: 'line_7', text: 'Seven eta' }
            ]
          }
        ]
      },
      layers: [
        { id: 'layer_1', name: 'Notes', kind: 'free', colour: 'wave', symbol: 'N' }
      ],
      annotations: [
        {
          id: 'ann_thread',
          layer_id: 'layer_1',
          anchor: {
            id: 'stop_1',
            granularity: 'line',
            stanza: 'stanza_1',
            line: 'line_1',
            quote: { exact: 'One alpha' }
          },
          also_anchors: [
            {
              id: 'stop_3',
              granularity: 'line',
              stanza: 'stanza_1',
              line: 'line_3',
              quote: { exact: 'Three gamma' }
            },
            {
              id: 'stop_6',
              granularity: 'line',
              stanza: 'stanza_2',
              line: 'line_6',
              quote: { exact: 'Six zeta' }
            },
            {
              id: 'stop_orphan',
              granularity: 'word',
              stanza: 'stanza_1',
              line: 'line_2',
              start: 0,
              end: 3,
              quote: { exact: 'NOPE' }
            }
          ],
          thread: { order: 'text' },
          body: { html: '<p>Thread</p>', attachments: [] },
          created_at: stamp,
          updated_at: stamp
        }
      ],
      settings: { show_markers: true, thread_context: 0 }
    }
  };
}

describe('annotation-thread pure helpers', () => {
  it('parses a thread annotation through BlockSchema', () => {
    const block = BlockSchema.parse(poemBlock());
    expect(block.block_type).toBe('annotation');
    if (block.block_type !== 'annotation') return;
    expect(threadsOf(block)).toHaveLength(1);
  });

  it('rejects more than 24 also_anchors', () => {
    const block = poemBlock();
    block.content.annotations[0]!.also_anchors = Array.from({ length: 25 }, (_, i) => ({
      id: `stop_x_${i}`,
      granularity: 'line' as const,
      stanza: 'stanza_1',
      line: 'line_1',
      quote: { exact: 'One alpha' }
    }));
    expect(() => BlockSchema.parse(block)).toThrow();
  });

  it('numbers lines 1-based across the whole text', () => {
    const numbers = lineNumbers(poemBlock().content.text);
    expect(numbers.get('line_1')).toBe(1);
    expect(numbers.get('line_7')).toBe(7);
  });

  it('orders stops by text and reports orphans separately', () => {
    const block = poemBlock();
    const { stops, orphans } = threadStops(block.content.annotations[0]!, block);
    expect(orphans.map((o) => o.anchorId)).toContain('stop_orphan');
    expect(stops.map((s) => s.anchorId)).toEqual(['stop_1', 'stop_3', 'stop_6']);
  });

  it('custom order differs from text order', () => {
    const block = poemBlock();
    block.content.annotations[0]!.also_anchors = block.content.annotations[0]!.also_anchors!.filter(
      (a) => a.id !== 'stop_orphan'
    );
    block.content.annotations[0]!.thread = {
      order: 'custom',
      anchor_order: ['stop_6', 'stop_1', 'stop_3']
    };
    const parsed = BlockSchema.parse(block);
    if (parsed.block_type !== 'annotation') throw new Error('expected annotation');
    const { stops } = threadStops(parsed.content.annotations[0]!, parsed);
    expect(stops.map((s) => s.anchorId)).toEqual(['stop_6', 'stop_1', 'stop_3']);
  });

  it('foldRows with context 0 hides gaps and never emits zero-length folds', () => {
    const text = poemBlock().content.text;
    const rows = foldRows(text, new Set(['line_1', 'line_3']), {
      context: 0,
      expanded: new Set()
    });
    expect(rows.filter((r) => r.kind === 'fold').every((r) => r.kind === 'fold' && r.count > 0)).toBe(
      true
    );
    const kinds = rows.map((r) => (r.kind === 'line' ? r.lineId : `fold:${r.count}`));
    expect(kinds[0]).toBe('line_1');
    expect(kinds).toContain('fold:1'); // line_2
    expect(kinds).toContain('line_3');
  });

  it('two stops one line apart leave no fold between them', () => {
    const text = poemBlock().content.text;
    const rows = foldRows(text, new Set(['line_2', 'line_3']), {
      context: 0,
      expanded: new Set()
    });
    const mid = rows.findIndex((r) => r.kind === 'line' && r.lineId === 'line_2');
    expect(rows[mid + 1]).toMatchObject({ kind: 'line', lineId: 'line_3' });
  });

  it('stops on first and last lines produce no leading/trailing zero folds', () => {
    const text = poemBlock().content.text;
    const rows = foldRows(text, new Set(['line_1', 'line_7']), {
      context: 0,
      expanded: new Set()
    });
    expect(rows[0]).toMatchObject({ kind: 'line', lineId: 'line_1' });
    expect(rows.at(-1)).toMatchObject({ kind: 'line', lineId: 'line_7' });
    expect(rows.every((r) => r.kind === 'line' || r.count > 0)).toBe(true);
  });

  it('context ±1 keeps neighbours and folds still stay inside stanza', () => {
    const text = poemBlock().content.text;
    const rows = foldRows(text, new Set(['line_3', 'line_6']), {
      context: 1,
      expanded: new Set()
    });
    const lineIds = rows.filter((r) => r.kind === 'line').map((r) => r.lineId);
    expect(lineIds).toEqual(expect.arrayContaining(['line_2', 'line_3', 'line_4', 'line_6', 'line_7']));
    // fold across stanza break is not merged into one bar
    const folds = rows.filter((r) => r.kind === 'fold');
    expect(folds.every((f) => f.kind === 'fold' && f.lineIds.every((id) => {
      const stanza = text.stanzas.find((s) => s.lines.some((l) => l.id === id));
      return stanza != null;
    }))).toBe(true);
  });

  it('arcLanes never assigns overlapping spans the same lane', () => {
    const lanes = arcLanes([
      { id: 'a', start: 1, end: 4 },
      { id: 'b', start: 3, end: 6 },
      { id: 'c', start: 7, end: 8 }
    ]);
    expect(lanes.get('a')).not.toBe(lanes.get('b'));
    expect(lanes.get('c')).toBe(0);
  });
});
