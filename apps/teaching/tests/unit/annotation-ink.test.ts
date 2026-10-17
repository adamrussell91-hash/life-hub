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

describe('crowded margin notes', () => {
  function rect(x: number, y: number, w: number, h: number): DOMRect {
    return { x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON: () => ({}) } as DOMRect;
  }

  function setup(ys: number[]) {
    const host = document.createElement('div');
    host.getBoundingClientRect = () => rect(0, 0, 800, 400);
    const marks = ys.map((y, i) => {
      const el = document.createElement('button');
      el.getClientRects = () => [rect(20, y, 40, 18)] as unknown as DOMRectList;
      host.append(el);
      return {
        annotationId: `a${i}`,
        kind: 'word' as const,
        colour: 'wave' as const,
        el,
        label: `Note number ${i} with a long explanation`,
        onOpen: () => undefined
      };
    });
    document.body.append(host);
    return { host, marks };
  }

  const notes = (host: HTMLElement) =>
    Array.from(host.querySelectorAll<HTMLElement>('.block-annotation__margin-note'));

  it('spread-out notes stay in full', () => {
    const { host, marks } = setup([10, 120, 240]);
    drawAnnotationInk(host, marks, { style: 'fineliner' });
    expect(notes(host).some((n) => n.classList.contains('is-collapsed'))).toBe(false);
    host.remove();
  });

  it('notes that run together fold to one line each', () => {
    const { host, marks } = setup([10, 12, 14]);
    drawAnnotationInk(host, marks, { style: 'fineliner' });
    expect(notes(host).every((n) => n.classList.contains('is-collapsed'))).toBe(true);
    expect(notes(host)[0]!.getAttribute('aria-expanded')).toBe('false');
    host.remove();
  });

  it('the selected note opens in full and its ink comes forward', () => {
    const { host, marks } = setup([10, 12, 14]);
    drawAnnotationInk(host, marks, { style: 'fineliner', activeId: 'a1' });
    const [a0, a1, a2] = notes(host);
    expect(a1!.classList.contains('is-active')).toBe(true);
    expect(a1!.classList.contains('is-collapsed')).toBe(false);
    expect(a1!.getAttribute('aria-expanded')).toBe('true');
    expect(a0!.classList.contains('is-collapsed')).toBe(true);
    expect(a2!.classList.contains('is-collapsed')).toBe(true);
    expect(host.classList.contains('has-active-note')).toBe(true);
    const active = host.querySelectorAll('.block-annotation__ink path.is-active');
    expect(active.length).toBeGreaterThan(0);
    active.forEach((path) => expect((path as SVGElement).dataset.annotationId).toBe('a1'));
    host.remove();
  });
});

describe('open note in the right-hand column', () => {
  function rect(x: number, y: number, w: number, h: number): DOMRect {
    return { x, y, left: x, top: y, width: w, height: h, right: x + w, bottom: y + h, toJSON: () => ({}) } as DOMRect;
  }

  function setup(style: 'fineliner' | 'highlighter') {
    const host = document.createElement('div');
    host.getBoundingClientRect = () => rect(0, 0, 1200, 600);
    const marks = [10, 200, 220].map((y, i) => {
      const el = document.createElement('button');
      el.className = 'block-annotation__anchor';
      el.getClientRects = () => [rect(20, y, 40, 18)] as unknown as DOMRectList;
      el.getBoundingClientRect = () => rect(20, y, 40, 18);
      host.append(el);
      return {
        annotationId: `a${i}`,
        kind: 'word' as const,
        colour: 'wave' as const,
        el,
        label: `Note ${i}`,
        onOpen: () => undefined
      };
    });
    marks[1]!.el.classList.add('is-open');
    const panel = document.createElement('div');
    panel.className = 'block-annotation__panel';
    panel.dataset.annotationId = 'a1';
    host.append(panel);
    document.body.append(host);
    return { host, marks, panel };
  }

  it('sits beside its line and pushes later notes below it, in line order', () => {
    const { host, marks, panel } = setup('fineliner');
    drawAnnotationInk(host, marks, { style: 'fineliner', activeId: 'a1' });
    expect(panel.style.top).toBe('200px');
    expect(panel.style.left).not.toBe('');
    const labels = Array.from(host.querySelectorAll<HTMLElement>('.block-annotation__margin-note'));
    // The open note replaces its own margin label.
    expect(labels.map((n) => n.dataset.annotationId)).toEqual(['a0', 'a2']);
    expect(parseFloat(labels[0]!.style.top)).toBe(10);
    expect(parseFloat(labels[1]!.style.top)).toBeGreaterThan(200);
    host.remove();
  });

  it('gets the column in highlighter style too, without margin labels', () => {
    const { host, marks, panel } = setup('highlighter');
    drawAnnotationInk(host, marks, { style: 'highlighter', activeId: 'a1' });
    expect(panel.style.top).toBe('200px');
    expect(host.querySelectorAll('.block-annotation__margin-note')).toHaveLength(0);
    host.remove();
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
