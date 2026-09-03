import type { Program } from '@/schemas/program';
import { PROGRAM_MONTHS } from '@/schemas/program';

const MONTH_RANK = new Map(PROGRAM_MONTHS.map((month, index) => [month, index]));

export interface ProgramFilters {
  query?: string;
  type?: string;
  subject?: string;
  month?: string;
  age_group?: string;
  level?: string;
  length?: string;
  cost_basis?: string;
  nsw?: '' | 'available' | 'unavailable';
}

export type ProgramSort = 'name' | 'month' | 'organiser' | 'level' | 'cost';

function haystack(program: Program): string {
  return [
    program.name,
    program.description,
    program.organiser,
    program.location,
    program.cost,
    program.registration_window,
    program.not_available_reason,
    program.types.join(' '),
    program.subjects.join(' '),
    program.age_groups.join(' '),
    program.month ?? '',
    program.competition_level ?? '',
    program.competition_length ?? '',
    program.cost_basis ?? ''
  ]
    .join(' ')
    .toLowerCase();
}

export function programMatches(program: Program, filters: ProgramFilters): boolean {
  const query = filters.query?.trim().toLowerCase() ?? '';
  if (query && !haystack(program).includes(query)) return false;
  if (filters.type && !program.types.includes(filters.type)) return false;
  if (filters.subject && !program.subjects.includes(filters.subject)) return false;
  if (filters.month && program.month !== filters.month) return false;
  if (filters.age_group && !program.age_groups.includes(filters.age_group)) return false;
  if (filters.level && program.competition_level !== filters.level) return false;
  if (filters.length && program.competition_length !== filters.length) return false;
  if (filters.cost_basis && program.cost_basis !== filters.cost_basis) return false;
  if (filters.nsw === 'available' && program.not_available_nsw) return false;
  if (filters.nsw === 'unavailable' && !program.not_available_nsw) return false;
  return true;
}

export function filterPrograms(programs: Program[], filters: ProgramFilters): Program[] {
  return programs.filter((program) => programMatches(program, filters));
}

function compareNullable(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b, 'en', { sensitivity: 'base' });
}

export function sortPrograms(programs: Program[], sort: ProgramSort = 'name'): Program[] {
  return [...programs].sort((a, b) => {
    if (sort === 'month') {
      const am = a.month ? (MONTH_RANK.get(a.month as (typeof PROGRAM_MONTHS)[number]) ?? 99) : 100;
      const bm = b.month ? (MONTH_RANK.get(b.month as (typeof PROGRAM_MONTHS)[number]) ?? 99) : 100;
      if (am !== bm) return am - bm;
    } else if (sort === 'organiser') {
      const cmp = compareNullable(a.organiser || null, b.organiser || null);
      if (cmp !== 0) return cmp;
    } else if (sort === 'level') {
      const cmp = compareNullable(a.competition_level, b.competition_level);
      if (cmp !== 0) return cmp;
    } else if (sort === 'cost') {
      const cmp = compareNullable(a.cost_basis, b.cost_basis);
      if (cmp !== 0) return cmp;
      const costCmp = compareNullable(a.cost || null, b.cost || null);
      if (costCmp !== 0) return costCmp;
    }
    return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
  });
}

export function queryPrograms(
  programs: Program[],
  filters: ProgramFilters,
  sort: ProgramSort = 'name'
): Program[] {
  return sortPrograms(filterPrograms(programs, filters), sort);
}

export function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set([...values].filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'en', { sensitivity: 'base' })
  );
}

export function searchPrograms(programs: Program[], query: string): Program[] {
  return queryPrograms(programs, { query }, 'name');
}
