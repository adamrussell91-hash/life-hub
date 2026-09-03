import type { CurriculumOutcome } from '@/schemas/outcome';

export function catalogForSubject(
  subject: { id: string; outcome_ids: string[] },
  outcomes: readonly CurriculumOutcome[]
): CurriculumOutcome[] {
  const byId = new Map(
    outcomes
      .filter((outcome) => outcome.subject_id === subject.id && outcome.status !== 'trashed')
      .map((outcome) => [outcome.id, outcome])
  );
  const ordered: CurriculumOutcome[] = [];
  for (const id of subject.outcome_ids) {
    const row = byId.get(id);
    if (row) {
      ordered.push(row);
      byId.delete(id);
    }
  }
  const rest = [...byId.values()].sort((a, b) => a.code.localeCompare(b.code));
  return [...ordered, ...rest];
}

export function resolveOutcomes(
  ids: readonly string[],
  outcomes: readonly CurriculumOutcome[]
): CurriculumOutcome[] {
  const byId = new Map(outcomes.map((outcome) => [outcome.id, outcome]));
  return ids
    .map((id) => byId.get(id))
    .filter((row): row is CurriculumOutcome => Boolean(row));
}

export function filterOutcomeCatalog(
  catalog: readonly CurriculumOutcome[],
  query: string
): CurriculumOutcome[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...catalog];
  return catalog.filter((outcome) => {
    const hay = [
      outcome.code,
      outcome.title,
      outcome.description,
      outcome.group,
      outcome.source
    ]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

export function groupOutcomeCatalog(
  catalog: readonly CurriculumOutcome[]
): Array<{ group: string; outcomes: CurriculumOutcome[] }> {
  const groups: Array<{ group: string; outcomes: CurriculumOutcome[] }> = [];
  const index = new Map<string, number>();
  for (const outcome of catalog) {
    const key = outcome.group;
    const existing = index.get(key);
    if (existing === undefined) {
      index.set(key, groups.length);
      groups.push({ group: key, outcomes: [outcome] });
    } else {
      groups[existing]!.outcomes.push(outcome);
    }
  }
  return groups;
}

export type PublicOutcome = Pick<
  CurriculumOutcome,
  'id' | 'code' | 'title' | 'description' | 'group' | 'source'
>;

export function toPublicOutcome(outcome: CurriculumOutcome): PublicOutcome {
  return {
    id: outcome.id,
    code: outcome.code,
    title: outcome.title,
    description: outcome.description,
    group: outcome.group,
    source: outcome.source
  };
}
