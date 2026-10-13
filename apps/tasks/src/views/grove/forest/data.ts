/** Real Grove data for the forest: finished work becomes trees, real milestones become animals. */
import type { GroveCompletion } from '@/domain/grove/plan';
import { isGroveHistoryId } from '@/domain/grove/private-history';
import type { GroveTerm } from '@/domain/grove/calendar';
import { companionEncounters } from '@/domain/grove/companions';
import { WILDLIFE_MODEL, wildlifeMilestones, type GroveBookInput, type WildlifeSpecies } from '@/domain/grove/wildlife';
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

const NAME: Record<WildlifeSpecies, string> = { hare: 'Hare', deer: 'Doe', fox: 'Fox', squirrel: 'Squirrel', robin: 'Robin', mallard: 'Mallard', owl: 'Owl' };
const modelName = (id: string) => id.replace(/^animal-(forest-|bird-|duck-|river-|rabbit-)?/, '').replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** Animals earned this year, through `through` (YYYY-MM-DD): each milestone's animal plus Grove's companions. */
export function forestAnimals(completions: readonly GroveCompletion[], terms: readonly GroveTerm[], books: readonly GroveBookInput[], year: number, through: string): ForestAnimal[] {
  const prefix = `${year}-`;
  const own = completions.filter((c) => c.dayKey.startsWith(prefix));
  const last = through < `${year}-12-31` ? through : `${year}-12-31`;
  const earned = wildlifeMilestones(own, terms.filter((t) => t.starts_on.startsWith(prefix)), last, books.filter((b) => b.completed_on?.startsWith(prefix)));
  const parents: ForestAnimal[] = earned.map((m) => ({ model: WILDLIFE_MODEL[m.species], species: m.species, name: NAME[m.species], earnedOn: m.earnedOn, reason: m.reason, baby: m.baby, swimming: m.species === 'mallard' }));
  const companions: ForestAnimal[] = companionEncounters(earned, last).map((e) => ({ model: e.id, species: e.species, name: modelName(e.id), earnedOn: e.earnedOn, reason: e.reason, baby: false, swimming: e.swimming }));
  return [...parents, ...companions];
}
