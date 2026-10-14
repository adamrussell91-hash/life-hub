/** Real Grove data for the forest: finished work becomes trees, real milestones become animals. */
import type { GroveCompletion } from '@/domain/grove/plan';
import { isGroveHistoryId } from '@/domain/grove/private-history';
import type { GroveTerm } from '@/domain/grove/calendar';
import type { GroveBookInput } from '@/domain/grove/wildlife';
import { forestArrivals, nth, type ForestArrival, type ForestEvents } from '@/domain/grove/forest-wildlife';
import { weekOfDay, type Done, type Species } from './history';
import type { ForestAnimal } from './animals';

const SPECIES = new Set<Species>(['life', 'teaching', 'health', 'wedding']);
const baseSpecies = (domain: string): Species => (SPECIES.has(domain as Species) ? (domain as Species) : 'other');

/**
 * This year's completions as forest trees. A late task keeps its area's place and grows gnarled.
 * Backfilled history has no recorded deadlines (its late share is modelled), so it never grows gnarled.
 */
export function forestHistory(completions: readonly GroveCompletion[], year: number): Done[] {
  const prefix = `${year}-`;
  return completions.filter((c) => c.dayKey.startsWith(prefix)).map((c) => ({
    id: c.id,
    title: c.title,
    species: baseSpecies(c.domain),
    completed: new Date(c.completedMs),
    week: weekOfDay(c.dayKey, year),
    late: c.late && !isGroveHistoryId(c.id)
  }));
}

/**
 * Most animals the forest draws at once, young ones included. Each is its own skinned, animated model
 * (trees are batched, animals are not), so this guards a phone's frame time in a very big year.
 */
export const MAX_FOREST_ANIMALS = 64;

/** Over the cap, the latest repeats of the most numerous animal go first; every animal's first stays. */
function capArrivals(arrivals: ForestArrival[], room: number): ForestArrival[] {
  const kept = [...arrivals];
  const size = () => kept.reduce((n, a) => n + (a.baby ? 2 : 1), 0);
  while (size() > room) {
    const counts = new Map<string, number>();
    for (const a of kept) counts.set(a.rule.model, (counts.get(a.rule.model) ?? 0) + 1);
    const repeats = kept.filter((a) => a.ordinal > 0);
    if (!repeats.length) break;
    const most = Math.max(...repeats.map((a) => counts.get(a.rule.model)!));
    const drop = repeats.filter((a) => counts.get(a.rule.model) === most).sort((a, b) => b.earnedOn.localeCompare(a.earnedOn) || b.ordinal - a.ordinal)[0]!;
    kept.splice(kept.indexOf(drop), 1);
  }
  return kept;
}

/** Animals earned this year, through `through` (YYYY-MM-DD): each comes every time its milestone repeats. */
export function forestAnimals(completions: readonly GroveCompletion[], terms: readonly GroveTerm[], books: readonly GroveBookInput[], year: number, through: string, events: ForestEvents = { projects: [], competitions: [], excursions: [] }): ForestAnimal[] {
  const prefix = `${year}-`;
  const own = completions.filter((c) => c.dayKey.startsWith(prefix));
  const last = through < `${year}-12-31` ? through : `${year}-12-31`;
  const mine = (dates: string[]) => dates.filter((d) => d.startsWith(prefix));
  const arrivals = forestArrivals(own, terms.filter((t) => t.starts_on.startsWith(prefix)), last, books.filter((b) => b.completed_on?.startsWith(prefix)), { projects: mine(events.projects), competitions: mine(events.competitions), excursions: mine(events.excursions) });
  return capArrivals(arrivals, MAX_FOREST_ANIMALS).map((a) => ({ model: a.rule.model, species: a.rule.habit, name: a.rule.name, earnedOn: a.earnedOn, reason: a.rule.every === 1 ? a.rule.reason : `${a.rule.reason} (the ${nth(a.rule.every * (a.ordinal + 1))})`, baby: a.baby, swimming: a.rule.habit === 'mallard' }));
}
