import type { DirectoryPersonRow } from '@/api/people-directory';

export type RoomPerson = {
  ref: string;
  name: string;
  initials: string;
  role: string | null;
  warmthDots: 1 | 2 | 3;
  isNew: boolean;
  /** False when neither the People directory nor its Students list knows this person. */
  known: boolean;
};
export type RoomCluster = { organisation: string | null; monogram: string | null; people: RoomPerson[] };

type DirectoryLike = Pick<DirectoryPersonRow, 'ref' | 'display_name' | 'initials' | 'organisation' | 'warmth_band' | 'created_at'>;

const DOTS: Record<DirectoryPersonRow['warmth_band'], 1 | 2 | 3> = { warm: 3, cooling: 2, cold: 1 };
const NEW_MS = 14 * 86_400_000;

export function nameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  return (words.length === 1 ? words[0]!.slice(0, 2) : `${words[0]![0]}${words.at(-1)![0]}`).toUpperCase();
}

/**
 * The directory row for an attendee: by ref, else by name when exactly one row
 * carries it (a Blob copy of an imported student has its own id but the same name).
 */
export function directoryRowFor<T extends Pick<DirectoryLike, 'ref' | 'display_name'>>(
  attendee: { ref: string; name?: string | null },
  byRef: Map<string, T>,
  byName: Map<string, T[]>
): T | null {
  const exact = byRef.get(attendee.ref);
  if (exact) return exact;
  const matches = attendee.name ? byName.get(nameKey(attendee.name)) ?? [] : [];
  return matches.length === 1 ? matches[0]! : null;
}

export function indexDirectory<T extends Pick<DirectoryLike, 'ref' | 'display_name'>>(directory: T[]): {
  byRef: Map<string, T>;
  byName: Map<string, T[]>;
} {
  const byRef = new Map(directory.map((row) => [row.ref, row]));
  const byName = new Map<string, T[]>();
  for (const row of directory) {
    const key = nameKey(row.display_name);
    if (!key) continue;
    byName.set(key, [...(byName.get(key) ?? []), row]);
  }
  return { byRef, byName };
}

/**
 * Attendees grouped by their current organisation (biggest group first, chairs first
 * inside a group). Warmth comes from the People directory, the same number People shows.
 * An attendee the directory doesn't know keeps the name on its link.
 */
export function groupRoom(
  attendees: Array<{ ref: string; role: string | null; name?: string | null }>,
  directory: DirectoryLike[],
  now: Date
): RoomCluster[] {
  const { byRef, byName } = indexDirectory(directory);
  const clusters = new Map<string, RoomCluster>();
  for (const attendee of attendees) {
    const row = directoryRowFor(attendee, byRef, byName);
    const orgName = row?.organisation?.display_name ?? null;
    const key = orgName ?? '\u0000none';
    if (!clusters.has(key)) clusters.set(key, { organisation: orgName, monogram: row?.organisation?.monogram ?? null, people: [] });
    const name = row?.display_name ?? attendee.name ?? 'Unknown person';
    clusters.get(key)!.people.push({
      ref: attendee.ref,
      name,
      initials: row?.initials ?? initialsFor(name),
      role: attendee.role,
      warmthDots: row ? DOTS[row.warmth_band] : 1,
      isNew: row ? now.getTime() - Date.parse(row.created_at) <= NEW_MS : false,
      known: Boolean(row)
    });
  }
  const rolesFirst = (person: RoomPerson) => (person.role === 'chair' ? 0 : person.role ? 1 : 2);
  const list = [...clusters.values()];
  for (const cluster of list) cluster.people.sort((a, b) => rolesFirst(a) - rolesFirst(b));
  return list.sort((a, b) => {
    if (a.organisation === null) return 1;
    if (b.organisation === null) return -1;
    return b.people.length - a.people.length;
  });
}
