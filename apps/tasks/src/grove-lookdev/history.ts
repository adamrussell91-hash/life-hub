/** Synthetic finished-task history for the look prototype (same shape as real tasks). */
import { rng } from './noise';

export type Species = 'life' | 'teaching' | 'health' | 'wedding' | 'other';
export type Done = { id: string; title: string; species: Species; completed: Date; week: number };

export const TODAY = new Date('2026-10-13T09:00:00+11:00');
const WEEK_ONE = Date.UTC(2025, 11, 29); // Monday 29 December 2025

export function weekOf(date: Date): number {
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((day - WEEK_ONE) / (7 * 86400000)) + 1;
}

export function weekRange(week: number): [Date, Date] {
  const start = new Date(WEEK_ONE + (week - 1) * 7 * 86400000);
  return [start, new Date(start.getTime() + 6 * 86400000)];
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
