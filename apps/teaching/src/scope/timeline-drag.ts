import { clampSpan } from './timeline-weeks';

export function applyDragDelta(
  mode: 'move' | 'resize-start' | 'resize-end',
  item: { start_week: number; end_week: number },
  deltaWeeks: number,
  weekCount: number
): { start_week: number; end_week: number } {
  const span = item.end_week - item.start_week;
  if (mode === 'move') {
    const start = Math.max(1, Math.min(item.start_week + deltaWeeks, weekCount - span));
    return clampSpan(start, start + span, weekCount);
  }
  if (mode === 'resize-start') {
    return clampSpan(
      Math.min(item.start_week + deltaWeeks, item.end_week),
      item.end_week,
      weekCount
    );
  }
  return clampSpan(item.start_week, item.end_week + deltaWeeks, weekCount);
}
