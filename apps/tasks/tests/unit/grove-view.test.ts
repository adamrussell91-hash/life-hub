import { describe, expect, it } from 'vitest';
import { buildGrovePlan, type GroveTaskInput } from '@/domain/grove/plan';
import { dayCaption, finishedLine, undatedNote, weekCaption } from '@/views/grove/copy';
import { forestRoute } from '@/views/grove/view';
import { forestAnimals, forestHistory } from '@/views/grove/forest/data';
import { groveCompletions } from '@/domain/grove/plan';
import { weekOfDay, weekRange } from '@/views/grove/forest/history';
import { knownHubViews, parseHashRoute } from '@/shell/shell';

const NOW = new Date('2026-10-10T09:00:00Z'); // Sat 10/10/26, 8 pm Sydney
const done = (id: string, at: string): GroveTaskInput => ({ id, title: `Task ${id}`, domain: 'teaching', status: 'done', completed_at: at });

describe('Grove route', () => {
  it('is a known Tasks view', () => {
    expect(knownHubViews()).toContain('grove');
    location.hash = '#/grove?view=week';
    expect(parseHashRoute()).toBe('grove');
  });

  it('opens this year, a past year or one week, and ignores nonsense', () => {
    expect(forestRoute(new URLSearchParams(''), '2026-10-10')).toEqual({ year: 2026, week: null });
    expect(forestRoute(new URLSearchParams('year=2025&week=10'), '2026-10-10')).toEqual({ year: 2025, week: 10 });
    expect(forestRoute(new URLSearchParams('view=week&date=2025-10-01'), '2026-10-10')).toEqual({ year: 2025, week: null });
    expect(forestRoute(new URLSearchParams('year=2031&week=99'), '2026-10-10')).toEqual({ year: 2026, week: null });
  });

  it('opens the current week for Home\'s week=this link', () => {
    expect(forestRoute(new URLSearchParams('week=this'), '2026-10-10')).toEqual({ year: 2026, week: weekOfDay('2026-10-10', 2026) });
    expect(forestRoute(new URLSearchParams('year=2025&week=this'), '2026-10-10')).toEqual({ year: 2025, week: null });
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

describe('Grove forest data', () => {
  it('numbers weeks like the Notion zones: week 1 is 1–4 Jan 2026, a partial week 53 joins week 52', () => {
    expect(weekOfDay('2026-01-01', 2026)).toBe(1);
    expect(weekOfDay('2026-01-05', 2026)).toBe(2);
    expect(weekOfDay('2026-03-02', 2026)).toBe(10);
    expect(weekOfDay('2026-12-31', 2026)).toBe(52);
    expect(weekRange(1, 2026).map((d) => d.toISOString().slice(0, 10))).toEqual(['2026-01-01', '2026-01-04']);
  });

  it('turns each of this year\'s finished tasks into one tree, late work gnarled in its own area', () => {
    const { completions } = groveCompletions([
      done('a', '2026-03-03T01:00:00Z'),
      { id: 'b', title: 'Late', domain: 'life', status: 'done', completed_at: '2026-03-05T01:00:00Z', due_date: '2026-03-01' },
      done('old', '2025-12-01T01:00:00Z')
    ]);
    const trees = forestHistory(completions, 2026);
    expect(trees.map((t) => [t.id, t.species, t.week, t.late])).toEqual([['a', 'teaching', 10, false], ['b', 'life', 10, true]]);
  });

  it('brings the animals real milestones earned this year', () => {
    const tasks = Array.from({ length: 5 }, (_, i) => done(`d${i}`, `2026-02-13T0${i}:00:00Z`));
    const animals = forestAnimals(groveCompletions(tasks).completions, [], [{ completed_on: '2026-01-11' }, { completed_on: '2026-03-02' }], 2026, '2026-10-10');
    expect(animals.map((a) => [a.name, a.earnedOn])).toEqual([['Owl', '2026-03-02']]); // one five-task day is 1 of the 4 a hare needs; every 2nd book brings an owl
  });
});
