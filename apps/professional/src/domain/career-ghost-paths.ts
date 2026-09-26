/**
 * Ghost-path role matching for "People who got there".
 * Case-insensitive; "&" = "and"; punctuation stripped.
 */

export function normalizeRoleText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function roleMatchesFuture(
  roleText: string | null | undefined,
  future: { title: string; aliases?: string[] }
): boolean {
  if (!roleText) return false;
  const role = normalizeRoleText(roleText);
  if (!role) return false;
  const candidates = [future.title, ...(future.aliases ?? [])].map(normalizeRoleText);
  return candidates.some((c) => c && (role === c || role.includes(c) || c.includes(role)));
}

export type GhostPerson = {
  person_id: string;
  display_name: string;
  role: string;
  years_from_stage?: number | null;
  route_labels: string[];
};

/**
 * Pick up to 3 people whose current role matches the future title/aliases.
 */
export function selectGhostPaths(
  people: Array<{
    id: string;
    display_name: string;
    current_role?: string | null;
    route?: Array<{ role?: string | null }>;
  }>,
  future: { title: string; aliases?: string[] },
  limit = 3
): GhostPerson[] {
  const hits: GhostPerson[] = [];
  for (const person of people) {
    if (!roleMatchesFuture(person.current_role, future)) continue;
    const route_labels = (person.route ?? [])
      .map((r) => r.role)
      .filter((r): r is string => Boolean(r));
    hits.push({
      person_id: person.id,
      display_name: person.display_name,
      role: person.current_role || future.title,
      years_from_stage: null,
      route_labels
    });
    if (hits.length >= limit) break;
  }
  return hits;
}
