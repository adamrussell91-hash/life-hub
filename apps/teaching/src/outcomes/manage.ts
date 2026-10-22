import type { CurriculumOutcome } from '@/schemas/outcome';
import { groupOutcomeCatalog } from '@/curriculum/outcome-catalog';

export function outcomeCodeKey(code: string): string {
  return code.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Outcomes that share a code with another outcome in the same catalog, one list per code. */
export function duplicateSets(catalog: readonly CurriculumOutcome[]): CurriculumOutcome[][] {
  const byCode = new Map<string, CurriculumOutcome[]>();
  for (const outcome of catalog) {
    const key = outcomeCodeKey(outcome.code);
    byCode.set(key, [...(byCode.get(key) ?? []), outcome]);
  }
  return [...byCode.values()].filter((rows) => rows.length > 1);
}

export interface OutcomeUsageRow {
  kind: 'lesson' | 'unit';
  id: string;
  title: string;
  href: string;
}

interface UsageSource {
  lessons: ReadonlyArray<{ id: string; title: string; status?: string; outcome_ids?: string[] }>;
  units: ReadonlyArray<{ id: string; title: string; status?: string; outcome_ids?: string[] }>;
}

/** Lessons and units tagged with each outcome, keyed by outcome id. */
export function outcomeUsageMap(data: UsageSource): Map<string, OutcomeUsageRow[]> {
  const usage = new Map<string, OutcomeUsageRow[]>();
  const add = (id: string, row: OutcomeUsageRow): void => {
    usage.set(id, [...(usage.get(id) ?? []), row]);
  };
  for (const unit of data.units) {
    if (unit.status === 'trashed') continue;
    for (const id of unit.outcome_ids ?? []) add(id, { kind: 'unit', id: unit.id, title: unit.title, href: `/units/${unit.id}` });
  }
  for (const lesson of data.lessons) {
    if (lesson.status === 'trashed') continue;
    for (const id of lesson.outcome_ids ?? []) add(id, { kind: 'lesson', id: lesson.id, title: lesson.title, href: `/lessons/${lesson.id}` });
  }
  return usage;
}

export function usageLabel(rows: readonly OutcomeUsageRow[]): string {
  const lessons = rows.filter((row) => row.kind === 'lesson').length;
  const units = rows.filter((row) => row.kind === 'unit').length;
  const parts = [
    lessons ? `${lessons} lesson${lessons === 1 ? '' : 's'}` : '',
    units ? `${units} unit${units === 1 ? '' : 's'}` : ''
  ].filter(Boolean);
  return parts.length ? `Used in ${parts.join(', ')}` : 'Not used yet';
}

/** Ids in catalog order: the order the library shows and saves. */
function ids(catalog: readonly CurriculumOutcome[]): string[] {
  return groupOutcomeCatalog(catalog).flatMap((group) => group.outcomes.map((row) => row.id));
}

/** New order after moving one outcome a step up or down inside its group. */
export function moveOutcome(catalog: readonly CurriculumOutcome[], id: string, step: -1 | 1): string[] | null {
  const groups = groupOutcomeCatalog(catalog);
  const group = groups.find((row) => row.outcomes.some((outcome) => outcome.id === id));
  if (!group) return null;
  const index = group.outcomes.findIndex((outcome) => outcome.id === id);
  const target = index + step;
  if (target < 0 || target >= group.outcomes.length) return null;
  const rows = [...group.outcomes];
  [rows[index], rows[target]] = [rows[target]!, rows[index]!];
  group.outcomes = rows;
  return groups.flatMap((row) => row.outcomes.map((outcome) => outcome.id));
}

/** New order after moving a whole group a step up or down. */
export function moveGroup(catalog: readonly CurriculumOutcome[], name: string, step: -1 | 1): string[] | null {
  const groups = groupOutcomeCatalog(catalog);
  const index = groups.findIndex((group) => group.group === name);
  const target = index + step;
  if (index < 0 || target < 0 || target >= groups.length) return null;
  [groups[index], groups[target]] = [groups[target]!, groups[index]!];
  return groups.flatMap((group) => group.outcomes.map((outcome) => outcome.id));
}

/** Order with `id` moved to the end of `group`, so a moved outcome lands under its new heading. */
export function orderAfterRegroup(catalog: readonly CurriculumOutcome[], id: string, group: string): string[] {
  const moved = catalog.map((row) => (row.id === id ? { ...row, group } : row));
  const without = moved.filter((row) => row.id !== id);
  const row = moved.find((outcome) => outcome.id === id);
  if (!row) return ids(catalog);
  const lastInGroup = without.map((outcome) => outcome.group).lastIndexOf(group);
  const next = [...without];
  next.splice(lastInGroup === -1 ? next.length : lastInGroup + 1, 0, row);
  return ids(next);
}

export function groupNames(catalog: readonly CurriculumOutcome[]): string[] {
  return groupOutcomeCatalog(catalog).map((group) => group.group);
}
