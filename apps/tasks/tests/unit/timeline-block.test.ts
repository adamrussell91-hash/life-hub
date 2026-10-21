import { describe, it, expect } from 'vitest';
import { BlockSchema, type Block } from '@/schemas/block';
import { createBlock } from '@teaching/blocks/create-block';
import { createBlockEditor } from '@teaching/blocks/editors';
import { renderBlock, splitTimelineWhen } from '@teaching/blocks/render';
describe('splitTimelineWhen', () => {
  it('splits time and year ranges', () => {
    expect(splitTimelineWhen('9:23AM-9:40AM')).toEqual({ start: '9:23AM', end: '9:40AM' });
    expect(splitTimelineWhen('12:45PM – 1:23PM')).toEqual({ start: '12:45PM', end: '1:23PM' });
    expect(splitTimelineWhen('1914 to 1918')).toEqual({ start: '1914', end: '1918' });
  });

  it('keeps single values, ISO dates and word ranges whole', () => {
    expect(splitTimelineWhen('8:30AM')).toEqual({ start: '8:30AM' });
    expect(splitTimelineWhen('11:30 ONWARDS')).toEqual({ start: '11:30 ONWARDS' });
    expect(splitTimelineWhen('2026-10-13')).toEqual({ start: '2026-10-13' });
    expect(splitTimelineWhen('Early-modern era')).toEqual({ start: 'Early-modern era' });
  });

  it('renders a range as start and end on the rail', () => {
    const block = createBlock('timeline', 'tl1');
    if (block.block_type !== 'timeline') throw new Error('expected timeline');
    block.content.events = [{ id: 'e1', when: '9:50AM-10AM', label: 'Safety Briefing', description: '' }];
    const el = renderBlock(block, 'student');
    expect(el.querySelector('.block-timeline__start')?.textContent).toBe('9:50AM');
    expect(el.querySelector('.block-timeline__end')?.textContent).toBe('– 10AM');
    expect(el.querySelector('.block-timeline__node')?.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('.block-timeline__card .block-timeline__label')?.textContent).toBe(
      'Safety Briefing'
    );
  });
});

describe('timeline layouts', () => {
  function threeEvents(layout?: 'rail' | 'alternate' | 'horizontal') {
    const block = createBlock('timeline', 'tl1');
    if (block.block_type !== 'timeline') throw new Error('expected timeline');
    block.content.events = ['a', 'b', 'c'].map((id) => ({ id, when: '1', label: id, description: '' }));
    if (layout) block.content.layout = layout;
    return block;
  }

  it('defaults old blocks with no layout to the vertical rail', () => {
    const parsed = BlockSchema.parse(threeEvents());
    if (parsed.block_type !== 'timeline') throw new Error('expected timeline');
    expect(parsed.content.layout).toBeUndefined();
    expect(renderBlock(parsed, 'student').querySelector('.block-timeline--rail')).toBeTruthy();
  });

  it('rejects an unknown layout', () => {
    expect(() =>
      BlockSchema.parse({ ...threeEvents(), content: { ...threeEvents().content, layout: 'zigzag' } })
    ).toThrow();
  });

  it('either side staggers each event over two rows', () => {
    const el = renderBlock(threeEvents('alternate'), 'student');
    expect(el.querySelector('.block-timeline--alternate')).toBeTruthy();
    const rows = [...el.querySelectorAll<HTMLElement>('.block-timeline__event')].map((li) => li.style.gridRow);
    expect(rows).toEqual(['1 / span 2', '2 / span 2', '3 / span 2']);
  });

  it('horizontal strip is keyboard scrollable', () => {
    const list = renderBlock(threeEvents('horizontal'), 'student').querySelector(
      '.block-timeline--horizontal'
    ) as HTMLOListElement;
    expect(list.tabIndex).toBe(0);
    expect(list.getAttribute('aria-label')).toContain('sideways');
  });

  it('editor layout choice saves the layout', () => {
    let latest: Block = threeEvents();
    const editor = createBlockEditor(latest, (next) => {
      latest = next;
    });
    expect(editor.querySelector('select')).toBeNull();
    const layout = editor.querySelector<HTMLButtonElement>('.block-editor__timeline-layout')!;
    expect(layout.classList.contains('hub-filter')).toBe(true);
    layout.click();
    document.querySelector<HTMLButtonElement>('[data-hub-option="alternate"]')!.click();
    if (latest.block_type !== 'timeline') throw new Error('expected timeline');
    expect(latest.content.layout).toBe('alternate');
    expect(latest.content.events).toHaveLength(3);
  });
});
