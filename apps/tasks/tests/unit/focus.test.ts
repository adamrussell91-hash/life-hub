import { describe, expect, it, beforeEach } from 'vitest';
import {
  calendarItemIdForFocus,
  focusEquals,
  getFocus,
  hydrateFocusFromHash,
  mergeFocusIntoHash,
  normalizeCalendarItemId,
  parseFocusParam,
  serializeFocusParam,
  setFocus,
  subscribeFocus
} from '@/domain/focus';

describe('focus contract', () => {
  beforeEach(() => {
    setFocus(null, { persistUrl: false });
    sessionStorage.clear();
  });

  it('normalizes calendar task and milestone ids', () => {
    expect(normalizeCalendarItemId('task:abc')).toEqual({ type: 'task', id: 'abc' });
    expect(normalizeCalendarItemId('milestone:proj:m1')).toEqual({
      type: 'milestone',
      id: 'm1',
      projectId: 'proj'
    });
    expect(normalizeCalendarItemId('key:proj:Start')).toBeNull();
    expect(normalizeCalendarItemId('bare-id')).toEqual({ type: 'task', id: 'bare-id' });
  });

  it('round-trips serialize/parse including milestone project', () => {
    const milestone = { type: 'milestone' as const, id: 'm1', projectId: 'p1' };
    expect(parseFocusParam(serializeFocusParam(milestone))).toEqual(milestone);
    expect(calendarItemIdForFocus(milestone)).toBe('milestone:p1:m1');
    expect(calendarItemIdForFocus({ type: 'task', id: 't1' })).toBe('task:t1');
  });

  it('notifies subscribers and stores session focus', () => {
    const seen: Array<string | null> = [];
    const stop = subscribeFocus((ref) => seen.push(ref ? ref.id : null));
    setFocus({ type: 'task', id: 't1' }, { persistUrl: false });
    expect(getFocus()?.id).toBe('t1');
    expect(seen).toEqual(['t1']);
    setFocus(null, { persistUrl: false });
    expect(seen).toEqual(['t1', null]);
    stop();
  });

  it('focusEquals checks type and id', () => {
    expect(focusEquals({ type: 'task', id: 'a' }, { type: 'task', id: 'a' })).toBe(true);
    expect(focusEquals({ type: 'task', id: 'a' }, { type: 'project', id: 'a' })).toBe(false);
  });

  it('merges focus into hash without dropping other params', () => {
    const next = mergeFocusIntoHash({ type: 'task', id: 't9' }, '#/week?date=2026-09-05&layout=day');
    expect(next).toContain('date=2026-09-05');
    expect(next).toContain('layout=day');
    expect(next).toContain('focus=task');
    expect(next).toContain('t9');
  });

  it('hydrates from hash focus param', () => {
    const ref = hydrateFocusFromHash('#/gantt?focus=task%3At42');
    expect(ref).toEqual({ type: 'task', id: 't42' });
    expect(getFocus()?.id).toBe('t42');
  });
});
