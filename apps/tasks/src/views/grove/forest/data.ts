/** Real Grove data for the forest: finished work becomes trees, real milestones become animals. */
import type { GroveCompletion } from '@/domain/grove/plan';
import { isGroveHistoryId } from '@/domain/grove/private-history';
import type { GroveTerm } from '@/domain/grove/calendar';
import { companionResidents } from '@/domain/grove/companions';
import { wildlifeArrivals, type GroveBookInput, type WildlifeArrival, type WildlifeSpecies } from '@/domain/grove/wildlife';
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

export const ANIMAL_NAME: Record<WildlifeSpecies, string> = { hare: 'Hare', deer: 'Doe', fox: 'Fox', squirrel: 'Squirrel', robin: 'Robin', mallard: 'Mallard', owl: 'Owl' };
export const modelName = (id: string) => id.replace(/^animal-(forest-|bird-|duck-|river-|rabbit-)?/, '').replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

/**
 * Most animals the forest draws at once, young ones included. Each is its own skinned, animated model
 * (trees are batched, animals are not), so this keeps a phone near its frame budget.
 */
export const MAX_FOREST_ANIMALS = 40;

/** Over the cap, the latest repeats of the most numerous species go first; first arrivals and companions stay. */
function capArrivals(arrivals: WildlifeArrival[], room: number): WildlifeArrival[] {
  const kept = [...arrivals];
  const size = () => kept.reduce((n, a) => n + (a.baby ? 2 : 1), 0);
  while (size() > room) {
    const counts = new Map<WildlifeSpecies, number>();
    for (const a of kept) counts.set(a.species, (counts.get(a.species) ?? 0) + 1);
    const repeats = kept.filter((a) => a.ordinal > 0);
    if (!repeats.length) break;
    const most = Math.max(...repeats.map((a) => counts.get(a.species)!));
    const drop = repeats.filter((a) => counts.get(a.species) === most).sort((a, b) => b.earnedOn.localeCompare(a.earnedOn) || b.ordinal - a.ordinal)[0]!;
    kept.splice(kept.indexOf(drop), 1);
  }
  return kept;
}

/**
 * Animals earned this year, through `through` (YYYY-MM-DD). A milestone brings an animal every time
 * its repeat step comes round (WILDLIFE_REPEAT), and each animal's companions join it for good.
 */
export function forestAnimals(completions: readonly GroveCompletion[], terms: readonly GroveTerm[], books: readonly GroveBookInput[], year: number, through: string): ForestAnimal[] {
  const prefix = `${year}-`;
  const own = completions.filter((c) => c.dayKey.startsWith(prefix));
  const last = through < `${year}-12-31` ? through : `${year}-12-31`;
  const arrivals = wildlifeArrivals(own, terms.filter((t) => t.starts_on.startsWith(prefix)), last, books.filter((b) => b.completed_on?.startsWith(prefix)));
  const residents = companionResidents(arrivals);
  const parents: ForestAnimal[] = capArrivals(arrivals, MAX_FOREST_ANIMALS - residents.length).map((m) => ({ model: m.model, species: m.species, name: m.ordinal === 0 ? ANIMAL_NAME[m.species] : modelName(m.model), earnedOn: m.earnedOn, reason: m.reason, baby: m.baby, swimming: m.species === 'mallard' }));
  const companions: ForestAnimal[] = residents.map((e) => ({ model: e.id, species: e.species, name: modelName(e.id), earnedOn: e.earnedOn, reason: `Came with your ${ANIMAL_NAME[e.parent].toLowerCase()}`, baby: false, swimming: e.swimming, companion: true }));
  return [...parents, ...companions];
}
