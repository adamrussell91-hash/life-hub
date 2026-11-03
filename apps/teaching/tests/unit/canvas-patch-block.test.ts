import { describe, expect, it, vi } from 'vitest';
import { mountBlockCanvas } from '@/teacher/lesson-canvas/mount-page';
import type { Block } from '@/schemas/block';

const rich = (id: string): Block => ({ id, type: 'block', block_type: 'rich_text', variant: 'medium', visibility: 'student_teacher', content: { html: '<p>Hello</p>' }, settings: {} } as unknown as Block);
const section = (id: string, children: Block[]): Block => ({ id, type: 'block', block_type: 'section', variant: 'medium', visibility: 'student_teacher', content: { blocks: children }, settings: {} } as unknown as Block);
const noted = (block: Block): Block => ({ ...block, settings: { note: 'kept' } } as Block);

function mount(blocks: Block[]) {
  const onChange = vi.fn();
  const renderPreview = vi.fn((block: Block) => {
    const el = document.createElement('div');
    el.dataset.preview = block.id;
    return el;
  });
  // Attached: the canvas drops any kept preview that is no longer on the page.
  const host = document.body.appendChild(document.createElement('div'));
  const canvas = mountBlockCanvas(host, { blocks, media: [], onChange, renderPreview, idFactory: () => 'new' } as unknown as Parameters<typeof mountBlockCanvas>[1]);
  return { canvas, onChange, renderPreview };
}

describe('saving a change made inside a block preview', () => {
  it('saves the block and leaves its preview in place, even through a later redraw', () => {
    const { canvas, onChange, renderPreview } = mount([rich('a'), rich('b')]);
    const drawn = renderPreview.mock.calls.length;
    canvas.patchBlock('a', noted);
    const saved = onChange.mock.lastCall![0] as Block[];
    expect(saved[0]!.settings).toEqual({ note: 'kept' });
    expect(saved[1]!.settings).toEqual({});
    canvas.update(saved);
    expect(renderPreview.mock.calls.length).toBe(drawn);
  });

  it('reaches a block nested in a section without redrawing the section', () => {
    const { canvas, onChange, renderPreview } = mount([section('s', [rich('child')])]);
    const drawn = renderPreview.mock.calls.length;
    canvas.patchBlock('child', noted);
    const saved = onChange.mock.lastCall![0] as Block[];
    expect(((saved[0]!.content as { blocks: Block[] }).blocks[0]!).settings).toEqual({ note: 'kept' });
    canvas.update(saved);
    expect(renderPreview.mock.calls.length).toBe(drawn);
  });

  it('ignores a block that has gone', () => {
    const { canvas, onChange } = mount([rich('a')]);
    canvas.patchBlock('gone', noted);
    expect(onChange).not.toHaveBeenCalled();
  });
});
