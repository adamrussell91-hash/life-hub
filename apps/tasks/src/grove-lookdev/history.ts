/** Synthetic finished-task history for the look prototype (same shape as real tasks). */
import { rng } from '@/views/grove/forest/noise';
import type { Done, Species } from '@/views/grove/forest/history';
import type { ForestAnimal } from '@/views/grove/forest/animals';

export const TODAY = new Date('2026-10-13T09:00:00+11:00');
const WEEK_ONE = Date.UTC(2025, 11, 29); // Monday 29 December 2025

export function weekOf(date: Date): number {
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((day - WEEK_ONE) / (7 * 86400000)) + 1;
}

const TITLES: Record<Species, string[]> = {
  teaching: ['Mark Year 9 essays', 'Plan HPGE workshop', 'Write Year 11 feedback', 'Prep Pathfinders lesson'],
  life: ['Pay strata levy', 'Book car service', 'Renew rego', 'Grocery order'],
  health: ['Gym session', 'Book physio', 'Meal prep'],
  wedding: ['Confirm florist', 'Send save the dates', 'Venue walkthrough'],
  other: ['Fix bike tyre', 'Return library books']
};

export function syntheticHistory(): Done[] {
  const random = rng(7);
  const pool: Species[] = ['teaching', 'teaching', 'teaching', 'life', 'life', 'health', 'wedding', 'other'];
  const out: Done[] = [];
  let n = 0;
  for (let t = Date.UTC(2026, 0, 1); t <= TODAY.getTime(); t += 86400000) {
    const day = new Date(t);
    const weekend = day.getUTCDay() === 0 || day.getUTCDay() === 6;
    // Holidays and busy stretches make some weeks lush and some quiet.
    const term = Math.sin((t / 86400000) / 11) * 0.5 + 0.8;
    const count = Math.floor(random() * (weekend ? 3 : 7) * term);
    for (let i = 0; i < count; i += 1) {
      const species = pool[Math.floor(random() * pool.length)]!;
      const titles = TITLES[species];
      out.push({ id: `t-${n++}`, title: titles[Math.floor(random() * titles.length)]!, species, completed: new Date(t + (9 + i) * 3600000), week: weekOf(day) });
    }
  }
  return out;
}

/**
 * One of every catalogue animal, two to a week from week 2, so look rounds can judge sizes and gaits
 * side by side. Models missing from the dev server's catalogue are skipped by the forest.
 */
export function syntheticAnimals(): ForestAnimal[] {
  const models: [string, ForestAnimal['species'], boolean?][] = [
    ['animal-deer-doe', 'deer'], ['animal-forest-boar', 'deer'], ['animal-forest-bear', 'deer'], ['animal-forest-moose', 'deer'],
    ['animal-fox', 'fox'], ['animal-forest-wolf', 'fox'], ['animal-deer-stag', 'deer'], ['animal-forest-stag', 'deer'],
    ['animal-forest-deer', 'deer'], ['animal-forest-fox', 'fox'], ['animal-rabbit-hare', 'hare'], ['animal-forest-rabbit', 'hare'],
    ['animal-raccoon', 'squirrel'], ['animal-skunk', 'squirrel'], ['animal-squirrel', 'squirrel'], ['animal-chipmunk', 'squirrel'],
    ['animal-bird-robin', 'robin'], ['animal-owl', 'owl'], ['animal-duck-mallard', 'mallard', true], ['animal-river-otter', 'mallard', true]
  ];
  return models.map(([model, species, swimming], i) => {
    const day = new Date(Date.UTC(2026, 0, 5 + Math.floor(i / 2) * 7 + 2)).toISOString().slice(0, 10);
    return { model, species, name: model.replace(/^animal-/, ''), earnedOn: day, reason: 'Look round', baby: model === 'animal-deer-doe' || model === 'animal-rabbit-hare', swimming: !!swimming };
  });
}
