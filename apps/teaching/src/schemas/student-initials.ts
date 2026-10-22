/**
 * Initials on a class list: how a quiz knows who is answering. One rule for
 * the class page in the browser and the quiz server, which runs a generated
 * copy (netlify/functions/_shared/student-initials.mjs).
 */

/** 1–4 letters, then an optional number for a double-up: BB, BB2. */
export const INITIALS_PATTERN = /^[A-Z]{1,4}[0-9]?$/;
export const STUDENT_ID_PATTERN = /^st_[a-z0-9_]{1,24}$/;

export type RosterStudent = { name: string; skip_picker?: boolean; id?: string; initials?: string };
export type RosterEntry<T extends RosterStudent = RosterStudent> = T & { id: string; initials: string };

/** Drops accents: É → E. */
function stripMarks(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** " b.b " → "BB". Anything but letters and digits is dropped. */
export function normaliseInitials(text: string): string {
  return stripMarks(String(text ?? '')).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}

/** First letter of each word, up to four: "Bob Brown" → "BB". */
export function deriveInitials(name: string): string {
  const letters = stripMarks(String(name ?? ''))
    .split(/[\s-]+/)
    .map((word) => word.replace(/[^A-Za-z]/g, '').charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 4);
  return letters || 'S';
}

function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/**
 * An id for a student saved before ids existed. It comes from the name, so
 * the browser and the server agree on it until the teacher saves the list.
 */
export function studentIdFor(name: string): string {
  return `st_${fnv1a(String(name ?? '').replace(/\s+/g, ' ').trim().toLowerCase())}`;
}

function freeInitials(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; n <= 9; n += 1) {
    const next = `${base.slice(0, 4)}${n}`;
    if (!taken.has(next)) return next;
  }
  for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
    const next = `${base.slice(0, 3)}${letter}`;
    if (!taken.has(next)) return next;
  }
  return base;
}

/**
 * Fills in a missing id and initials for every student and keeps any that are
 * set. A clash gets the lowest free number (BB, BB2, BB3), and a derived set
 * of initials never takes one another student already holds.
 */
export function assignInitials<T extends RosterStudent>(students: readonly T[]): Array<RosterEntry<T>> {
  const held = new Set<string>();
  for (const s of students) {
    const own = normaliseInitials(s.initials ?? '');
    if (INITIALS_PATTERN.test(own)) held.add(own);
  }
  const used = new Set<string>();
  const reserved = new Set<string>();
  const keeps = students.map((s) => {
    if (s.id && STUDENT_ID_PATTERN.test(s.id) && !reserved.has(s.id)) {
      reserved.add(s.id);
      return true;
    }
    return false;
  });
  const ids = new Set<string>();
  return students.map((s, index) => {
    const own = normaliseInitials(s.initials ?? '');
    let initials: string;
    if (INITIALS_PATTERN.test(own) && !used.has(own)) initials = own;
    else initials = freeInitials(deriveInitials(s.name), new Set([...held, ...used]));
    used.add(initials);
    let id: string;
    if (keeps[index]) id = s.id as string;
    else {
      const base = studentIdFor(s.name);
      id = base;
      for (let n = 2; ids.has(id) || reserved.has(id); n += 1) id = `${base}_${n}`;
    }
    ids.add(id);
    return { ...s, id, initials };
  });
}

/** Problems to show beside each student, keyed by row. Empty when the list is fine. */
export function initialsProblems(students: readonly RosterStudent[]): Map<number, string> {
  const out = new Map<number, string>();
  const first = new Map<string, number>();
  students.forEach((s, i) => {
    const value = normaliseInitials(s.initials ?? '');
    if (!INITIALS_PATTERN.test(value)) {
      out.set(i, 'Use 1–4 letters, then a number if needed, like BB or BB2.');
      return;
    }
    const earlier = first.get(value);
    if (earlier !== undefined) out.set(i, `${value} is already used by ${students[earlier]?.name ?? 'another student'}.`);
    else first.set(value, i);
  });
  return out;
}
