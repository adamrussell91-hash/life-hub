import { describe, expect, it } from 'vitest';
import {
  bandPath,
  boxPath,
  bracketPath,
  drawAnnotationInk,
  stackLabels,
  stanzaBracketPath,
  underlinePath
} from '@/blocks/annotation-ink';
import { createAnnotationEditor } from '@/blocks/editors';
import { renderAnnotationBlock } from '@/blocks/render';
import type { Block } from '@/schemas/block';
import { dulceAnnotationFixture } from '../../fixtures/annotation-dulce';

type AnnotationBlock = Extract<Block, { block_type: 'annotation' }>;

/** Every command is M/H/V/Z (or one diagonal arrowhead L): no curves anywhere. */
const RULED = /^(?:[MHVZ][\d.\s-]*)+$/;

describe('ruled ink geometry', () => {
  const r = { x: 10, y: 20, w: 60, h: 24 };

  it('draws only straight lines and right angles', () => {
    for (const d of [
      boxPath(r),
      underlinePath(r),
      bandPath(r),
      bracketPath(20, 80, 4),
      stanzaBracketPath(20, 120, 4)
    ]) {
      expect(d.replace(/\s+/g, ' ').trim()).toMatch(RULED);
      expect(d).not.toMatch(/[CQSAL]/);
    }
  });

  it('a box surrounds the word and an underline sits under it', () => {
    expect(boxPath(r)).toBe('M8 21 H72 V43 H8 Z');
    expect(underlinePath(r)).toBe('M9 43 H71');
  });

  it('a stanza bracket has a centre tick', () => {
    expect(stanzaBracketPath(20, 120, 10)).toContain('M10 70 H4');
  });

  it('stacks margin labels without overlap, keeping order', () => {
    expect(stackLabels([{ y: 10, h: 20 }, { y: 12, h: 20 }, { y: 100, h: 20 }])).toEqual([10, 36, 100]);
  });

  it('draws nothing (and throws nothing) before the host has a size', () => {
    const host = document.createElement('div');
    const el = document.createElement('button');
    host.append(el);
    const drawn = drawAnnotationInk(
      host,
      [{ annotationId: 'a', kind: 'word', colour: 'wave', el, onOpen: () => undefined }],
      { style: 'fineliner' }
    );
    expect(drawn.size).toBe(0);
  });
});

describe('ink style setting', () => {
  it('the view defaults to fineliner and honours highlighter', () => {
    const fine = renderAnnotationBlock(dulceAnnotationFixture, 'teacher');
    expect(fine.querySelector('.block-annotation--ink-fineliner')).toBeTruthy();
    const hl = structuredClone(dulceAnnotationFixture);
    hl.content.settings.ink_style = 'highlighter';
    expect(
      renderAnnotationBlock(hl, 'teacher').querySelector('.block-annotation--ink-highlighter')
    ).toBeTruthy();
  });

  it('the editor saves the chosen style and keeps other settings', () => {
    const start = structuredClone(dulceAnnotationFixture) as AnnotationBlock;
    start.content.settings.thread_context = 1;
    let latest = start;
    const el = createAnnotationEditor(start, (next) => {
      latest = next as AnnotationBlock;
    }, () => latest);
    document.body.append(el);
    el.querySelector<HTMLButtonElement>(
      '.block-editor__annotation-ink-style [data-value="highlighter"]'
    )!.click();
    expect(latest.content.settings.ink_style).toBe('highlighter');
    expect(latest.content.settings.thread_context).toBe(1);
    el.remove();
  });
});
