/**
 * Forest wildlife: every animal model has its own milestone and comes again each time that milestone
 * repeats (`every` qualifying events brings one more). Animals are independent: none arrives with,
 * or follows, another. Each lives in the week it was earned.
 */
import type { GroveCompletion } from './plan';
import type { GroveTerm } from './calendar';
import type { GroveBookInput, WildlifeSpecies } from './wildlife';
import type { GroveHistoryEvents } from './private-history';
import { addDays, isDateKey, mondayOf } from './dates';
import { toHubDateKey } from '@/domain/queries';

export type ForestEventKind = 'projects' | 'competitions' | 'excursions';
export type ForestEvents = Record<ForestEventKind, string[]>;

type Trigger =
  | 'fiveTaskDay' | 'fullWeek' | 'twentyTaskWeek' | 'thirtyTaskWeek' | 'term' | 'holiday' | 'book'
  | 'teaching' | 'life' | 'health' | 'wedding' | 'otherArea' | 'anyTask' | ForestEventKind;

export type ForestWildlifeRule = {
  model: string;
  name: string;
  /** Habitat and fallback picture: robins fly, owls perch, mallards and otters swim. */
  habit: WildlifeSpecies;
  trigger: Trigger;
  every: number;
  /** One qualifying event, in the key's words. */
  reason: string;
  size: 'small' | 'medium' | 'large';
};

export const FOREST_WILDLIFE: ForestWildlifeRule[] = [
  { model: 'animal-rabbit-hare', name: 'Hare', habit: 'hare', trigger: 'fiveTaskDay', every: 4, reason: 'A day with five finished tasks', size: 'small' },
  { model: 'animal-forest-rabbit', name: 'Rabbit', habit: 'hare', trigger: 'life', every: 15, reason: 'A finished Life task', size: 'small' },
  { model: 'animal-bird-robin', name: 'Robin', habit: 'robin', trigger: 'health', every: 10, reason: 'A finished Health task', size: 'small' },
  { model: 'animal-chipmunk', name: 'Chipmunk', habit: 'squirrel', trigger: 'wedding', every: 15, reason: 'A finished Wedding task', size: 'small' },
  { model: 'animal-squirrel', name: 'Squirrel', habit: 'squirrel', trigger: 'teaching', every: 75, reason: 'A finished Teaching task', size: 'small' },
  { model: 'animal-skunk', name: 'Skunk', habit: 'hare', trigger: 'otherArea', every: 25, reason: 'A finished University, Career or other task', size: 'small' },
  { model: 'animal-owl', name: 'Owl', habit: 'owl', trigger: 'book', every: 2, reason: 'A finished book', size: 'medium' },
  { model: 'animal-duck-mallard', name: 'Mallard', habit: 'mallard', trigger: 'twentyTaskWeek', every: 3, reason: 'A week with twenty finished tasks', size: 'medium' },
  { model: 'animal-river-otter', name: 'Otter', habit: 'mallard', trigger: 'thirtyTaskWeek', every: 1, reason: 'A week with thirty finished tasks', size: 'medium' },
  { model: 'animal-fox', name: 'Fox', habit: 'fox', trigger: 'term', every: 1, reason: 'A finished school term', size: 'medium' },
  { model: 'animal-forest-fox', name: 'Forest fox', habit: 'fox', trigger: 'holiday', every: 1, reason: 'A school holiday with something finished in it', size: 'medium' },
  { model: 'animal-raccoon', name: 'Raccoon', habit: 'squirrel', trigger: 'competitions', every: 1, reason: 'A completed competition', size: 'medium' },
  { model: 'animal-deer-doe', name: 'Doe', habit: 'deer', trigger: 'fullWeek', every: 8, reason: 'A full week with something finished every day', size: 'medium' },
  { model: 'animal-forest-deer', name: 'Deer', habit: 'deer', trigger: 'competitions', every: 10, reason: 'A completed competition', size: 'medium' },
  { model: 'animal-forest-moose', name: 'Moose', habit: 'deer', trigger: 'projects', every: 1, reason: 'A completed project', size: 'large' },
  { model: 'animal-forest-stag', name: 'Forest stag', habit: 'deer', trigger: 'projects', every: 10, reason: 'A completed project', size: 'large' },
  { model: 'animal-forest-bear', name: 'Bear', habit: 'fox', trigger: 'excursions', every: 1, reason: 'A completed excursion', size: 'large' },
  { model: 'animal-forest-boar', name: 'Boar', habit: 'fox', trigger: 'excursions', every: 5, reason: 'A completed excursion', size: 'large' },
  { model: 'animal-forest-wolf', name: 'Wolf', habit: 'fox', trigger: 'life', every: 50, reason: 'A finished Life task', size: 'large' },
  { model: 'animal-deer-stag', name: 'Stag', habit: 'deer', trigger: 'anyTask', every: 250, reason: 'Any finished task', size: 'large' }
];

/** A young one follows the first of these once it has been earned twice. */
const WITH_YOUNG = new Set(['animal-rabbit-hare', 'animal-deer-doe']);

/** 1st, 2nd, 3rd, 4th … */
export const nth = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
export const hasYoung = (model: string) => WITH_YOUNG.has(model);

export type ForestArrival = { rule: ForestWildlifeRule; earnedOn: string; ordinal: number; baby: boolean };

const TEACHING = new Set(['teaching', 'gifted', 'halt']);
const NAMED = new Set([...TEACHING, 'life', 'health', 'wedding']);

/** Every qualifying date per trigger, oldest first. */
function triggerDates(completions: readonly GroveCompletion[], terms: readonly GroveTerm[], through: string, books: readonly GroveBookInput[], events: ForestEvents): Record<Trigger, string[]> {
  const live = [...completions].filter((c) => c.dayKey <= through).sort((a, b) => a.completedMs - b.completedMs || a.id.localeCompare(b.id));
  const days = new Map<string, number>(), weekDays = new Map<string, Set<string>>(), weekDone = new Map<string, string[]>();
  for (const c of live) {
    days.set(c.dayKey, (days.get(c.dayKey) ?? 0) + 1);
    const week = mondayOf(c.dayKey);
    weekDays.set(week, (weekDays.get(week) ?? new Set()).add(c.dayKey));
    weekDone.set(week, [...(weekDone.get(week) ?? []), c.dayKey]);
  }
  /** The day a week reached `n` finished tasks. */
  const weeksOf = (n: number) => [...weekDone.values()].filter((d) => d.length >= n).map((d) => d[n - 1]!).sort();
  const ended = [...terms].filter((t) => t.ends_on <= through).sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const within = (from: string, to: string) => live.some((c) => c.dayKey >= from && c.dayKey <= to);
  // A holiday runs from the day after one term (or 1 January) to the day before the next term starts.
  const holidays: string[] = [];
  const sorted = [...terms].sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  sorted.forEach((term, i) => {
    const from = i === 0 ? `${term.starts_on.slice(0, 4)}-01-01` : addDays(sorted[i - 1]!.ends_on, 1);
    const to = addDays(term.starts_on, -1);
    if (from <= to && to <= through && within(from, to)) holidays.push(to);
  });
  const area = (test: (domain: string) => boolean) => live.filter((c) => test(c.domain)).map((c) => c.dayKey);
  const upTo = (dates: readonly string[]) => dates.filter((d) => isDateKey(d) && d <= through).sort();
  return {
    fiveTaskDay: [...days].filter(([, n]) => n >= 5).map(([d]) => d).sort(),
    fullWeek: [...weekDays].filter(([, set]) => set.size === 7).map(([monday]) => addDays(monday, 6)).sort(),
    twentyTaskWeek: weeksOf(20),
    thirtyTaskWeek: weeksOf(30),
    term: ended.filter((t) => within(t.starts_on, t.ends_on)).map((t) => t.ends_on),
    holiday: holidays,
    book: upTo(books.flatMap((b) => (b.completed_on ? [b.completed_on] : []))),
    teaching: area((d) => TEACHING.has(d)),
    life: area((d) => d === 'life'),
    health: area((d) => d === 'health'),
    wedding: area((d) => d === 'wedding'),
    otherArea: area((d) => !NAMED.has(d)),
    anyTask: live.map((c) => c.dayKey),
    projects: upTo(events.projects),
    competitions: upTo(events.competitions),
    excursions: upTo(events.excursions)
  };
}

/** Every animal earned through `through`: the `every`th, 2×`every`th … qualifying event each brings one. */
export function forestArrivals(completions: readonly GroveCompletion[], terms: readonly GroveTerm[], through: string, books: readonly GroveBookInput[], events: ForestEvents): ForestArrival[] {
  const dates = triggerDates(completions, terms, through, books, events);
  return FOREST_WILDLIFE.flatMap((rule) => {
    const list = dates[rule.trigger], out: ForestArrival[] = [];
    for (let i = rule.every - 1, ordinal = 0; i < list.length; i += rule.every, ordinal += 1) {
      out.push({ rule, earnedOn: list[i]!, ordinal, baby: ordinal === 0 && WITH_YOUNG.has(rule.model) && list.length >= rule.every * 2 });
    }
    return out;
  });
}

/** The Tasks hub's records, as far as the forest needs them. */
export type ForestProjectInput = { type: string; status: string; updated_at: string; linked_program_id?: string | null };
export type ForestProgramInput = { id: string; types: readonly string[] };

/**
 * Completed projects, competitions and excursions. A competition is an excursion linked to a
 * catalogue entry typed Competition; a project's day is when it was last saved, which is when it closed.
 * History supplies the days it covers; the hub adds what was completed after.
 */
export function forestEvents(projects: readonly ForestProjectInput[], programs: readonly ForestProgramInput[], history: GroveHistoryEvents): ForestEvents {
  const competition = new Set(programs.filter((p) => p.types.includes('Competition')).map((p) => p.id));
  const live: ForestEvents = { projects: [], competitions: [], excursions: [] };
  for (const p of projects) {
    const at = Date.parse(p.updated_at);
    if (p.status !== 'completed' || !Number.isFinite(at)) continue;
    const day = toHubDateKey(new Date(at));
    const kind: ForestEventKind = p.type !== 'excursion' ? 'projects' : p.linked_program_id && competition.has(p.linked_program_id) ? 'competitions' : 'excursions';
    live[kind].push(day);
  }
  const merged = (kind: ForestEventKind) => {
    const covered = history.covered[kind];
    return [...history[kind], ...live[kind].filter((d) => !covered || d > covered)].sort();
  };
  return { projects: merged('projects'), competitions: merged('competitions'), excursions: merged('excursions') };
}
