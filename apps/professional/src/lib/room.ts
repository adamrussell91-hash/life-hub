import type { DirectoryPersonRow } from '@/api/people-directory';

export type RoomPerson = { ref: string; name: string; initials: string; role: string | null; warmthDots: 1 | 2 | 3; isNew: boolean };
export type RoomCluster = { organisation: string | null; monogram: string | null; people: RoomPerson[] };

type DirectoryLike = Pick<DirectoryPersonRow, 'ref' | 'display_name' | 'initials' | 'organisation' | 'warmth_band' | 'created_at'>;

const DOTS: Record<DirectoryPersonRow['warmth_band'], 1 | 2 | 3> = { warm: 3, cooling: 2, cold: 1 };
const NEW_MS = 14 * 86_400_000;

/**
 * Attendees grouped by their current organisation (biggest group first, chairs first
 * inside a group). Warmth comes from the People directory, the same number People shows.
 */
export function groupRoom(
  attendees: Array<{ ref: string; role: string | null }>,
  directory: DirectoryLike[],
  now: Date
): RoomCluster[] {
  const byRef = new Map(directory.map((row) => [row.ref, row]));
  const clusters = new Map<string, RoomCluster>();
  for (const attendee of attendees) {
    const row = byRef.get(attendee.ref);
    const orgName = row?.organisation?.display_name ?? null;
    const key = orgName ?? '\u0000none';
    if (!clusters.has(key)) clusters.set(key, { organisation: orgName, monogram: row?.organisation?.monogram ?? null, people: [] });
    clusters.get(key)!.people.push({
      ref: attendee.ref,
      name: row?.display_name ?? 'Unknown person',
      initials: row?.initials ?? '?',
      role: attendee.role,
      warmthDots: row ? DOTS[row.warmth_band] : 1,
      isNew: row ? now.getTime() - Date.parse(row.created_at) <= NEW_MS : true
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
