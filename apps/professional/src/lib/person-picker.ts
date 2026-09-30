import { searchEntities } from '@/api/entities';
import { fetchPeopleDirectory, type DirectoryPersonRow } from '@/api/people-directory';
import { directoryRowFor, indexDirectory, nameKey } from '@/lib/room';

export type PickerPerson = {
  ref: string;
  kind: 'person';
  display_label: string;
  supporting_label: string | null;
  href: string | null;
};

type SearchHit = { ref: string; display_label: string; supporting_label?: string | null; href?: string | null };

let directoryLoad: Promise<DirectoryPersonRow[]> | null = null;

/** People + Students from the directory, fetched once per page load. */
export function loadPickerDirectory(): Promise<DirectoryPersonRow[]> {
  directoryLoad ??= fetchPeopleDirectory()
    .then((response) => [...response.people, ...(response.students ?? [])])
    .catch(() => {
      directoryLoad = null;
      return [];
    });
  return directoryLoad;
}

export function resetPickerDirectory(): void {
  directoryLoad = null;
}

function describe(row: DirectoryPersonRow | null): string {
  if (!row) return 'Not in People yet';
  if (row.person_type === 'student') return 'Student';
  const org = row.organisation?.display_name ?? null;
  const title = row.job_title ?? null;
  return [title, org].filter(Boolean).join(' · ') || row.role_line || 'In People';
}

/**
 * Search hits labelled so two people with the same name can be told apart.
 * Copies of one person (same name, same directory row, or none) collapse to
 * one row, preferring the ref the directory knows.
 */
export function labelPeopleHits(hits: SearchHit[], directory: DirectoryPersonRow[]): PickerPerson[] {
  const { byRef, byName } = indexDirectory(directory);
  const kept = new Map<string, { hit: SearchHit; row: DirectoryPersonRow | null; exact: boolean }>();
  const order: string[] = [];
  for (const hit of hits) {
    const row = directoryRowFor({ ref: hit.ref, name: hit.display_label }, byRef, byName);
    const identity = `${nameKey(hit.display_label)}|${row?.ref ?? 'unknown'}`;
    const exact = byRef.has(hit.ref);
    const prev = kept.get(identity);
    if (!prev) {
      kept.set(identity, { hit, row, exact });
      order.push(identity);
    } else if (exact && !prev.exact) {
      kept.set(identity, { hit, row, exact });
    }
  }
  return order.map((identity) => {
    const { hit, row } = kept.get(identity)!;
    return {
      ref: hit.ref,
      kind: 'person' as const,
      display_label: hit.display_label,
      supporting_label: hit.supporting_label === 'self' ? 'You' : describe(row),
      href: hit.href ?? null
    };
  });
}

/** `search` callback for `createEntityPicker` limited to people. */
export async function searchPickerPeople(
  query: string,
  signal?: AbortSignal
): Promise<{ groups: { person: PickerPerson[] } }> {
  const [result, directory] = await Promise.all([
    searchEntities(query, 'person', { signal }),
    loadPickerDirectory()
  ]);
  return { groups: { person: labelPeopleHits(result.groups.person ?? [], directory) } };
}
