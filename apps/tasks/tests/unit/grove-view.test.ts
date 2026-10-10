import { describe, expect, it } from 'vitest';
import { buildGrovePlan, type GroveTaskInput } from '@/domain/grove/plan';
import { dayCaption, finishedLine, undatedNote, weekCaption } from '@/views/grove/copy';
import { groveRoute } from '@/views/grove/view';
import { knownHubViews, parseHashRoute } from '@/shell/shell';

const NOW = new Date('2026-10-10T09:00:00Z'); // Sat 10/10/26, 8 pm Sydney
const done = (id: string, at: string): GroveTaskInput => ({ id, title: `Task ${id}`, domain: 'teaching', status: 'done', completed_at: at });

describe('Grove route', () => {
  it('is a known Tasks view', () => {
    expect(knownHubViews()).toContain('grove');
    location.hash = '#/grove?view=week';
    expect(parseHashRoute()).toBe('grove');
  });

  it('defaults to today and the day view, and ignores a bad date', () => {
    expect(groveRoute(new URLSearchParams(''), '2026-10-10')).toEqual({ view: 'day', date: '2026-10-10' });
    expect(groveRoute(new URLSearchParams('view=week&date=2026-10-01'), '2026-10-10')).toEqual({ view: 'week', date: '2026-10-01' });
    expect(groveRoute(new URLSearchParams('view=year&date=tomorrow'), '2026-10-10')).toEqual({ view: 'day', date: '2026-10-10' });
  });
});

describe('Grove copy', () => {
  it('counts trees and never scolds an empty day', () => {
    const today = buildGrovePlan({ tasks: [done('a', '2026-10-10T01:00:00Z')], view: 'day', anchor: '2026-10-10', now: NOW });
    expect(dayCaption(today)).toBe('Today 10/10/26 · 1 tree');
    const empty = buildGrovePlan({ tasks: [], view: 'day', anchor: '2026-10-10', now: NOW });
    expect(dayCaption(empty)).toBe('Today 10/10/26 · the clearing is ready');
    const quiet = buildGrovePlan({ tasks: [], view: 'day', anchor: '2026-10-07', now: NOW });
    expect(dayCaption(quiet)).toBe('Wednesday 07/10/26 · a quiet meadow');
    const ahead = buildGrovePlan({ tasks: [], view: 'day', anchor: '2026-10-12', now: NOW });
    expect(dayCaption(ahead)).toBe('Monday 12/10/26 · still to come');
  });

  it('names the week by its dates', () => {
    const week = buildGrovePlan({ tasks: [done('a', '2026-10-06T01:00:00Z'), done('b', '2026-10-06T02:00:00Z')], view: 'week', anchor: '2026-10-10', now: NOW });
    expect(weekCaption(week)).toBe('Week of 05/10/26 to 11/10/26 · 2 trees');
  });

  it('says when a tree was finished, in Sydney time', () => {
    const tree = buildGrovePlan({ tasks: [done('a', '2026-10-09T23:30:00Z')], view: 'day', anchor: '2026-10-10', now: NOW }).trees[0]!;
    expect(finishedLine(tree)).toMatch(/^Finished 10\/10\/26, 10:30\s?am · a new sapling$/);
  });

  it('explains undated tasks only when there are some', () => {
    expect(undatedNote(0)).toBeNull();
    expect(undatedNote(1)).toContain('1 older finished task');
    expect(undatedNote(3)).toContain('3 older finished tasks');
  });
});
