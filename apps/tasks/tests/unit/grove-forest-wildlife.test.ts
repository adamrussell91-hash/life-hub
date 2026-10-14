import { describe, expect, it } from 'vitest';
import { groveCompletions, type GroveTaskInput } from '@/domain/grove/plan';
import { FOREST_WILDLIFE, forestArrivals, forestEvents } from '@/domain/grove/forest-wildlife';
import { forestAnimals, MAX_FOREST_ANIMALS } from '@/views/grove/forest/data';

/** `perDay` finished tasks on each of `days` days from 5 Jan 2026 (a Monday). */
const work = (days: number, perDay: number, domain = 'university'): GroveTaskInput[] =>
  Array.from({ length: days * perDay }, (_, i) => ({ id: `${domain}${i}`, status: 'done', domain, completed_at: new Date(Date.UTC(2026, 0, 5 + Math.floor(i / perDay), 1, i % perDay)).toISOString() }));
const completions = (tasks: GroveTaskInput[]) => groveCompletions(tasks).completions;
const none = { projects: [], competitions: [], excursions: [] };
const noHistory = { ...none, covered: { projects: null, competitions: null, excursions: null } };
const count = (animals: { model: string }[], model: string) => animals.filter((a) => a.model === model).length;

describe('independent forest animals', () => {
  it('gives each of the twenty models exactly one rule of its own', () => {
    expect(new Set(FOREST_WILDLIFE.map((r) => r.model)).size).toBe(20);
    expect(FOREST_WILDLIFE).toHaveLength(20);
  });

  it('brings a hare on every 4th five-task day, with a young one once there are two', () => {
    const hares = forestArrivals(completions(work(8, 5)), [], '2026-12-31', [], none).filter((a) => a.rule.model === 'animal-rabbit-hare');
    expect(hares.map((a) => [a.earnedOn, a.baby])).toEqual([['2026-01-08', true], ['2026-01-12', false]]);
  });

  it('counts each area on its own: Life brings rabbits and, rarely, a wolf', () => {
    const animals = forestAnimals(completions(work(50, 1, 'life')), [], [], 2026, '2026-12-31');
    expect([count(animals, 'animal-forest-rabbit'), count(animals, 'animal-forest-wolf'), count(animals, 'animal-bird-robin')]).toEqual([3, 1, 0]);
  });

  it('brings a raccoon per competition, a moose per project and a bear per excursion, with the rare ones on every 10th or 5th', () => {
    const events = { projects: Array(10).fill('2026-03-27'), competitions: Array(10).fill('2026-04-02'), excursions: Array(5).fill('2026-06-03') };
    const animals = forestAnimals([], [], [], 2026, '2026-12-31', events);
    expect(['animal-raccoon', 'animal-forest-deer', 'animal-forest-moose', 'animal-forest-stag', 'animal-forest-bear', 'animal-forest-boar'].map((m) => count(animals, m))).toEqual([10, 1, 10, 1, 5, 1]);
    expect(animals.find((a) => a.model === 'animal-raccoon')!.reason).toBe('A completed competition');
  });

  it('names a repeat by the count that earned it', () => {
    const animals = forestAnimals(completions(work(30, 1, 'health')), [], [], 2026, '2026-12-31');
    expect(animals.filter((a) => a.model === 'animal-bird-robin').map((a) => a.reason)).toEqual(['A finished Health task (the 10th)', 'A finished Health task (the 20th)', 'A finished Health task (the 30th)']);
  });

  it('brings a forest fox for each ended holiday with something finished in it', () => {
    const terms = [{ term: 1, starts_on: '2026-01-29', ends_on: '2026-04-02' }, { term: 2, starts_on: '2026-04-20', ends_on: '2026-06-26' }];
    const arrivals = forestArrivals(completions(work(100, 1)), terms, '2026-12-31', [], none).filter((a) => a.rule.model === 'animal-forest-fox');
    expect(arrivals.map((a) => a.earnedOn)).toEqual(['2026-01-28', '2026-04-19']);
  });

  it('keeps every first animal and trims the latest repeats of the most numerous over the cap', () => {
    const animals = forestAnimals(completions([...work(300, 6), ...work(300, 2, 'health')]), [], [], 2026, '2026-12-31', { ...none, competitions: Array(40).fill('2026-05-01') });
    expect(animals.reduce((n, a) => n + (a.baby ? 2 : 1), 0)).toBeLessThanOrEqual(MAX_FOREST_ANIMALS);
    expect(animals.some((a) => a.model === 'animal-raccoon') && animals.some((a) => a.model === 'animal-bird-robin')).toBe(true);
  });
});

describe('projects, competitions and excursions from the Tasks hub', () => {
  const programs = [{ id: 'comp', types: ['Competition'] }, { id: 'prog', types: ['Program'] }];
  const project = (type: string, status: string, updated_at: string, linked_program_id: string | null = null) => ({ type, status, updated_at, linked_program_id });

  it('sorts completed projects into projects, competitions and excursions by the day they closed', () => {
    const events = forestEvents([
      project('standard', 'completed', '2026-03-26T23:00:00Z'),
      project('standard', 'active', '2026-03-26T23:00:00Z'),
      project('excursion', 'completed', '2026-06-03T01:00:00Z', 'comp'),
      project('excursion', 'completed', '2026-06-04T01:00:00Z', 'prog'),
      project('academic_program', 'archived_dead', '2026-06-04T01:00:00Z')
    ], programs, noHistory);
    expect(events).toEqual({ projects: ['2026-03-27'], competitions: ['2026-06-03'], excursions: ['2026-06-04'] });
  });

  it('lets history own the days it covers and adds the hub only after', () => {
    const history = { projects: ['2026-03-27'], competitions: [], excursions: [], covered: { projects: '2026-10-11', competitions: null, excursions: null } };
    const events = forestEvents([project('standard', 'completed', '2026-03-27T01:00:00Z'), project('standard', 'completed', '2026-10-13T01:00:00Z')], programs, history);
    expect(events.projects).toEqual(['2026-03-27', '2026-10-13']);
  });
});
