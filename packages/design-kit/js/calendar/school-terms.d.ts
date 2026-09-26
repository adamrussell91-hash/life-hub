export function parseSchoolTerms(
  value: unknown
): { term: number | null; starts_on: string; ends_on: string }[];

export function resolveSchoolTerms(sources?: {
  hubPrefs?: { school_terms?: unknown } | null;
  planningProfile?: { school_terms?: unknown } | null;
  visual?: { school_terms?: unknown } | null;
}): { term: number | null; starts_on: string; ends_on: string }[];
