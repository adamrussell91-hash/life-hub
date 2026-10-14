import { describe, expect, it } from 'vitest';
import { groveCompletions, type GroveTaskInput } from '@/domain/grove/plan';
import { wildlifeArrivals, wildlifeMilestones, WILDLIFE_MODELS } from '@/domain/grove/wildlife';
import { companionResidents, COMPANION_MODELS } from '@/domain/grove/companions';
import { forestAnimals, MAX_FOREST_ANIMALS } from '@/views/grove/forest/data';

/** `perDay` finished tasks on each of `days` days from 5 Jan 2026 (a Monday). */
const work = (days: number, perDay: number, domain = 'other'): GroveTaskInput[] =>
  Array.from({ length: days * perDay }, (_, i) => ({ id: `${domain}${i}`, status: 'done', domain, completed_at: new Date(Date.UTC(2026, 0, 5 + Math.floor(i / perDay), 1, i % perDay)).toISOString() }));
const completions = (tasks: GroveTaskInput[]) => groveCompletions(tasks).completions;

describe('animals that come again', () => {
  it('brings a hare on the 1st, 11th and 21st five-task day, taking turns through the hare models', () => {
    const hares = wildlifeArrivals(completions(work(21, 5)), [], '2026-12-31').filter((a) => a.species === 'hare');
    expect(hares.map((a) => a.earnedOn)).toEqual(['2026-01-05', '2026-01-15', '2026-01-25']);
    expect(hares.map((a) => a.model)).toEqual(['animal-rabbit-hare', 'animal-forest-rabbit', 'animal-rabbit-hare']);
    expect(hares.map((a) => a.baby)).toEqual([true, false, false]);
  });

  it('counts squirrels at the 25th Teaching task, then every 150 more', () => {
    const at = (n: number) => wildlifeArrivals(completions(work(n, 1, 'teaching')), [], '2026-12-31').filter((a) => a.species === 'squirrel').length;
    expect([at(24), at(25), at(174), at(175)]).toEqual([0, 1, 1, 2]);
  });

  it('keeps the first-arrival milestones the older renderers read', () => {
    const c = completions(work(21, 5));
    const first = wildlifeArrivals(c, [], '2026-12-31').filter((a) => a.ordinal === 0).map(({ species, earnedOn, reason, baby }) => ({ species, earnedOn, reason, baby }));
    expect(wildlifeMilestones(c, [], '2026-12-31')).toEqual(first);
  });

  it('gives each species models that exist in the catalogue', () => {
    for (const models of Object.values(WILDLIFE_MODELS)) expect(models.every((m) => m.startsWith('animal-'))).toBe(true);
  });
});

describe('companions that stay', () => {
  it('brings every companion with the first of its animal, never before', () => {
    const residents = companionResidents([{ species: 'fox', earnedOn: '2026-09-25', reason: '', baby: false }, { species: 'fox', earnedOn: '2026-04-02', reason: '', baby: false }]);
    expect(residents.map((r) => r.id)).toEqual(COMPANION_MODELS.fox);
    expect(residents.every((r) => r.earnedOn === '2026-04-02' && r.parent === 'fox')).toBe(true);
  });

  it('puts every companion in the forest and says which animal it came with', () => {
    const animals = forestAnimals(completions(work(7, 1)), [], [], 2026, '2026-12-31');
    const companions = animals.filter((a) => a.companion);
    expect(companions.map((a) => a.model)).toEqual(COMPANION_MODELS.deer);
    expect(companions.every((a) => a.reason === 'Came with your doe')).toBe(true);
  });
});

describe('the forest cap', () => {
  it('drops the latest repeats of the most numerous species and keeps first arrivals and companions', () => {
    const animals = forestAnimals(completions([...work(300, 5), ...work(300, 1, 'teaching')]), [], [], 2026, '2026-12-31');
    const drawn = animals.reduce((n, a) => n + (a.baby ? 2 : 1), 0);
    expect(drawn).toBeLessThanOrEqual(MAX_FOREST_ANIMALS);
    expect(animals.filter((a) => a.species === 'hare' && !a.companion).length).toBeGreaterThan(1);
    expect(animals.some((a) => a.model === 'animal-skunk')).toBe(true);
    expect(animals.find((a) => a.name === 'Hare')!.earnedOn).toBe('2026-01-05');
  });
});
