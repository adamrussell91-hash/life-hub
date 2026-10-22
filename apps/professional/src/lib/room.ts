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
  student: boolean;
  /** The organisation this person is grouped under for this meeting. */
  organisationRef: string | null;
  /** Their current organisations when there is more than one to choose from. */
  organisationChoices: RoomOrganisation[];
};
export type RoomOrganisation = { ref: string; display_name: string; monogram: string };
export type RoomCluster = { organisation: string | null; monogram: string | null; people: RoomPerson[] };

export type RoomDirectoryRow = Pick<DirectoryPersonRow, 'ref' | 'display_name' | 'initials' | 'organisation' | 'warmth_band' | 'created_at'> &
  Partial<Pick<DirectoryPersonRow, 'person_type' | 'organisations'>> & { is_self?: boolean };

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
export function directoryRowFor<T extends Pick<RoomDirectoryRow, 'ref' | 'display_name'>>(
  attendee: { ref: string; name?: string | null },
  byRef: Map<string, T>,
  byName: Map<string, T[]>
): T | null {
  const exact = byRef.get(attendee.ref);
  if (exact) return exact;
  const matches = attendee.name ? byName.get(nameKey(attendee.name)) ?? [] : [];
  return matches.length === 1 ? matches[0]! : null;
}

/**
 * You, linked as an attendee (by ref, or a copy carrying your name). You're in
 * every meeting, so the room never lists you.
 */
export function isSelfAttendee(
  attendee: { ref: string; name?: string | null },
  self: Pick<RoomDirectoryRow, 'ref' | 'display_name'> | null
): boolean {
  if (!self) return false;
  if (attendee.ref === self.ref) return true;
  return Boolean(attendee.name) && nameKey(attendee.name!) === nameKey(self.display_name);
}

export function indexDirectory<T extends Pick<RoomDirectoryRow, 'ref' | 'display_name'>>(directory: T[]): {
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

/** A person's current organisations, their main one first. */
function currentOrganisations(row: RoomDirectoryRow): RoomOrganisation[] {
  const list: RoomOrganisation[] = [];
  const add = (org: { ref: string; display_name: string; monogram: string } | null | undefined) => {
    if (org && !list.some((entry) => entry.ref === org.ref)) list.push({ ref: org.ref, display_name: org.display_name, monogram: org.monogram });
  };
  if (row.organisation?.current !== false) add(row.organisation);
  for (const org of row.organisations ?? []) if (org.current) add(org);
  return list;
}

/**
 * Which job someone is here in: the one picked for this meeting, else the
 * organisation most others in the room share, else their main one.
 */
function organisationFor(
  row: RoomDirectoryRow,
  picked: string | null | undefined,
  shared: Map<string, number>
): RoomOrganisation | null {
  const choices = currentOrganisations(row);
  const all = [...choices, ...(row.organisations ?? [])];
  const chosen = picked ? all.find((org) => org.ref === picked) : undefined;
  if (chosen) return { ref: chosen.ref, display_name: chosen.display_name, monogram: chosen.monogram };
  if (choices.length < 2) return choices[0] ?? (row.organisation ? { ...row.organisation } : null);
  let best = choices[0]!;
  let bestCount = 0;
  for (const org of choices) {
    // Shared counts include this person once; only others decide.
    const others = (shared.get(org.ref) ?? 0) - 1;
    if (others > bestCount) {
      best = org;
      bestCount = others;
    }
  }
  return best;
}

/**
 * Attendees grouped by the organisation they're here for (biggest group first, chairs first
 * inside a group). Someone with several jobs sits under the one picked for this
 * meeting, else the one most others in the room share (you count: you're always there).
 * Warmth comes from the People directory, the same number People shows.
 * An attendee the directory doesn't know keeps the name on its link. You are never listed.
 */
export function groupRoom(
  allAttendees: Array<{ ref: string; role: string | null; name?: string | null; organisationRef?: string | null }>,
  directory: RoomDirectoryRow[],
  now: Date,
  self: RoomDirectoryRow | null = null
): RoomCluster[] {
  const attendees = allAttendees.filter((attendee) => !isSelfAttendee(attendee, self));
  const { byRef, byName } = indexDirectory(directory);
  const rows = attendees.map((attendee) => directoryRowFor(attendee, byRef, byName));
  const shared = new Map<string, number>();
  for (const row of self ? [...rows, self] : rows) {
    if (!row) continue;
    for (const org of currentOrganisations(row)) shared.set(org.ref, (shared.get(org.ref) ?? 0) + 1);
  }
  const clusters = new Map<string, RoomCluster>();
  attendees.forEach((attendee, index) => {
    const row = rows[index];
    const org = row ? organisationFor(row, attendee.organisationRef, shared) : null;
    const orgName = org?.display_name ?? null;
    const key = orgName ?? '\u0000none';
    if (!clusters.has(key)) clusters.set(key, { organisation: orgName, monogram: org?.monogram ?? null, people: [] });
    const name = row?.display_name ?? attendee.name ?? 'Unknown person';
    clusters.get(key)!.people.push({
      ref: attendee.ref,
      name,
      initials: row?.initials ?? initialsFor(name),
      role: attendee.role,
      warmthDots: row ? DOTS[row.warmth_band] : 1,
      isNew: row ? now.getTime() - Date.parse(row.created_at) <= NEW_MS : false,
      known: Boolean(row),
      student: row?.person_type === 'student',
      organisationRef: org?.ref ?? null,
      organisationChoices: row ? currentOrganisations(row) : []
    });
  });
  const rolesFirst = (person: RoomPerson) => (person.role === 'chair' ? 0 : person.role ? 1 : 2);
  const list = [...clusters.values()];
  for (const cluster of list) cluster.people.sort((a, b) => rolesFirst(a) - rolesFirst(b));
  return list.sort((a, b) => {
    if (a.organisation === null) return 1;
    if (b.organisation === null) return -1;
    return b.people.length - a.people.length;
  });
}
