import { describe, it, expect } from 'vitest';
import { applyDragDelta } from '@/scope/timeline-drag';

describe('applyDragDelta', () => {
  const item = { start_week: 12, end_week: 18 };

  it('moves a span by delta weeks', () => {
    expect(applyDragDelta('move', item, 2, 40)).toEqual({
      start_week: 14,
      end_week: 20
    });
  });

  it('resizes from the start', () => {
    expect(applyDragDelta('resize-start', item, 2, 40)).toEqual({
      start_week: 14,
      end_week: 18
    });
  });

  it('resizes from the end', () => {
    expect(applyDragDelta('resize-end', item, 2, 40)).toEqual({
      start_week: 12,
      end_week: 20
    });
  });

  it('clamps move at the left edge', () => {
    expect(applyDragDelta('move', item, -20, 40)).toEqual({
      start_week: 1,
      end_week: 7
    });
  });

  it('clamps move at the right edge', () => {
    expect(applyDragDelta('move', item, 30, 40)).toEqual({
      start_week: 34,
      end_week: 40
    });
  });

  it('clamps resize-start at week 1', () => {
    expect(applyDragDelta('resize-start', item, -20, 40)).toEqual({
      start_week: 1,
      end_week: 18
    });
  });

  it('clamps resize-end at weekCount', () => {
    expect(applyDragDelta('resize-end', item, 50, 40)).toEqual({
      start_week: 12,
      end_week: 40
    });
  });

  it('enforces a minimum span of 1 week when resizing start past end', () => {
    expect(applyDragDelta('resize-start', item, 10, 40)).toEqual({
      start_week: 18,
      end_week: 18
    });
  });

  it('enforces a minimum span of 1 week when resizing end before start', () => {
    expect(applyDragDelta('resize-end', item, -10, 40)).toEqual({
      start_week: 12,
      end_week: 12
    });
  });
});
